import * as cheerio from 'cheerio';
import { SpiderSpecialization } from '../../../../shared/types.js';
import { ExtractedTarget } from '../types.js';
import { BaseStrategy } from './BaseStrategy.js';

export class TextExtractionStrategy extends BaseStrategy {
  specialization: SpiderSpecialization = 'text';

  extract(html: string, pageUrl: string): ExtractedTarget[] {
    const $ = cheerio.load(html);
    const targets: ExtractedTarget[] = [];
    const elements = $('h1, h2, h3, h4, p, blockquote').toArray();

    elements.forEach((el, index) => {
      const node = $(el);
      const text = this.cleanText(node.text());

      // Ignore empty or trivial texts
      if (!text || text.length < 8) return;

      const tagName = el.tagName.toLowerCase();
      const isHeading = tagName.startsWith('h');
      const selector = this.generateSelector($, el);
      const boundingBox = this.estimateBoundingBox($, el, index, elements.length, tagName);
      const facts = this.extractKeyFacts(text, isHeading ? 2 : 4);

      let priority = 50;
      let confidence = 0.90;

      if (tagName === 'h1') {
        priority = 100;
        confidence = 0.98;
      } else if (tagName === 'h2') {
        priority = 90;
        confidence = 0.95;
      } else if (tagName === 'h3' || tagName === 'h4') {
        priority = 80;
        confidence = 0.92;
      } else if (tagName === 'blockquote') {
        priority = 75;
        confidence = 0.93;
      } else if (tagName === 'p') {
        priority = Math.min(85, Math.max(40, text.length > 80 ? 70 : 50));
        confidence = 0.88;
      }

      targets.push({
        id: `text-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
        selector,
        tag: tagName,
        contentType: isHeading ? 'heading' : 'paragraph',
        specialization: 'text',
        rawText: text,
        extractedFacts: facts,
        boundingBox,
        confidence,
        priority,
        metadata: {
          tag: tagName,
          length: text.length,
          wordCount: text.split(/\s+/).length,
          readingTimeSeconds: Math.ceil(text.split(/\s+/).length / 3.5),
          isHeading
        }
      });
    });

    return targets;
  }
}
