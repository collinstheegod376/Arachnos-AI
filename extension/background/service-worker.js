// ==========================================
// ARACHNOS PERSONAL — BACKGROUND SERVICE WORKER
// ==========================================

const DEFAULT_CONFIG = {
  isActive: true,
  spiderCount: 3,
  serverUrl: 'http://localhost:3001',
  connected: false,
  autonomousMode: false,
  autoScroll: true,
  autoFollowLinks: true,
  spidersVisible: true,
  xSuggestionsEnabled: true,
};

const SETTINGS_KEYS = [
  'isActive', 'spiderCount', 'serverUrl', 'connected', 'autonomousMode',
  'autoScroll', 'autoFollowLinks', 'spidersVisible', 'xSuggestionsEnabled',
];

// X interaction tuning
const X_PENDING_KEY = 'xPendingSuggestions';
const X_PENDING_MAX = 50;
const X_EXECUTE_TIMEOUT_MS = 15000;

// Initialize extension defaults on install
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    'isActive', 'spiderCount', 'serverUrl', 'autonomousMode', 'autoScroll', 'autoFollowLinks',
    'spidersVisible', 'xSuggestionsEnabled', X_PENDING_KEY,
  ]);
  await chrome.storage.local.set({
    isActive: stored.isActive !== undefined ? stored.isActive : DEFAULT_CONFIG.isActive,
    spiderCount: stored.spiderCount || DEFAULT_CONFIG.spiderCount,
    serverUrl: stored.serverUrl || DEFAULT_CONFIG.serverUrl,
    autonomousMode: stored.autonomousMode !== undefined ? stored.autonomousMode : DEFAULT_CONFIG.autonomousMode,
    autoScroll: stored.autoScroll !== undefined ? stored.autoScroll : DEFAULT_CONFIG.autoScroll,
    autoFollowLinks: stored.autoFollowLinks !== undefined ? stored.autoFollowLinks : DEFAULT_CONFIG.autoFollowLinks,
    spidersVisible: stored.spidersVisible !== undefined ? stored.spidersVisible : DEFAULT_CONFIG.spidersVisible,
    xSuggestionsEnabled: stored.xSuggestionsEnabled !== undefined ? stored.xSuggestionsEnabled : DEFAULT_CONFIG.xSuggestionsEnabled,
    [X_PENDING_KEY]: Array.isArray(stored[X_PENDING_KEY]) ? stored[X_PENDING_KEY] : [],
  });

  // Create context menu for quick "Teach Arachnos"
  chrome.contextMenus.create({
    id: 'arachnos-teach-selection',
    title: '🕷️ Teach Arachnos (Remember This)',
    contexts: ['selection'],
  });

  console.log('[Arachnos SW] Extension installed & initialized');
  await pruneClosedTabSuggestions();
  await checkServerHealth();
});

// Browser restart: tab ids from the previous session are meaningless
chrome.runtime.onStartup.addListener(async () => {
  await updatePending(() => []);
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'arachnos-teach-selection' && info.selectionText) {
    const { serverUrl } = await chrome.storage.local.get('serverUrl');
    const endpoint = (serverUrl || DEFAULT_CONFIG.serverUrl) + '/teach';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: info.selectionText,
          page_url: tab?.url || 'user://context-menu',
          title: tab?.title || 'Selected Text',
        }),
      });

      if (response.ok) {
        console.log('[Arachnos SW] Successfully taught selected text to local Brain');
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'TEACH_SUCCESS',
            message: 'Taught to Arachnos!',
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Arachnos SW] Failed to teach selection:', err);
    }
  }
});

// Generic JSON fetch against the local Brain server.
// Throws an Error with the server's `{error}` message on non-2xx responses.
async function brainFetch(path, options = {}) {
  const { serverUrl } = await chrome.storage.local.get('serverUrl');
  const target = (serverUrl || DEFAULT_CONFIG.serverUrl) + path;

  const init = { method: options.method || 'GET', headers: {} };
  if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(target, init);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request to ${path} failed with status ${res.status}`);
  }
  return data;
}

// Forward harvest payload to local Brain server
async function forwardToLocalBrain(payload) {
  const { serverUrl } = await chrome.storage.local.get('serverUrl');
  const target = (serverUrl || DEFAULT_CONFIG.serverUrl) + '/ingest';

  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Ingest failed with status ${res.status}`);
  }
  return await res.json();
}

