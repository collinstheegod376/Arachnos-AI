import type { ProcessedChunk, VectorSearchResult } from './types.js';

export class VectorIndex {
  private readonly dimensions: number;
  private readonly chunks = new Map<string, ProcessedChunk>();
  // Inverted index: token -> Map<chunkId, termFrequency>
  private readonly invertedIndex = new Map<string, Map<string, number>>();
  // Document frequency: token -> count of documents containing token
  private readonly documentFrequency = new Map<string, number>();
  // Total tokens across all docs for BM25 avg length calculation
  private totalDocumentLength = 0;

  // BM25 parameters
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  constructor(dimensions = 256) {
    this.dimensions = dimensions;
  }

  /**
   * Generates a dense L2-normalized vector embedding for given text & tokens
   * Uses hashing trick over word tokens and character 3/4-grams with signed projections
   */
  public generateEmbedding(text: string, tokens: string[]): number[] {
    const vector = new Float32Array(this.dimensions);
    if (!text || text.length === 0) return Array.from(vector);

    // 1. Project word tokens
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const h1 = this.hashString(token, 0x9747b28c);
      const idx = Math.abs(h1) % this.dimensions;
      const sign = (h1 & 0x80000000) === 0 ? 1 : -1;
      vector[idx] += sign * 1.5;

      // Word bigrams
      if (i < tokens.length - 1) {
        const bigram = `${token}_${tokens[i + 1]}`;
        const hBi = this.hashString(bigram, 0x12b9b0a1);
        const biIdx = Math.abs(hBi) % this.dimensions;
        const biSign = (hBi & 0x80000000) === 0 ? 1 : -1;
        vector[biIdx] += biSign * 2.0;
      }
    }

    // 2. Project character n-grams (3-grams and 4-grams) for subword semantic capture
    const cleanStr = text.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const len = cleanStr.length;

    for (let i = 0; i <= len - 3; i++) {
      const trigram = cleanStr.substring(i, i + 3);
      if (trigram.trim().length >= 2) {
        const hTri = this.hashString(trigram, 0x5bd1e995);
        const idx = Math.abs(hTri) % this.dimensions;
        const sign = (hTri & 0x80000000) === 0 ? 1 : -1;
        vector[idx] += sign * 0.5;
      }
    }

    for (let i = 0; i <= len - 4; i++) {
      const fourgram = cleanStr.substring(i, i + 4);
      if (fourgram.trim().length >= 3) {
        const hFour = this.hashString(fourgram, 0x27d4eb2f);
        const idx = Math.abs(hFour) % this.dimensions;
        const sign = (hFour & 0x80000000) === 0 ? 1 : -1;
        vector[idx] += sign * 0.7;
      }
    }

