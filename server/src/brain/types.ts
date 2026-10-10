import type {
  BoundingBox,
  SpiderSpecialization,
  ContentType,
  HarvestEvent,
  EntityNode,
  EntityRelation,
  BrainProcessedEvent,
  KnowledgeReadyEvent,
  Citation,
  QueryRequest,
  QueryResponse,
} from '../../../shared/types.js';

export type {
  BoundingBox,
  SpiderSpecialization,
  ContentType,
  HarvestEvent,
  EntityNode,
  EntityRelation,
  BrainProcessedEvent,
  KnowledgeReadyEvent,
  Citation,
  QueryRequest,
  QueryResponse,
};

export type EntityCategory = EntityNode['type'];

export interface ExtractedEntity {
  name: string;
  type: EntityCategory;
  confidence: number;
  normalizedName: string;
  span?: [number, number];
}

export interface ExtractedRelation {
  source: string;
  target: string;
  relation: string;
  weight: number;
  confidence: number;
  contextSentence?: string;
}

export interface ProcessedChunk {
  id: string;
  spider_id: string;
  timestamp: string;
  page_url: string;
  element_selector: string;
  bounding_box: BoundingBox;
  content_type: ContentType;
  raw_text: string;
  normalized_text: string;
  extracted_facts: string[];
  metadata?: Record<string, any>;
  confidence: number;
  tokens: string[];
  stemmedTokens: string[];
  vector: number[];
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

export interface VectorSearchResult {
  chunk: ProcessedChunk;
  score: number;
  cosineScore: number;
  bm25Score: number;
  matchedTerms: string[];
}

export interface SubgraphResult {
  nodes: EntityNode[];
  relations: EntityRelation[];
  rootEntityIds: string[];
}

export interface BrainStats {
  totalChunks: number;
  totalEntities: number;
  totalRelations: number;
  indexSizeKb: number;
  lastHarvestTimestamp: string;
  vectorDimensions: number;
  vocabularySize: number;
}
