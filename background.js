// FULL version with DNR header stripping, safe messaging, and LOADING UI + Cancel

const DEFAULT_CONFIG = {
  endpoint: "http://127.0.0.1:11434/api/generate", // or /api/chat
  model: "gemma3:4b", // e.g., "qwen2.5:7b-instruct"
  stream: false,
  replaceSelectionWhenPossible: false, // now default to popup-only UX
};

let currentAbort = null; // track in-flight request for cancel

chrome.runtime.onInstalled.addListener(() => {
  initContextMenus();
  installDnrRules();
});

chrome.runtime.onStartup.addListener(() => {
  initContextMenus();
  installDnrRules();
});

function initContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: "ollama-translate-en-ko",
        title: "번역(영→한, Ollama)",
        contexts: ["selection"],
      },
      () => void chrome.runtime.lastError
    );
  });
}

function installDnrRules() {
  const rule = {
    id: 11434,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "origin", operation: "remove" },
        { header: "sec-fetch-site", operation: "remove" },
        { header: "sec-fetch-mode", operation: "remove" },
        { header: "sec-fetch-dest", operation: "remove" }
      ]
    },
    condition: {
      regexFilter: "^http://(localhost|127\\.0\\.0\\.1|\\[::1\\]):11434/api/(generate|chat)$",
      resourceTypes: ["xmlhttprequest", "other"]
    }
  };
  chrome.declarativeNetRequest.updateDynamicRules(
    { addRules: [rule], removeRuleIds: [11434] },
    () => void chrome.runtime.lastError
  );
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("[onClicked] id=", info.menuItemId, "tabId=", tab?.id, "url=", tab?.url);
  if (info.menuItemId !== "ollama-translate-en-ko") return;
  if (!tab || !tab.id) return;

  const url = tab.url || "";
  console.log("[guard] url=", url);
  if (/^(chrome|edge|about):\/\//.test(url) || /chrome\.google\.com\/webstore/.test(url)) {
    console.warn("[guard] special page → returning");
    notify("이 페이지에서는 번역을 사용할 수 없습니다. 일반 웹페이지에서 시도해 주세요.");
    return;
  }
  
  let resp;
  try {
    resp = await sendMessageSafe(tab, { type: "GET_SELECTION" });
  } catch (e) {
    notify("컨텐츠 스크립트를 주입할 수 없는 페이지입니다.");
    return;
  }

  const selectedText = resp?.text?.trim();
  console.log("Selected text:", selectedText);
  if (!selectedText) {
    notify("선택된 텍스트가 없습니다.");
    return;
  }

  const config = await getConfig();
  console.log("Config:", config);
  // show loading UI immediately
//   await sendMessageSafe(tab, { type: "SHOW_LOADING" });
  console.log("[pre] SHOW_LOADING send");
  try {
    await sendMessageSafe(tab, { type: "SHOW_LOADING" });
    console.log("[post] SHOW_LOADING ok");
  } catch (e) {
    console.error("[post] SHOW_LOADING failed:", e);
  }
  console.log("Starting translation request..."); // ← 요게 보이는지 확인

  try {
    console.log("Starting translation request...");
    // cancel any previous in-flight request
    currentAbort?.abort();
    currentAbort = new AbortController();

    const translated = await translateWithOllama(selectedText, config, currentAbort.signal);
    console.log("Translated text:", translated);
    if (!translated) throw new Error("빈 응답을 받았습니다");
    // hide loading + show result popup (do not replace original text by default)
    await sendMessageSafe(tab, { type: "HIDE_LOADING" });
    await sendMessageSafe(tab, {
      type: "SHOW_TRANSLATION",
      original: selectedText,
      translated,
      replaceSelectionWhenPossible: config.replaceSelectionWhenPossible,
    });
  } catch (err) {
    await sendMessageSafe(tab, { type: "HIDE_LOADING" });
    console.error(err);
    notify(`번역 실패: ${err?.name === 'AbortError' ? '요청이 취소되었습니다' : (err?.message || err)}`);
  } finally {
    currentAbort = null;
  }
});

// allow content script to request cancel (ESC/취소 버튼)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CANCEL_TRANSLATION") {
    currentAbort?.abort();
    sendResponse?.({ ok: true });
  }
});

// async function sendMessageSafe(tab, message) {
//   console.log("Sending message to tab", tab.id, message);
//   try {
//     return await chrome.tabs.sendMessage(tab.id, message);
//   } catch (e) {
//     await ensureContentScript(tab); // inject then retry
//     return await chrome.tabs.sendMessage(tab.id, message);
//   }
// }

async function sendMessageSafe(tab, message) {
  console.log("Sending message to tab", tab.id, message);
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    console.warn("[sendMessageSafe] first send failed:", e);
    try {
      await ensureContentScript(tab);
      console.log("[sendMessageSafe] injected content.js, retrying...");
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (e2) {
      console.error("[sendMessageSafe] retry failed:", e2);
      throw e2;
    }
  }
}


async function ensureContentScript(tab) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
}

async function translateWithOllama(text, config, signal) {
  console.log("Translating with Ollama...", { text, config });
  const endpoint = (config.endpoint || DEFAULT_CONFIG.endpoint).replace(/\/$/, "");
  const model = config.model || DEFAULT_CONFIG.model;
  const stream = config.stream ?? DEFAULT_CONFIG.stream;

  const prompt = `Translate the following English text into natural Korean.\n- Preserve meaning, tone, and formatting.\n- Do NOT add explanations or brackets.\n- Return ONLY the Korean translation.\n--- BEGIN TEXT ---\n${text}\n--- END TEXT ---`;
  console.log("Ollama request", { endpoint, model, prompt, stream });
  const res = await fetch(`${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream }),
    credentials: "omit",
    signal,
  });
  console.log("Ollama response", res);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${t}`);
  }

  const data = await res.json();
  if (typeof data?.response === "string") return data.response.trim();
  throw new Error("Unexpected Ollama response shape");
}

function notify(message) {
  try {
    chrome.notifications.create(
      {
        type: "basic",
        iconUrl: "icons/128.png",
        title: "Ollama 번역",
        message,
      },
      () => void chrome.runtime.lastError
    );
  } catch (e) {
    console.log("[Ollama 번역]", message);
  }
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, resolve);
  });
}
