import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import {
  SpiderFleetCoordinator,
  proxyHandler,
  samplePagesHandler
} from './crawler/index.js';
import { Brain } from './brain/index.js';
import {
  WebSocketClientMessage,
  WebSocketServerMessage
} from '../../shared/types.js';

// Process Crash Guards
process.on('uncaughtException', (err: any) => {
  console.error('[Process] Uncaught Exception caught (process preserved):', err?.message || err);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[Process] Unhandled Rejection caught (process preserved):', reason?.message || reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find static public / client directory
const possibleStaticPaths = [
  path.resolve(__dirname, '../public'),
  path.resolve(__dirname, '../../public'),
  path.resolve(process.cwd(), 'server/public'),
  path.resolve(process.cwd(), 'public'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
];
const staticPath = possibleStaticPaths.find(p => fs.existsSync(p)) || possibleStaticPaths[0];

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware & Open CORS for Chrome extension & localhost
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));
app.options('*', cors());
app.use(express.json());

// Serve static frontend assets
if (fs.existsSync(staticPath)) {
  console.log(`[Static] Serving frontend static assets from: ${staticPath}`);
  app.use(express.static(staticPath));
} else {
  console.warn(`[Static] Static directory not found at: ${staticPath}`);
}

// API Overview Endpoint
app.get('/api/overview', (_req: Request, res: Response) => {
  res.json({
    system: 'Arachnos Personal — Local Brain Server',
    status: 'online',
    version: '2.1.0',
    description: 'Local knowledge ingestion, multi-tier memory, and citation-grounded RAG for Arachnos Chrome Extension',
    endpoints: {
      status: '/status',
      ingest: 'POST /ingest',
      query: 'POST /query',
      feedback: 'POST /feedback',
      teach: 'POST /teach',
      memory: 'GET /memory',
      websocket: 'ws://localhost:3001'
    },
    extension: 'Load extension/ in chrome://extensions to use Arachnos Personal'
  });
});

// Initialize Core Subsystems
const coordinator = new SpiderFleetCoordinator();
const brain = new Brain();

// Broadcast helper to all connected WebSocket clients
function broadcast(message: WebSocketServerMessage): void {
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err: any) {
        console.error('[WebSocket] Broadcast send error:', err.message);
      }
    }
  });
}

// Connect SpiderFleetCoordinator events to WebSocket broadcast & Brain ingestion
coordinator.on('message', (event: WebSocketServerMessage) => {
  broadcast(event);

  // When a spider harvests an element, ingest immediately into the Brain
  if (event.type === 'harvest') {
    brain.ingest(event);
  }
});

// Forward Brain processed and knowledge events to WebSocket clients
brain.on('brain_processed', event => broadcast(event));
brain.on('knowledge_ready', event => broadcast(event));

// REST API Endpoints

