# Arachnos Personal — Local Learning Chrome Extension

**Project Codename:** Arachnos Personal  
**Version:** 2.1 Context Document (Simplified UI)  
**Date:** 2026-10-10  
**Builds On:** Arachnos Crawler Context (v1.0)  
**Hosting:** Fully local (user machine)  
**Form Factor:** Chrome Extension (Manifest V3)

---

## 1. Evolution of the Vision

The original system was a visual multi-spider crawler that loaded a user-supplied page and streamed knowledge into a Brain.  

**Arachnos Personal** turns that idea into a **personal AI companion that lives in the browser**.  

It watches the pages you visit, learns from them (and from explicit feedback you give it), remembers everything locally, and can be queried at any time. Spiders still appear as high-fidelity animated overlays when active, but the system is now continuous and personal rather than session-based.

**Core loop:**
1. You browse normally.
2. The extension observes the current page (on demand or in the background).
3. Animated spiders harvest visible content in real time.
4. The local Brain processes, embeds, and stores the knowledge with full provenance.
5. You can correct, reinforce, or ignore what it learned — it updates its memory.
6. Later, you ask questions and it answers from everything it has ever seen on your machine.

Everything stays local. No cloud dependency required for core function.

---

## 2. High-Level Architecture (Local + Extension)

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Browser                        │
│  ┌────────────────────┐    ┌──────────────────────────┐  │
│  │  Content Script    │◄──►│   Background Service     │  │
│  │  (Spiders + Overlay│    │   Worker (Orchestration) │  │
│  │   + Page Observer) │    │                          │  │
│  └─────────┬──────────┘    └────────────┬─────────────┘  │
│            │                            │                │
│  ┌─────────▼──────────┐    ┌────────────▼─────────────┐  │
│  │   Side Panel /     │    │     Popup / Options      │  │
│  │   Chat UI          │    │                          │  │
│  └────────────────────┘    └──────────────────────────┘  │
└────────────────────────────┬─────────────────────────────┘
                             │ localhost WebSocket / HTTP