// Check server health
async function checkServerHealth() {
  const { serverUrl } = await chrome.storage.local.get('serverUrl');
  const target = (serverUrl || DEFAULT_CONFIG.serverUrl) + '/status';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(target, { signal: controller.signal });
    clearTimeout(timeout);
    const isOnline = res.ok;
    await chrome.storage.local.set({ connected: isOnline });
    return isOnline;
  } catch {
    await chrome.storage.local.set({ connected: false });
    return false;
  }
}

// Broadcast config changes to tabs
async function notifyTabs(message) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  }
}

// ==========================================
// X INTERACTION — pending suggestion store
// ==========================================

// Serialize all read-modify-write cycles on xPendingSuggestions
let pendingQueue = Promise.resolve();

function updatePending(mutator) {
  const run = pendingQueue.then(async () => {
    const stored = await chrome.storage.local.get(X_PENDING_KEY);
    const current = Array.isArray(stored[X_PENDING_KEY]) ? stored[X_PENDING_KEY] : [];
    const next = mutator(current.slice());
    await chrome.storage.local.set({ [X_PENDING_KEY]: next });
    updateBadge(next.length);
    return next;
  });
  // Keep the chain alive even if one mutation fails
  pendingQueue = run.catch(() => {});
  return run;
}

async function getPending() {
  const stored = await chrome.storage.local.get(X_PENDING_KEY);
  return Array.isArray(stored[X_PENDING_KEY]) ? stored[X_PENDING_KEY] : [];
}

function suggestionKey(s) {
  return `${s.rule_id}|${s.post_url}`;
}

function upsertPending(suggestions, tabId) {
  if (!suggestions.length) return Promise.resolve();
  return updatePending((list) => {
    const now = new Date().toISOString();
    for (const s of suggestions) {
      const key = suggestionKey(s);
      const idx = list.findIndex(p => p.key === key);
      const entry = { ...s, key, tabId, created_at: idx >= 0 ? list[idx].created_at : now };
      if (idx >= 0) {
        list[idx] = entry;
      } else {
        list.push(entry);
      }
    }
    // Cap: drop the oldest entries first
    return list.length > X_PENDING_MAX ? list.slice(list.length - X_PENDING_MAX) : list;
  });
}

function removePending(key) {
  return updatePending(list => list.filter(p => p.key !== key));
}

async function pruneClosedTabSuggestions() {
  try {
    const tabs = await chrome.tabs.query({});
    const openIds = new Set(tabs.map(t => t.id));
    await updatePending(list => list.filter(p => openIds.has(p.tabId)));
  } catch (err) {
    console.warn('[Arachnos SW] Failed to prune pending suggestions:', err);
  }
}

async function updateBadge(count) {
  if (!chrome.action) return;
  try {
    const stored = await chrome.storage.local.get(['xSuggestionsEnabled', X_PENDING_KEY]);
    if (stored.xSuggestionsEnabled === false) {
      chrome.action.setBadgeText({ text: '' }).catch(() => {});
      return;
    }
    const pendingCount = typeof count === 'number'
      ? count
      : (Array.isArray(stored[X_PENDING_KEY]) ? stored[X_PENDING_KEY].length : 0);
    chrome.action.setBadgeText({ text: pendingCount > 0 ? String(pendingCount) : '' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' }).catch(() => {});
  } catch {
    // ignore
  }
}

// Synchronize badge counter when suggestion setting changes in storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.xSuggestionsEnabled) {
    if (changes.xSuggestionsEnabled.newValue === false) {
      chrome.action?.setBadgeText({ text: '' }).catch(() => {});
    } else {
      getPending().then(list => updateBadge(list.length)).catch(() => {});
    }
  }
});

// Drop suggestions whose originating tab closed
chrome.tabs.onRemoved.addListener((tabId) => {
  updatePending(list => list.filter(p => p.tabId !== tabId)).catch(() => {});
});

// Prune suggestions when tabs are refreshed or navigate away from x.com
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const currentUrl = changeInfo.url || tab?.url;
  const isX = currentUrl ? /^https:\/\/(?:.*\.)?(?:x|twitter)\.com\b/i.test(currentUrl) : false;

  // Navigated away from x.com
  if (changeInfo.url && !isX) {
    updatePending(list => list.filter(p => p.tabId !== tabId)).catch(() => {});
    return;
  }

  // Refreshed or navigating to a new URL
  if (changeInfo.status === 'loading') {
    updatePending(list => list.filter(p => p.tabId !== tabId)).catch(() => {});
  }
});

// Restore badge whenever the worker spins up
getPending().then(list => updateBadge(list.length)).catch(() => {});