// 1. Ingestion Endpoint (POST /ingest & POST /api/ingest)
const handleIngest = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload) {
      res.status(400).json({ error: 'Missing request body' });
      return;
    }

    const processed = brain.ingest(payload);
    res.json({
      status: 'stored',
      id: processed.chunk_id,
      spider_id: processed.spider_id,
      total_chunks: processed.total_chunks
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/ingest', handleIngest);
app.post('/api/ingest', handleIngest);

// 2. Query Endpoint (POST /query & POST /api/query)
const handleQuery = async (req: Request, res: Response) => {
  try {
    const rawQuery = (
      req.body?.question ??
      req.body?.query ??
      req.body?.q ??
      req.query?.question ??
      req.query?.query ??
      req.query?.q ??
      ''
    ).toString();

    const response = await brain.queryWithLlm(rawQuery);
    res.json({
      ...response,
      sources: response.citations
    });
  } catch (err: any) {
    res.status(500).json({
      type: 'query_response',
      query: (req.body?.question ?? req.body?.query ?? '').toString(),
      answer: `Error executing query: ${err?.message || 'Unknown error'}`,
      citations: [],
      sources: [],
      related_entities: [],
      confidence: 0,
      latencyMs: 0,
    });
  }
};
app.post('/query', handleQuery);
app.get('/query', handleQuery);
app.post('/api/query', handleQuery);
app.get('/api/query', handleQuery);

// 3. User Feedback Endpoint (POST /feedback & POST /api/feedback)
const handleFeedback = (req: Request, res: Response) => {
  try {
    const { memory_id, id, feedback, corrected_text } = req.body;
    const targetId = memory_id || id;
    if (!targetId || !feedback) {
      res.status(400).json({ error: 'Missing required "memory_id" and "feedback"' });
      return;
    }

    const record = brain.feedback({
      memory_id: targetId,
      feedback,
      corrected_text
    });

    res.json({
      status: 'updated',
      id: targetId,
      record
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/feedback', handleFeedback);
app.post('/api/feedback', handleFeedback);

// 4. Teach Endpoint (POST /teach & POST /api/teach)
const handleTeach = (req: Request, res: Response) => {
  try {
    const { content, page_url, selector, title, bounding_box } = req.body;
    if (!content) {
      res.status(400).json({ error: 'Missing required "content" to remember' });
      return;
    }

    const record = brain.teach({
      content,
      page_url: page_url || 'user://manual-teach',
      selector,
      title,
      bounding_box
    });

    res.json({
      status: 'stored',
      id: record.id,
      record
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/teach', handleTeach);
app.post('/api/teach', handleTeach);

// 5. Memory Management Endpoints (GET /memory, DELETE /memory/:id)
const handleGetMemory = (req: Request, res: Response) => {
  try {
    const tier = req.query.tier as any;
    const memories = brain.getMemories(tier);
    res.json({
      memories,
      total: memories.length,
      stats: brain.memoryStore.getStats()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.get('/memory', handleGetMemory);
app.get('/api/memory', handleGetMemory);

const handleDeleteMemory = (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const deleted = brain.deleteMemory(id);
    res.json({ status: deleted ? 'deleted' : 'not_found', id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.delete('/memory/:id', handleDeleteMemory);
app.delete('/api/memory/:id', handleDeleteMemory);

// 6. Crawler proxy & samples (v1.0 backward compatibility)
app.get('/api/proxy', proxyHandler);
app.get('/api/proxy/samples', samplePagesHandler);
app.get('/api/samples', samplePagesHandler);

app.post('/api/crawl', async (req: Request, res: Response) => {
  const { url, focusMode } = req.body;
  if (!url) {
    res.status(400).json({ error: 'Missing required "url" field in request body' });
    return;
  }

  try {
    await coordinator.start(url, { focusMode });
    res.json({ status: 'started', url, spiders: coordinator.getSpiders() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crawl/pause', (_req: Request, res: Response) => {
  coordinator.pause();
  res.json({ status: 'paused' });
});

app.post('/api/crawl/resume', (_req: Request, res: Response) => {
  coordinator.resume();
  res.json({ status: 'resumed' });
});

app.post('/api/crawl/stop', (_req: Request, res: Response) => {
  coordinator.stop();
  res.json({ status: 'stopped' });
});

app.get('/api/graph', (_req: Request, res: Response) => {
  try {
    const graphData = brain.getKnowledgeGraphData();
    res.json(graphData);
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Error fetching graph data',
      nodes: [],
      entities: [],
      relations: [],
      totalNodes: 0,
      totalEntities: 0,
      totalRelations: 0,
    });
  }
});

// System Status & Health
const handleHealth = (_req: Request, res: Response) => {
  try {
    const stats = brain.getStats();
    res.json({
      status: 'online',
      version: '2.1.0',
      system: 'Arachnos Personal',
      uptime: Math.round(process.uptime()),
      crawler: coordinator.getStatus(),
      spiders: coordinator.getSpiders(),
      brain: stats,
      memory: brain.memoryStore.getStats(),
      activeSockets: wss.clients.size,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err?.message });
  }
};
app.get('/status', handleHealth);
app.get('/api/status', handleHealth);
app.get('/api/health', handleHealth);

// SPA Fallback: serve index.html for non-API client navigation
app.get('*', (req: Request, res: Response, next) => {
  if (req.path.startsWith('/api') || req.path === '/ingest' || req.path === '/query' || req.path === '/feedback' || req.path === '/teach' || req.path === '/memory' || req.path === '/status') {
    return next();
  }
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Project Arachnos UI build not found.');
  }
});

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

// WebSocket Server error resilience
wss.on('error', (err) => {
  console.error('[WebSocket Server] Error:', err);
});

// WebSocket Protocol Handlers
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const extWs = ws as ExtWebSocket;
  extWs.isAlive = true;

  const clientAddress = req.socket.remoteAddress || 'unknown';
  console.log(`[WebSocket] Client connected from ${clientAddress}. Total clients: ${wss.clients.size}`);

  extWs.on('pong', () => {
    extWs.isAlive = true;
  });

  extWs.on('error', (err) => {
    console.error('[WebSocket] Socket connection error:', err.message);
  });

  // Send initial spider fleet state
  try {
    coordinator.getSpiders().forEach(spider => {
      if (extWs.readyState === WebSocket.OPEN) {
        extWs.send(JSON.stringify({ type: 'spider_spawn', spider }));
      }
    });

    // Send initial brain stats
    if (extWs.readyState === WebSocket.OPEN) {
      extWs.send(JSON.stringify({
        type: 'knowledge_ready',
        stats: brain.getStats()
      }));
    }
  } catch (err: any) {
    console.error('[WebSocket] Handshake send error:', err.message);
  }

  extWs.on('message', async (data: Buffer | string) => {
    try {
      const raw = data.toString();

      if (raw === 'ping') {
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send('pong');
        }
        return;
      }

      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      if (msg.type === 'harvest') {
        const processed = brain.ingest(msg);
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify(processed));
        }
      } else if (msg.type === 'feedback') {
        const updated = brain.feedback(msg.payload);
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({ type: 'feedback_acknowledged', record: updated }));
        }
      } else if (msg.type === 'teach') {
        const taught = brain.teach(msg.payload);
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({ type: 'teach_acknowledged', record: taught }));
        }
      } else if (msg.type === 'start_crawl') {
        console.log(`[WebSocket] Starting crawl for: ${msg.url}`);
        brain.reset();
        await coordinator.start(msg.url, {
          spiderCount: msg.spiderCount,
          focusMode: msg.focusMode
        });
      } else if (msg.type === 'pause_crawl') {
        coordinator.pause();
      } else if (msg.type === 'resume_crawl') {
        coordinator.resume();
      } else if (msg.type === 'query_brain' || msg.type === 'query') {
        const queryText = msg.query || msg.question || '';
        const result = await brain.queryWithLlm(queryText);
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify(result));
        }
      }
    } catch (err: any) {
      console.error('[WebSocket] Message handling error:', err.message);
      if (extWs.readyState === WebSocket.OPEN) {
        extWs.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    }
  });

  extWs.on('close', () => {
    console.log('[WebSocket] Client disconnected. Total active:', wss.clients.size);
  });
});

// Periodic ping/pong heartbeat
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    const extWs = client as ExtWebSocket;
    if (extWs.isAlive === false) {
      console.log('[WebSocket] Pruning inactive client socket');
      return extWs.terminate();
    }
    extWs.isAlive = false;
    try {
      extWs.ping();
    } catch {
      extWs.terminate();
    }
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start Listening
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🕷️  ARACHNOS PERSONAL LOCAL BRAIN on http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🧠 Ingestion endpoint: http://localhost:${PORT}/ingest`);
  console.log(`💬 Query endpoint:     http://localhost:${PORT}/query`);
  console.log(`👍 Feedback endpoint:  http://localhost:${PORT}/feedback`);
  console.log(`🎓 Teach endpoint:     http://localhost:${PORT}/teach`);
  console.log(`=======================================================`);
});

export { app, server, coordinator, brain };
