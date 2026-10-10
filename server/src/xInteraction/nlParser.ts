/**
 * Rule-based natural-language parser for teaching X interaction rules.
 * No LLM required. Supported phrasings (case-insensitive):
 *
 *  - "Repost (posts|anything) (about|mentioning|that mention|containing) X"
 *  - "Like (posts|anything) (about|mentioning|that mention|containing) X"
 *  - "When (someone|a post) mentions X, reply with: TEXT"
 *  - "Reply TEXT to posts about X"
 *  - "Stop (reposting|liking|replying to) X posts" / "Stop ... posts about X"
 *  - "Show (me) (the) rules (you learned)"
 */
import type { XAction } from '../../../shared/types.js';
import { stripQuotes } from './matcher.js';

export type ParsedCommand =
  | { kind: 'teach'; action: XAction; condition: string; comment_text: string | null }
  | { kind: 'disable'; action: XAction | null; condition: string }
  | { kind: 'list' }
  | { kind: 'error'; error: string };

const SUBJECT = '(?:posts?|tweets?|anything|everything|stuff)';
const PREP = '(?:about|mentioning|that\\s+mentions?|which\\s+mentions?|containing|that\\s+contains?|with|on|regarding)';

function cleanCondition(raw: string): string {
  return stripQuotes(raw.replace(/[\s.!?;:]+$/u, '').trim());
}

function cleanText(raw: string): string {
  return stripQuotes(raw.trim());
}

function verbToAction(verb: string): XAction | null {
  const v = verb.toLowerCase();
  if (/^(repost|retweet)/.test(v)) return 'repost';
  if (/^lik/.test(v)) return 'like';
  if (/^(repl|comment|respond)/.test(v)) return 'comment';
  return null;
}