// Send X_EXECUTE to the x.com tab with a hard timeout
function executeInTab(tabId, payload) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ success: false, error: 'Timed out waiting for the X tab to perform the action' });
    }, X_EXECUTE_TIMEOUT_MS);

    chrome.tabs.sendMessage(tabId, { type: 'X_EXECUTE', payload })
      .then((res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (res && res.success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: (res && res.error) || 'Action failed on page (no response)' });
        }
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ success: false, error: `Could not reach X tab: ${err?.message || err}` });
      });
  });
}

// In-flight confirmation locks to prevent duplicate concurrent executions
const inFlightKeys = new Set();

async function handleXConfirm(suggestion) {
  if (!suggestion || suggestion.rule_id === undefined || !suggestion.post_url) {
    throw new Error('Invalid suggestion');
  }
  const key = suggestion.key || suggestionKey(suggestion);
  if (inFlightKeys.has(key)) {
    throw new Error('Action already in progress for this suggestion');
  }

  inFlightKeys.add(key);
  // Mark in-flight in pending suggestions list so UI and other callers know
  await updatePending(list => list.map(p => p.key === key ? { ...p, in_flight: true } : p));

  try {
    // Prefer the SW-owned record (authoritative tabId)
    const pending = await getPending();
    const s = pending.find(p => p.key === key) || suggestion;

    const confirmRes = await brainFetch('/x/confirm', {
      method: 'POST',
      body: { rule_id: s.rule_id, post_url: s.post_url, action: s.action },
    });
    const logId = confirmRes?.log_id;

    let result;
    if (typeof s.tabId !== 'number') {
      result = { success: false, error: 'The X tab for this suggestion is no longer available' };
    } else {
      result = await executeInTab(s.tabId, {
        log_id: logId,
        action: s.action,
        post_url: s.post_url,
        comment_text: s.comment_text ?? null,
      });
    }

    try {
      await brainFetch('/x/report', {
        method: 'POST',
        body: result.success
          ? { log_id: logId, status: 'success' }
          : { log_id: logId, status: 'failed', error: result.error },
      });
    } catch (err) {
      console.warn('[Arachnos SW] Failed to report X action result:', err);
    }

    if (result.success) {
      await removePending(key);
      return { success: true, data: { log_id: logId } };
    } else {
      // Don't lock suggestion on failed execution: report failure but allow retry or future suggestion
      await updatePending(list => list.map(p => p.key === key ? { ...p, in_flight: false, last_error: result.error } : p));
      return { success: false, error: result.error, data: { log_id: logId } };
    }
  } finally {
    inFlightKeys.delete(key);
  }
}

async function handleXIgnore(suggestion) {
  if (!suggestion || suggestion.rule_id === undefined || !suggestion.post_url) {
    throw new Error('Invalid suggestion');
  }
  const key = suggestion.key || suggestionKey(suggestion);
  if (inFlightKeys.has(key)) {
    throw new Error('Cannot ignore suggestion while action is in progress');
  }

  inFlightKeys.add(key);
  try {
    const data = await brainFetch('/x/ignore', {
      method: 'POST',
      body: { rule_id: suggestion.rule_id, post_url: suggestion.post_url, action: suggestion.action },
    });
    await removePending(key);
    return { success: true, data };
  } finally {
    inFlightKeys.delete(key);
  }
}

// Wrap an async handler into the {success, data?, error?} response contract
function respondAsync(sendResponse, fn) {
  fn()
    .then((out) => sendResponse(out))
    .catch(err => sendResponse({ success: false, error: err?.message || String(err) }));
  return true;
}

