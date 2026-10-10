import { Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { SAMPLE_PAGES, getSamplePage } from './samplePages.js';

/**
 * Client-side script injected into sandboxed iframe pages
 * Overrides frame-busting scripts and maps bounding boxes via getBoundingClientRect()
 */
const INJECTED_TRACKER_SCRIPT = `
<!-- ARACHNOS CLIENT COORDINATE TRACKER & SANDBOX SHIELD -->
<script>
(function() {
  // 1. Defeat frame-busting scripts
  try {
    Object.defineProperty(window, 'top', { get: function() { return window.self; } });
    Object.defineProperty(window, 'parent', { get: function() { return window.self; } });
  } catch(e) {}

  // 2. Element coordinate scanner
  function scanBoundingBoxes() {
    var targets = [];
    var selectors = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'blockquote',
      'table', 'ul', 'ol', 'dl',
      'figure', 'img', 'svg',
      'a[href]'
    ];

    var elements = document.querySelectorAll(selectors.join(','));
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var rect = el.getBoundingClientRect();
      var scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
      var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

      // Only include elements with visible area
      if (rect.width > 5 && rect.height > 5) {
        var id = el.id ? '#' + el.id : null;
        var tag = el.tagName.toLowerCase();
        var selector = id || (tag + ':nth-of-type(' + (i + 1) + ')');

        targets.push({
          selector: selector,
          tag: tag,
          text: (el.innerText || el.textContent || '').slice(0, 150).trim(),
          box: {
            x: Math.round(rect.left + scrollX),
            y: Math.round(rect.top + scrollY),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
          }
        });
      }
    }

    // Post coordinates back to Arachnos parent canvas
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'arachnos_dom_coordinates',
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        elements: targets
      }, '*');
    }
  }

  // Run on load and after resource renders
  if (document.readyState === 'complete') {
    setTimeout(scanBoundingBoxes, 300);
  } else {
    window.addEventListener('load', function() {
      setTimeout(scanBoundingBoxes, 300);
    });
  }

  window.addEventListener('resize', scanBoundingBoxes);

  // Smooth scroll support from parent command
  window.addEventListener('message', function(ev) {
    if (ev.data && ev.data.type === 'arachnos_scroll_to') {
      window.scrollTo({
        left: ev.data.x || 0,
        top: ev.data.y || 0,
        behavior: 'smooth'
      });
    }
  });
})();
</script>
<style>
  /* Arachnos Sandbox Canvas adjustments */
  html, body {
    scroll-behavior: smooth !important;
  }
  /* Prevent pointer click-jacking when spiders are crawling */
  a {
    cursor: pointer !important;
  }
</style>
`;

/**
 * Rewrites relative URLs in HTML string to absolute URLs or proxied URLs
 */
export function rewriteHtmlAssets(html: string, baseUrl: string, proxyBaseUrl: string = '/api/proxy?url='): string {
  if (!html || typeof html !== 'string') {
    return '<!DOCTYPE html><html><body><div id="arachnos-empty"></div></body></html>';
  }

  try {
    const $ = cheerio.load(html);

    // Strip in-HTML restrictive meta tags (CSP, X-Frame-Options)
    $('meta[http-equiv="Content-Security-Policy" i]').remove();
    $('meta[http-equiv="X-Frame-Options" i]').remove();

    // Resolve base href if present
    let resolvedBase = baseUrl;
    try {
      const baseTag = $('base').attr('href');
      if (baseTag) {
        resolvedBase = new URL(baseTag, baseUrl).href;
        $('base').remove();
      }
    } catch {}

    // Rewrite images, scripts, stylesheets to absolute URLs
    $('img, script, source, audio, video').each((_, el) => {
      const node = $(el);
      const src = node.attr('src');
      if (src && !src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
        try {
          node.attr('src', new URL(src, resolvedBase).href);
        } catch {}
      }
    });

    $('link[rel="stylesheet"]').each((_, el) => {
      const node = $(el);
      const href = node.attr('href');
      if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
        try {
          node.attr('href', new URL(href, resolvedBase).href);
        } catch {}
      }
    });

    // Rewrite hyperlinks to route through proxy
    $('a[href]').each((_, el) => {
      const node = $(el);
      const href = node.attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const absUrl = new URL(href, resolvedBase).href;
          node.attr('href', `${proxyBaseUrl}${encodeURIComponent(absUrl)}`);
          node.attr('target', '_self');
        } catch {}
      }
    });

    // Inject coordinate script right before </body> or at the end
    if ($('body').length > 0) {
      $('body').append(INJECTED_TRACKER_SCRIPT);
    } else {
      $.root().append(INJECTED_TRACKER_SCRIPT);
    }

    return $.html();
  } catch (err) {
    console.warn('[Proxy] Failed to rewrite HTML assets:', err);
    return html + INJECTED_TRACKER_SCRIPT;
  }
}

