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
};

// Initialize extension defaults on install
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['isActive', 'spiderCount', 'serverUrl', 'autonomousMode', 'autoScroll', 'autoFollowLinks']);
  await chrome.storage.local.set({
    isActive: stored.isActive !== undefined ? stored.isActive : DEFAULT_CONFIG.isActive,
    spiderCount: stored.spiderCount || DEFAULT_CONFIG.spiderCount,
    serverUrl: stored.serverUrl || DEFAULT_CONFIG.serverUrl,
    autonomousMode: stored.autonomousMode !== undefined ? stored.autonomousMode : DEFAULT_CONFIG.autonomousMode,
    autoScroll: stored.autoScroll !== undefined ? stored.autoScroll : DEFAULT_CONFIG.autoScroll,
    autoFollowLinks: stored.autoFollowLinks !== undefined ? stored.autoFollowLinks : DEFAULT_CONFIG.autoFollowLinks,
  });

  // Create context menu for quick "Teach Arachnos"
  chrome.contextMenus.create({
    id: 'arachnos-teach-selection',
    title: '🕷️ Teach Arachnos (Remember This)',
    contexts: ['selection'],
  });

  console.log('[Arachnos SW] Extension installed & initialized');
  await checkServerHealth();
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

// Main message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HARVEST_EVENT') {
    forwardToLocalBrain(message.payload)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // asynchronous response
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['isActive', 'spiderCount', 'serverUrl', 'connected', 'autonomousMode', 'autoScroll', 'autoFollowLinks']).then(data => {
      sendResponse(data);
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
});
