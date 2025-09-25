// Keeps original features: options, replacement, notifications, etc.
// Changes:
// 1) Safe context-menu init (removeAll + onStartup)
// 2) Safe messaging: inject content.js when missing, then retry
// 3) Block special pages (chrome://, Web Store, etc.) with a friendly notice

const DEFAULT_CONFIG = {
  endpoint: "http://127.0.0.1:11434/api/generate", // or /api/chat
  model: "gemma3:4b", // e.g., "qwen2.5:7b-instruct"
  stream: false,
  replaceSelectionWhenPossible: true,
};

chrome.runtime.onInstalled.addListener(() => {
  initContextMenus();
  installDnrRules();
});

chrome.runtime.onStartup.addListener(() => {
  initContextMenus();
  installDnrRules();
});

chrome.runtime.onInstalled.addListener(() => {
    initContextMenus();
    installDnrRules();
});
chrome.runtime.onStartup.addListener(() => {
    initContextMenus();
    installDnrRules();
});

function installDnrRules() {
  const rules = [{
    id: 11434,            // 임의의 고유 ID
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
  }];

  chrome.declarativeNetRequest.updateDynamicRules(
    { addRules: rules, removeRuleIds: [11434] },
    () => void chrome.runtime.lastError
  );
}
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ollama-translate-en-ko") return;
  if (!tab || !tab.id) return;

  const url = tab.url || "";
  if (/^(chrome|edge|about):\/\//.test(url) || /chrome\.google\.com\/webstore/.test(url)) {
    notify("이 페이지에서는 번역을 사용할 수 없습니다. 일반 웹페이지에서 시도해 주세요.");
    return;
  }

  // Ask the content script in the active tab for the current selection text
  let resp;
  try {
    resp = await sendMessageSafe(tab, { type: "GET_SELECTION" });
  } catch (e) {
    notify("컨텐츠 스크립트를 주입할 수 없는 페이지입니다.");
    return;
  }

  const selectedText = resp?.text?.trim();
  if (!selectedText) {
    notify("선택된 텍스트가 없습니다.");
    return;
  }

  const config = await getConfig();

  try {
    const translated = await translateWithOllama(selectedText, config);

    // Send back to content script to render or replace
    await sendMessageSafe(tab, {
      type: "SHOW_TRANSLATION",
      original: selectedText,
      translated,
      replaceSelectionWhenPossible: config.replaceSelectionWhenPossible,
    });
  } catch (err) {
    console.error(err);
    notify(`번역 실패: ${err?.message || err}`);
  }
});

async function sendMessageSafe(tab, message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    await ensureContentScript(tab); // inject then retry
    return await chrome.tabs.sendMessage(tab.id, message);
  }
}

async function ensureContentScript(tab) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
}

async function translateWithOllama(text, config) {
  const endpoint = config.endpoint || DEFAULT_CONFIG.endpoint;
  const model = config.model || DEFAULT_CONFIG.model;
  const stream = config.stream ?? DEFAULT_CONFIG.stream;
  console.log(`Translating with Ollama at ${endpoint}, model ${model}, text ${text.slice(0, 30)}...`);
  if (!endpoint) throw new Error("Ollama endpoint is not configured");
  // Prompt for /api/generate
  const prompt = `Translate the following English text into natural Korean.\n- Preserve meaning, tone, and formatting.\n- Do NOT add explanations or brackets.\n- Return ONLY the Korean translation.\n\n--- BEGIN TEXT ---\n${text}\n--- END TEXT ---`;
  console.log("Prompt:", prompt);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

//   testOllama("http://127.0.0.1:11434")

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream }),
    credentials: "omit",
    signal: controller.signal,
  });
  clearTimeout(timeout);
    
  if (!res.ok) {
    const t = await res.clone().text();
    const headersDump = Array.from(res.headers.entries()).map(([k,v]) => `${k}: ${v}`).join("\n");
    throw new Error(`HTTP ${res.status}: ${t} headers:\n${headersDump}`);
  }

  const data = await res.json();
  if (typeof data?.response === "string") return data.response.trim();
  throw new Error("Unexpected Ollama response shape");
}

async function testOllama(endpointBase) {
  // endpointBase: "http://127.0.0.1:11434"
  const url = endpointBase.replace(/\/$/, "") + "/api/tags";
  const res = await fetch(url, {
    method: "GET",
    // 쿠키/자격증명 전송 금지 (웹UI/프록시 쿠키에 의한 403 회피)
    credentials: "omit",
    headers: { "Accept": "application/json" }
  });
  const body = await res.text().catch(() => "");
  console.log("[Ollama test] GET /api/tags", res.status, body.slice(0, 400));
  if (!res.ok) throw new Error(`TEST HTTP ${res.status}`);
  return true;
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