/**
 * Express Route Handler: /api/proxy
 */
export async function proxyHandler(req: Request, res: Response): Promise<void> {
  const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Type-Options');

  if (!targetUrl) {
    res.status(400).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Arachnos Proxy - Missing URL</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #05070b; color: #f8fafc; padding: 40px; }
    .card { max-width: 600px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; }
    h2 { color: #38bdf8; margin-top: 0; }
    p { color: #94a3b8; line-height: 1.6; }
    code { background: #1e293b; color: #fbbf24; padding: 2px 6px; border-radius: 4px; }
    a { color: #38bdf8; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    .btn { display: inline-block; background: #0284c7; color: white; padding: 8px 16px; border-radius: 6px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🕷️ Arachnos Sandbox Proxy</h2>
    <p>Missing required target <code>url</code> query parameter.</p>
    <p>Usage: <code>/api/proxy?url=https://example.com</code> or select a preset sample.</p>
    <a class="btn" href="/api/proxy?url=quantum-computing">Load Quantum Computing Preset</a>
  </div>
</body>
</html>`);
    return;
  }

  // 1. Check for preloaded sample pages
  const sample = getSamplePage(targetUrl);
  if (sample) {
    const processedHtml = rewriteHtmlAssets(sample.html, sample.url);
    res.setHeader('X-Arachnos-Sample', sample.id);
    res.send(processedHtml);
    return;
  }

  // 2. Fetch external target page
  let fetchUrl = targetUrl;
  if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
    fetchUrl = `https://${fetchUrl}`;
  }

  try {
    // Validate URL format
    new URL(fetchUrl);

    const response = await axios.get(fetchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ArachnosSpider/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      responseType: 'text',
      maxRedirects: 5
    });

    const rewrittenHtml = rewriteHtmlAssets(String(response.data), fetchUrl);
    res.setHeader('X-Arachnos-Proxied-Url', fetchUrl);
    res.send(rewrittenHtml);
  } catch (err: any) {
    console.warn(`[Proxy] Live fetch error for ${fetchUrl}: ${err.message}. Serving resilient fallback page.`);
    const fallbackSample = SAMPLE_PAGES['quantum-computing'] || Object.values(SAMPLE_PAGES)[0];
    if (fallbackSample) {
      const processedHtml = rewriteHtmlAssets(fallbackSample.html, fallbackSample.url);
      res.setHeader('X-Arachnos-Fallback', 'true');
      res.setHeader('X-Arachnos-Error', encodeURIComponent(err.message || 'fetch_failed'));
      res.send(processedHtml);
    } else {
      res.status(502).send(`<!DOCTYPE html>
<html>
<head><title>Arachnos Proxy Error</title></head>
<body style="font-family:sans-serif;padding:30px;background:#05070b;color:#f8fafc;">
  <h2>🕷️ Arachnos Proxy Error</h2>
  <p>Failed to retrieve <code>${fetchUrl}</code>: ${err.message}</p>
</body>
</html>`);
    }
  }
}

/**
 * Returns available preloaded sample pages metadata
 */
export function samplePagesHandler(req: Request, res: Response): void {
  const list = Object.values(SAMPLE_PAGES).map(p => ({
    id: p.id,
    title: p.title,
    category: p.category,
    description: p.description,
    url: p.url
  }));
  res.json({ samples: list });
}
