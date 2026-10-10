import type { EntityCategory, ExtractedEntity, ExtractedRelation } from './types.js';

// English stop words for fast tokenization
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could',
  'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each', 'few', 'for',
  'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s',
  'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m',
  'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t',
  'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some',
  'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these',
  'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when',
  'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would',
  'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
]);

// Curated entity knowledge dictionaries for fast, high-confidence matching
const KNOWN_ORGANIZATIONS = new Set([
  'google', 'microsoft', 'apple', 'amazon', 'meta', 'facebook', 'openai', 'deepmind', 'anthropic',
  'mit', 'stanford', 'harvard', 'oxford', 'cambridge', 'caltech', 'cern', 'nasa', 'darpa', 'nsf',
  'ibm', 'intel', 'nvidia', 'amd', 'arm', 'qualcomm', 'tsmc', 'asml', 'bell labs', 'uc berkeley',
  'yale', 'princeton', 'columbia', 'cornell', 'toronto university', 'max planck', 'fraunhofer'
]);

const KNOWN_TECHNOLOGIES = new Set([
  'python', 'typescript', 'javascript', 'rust', 'c++', 'go', 'golang', 'java', 'c#', 'swift', 'kotlin',
  'react', 'vue', 'angular', 'svelte', 'next.js', 'node.js', 'express', 'docker', 'kubernetes',
  'linux', 'ubuntu', 'qpu', 'gpu', 'tpu', 'sycamore', 'eagle', 'condor', 'heron', 'osprey',
  'transformer', 'bert', 'gpt-4', 'gpt-3', 'gemini', 'claude', 'llama', 'whisper', 'stable diffusion',
  'pytorch', 'tensorflow', 'jax', 'cheerio', 'playwright', 'puppeteer', 'websocket', 'graphql',
  'rest', 'http', 'https', 'webrtc', 'wasm', 'webassembly', 'sqlite', 'redis', 'postgres', 'postgresql',
  'mongodb', 'neo4j', 'vector database', 'chromadb', 'pinecone', 'milvus', 'weaviate', 'faiss'
]);

const KNOWN_LOCATIONS = new Set([
  'california', 'silicon valley', 'mountain view', 'san francisco', 'seattle', 'boston', 'cambridge',
  'new york', 'zurich', 'london', 'tokyo', 'paris', 'berlin', 'beijing', 'shanghai', 'singapore',
  'usa', 'united states', 'uk', 'united kingdom', 'germany', 'france', 'china', 'japan', 'switzerland',
  'canada', 'australia', 'india', 'europe', 'asia', 'north america'
]);

const KNOWN_PEOPLE = new Set([
  'alan turing', 'richard feynman', 'john preskill', 'john martinis', 'hartmut neven', 'sundar pichai',
  'satya nadella', 'demis hassabis', 'sam altman', 'ilya sutskever', 'geoffrey hinton', 'yann lecun',
  'yoshua bengio', 'andrew ng', 'ada lovelace', 'claude shannon', 'tim berners-lee', 'linus torvalds',
  'albert einstein', 'niels bohr', 'erwin schrodinger', 'werner heisenberg', 'max planck'
]);

const KNOWN_CONCEPTS = new Set([
  'quantum supremacy', 'quantum advantage', 'quantum computer', 'quantum computing', 'superposition',
  'quantum entanglement', 'quantum decoherence', 'qubit', 'qubits', 'random circuit sampling',
  'cross-entropy benchmarking', 'fault tolerance', 'quantum error correction', 'noisy intermediate-scale quantum',
  'nisq', 'neural network', 'deep learning', 'machine learning', 'artificial intelligence', 'natural language processing',
  'large language model', 'vector embedding', 'cosine similarity', 'knowledge graph', 'retrieval-augmented generation',
  'rag', 'reinforcement learning', 'computer vision', 'computational complexity', 'np-complete', 'p vs np',
  'markov decision process', 'information theory', 'entropy', 'bayes theorem', 'graph neural network'
]);