export function parseNaturalCommand(input: string): ParsedCommand {
  if (typeof input !== 'string' || !input.trim()) {
    return { kind: 'error', error: 'Missing "text"' };
  }
  const text = input.trim().replace(/\s+/g, ' ');

  // ---- List rules
  if (/^(?:please\s+)?(?:show|list|display|what\s+are)(?:\s+me)?(?:\s+(?:the|my|all|all\s+the|your))?\s+(?:x\s+)?rules\b/i.test(text)) {
    return { kind: 'list' };
  }

  // ---- Stop / disable
  {
    const m = text.match(
      /^(?:please\s+)?(?:stop|don'?t|do\s+not|never|disable)\s+(?:all\s+)?(?:(reposting|retweeting|repost|retweet|liking|like|replying(?:\s+to)?|reply(?:\s+to)?|commenting(?:\s+on)?|comment(?:\s+on)?|responding(?:\s+to)?)\s+)?(.+)$/i
    );
    if (m) {
      const action = m[1] ? verbToAction(m[1]) : null;
      let rest = m[2].replace(/[\s.!?]+$/u, '').trim();
      let condition = '';
      const about = rest.match(new RegExp(`^(?:(?:${SUBJECT}|rules?)\\s+)?${PREP}\\s+(.+)$`, 'i'));
      if (about) {
        condition = about[1];
      } else {
        const trailing = rest.match(new RegExp(`^(.+?)\\s+(?:${SUBJECT}|rules?)$`, 'i'));
        condition = trailing ? trailing[1] : rest;
      }
      condition = cleanCondition(condition);
      if (!condition) return { kind: 'error', error: 'Could not determine which topic to stop' };
      return { kind: 'disable', action, condition };
    }
  }

  // ---- "When someone mentions X..." (reply, repost, or like)
  {
    const whenMatch = text.match(
      /^(?:when(?:ever)?|if)\s+(?:someone|somebody|anyone|a\s+post|a\s+tweet|people|posts?|tweets?)\s+(?:mentions?|talks?\s+about|is\s+about|are\s+about|says?|contains?)\s+(.+)$/i
    );
    if (whenMatch) {
      const rest = whenMatch[1].trim();

      // Check for repost / like actions (e.g. "... repost", "... like it")
      const actionEndMatch = rest.match(
        /^(.*?)\s*,?\s*(?:then\s+)?(repost|retweet|like)(?:\s+(?:it|the\s+post|the\s+tweet|them))?[\s.!?]*$/i
      );
      if (actionEndMatch && actionEndMatch[1].trim()) {
        const condition = cleanCondition(actionEndMatch[1]);
        const action = verbToAction(actionEndMatch[2])!;
        if (!condition) return { kind: 'error', error: 'Could not determine the topic to match' };
        return { kind: 'teach', action, condition, comment_text: null };
      }

      // Check for comment / reply actions, avoiding early collision with "comment" or "reply" inside condition
      const replyMatch =
        rest.match(/^(.*?)\s*,\s*(?:then\s+)?(?:reply|comment|respond)(?:\s+(?:with|saying))?\s*:?\s*(.+)$/i) ||
        rest.match(/^(.*?)\s+then\s+(?:reply|comment|respond)(?:\s+(?:with|saying))?\s*:?\s*(.+)$/i) ||
        rest.match(/^(.*?)\s+(?:reply|comment|respond)(?:\s+(?:with|saying)|\s*:)\s*:?\s*(.+)$/i) ||
        rest.match(/^(.*?)\s+(?:reply|comment|respond)\s*:?\s*(.+)$/i);

      if (replyMatch && replyMatch[1].trim()) {
        const condition = cleanCondition(replyMatch[1]);
        const comment = cleanText(replyMatch[2]);
        if (!condition) return { kind: 'error', error: 'Could not determine the topic to match' };
        if (!comment) return { kind: 'error', error: 'Reply text is empty' };
        return { kind: 'teach', action: 'comment', condition, comment_text: comment };
      }
    }
  }

  // ---- "Reply TEXT to posts about X"
  {
    const replyPrefixMatch = text.match(/^(?:reply|comment|respond)(?:\s+(?:with|saying))?\s*:?\s*(.+)$/i);
    if (replyPrefixMatch) {
      const rest = replyPrefixMatch[1].trim();

      // Handle quoted reply text (preserves prepositions inside quotes)
      let comment: string | null = null;
      let remainderAfterComment = '';

      const quotePairs: Array<[string, string]> = [
        ['"', '"'],
        ["'", "'"],
        ['\u201C', '\u201D'],
        ['\u2018', '\u2019'],
        ['`', '`'],
      ];

      for (const [open, close] of quotePairs) {
        if (rest.startsWith(open)) {
          let closeIdx = -1;
          for (let idx = 1; idx < rest.length; idx++) {
            if (rest[idx] === close) {
              if (
                (close === "'" || close === '\u2019') &&
                idx < rest.length - 1 &&
                /\p{L}/u.test(rest[idx - 1]) &&
                /\p{L}/u.test(rest[idx + 1])
              ) {
                continue;
              }
              closeIdx = idx;
              break;
            }
          }
          if (closeIdx !== -1) {
            comment = rest.slice(open.length, closeIdx);
            remainderAfterComment = rest.slice(closeIdx + close.length).trim();
            break;
          }
        }
      }

      if (comment !== null && remainderAfterComment) {
        const toMatch = remainderAfterComment.match(
          new RegExp(`^(?:to|on|under)\\s+(?:${SUBJECT}\\s+)?(?:${PREP}\\s+)?(.+)$`, 'i')
        );
        if (toMatch) {
          const condition = cleanCondition(toMatch[1]);
          const cleanedComment = cleanText(comment);
          if (!condition) return { kind: 'error', error: 'Could not determine the topic to match' };
          if (!cleanedComment) return { kind: 'error', error: 'Reply text is empty' };
          return { kind: 'teach', action: 'comment', condition, comment_text: cleanedComment };
        }
      }

      // Handle unquoted reply text - greedily match the preposition clause from the right
      const unquotedMatch = rest.match(
        new RegExp(`^(.+)\\s+(?:to|on|under)\\s+(?:${SUBJECT}\\s+)?${PREP}\\s+(.+)$`, 'i')
      );
      if (unquotedMatch) {
        const cleanedComment = cleanText(unquotedMatch[1]);
        const condition = cleanCondition(unquotedMatch[2]);
        if (!condition) return { kind: 'error', error: 'Could not determine the topic to match' };
        if (!cleanedComment) return { kind: 'error', error: 'Reply text is empty' };
        return { kind: 'teach', action: 'comment', condition, comment_text: cleanedComment };
      }
    }
  }

  // ---- "Repost/Like posts about X" or direct noun phrase "Repost AI posts", "Like crypto tweets"
  {
    const m =
      text.match(new RegExp(`^(?:please\\s+)?(?:always\\s+)?(repost|retweet|like)\\s+(?:${SUBJECT}\\s+)?${PREP}\\s+(.+)$`, 'i')) ||
      text.match(new RegExp(`^(?:please\\s+)?(?:always\\s+)?(repost|retweet|like)\\s+(.+?)\\s+${SUBJECT}$`, 'i'));
    if (m) {
      const action = verbToAction(m[1])!;
      const condition = cleanCondition(m[2]);
      if (!condition) return { kind: 'error', error: 'Could not determine the topic to match' };
      return { kind: 'teach', action, condition, comment_text: null };
    }
  }

  return {
    kind: 'error',
    error:
      'Sorry, I did not understand. Try: "Repost posts about local AI", "Like posts about Arachnos", ' +
      '"When someone mentions Arachnos, reply with: Thanks!", "Stop reposting local AI posts", or "Show me the rules".',
  };
}
