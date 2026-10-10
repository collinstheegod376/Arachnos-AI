import { Router, Request, Response } from 'express';
import type { XRule, XSuggestion, XActionLogStatus, XAction } from '../../../shared/types.js';
import { XStore, isXAction, canonicalizePostUrl } from './xStore.js';
import { matches, normalizeCondition, parseKeywords } from './matcher.js';
import { parseNaturalCommand } from './nlParser.js';

export { canonicalizePostUrl };

const MAX_CONDITION_LEN = 500;
const MAX_COMMENT_LEN = 280;
const MAX_TEXT_LEN = 20000;

type Result<T> = { ok: true; status: number; body: T } | { ok: false; status: number; error: string };

function bad(error: string, status = 400): { ok: false; status: number; error: string } {
  return { ok: false, status, error };
}

function parseId(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// --------------------------------------------------------------------------
// Service functions (exported for tests; independent of Express)
// --------------------------------------------------------------------------

export function teachRule(store: XStore, body: any): Result<{ status: 'learned'; rule: XRule }> {
  const { action, condition, comment_text } = body || {};
  if (!isXAction(action)) return bad('action must be repost, comment, or like');
  if (!nonEmptyString(condition)) return bad('condition is required');
  if (condition.length > MAX_CONDITION_LEN) return bad(`condition must be at most ${MAX_CONDITION_LEN} characters`);
  if (parseKeywords(condition).length === 0) return bad('condition must contain at least one keyword');

  // Prevent duplicate rules: Do not create duplicate active rules with identical action and normalized condition
  const norm = normalizeCondition(condition);
  const existing = store.getRules(false).find(
    r => r.action === action && normalizeCondition(r.condition) === norm
  );
  if (existing) {
    return bad('An active rule with this action and condition already exists', 409);
  }

  let comment: string | null = null;
  if (comment_text !== undefined && comment_text !== null) {
    if (typeof comment_text !== 'string') return bad('comment_text must be a string');
    comment = comment_text.trim() || null;
  }
  if (action === 'comment' && !comment) return bad('comment_text is required for comment rules');
  if (comment && comment.length > MAX_COMMENT_LEN) return bad(`comment_text must be at most ${MAX_COMMENT_LEN} characters`);
  if (action !== 'comment') comment = null;
  const rule = store.addRule(action, condition.trim(), comment);
  return { ok: true, status: 200, body: { status: 'learned', rule } };
}

export function teachNatural(
  store: XStore,
  body: any
): Result<
  | { status: 'learned'; rule: XRule }
  | { status: 'disabled'; disabled_ids: number[] }
  | { status: 'list'; rules: XRule[] }
> {
  const text = body?.text;
  if (!nonEmptyString(text)) return bad('text is required');
  if (text.length > MAX_TEXT_LEN) return bad('text is too long');
  const parsed = parseNaturalCommand(text);
  switch (parsed.kind) {
    case 'error':
      return bad(parsed.error);
    case 'list':
      return { ok: true, status: 200, body: { status: 'list', rules: store.getRules(false) } };
    case 'teach':
      return teachRule(store, parsed);
    case 'disable': {
      const target = normalizeCondition(parsed.condition);
      const targetKeywords = new Set(parseKeywords(parsed.condition).map(k => k.toLowerCase()));
      const candidates = store.getRules(false).filter(r => parsed.action === null || r.action === parsed.action);
      let hits = candidates.filter(r => normalizeCondition(r.condition) === target);
      if (hits.length === 0) {
        hits = candidates.filter(r => parseKeywords(r.condition).some(k => targetKeywords.has(k.toLowerCase())));
      }
      if (hits.length === 0) {
        return bad(`No enabled ${parsed.action ?? ''} rule matches "${parsed.condition}"`.replace(/\s+/g, ' '));
      }
      for (const r of hits) store.setEnabled(r.id, false);
      return { ok: true, status: 200, body: { status: 'disabled', disabled_ids: hits.map(r => r.id) } };
    }
  }
}

export function suggest(store: XStore, body: any): Result<{ suggestions: XSuggestion[] }> {
  const { text, url, author } = body || {};
  if (typeof text !== 'string') return bad('text is required');
  if (!nonEmptyString(url)) return bad('url is required');
  if (author !== undefined && author !== null && typeof author !== 'string') return bad('author must be a string');
  const postUrl = canonicalizePostUrl(url);
  const suggestions: XSuggestion[] = [];
  const seenActions = new Set<XAction>();

  for (const r of store.getRules(false)) {
    // If multiple rules match the same post with the same action (e.g. 2 repost rules), only yield one suggestion
    if (seenActions.has(r.action)) continue;
    if (!matches(r.condition, text)) continue;

    // Cross-rule deduplication: If a post is already confirmed or ignored for this action under any rule, do not suggest
    if (store.isActionHandled(postUrl, r.action)) continue;

    seenActions.add(r.action);
    suggestions.push({
      rule_id: r.id,
      action: r.action,
      comment_text: r.comment_text,
      condition: r.condition,
      post_url: postUrl,
      author: nonEmptyString(author) ? author.trim() : null,
      text_preview: text.trim().slice(0, 200),
    });
  }
  return { ok: true, status: 200, body: { suggestions } };
}

export function logDecision(
  store: XStore,
  body: any,
  status: 'confirmed' | 'ignored'
): Result<{ status: 'confirmed' | 'ignored'; log_id: number }> {
  const ruleId = parseId(body?.rule_id);
  const { post_url, action } = body || {};
  if (ruleId === null) return bad('rule_id must be a positive integer');
  if (!nonEmptyString(post_url)) return bad('post_url is required');
  if (!isXAction(action)) return bad('action must be repost, comment, or like');
  if (!store.getRule(ruleId)) return bad(`rule ${ruleId} not found`, 404);
  const canonicalUrl = canonicalizePostUrl(post_url);
  const entry = store.addLog(ruleId, canonicalUrl, action, status);
  return { ok: true, status: 200, body: { status, log_id: entry.id } };
}

export function report(store: XStore, body: any): Result<{ status: 'updated' }> {
  const logId = parseId(body?.log_id);
  const status = body?.status as XActionLogStatus;
  if (logId === null) return bad('log_id must be a positive integer');
  if (status !== 'success' && status !== 'failed') return bad("status must be 'success' or 'failed'");
  let error: string | null = null;
  if (body?.error !== undefined && body?.error !== null) {
    if (typeof body.error !== 'string') return bad('error must be a string');
    error = body.error.slice(0, 2000) || null;
  }
  if (!store.updateLog(logId, status, status === 'failed' ? error : null)) return bad(`log ${logId} not found`, 404);
  return { ok: true, status: 200, body: { status: 'updated' } };
}

// --------------------------------------------------------------------------
// Express router
// --------------------------------------------------------------------------

function send<T>(res: Response, result: Result<T>): void {
  if (result.ok) res.status(result.status).json(result.body);
  else res.status(result.status).json({ error: result.error });
}

function wrap(handler: (req: Request, res: Response) => void) {
  return (req: Request, res: Response) => {
    try {
      handler(req, res);
    } catch (err: any) {
      console.error('[XInteraction] Handler error:', err?.message || err);
      res.status(500).json({ error: err?.message || 'Internal error' });
    }
  };
}

export function createXRouter(store: XStore = new XStore()): Router {
  const router = Router();

  router.post('/x/teach', wrap((req, res) => send(res, teachRule(store, req.body))));
  router.post('/x/teach/natural', wrap((req, res) => send(res, teachNatural(store, req.body))));

  router.get('/x/rules', wrap((req, res) => {
    const all = String(req.query.all ?? '').toLowerCase();
    res.json(store.getRules(all === '1' || all === 'true'));
  }));

  router.post('/x/suggest', wrap((req, res) => send(res, suggest(store, req.body))));
  router.post('/x/confirm', wrap((req, res) => send(res, logDecision(store, req.body, 'confirmed'))));
  router.post('/x/ignore', wrap((req, res) => send(res, logDecision(store, req.body, 'ignored'))));
  router.post('/x/report', wrap((req, res) => send(res, report(store, req.body))));

  router.post('/x/disable/:id', wrap((req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: 'id must be a positive integer' }); return; }
    if (!store.setEnabled(id, false)) { res.status(404).json({ error: `rule ${id} not found` }); return; }
    res.json({ status: 'disabled' });
  }));

  router.post('/x/enable/:id', wrap((req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: 'id must be a positive integer' }); return; }
    if (!store.setEnabled(id, true)) { res.status(404).json({ error: `rule ${id} not found` }); return; }
    res.json({ status: 'enabled' });
  }));

  router.delete('/x/rules/:id', wrap((req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: 'id must be a positive integer' }); return; }
    if (!store.deleteRule(id)) { res.status(404).json({ error: `rule ${id} not found` }); return; }
    res.json({ status: 'deleted' });
  }));

  router.get('/x/log', wrap((req, res) => {
    let limit = 50;
    if (req.query.limit !== undefined) {
      const n = parseId(String(req.query.limit));
      if (n === null) { res.status(400).json({ error: 'limit must be a positive integer' }); return; }
      limit = Math.min(n, 1000);
    }
    res.json(store.getLog(limit));
  }));

  return router;
}
