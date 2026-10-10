import { EventEmitter } from 'node:events';
import type {
  EntityNode,
  EntityRelation,
  HarvestEvent,
  BrainProcessedEvent,
  KnowledgeReadyEvent,
  QueryRequest,
  QueryResponse,
  ProcessedChunk,
  SubgraphResult,
} from './types.js';
import type {
  MemoryRecord,
  MemoryTier,
  FeedbackPayload,
  TeachPayload
} from '../../../shared/types.js';
import { NlpPipeline } from './nlp.js';
import { VectorIndex } from './vectorStore.js';
import { KnowledgeGraph } from './knowledgeGraph.js';
import { BrainTelemetry } from './telemetry.js';
import { IngestionBus } from './ingestionBus.js';
import { RagQueryEngine } from './ragEngine.js';
import { MemoryStore } from './memoryStore.js';
import { LocalLlmClient } from './localLlm.js';

export interface BrainOptions {
  vectorDimensions?: number;
  telemetryDebounceMs?: number;
  storageFile?: string;
  ollamaHost?: string;
  ollamaModel?: string;
}

export class Brain extends EventEmitter {
  public readonly nlp: NlpPipeline;
  public readonly vectorIndex: VectorIndex;
  public readonly knowledgeGraph: KnowledgeGraph;
  public readonly telemetry: BrainTelemetry;
  public readonly ingestionBus: IngestionBus;
  public readonly ragEngine: RagQueryEngine;
  public readonly memoryStore: MemoryStore;
  public readonly localLlm: LocalLlmClient;

  constructor(options: BrainOptions = {}) {
    super();

    const dimensions = options.vectorDimensions ?? 256;
    const debounceMs = options.telemetryDebounceMs ?? 150;

    this.nlp = new NlpPipeline();
    this.vectorIndex = new VectorIndex(dimensions);
    this.knowledgeGraph = new KnowledgeGraph();
    this.telemetry = new BrainTelemetry(debounceMs);
    this.memoryStore = new MemoryStore({ storageFile: options.storageFile });
    this.localLlm = new LocalLlmClient({
      host: options.ollamaHost,
      model: options.ollamaModel
    });

    this.ingestionBus = new IngestionBus(
      this.nlp,
      this.vectorIndex,
      this.knowledgeGraph,
      this.telemetry
    );

    this.ragEngine = new RagQueryEngine(
      this.nlp,
      this.vectorIndex,
      this.knowledgeGraph,
      this.memoryStore
    );

    // Forward telemetry events
    this.telemetry.on('brain_processed', (event: BrainProcessedEvent) => {
      this.emit('brain_processed', event);
    });

    this.telemetry.on('knowledge_ready', (event: KnowledgeReadyEvent) => {
      this.emit('knowledge_ready', event);
    });
  }

  /**
   * Ingests a streaming HarvestEvent from a spider or extension
   */
  public ingest(event: HarvestEvent | any): BrainProcessedEvent {
    // Normalise to HarvestEvent if needed
    const harvestEvent: HarvestEvent = {
      type: 'harvest',
      spider_id: event.spider_id || 'spider-personal-01',
      timestamp: event.timestamp || new Date().toISOString(),
      page_url: event.page_url || event.url || 'unknown://page',
      element_selector: event.element_selector || event.selector || 'body',
      bounding_box: event.bounding_box || { x: 0, y: 0, w: 0, h: 0 },
      content_type: event.content_type || 'paragraph',
      raw_text: event.raw_text || event.content || '',
      extracted_facts: event.extracted_facts || (event.content ? [event.content] : []),
      metadata: event.metadata || {},
      confidence: typeof event.confidence === 'number' ? event.confidence : 0.9,
    };

    // 1. Ingest into active vector index & knowledge graph
    const processed = this.ingestionBus.ingest(harvestEvent);

    // 2. Persist in long-term multi-tier memory store
    if (harvestEvent.raw_text && harvestEvent.raw_text.trim().length > 10) {
      this.memoryStore.addHarvest(
        harvestEvent.raw_text,
        harvestEvent.page_url,
        harvestEvent.element_selector,
        harvestEvent.bounding_box,
        harvestEvent.confidence,
        'raw_harvest',
        [],
        processed.chunk_id
      );
    }

    return processed;
  }