// Main message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HARVEST_EVENT') {
    forwardToLocalBrain(message.payload)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // asynchronous response
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(SETTINGS_KEYS).then(data => {
      // Default any keys missing from storage (onInstalled only runs on install/update)
      const out = { ...data };
      for (const key of SETTINGS_KEYS) {
        if (out[key] === undefined) out[key] = DEFAULT_CONFIG[key];
      }
      sendResponse(out);
    });
    return true;
  }

  if (message.type === 'OPEN_TAB') {
    chrome.tabs.create({ url: message.url, active: message.active ?? true }, (tab) => {
      sendResponse({ success: true, tabId: tab?.id });
    });
    return true;
  }

  if (message.type === 'SET_SETTINGS') {
    chrome.storage.local.set(message.payload).then(() => {
      notifyTabs({ type: 'CONFIG_UPDATED', config: message.payload });
      if (message.payload && message.payload.xSuggestionsEnabled !== undefined) {
        updateBadge();
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CHECK_HEALTH') {
    checkServerHealth().then(online => sendResponse({ online }));
    return true;
  }

  if (message.type === 'QUERY_BRAIN') {
    (async () => {
      try {
        const { serverUrl } = await chrome.storage.local.get('serverUrl');
        const endpoint = (serverUrl || DEFAULT_CONFIG.serverUrl) + '/query';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: message.query, question: message.query }),
        });
        const data = await res.json();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'SUBMIT_FEEDBACK') {
    (async () => {
      try {
        const { serverUrl } = await chrome.storage.local.get('serverUrl');
        const endpoint = (serverUrl || DEFAULT_CONFIG.serverUrl) + '/feedback';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload),
        });
        const data = await res.json();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'TEACH_BRAIN') {
    (async () => {
      try {
        const { serverUrl } = await chrome.storage.local.get('serverUrl');
        const endpoint = (serverUrl || DEFAULT_CONFIG.serverUrl) + '/teach';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload),
        });
        const data = await res.json();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'GET_MEMORIES') {
    (async () => {
      try {
        const { serverUrl } = await chrome.storage.local.get('serverUrl');
        const endpoint = (serverUrl || DEFAULT_CONFIG.serverUrl) + '/memory';
        const res = await fetch(endpoint);
        const data = await res.json();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ==========================================
  // X INTERACTION ROUTES
  // ==========================================

  if (message.type === 'X_SUGGEST') {
    return respondAsync(sendResponse, async () => {
      const { xSuggestionsEnabled } = await chrome.storage.local.get('xSuggestionsEnabled');
      if (xSuggestionsEnabled === false) {
        return { success: true, data: { suggestions: [] } };
      }
      const p = message.payload || {};
      const data = await brainFetch('/x/suggest', {
        method: 'POST',
        body: { text: p.text, url: p.url, author: p.author ?? null },
      });
      const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
      const tabId = sender?.tab?.id;
      if (typeof tabId === 'number') {
        await upsertPending(suggestions, tabId);
      }
      return { success: true, data: { suggestions } };
    });
  }

  if (message.type === 'X_CONFIRM') {
    return respondAsync(sendResponse, () => handleXConfirm(message.suggestion));
  }

  if (message.type === 'X_IGNORE') {
    return respondAsync(sendResponse, () => handleXIgnore(message.suggestion));
  }

  if (message.type === 'X_TEACH') {
    return respondAsync(sendResponse, async () => {
      const p = message.payload || {};
      const body = { action: p.action, condition: p.condition };
      if (p.comment_text) body.comment_text = p.comment_text;
      const data = await brainFetch('/x/teach', { method: 'POST', body });
      return { success: true, data };
    });
  }

  if (message.type === 'X_TEACH_NATURAL') {
    return respondAsync(sendResponse, async () => {
      const data = await brainFetch('/x/teach/natural', { method: 'POST', body: { text: message.text } });
      return { success: true, data };
    });
  }

  if (message.type === 'X_GET_RULES') {
    return respondAsync(sendResponse, async () => {
      const data = await brainFetch(message.all ? '/x/rules?all=1' : '/x/rules');
      return { success: true, data };
    });
  }

  if (message.type === 'X_DISABLE_RULE') {
    return respondAsync(sendResponse, async () => {
      const data = await brainFetch(`/x/disable/${encodeURIComponent(message.rule_id)}`, { method: 'POST' });
      return { success: true, data };
    });
  }

  if (message.type === 'X_ENABLE_RULE') {
    return respondAsync(sendResponse, async () => {
      const data = await brainFetch(`/x/enable/${encodeURIComponent(message.rule_id)}`, { method: 'POST' });
      return { success: true, data };
    });
  }

  if (message.type === 'X_DELETE_RULE') {
    return respondAsync(sendResponse, async () => {
      const data = await brainFetch(`/x/rules/${encodeURIComponent(message.rule_id)}`, { method: 'DELETE' });
      // Pending suggestions for a deleted rule can no longer be confirmed meaningfully
      await updatePending(list => list.filter(p => p.rule_id !== message.rule_id));
      return { success: true, data };
    });
  }

  if (message.type === 'X_GET_LOG') {
    return respondAsync(sendResponse, async () => {
      const limit = Number.isFinite(message.limit) ? message.limit : 50;
      const data = await brainFetch(`/x/log?limit=${limit}`);
      return { success: true, data };
    });
  }
});
