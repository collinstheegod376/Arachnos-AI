// ==========================================
// ARACHNOS PERSONAL — X (TWITTER) INTERACTION CONTENT SCRIPT
// Detects posts entering the viewport and asks the Brain for rule-based
// suggestions (X_SUGGEST). Performs like/repost/comment ONLY when the
// service worker sends X_EXECUTE after an explicit side-panel Confirm.
// No on-page UI. No automatic actions.
// ==========================================

(() => {
  if (window.__ARACHNOS_X_INJECTED__) return;
  window.__ARACHNOS_X_INJECTED__ = true;

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const SEND_INTERVAL_MS = 500;
  const EXECUTE_TIMEOUT_MS = 12000;

  let suggestionsEnabled = true;
  const seenUrls = new Set();          // canonical URLs already sent
  const sendQueue = [];                // pending {text,url,author}
  const queuedUrls = new Set();
  const visibleArticles = new Set();   // articles currently intersecting
  const observedArticles = new WeakSet();
  let queueTimer = null;
  let lastSendAt = 0;

  // ---------- Helpers ----------

  function extensionAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const humanDelay = (min = 300, max = 900) => sleep(min + Math.random() * (max - min));

  function waitFor(finder, timeout = 5000, interval = 100) {
    const find = typeof finder === 'string' ? () => document.querySelector(finder) : finder;
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        let el = null;
        try {
          el = find();
        } catch {
          el = null;
        }
        if (el) return resolve(el);
        if (Date.now() - start >= timeout) return resolve(null);
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function parseStatus(href) {
    if (!href) return null;
    const m = String(href).match(/(?:^|\/\/[^/]+)?\/([A-Za-z0-9_]{1,30})\/status(?:es)?\/(\d+)/);
    if (!m) return null;
    return { user: m[1], id: m[2], url: `https://x.com/${m[1]}/status/${m[2]}` };
  }

  function isInsideQuote(el, container = document) {
    if (!el) return false;
    const quote = el.closest('[role="link"][tabindex], [data-testid="quoteTweet"], [data-testid="tweetQuote"]');
    return !!(quote && container.contains(quote) && quote !== container);
  }

  function getStatusInfo(article) {
    // Canonical permalink = the status link wrapping the <time> element (excluding quote tweets)
    const allTimes = Array.from(article.querySelectorAll('time'));
    const primaryTime = allTimes.find((t) => !isInsideQuote(t, article));
    if (primaryTime) {
      const link = primaryTime.closest('a[href*="/status/"]');
      if (link && !isInsideQuote(link, article)) {
        const info = parseStatus(link.getAttribute('href'));
        if (info) return info;
      }
    }

    // Secondary check: any status link directly wrapping a time (not in a quote tweet)
    for (const time of allTimes) {
      if (isInsideQuote(time, article)) continue;
      const link = time.closest('a[href*="/status/"]');
      if (link && !isInsideQuote(link, article)) {
        const info = parseStatus(link.getAttribute('href'));
        if (info) return info;
      }
    }

    // Fallback: When viewing a dedicated permalink page (https://x.com/<user>/status/<id>),
    // the focal tweet's <time> is typically rendered without an <a> wrapper.
    // Extract the status URL from window.location.pathname if this article is the focal tweet.
    // Ensure quote tweets don't misattribute focal tweet URLs.
    if (!isInsideQuote(article, document)) {
      const pathInfo = parseStatus(window.location.pathname);
      if (pathInfo) {
        // If this article contains its own non-quote status anchor pointing to a different status ID,
        // it's another tweet in the thread (e.g. parent or reply), not the focal tweet.
        const otherStatusLink = Array.from(article.querySelectorAll('a[href*="/status/"]')).find((a) => {
          if (isInsideQuote(a, article)) return false;
          const s = parseStatus(a.getAttribute('href'));
          return s && s.id !== pathInfo.id;
        });
        if (!otherStatusLink) {
          return pathInfo;
        }
      }
    }

    return null;
  }

  function extractPost(article) {
    const info = getStatusInfo(article);
    if (!info) return null;

    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = (textEl ? textEl.innerText || textEl.textContent || '' : '').trim();

    let author = null;
    const userName = article.querySelector('[data-testid="User-Name"]');
    if (userName && info.user) {
      const targetUserLower = info.user.toLowerCase();
      // Look for author profile link matching the canonical username from the tweet status
      for (const a of userName.querySelectorAll('a[href^="/"]')) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/^\/([A-Za-z0-9_]{1,30})\/?$/);
        if (m && m[1].toLowerCase() === targetUserLower) {
          author = '@' + m[1];
          break;
        }
      }
      // If display name contains "@" (e.g. "Jane @ DevRel"), do NOT pick @DevRel.
      // Search specifically for the handle span that matches @<canonical_user>.
      if (!author) {
        const allSpans = Array.from(userName.querySelectorAll('span'));
        const handleSpan = allSpans.find((s) => (s.textContent || '').trim().toLowerCase() === '@' + targetUserLower);
        if (handleSpan) {
          author = handleSpan.textContent.trim();
        }
      }
    }
    // Fallback to canonical username from status info
    if (!author) author = '@' + info.user;

    return { text, url: info.url, author };
  }

  // ---------- Suggestion queue ----------

  function enqueueArticle(article) {
    if (!suggestionsEnabled || !extensionAlive()) return;
    if (!article || !article.isConnected) return;
    const post = extractPost(article);
    if (!post || !post.text) return; // media-only / not yet rendered: retry later
    if (seenUrls.has(post.url) || queuedUrls.has(post.url)) return;
    queuedUrls.add(post.url);
    sendQueue.push(post);
    scheduleQueue();
  }

  function scheduleQueue() {
    if (queueTimer || sendQueue.length === 0) return;
    const wait = Math.max(0, SEND_INTERVAL_MS - (Date.now() - lastSendAt));
    queueTimer = setTimeout(processQueue, wait);
  }

  function processQueue() {
    queueTimer = null;
    if (!suggestionsEnabled || !extensionAlive()) {
      sendQueue.length = 0;
      queuedUrls.clear();
      return;
    }
    const post = sendQueue.shift();
    if (!post) return;
    queuedUrls.delete(post.url);
    if (!seenUrls.has(post.url)) {
      seenUrls.add(post.url);
      lastSendAt = Date.now();
      try {
        chrome.runtime.sendMessage({ type: 'X_SUGGEST', payload: post }, () => {
          // Swallow "no receiver" errors silently
          void chrome.runtime.lastError;
        });
      } catch {
        // extension context invalidated
      }
    }
    scheduleQueue();
  }

  // ---------- Observers ----------

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visibleArticles.add(entry.target);
          enqueueArticle(entry.target);
        } else {
          visibleArticles.delete(entry.target);
        }
      }
    },
    { threshold: 0.15 }
  );

  function unobserveArticle(article) {
    if (!article) return;
    try {
      intersectionObserver.unobserve(article);
    } catch {
      // ignore
    }
    visibleArticles.delete(article);
  }

  function observeArticles(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const list = [];
    if (scope.matches && scope.matches(TWEET_SELECTOR)) list.push(scope);
    scope.querySelectorAll(TWEET_SELECTOR).forEach((a) => list.push(a));
    for (const article of list) {
      if (observedArticles.has(article)) continue;
      observedArticles.add(article);
      intersectionObserver.observe(article);
    }
  }

  const mutationObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) observeArticles(node);
      }
      for (const node of m.removedNodes) {
        if (node.nodeType === 1) {
          if (node.matches && node.matches(TWEET_SELECTOR)) {
            unobserveArticle(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll(TWEET_SELECTOR).forEach(unobserveArticle);
          }
        }
      }
    }
    // Clean up detached articles from visible set and unobserve
    for (const a of visibleArticles) {
      if (!a.isConnected) unobserveArticle(a);
    }
  });

  mutationObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
  observeArticles(document);

  // Re-check visible tweets periodically (text may render after the article)
  setInterval(() => {
    if (!suggestionsEnabled) return;
    for (const a of visibleArticles) {
      if (!a.isConnected) {
        unobserveArticle(a);
      } else {
        enqueueArticle(a);
      }
    }
  }, 2000);

  // ---------- Settings ----------

  function setSuggestionsEnabled(value) {
    const next = value !== false;
    if (next === suggestionsEnabled) return;
    suggestionsEnabled = next;
    if (!suggestionsEnabled) {
      sendQueue.length = 0;
      queuedUrls.clear();
      if (queueTimer) {
        clearTimeout(queueTimer);
        queueTimer = null;
      }
    } else {
      for (const a of visibleArticles) enqueueArticle(a);
    }
  }

  try {
    chrome.storage.local.get(['xSuggestionsEnabled'], (res) => {
      if (chrome.runtime.lastError || !res) return;
      if (res.xSuggestionsEnabled !== undefined) setSuggestionsEnabled(res.xSuggestionsEnabled);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.xSuggestionsEnabled) {
        setSuggestionsEnabled(changes.xSuggestionsEnabled.newValue);
      }
    });
  } catch {
    // ignore
  }

  // ---------- Action execution (only on explicit X_EXECUTE) ----------

  function findArticleByStatusId(id) {
    const articles = document.querySelectorAll(TWEET_SELECTOR);
    // Prefer canonical permalink match
    for (const a of articles) {
      const info = getStatusInfo(a);
      if (info && info.id === id) return a;
    }
    // Fallback: any status link in the article pointing to this id (excluding quoted tweets)
    for (const a of articles) {
      for (const link of a.querySelectorAll('a[href*="/status/"]')) {
        const info = parseStatus(link.getAttribute('href'));
        if (info && info.id === id && link.closest(TWEET_SELECTOR) === a) {
          const quoted = link.closest('[role="link"][tabindex]');
          if (!quoted || !a.contains(quoted) || quoted === a) return a;
        }
      }
    }
    return null;
  }

  function isEnabled(btn) {
    return btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
  }

  function clickEl(el) {
    try {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {
      // ignore
    }
    el.click();
  }

  async function doLike(article) {
    if (article.querySelector('[data-testid="unlike"]')) return { success: true };
    const btn = article.querySelector('[data-testid="like"]');
    if (!btn) return { success: false, error: 'Like button not found' };
    if (!isEnabled(btn)) return { success: false, error: 'Like button is disabled' };
    clickEl(btn);
    const ok = await waitFor(() => article.querySelector('[data-testid="unlike"]'), 4000);
    return ok ? { success: true } : { success: false, error: 'Like did not register' };
  }

  async function doRepost(article) {
    if (article.querySelector('[data-testid="unretweet"]')) return { success: true };
    const btn = article.querySelector('[data-testid="retweet"]');
    if (!btn) return { success: false, error: 'Repost button not found' };
    if (!isEnabled(btn)) return { success: false, error: 'Repost button is disabled' };
    clickEl(btn);
    const confirm = await waitFor('[data-testid="retweetConfirm"]', 4000);
    if (!confirm) return { success: false, error: 'Repost menu did not appear' };
    if (!isEnabled(confirm)) return { success: false, error: 'Repost confirm button is disabled' };
    await humanDelay();
    confirm.click();
    const ok = await waitFor(() => article.querySelector('[data-testid="unretweet"]'), 4000);
    return ok ? { success: true } : { success: false, error: 'Repost did not register' };
  }

  function findComposer() {
    const dialog = document.querySelector('[role="dialog"]');
    const scope = dialog || document;
    const box = scope.querySelector('[data-testid="tweetTextarea_0"]');
    if (!box) return null;
    const editable = box.matches('[contenteditable="true"]')
      ? box
      : box.querySelector('[contenteditable="true"]') || box;
    return { dialog, box, editable };
  }

  function dismissModal(composer) {
    try {
      const scope = composer?.dialog || document.querySelector('[role="dialog"]') || document;
      const closeBtn = scope.querySelector('[data-testid="app-bar-close"]') ||
        scope.querySelector('[aria-label="Close"]') ||
        scope.querySelector('[data-testid="close"]');
      if (closeBtn) {
        closeBtn.click();
      } else {
        const escEvent = new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
        });
        (composer?.dialog || document.activeElement || document.body).dispatchEvent(escEvent);
      }
      setTimeout(() => {
        try {
          const discard = document.querySelector('[data-testid="confirmationSheetConfirm"]');
          if (discard) discard.click();
        } catch {
          // ignore
        }
      }, 300);
    } catch {
      // ignore
    }
  }

  function insertText(editable, text) {
    editable.focus();

    // Draft.js requires an explicit DOM Selection range inside the contenteditable
    try {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch {
      // ignore
    }

    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (ok && (editable.textContent || '').includes(text.slice(0, 20))) return true;

    // Fallback 1: InputEvents
    try {
      editable.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: text, bubbles: true, cancelable: true,
      }));
      editable.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText', data: text, bubbles: true,
      }));
    } catch {
      // ignore
    }
    if ((editable.textContent || '').includes(text.slice(0, 20))) return true;

    // Fallback 2: synthetic paste
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      editable.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }));
    } catch {
      // ignore
    }
    return (editable.textContent || '').includes(text.slice(0, 20));
  }

  async function doComment(article, text) {
    if (!text || !String(text).trim()) return { success: false, error: 'No comment text provided' };
    const btn = article.querySelector('[data-testid="reply"]');
    if (!btn) return { success: false, error: 'Reply button not found' };
    if (!isEnabled(btn)) return { success: false, error: 'Reply button is disabled' };
    clickEl(btn);

    const composer = await waitFor(findComposer, 5000);
    if (!composer) return { success: false, error: 'Reply composer did not open' };
    await humanDelay();

    if (!insertText(composer.editable, String(text))) {
      dismissModal(composer);
      return { success: false, error: 'Could not type into reply composer' };
    }
    await humanDelay();

    const scope = composer.dialog || document;
    const sendBtn = await waitFor(() => {
      const b = scope.querySelector('[data-testid="tweetButton"]') ||
        (!composer.dialog && document.querySelector('[data-testid="tweetButtonInline"]'));
      return isEnabled(b) ? b : null;
    }, 4000);
    if (!sendBtn) {
      dismissModal(composer);
      return { success: false, error: 'Reply button never became enabled' };
    }
    await humanDelay();
    sendBtn.click();

    // Wait for the modal to close (best-effort confirmation)
    if (composer.dialog) {
      await waitFor(() => !composer.dialog.isConnected || !document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]'), 4000);
    }
    return { success: true };
  }

  async function execute(payload) {
    const { action, post_url, comment_text } = payload || {};
    const info = parseStatus(post_url);
    if (!info) return { success: false, error: 'Invalid post URL' };

    const article = findArticleByStatusId(info.id);
    if (!article) {
      return { success: false, error: 'Post not visible on page — scroll to it and retry' };
    }

    try {
      article.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      // ignore
    }
    await humanDelay();

    switch (action) {
      case 'like':
        return doLike(article);
      case 'repost':
        return doRepost(article);
      case 'comment':
        return doComment(article, comment_text);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  // Serialize executions so two confirms never interleave clicks
  let execChain = Promise.resolve();

  function executeWithTimeout(payload) {
    const run = () => Promise.race([
      execute(payload).catch((err) => ({ success: false, error: String(err && err.message || err) })),
      sleep(EXECUTE_TIMEOUT_MS).then(() => ({ success: false, error: 'Timed out performing action' })),
    ]);
    const p = execChain.then(run, run);
    execChain = p.catch(() => {});
    return p;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'X_EXECUTE') return false;
    executeWithTimeout(message.payload).then((result) => {
      try {
        sendResponse(result);
      } catch {
        // channel closed
      }
    });
    return true; // async response
  });
})();