  /**
   * Ingests a batch of HarvestEvents
   */
  public ingestBatch(events: (HarvestEvent | any)[]): BrainProcessedEvent[] {
    return events.map(e => this.ingest(e));
  }

  /**
   * User feedback loop: reinforces, downweights, or applies corrections
   */
  public feedback(payload: FeedbackPayload): MemoryRecord | null {
    const updated = this.memoryStore.applyFeedback(payload);

    if (payload.feedback === 'corrected' && payload.corrected_text && updated) {
      // Re-index corrected text into vector store
      const { tokens, stemmed } = this.nlp.tokenize(payload.corrected_text);
      const existingChunk = this.vectorIndex.getChunk(updated.id);
      if (existingChunk) {
        existingChunk.raw_text = payload.corrected_text;
        existingChunk.normalized_text = payload.corrected_text.toLowerCase();
        existingChunk.extracted_facts = [payload.corrected_text];
        existingChunk.tokens = tokens;
        existingChunk.stemmedTokens = stemmed;
        existingChunk.confidence = 1.0;
        this.vectorIndex.addChunk(existingChunk);
      } else {
        // Add new high-priority chunk for the corrected memory
        const newChunk: ProcessedChunk = {
          id: `corrected_${updated.id}`,
          spider_id: 'user-correction',
          timestamp: new Date().toISOString(),
          page_url: updated.source_url,
          element_selector: updated.selector || 'user-feedback',
          bounding_box: updated.bounding_box || { x: 0, y: 0, w: 0, h: 0 },
          content_type: 'paragraph',
          raw_text: payload.corrected_text,
          normalized_text: payload.corrected_text.toLowerCase(),
          extracted_facts: [payload.corrected_text],
          confidence: 1.0,
          tokens,
          stemmedTokens: stemmed,
          vector: this.vectorIndex.generateEmbedding(payload.corrected_text.toLowerCase(), tokens),
          entities: this.nlp.extractEntities(payload.corrected_text),
          relations: [],
        };
        this.vectorIndex.addChunk(newChunk);
      }
    }

    this.telemetry.emitKnowledgeReadyNow(this.getStats());
    return updated;
  }

  /**
   * Explicit user teaching: saves fact directly into long-term user_reinforced memory
   */
  public teach(payload: TeachPayload): MemoryRecord {
    const record = this.memoryStore.teach(payload);

    // Also index in vectorStore so it is instantly retrievable
    const { tokens, stemmed } = this.nlp.tokenize(record.content);
    const chunk: ProcessedChunk = {
      id: record.id,
      spider_id: 'user-teach',
      timestamp: record.created_at,
      page_url: record.source_url,
      element_selector: record.selector || 'user-input',
      bounding_box: record.bounding_box || { x: 0, y: 0, w: 0, h: 0 },
      content_type: 'paragraph',
      raw_text: record.content,
      normalized_text: record.content.toLowerCase(),
      extracted_facts: [record.content],
      confidence: 1.0,
      tokens,
      stemmedTokens: stemmed,
      vector: this.vectorIndex.generateEmbedding(record.content.toLowerCase(), tokens),
      entities: this.nlp.extractEntities(record.content),
      relations: this.nlp.extractRelations(record.content, this.nlp.extractEntities(record.content)),
    };

    this.vectorIndex.addChunk(chunk);
    this.telemetry.emitKnowledgeReadyNow(this.getStats());
    return record;
  }

  /**
   * Answers user questions strictly grounded in harvested data and memory
   */
  public query(request: QueryRequest | string): QueryResponse {
    return this.ragEngine.query(request);
  }

