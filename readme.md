# Chrome Extension: Translate with Ollama (EN→KO)

Right-click any English text in Chrome and instantly translate it into natural Korean using your **local Ollama LLM**.  
No external API keys, no cloud calls — everything runs locally.

---

## ✨ Features
- Adds a **context menu item**: “번역(영→한, Ollama)”
- Uses your **local Ollama server** (`localhost:11434`) to translate
- Options page to configure:
  - Ollama endpoint (default: `http://127.0.0.1:11434/api/generate`)
  - Model name (e.g., `llama3.1:8b`, `qwen2.5:7b-instruct`)
  - Whether to replace the selection inline or show result as toast
- **Safe messaging** between background and content scripts
- Handles special pages gracefully (`chrome://`, Web Store, etc.)
- **DNR (Declarative Net Request)** rule to strip `Origin` / `Sec-Fetch-*` headers  
  → solves `403 Forbidden` issues with POST requests

---

## 📂 Project Structure
ollama-enko-translator/   
├─ manifest.json   
├─ background.js # service worker  
├─ content.js # injects to pages, shows translations   
├─ options.html   
├─ options.js   
└─ icons/   
&nbsp;&nbsp;&nbsp;&nbsp;├─ 16.png   
&nbsp;&nbsp;&nbsp;&nbsp;├─ 48.png   
&nbsp;&nbsp;&nbsp;&nbsp;└─ 128.png   

---

## 🚀 Getting Started

### 1. Install Ollama
Download and install [Ollama](https://ollama.com).  
Pull a translation-capable model, for example:
```bash
ollama pull llama3.1:8b
# or
ollama pull qwen2.5:7b-instruct
```
Run the server:
```bash
ollama serve
```
Check it works:
```bash
curl http://127.0.0.1:11434/api/generate \
  -d '{"model":"llama3.1:8b","prompt":"hello","stream":false}'
```
### 2. Load the Extension
Open Chrome → chrome://extensions
Enable Developer mode
Click Load unpacked and select this project folder
### 3. Use It
Highlight English text on any web page
Right-click → 번역(영→한, Ollama)
The Korean translation appears:
Inline (if editable field & option enabled)
Or as a toast popup (also copied to clipboard)
## ⚙️ Configuration
Open the Options page (right-click extension icon → Options):
Endpoint: default http://127.0.0.1:11434/api/generate
Model: e.g., llama3.1:8b
Replace selection when possible: toggle on/off
## 🛠 Troubleshooting
403 Forbidden on POST
→ Fixed by stripping Origin and Sec-Fetch-* headers with a DNR rule.
Already included in this repo.
“Could not establish connection. Receiving end does not exist.”
→ Happens on special pages (chrome://, Chrome Web Store, PDF viewer).
Use it on normal web pages.
Still errors?
Make sure manifest.json includes host permissions for localhost, 127.0.0.1, and [::1]
Verify Ollama is running (curl test above)

## 📜 License
MIT License

## 🙏 Acknowledgements
Ollama for local LLMs
Chrome Extensions Manifest V3
Everyone who worked through debugging Origin & Fetch Metadata headers