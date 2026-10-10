import * as cheerio from 'cheerio';
import { SpiderSpecialization } from '../../../../shared/types.js';
import { ExtractedTarget } from '../types.js';
import { BaseStrategy } from './BaseStrategy.js';

export class MediaExtractionStrategy extends BaseStrategy {
  specialization: SpiderSpecialization = 'media';

  extract(html: string, pageUrl: string): ExtractedTarget[] {
    const $ = cheerio.load(html);
    const targets: ExtractedTarget[] = [];
    let counter = 0;

    // 1. Extract Figures and Image tags
    $('figure, img').each((i, el) => {
      const node = $(el);
      let imgNode = node;
      let figcaption = '';

      if (el.tagName.toLowerCase() === 'figure') {
        const foundImg = node.find('img');
        if (foundImg.length > 0) {
          imgNode = foundImg.first();
        }
        figcaption = this.cleanText(node.find('figcaption').text());
      } else {
        // If image is inside a figure, skip bare img to avoid duplicates
        if (node.closest('figure').length > 0) return;
      }

      const rawSrc = (imgNode.attr('src') || imgNode.attr('data-src') || '').trim();
      if (!rawSrc) return;

      counter++;
      let absoluteSrc = rawSrc;
      try {
        if (!rawSrc.startsWith('http://') && !rawSrc.startsWith('https://') && !rawSrc.startsWith('data:')) {
          const baseUrl = pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`;
          absoluteSrc = new URL(rawSrc, baseUrl).href;
        }
      } catch {
        absoluteSrc = rawSrc;
      }

      const alt = this.cleanText(imgNode.attr('alt') || '');
      const title = this.cleanText(imgNode.attr('title') || '');
      const width = parseInt(imgNode.attr('width') || '640', 10);
      const height = parseInt(imgNode.attr('height') || '360', 10);

      const selector = this.generateSelector($, el);
      const boundingBox = this.estimateBoundingBox($, el, counter, 8, 'img');

      const facts: string[] = [];
      const description = figcaption || alt || title || 'Visual asset in document flow';
      facts.push(`Visual media resource: "${description}"`);
      facts.push(`Media resolution metrics: ${width}x${height}px, source: ${absoluteSrc}`);

      targets.push({
        id: `media-img-${counter}-${Math.random().toString(36).slice(2, 7)}`,
        selector,
        tag: el.tagName.toLowerCase(),
        contentType: 'image',
        specialization: 'media',
        rawText: `[Image: ${description}] (${absoluteSrc})`,
        extractedFacts: facts,
        boundingBox,
        confidence: alt || figcaption ? 0.95 : 0.88,
        priority: 88,
        metadata: {
          tag: el.tagName.toLowerCase(),
          src: absoluteSrc,
          alt,
          title,
          caption: figcaption,
          width,
          height,
          aspectRatio: width && height ? +(width / height).toFixed(2) : 1.77
        }
      });
    });

    // 2. Extract SVGs with diagrams or icons
    $('svg').each((i, svgEl) => {
      const node = $(svgEl);
      if (node.closest('figure').length > 0) return;

      counter++;
      const selector = this.generateSelector($, svgEl);
      const title = this.cleanText(node.find('title').text()) || 'Vector graphic diagram';
      const boundingBox = this.estimateBoundingBox($, svgEl, counter, 8, 'figure');

      targets.push({
        id: `media-svg-${counter}-${Math.random().toString(36).slice(2, 7)}`,
        selector,
        tag: 'svg',
        contentType: 'image',
        specialization: 'media',
        rawText: `[SVG Graphic: ${title}]`,
        extractedFacts: [`Embedded vector graphic illustration: "${title}"`],
        boundingBox,
        confidence: 0.90,
        priority: 70,
        metadata: {
          tag: 'svg',
          title,
          isVector: true
        }
      });
    });

    return targets;
  }
}
