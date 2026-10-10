import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { BoundingBox, ContentType, SpiderSpecialization } from '../../../../shared/types.js';
import { ExtractedTarget } from '../types.js';

export interface ExtractionStrategy {
  specialization: SpiderSpecialization;
  extract(html: string, pageUrl: string): ExtractedTarget[];
}

/**
 * Base helper functions for DOM extraction and geometry estimation
 */
export abstract class BaseStrategy implements ExtractionStrategy {
  abstract specialization: SpiderSpecialization;
  abstract extract(html: string, pageUrl: string): ExtractedTarget[];

  /**
   * Generates a stable, unique CSS selector for a Cheerio element
   */
  protected generateSelector($: cheerio.CheerioAPI, el: Element): string {
    const node = $(el);
    const id = node.attr('id');
    if (id && !id.includes(':') && !id.includes('.')) {
      return `#${id}`;
    }

    const tagName = el.tagName.toLowerCase();
    const className = node.attr('class');
    const classSelector = className
      ? '.' + className.trim().split(/\s+/).filter(c => c.length > 0 && !c.includes(':')).slice(0, 2).join('.')
      : '';

    // Check parent context
    const parent = node.parent();
    if (parent.length > 0 && parent[0] && parent[0].tagName) {
      const parentId = parent.attr('id');
      if (parentId) {
        const index = parent.children(tagName).index(node) + 1;
        return `#${parentId} > ${tagName}${classSelector ? classSelector : `:nth-of-type(${index})`}`;
      }
      const parentTag = parent[0].tagName.toLowerCase();
      const index = parent.children(tagName).index(node) + 1;
      return `${parentTag} > ${tagName}:nth-of-type(${index})`;
    }

    return `${tagName}${classSelector}`;
  }

  /**
   * Cleans text content: removes multiple whitespaces and trims
   */
  protected cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Estimates 2D layout BoundingBox {x, y, w, h} from DOM hierarchy and content metrics
   * Calibrated for standard desktop browser canvas (width ~1024px)
   */
  protected estimateBoundingBox(
    $: cheerio.CheerioAPI,
    el: Element,
    index: number,
    totalElements: number,
    tag: string
  ): BoundingBox {
    const node = $(el);
    const textLen = (node.text() || '').trim().length;

    // Viewport constants
    const canvasWidth = 1000;
    const paddingLeft = 48;
    const contentWidth = 720;

    // Estimate vertical progression based on order and accumulated height
    const baseTop = 90;
    const stepHeight = Math.max(48, Math.min(220, Math.floor(textLen / 2) + 40));
    const estimatedY = baseTop + index * 58;

    let boxWidth = contentWidth;
    let boxHeight = 36;
    let boxX = paddingLeft;

    if (tag.startsWith('h1')) {
      boxWidth = contentWidth;
      boxHeight = 52;
    } else if (tag.startsWith('h2')) {
      boxWidth = contentWidth;
      boxHeight = 42;
    } else if (tag.startsWith('h3')) {
      boxWidth = contentWidth - 40;
      boxHeight = 34;
    } else if (tag === 'p') {
      boxWidth = contentWidth;
      boxHeight = Math.max(32, Math.min(180, Math.ceil(textLen / 65) * 24));
    } else if (tag === 'table') {
      boxWidth = contentWidth + 80;
      const rows = node.find('tr').length || 4;
      boxHeight = Math.min(450, rows * 44 + 40);
    } else if (tag === 'figure' || tag === 'img') {
      const wAttr = parseInt(node.attr('width') || '640', 10);
      const hAttr = parseInt(node.attr('height') || '360', 10);
      boxWidth = Math.min(contentWidth, wAttr || 640);
      boxHeight = Math.min(420, hAttr || 320);
      boxX = paddingLeft + (contentWidth - boxWidth) / 2;
    } else if (tag === 'a') {
      boxWidth = Math.min(contentWidth - 60, Math.max(80, textLen * 9));
      boxHeight = 24;
    } else if (tag === 'ul' || tag === 'ol') {
      boxWidth = contentWidth - 20;
      const items = node.find('li').length || 3;
      boxHeight = items * 28 + 16;
    } else if (tag === 'aside' || node.hasClass('infobox')) {
      boxWidth = 300;
      boxHeight = 340;
      boxX = canvasWidth - 320;
    }

    return {
      x: Math.round(Math.max(10, boxX)),
      y: Math.round(Math.max(20, estimatedY)),
      w: Math.round(boxWidth),
      h: Math.round(boxHeight)
    };
  }

  /**
   * Breaks text into key atomic facts
   */
  protected extractKeyFacts(text: string, maxFacts: number = 4): string[] {
    if (!text || text.length < 15) return [];

    // Split by sentence terminators
    const rawSentences = text
      .split(/(?<=[.?!])\s+(?=[A-Z0-9"'])/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 250);

    if (rawSentences.length > 0) {
      return rawSentences.slice(0, maxFacts);
    }

    return [text.slice(0, 160).trim()];
  }
}
