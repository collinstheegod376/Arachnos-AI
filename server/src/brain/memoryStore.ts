import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  MemoryRecord,
  MemoryTier,
  UserFeedbackType,
  BoundingBox,
  FeedbackPayload,
  TeachPayload
} from '../../../shared/types.js';

export interface MemoryStoreOptions {
  storageFile?: string;
  autoSave?: boolean;
}

export class MemoryStore {
  private records = new Map<string, MemoryRecord>();
  private readonly storageFilePath: string;
  private readonly autoSave: boolean;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(options: MemoryStoreOptions = {}) {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        // Fallback to server/data
      }
    }

    this.storageFilePath = options.storageFile || path.join(dataDir, 'arachnos_memory.json');
    this.autoSave = options.autoSave ?? true;

    this.loadFromDisk();
  }

  /**
   * Load existing memories from local disk
   */
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const list: MemoryRecord[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach(rec => {
            if (rec && rec.id) {
              this.records.set(rec.id, rec);
            }
          });
          console.log(`[MemoryStore] Loaded ${this.records.size} memories from ${this.storageFilePath}`);
        }
      }
    } catch (err: any) {
      console.warn(`[MemoryStore] Failed to load memories from disk:`, err.message);
    }
  }

  /**
   * Debounced save to disk
   */
  public saveToDisk(): void {
    if (!this.autoSave) return;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      try {
        const dir = path.dirname(this.storageFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const data = JSON.stringify(Array.from(this.records.values()), null, 2);
        fs.writeFileSync(this.storageFilePath, data, 'utf-8');
      } catch (err: any) {
        console.error(`[MemoryStore] Failed to persist memories:`, err.message);
      }
    }, 500);
  }

  /**
   * Add or update memory record from page observation / harvest
   */
  public addHarvest(
    content: string,
    sourceUrl: string,
    selector?: string,
    boundingBox?: BoundingBox,
    confidence = 0.9,
    tier: MemoryTier = 'raw_harvest',
    tags: string[] = [],
    id?: string
  ): MemoryRecord {
    // Check if an existing memory matches url and content similarity
    const existing = Array.from(this.records.values()).find(
      r => (id && r.id === id) || (r.source_url === sourceUrl && r.selector === selector && r.content.trim() === content.trim())
    );

    const now = new Date().toISOString();

    if (existing) {
      existing.visit_count = (existing.visit_count || 1) + 1;
      existing.last_accessed = now;
      if (existing.tier === 'raw_harvest' && existing.visit_count >= 3) {
        existing.tier = 'processed_fact';
      }
      this.saveToDisk();
      return existing;
    }

    const record: MemoryRecord = {
      id: id || crypto.randomUUID(),
      content: content.trim(),
      source_url: sourceUrl,
      selector: selector || 'body',
      bounding_box: boundingBox,
      confidence,
      user_feedback: 'none',
      corrected_text: null,
      tier,
      created_at: now,
      last_accessed: now,
      visit_count: 1,
      tags
    };

    this.records.set(record.id, record);
    this.saveToDisk();
    return record;
  }

  /**
   * User explicitly teaches Arachnos a fact
   */
  public teach(payload: TeachPayload): MemoryRecord {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const record: MemoryRecord = {
      id,
      content: payload.content.trim(),
      source_url: payload.page_url || 'user://explicit-teach',
      selector: payload.selector || 'user-input',
      bounding_box: payload.bounding_box,
      confidence: 1.0,
      user_feedback: 'positive',
      corrected_text: null,
      tier: 'user_reinforced',
      created_at: now,
      last_accessed: now,
      visit_count: 1,
      tags: ['taught_by_user'],
      title: payload.title || 'User Knowledge'
    };

    this.records.set(id, record);
    this.saveToDisk();
    return record;
  }

  /**
   * Apply feedback (reinforce, downweight, or correct)
   */
  public applyFeedback(payload: FeedbackPayload): MemoryRecord | null {
    const record =
      this.records.get(payload.memory_id) ||
      Array.from(this.records.values()).find(
        r => r.id === payload.memory_id || r.id.includes(payload.memory_id) || payload.memory_id.includes(r.id)
      );
    if (!record) return null;

    const now = new Date().toISOString();
    record.user_feedback = payload.feedback;
    record.last_accessed = now;

    if (payload.feedback === 'positive') {
      // Reinforce: elevate to tier 3, boost confidence
      record.tier = 'user_reinforced';
      record.confidence = Math.min(1.0, record.confidence + 0.2);
    } else if (payload.feedback === 'negative') {
      // Downweight
      record.confidence = Math.max(0.1, record.confidence * 0.4);
    } else if (payload.feedback === 'corrected' && payload.corrected_text) {
      // Correction supersedes the old memory
      record.corrected_text = payload.corrected_text;
      record.user_feedback = 'corrected';
      record.confidence = 0.2; // Deprecate the old fact

      // Create new high-priority memory representing the corrected fact
      const correctedRecord: MemoryRecord = {
        id: crypto.randomUUID(),
        content: payload.corrected_text.trim(),
        source_url: record.source_url,
        selector: record.selector,
        bounding_box: record.bounding_box,
        confidence: 1.0,
        user_feedback: 'positive',
        corrected_text: null,
        tier: 'user_reinforced',
        created_at: now,
        last_accessed: now,
        visit_count: 1,
        tags: ['user_correction'],
        title: `Correction for ${record.source_url}`
      };

      this.records.set(correctedRecord.id, correctedRecord);
    }

    this.saveToDisk();
    return record;
  }

  /**
   * Search memory with tier-based scoring and feedback weighting
   */
  public search(
    queryTokens: string[],
    limit = 6
  ): { record: MemoryRecord; score: number }[] {
    const results: { record: MemoryRecord; score: number }[] = [];
    const queryLowerTokens = queryTokens.map(t => t.toLowerCase());

    for (const record of this.records.values()) {
      // Skip heavily deprecated negative items unless nothing else exists
      const contentLower = (record.corrected_text || record.content).toLowerCase();
      let matchCount = 0;

      for (const token of queryLowerTokens) {
        if (token.length > 2 && contentLower.includes(token)) {
          matchCount++;
        }
      }

      if (matchCount === 0) continue;

      let score = matchCount / Math.max(queryLowerTokens.length, 1);

      // Memory tier weighting
      if (record.tier === 'user_reinforced') {
        score *= 2.5; // High priority for user reinforced facts
      } else if (record.tier === 'processed_fact') {
        score *= 1.3;
      }

      // Feedback modifier
      if (record.user_feedback === 'positive') {
        score *= 1.5;
      } else if (record.user_feedback === 'negative') {
        score *= 0.2;
      } else if (record.user_feedback === 'corrected') {
        score *= 0.1; // Outdated original superseded
      }

      // Confidence factor
      score *= record.confidence;

      results.push({ record, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  public get(id: string): MemoryRecord | undefined {
    return this.records.get(id);
  }

  public getAll(): MemoryRecord[] {
    return Array.from(this.records.values()).sort(
      (a, b) => new Date(b.last_accessed).getTime() - new Date(a.last_accessed).getTime()
    );
  }

  public getByTier(tier: MemoryTier): MemoryRecord[] {
    return this.getAll().filter(r => r.tier === tier);
  }

  public delete(id: string): boolean {
    const deleted = this.records.delete(id);
    if (deleted) this.saveToDisk();
    return deleted;
  }

  public clear(): void {
    this.records.clear();
    this.saveToDisk();
  }

  public getStats(): {
    total: number;
    rawHarvestCount: number;
    processedCount: number;
    userReinforcedCount: number;
    positiveCount: number;
    correctedCount: number;
  } {
    let raw = 0;
    let processed = 0;
    let reinforced = 0;
    let positive = 0;
    let corrected = 0;

    for (const r of this.records.values()) {
      if (r.tier === 'raw_harvest') raw++;
      if (r.tier === 'processed_fact') processed++;
      if (r.tier === 'user_reinforced') reinforced++;
      if (r.user_feedback === 'positive') positive++;
      if (r.user_feedback === 'corrected') corrected++;
    }

    return {
      total: this.records.size,
      rawHarvestCount: raw,
      processedCount: processed,
      userReinforcedCount: reinforced,
      positiveCount: positive,
      correctedCount: corrected
    };
  }
}