  /**
   * Answers user questions with optional Ollama local LLM synthesis
   */
  public async queryWithLlm(request: QueryRequest | string): Promise<QueryResponse> {
    const baseResponse = this.ragEngine.query(request);
    const queryStr = typeof request === 'string' ? request : request.query;

    if (baseResponse.citations.length > 0) {
      const isOllamaUp = await this.localLlm.isAvailable();
      if (isOllamaUp) {
        const chunks = baseResponse.citations.map(c => ({
          content: c.snippet,
          source_url: c.source_url,
          selector: c.element_selector
        }));
        const llmAnswer = await this.localLlm.generateAnswer(queryStr, chunks);
        if (llmAnswer) {
          baseResponse.answer = llmAnswer;
        }
      }
    }

    return baseResponse;
  }

  /**
   * Returns memories, optionally filtered by tier
   */
  public getMemories(tier?: MemoryTier): MemoryRecord[] {
    return tier ? this.memoryStore.getByTier(tier) : this.memoryStore.getAll();
  }

  /**
   * Deletes a memory record
   */
  public deleteMemory(id: string): boolean {
    const res = this.memoryStore.delete(id);
    this.vectorIndex.removeChunk(id);
    this.telemetry.emitKnowledgeReadyNow(this.getStats());
    return res;
  }

  /**
   * Returns complete knowledge graph nodes & relations (and entities alias)
   */
  public getKnowledgeGraphData(): {
    nodes: EntityNode[];
    entities: EntityNode[];
    relations: EntityRelation[];
    totalNodes: number;
    totalEntities: number;
    totalRelations: number;
  } {
    const all = this.knowledgeGraph.getAllData();
    const nodes = all.nodes || [];
    const relations = all.relations || [];
    return {
      nodes,
      entities: nodes,
      relations,
      totalNodes: nodes.length,
      totalEntities: nodes.length,
      totalRelations: relations.length,
    };
  }

  /**
   * Returns a localized subgraph around seed entity names or IDs
   */
  public getSubgraph(seedNamesOrIds: string[], maxHops = 2, maxNodes = 40): SubgraphResult {
    return this.knowledgeGraph.getSubgraph(seedNamesOrIds, maxHops, maxNodes);
  }

  /**
   * Searches knowledge graph entities by keyword
   */
  public searchEntities(query: string, limit = 10): EntityNode[] {
    return this.knowledgeGraph.searchEntities(query, limit);
  }

  /**
   * Returns top entities ranked by centrality & frequency
   */
  public getTopEntities(limit = 20): EntityNode[] {
    return this.knowledgeGraph.getTopEntities(limit);
  }

  /**
   * Returns all stored chunks
   */
  public getAllChunks(): ProcessedChunk[] {
    return this.vectorIndex.getAllChunks();
  }

  /**
   * Returns a specific chunk by ID
   */
  public getChunk(id: string): ProcessedChunk | undefined {
    return this.vectorIndex.getChunk(id);
  }

  /**
   * Returns current statistics for telemetry or dashboard inspection
   */
  public getStats(): KnowledgeReadyEvent['stats'] {
    const chunkCount = this.vectorIndex.getChunkCount();
    const entityCount = this.knowledgeGraph.getNodeCount();
    const relationCount = this.knowledgeGraph.getRelationCount();
    const sizeKb = this.vectorIndex.getIndexSizeKb();
    const lastTimestamp = this.ingestionBus.getLastHarvestTimestamp() || new Date().toISOString();
    const memStats = this.memoryStore.getStats();

    return {
      totalChunks: chunkCount,
      total_chunks: chunkCount,
      totalEntities: entityCount,
      total_entities: entityCount,
      totalRelations: relationCount,
      total_relations: relationCount,
      indexSizeKb: sizeKb,
      index_size_kb: sizeKb,
      lastHarvestTimestamp: lastTimestamp,
      last_harvest_timestamp: lastTimestamp,
      totalMemories: memStats.total,
      reinforcedCount: memStats.userReinforcedCount
    };
  }

  /**
   * Clears all stored knowledge and resets index
   */
  public reset(): void {
    this.vectorIndex.clear();
    this.knowledgeGraph.clear();
    this.ingestionBus.clear();
    this.memoryStore.clear();
    this.telemetry.emitKnowledgeReadyNow(this.getStats());
  }

  /**
   * Clean up background timers
   */
  public destroy(): void {
    this.telemetry.cleanup();
    this.removeAllListeners();
  }
}
