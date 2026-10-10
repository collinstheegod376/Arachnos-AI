import * as cheerio from 'cheerio';
import { SpiderSpecialization } from '../../../../shared/types.js';
import { ExtractedTarget } from '../types.js';
import { BaseStrategy } from './BaseStrategy.js';

export class LinkExtractionStrategy extends BaseStrategy {
  specialization: SpiderSpecialization = 'link';

  extract(html: string, pageUrl: string): ExtractedTarget[] {
    const $ = cheerio.load(html);
    const targets: ExtractedTarget[] = [];
    const elements = $('a[href]').toArray();

    elements.forEach((el, index) => {
      const node = $(el);
      const rawHref = (node.attr('href') || '').trim();
      const text = this.cleanText(node.text());

      // Skip empty or javascript links
      if (!rawHref || rawHref.startsWith('javascript:') || (!text && !node.find('img').length)) {
        return;
      }

      let absoluteUrl = rawHref;
      let linkType: 'fragment' | 'internal' | 'external' = 'internal';

      try {
        if (rawHref.startsWith('#')) {
          linkType = 'fragment';
          absoluteUrl = `${pageUrl}${rawHref}`;
        } else if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
          const urlObj = new URL(rawHref);
          const pageHost = new URL(pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`).hostname;
          linkType = urlObj.hostname === pageHost ? 'internal' : 'external';
          absoluteUrl = rawHref;
        } else {
          // Relative URL
          const baseUrl = pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`;
          absoluteUrl = new URL(rawHref, baseUrl).href;
          linkType = 'internal';
        }
      } catch {
        absoluteUrl = rawHref;
      }

      const selector = this.generateSelector($, el);
      const boundingBox = this.estimateBoundingBox($, el, index, elements.length, 'a');
      const displayText = text || (node.attr('title') || absoluteUrl);

      // Parent container context
      const parentText = this.cleanText(node.parent().text()).slice(0, 140);
      const facts = [
        `Hyperlink: "${displayText}" pointing to destination: ${absoluteUrl}`,
        `Link classification: ${linkType.toUpperCase()} reference in context: "${parentText}"`
      ];

      let priority = 60;
      let confidence = 0.92;

      if (node.closest('nav, .toc, header').length > 0) {
        priority = 85;
        confidence = 0.96;
      } else if (linkType === 'external') {
        priority = 75;
        confidence = 0.94;
      }

      targets.push({
        id: `link-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
        selector,
        tag: 'a',
        contentType: 'link',
        specialization: 'link',
        rawText: `[${displayText}](${absoluteUrl})`,
        extractedFacts: facts,
        boundingBox,
        confidence,
        priority,
        metadata: {
          tag: 'a',
          href: absoluteUrl,
          rawHref,
          linkType,
          anchorText: displayText,
          isExternal: linkType === 'external',
          target: node.attr('target') || '_self'
        }
      });
    });

    return targets;
  }
}
