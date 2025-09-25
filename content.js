/* content.js */
// Listen for messages from background
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_SELECTION") {
    const text = getSelectedText();
    sendResponse({ text });
    return true; // keep message channel open
  }

  if (msg?.type === "SHOW_TRANSLATION") {
    const { translated, replaceSelectionWhenPossible } = msg;
    if (!translated) return true;

    const replaced = replaceSelectionWhenPossible && tryReplaceSelection(translated);
    if (!replaced) {
      showToast(translated);
      copyToClipboard(translated);
    } else {
      showToast("번역으로 대체했습니다. (클립보드에도 복사)");
      copyToClipboard(translated);
    }
    return true;
  }
});

function getSelectedText() {
  // Prefer selection inside inputs/textareas if present
  const active = document.activeElement;
  if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|password|email)$/i.test(active.type)))) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    return String(active.value).slice(start, end);
  }
  const sel = window.getSelection();
  return sel ? String(sel).toString() : "";
}

function tryReplaceSelection(text) {
  const active = document.activeElement;
  // Replace in form controls
  if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|tel|password|email)$/i.test(active.type)))) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    const before = active.value.slice(0, start);
    const after = active.value.slice(end);
    active.value = before + text + after;
    const caret = start + text.length;
    active.setSelectionRange(caret, caret);
    active.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  // Replace on contentEditable
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (range && range.toString().length > 0) {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      sel.removeAllRanges();
      return true;
    }
  }
  return false;
}

function showToast(message) {
  const hostId = "ollama-enko-toast-host";
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement('div');
    host.id = hostId;
    Object.assign(host.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: 2147483647,
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    });
    document.documentElement.appendChild(host);
  }

  const card = document.createElement('div');
  Object.assign(card.style, {
    maxWidth: '420px',
    background: 'white',
    border: '1px solid rgba(0,0,0,0.15)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    borderRadius: '12px',
    padding: '12px 14px',
    marginTop: '8px',
    whiteSpace: 'pre-wrap',
    lineHeight: '1.45',
    fontSize: '14px',
    color: '#111'
  });
  card.textContent = message;

  host.appendChild(card);
  setTimeout(() => {
    card.style.transition = 'opacity 300ms ease';
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 400);
  }, 8000);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Ignore if blocked
  }
}
