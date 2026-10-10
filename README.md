# 🕷️ Arachnos Personal — Local Learning Chrome Extension

**Version:** 2.1 (Context Document Implementation)  
**Form Factor:** Chrome Extension (Manifest V3) + Local Brain Server  
**Hosting:** Fully local on user machine (Zero cloud dependency)

Arachnos Personal turns the visual multi-spider crawler into a **personal AI companion that lives in your browser**. It observes the pages you visit, learns from them (and from explicit feedback and corrections you give it), remembers everything locally, and can be queried anytime with full provenance.

---

## 🌟 Key Features

1. **High-Fidelity Animated Spiders (Sole Webpage Overlay)**
   - When active, the **only** visual element on the page is the spiders — no HUDs, cards, live feeds, or overlays on the webpage itself.
   - 60 fps procedural leg kinematics with tripod gait, idle breathing stance, and pedipalp vibrations.
   - Subtle, temporary light tethers and fading particles appear only while a spider is actively harvesting an element, then vanish immediately.
   - Page content remains fully readable and uncluttered at all times.

2. **Personal Continuous Learning & Memory Tiers**
   - **Tier 1 (Raw Harvests):** Real-time text and structured DOM observations from browsed pages.
   - **Tier 2 (Processed Facts):** Frequently revisited topics synthesized into structured facts.
   - **Tier 3 (User-Reinforced Knowledge):** Explicit user facts ("Teach Arachnos") and corrections with highest weight in retrieval.
   - **Disk Persistence:** Memory is saved locally in `data/arachnos_memory.json` across browser and server restarts.

3. **User Feedback & Correction Loop**
   - **Reinforce (👍):** Boosts memory confidence and retrieval score.
   - **Downweight (👎):** Suppresses inaccurate facts.
   - **Correction (✏️):** When you tell Arachnos *"No, the price is actually $199"*, the original fact is superseded and the corrected fact is elevated to high-priority Tier 3 memory.
   - **Teach Mode:** Highlight text anywhere and right-click **"🕷️ Teach Arachnos (Remember This)"** or use the Side Panel "+ Teach" button.

4. **Simplified Minimal UI**
   - **Popup:** Clean, compact control with a single Start / Stop toggle, spider count selector (1–4), and connection indicator.
   - **Side Panel Chat:** Calm, generous whitespace, soft green accents, short readable answers, tiny source tags, and inline feedback/correction buttons.
   - **Options Page:** Server URL configuration, Ollama LLM endpoint, and memory inspector by tier.

5. **Local Brain Server (FastAPI / Express + Node)**
   - Streaming ingestion endpoint (`POST /ingest`).
   - Grounded RAG query endpoint (`POST /query`).
   - User feedback endpoint (`POST /feedback`).
   - Explicit memory teaching endpoint (`POST /teach`).
   - Multi-tier memory inspection and deletion (`GET /memory`, `DELETE /memory/:id`).
   - Local LLM support: seamlessly connects to local **Ollama** (`llama3.1`, `qwen2.5`, etc.) if running, with zero-dependency offline synthesis fallback.

---

## 📁 Project Structure

```
visual crawler/
├── extension/                 # Chrome Extension (Manifest V3)
│   ├── manifest.json          # MV3 configuration (permissions, sidePanel, background, content)
│   ├── background/
│   │   └── service-worker.js  # Orchestration, context menus, Brain forwarder
│   ├── content/
│   │   └── content-script.js  # 60fps procedural spiders + uncluttered DOM harvester
│   ├── popup/                 # Minimal popup UI (Start/Stop, spider count)
│   │   ├── index.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── sidepanel/             # Minimal side panel chat UI with feedback loop
│   │   ├── index.html
│   │   ├── sidepanel.css
│   │   └── sidepanel.js
│   ├── options/               # Options & Memory tier manager
│   │   ├── index.html
│   │   ├── options.css
│   │   └── options.js
│   └── icons/                 # Generated extension icons
├── arachnos-extension/        # Linked alias to extension/ for convenience
├── server/                    # Local Brain Server
│   ├── src/
│   │   ├── index.ts           # REST API & WebSocket server
│   │   ├── brain/             # MemoryStore, RagEngine, NlpPipeline, LocalLlm, VectorIndex
│   │   └── crawler/           # Multi-spider extraction strategies
│   └── data/                  # Persistent local memories
├── shared/
│   └── types.ts               # Core contracts, MemoryRecord, and Event types
└── ARACHNOS_SPEC.md           # Version 2.1 Specification Document
```

---

## 🚀 Getting Started

### 1. Install & Build

```bash
# Build the local Brain server
npm run build
```

### 2. Start the Local Brain Server

```bash
npm start
# Server starts on http://localhost:3001
# Endpoints: /ingest, /query, /feedback, /teach, /memory, /status
```

### 3. Load the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top right.
3. Click **Load unpacked**.
4. Select the `extension/` (or `arachnos-extension/`) folder from this repository.
5. Pin **Arachnos Personal** to your Chrome toolbar.

### 4. How to Use

- **Browse Normally:** Visit any website (e.g. Wikipedia, documentation, news). The animated spiders will appear and gently crawl across informative DOM sections, harvesting knowledge into your local Brain.
- **Control Spiders:** Click the toolbar icon to toggle spiders Active / Paused or adjust the spider count (1 to 4).
- **Open Chat:** Open the Chrome Side Panel (or click the chat icon in the popup) to query Arachnos about anything you have browsed.
- **Teach Arachnos:**
  - Highlight any text on a page, right-click, and select **"🕷️ Teach Arachnos (Remember This)"**.
  - Or click **+ Teach** at the top of the Side Panel.
- **Feedback & Corrections:**
  - Click **👍 Reinforce** to boost confidence in a fact.
  - Click **✏️ Correct** to provide a direct correction which immediately supersedes the old memory.

---

## 🧪 Testing

Run the automated test suites:

```bash
# Test Brain NLP, Vector Index, and Knowledge Graph
npm run test:brain

# Test Learning Loop, User Feedback, Corrections, and Memory Tiers
npm run test:learning

# Test Spider Fleet DOM extraction strategies
npm run test:crawler
```

---

## 🛡️ Privacy & Offline Operation

- **100% Local:** All memories, vector embeddings, and harvested DOM content stay on your local disk (`data/arachnos_memory.json`).
- **No Cloud Required:** Queries and reasoning execute offline via local deterministic RAG or optional local Ollama (`http://localhost:11434`).