// Fast Porter-like suffix stripper for normalized token comparison
export function stemToken(token: string): string {
  if (token.length <= 3) return token;
  let word = token.toLowerCase();
  if (word.endsWith('ing') && word.length > 5) word = word.slice(0, -3);
  else if (word.endsWith('ed') && word.length > 4) word = word.slice(0, -2);
  else if (word.endsWith('ies') && word.length > 4) word = word.slice(0, -3) + 'y';
  else if (word.endsWith('es') && word.length > 4) word = word.slice(0, -2);
  else if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) word = word.slice(0, -1);
  else if (word.endsWith('ly') && word.length > 4) word = word.slice(0, -2);
  else if (word.endsWith('tion') && word.length > 6) word = word.slice(0, -4);
  return word;
}

export class NlpPipeline {
  /**
   * Cleans text and splits into tokens and stemmed tokens
   */
  public tokenize(text: string): { tokens: string[]; stemmed: string[] } {
    if (!text) return { tokens: [], stemmed: [] };
    const cleaned = text
      .toLowerCase()
      .replace(/[^\w\s\-\.\#\+]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const rawWords = cleaned.split(' ');
    const tokens: string[] = [];
    const stemmed: string[] = [];

    for (const word of rawWords) {
      const cleanWord = word.replace(/^[\.\-]+|[\.\-]+$/g, '');
      if (cleanWord.length > 1 && !STOP_WORDS.has(cleanWord) && !/^\d+$/.test(cleanWord)) {
        tokens.push(cleanWord);
        stemmed.push(stemToken(cleanWord));
      }
    }

    return { tokens, stemmed };
  }

  /**
   * Computes normalized clean text
   */
  public normalizeText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extracts entities across 7 standard categories:
   * concept, organization, person, location, technology, metric, resource
   */
  public extractEntities(text: string, facts: string[] = []): ExtractedEntity[] {
    const entitiesMap = new Map<string, ExtractedEntity>();

    const addEntity = (name: string, type: EntityCategory, confidence: number) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length < 2) return;
      const key = `${type}:${trimmed.toLowerCase()}`;
      if (!entitiesMap.has(key) || (entitiesMap.get(key)!.confidence < confidence)) {
        entitiesMap.set(key, {
          name: trimmed,
          type,
          confidence: Math.min(1.0, confidence),
          normalizedName: trimmed.toLowerCase(),
        });
      }
    };

    const corpus = `${text}\n${facts.join('\n')}`;

    // 1. RESOURCE: URLs, file paths, documentation specs, endpoints
    const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`\[\]]+/gi;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(corpus)) !== null) {
      addEntity(match[0], 'resource', 0.95);
    }

    const pathRegex = /(?:\/[\w\-\.\~]+){2,}\/?/g;
    while ((match = pathRegex.exec(corpus)) !== null) {
      if (!match[0].startsWith('//') && match[0].length > 3) {
        addEntity(match[0], 'resource', 0.85);
      }
    }

    const docSpecRegex = /\b(?:RFC\s*\d+|HTML5|CSS3|ECMAScript\s*\d+|IEEE\s*\d+|ISO\s*\d+)\b/gi;
    while ((match = docSpecRegex.exec(corpus)) !== null) {
      addEntity(match[0], 'resource', 0.9);
    }

    // 2. METRIC: Numbers with units, percentages, time durations, monetary, computing stats
    const metricRegex = /\b(?:\$\s*\d+(?:,\d+)*(?:\.\d+)?\s*(?:[bB]illion|[mM]illion|[kK]|[tT])?|\d+(?:,\d+)*(?:\.\d+)?\s*(?:qubits?|seconds?|sec|ms|µs|ns|years?|minutes?|hours?|%|percent|Gbps|Mbps|kbps|GHz|MHz|kHz|GB|TB|MB|KB|flops|TFLOPS|PFLOPS|GFLOPS|operations\/sec|requests\/sec|x\s+speedup|x\s+faster|nodes?|cores?|parameters?|billion|million))\b/gi;
    while ((match = metricRegex.exec(corpus)) !== null) {
      addEntity(match[0], 'metric', 0.92);
    }

    // 3. Known dictionary checks
    const lowerCorpus = corpus.toLowerCase();

    for (const org of KNOWN_ORGANIZATIONS) {
      if (this.containsWholePhrase(lowerCorpus, org)) {
        addEntity(this.titleCase(org), 'organization', 0.95);
      }
    }

    for (const tech of KNOWN_TECHNOLOGIES) {
      if (this.containsWholePhrase(lowerCorpus, tech)) {
        addEntity(this.preserveTechCase(tech), 'technology', 0.95);
      }
    }

    for (const loc of KNOWN_LOCATIONS) {
      if (this.containsWholePhrase(lowerCorpus, loc)) {
        addEntity(this.titleCase(loc), 'location', 0.92);
      }
    }

    for (const person of KNOWN_PEOPLE) {
      if (this.containsWholePhrase(lowerCorpus, person)) {
        addEntity(this.titleCase(person), 'person', 0.96);
      }
    }

    for (const concept of KNOWN_CONCEPTS) {
      if (this.containsWholePhrase(lowerCorpus, concept)) {
        addEntity(this.titleCase(concept), 'concept', 0.92);
      }
    }

    // 4. Pattern-based ORGANIZATION extraction
    const orgSuffixRegex = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*\s+(?:Inc|Corp|Corporation|LLC|Ltd|Limited|University|Institute|Foundation|Laboratory|Laboratories|Labs|Group|Alliance|Consortium|Department|Agency))\b/g;
    while ((match = orgSuffixRegex.exec(corpus)) !== null) {
      addEntity(match[1], 'organization', 0.88);
    }

    // 5. Pattern-based PERSON extraction (Title + Name, or capitalized names near person verbs)
    const personTitleRegex = /\b(?:Dr\.|Prof\.|Professor|Doctor|Mr\.|Ms\.|Mrs\.|President|CEO|CTO|Director)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    while ((match = personTitleRegex.exec(corpus)) !== null) {
      addEntity(match[1], 'person', 0.9);
    }

    const personRoleRegex = /\b(?:led by|authored by|founded by|invented by|co-founded by|researched by|written by|developed by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi;
    while ((match = personRoleRegex.exec(corpus)) !== null) {
      let personName = match[1].replace(/\s+(?:and|or|with|at|in|by)$/i, '').trim();
      if (!KNOWN_ORGANIZATIONS.has(personName.toLowerCase()) && personName.length > 3) {
        addEntity(personName, 'person', 0.85);
      }
    }

    // 6. Pattern-based TECHNOLOGY extraction
    const techPatterns = /\b([A-Z0-9]{2,10}(?:-?\d+)?(?:\s+(?:Engine|Protocol|API|SDK|Framework|Architecture|Model|Chip|Processor)))\b/g;
    while ((match = techPatterns.exec(corpus)) !== null) {
      addEntity(match[1], 'technology', 0.8);
    }

    // 7. Pattern-based CONCEPT extraction (Capitalized multi-word technical phrases or quotes)
    const conceptRegex = /\b([A-Z][a-z]+(?:\s+[a-z]+)?\s+(?:Theory|Principle|Hypothesis|Paradox|Effect|Law|Equation|Algorithm|Sampling|Benchmarking|Supremacy|Advantage|Complexity|Entanglement|Superposition))\b/g;
    while ((match = conceptRegex.exec(corpus)) !== null) {
      addEntity(match[1], 'concept', 0.85);
    }

    // 8. Ingest from structured extracted_facts
    for (const fact of facts) {
      if (!fact) continue;
      // If fact contains a colon, e.g. "Key Metric: 53 qubits" or "Lead Author: John Martinis"
      const colonIdx = fact.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        const prefix = fact.slice(0, colonIdx).trim().toLowerCase();
        const value = fact.slice(colonIdx + 1).trim();
        if (prefix.includes('metric') || prefix.includes('number') || prefix.includes('score')) {
          addEntity(value, 'metric', 0.95);
        } else if (prefix.includes('author') || prefix.includes('person') || prefix.includes('lead')) {
          addEntity(value, 'person', 0.95);
        } else if (prefix.includes('org') || prefix.includes('company') || prefix.includes('lab')) {
          addEntity(value, 'organization', 0.95);
        } else if (prefix.includes('tech') || prefix.includes('chip') || prefix.includes('system')) {
          addEntity(value, 'technology', 0.95);
        } else if (prefix.includes('url') || prefix.includes('link') || prefix.includes('resource')) {
          addEntity(value, 'resource', 0.95);
        }
      }
    }

    return Array.from(entitiesMap.values());
  }

  /**
   * Extracts labeled directional relationships between entities within text chunks.
   * Formats: source -> relation -> target
   */
  public extractRelations(text: string, entities: ExtractedEntity[]): ExtractedRelation[] {
    if (entities.length < 2) return [];

    const relations: ExtractedRelation[] = [];
    const relationsSeen = new Set<string>();

    const addRelation = (source: string, relation: string, target: string, weight: number, conf: number, contextSentence?: string) => {
      const src = source.trim();
      const tgt = target.trim();
      if (!src || !tgt || src.toLowerCase() === tgt.toLowerCase()) return;
      const key = `${src.toLowerCase()}::${relation.toLowerCase()}::${tgt.toLowerCase()}`;
      if (relationsSeen.has(key)) return;
      relationsSeen.add(key);

      relations.push({
        source: src,
        target: tgt,
        relation,
        weight: Math.round(weight * 100) / 100,
        confidence: Math.round(conf * 100) / 100,
        contextSentence,
      });
    };

    // Split text into sentences for sentence-scoped relational extraction
    const sentences = text
      .split(/(?<=[.?!])\s+(?=[A-Z0-9"'])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    // Predicate patterns with directional semantics
    const predicateRules: Array<{
      pattern: RegExp;
      relation: string;
      sourceGroup: number;
      targetGroup: number;
      weight: number;
    }> = [
      {
        pattern: /(.+?)\s+(?:achieved|attained|demonstrated|completed)\s+(.+)/i,
        relation: 'achieved',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.9,
      },
      {
        pattern: /(.+?)\s+(?:developed by|created by|built by|designed by|engineered by|authored by)\s+(.+)/i,
        relation: 'developed_by',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.95,
      },
      {
        pattern: /(.+?)\s+(?:developed|created|built|designed|engineered|released|published)\s+(.+)/i,
        relation: 'developed',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.9,
      },
      {
        pattern: /(.+?)\s+(?:located in|based in|headquartered in|founded in)\s+(.+)/i,
        relation: 'located_in',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.88,
      },
      {
        pattern: /(.+?)\s+(?:measures|benchmarks|quantifies|evaluates|records)\s+(.+)/i,
        relation: 'measures',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.85,
      },
      {
        pattern: /(.+?)\s+(?:uses|utilizes|employs|relies on|powered by)\s+(.+)/i,
        relation: 'uses',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.85,
      },
      {
        pattern: /(.+?)\s+(?:is part of|is a component of|belongs to|subset of)\s+(.+)/i,
        relation: 'part_of',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.85,
      },
      {
        pattern: /(.+?)\s+(?:improves|accelerates|boosts|outperforms|exceeds)\s+(.+)/i,
        relation: 'improves',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.88,
      },
      {
        pattern: /(.+?)\s+(?:links to|references|points to|cites)\s+(.+)/i,
        relation: 'links_to',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.82,
      },
      {
        pattern: /(.+?)\s+(?:consists of|contains|features|includes)\s+(.+)/i,
        relation: 'contains',
        sourceGroup: 1,
        targetGroup: 2,
        weight: 0.8,
      },
    ];

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();

      // Find all entities present in this sentence
      const presentEntities = entities.filter((e) =>
        lowerSentence.includes(e.normalizedName)
      );

      if (presentEntities.length >= 2) {
        let predicateMatched = false;

        // Try explicit predicate rules
        for (const rule of predicateRules) {
          const match = rule.pattern.exec(sentence);
          if (match) {
            const leftText = match[rule.sourceGroup].toLowerCase();
            const rightText = match[rule.targetGroup].toLowerCase();

            const leftEntity = presentEntities.find((e) => leftText.includes(e.normalizedName));
            const rightEntity = presentEntities.find((e) => rightText.includes(e.normalizedName));

            if (leftEntity && rightEntity && leftEntity.name !== rightEntity.name) {
              addRelation(
                leftEntity.name,
                rule.relation,
                rightEntity.name,
                rule.weight,
                0.9,
                sentence
              );
              predicateMatched = true;
            }
          }
        }

        // If no explicit verb rule matched, extract pairwise co-occurrence relations
        if (!predicateMatched) {
          for (let i = 0; i < presentEntities.length; i++) {
            for (let j = i + 1; j < presentEntities.length; j++) {
              const e1 = presentEntities[i];
              const e2 = presentEntities[j];

              // Semantic relation inferencing based on entity types
              let relName = 'associated_with';
              let weight = 0.65;

              if (e1.type === 'organization' && e2.type === 'technology') {
                relName = 'develops';
                weight = 0.8;
                addRelation(e1.name, relName, e2.name, weight, 0.75, sentence);
              } else if (e1.type === 'technology' && e2.type === 'organization') {
                relName = 'developed_by';
                weight = 0.8;
                addRelation(e1.name, relName, e2.name, weight, 0.75, sentence);
              } else if (e1.type === 'person' && e2.type === 'organization') {
                relName = 'affiliated_with';
                weight = 0.8;
                addRelation(e1.name, relName, e2.name, weight, 0.75, sentence);
              } else if (e1.type === 'technology' && e2.type === 'metric') {
                relName = 'measures';
                weight = 0.82;
                addRelation(e1.name, relName, e2.name, weight, 0.8, sentence);
              } else if (e1.type === 'concept' && e2.type === 'technology') {
                relName = 'implemented_by';
                weight = 0.75;
                addRelation(e1.name, relName, e2.name, weight, 0.75, sentence);
              } else if (e1.type === 'organization' && e2.type === 'location') {
                relName = 'located_in';
                weight = 0.85;
                addRelation(e1.name, relName, e2.name, weight, 0.8, sentence);
              } else {
                addRelation(e1.name, relName, e2.name, weight, 0.65, sentence);
              }
            }
          }
        }
      }
    }

    return relations;
  }

  private containsWholePhrase(text: string, phrase: string): boolean {
    const idx = text.indexOf(phrase);
    if (idx === -1) return false;
    const before = idx === 0 ? ' ' : text[idx - 1];
    const after = idx + phrase.length >= text.length ? ' ' : text[idx + phrase.length];
    return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
  }

  private titleCase(str: string): string {
    return str
      .split(' ')
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');
  }

  private preserveTechCase(tech: string): string {
    const customCase: Record<string, string> = {
      'javascript': 'JavaScript',
      'typescript': 'TypeScript',
      'python': 'Python',
      'rust': 'Rust',
      'c++': 'C++',
      'go': 'Go',
      'golang': 'Go',
      'react': 'React',
      'vue': 'Vue.js',
      'next.js': 'Next.js',
      'node.js': 'Node.js',
      'qpu': 'QPU',
      'gpu': 'GPU',
      'tpu': 'TPU',
      'sycamore': 'Sycamore',
      'eagle': 'Eagle',
      'condor': 'Condor',
      'gpt-4': 'GPT-4',
      'gpt-3': 'GPT-3',
      'pytorch': 'PyTorch',
      'tensorflow': 'TensorFlow',
      'websocket': 'WebSocket',
      'graphql': 'GraphQL',
      'sqlite': 'SQLite',
      'redis': 'Redis',
      'postgres': 'PostgreSQL',
      'postgresql': 'PostgreSQL',
      'faiss': 'FAISS',
    };
    return customCase[tech.toLowerCase()] || this.titleCase(tech);
  }
}
