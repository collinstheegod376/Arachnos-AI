/**
 * Keyword matcher for X interaction rules.
 *
 * A rule condition is a list of any-of keywords separated by " or " and/or ",".
 * Matching is case-insensitive and word-boundary aware (Unicode letters/digits/underscore
 * are treated as word characters, so keywords like "#AI" or "C++" still work).
 */

/** Strip a single pair of surrounding quotes (straight or curly) and trim. */
export function stripQuotes(value: string): string {
  let s = value.trim();
  const pairs: Array<[string, string]> = [['"', '"'], ["'", "'"], ['\u201C', '\u201D'], ['\u2018', '\u2019'], ['`', '`']];
  let changed = true;
  while (changed && s.length >= 2) {
    changed = false;
    for (const [open, close] of pairs) {
      if (s.startsWith(open) && s.endsWith(close)) {
        s = s.slice(open.length, s.length - close.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

/**
 * Split a condition string into normalized (trimmed, unquoted) keywords.
 * Quote-aware: phrases inside quotes like "local AI or web agent" are not split.
 * Delimiters like ", or", ",", or standalone "or" outside quotes are cleaned up cleanly.
 */
export function parseKeywords(condition: string): string[] {
  if (typeof condition !== 'string') return [];
  const text = condition.trim();
  if (!text) return [];

  const keywords: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let i = 0;

  // Delimiter pattern: commas optionally followed by 'or', or standalone 'or' surrounded by whitespace
  const DELIM_REGEX = /^(?:\s*,\s*(?:or\b\s*)?|\s+or\b\s*)/i;

  while (i < text.length) {
    const char = text[i];

    if (inQuote !== null) {
      // Inside quote: check for matching closing quote
      let isClosing = false;
      if (inQuote === '"' && char === '"') isClosing = true;
      else if (inQuote === '`' && char === '`') isClosing = true;
      else if (inQuote === '\u201D' && char === '\u201D') isClosing = true; // ”
      else if (inQuote === "'" && char === "'") {
        // Distinguish apostrophe in contraction inside single quote: e.g. 'can\'t'
        const isApostrophe = i > 0 && i < text.length - 1 && /\p{L}/u.test(text[i - 1]) && /\p{L}/u.test(text[i + 1]);
        if (!isApostrophe) isClosing = true;
      } else if (inQuote === '\u2019' && char === '\u2019') {
        const isApostrophe = i > 0 && i < text.length - 1 && /\p{L}/u.test(text[i - 1]) && /\p{L}/u.test(text[i + 1]);
        if (!isApostrophe) isClosing = true;
      }

      if (isClosing) {
        current += char;
        inQuote = null;
        i++;
      } else {
        current += char;
        i++;
      }
    } else {
      // Outside quote: check for opening quote
      if (char === '"' || char === '`') {
        inQuote = char;
        current += char;
        i++;
      } else if (char === '\u201C') { // “
        inQuote = '\u201D';
        current += char;
        i++;
      } else if (char === '\u2018') { // ‘
        inQuote = '\u2019';
        current += char;
        i++;
      } else if (char === "'") {
        // If preceded by a letter, treat as apostrophe (contraction) rather than open quote
        const isApostrophe = i > 0 && /\p{L}/u.test(text[i - 1]);
        if (isApostrophe) {
          current += char;
          i++;
        } else {
          inQuote = "'";
          current += char;
          i++;
        }
      } else {
        // Check if starting delimiter
        const match = text.slice(i).match(DELIM_REGEX);
        if (match && match[0].length > 0) {
          const token = stripQuotes(current);
          if (token.length > 0) keywords.push(token);
          current = '';
          i += match[0].length;
        } else {
          current += char;
          i++;
        }
      }
    }
  }

  const lastToken = stripQuotes(current);
  if (lastToken.length > 0) keywords.push(lastToken);

  return keywords;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WORD_CHAR = '[\\p{L}\\p{N}_]';

function keywordRegex(keyword: string): RegExp {
  const trimmed = keyword.trim();
  const words = trimmed.split(/\s+/);
  const escapedWords = words.map(w => {
    // Normalize straight and curly apostrophes to match either
    return escapeRegex(w).replace(/['\u2019]/g, "['\u2019]");
  });
  const body = escapedWords.join('\\s+');

  const firstChar = trimmed[0];
  const lastChar = trimmed.slice(-1);

  // Lookbehind boundary at start:
  // If keyword starts with symbol like '#' or '$', do not match if preceded by that symbol or word char
  let lookbehind: string;
  if (/^[\p{L}\p{N}_]$/u.test(firstChar)) {
    lookbehind = `(?<!${WORD_CHAR})`;
  } else {
    lookbehind = `(?<![\\p{L}\\p{N}_${escapeRegex(firstChar)}])`;
  }

  // Lookahead boundary at end:
  // If keyword ends with '+', '#' or '$', do not allow immediately following duplicate symbol or word char.
  // If keyword ends with a word character, prevent word chars, contractions ('t, 's, etc.), and C++/C# symbols (+, #).
  let lookahead: string;
  if (lastChar === '+') {
    lookahead = `(?!([\\p{L}\\p{N}_+]))`;
  } else if (lastChar === '#') {
    lookahead = `(?!([\\p{L}\\p{N}_#]))`;
  } else if (lastChar === '$') {
    lookahead = `(?!([\\p{L}\\p{N}_$]))`;
  } else if (/^[\p{L}\p{N}_]$/u.test(lastChar)) {
    lookahead = `(?!([\\p{L}\\p{N}_]|['\u2019]\\p{L}|[+#]))`;
  } else {
    lookahead = `(?!([\\p{L}\\p{N}_${escapeRegex(lastChar)}]))`;
  }

  return new RegExp(`${lookbehind}${body}${lookahead}`, 'iu');
}

/** True if any keyword in `condition` appears in `text` as a whole word/phrase. */
export function matches(condition: string, text: string): boolean {
  if (typeof text !== 'string' || !text) return false;
  return parseKeywords(condition).some(k => keywordRegex(k).test(text));
}

/** Canonical form of a condition for equality comparisons (lowercased, sorted keywords). */
export function normalizeCondition(condition: string): string {
  return parseKeywords(condition).map(k => k.toLowerCase().replace(/\s+/g, ' ')).sort().join('|');
}
