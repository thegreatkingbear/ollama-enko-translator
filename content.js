let popupcard = null;
let popupHideTimer = null;

let loadingCard = null;
let loadingHideTimer = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_SELECTION") {
    const text = getSelectedText();
    sendResponse({ text });
    return;
  }

  if (msg?.type === "SHOW_LOADING") {
    showLoadingOverlay();
    sendResponse({ ok: true });
    return;
  }
  if (msg?.type === "HIDE_LOADING") {
    hideLoadingOverlay();
    sendResponse({ ok: true });
    return;
  }

  if (msg?.type === "SHOW_TRANSLATION") {
    const { translated, replaceSelectionWhenPossible } = msg;
    if (!translated) {
      sendResponse({ ok: false, reason: "empty" });
      return;
    }
    console.log("Translated:", translated);
    // default: keep original text; show popup only
    const replaced = replaceSelectionWhenPossible && tryReplaceSelection(translated);
    if (!replaced) {
      showPopupTranslation(translated);
      copyToClipboard(translated);
    } else {
      showPopupTranslation("번역으로 대체했습니다. (클립보드에도 복사)");
      copyToClipboard(translated);
    }
    sendResponse({ ok: true, replaced });
    return;
  }
});

function getSelectedText() {
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

// ===== Popup Singleton =====
function showPopupTranslation(message, { timeoutMs = 10000 } = {}) {
  const hostId = "ollama-enko-translation-popup-host";
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

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') removePopup();
    }, { passive: true });
  }

  if (!popupcard) {
    popupcard = document.createElement('div');
    Object.assign(popupcard.style, {
      maxWidth: '480px',
      background: 'white',
      border: '1px solid rgba(0,0,0,0.15)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      borderRadius: '12px',
      padding: '12px 14px 10px 14px',
      marginTop: '8px',
      whiteSpace: 'pre-wrap',
      lineHeight: '1.5',
      fontSize: '14px',
      color: '#111',
      position: 'relative'
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
      position: 'absolute', top: '6px', right: '8px', border: 'none',
      background: 'transparent', fontSize: '16px', lineHeight: '1', cursor: 'pointer', color: '#666'
    });
    closeBtn.addEventListener('click', removePopup);
    popupcard.appendChild(closeBtn);

    const body = document.createElement('div');
    body.id = 'ollama-enko-translation-body';
    popupcard.appendChild(body);

    host.appendChild(popupcard);
  }

  const body = popupcard.querySelector('#ollama-enko-translation-body');
  body.textContent = message;

  if (popupHideTimer) clearTimeout(popupHideTimer);
  popupHideTimer = setTimeout(removePopup, timeoutMs);
}

function removePopup() {
  if (popupHideTimer) { clearTimeout(popupHideTimer); popupHideTimer = null; }
  if (popupcard) { popupcard.remove(); popupcard = null; }
}

// ===== Loading Overlay =====
function showLoadingOverlay({ msg = '번역 중…' } = {}) {
  const hostId = 'ollama-enko-loading-host';
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement('div');
    host.id = hostId;
    Object.assign(host.style, {
      position: 'fixed', top: '16px', right: '16px', zIndex: 2147483647,
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    });
    document.documentElement.appendChild(host);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancelTranslation();
    }, { passive: true });
  }

  if (!loadingCard) {
    loadingCard = document.createElement('div');
    Object.assign(loadingCard.style, {
      width: '260px', background: 'white', border: '1px solid rgba(0,0,0,0.15)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)', borderRadius: '12px', padding: '12px 14px',
      marginTop: '8px', color: '#111', position: 'relative', display: 'flex', alignItems: 'center', gap: '10px'
    });

    const spinner = document.createElement('div');
    Object.assign(spinner.style, {
      width: '18px', height: '18px', border: '2px solid rgba(0,0,0,0.2)',
      borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'ollama-spin 1s linear infinite'
    });
    loadingCard.appendChild(spinner);

    const textEl = document.createElement('div');
    textEl.id = 'ollama-enko-loading-text';
    textEl.textContent = msg;
    Object.assign(textEl.style, { fontSize: '14px' });
    loadingCard.appendChild(textEl);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '취소';
    Object.assign(cancelBtn.style, {
      marginLeft: 'auto', border: '1px solid rgba(0,0,0,0.15)', background: '#f8f8f8',
      padding: '4px 8px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px'
    });
    cancelBtn.addEventListener('click', cancelTranslation);
    loadingCard.appendChild(cancelBtn);

    host.appendChild(loadingCard);

    if (!document.getElementById('ollama-spin-style')) {
      const style = document.createElement('style');
      style.id = 'ollama-spin-style';
      style.textContent = `@keyframes ollama-spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }
  } else {
    const textEl = loadingCard.querySelector('#ollama-enko-loading-text');
    if (textEl) textEl.textContent = msg;
  }

  if (loadingHideTimer) clearTimeout(loadingHideTimer);
  loadingHideTimer = setTimeout(hideLoadingOverlay, 60_000);
}

function hideLoadingOverlay() {
  if (loadingHideTimer) { clearTimeout(loadingHideTimer); loadingHideTimer = null; }
  if (loadingCard) { loadingCard.remove(); loadingCard = null; }
}

function cancelTranslation() {
  hideLoadingOverlay();
  chrome.runtime.sendMessage({ type: 'CANCEL_TRANSLATION' }, () => {});
  showToast('번역 요청을 취소했습니다.');
}

function showToast(message) {
  const hostId = "ollama-enko-toast-host";
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement('div');
    host.id = hostId;
    Object.assign(host.style, {
      position: 'fixed', top: '16px', right: '16px', zIndex: 2147483647,
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    });
    document.documentElement.appendChild(host);
  }
  const card = document.createElement('div');
  Object.assign(card.style, {
    maxWidth: '420px', background: 'white', border: '1px solid rgba(0,0,0,0.15)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)', borderRadius: '12px', padding: '12px 14px',
    marginTop: '8px', whiteSpace: 'pre-wrap', lineHeight: '1.45', fontSize: '14px', color: '#111'
  });
  card.textContent = message;
  host.appendChild(card);
  setTimeout(() => { card.style.transition = 'opacity 300ms ease'; card.style.opacity = '0'; setTimeout(() => card.remove(), 400); }, 4000);
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); } catch (e) {}
}
