import { performance } from 'node:perf_hooks';
import type {
  Citation,
  ProcessedChunk,
  QueryRequest,
  QueryResponse,
  VectorSearchResult,
} from './types.js';
import { NlpPipeline } from './nlp.js';
import { VectorIndex } from './vectorStore.js';
import { KnowledgeGraph } from './knowledgeGraph.js';
import { MemoryStore } from './memoryStore.js';
import type { MemoryRecord } from '../../../shared/types.js';

export class RagQueryEngine {
  private readonly nlp: NlpPipeline;
  private readonly vectorIndex: VectorIndex;
  private readonly knowledgeGraph: KnowledgeGraph;
  private readonly memoryStore?: MemoryStore;

  constructor(
    nlp: NlpPipeline,
    vectorIndex: VectorIndex,
    knowledgeGraph: KnowledgeGraph,
    memoryStore?: MemoryStore
  ) {
    this.nlp = nlp;
    this.vectorIndex = vectorIndex;
    this.knowledgeGraph = knowledgeGraph;
    this.memoryStore = memoryStore;
  }

  /**
   * Executes a citation-grounded RAG query against harvested knowledge & memory store
   */
  public query(request: QueryRequest | string | null | undefined): QueryResponse {
    const startTime = performance.now();
    try {
      const queryStr = !request
        ? ''
        : typeof request === 'string'
        ? request.trim()
        : (request.query || '').trim();

      if (!queryStr) {
        return {
          type: 'query_response',
          query: '',
          answer: 'Please provide a valid question or query to search the harvested knowledge.',
          citations: [],
          related_entities: [],
          confidence: 0,
          latencyMs: Math.round(performance.now() - startTime),
        };
      }

      const totalHarvestedChunks = this.vectorIndex.getChunkCount();
      const totalMemories = this.memoryStore?.getAll().length || 0;

      if (totalHarvestedChunks === 0 && totalMemories === 0) {
        return {
          type: 'query_response',
          query: queryStr,
          answer: 'No browsing memory or harvested content found yet. Visit pages with Arachnos active or use "Teach Arachnos" to store facts.',
          citations: [],
          related_entities: [],
          confidence: 0,
          latencyMs: Math.round(performance.now() - startTime),
        };
      }

      // 1. Analyze query
      const { tokens: queryTokens } = this.nlp.tokenize(queryStr);
      const queryEntities = this.nlp.extractEntities(queryStr);
      const intent = this.detectQueryIntent(queryStr);

      // 2. Semantic retrieval via Vector Semantic Index
      let searchResults = this.vectorIndex.search(queryStr, queryTokens, 8, 0.05);

      // 3. Merge memories from MemoryStore with feedback weighting
      if (this.memoryStore) {
        const memoryHits = this.memoryStore.search(queryTokens, 6);
        for (const hit of memoryHits) {
          // Convert memory hit to pseudo-chunk
          const memChunk: ProcessedChunk = {
            id: hit.record.id,
            spider_id: hit.record.tags?.includes('taught_by_user') ? 'user-taught' : 'memory-sync',
            timestamp: hit.record.created_at,
            page_url: hit.record.source_url,
            element_selector: hit.record.selector || 'body',
            bounding_box: hit.record.bounding_box || { x: 0, y: 0, w: 0, h: 0 },
            content_type: 'paragraph',
            raw_text: hit.record.corrected_text || hit.record.content,
            normalized_text: (hit.record.corrected_text || hit.record.content).toLowerCase(),
            extracted_facts: [hit.record.corrected_text || hit.record.content],
            confidence: hit.record.confidence,
            tokens: queryTokens,
            stemmedTokens: [],
            vector: [],
            entities: [],
            relations: [],
          };
          (memChunk as any).tier = hit.record.tier;
          (memChunk as any).user_feedback = hit.record.user_feedback;

          // If this chunk already in searchResults, update its score and metadata
          const existingIdx = searchResults.findIndex((r) => r.chunk.id === hit.record.id);
          if (existingIdx !== -1) {
            searchResults[existingIdx].score = hit.score;
            (searchResults[existingIdx].chunk as any).tier = hit.record.tier;
            (searchResults[existingIdx].chunk as any).user_feedback = hit.record.user_feedback;
          } else {
            searchResults.push({
              chunk: memChunk,
              score: hit.score,
              cosineScore: hit.score,
              bm25Score: hit.score,
              matchedTerms: queryTokens,
            });
          }
        }

        // Re-sort searchResults by score (user_reinforced memories have top weight)
        searchResults.sort((a, b) => {
          const aTier = (a.chunk as any).tier;
          const bTier = (b.chunk as any).tier;
          if (aTier === 'user_reinforced' && bTier !== 'user_reinforced') return -1;
          if (bTier === 'user_reinforced' && aTier !== 'user_reinforced') return 1;
          return b.score - a.score;
        });
      }

      // If intent is overarching (summary, links, metrics) and specific keyword hits are low,
      // supply intent-matched chunks from dual storage
      if (intent === 'summary' && searchResults.length < 3) {
        const allChunks = this.vectorIndex.getAllChunks();
        const ranked = allChunks.slice().sort((a, b) => {
          const typePriority: Record<string, number> = { heading: 3, paragraph: 2, table: 1, list: 1 };
          return (typePriority[b.content_type] || 0) - (typePriority[a.content_type] || 0);
        });
        searchResults = ranked.slice(0, 5).map((c) => ({
          chunk: c,
          score: 0.88,
          cosineScore: 0.85,
          bm25Score: 1.0,
          matchedTerms: [],
        }));
      } else if (intent === 'links' && searchResults.length === 0) {
        const allChunks = this.vectorIndex.getAllChunks();
        const linkChunks = allChunks.filter(
          (c) => c.content_type === 'link' || c.metadata?.href || c.entities.some((e) => e.type === 'resource')
        );
        if (linkChunks.length > 0) {
          searchResults = linkChunks.slice(0, 6).map((c) => ({
            chunk: c,
            score: 0.92,
            cosineScore: 0.9,
            bm25Score: 1.0,
            matchedTerms: [],
          }));
        }
      } else if (intent === 'metrics' && searchResults.length === 0) {
        const allChunks = this.vectorIndex.getAllChunks();
        const metricChunks = allChunks.filter(
          (c) => c.entities.some((e) => e.type === 'metric') || c.extracted_facts.some((f) => /\d+/.test(f))
        );
        if (metricChunks.length > 0) {
          searchResults = metricChunks.slice(0, 5).map((c) => ({
            chunk: c,
            score: 0.89,
            cosineScore: 0.85,
            bm25Score: 1.0,
            matchedTerms: [],
          }));
        }
      }

      // 4. Knowledge Graph Expansion
      const relevantEntityNames = new Set<string>();
      for (const qe of queryEntities) {
        relevantEntityNames.add(qe.name);
      }

      for (const res of searchResults.slice(0, 4)) {
        for (const ent of res.chunk.entities) {
          relevantEntityNames.add(ent.name);
        }
      }

      const subgraph = this.knowledgeGraph.getSubgraph(
        Array.from(relevantEntityNames),
        2,
        25
      );

      const relatedEntitiesList = Array.from(
        new Set(subgraph.nodes.map((n) => n.name))
      ).slice(0, 10);

      // 5. Grounded Answer Synthesis
      const { answer, citations, confidence } = this.synthesizeAnswer(
        queryStr,
        intent,
        searchResults,
        subgraph,
        queryTokens
      );

      const latencyMs = Math.round(performance.now() - startTime);

      return {
        type: 'query_response',
        query: queryStr,
        answer,
        citations,
        related_entities: relatedEntitiesList,
        confidence: Math.round(confidence * 100) / 100,
        latencyMs,
      };
    } catch (err: any) {
      return {
        type: 'query_response',
        query: typeof request === 'string' ? request : (request?.query || ''),
        answer: `Encountered an issue processing knowledge query: ${err?.message || 'Internal Brain error'}.`,
        citations: [],
        related_entities: [],
        confidence: 0,
        latencyMs: Math.round(performance.now() - startTime),
      };
    }
  }

