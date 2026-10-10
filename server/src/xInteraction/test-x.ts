import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { matches, parseKeywords } from './matcher.js';
import { parseNaturalCommand } from './nlParser.js';
import { XStore, canonicalizePostUrl } from './xStore.js';
import { suggest, teachRule } from './router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🧪 Running X Interaction Module Test Suite...\n');

  // 1. Test Matcher
  console.log('1️⃣ Testing Keyword Matcher...');
  if (!matches('local AI', 'Building local AI with Arachnos is awesome')) throw new Error('Failed to match substring');
  if (!matches('AI or machine learning', 'We love machine learning!')) throw new Error('Failed to match multi-keyword "or"');
  if (!matches('LLM, neural', 'Fine-tuning a custom LLM')) throw new Error('Failed to match comma-separated keyword');
  if (matches('AI', 'This is an email client')) throw new Error('Matched substring inside word (word boundary violation)');

  // 1.1 Quote-aware keyword splitting & delimiter cleanup
  const kwQuotes = parseKeywords('"local AI or web agent", crypto');
  if (kwQuotes.length !== 2 || kwQuotes[0] !== 'local AI or web agent' || kwQuotes[1] !== 'crypto') {
    throw new Error(`Failed quote-aware splitting: ${JSON.stringify(kwQuotes)}`);
  }
  const kwCommaOr = parseKeywords('apple, or banana');
  if (kwCommaOr.length !== 2 || kwCommaOr[0] !== 'apple' || kwCommaOr[1] !== 'banana') {
    throw new Error(`Failed delimiter cleanup 'apple, or banana': ${JSON.stringify(kwCommaOr)}`);
  }
  const kwCommaOrNoSpace = parseKeywords('apple,or banana');
  if (kwCommaOrNoSpace.length !== 2 || kwCommaOrNoSpace[0] !== 'apple' || kwCommaOrNoSpace[1] !== 'banana') {
    throw new Error(`Failed delimiter cleanup 'apple,or banana': ${JSON.stringify(kwCommaOrNoSpace)}`);
  }

  // 1.2 Symbols and Contractions word boundaries
  // Contractions
  if (matches('can', "I can't do this")) throw new Error("False positive: 'can' matched 'can\\'t'");
  if (!matches("can't", "I can't do this")) throw new Error("Failed to match contraction 'can\\'t'");
  if (!matches("can't", "I can’t do this")) throw new Error("Failed to match contraction with curly quote 'can’t'");
  if (matches('it', "It's awesome")) throw new Error("False positive: 'it' matched 'it\\'s'");
  if (!matches("it's", "It's awesome")) throw new Error("Failed to match contraction 'it\\'s'");
  if (!matches("it's", "It’s awesome")) throw new Error("Failed to match contraction with curly quote 'it’s'");

  // Symbols (C++, C#, #AI, $TSLA)
  if (matches('C', 'I love C++')) throw new Error("False positive: 'C' matched 'C++'");
  if (matches('C', 'I love C#')) throw new Error("False positive: 'C' matched 'C#'");
  if (!matches('C', 'I love C programming')) throw new Error("Failed to match 'C' in whole word");
  if (!matches('C++', 'I love C++')) throw new Error("Failed to match 'C++'");
  if (matches('C++', 'I love C+++')) throw new Error("False positive: 'C++' matched 'C+++'");
  if (!matches('#AI', 'I love #AI')) throw new Error("Failed to match '#AI'");
  if (matches('#AI', 'I love ##AI')) throw new Error("False positive: '#AI' matched '##AI'");
  if (matches('#AI', 'I love #AI_tools')) throw new Error("False positive: '#AI' matched '#AI_tools'");
  if (!matches('$TSLA', 'Buy $TSLA now')) throw new Error("Failed to match '$TSLA'");
  if (matches('$TSLA', 'Buy $$TSLA')) throw new Error("False positive: '$TSLA' matched '$$TSLA'");
  if (matches('$TSLA', 'Buy $TSLAQ')) throw new Error("False positive: '$TSLA' matched '$TSLAQ'");
  console.log('   ✓ Matcher tests passed!');

  // 2. Test NL Parser
  console.log('\n2️⃣ Testing Natural Language Command Parser...');
  const p1 = parseNaturalCommand('Repost posts about local AI');
  if (p1.kind !== 'teach' || p1.action !== 'repost' || p1.condition !== 'local AI') {
    throw new Error(`Failed parse 1: ${JSON.stringify(p1)}`);
  }

  const p2 = parseNaturalCommand('When someone mentions Arachnos, reply with: Thanks for checking it out!');
  if (p2.kind !== 'teach' || p2.action !== 'comment' || p2.comment_text !== 'Thanks for checking it out!') {
    throw new Error(`Failed parse 2: ${JSON.stringify(p2)}`);
  }

  const p3 = parseNaturalCommand('Stop reposting crypto posts');
  if (p3.kind !== 'disable' || p3.action !== 'repost' || !p3.condition.includes('crypto')) {
    throw new Error(`Failed parse 3: ${JSON.stringify(p3)}`);
  }

  const p4 = parseNaturalCommand('Show me the rules you learned');
  if (p4.kind !== 'list') {
    throw new Error(`Failed parse 4: ${JSON.stringify(p4)}`);
  }

  // 2.1 Action verb collision in Pattern 3
  const pCollision1 = parseNaturalCommand('When someone mentions no comment, reply with: Haha');
  if (pCollision1.kind !== 'teach' || pCollision1.action !== 'comment' || pCollision1.condition !== 'no comment' || pCollision1.comment_text !== 'Haha') {
    throw new Error(`Failed parse verb collision 1: ${JSON.stringify(pCollision1)}`);
  }
  const pCollision2 = parseNaturalCommand('When someone mentions a quick reply, reply with: Thanks');
  if (pCollision2.kind !== 'teach' || pCollision2.action !== 'comment' || pCollision2.condition !== 'a quick reply' || pCollision2.comment_text !== 'Thanks') {
    throw new Error(`Failed parse verb collision 2: ${JSON.stringify(pCollision2)}`);
  }

  // 2.2 Comment truncation with prepositions in Pattern 4
  const pTrunc = parseNaturalCommand('Reply "say hello to posts about AI" to posts about AI');
  if (pTrunc.kind !== 'teach' || pTrunc.action !== 'comment' || pTrunc.condition !== 'AI' || pTrunc.comment_text !== 'say hello to posts about AI') {
    throw new Error(`Failed parse comment truncation: ${JSON.stringify(pTrunc)}`);
  }

  // 2.3 Direct noun phrases in Pattern 5
  const pNoun1 = parseNaturalCommand('Repost AI posts');
  if (pNoun1.kind !== 'teach' || pNoun1.action !== 'repost' || pNoun1.condition !== 'AI') {
    throw new Error(`Failed parse direct noun phrase 1: ${JSON.stringify(pNoun1)}`);
  }
  const pNoun2 = parseNaturalCommand('Like crypto tweets');
  if (pNoun2.kind !== 'teach' || pNoun2.action !== 'like' || pNoun2.condition !== 'crypto') {
    throw new Error(`Failed parse direct noun phrase 2: ${JSON.stringify(pNoun2)}`);
  }

  // 2.4 Support repost and like in "When someone mentions..."
  const pWhenRepost = parseNaturalCommand('When someone mentions Arachnos, repost');
  if (pWhenRepost.kind !== 'teach' || pWhenRepost.action !== 'repost' || pWhenRepost.condition !== 'Arachnos') {
    throw new Error(`Failed parse when repost: ${JSON.stringify(pWhenRepost)}`);
  }
  const pWhenLike = parseNaturalCommand('When someone mentions crypto, like');
  if (pWhenLike.kind !== 'teach' || pWhenLike.action !== 'like' || pWhenLike.condition !== 'crypto') {
    throw new Error(`Failed parse when like: ${JSON.stringify(pWhenLike)}`);
  }

  // 2.5 Action-less disable
  const pStopPosts = parseNaturalCommand('Stop posts about AI');
  if (pStopPosts.kind !== 'disable' || pStopPosts.action !== null || pStopPosts.condition !== 'AI') {
    throw new Error(`Failed parse stop posts: ${JSON.stringify(pStopPosts)}`);
  }
  const pStopRules = parseNaturalCommand('Stop rules about AI');
  if (pStopRules.kind !== 'disable' || pStopRules.action !== null || pStopRules.condition !== 'AI') {
    throw new Error(`Failed parse stop rules: ${JSON.stringify(pStopRules)}`);
  }
  const pStopDirect = parseNaturalCommand('Stop AI posts');
  if (pStopDirect.kind !== 'disable' || pStopDirect.action !== null || pStopDirect.condition !== 'AI') {
    throw new Error(`Failed parse stop AI posts: ${JSON.stringify(pStopDirect)}`);
  }
  console.log('   ✓ NL Parser tests passed!');

  // 3. Test Store & Suggestion Deduplication
  console.log('\n3️⃣ Testing XStore Persistence & Suggestion Logic...');
  const tempFile = path.resolve(__dirname, '../../../data/test_x_interaction.json');
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

  const store = new XStore({ storageFile: tempFile });

  // 3.1 Canonical URL normalization helper
  const canon1 = canonicalizePostUrl('https://twitter.com/user/status/123?s=20');
  if (canon1 !== 'https://x.com/user/status/123') {
    throw new Error(`Canonical URL mismatch: expected https://x.com/user/status/123, got ${canon1}`);
  }
  const canon2 = canonicalizePostUrl('https://mobile.twitter.com/dev/status/12345#ref');
  if (canon2 !== 'https://x.com/dev/status/12345') {
    throw new Error(`Canonical URL mismatch: expected https://x.com/dev/status/12345, got ${canon2}`);
  }

  // Add rule 1
  const rule1 = store.addRule('repost', 'local AI', null);
  if (rule1.id !== 1 || !rule1.enabled) throw new Error('Failed to add rule 1');

  // Prevent duplicate active rules: identical action and normalized condition
  const dupRuleRes = teachRule(store, { action: 'repost', condition: 'local AI' });
  if (dupRuleRes.ok) throw new Error('Expected teachRule to reject duplicate active rule');

  // Add rule 2 for comment
  const rule2 = store.addRule('comment', 'Arachnos', 'Check it out!');
  if (rule2.id !== 2 || rule2.comment_text !== 'Check it out!') throw new Error('Failed to add rule 2');

  // Add rule 3 (another repost rule matching the same post)
  const rule3 = store.addRule('repost', 'agent', null);

  // Test suggestions: post matches rule 1, rule 2, and rule 3
  const post1 = {
    text: 'Building a new local AI agent today with Arachnos',
    url: 'https://twitter.com/dev/status/12345?s=20',
    author: '@dev',
  };
  const suggRes = suggest(store, post1);
  if (!suggRes.ok) throw new Error(`Suggest failed: ${JSON.stringify(suggRes)}`);

  // Multiple rules match repost (rule 1 and rule 3), but only ONE repost suggestion should be yielded!
  const repostSuggestions = suggRes.body.suggestions.filter(s => s.action === 'repost');
  if (repostSuggestions.length !== 1) {
    throw new Error(`Expected exactly 1 repost suggestion, got ${repostSuggestions.length}`);
  }
  const commentSuggestions = suggRes.body.suggestions.filter(s => s.action === 'comment');
  if (commentSuggestions.length !== 1) {
    throw new Error(`Expected exactly 1 comment suggestion, got ${commentSuggestions.length}`);
  }

  // Log confirmation for repost
  const logEntry = store.addLog(rule1.id, post1.url, 'repost', 'confirmed');
  if (!logEntry || logEntry.id !== 1) throw new Error('Failed to log action');

  // Cross-rule deduplication: rule 3 also has action repost, but repost was already confirmed for this post
  const suggResAfter = suggest(store, post1);
  if (!suggResAfter.ok) throw new Error(`Suggest failed: ${JSON.stringify(suggResAfter)}`);
  const repostSuggestionsAfter = suggResAfter.body.suggestions.filter(s => s.action === 'repost');
  if (repostSuggestionsAfter.length !== 0) {
    throw new Error(`Expected 0 repost suggestions after confirmation, got ${repostSuggestionsAfter.length}`);
  }

  // Verify action failure does not permanently lock out:
  store.updateLog(logEntry.id, 'failed', 'Network timeout');
  const suggResAfterFail = suggest(store, post1);
  if (!suggResAfterFail.ok) throw new Error(`Suggest failed: ${JSON.stringify(suggResAfterFail)}`);
  const repostSuggestionsAfterFail = suggResAfterFail.body.suggestions.filter(s => s.action === 'repost');
  if (repostSuggestionsAfterFail.length !== 1) {
    throw new Error(`Expected failed action to be suggested again, got ${repostSuggestionsAfterFail.length}`);
  }

  // Update report to success
  const updated = store.updateLog(logEntry.id, 'success', null);
  if (!updated) throw new Error('Failed to update action status');

  const logEntries = store.getLog();
  if (logEntries.length !== 1 || logEntries[0].status !== 'success') {
    throw new Error(`Expected log status success, got: ${JSON.stringify(logEntries)}`);
  }

  // 3.2 Corrupted file safe backup test
  const corruptFile = path.resolve(__dirname, '../../../data/test_corrupt.json');
  fs.writeFileSync(corruptFile, '{ invalid json content !!!', 'utf-8');
  const corruptStore = new XStore({ storageFile: corruptFile });
  if (corruptStore.getRules().length !== 0) throw new Error('Corrupted store should initialize empty');
  // Verify backup file was created
  const filesInData = fs.readdirSync(path.dirname(corruptFile));
  const backupFound = filesInData.some(f => f.startsWith('test_corrupt.json.corrupted.'));
  if (!backupFound) throw new Error('Expected backup of corrupted file to exist');

  // Clean up test files
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  if (fs.existsSync(corruptFile)) fs.unlinkSync(corruptFile);
  for (const f of filesInData) {
    if (f.startsWith('test_corrupt.json.corrupted.')) {
      try { fs.unlinkSync(path.join(path.dirname(corruptFile), f)); } catch {}
    }
  }

  console.log('   ✓ XStore persistence and deduplication tests passed!');

  console.log('\n🎉 ALL X INTERACTION MODULE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

