import { BoundingBox, ContentType, SpiderSpecialization } from '../../../shared/types.js';

export interface ExtractedTarget {
  id: string;
  selector: string;
  tag: string;
  contentType: ContentType;
  specialization: SpiderSpecialization;
  rawText: string;
  extractedFacts: string[];
  boundingBox: BoundingBox;
  confidence: number;
  priority: number;
  metadata: {
    tag?: string;
    href?: string;
    src?: string;
    alt?: string;
    rowCount?: number;
    colCount?: number;
    depth?: number;
    attributes?: Record<string, string>;
    [key: string]: any;
  };
}

export interface CrawlTargetTerritory {
  spiderId: string;
  specialization: SpiderSpecialization;
  zone: 'top' | 'middle' | 'bottom' | 'all';
  assignedTargets: ExtractedTarget[];
}

export interface CoordinatorOptions {
  spiderCount?: number;
  focusMode?: 'all' | 'text' | 'media' | 'structure';
  stepIntervalMs?: number;
  moveDurationMs?: number;
  autoStart?: boolean;
}

export interface SamplePageDefinition {
  id: string;
  title: string;
  category: string;
  description: string;
  url: string;
  html: string;
}