  private detectQueryIntent(query: string): 'summary' | 'links' | 'metrics' | 'definition' | 'general' {
    const q = query.toLowerCase();
    if (/\b(?:summarize|summary|overview|what is this page|what's this page|tl;dr|key points|gist)\b/.test(q)) {
      return 'summary';
    }
    if (/\b(?:links?|urls?|hyperlinks?|navigation|resources?|endpoints?)\b/.test(q)) {
      return 'links';
    }
    if (/\b(?:how many|metrics?|numbers?|statistics?|stats|count|percentage|rate|price|cost|benchmark)\b/.test(q)) {
      return 'metrics';
    }
    if (/\b(?:what is|who is|define|definition|explain|meaning of)\b/.test(q)) {
      return 'definition';
    }
    return 'general';
  }

  private synthesizeAnswer(
    queryStr: string,
    intent: 'summary' | 'links' | 'metrics' | 'definition' | 'general',
    searchResults: VectorSearchResult[],
    subgraph: { nodes: any[]; relations: any[] },
    queryTokens: string[]
  ): { answer: string; citations: Citation[]; confidence: number } {
    if (searchResults.length === 0) {
      return {
        answer: `I could not find relevant knowledge matching "${queryStr}". Browse more pages or teach Arachnos directly.`,
        citations: [],
        confidence: 0.1,
      };
    }

    const citations: Citation[] = [];
    const seenChunkIds = new Set<string>();

    const addCitation = (chunk: ProcessedChunk, queryTokens: string[]) => {
      if (seenChunkIds.has(chunk.id)) return;
      seenChunkIds.add(chunk.id);

      let snippet = chunk.raw_text;
      if (snippet.length > 200) {
        const lower = snippet.toLowerCase();
        let bestPos = 0;
        for (const token of queryTokens) {
          const pos = lower.indexOf(token);
          if (pos !== -1) {
            bestPos = pos;
            break;
          }
        }
        const start = Math.max(0, bestPos - 30);
        const end = Math.min(snippet.length, start + 180);
        snippet = (start > 0 ? '...' : '') + snippet.slice(start, end) + (end < snippet.length ? '...' : '');
      }

      citations.push({
        chunk_id: chunk.id,
        spider_id: chunk.spider_id,
        element_selector: chunk.element_selector,
        bounding_box: chunk.bounding_box,
        snippet: snippet.trim(),
        source_url: chunk.page_url,
        content_type: chunk.content_type,
        confidence: chunk.confidence,
        tier: (chunk as any).tier,
        user_feedback: (chunk as any).user_feedback,
      });
    };

    let answerText = '';
    let confidence = searchResults[0].score;

    if (intent === 'summary') {
      const topChunks = searchResults.slice(0, 5);
      for (const res of topChunks) {
        addCitation(res.chunk, queryTokens);
      }

      const bulletPoints: string[] = [];
      for (const res of topChunks) {
        if (res.chunk.raw_text.trim()) {
          const firstSentence = res.chunk.raw_text.split(/(?<=[.?!])\s+/)[0];
          if (firstSentence && firstSentence.length > 15) {
            bulletPoints.push(`- ${firstSentence.trim()}`);
          }
        }
      }

      const graphSummary = subgraph.relations
        .slice(0, 4)
        .map((r) => `- **${r.source}** ${r.relation.replace(/_/g, ' ')} **${r.target}**`)
        .join('\n');

      answerText = `### Page Summary & Key Findings\n\n` +
        `Based on ${searchResults.length} memories and harvested sections:\n\n` +
        `${bulletPoints.slice(0, 4).join('\n')}\n\n` +
        (graphSummary ? `#### Key Knowledge Connections:\n${graphSummary}\n` : '');

    } else if (intent === 'links') {
      const allChunks = this.vectorIndex.getAllChunks();
      const linkChunks = allChunks.filter((c) => c.content_type === 'link' || c.metadata?.href);
      const itemsToUse = linkChunks.length > 0 ? linkChunks.slice(0, 8) : searchResults.slice(0, 5).map((r) => r.chunk);

      for (const chunk of itemsToUse) {
        addCitation(chunk, queryTokens);
      }

      const linksList = itemsToUse.map((c) => {
        const href = c.metadata?.href || 'N/A';
        const label = c.raw_text || href;
        return `- [${label}](${href}) (Selector: \`${c.element_selector}\`)`;
      }).join('\n');

      answerText = `### Extracted Links & References\n\nFound the following references:\n\n${linksList}`;

    } else if (intent === 'metrics') {
      const metricEntities = subgraph.nodes.filter((n) => n.type === 'metric');
      const topChunks = searchResults.slice(0, 4);

      for (const res of topChunks) {
        addCitation(res.chunk, queryTokens);
      }

      const metricBullets: string[] = [];
      for (const m of metricEntities) {
        metricBullets.push(`- **${m.name}** (observed ${m.frequency} time${m.frequency > 1 ? 's' : ''})`);
      }

      const facts: string[] = [];
      for (const res of topChunks) {
        for (const f of res.chunk.extracted_facts) {
          if (/\d+/.test(f)) {
            facts.push(`- ${f}`);
          }
        }
      }

      const primaryFinding = topChunks[0]?.chunk.normalized_text.slice(0, 240) || '';

      answerText = `### Measured Metrics & Benchmarks\n\n` +
        `${primaryFinding}\n\n` +
        (metricBullets.length > 0 ? `#### Extracted Metrics:\n${metricBullets.join('\n')}\n\n` : '') +
        (facts.length > 0 ? `#### Specific Facts:\n${facts.slice(0, 5).join('\n')}\n` : '');

    } else {
      // General QA or Definition
      const primaryChunk = searchResults[0].chunk;
      addCitation(primaryChunk, queryTokens);

      for (const res of searchResults.slice(1, 4)) {
        addCitation(res.chunk, queryTokens);
      }

      const cleanText = primaryChunk.raw_text.trim();
      const sentences = cleanText.split(/(?<=[.?!])\s+/);
      const bestSentences: string[] = [];

      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        let matches = 0;
        for (const t of queryTokens) {
          if (t.length > 2 && lower.includes(t)) matches++;
        }
        if (matches > 0) {
          bestSentences.push(sentence.trim());
        }
      }

      const coreAnswer =
        bestSentences.length > 0
          ? bestSentences.slice(0, 3).join(' ')
          : sentences.slice(0, 2).join(' ') || cleanText;

      const supplementaryFacts = primaryChunk.extracted_facts
        .filter((f) => f !== coreAnswer && f.length > 10)
        .slice(0, 3);

      const relatedRels = subgraph.relations
        .filter((r) => queryTokens.some((t) => r.source.toLowerCase().includes(t) || r.target.toLowerCase().includes(t)))
        .slice(0, 3)
        .map((r) => `- **${r.source}** ${r.relation.replace(/_/g, ' ')} **${r.target}**`);

      answerText =
        `${coreAnswer}\n\n` +
        (supplementaryFacts.length > 0 ? `**Key Takeaways:**\n${supplementaryFacts.map((f) => `- ${f}`).join('\n')}\n\n` : '') +
        (relatedRels.length > 0 ? `**Related Concepts:**\n${relatedRels.join('\n')}\n` : '');
    }

    return {
      answer: answerText.trim(),
      citations,
      confidence: Math.min(1.0, Math.max(0.1, confidence)),
    };
  }
}
