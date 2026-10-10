// ==========================================
// ARACHNOS PERSONAL — OPTIONS LOGIC
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('server-url');
  const spiderCountSelect = document.getElementById('spider-count-select');
  const autonomousModeCheckbox = document.getElementById('autonomous-mode-checkbox');
  const autoScrollCheckbox = document.getElementById('auto-scroll-checkbox');
  const autoFollowLinksCheckbox = document.getElementById('auto-follow-links-checkbox');
  const spidersVisibleCheckbox = document.getElementById('spiders-visible-checkbox');
  const xSuggestionsCheckbox = document.getElementById('x-suggestions-checkbox');
  const saveBtn = document.getElementById('save-settings-btn');
  const saveFeedback = document.getElementById('save-feedback');
  const statusPill = document.getElementById('status-pill');

  const statTotal = document.getElementById('stat-total');
  const statReinforced = document.getElementById('stat-reinforced');
  const statHarvests = document.getElementById('stat-harvests');
  const memorySearch = document.getElementById('memory-search');
  const refreshMemoriesBtn = document.getElementById('refresh-memories-btn');
  const memoryList = document.getElementById('memory-list');

  let allMemories = [];

  // Load settings
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
    if (res) {
      if (res.serverUrl) serverUrlInput.value = res.serverUrl;
      if (res.spiderCount) spiderCountSelect.value = res.spiderCount.toString();
      if (res.autonomousMode !== undefined) autonomousModeCheckbox.checked = res.autonomousMode;
      if (res.autoScroll !== undefined) autoScrollCheckbox.checked = res.autoScroll;
      if (res.autoFollowLinks !== undefined) autoFollowLinksCheckbox.checked = res.autoFollowLinks;
      spidersVisibleCheckbox.checked = res.spidersVisible !== false;
      xSuggestionsCheckbox.checked = res.xSuggestionsEnabled !== false;
    }
    checkStatus();
    loadMemories();
  });

  // Check connection status
  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' }, (res) => {
      if (res && res.online) {
        statusPill.className = 'status-badge online';
        statusPill.textContent = 'Server Online';
      } else {
        statusPill.className = 'status-badge offline';
        statusPill.textContent = 'Server Disconnected';
      }
    });
  }

  // Save settings
  saveBtn.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim() || 'http://localhost:3001';
    const spiderCount = parseInt(spiderCountSelect.value, 10);
    const autonomousMode = autonomousModeCheckbox.checked;
    const autoScroll = autoScrollCheckbox.checked;
    const autoFollowLinks = autoFollowLinksCheckbox.checked;
    const spidersVisible = spidersVisibleCheckbox.checked;
    const xSuggestionsEnabled = xSuggestionsCheckbox.checked;

    chrome.runtime.sendMessage({
      type: 'SET_SETTINGS',
      payload: { serverUrl, spiderCount, autonomousMode, autoScroll, autoFollowLinks, spidersVisible, xSuggestionsEnabled },
    }, () => {
      saveFeedback.textContent = 'Settings saved!';
      setTimeout(() => { saveFeedback.textContent = ''; }, 2000);
      checkStatus();
      loadMemories();
    });
  });

  // Fetch & render memories
  function loadMemories() {
    chrome.runtime.sendMessage({ type: 'GET_MEMORIES' }, (res) => {
      if (res && res.success && res.data) {
        allMemories = res.data.memories || [];
        const stats = res.data.stats || {};

        statTotal.textContent = stats.total || allMemories.length;
        statReinforced.textContent = stats.userReinforcedCount || allMemories.filter(m => m.tier === 'user_reinforced').length;
        statHarvests.textContent = stats.rawHarvestCount || allMemories.filter(m => m.tier === 'raw_harvest').length;

        renderMemoryList(allMemories);
      } else {
        memoryList.innerHTML = `<div class="empty-state">Unable to connect to Brain memory store.</div>`;
      }
    });
  }

  function renderMemoryList(list) {
    const filter = (memorySearch.value || '').toLowerCase().trim();
    const filtered = list.filter(m => {
      const text = (m.corrected_text || m.content || '').toLowerCase();
      const url = (m.source_url || '').toLowerCase();
      return text.includes(filter) || url.includes(filter);
    });

    if (filtered.length === 0) {
      memoryList.innerHTML = `<div class="empty-state">No matching memories found.</div>`;
      return;
    }

    memoryList.innerHTML = '';
    filtered.forEach(m => {
      const item = document.createElement('div');
      item.className = 'memory-item';

      const tierClass = m.tier || 'raw_harvest';
      const tierName = tierClass.replace(/_/g, ' ');
      const content = m.corrected_text || m.content;

      item.innerHTML = `
        <div class="memory-header">
          <span class="tier-badge ${tierClass}">${tierName}</span>
          <span style="font-size: 10px; color: #64748b;">${new Date(m.created_at).toLocaleDateString()}</span>
        </div>
        <div class="memory-content">${escapeHtml(content)}</div>
        <div class="memory-meta" title="${escapeHtml(m.source_url)}">Source: ${escapeHtml(m.source_url)}</div>
      `;
      memoryList.appendChild(item);
    });
  }

  memorySearch.addEventListener('input', () => {
    renderMemoryList(allMemories);
  });

  refreshMemoriesBtn.addEventListener('click', () => {
    loadMemories();
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
});
