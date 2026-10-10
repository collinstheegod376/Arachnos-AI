// ==========================================
// ARACHNOS PERSONAL SHARED CONTRACT & EVENT PROTOCOL (v2.1)
// ==========================================

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SpiderSpecialization = 'text' | 'link' | 'structure' | 'media';

export type SpiderStatus = 'spawning' | 'moving' | 'harvesting' | 'idle' | 'analyzing' | 'error';

export interface SpiderIdentity {
  id: string;
  name: string;
  specialization: SpiderSpecialization;
  color: string;
  secondaryColor: string;
  glowColor: string;
  description: string;
}

export interface SpiderState extends SpiderIdentity {
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  targetSelector?: string;
  targetLabel?: string;
  status: SpiderStatus;
  harvestCount: number;
  currentAction: string;
  confidence: number;
  velocity: { vx: number; vy: number };
  heading: number; // in radians
  stepCycle?: number;
}

export type ContentType = 'heading' | 'paragraph' | 'link' | 'table' | 'list' | 'image' | 'meta';

// ==========================================
// V2.1 CORE EVENTS (Extension <-> Local Brain)
// ==========================================

export type CoreEventType = 'harvest' | 'feedback' | 'query' | 'memory_update' | 'teach';
export type EventSource = 'content_script' | 'side_panel' | 'user' | 'background';

export interface CoreEvent<T = any> {
  type: CoreEventType;
  source: EventSource;
  page_url: string;
  timestamp: string;
  payload: T;
}

// Memory tiers: 1. Raw harvests (short-term), 2. Processed facts (medium-term), 3. User-reinforced (long-term)
export type MemoryTier = 'raw_harvest' | 'processed_fact' | 'user_reinforced';
export type UserFeedbackType = 'positive' | 'negative' | 'corrected' | 'none';

export interface MemoryRecord {
  id: string;
  content: string;
  embedding?: number[];
  source_url: string;
  selector?: string;
  bounding_box?: BoundingBox;
  confidence: number;
  user_feedback: UserFeedbackType;
  corrected_text?: string | null;
  tier: MemoryTier;
  created_at: string;
  last_accessed: string;
  visit_count?: number;
  tags?: string[];
  title?: string;
}

export interface FeedbackPayload {
  memory_id: string;
  feedback: 'positive' | 'negative' | 'corrected';
  corrected_text?: string;
}

export interface TeachPayload {
  content: string;
  page_url: string;
  selector?: string;
  title?: string;
  bounding_box?: BoundingBox;
}

// Traditional Harvest Event (compatible with v1.0 & v2.1)
export interface HarvestEvent {
  type: 'harvest';
  spider_id: string;
  timestamp: string;
  page_url: string;
  element_selector: string;
  bounding_box: BoundingBox;
  content_type: ContentType;
  raw_text: string;
  extracted_facts: string[];
  metadata?: {
    tag?: string;
    href?: string;
    src?: string;
    alt?: string;
    rowCount?: number;
    colCount?: number;
    depth?: number;
    attributes?: Record<string, string>;
  };
  confidence: number;
}

export interface SpiderSpawnEvent {
  type: 'spider_spawn';
  spider: SpiderState;
}

export interface SpiderMoveEvent {
  type: 'spider_move';
  spider_id: string;
  targetX: number;
  targetY: number;
  targetSelector: string;
  targetLabel: string;
  durationMs: number;
}

export interface SpiderIdleEvent {
  type: 'spider_idle';
  spider_id: string;
  status: 'idle' | 'analyzing';
  reason?: string;
}

export interface EntityNode {
  id: string;
  name: string;
  type: 'concept' | 'organization' | 'person' | 'location' | 'technology' | 'metric' | 'resource';
  frequency: number;
  sourceChunks: string[];
}

export interface EntityRelation {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface BrainProcessedEvent {
  type: 'brain_processed';
  chunk_id: string;
  spider_id: string;
  entities: { name: string; type: EntityNode['type'] }[];
  relationships: { source: string; target: string; relation: string }[];
  relations?: { source: string; target: string; relation: string }[];
  total_chunks: number;
  total_entities: number;
  total_relations: number;
  totalChunks?: number;
  totalEntities?: number;
  totalRelations?: number;
}

export interface KnowledgeReadyEvent {
  type: 'knowledge_ready';
  stats: {
    totalChunks: number;
    totalEntities: number;
    totalRelations: number;
    indexSizeKb: number;
    lastHarvestTimestamp: string;
    total_chunks?: number;
    total_entities?: number;
    total_relations?: number;
    index_size_kb?: number;
    last_harvest_timestamp?: string;
    totalMemories?: number;
    reinforcedCount?: number;
  };
}

export interface Citation {
  chunk_id: string;
  spider_id?: string;
  element_selector?: string;
  bounding_box: BoundingBox;
  snippet: string;
  source_url: string;
  content_type?: ContentType;
  confidence?: number;
  user_feedback?: UserFeedbackType;
  tier?: MemoryTier;
}

export interface QueryRequest {
  type?: 'query_brain';
  query: string;
  sessionId?: string;
}

export interface QueryResponse {
  type: 'query_response';
  query: string;
  answer: string;
  citations: Citation[];
  related_entities: string[];
  confidence: number;
  latencyMs: number;
}

export interface CrawlStartRequest {
  type: 'start_crawl';
  url: string;
  spiderCount?: number;
  focusMode?: 'all' | 'text' | 'media' | 'structure';
}

export interface CrawlStatusEvent {
  type: 'crawl_status';
  url: string;
  status: 'initializing' | 'crawling' | 'completed' | 'paused' | 'error';
  progress: number; // 0 to 100
  harvestedItems: number;
  elapsedMs: number;
  activeSpiders: number;
  message?: string;
}

export type WebSocketClientMessage =
  | CrawlStartRequest
  | QueryRequest
  | { type: 'pause_crawl' }
  | { type: 'resume_crawl' }
  | { type: 'feedback'; payload: FeedbackPayload }
  | { type: 'teach'; payload: TeachPayload };

export type WebSocketServerMessage =
  | SpiderSpawnEvent
  | SpiderMoveEvent
  | SpiderIdleEvent
  | HarvestEvent
  | BrainProcessedEvent
  | KnowledgeReadyEvent
  | QueryResponse
  | CrawlStatusEvent
  | { type: 'error'; message: string };
