import { EventEmitter } from 'node:events';
import type { BrainProcessedEvent, KnowledgeReadyEvent } from './types.js';

export interface BrainTelemetryStats {
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
}

export class BrainTelemetry extends EventEmitter {
  private debouncedTimer: NodeJS.Timeout | null = null;
  private readonly debounceDelayMs: number;

  constructor(debounceDelayMs = 150) {
    super();
    this.debounceDelayMs = debounceDelayMs;
  }

  /**
   * Emits brain_processed immediately for each processed chunk
   */
  public emitProcessed(event: BrainProcessedEvent): void {
    this.emit('brain_processed', event);
  }

  /**
   * Schedules a debounced knowledge_ready aggregate telemetry event
   */
  public scheduleKnowledgeReady(statsProvider: () => BrainTelemetryStats): void {
    if (this.debouncedTimer) {
      clearTimeout(this.debouncedTimer);
    }

    this.debouncedTimer = setTimeout(() => {
      this.debouncedTimer = null;
      const stats = statsProvider();
      const event: KnowledgeReadyEvent = {
        type: 'knowledge_ready',
        stats: {
          totalChunks: stats.totalChunks ?? (stats as any).total_chunks ?? 0,
          total_chunks: stats.totalChunks ?? (stats as any).total_chunks ?? 0,
          totalEntities: stats.totalEntities ?? (stats as any).total_entities ?? 0,
          total_entities: stats.totalEntities ?? (stats as any).total_entities ?? 0,
          totalRelations: stats.totalRelations ?? (stats as any).total_relations ?? 0,
          total_relations: stats.totalRelations ?? (stats as any).total_relations ?? 0,
          indexSizeKb: stats.indexSizeKb ?? (stats as any).index_size_kb ?? 0,
          index_size_kb: stats.indexSizeKb ?? (stats as any).index_size_kb ?? 0,
          lastHarvestTimestamp: stats.lastHarvestTimestamp || new Date().toISOString(),
          last_harvest_timestamp: stats.lastHarvestTimestamp || new Date().toISOString(),
        },
      };
      this.emit('knowledge_ready', event);
    }, this.debounceDelayMs);
  }

  /**
   * Emits knowledge_ready immediately without debouncing
   */
  public emitKnowledgeReadyNow(stats: BrainTelemetryStats): void {
    if (this.debouncedTimer) {
      clearTimeout(this.debouncedTimer);
      this.debouncedTimer = null;
    }

    const event: KnowledgeReadyEvent = {
      type: 'knowledge_ready',
      stats: {
        totalChunks: stats.totalChunks ?? (stats as any).total_chunks ?? 0,
        total_chunks: stats.totalChunks ?? (stats as any).total_chunks ?? 0,
        totalEntities: stats.totalEntities ?? (stats as any).total_entities ?? 0,
        total_entities: stats.totalEntities ?? (stats as any).total_entities ?? 0,
        totalRelations: stats.totalRelations ?? (stats as any).total_relations ?? 0,
        total_relations: stats.totalRelations ?? (stats as any).total_relations ?? 0,
        indexSizeKb: stats.indexSizeKb ?? (stats as any).index_size_kb ?? 0,
        index_size_kb: stats.indexSizeKb ?? (stats as any).index_size_kb ?? 0,
        lastHarvestTimestamp: stats.lastHarvestTimestamp || new Date().toISOString(),
        last_harvest_timestamp: stats.lastHarvestTimestamp || new Date().toISOString(),
      },
    };
    this.emit('knowledge_ready', event);
  }

  public cleanup(): void {
    if (this.debouncedTimer) {
      clearTimeout(this.debouncedTimer);
      this.debouncedTimer = null;
    }
    this.removeAllListeners();
  }
}