    // 3. L2 normalize
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += vector[i] * vector[i];
    }

    if (norm > 0) {
      const invNorm = 1.0 / Math.sqrt(norm);
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] *= invNorm;
      }
    }

    return Array.from(vector);
  }

  /**
   * Adds or updates a processed chunk in the vector index
   */
  public addChunk(chunk: ProcessedChunk): void {
    // If replacing an existing chunk, remove previous stats
    if (this.chunks.has(chunk.id)) {
      this.removeChunk(chunk.id);
    }

    // Ensure chunk has vector embedding
    if (!chunk.vector || chunk.vector.length !== this.dimensions) {
      chunk.vector = this.generateEmbedding(chunk.normalized_text, chunk.tokens);
    }

    this.chunks.set(chunk.id, chunk);
    this.totalDocumentLength += chunk.tokens.length;

    // Count term frequencies
    const tfMap = new Map<string, number>();
    for (const token of chunk.tokens) {
      tfMap.set(token, (tfMap.get(token) || 0) + 1);
    }

    // Update inverted index and document frequencies
    for (const [token, tf] of tfMap.entries()) {
      let postings = this.invertedIndex.get(token);
      if (!postings) {
        postings = new Map<string, number>();
        this.invertedIndex.set(token, postings);
      }
      postings.set(chunk.id, tf);
      this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
    }
  }

  /**
   * Removes a chunk from the index
   */
  public removeChunk(chunkId: string): void {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) return;

    this.chunks.delete(chunkId);
    this.totalDocumentLength -= chunk.tokens.length;

    for (const token of new Set(chunk.tokens)) {
      const postings = this.invertedIndex.get(token);
      if (postings) {
        postings.delete(chunkId);
        if (postings.size === 0) {
          this.invertedIndex.delete(token);
        }
      }
      const df = (this.documentFrequency.get(token) || 1) - 1;
      if (df <= 0) {
        this.documentFrequency.delete(token);
      } else {
        this.documentFrequency.set(token, df);
      }
    }
  }

  /**
   * Updates an existing chunk by removing the old one first, recomputing, and re-adding
   */
  public updateChunk(chunkId: string, updatedChunk: ProcessedChunk): void {
    this.removeChunk(chunkId);
    this.addChunk(updatedChunk);
  }

  /**
   * Hybrid Semantic Search: Cosine Similarity + BM25 Scoring
   */
  public search(queryText: string, queryTokens: string[], topK = 10, minScore = 0.05): VectorSearchResult[] {
    if (this.chunks.size === 0) return [];

    const queryVector = this.generateEmbedding(queryText, queryTokens);
    const N = this.chunks.size;
    const avgDocLength = Math.max(1, this.totalDocumentLength / N);

    // Collect candidate chunk IDs matching any query token
    const candidateScores = new Map<string, { bm25: number; matchedTerms: string[] }>();

    for (const token of queryTokens) {
      const postings = this.invertedIndex.get(token);
      if (postings) {
        const df = this.documentFrequency.get(token) || 1;
        // Robertson-Spärck Jones IDF
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        for (const [chunkId, tf] of postings.entries()) {
          const chunk = this.chunks.get(chunkId);
          if (!chunk) continue;

          const docLen = chunk.tokens.length;
          // BM25 formula
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / avgDocLength));
          const termScore = idf * (numerator / denominator);

          const existing = candidateScores.get(chunkId) || { bm25: 0, matchedTerms: [] };
          existing.bm25 += termScore;
          if (!existing.matchedTerms.includes(token)) {
            existing.matchedTerms.push(token);
          }
          candidateScores.set(chunkId, existing);
        }
      }
    }

    // Normalize BM25 scores
    let maxBm25 = 0.0001;
    for (const val of candidateScores.values()) {
      if (val.bm25 > maxBm25) maxBm25 = val.bm25;
    }

    // Now compute Cosine similarity across candidates or all chunks if candidates are few
    const results: VectorSearchResult[] = [];
    const evaluatedChunks = new Set<string>();

    // Prioritize candidates with keyword hits
    for (const [chunkId, { bm25, matchedTerms }] of candidateScores.entries()) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) continue;
      evaluatedChunks.add(chunkId);

      const cosine = this.cosineSimilarity(queryVector, chunk.vector);
      const normalizedBm25 = bm25 / maxBm25;

      // Type boost: headings and paragraphs get slightly higher base relevance
      let typeBoost = 1.0;
      if (chunk.content_type === 'heading') typeBoost = 1.15;
      else if (chunk.content_type === 'paragraph') typeBoost = 1.05;

      // Hybrid blend: 55% dense semantic similarity + 45% BM25 lexical match
      const hybridScore = (0.55 * Math.max(0, cosine) + 0.45 * normalizedBm25) * typeBoost;

      if (hybridScore >= minScore) {
        results.push({
          chunk,
          score: hybridScore,
          cosineScore: cosine,
          bm25Score: bm25,
          matchedTerms,
        });
      }
    }

    // If candidate set is small (e.g. out-of-vocabulary semantic query), scan remaining chunks via vector cosine
    if (results.length < topK) {
      for (const [chunkId, chunk] of this.chunks.entries()) {
        if (evaluatedChunks.has(chunkId)) continue;

        const cosine = this.cosineSimilarity(queryVector, chunk.vector);
        if (cosine >= 0.1) {
          results.push({
            chunk,
            score: cosine * 0.75, // discounted for zero lexical overlap
            cosineScore: cosine,
            bm25Score: 0,
            matchedTerms: [],
          });
        }
      }
    }

    // Sort descending by hybrid score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Cosine similarity between two normalized vectors
   */
  public cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  public getChunkCount(): number {
    return this.chunks.size;
  }

  public getVocabularySize(): number {
    return this.documentFrequency.size;
  }

  public getAllChunks(): ProcessedChunk[] {
    return Array.from(this.chunks.values());
  }

  public getChunk(id: string): ProcessedChunk | undefined {
    return this.chunks.get(id);
  }

  public getIndexSizeKb(): number {
    // Approximate memory size in KB
    const vectorBytes = this.chunks.size * this.dimensions * 4;
    let invertedBytes = 0;
    for (const postings of this.invertedIndex.values()) {
      invertedBytes += postings.size * 24;
    }
    return Math.round((vectorBytes + invertedBytes + this.chunks.size * 500) / 1024);
  }

  public clear(): void {
    this.chunks.clear();
    this.invertedIndex.clear();
    this.documentFrequency.clear();
    this.totalDocumentLength = 0;
  }

  /**
   * 32-bit MurmurHash3-inspired string hash for embedding projection
   */
  private hashString(str: string, seed: number): number {
    let h = seed ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
      h ^= h >>> 15;
    }
    return h;
  }
}
