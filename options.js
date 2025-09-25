const defaults = {
  endpoint: "http://127.0.0.1:11434/api/generate",
  model: "gemma3:4b",
  replaceSelectionWhenPossible: true,
};

(async function init() {
  const cfg = await getConfig();
  document.getElementById('endpoint').value = cfg.endpoint;
  document.getElementById('model').value = cfg.model;
  document.getElementById('replace').checked = !!cfg.replaceSelectionWhenPossible;
})();

async function getConfig() {
  return new Promise(resolve => chrome.storage.sync.get(defaults, resolve));
}

function setStatus(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  setTimeout(() => (el.textContent = ''), 1500);
}

document.getElementById('save').addEventListener('click', () => {
  const endpoint = document.getElementById('endpoint').value.trim() || defaults.endpoint;
  const model = document.getElementById('model').value.trim() || defaults.model;
  const replaceSelectionWhenPossible = document.getElementById('replace').checked;

  chrome.storage.sync.set({ endpoint, model, replaceSelectionWhenPossible }, () => {
    setStatus('Saved ✔');
  });
});