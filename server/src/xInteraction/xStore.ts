import fs from 'node:fs';
import path from 'node:path';
import type { XAction, XRule, XActionLog, XActionLogStatus } from '../../../shared/types.js';
import { normalizeCondition } from './matcher.js';

export const X_ACTIONS: readonly XAction[] = ['repost', 'comment', 'like'] as const;

export function isXAction(value: unknown): value is XAction {
  return typeof value === 'string' && (X_ACTIONS as readonly string[]).includes(value);
}

/**
 * Canonicalize an X (Twitter) post URL:
 * - Ensures https scheme
 * - Normalizes twitter.com, www.twitter.com, mobile.twitter.com, www.x.com to x.com
 * - Strips query parameters and URL hash fragments
 * - Strips trailing slashes
 */
export function canonicalizePostUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    let host = parsed.hostname.toLowerCase();
    if (/^(?:(?:www|mobile)\.)?(?:twitter|x)\.com$/i.test(host)) {
      host = 'x.com';
    }
    const pathname = parsed.pathname.replace(/\/+/g, '/').replace(/\/+$/, '');
    return `https://${host}${pathname}`;
  } catch {
    let cleaned = trimmed.split(/[?#]/)[0].replace(/\/+$/, '');
    cleaned = cleaned.replace(/^https?:\/\/(?:(?:www|mobile)\.)?(?:twitter|x)\.com/i, 'https://x.com');
    return cleaned;
  }
}

interface XStoreData {
  next_rule_id: number;
  next_log_id: number;
  rules: XRule[];
  action_log: XActionLog[];
}

export interface XStoreOptions {
  /** Absolute path to the JSON data file. Defaults to `<cwd>/data/x_interaction.json` (same convention as MemoryStore). */
  storageFile?: string;
}

/**
 * Persistent store for X (Twitter) interaction rules and the action log.
 * Data is kept in memory and flushed to disk atomically (temp file + rename) on every mutation.
 */
export class XStore {
  readonly storageFilePath: string;
  private data: XStoreData = { next_rule_id: 1, next_log_id: 1, rules: [], action_log: [] };

  constructor(options: XStoreOptions = {}) {
    const dataDir = path.resolve(process.cwd(), 'data');
    this.storageFilePath = options.storageFile || path.join(dataDir, 'x_interaction.json');
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.storageFilePath)) return;
      const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
      if (!raw.trim()) return;
      try {
        const parsed = JSON.parse(raw) as Partial<XStoreData>;
        const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
        const log = Array.isArray(parsed.action_log) ? parsed.action_log : [];
        const maxRule = rules.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
        const maxLog = log.reduce((m, l) => Math.max(m, Number(l.id) || 0), 0);
        this.data = {
          rules,
          action_log: log,
          next_rule_id: Math.max(Number(parsed.next_rule_id) || 1, maxRule + 1),
          next_log_id: Math.max(Number(parsed.next_log_id) || 1, maxLog + 1),
        };
      } catch (parseErr: any) {
        // Safe backup of corrupted file
        const backupPath = `${this.storageFilePath}.corrupted.${Date.now()}`;
        try {
          fs.copyFileSync(this.storageFilePath, backupPath);
          console.warn(`[XStore] Corrupted storage file backed up to: ${backupPath}`);
        } catch (copyErr) {
          console.error(`[XStore] Failed to backup corrupted storage file:`, copyErr);
        }
        console.error(`[XStore] Failed to parse ${this.storageFilePath}:`, parseErr?.message || parseErr);
        this.data = { next_rule_id: 1, next_log_id: 1, rules: [], action_log: [] };
      }
    } catch (err: any) {
      console.error(`[XStore] Failed to load ${this.storageFilePath}:`, err?.message || err);
    }
  }

  private save(): void {
    const dir = path.dirname(this.storageFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const random = Math.random().toString(36).slice(2, 8);
    const tmp = `${this.storageFilePath}.${process.pid}-${Date.now()}-${random}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
    try {
      fs.renameSync(tmp, this.storageFilePath);
    } catch (err) {
      // Windows can transiently fail rename over an open file; fall back to direct write.
      try {
        fs.copyFileSync(tmp, this.storageFilePath);
        fs.unlinkSync(tmp);
      } catch {
        try {
          fs.writeFileSync(this.storageFilePath, JSON.stringify(this.data, null, 2), 'utf-8');
        } finally {
          try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        }
      }
    }
  }

  // ---------------------------------------------------------------- Rules

  addRule(action: XAction, condition: string, commentText: string | null): XRule {
    const norm = normalizeCondition(condition);
    const existing = this.data.rules.find(
      r => r.enabled && r.action === action && normalizeCondition(r.condition) === norm
    );
    if (existing) {
      if (commentText !== null) existing.comment_text = commentText;
      return { ...existing };
    }

    const rule: XRule = {
      id: this.data.next_rule_id++,
      platform: 'x',
      action,
      condition,
      comment_text: commentText,
      enabled: true,
      created_at: new Date().toISOString(),
    };
    this.data.rules.push(rule);
    this.save();
    return rule;
  }

  getRules(includeDisabled = false): XRule[] {
    return this.data.rules.filter(r => includeDisabled || r.enabled).map(r => ({ ...r }));
  }

  getRule(id: number): XRule | undefined {
    const r = this.data.rules.find(x => x.id === id);
    return r ? { ...r } : undefined;
  }

  setEnabled(id: number, enabled: boolean): boolean {
    const r = this.data.rules.find(x => x.id === id);
    if (!r) return false;
    r.enabled = enabled;
    this.save();
    return true;
  }

  deleteRule(id: number): boolean {
    const before = this.data.rules.length;
    this.data.rules = this.data.rules.filter(r => r.id !== id);
    if (this.data.rules.length === before) return false;
    this.save();
    return true;
  }

  // ---------------------------------------------------------------- Action log

  addLog(ruleId: number, postUrl: string, action: XAction, status: XActionLogStatus): XActionLog {
    const canonicalUrl = canonicalizePostUrl(postUrl);
    const now = new Date().toISOString();
    const entry: XActionLog = {
      id: this.data.next_log_id++,
      rule_id: ruleId,
      post_url: canonicalUrl,
      action,
      status,
      error: null,
      created_at: now,
      updated_at: now,
    };
    this.data.action_log.push(entry);
    this.save();
    return entry;
  }

  updateLog(id: number, status: XActionLogStatus, error: string | null): boolean {
    const entry = this.data.action_log.find(l => l.id === id);
    if (!entry) return false;
    entry.status = status;
    entry.error = error;
    entry.updated_at = new Date().toISOString();
    this.save();
    return true;
  }

  hasLog(ruleId: number, postUrl: string): boolean {
    const norm = canonicalizePostUrl(postUrl);
    return this.data.action_log.some(
      l => l.rule_id === ruleId && canonicalizePostUrl(l.post_url) === norm && l.status !== 'failed'
    );
  }

  /**
   * Check if an action for a post URL has already been handled across any rule
   * (status is confirmed, ignored, or success). If status is failed, returns false
   * so the action is not permanently locked out.
   */
  isActionHandled(postUrl: string, action: XAction): boolean {
    const norm = canonicalizePostUrl(postUrl);
    return this.data.action_log.some(
      l => canonicalizePostUrl(l.post_url) === norm && l.action === action && l.status !== 'failed'
    );
  }

  /** Newest first. */
  getLog(limit = 50): XActionLog[] {
    return [...this.data.action_log]
      .sort((a, b) => b.id - a.id)
      .slice(0, Math.max(0, limit))
      .map(l => ({ ...l }));
  }
}
