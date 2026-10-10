import { createHash } from 'node:crypto';
import type {
  HarvestEvent,
  BrainProcessedEvent,
  ProcessedChunk,
} from './types.js';
import { NlpPipeline } from './nlp.js';
import { VectorIndex } from './vectorStore.js';
import { KnowledgeGraph } from './knowledgeGraph.js';
import { BrainTelemetry } from './telemetry.js';

export class IngestionBus {
  private readonly nlp: NlpPipeline;
  private readonly vectorIndex: VectorIndex;
  private readonly knowledgeGraph: KnowledgeGraph;
  private readonly telemetry: BrainTelemetry;
  private lastHarvestTimestamp = new Date().toISOString();

  // Deduplication & provenance mapping: contentHash -> chunkId
  private readonly contentHashMap = new Map<string, string>();

  constructor(
    nlp: NlpPipeline,
    vectorIndex: VectorIndex,
    knowledgeGraph: KnowledgeGraph,
    telemetry: BrainTelemetry
  ) {
    this.nlp = nlp;
    this.vectorIndex = vectorIndex;
    this.knowledgeGraph = knowledgeGraph;
    this.telemetry = telemetry;
  }

  /**
   * Deterministically computes chunk ID and content hash
   */
  public computeChunkId(event: HarvestEvent): { chunkId: string; contentHash: string } {
    const rawNormalized = (event.raw_text || '').trim();
    const factsStr = (event.extracted_facts || []).join('|');
    const contentKey = `${rawNormalized}::${factsStr}::${event.content_type}::${event.element_selector}`;
    const hash = createHash('sha256').update(contentKey).digest('hex').slice(0, 16);
    const chunkId = `chk_${event.spider_id || 'spider'}_${hash}`;
    return { chunkId, contentHash: hash };
  }

  /**
   * Ingests an incoming HarvestEvent in real-time.
   * Runs NLP cleaning, entity extraction, relation extraction, vector embedding,
   * graph updates, and triggers telemetry.
   */
  public ingest(event: HarvestEvent): BrainProcessedEvent {
    this.lastHarvestTimestamp = event.timestamp || new Date().toISOString();

    const { chunkId, contentHash } = this.computeChunkId(event);
    const normalizedText = this.nlp.normalizeText(event.raw_text || '');
    const fullContentText = [normalizedText, ...(event.extracted_facts || [])].filter(Boolean).join(' ');
    const { tokens, stemmed } = this.nlp.tokenize(fullContentText);

    // 1. Extract entities across 7 categories
    const entities = this.nlp.extractEntities(normalizedText, event.extracted_facts || []);

    // 2. Extract relations
    const relations = this.nlp.extractRelations(normalizedText, entities);

    // 3. Compute dense vector embedding
    const vector = this.vectorIndex.generateEmbedding(fullContentText, tokens);

    // 4. Create ProcessedChunk
    const processedChunk: ProcessedChunk = {
      id: chunkId,
      spider_id: event.spider_id,
      timestamp: event.timestamp || this.lastHarvestTimestamp,
      page_url: event.page_url,
      element_selector: event.element_selector,
      bounding_box: event.bounding_box || { x: 0, y: 0, w: 0, h: 0 },
      content_type: event.content_type,
      raw_text: event.raw_text || '',
      normalized_text: normalizedText,
      extracted_facts: event.extracted_facts || [],
      metadata: event.metadata,
      confidence: event.confidence ?? 1.0,
      tokens,
      stemmedTokens: stemmed,
      vector,
      entities,
      relations,
    };

    // 5. Store in Vector Index
    this.vectorIndex.addChunk(processedChunk);
    this.contentHashMap.set(contentHash, chunkId);

    // 6. Store in Knowledge Graph
    for (const ent of entities) {
      this.knowledgeGraph.upsertEntity(ent.name, ent.type, chunkId);
    }

    for (const rel of relations) {
      this.knowledgeGraph.upsertRelation(
        rel.source,
        rel.target,
        rel.relation,
        rel.weight,
        chunkId
      );
    }

    // 7. Emit real-time telemetry event
    const countChunks = this.vectorIndex.getChunkCount();
    const countEntities = this.knowledgeGraph.getNodeCount();
    const countRelations = this.knowledgeGraph.getRelationCount();

    const formattedRelations = relations.map((r) => ({
      source: r.source,
      target: r.target,
      relation: r.relation,
    }));

    const brainProcessedEvent: BrainProcessedEvent = {
      type: 'brain_processed',
      chunk_id: chunkId,
      spider_id: event.spider_id,
      entities: entities.map((e) => ({ name: e.name, type: e.type })),
      relationships: formattedRelations,
      relations: formattedRelations,
      total_chunks: countChunks,
      total_entities: countEntities,
      total_relations: countRelations,
      totalChunks: countChunks,
      totalEntities: countEntities,
      totalRelations: countRelations,
    };

    this.telemetry.emitProcessed(brainProcessedEvent);

    // Schedule debounced knowledge_ready aggregate telemetry
    this.telemetry.scheduleKnowledgeReady(() => ({
      totalChunks: countChunks,
      total_chunks: countChunks,
      totalEntities: countEntities,
      total_entities: countEntities,
      totalRelations: countRelations,
      total_relations: countRelations,
      indexSizeKb: this.vectorIndex.getIndexSizeKb(),
      index_size_kb: this.vectorIndex.getIndexSizeKb(),
      lastHarvestTimestamp: this.lastHarvestTimestamp,
      last_harvest_timestamp: this.lastHarvestTimestamp,
    }));

    return brainProcessedEvent;
  }

  /**
   * Batch ingestion for high-throughput streaming
   */
  public ingestBatch(events: HarvestEvent[]): BrainProcessedEvent[] {
    return events.map((event) => this.ingest(event));
  }

  public getLastHarvestTimestamp(): string {
    return this.lastHarvestTimestamp;
  }

  public clear(): void {
    this.contentHashMap.clear();
    this.lastHarvestTimestamp = new Date().toISOString();
  }
}
