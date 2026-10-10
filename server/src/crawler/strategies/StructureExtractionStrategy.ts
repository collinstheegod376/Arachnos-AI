import * as cheerio from 'cheerio';
import { SpiderSpecialization } from '../../../../shared/types.js';
import { ExtractedTarget } from '../types.js';
import { BaseStrategy } from './BaseStrategy.js';

export class StructureExtractionStrategy extends BaseStrategy {
  specialization: SpiderSpecialization = 'structure';

  extract(html: string, pageUrl: string): ExtractedTarget[] {
    const $ = cheerio.load(html);
    const targets: ExtractedTarget[] = [];
    let counter = 0;

    // 1. Extract Tables
    $('table').each((i, tableEl) => {
      counter++;
      const node = $(tableEl);
      const headers: string[] = [];
      node.find('th').each((_, th) => {
        headers.push(this.cleanText($(th).text()));
      });

      const rows: string[][] = [];
      node.find('tr').each((_, tr) => {
        const rowCells: string[] = [];
        $(tr).find('td').each((_, td) => {
          rowCells.push(this.cleanText($(td).text()));
        });
        if (rowCells.length > 0) {
          rows.push(rowCells);
        }
      });

      const selector = this.generateSelector($, tableEl);
      const boundingBox = this.estimateBoundingBox($, tableEl, counter, 10, 'table');

      const facts: string[] = [];
      if (headers.length > 0) {
        facts.push(`Table schema columns: [${headers.join(', ')}]`);
      }
      rows.slice(0, 5).forEach(row => {
        if (headers.length === row.length) {
          const pairs = row.map((val, idx) => `${headers[idx]}: ${val}`).join(' | ');
          facts.push(`Record: ${pairs}`);
        } else {
          facts.push(`Row data: ${row.join(' | ')}`);
        }
      });

      const rawSummary = `Table with ${headers.length} columns and ${rows.length} rows:\n` +
        (headers.length ? `Columns: ${headers.join(' | ')}\n` : '') +
        rows.map(r => r.join(' | ')).join('\n');

      targets.push({
        id: `struct-table-${counter}-${Math.random().toString(36).slice(2, 7)}`,
        selector,
        tag: 'table',
        contentType: 'table',
        specialization: 'structure',
        rawText: rawSummary,
        extractedFacts: facts,
        boundingBox,
        confidence: 0.96,
        priority: 95,
        metadata: {
          tag: 'table',
          headers,
          rowCount: rows.length,
          colCount: headers.length || (rows[0] ? rows[0].length : 0),
          rows: rows.slice(0, 10)
        }
      });
    });

    // 2. Extract Definition Lists & Infobox Key-Values
    $('dl').each((i, dlEl) => {
      counter++;
      const node = $(dlEl);
      const pairs: { key: string; val: string }[] = [];
      const dts = node.find('dt').toArray();
      const dds = node.find('dd').toArray();

      for (let j = 0; j < Math.min(dts.length, dds.length); j++) {
        const k = this.cleanText($(dts[j]).text());
        const v = this.cleanText($(dds[j]).text());
        if (k && v) {
          pairs.push({ key: k, val: v });
        }
      }

      if (pairs.length > 0) {
        const selector = this.generateSelector($, dlEl);
        const boundingBox = this.estimateBoundingBox($, dlEl, counter, 10, 'aside');
        const facts = pairs.map(p => `${p.key} is defined as "${p.val}"`);
        const rawText = pairs.map(p => `${p.key}: ${p.val}`).join('; ');

        targets.push({
          id: `struct-dl-${counter}-${Math.random().toString(36).slice(2, 7)}`,
          selector,
          tag: 'dl',
          contentType: 'list',
          specialization: 'structure',
          rawText,
          extractedFacts: facts,
          boundingBox,
          confidence: 0.94,
          priority: 85,
          metadata: {
            tag: 'dl',
            type: 'key-value',
            pairCount: pairs.length,
            attributes: pairs.reduce((acc, p) => ({ ...acc, [p.key]: p.val }), {})
          }
        });
      }
    });

    // 3. Extract Ordered/Unordered Lists with structural relevance
    $('ul, ol').each((i, listEl) => {
      const node = $(listEl);
      // Skip navigation menus or TOC which are handled by Link strategy
      if (node.closest('nav, .toc, header, footer').length > 0) return;

      const items: string[] = [];
      node.children('li').each((_, li) => {
        const t = this.cleanText($(li).text());
        if (t && t.length > 5) items.push(t);
      });

      if (items.length >= 2) {
        counter++;
        const tagName = listEl.tagName.toLowerCase();
        const selector = this.generateSelector($, listEl);
        const boundingBox = this.estimateBoundingBox($, listEl, counter, 10, tagName);
        const facts = items.slice(0, 5).map(item => `Structured item: ${item}`);

        targets.push({
          id: `struct-list-${counter}-${Math.random().toString(36).slice(2, 7)}`,
          selector,
          tag: tagName,
          contentType: 'list',
          specialization: 'structure',
          rawText: items.join('\n- '),
          extractedFacts: facts,
          boundingBox,
          confidence: 0.91,
          priority: 70,
          metadata: {
            tag: tagName,
            itemCount: items.length,
            items: items.slice(0, 10)
          }
        });
      }
    });

    // 4. Extract Structured Document Metadata (Meta & OpenGraph)
    const metaTags: { name: string; content: string }[] = [];
    $('meta[name], meta[property]').each((_, m) => {
      const node = $(m);
      const name = node.attr('name') || node.attr('property') || '';
      const content = node.attr('content') || '';
      if (name && content && !name.startsWith('viewport') && !name.startsWith('theme-color')) {
        metaTags.push({ name, content });
      }
    });

    if (metaTags.length > 0) {
      counter++;
      const facts = metaTags.map(m => `Metadata [${m.name}]: "${m.content}"`);
      targets.push({
        id: `struct-meta-${counter}-${Math.random().toString(36).slice(2, 7)}`,
        selector: 'head > meta',
        tag: 'meta',
        contentType: 'meta',
        specialization: 'structure',
        rawText: metaTags.map(m => `${m.name}=${m.content}`).join('; '),
        extractedFacts: facts,
        boundingBox: { x: 20, y: 15, w: 280, h: 40 },
        confidence: 0.98,
        priority: 90,
        metadata: {
          tag: 'meta',
          metaCount: metaTags.length,
          attributes: metaTags.reduce((acc, m) => ({ ...acc, [m.name]: m.content }), {})
        }
      });
    }

    return targets;
  }
}