┌────────────────────────────▼─────────────────────────────┐
│              Local Brain Server (FastAPI / Node)         │
│  • Ingestion & Learning Pipeline                         │
│  • Vector Store (Qdrant / Chroma / pgvector)             │
│  • Knowledge Graph                                       │
│  • Local LLM (Ollama / LM Studio / llama.cpp)            │
│  • Long-term Memory & User Feedback Store                │
└──────────────────────────────────────────────────────────┘
```

**Recommended local stack:**
- Extension: Manifest V3, TypeScript, React (for side panel), Canvas/WebGL or SVG for spiders
- Local server: FastAPI (Python) or Express (Node)
- Vector DB: Qdrant (Docker) or Chroma (embedded)
- LLM: Ollama with a strong local model (Llama 3.1, Qwen2.5, Gemma 2, etc.)
- Storage: SQLite + vector store + optional graph (Neo4j or simple JSON/SQLite edges)

---

## 3. The Three Agents (Parallel Workstreams)

The system is again built by three specialized agents working simultaneously after locking shared contracts.

### Agent 1 — **Extension Visual & Interaction Agent**
**Responsibility:** Everything the user sees and interacts with inside Chrome.

**Owns:**
- Manifest V3 setup, content scripts, service worker scaffolding
- High-fidelity spider overlay system (injected into every page)
- Smooth 60 fps animations (Framer Motion / GSAP / custom Canvas)
- Minimal side panel chat interface
- Extremely simple popup controls (start/stop + spider count only)
- Options page for local server connection and preferences

**Key focus:** When the extension is active, the **only** visual element on the page must be the spiders. No HUDs, status cards, live feeds, or overlays of any kind on the webpage itself. All controls and chat live in the side panel or popup and stay out of the way.

### Agent 2 — **Page Observation & Harvest Agent**
**Responsibility:** Seeing the page and extracting data cleanly.

**Owns:**
- Content script page analysis (DOM walking, readability extraction, structured data)
- Multi-spider coordination logic inside the page
- Bounding-box and selector capture for visual correlation
- Event emission to the background worker and local Brain
- Respect for page performance (throttling, pause on heavy interaction)
- Handling of SPAs and dynamic content (MutationObserver)

**Deliverables:** Reliable, low-impact harvest pipeline that works across most websites.

### Agent 3 — **Local Learning Brain Agent**
**Responsibility:** Continuous learning, memory, and reasoning.

**Owns:**
- Local server API
- Streaming ingestion from the extension
- Chunking, cleaning, entity extraction, embedding
- Long-term memory store with user feedback loop
- Personalization (what the user reinforces or corrects)
- RAG query endpoint grounded in the user’s own browsing history
- Session and lifetime memory management

**Learning mechanisms:**
- Explicit: “Remember this”, “Forget that”, “This is wrong”, thumbs up/down
- Implicit: Frequency of revisiting, time spent, manual highlights
- Reinforcement: User corrections update embeddings and confidence scores

---

## 4. Shared Contracts (Lock These First)

### Core Events (Extension ↔ Local Brain)

```json
{
  "type": "harvest" | "feedback" | "query" | "memory_update",
  "source": "content_script" | "side_panel" | "user",
  "page_url": "https://...",
  "timestamp": "ISO-8601",
  "payload": { ... }
}
```

### Memory Record

```json
{
  "id": "uuid",
  "content": "extracted or summarized text",
  "embedding": [...],
  "source_url": "...",
  "selector": "article > h2",
  "bounding_box": {...},
  "confidence": 0.92,
  "user_feedback": "positive" | "negative" | "corrected",
  "corrected_text": null,
  "created_at": "...",
  "last_accessed": "..."
}
```

### Coordinate & Overlay Protocol
Content script reports viewport-relative bounding boxes. Visual Agent renders spiders and highlights using the same coordinate space.

---

## 5. Learning & Memory Design

The Brain is not a one-shot crawler. It is a **personal knowledge system** that improves over time.

**Learning behaviors:**
- New pages are chunked and embedded immediately.
- User can highlight text and click “Teach Arachnos” — that fragment is stored with high priority.
- Corrections (“No, the price is actually $X”) create a new memory node that supersedes the old one.
- Frequent topics are summarized into higher-level concepts.
- The system can surface “I noticed you’ve been researching X — want me to remember the key points?”

**Memory tiers:**
1. Raw harvests (short-term)
2. Processed facts & entities (medium-term)
3. User-reinforced knowledge (long-term, higher weight in retrieval)

All data stays on the local machine.

---

## 6. UI Design Principles (Simplified)

**Core rule:** When the extension is active and harvesting, the **only** thing visible on the webpage is the spiders. Nothing else.

### On-Page Behavior
- Spiders are the sole overlay.
- No status cards, live feeds, progress bars, floating data panels, or highlights that persist.
- Subtle, temporary visual feedback (thin light tether + a few fading particles) is allowed only while a spider is actively harvesting an element, then it disappears.
- Page content must remain fully readable and uncluttered at all times.
- Spiders should feel premium, precise, and alive without dominating the page.

### Side Panel (Chat)
- Clean, calm, and minimal.
- Small spider icon + simple status at the top.
- Conversation area with short, readable answers and tiny source tags.
- Clean input field at the bottom.
- Soft green accents only. Generous whitespace.
- No dense metrics, graphs, or secondary panels inside the chat.

### Popup
- Extremely simple.
- Spider icon.
- One clear Start / Stop control.
- Minimal spider count adjustment.
- Small connection indicator.
- Almost no text.

### Visual Style
- Dark metallic spiders with soft emissive green lighting.
- Independent leg articulation and subtle idle motion.
- Anticipatory, smooth movement.
- Consistent 60 fps.
- Graceful degradation on lower-end machines (fewer spiders or simpler effects).

Recommended approach: SVG spiders driven by JavaScript + CSS/GSAP, or a lightweight Canvas layer. Avoid heavy WebGL unless necessary.

---

## 7. Parallel Development Workflow

1. **Day 0–1:** All three agents lock the event schema, memory record format, and coordinate protocol.
2. **Parallel phase:**
   - Agent 1 builds the extension shell, side panel, and spider visuals using mock events.
   - Agent 2 builds the content-script harvest engine and emits real events.
   - Agent 3 builds the local server, vector store, and learning pipeline.
3. **Integration:** Connect extension to localhost Brain, tune real-time feel, add feedback loops.
4. **Polish:** Animation refinement, memory management UI, performance, and error handling.

---

## 8. Tutorial: Building the Chrome Extension (Manifest V3)

### Step 1: Project Structure

```
arachnos-extension/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── content/
│   │   ├── content-script.ts
│   │   └── spiders/
│   ├── sidepanel/
│   │   ├── index.html
│   │   └── App.tsx
│   ├── popup/
│   └── shared/
│       └── types.ts
├── public/
└── package.json
```

### Step 2: manifest.json (Minimal Working Version)

```json
{
  "manifest_version": 3,
  "name": "Arachnos Personal",
  "version": "2.1.0",
  "description": "Local learning spiders that remember what you browse",
  "permissions": [
    "activeTab",
    "sidePanel",
    "storage",
    "scripting",
    "contextMenus"
  ],
  "host_permissions": [
    "<all_urls>",
    "http://localhost:3001/*",
    "http://localhost:8000/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content-script.js"],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "action": {
    "default_popup": "src/popup/index.html",
    "default_title": "Arachnos"
  }
}
```

---

## 9. Success Criteria

- Extension loads on any page without breaking the site.
- When active, the **only** visual element on the page is the spiders.
- Spiders appear and animate smoothly with no clutter or extra overlays.
- Side panel chat is clean, readable, and minimal.
- Data is stored locally within seconds.
- User can correct or reinforce knowledge and see the change reflected in future answers.
- Queries return grounded answers with source links.
- Entire system runs offline after models and vector DB are set up.

---

## 10. Open Extensions

- Multi-device sync (optional, encrypted, still user-controlled)
- Scheduled background learning on bookmarked pages
- Export / import of the personal knowledge base
- Voice interface via the side panel
- Domain-specific spider personalities or learning policies

---

**End of Document**
