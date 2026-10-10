import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
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
  private exitHooksRegistered = false;

  constructor(options: MemoryStoreOptions = {}) {
    const root = this.resolveProjectRoot();
    const rootDataPath = path.join(root, 'data', 'arachnos_memory.json');
    const serverDataPath = path.join(root, 'server', 'data', 'arachnos_memory.json');

    if (options.storageFile) {
      this.storageFilePath = options.storageFile;
    } else {
      const rootCount = this.countFileRecords(rootDataPath);
      const serverCount = this.countFileRecords(serverDataPath);

      // Consistently resolve to real data folder, preferring the one with data
      if (serverCount > 0 && rootCount === 0) {
        this.storageFilePath = rootDataPath;
      } else {
        this.storageFilePath = rootDataPath;
      }
    }

    const dataDir = path.dirname(this.storageFilePath);
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        // Directory may already exist
      }
    }

    this.autoSave = options.autoSave ?? true;

    this.loadFromDisk();
    this.registerExitHooks();
  }

  private resolveProjectRoot(): string {
    let curr = process.cwd();
    for (let i = 0; i < 4; i++) {
      if (fs.existsSync(path.join(curr, 'server')) && fs.existsSync(path.join(curr, 'shared'))) {
        return curr;
      }
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
    try {
      const fromMeta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
      if (fs.existsSync(path.join(fromMeta, 'server')) && fs.existsSync(path.join(fromMeta, 'shared'))) {
        return fromMeta;
      }
    } catch {}
    return process.cwd();
  }

  private countFileRecords(filePath: string): number {
    try {
      if (!fs.existsSync(filePath)) return 0;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Load existing memories from local disk without split-brain
   */
  private loadFromDisk(): void {
    const root = this.resolveProjectRoot();
    const candidatePaths = [
      this.storageFilePath,
      path.join(root, 'data', 'arachnos_memory.json'),
      path.join(root, 'server', 'data', 'arachnos_memory.json'),
    ];

    const uniquePaths = Array.from(new Set(candidatePaths.map(p => path.resolve(p))));

    for (const filePath of uniquePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const list: MemoryRecord[] = JSON.parse(raw);
          if (Array.isArray(list)) {
            list.forEach(rec => {
              if (rec && rec.id) {
                const existing = this.records.get(rec.id);
                if (!existing) {
                  this.records.set(rec.id, rec);
                } else {
                  // Merge without split-brain: prefer newer or updated record
                  const existingTime = new Date(existing.last_accessed || existing.created_at || 0).getTime();
                  const recTime = new Date(rec.last_accessed || rec.created_at || 0).getTime();
                  if (recTime > existingTime) {
                    this.records.set(rec.id, { ...existing, ...rec });
                  }
                }
              }
            });
            console.log(`[MemoryStore] Loaded memories from ${filePath} (total records: ${this.records.size})`);
          }
        }
      } catch (err: any) {
        console.warn(`[MemoryStore] Failed to load memories from ${filePath}:`, err.message);
      }
    }

    // If records were loaded from secondary location into canonical file, flushSync immediately to migrate
    const currentCanonicalCount = this.countFileRecords(this.storageFilePath);
    if (this.records.size > currentCanonicalCount) {
      this.flushSync();
    }
  }

  /**
   * Atomically save file to disk using temporary file and rename with Windows fallback
   */
  private saveFileAtomic(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }

    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      fs.writeFileSync(tmpPath, content, 'utf-8');
      try {
        fs.renameSync(tmpPath, filePath);
      } catch (renameErr: any) {
        // Handle Windows EPERM, EBUSY, EACCES, EXDEV
        if (['EPERM', 'EBUSY', 'EACCES', 'EXDEV'].includes(renameErr?.code)) {
          try {
            fs.copyFileSync(tmpPath, filePath);
            try { fs.unlinkSync(tmpPath); } catch {}
          } catch {
            fs.writeFileSync(filePath, content, 'utf-8');
            try { fs.unlinkSync(tmpPath); } catch {}
          }
        } else {
          fs.writeFileSync(filePath, content, 'utf-8');
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      }
    } catch (err: any) {
      console.error(`[MemoryStore] Failed to persist memories atomically:`, err.message);
      try {
        fs.writeFileSync(filePath, content, 'utf-8');
      } catch (fallbackErr: any) {
        console.error(`[MemoryStore] Direct write fallback failed:`, fallbackErr.message);
      }
    } finally {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
    }
  }

  /**
   * Synchronously flush pending saves to disk immediately using atomic save
   */
  public flushSync(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    try {
      const data = JSON.stringify(Array.from(this.records.values()), null, 2);
      this.saveFileAtomic(this.storageFilePath, data);
    } catch (err: any) {
      console.error(`[MemoryStore] Failed to flushSync memories:`, err.message);
    }
  }

  /**
   * Register process exit hooks to flush pending writes before exit
   */
  private registerExitHooks(): void {
    if (this.exitHooksRegistered) return;
    this.exitHooksRegistered = true;

    const onExit = () => {
      try {
        this.flushSync();
      } catch {}
    };

    process.on('beforeExit', onExit);
    process.on('SIGINT', () => {
      onExit();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      onExit();
      process.exit(0);
    });
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
      this.flushSync();
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
      r => (id && r.id === id && r.source_url === sourceUrl) || (r.source_url === sourceUrl && r.selector === selector && r.content.trim() === content.trim())
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
    // Exact ID matching instead of loose substring matching
    const record =
      this.records.get(payload.memory_id) ||
      Array.from(this.records.values()).find(r => r.id === payload.memory_id);
    if (!record) return null;

    const now = new Date().toISOString();
    record.user_feedback = payload.feedback;
    record.last_accessed = now;

    if (payload.feedback === 'positive') {
      // Reinforce: elevate to tier 3, boost confidence
      record.tier = 'user_reinforced';
      record.confidence = Math.min(1.0, record.confidence + 0.2);
    } else if (payload.feedback === 'negative') {
      // Downweight and demote tier so discredited facts don't rank #1
      record.tier = 'raw_harvest';
      record.confidence = Math.max(0.1, record.confidence * 0.4);
    } else if (payload.feedback === 'corrected' && payload.corrected_text) {
      // Correction supersedes the old memory
      (record as any).superseded = true;
      record.corrected_text = payload.corrected_text;
      record.user_feedback = 'corrected';
      record.confidence = 0.0; // Deprecate the old fact

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

      (record as any).new_memory_id = correctedRecord.id;
      this.records.set(correctedRecord.id, correctedRecord);
      this.saveToDisk();
      return correctedRecord;
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
      // Skip superseded or corrected original records so they don't produce duplicate citations
      if ((record as any).superseded || record.user_feedback === 'corrected') {
        continue;
      }

      const contentLower = (record.corrected_text || record.content).toLowerCase();
      let matchCount = 0;

      for (const token of queryLowerTokens) {
        if (!token) continue;
        // Allow short keyword searches (e.g. 'AI', 'UI', 'ML')
        if (token.length >= 2) {
          if (token.length === 2) {
            const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const boundaryRegex = new RegExp(`\\b${escaped}\\b`, 'i');
            if (boundaryRegex.test(contentLower) || contentLower.includes(token)) {
              matchCount++;
            }
          } else if (contentLower.includes(token)) {
            matchCount++;
          }
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

  public getRecords(): MemoryRecord[] {
    return Array.from(this.records.values());
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
