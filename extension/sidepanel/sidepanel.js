// ==========================================
// ARACHNOS PERSONAL — SIDEPANEL LOGIC
// (Chat + X/Twitter Interaction Hub)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Elements: Header & Global
  const statusEl = document.getElementById('connection-status');
  const clearChatBtn = document.getElementById('clear-chat-btn');
  const teachModalBtn = document.getElementById('teach-modal-btn');
  const teachDrawer = document.getElementById('teach-drawer');
  const teachInput = document.getElementById('teach-input');
  const cancelTeachBtn = document.getElementById('cancel-teach-btn');
  const submitTeachBtn = document.getElementById('submit-teach-btn');

  // Elements: Tabs
  const tabChat = document.getElementById('tab-chat');
  const tabX = document.getElementById('tab-x');
  const chatView = document.getElementById('chat-view');
  const xView = document.getElementById('x-view');
  const xTabBadge = document.getElementById('x-tab-badge');

  // Elements: Chat View
  const messagesContainer = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  // Elements: X Actions View
  const xPendingCounter = document.getElementById('x-pending-counter');
  const xSuggestionsList = document.getElementById('x-suggestions-list');
  const xTeachInput = document.getElementById('x-teach-input');
  const xTeachSubmitBtn = document.getElementById('x-teach-submit-btn');
  const xTeachFeedback = document.getElementById('x-teach-feedback');
  const xRulesList = document.getElementById('x-rules-list');
  const xRefreshRulesBtn = document.getElementById('x-refresh-rules-btn');
  const xActivityList = document.getElementById('x-activity-list');
  const xRefreshLogBtn = document.getElementById('x-refresh-log-btn');

  // State
  let currentTab = 'chat';
  let cachedPending = [];

  // ==========================================
  // TAB NAVIGATION
  // ==========================================
  function switchTab(tab) {
    currentTab = tab;
    if (tab === 'chat') {
      tabChat.classList.add('active');
      tabX.classList.remove('active');
      chatView.classList.remove('hidden');
      chatView.classList.add('active');
      xView.classList.add('hidden');
      xView.classList.remove('active');
    } else {
      tabX.classList.add('active');
      tabChat.classList.remove('active');
      xView.classList.remove('hidden');
      xView.classList.add('active');
      chatView.classList.add('hidden');
      chatView.classList.remove('active');
      loadXRules();
      loadXActivityLog();
    }
  }

  tabChat.addEventListener('click', () => switchTab('chat'));
  tabX.addEventListener('click', () => switchTab('x'));

  // ==========================================
  // HEALTH & CONNECTION CHECK
  // ==========================================
  function checkHealth() {
    chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' }, (res) => {
      if (res && res.online) {
        statusEl.textContent = 'Watching & Learning';
        statusEl.style.color = '#10b981';
      } else {
        statusEl.textContent = 'Local Brain Offline';
        statusEl.style.color = '#64748b';
      }
    });
  }
  checkHealth();
  setInterval(checkHealth, 8000);

  // ==========================================
  // GENERAL MEMORY TEACH DRAWER
  // ==========================================
  teachModalBtn.addEventListener('click', () => {
    teachDrawer.classList.toggle('hidden');
    if (!teachDrawer.classList.contains('hidden')) {
      teachInput.focus();
    }
  });

  cancelTeachBtn.addEventListener('click', () => {
    teachDrawer.classList.add('hidden');
    teachInput.value = '';
  });

  submitTeachBtn.addEventListener('click', () => {
    const text = teachInput.value.trim();
    if (!text) return;

    chrome.runtime.sendMessage({
      type: 'TEACH_BRAIN',
      payload: {
        content: text,
        page_url: 'user://sidepanel-teach',
        title: 'User Knowledge',
      },
    }, () => {
      teachDrawer.classList.add('hidden');
      teachInput.value = '';
      appendSystemMessage(`Remembered: "${text}"`);
    });
  });

  // ==========================================
  // CHAT VIEW LOGIC
  // ==========================================
  clearChatBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = `
      <div class="welcome-card">
        <p class="welcome-text">Arachnos remembers pages you browse locally. Ask anything or teach facts you want reinforced.</p>
      </div>
    `;
  });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.q;
      if (q) {
        chatInput.value = q;
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
  });

  // Natural language X command detector
  function isXNaturalCommand(text) {
    const lower = text.trim().toLowerCase();
    return (
      /^repost\b/.test(lower) ||
      /^like\b/.test(lower) ||
      /^reply\b/.test(lower) ||
      /^when (someone|a post) mentions\b/.test(lower) ||
      /^stop (reposting|liking|replying)\b/.test(lower) ||
      /^show (me )?(the )?rules\b/.test(lower)
    );
  }

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    chatInput.value = '';
    appendUserMessage(query);

    // If this looks like an X command, handle it through X teaching
    if (isXNaturalCommand(query)) {
      const loadingRow = appendLoadingIndicator();
      chrome.runtime.sendMessage({ type: 'X_TEACH_NATURAL', text: query }, (res) => {
        loadingRow.remove();
        if (res && res.success && res.data) {
          const d = res.data;
          if (d.status === 'learned') {
            appendSystemMessage(`[X Rule Learned] ${d.rule?.action?.toUpperCase()}: "${d.rule?.condition}"`);
          } else if (d.status === 'disabled') {
            appendSystemMessage(`[X Rules Updated] Disabled ${d.disabled_ids?.length || 0} rule(s).`);
          } else if (d.status === 'list') {
            const listText = (d.rules || []).map(r => `• ${r.action.toUpperCase()} when "${r.condition}"`).join('\n') || 'No rules yet.';
            appendAssistantMessage({ answer: `**Learned X Rules:**\n\n${listText}`, citations: [] });
          } else {
            appendSystemMessage(`[X Command] Status: ${d.status}`);
          }
          loadXRules();
        } else {
          appendAssistantMessage({
            answer: `Could not process X rule: ${res?.error || 'Unknown error'}`,
            citations: [],
          });
        }
      });
      return;
    }

    // Regular RAG Brain Query
    const loadingRow = appendLoadingIndicator();
    chrome.runtime.sendMessage({ type: 'QUERY_BRAIN', query }, (res) => {
      loadingRow.remove();
      if (res && res.success && res.data) {
        appendAssistantMessage(res.data);
      } else {
        const errorMsg = res?.error || 'Could not reach local Brain server. Is `npm run start` running on http://localhost:3001?';
        appendAssistantMessage({ answer: errorMsg, citations: [] });
      }
    });
  });

  function appendUserMessage(text) {
    const row = document.createElement('div');
    row.className = 'message-row user';
    row.innerHTML = `<div class="bubble user">${escapeHtml(text)}</div>`;
    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  function appendLoadingIndicator() {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.innerHTML = `<div class="bubble assistant" style="color: #64748b; font-style: italic;">Consulting memory...</div>`;
    messagesContainer.appendChild(row);
    scrollToBottom();
    return row;
  }

  function appendSystemMessage(text) {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.innerHTML = `<div class="bubble assistant" style="color: #10b981; font-size: 11.5px;">✓ ${escapeHtml(text)}</div>`;
    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  function appendAssistantMessage(data) {
    const row = document.createElement('div');
    row.className = 'message-row assistant';

    const formattedAnswer = formatAnswer(data.answer);
    let html = `<div class="bubble assistant">${formattedAnswer}</div>`;

    const citations = data.citations || data.sources || [];
    if (citations.length > 0) {
      html += `<div class="sources-container">`;
      citations.slice(0, 4).forEach((c) => {
        const urlObj = formatUrlLabel(c.source_url);
        const isReinforced = c.tier === 'user_reinforced' || c.user_feedback === 'positive';
        html += `
          <a class="source-tag ${isReinforced ? 'reinforced' : ''}" href="${escapeHtml(c.source_url)}" target="_blank" title="${escapeHtml(c.snippet || c.source_url)}">
            ${isReinforced ? '★ ' : ''}${escapeHtml(urlObj)}
          </a>
        `;
      });
      html += `</div>`;
    }

    const primaryId = citations[0]?.chunk_id || '';
    if (primaryId) {
      html += `
        <div class="feedback-bar" data-memory-id="${escapeHtml(primaryId)}">
          <button class="feedback-btn thumb-up" title="Reinforce this knowledge">👍 Reinforce</button>
          <button class="feedback-btn thumb-down" title="Mark inaccurate">👎</button>
          <button class="feedback-btn correct-btn" title="Submit a correction">✏️ Correct</button>
        </div>
        <div class="correction-box hidden">
          <input type="text" class="correction-input" placeholder="Type correct information..." />
          <div class="correction-actions">
            <button class="correction-submit">Update Memory</button>
          </div>
        </div>
      `;
    }

    row.innerHTML = html;
    messagesContainer.appendChild(row);

    if (primaryId) {
      const thumbUp = row.querySelector('.thumb-up');
      const thumbDown = row.querySelector('.thumb-down');
      const correctBtn = row.querySelector('.correct-btn');
      const correctionBox = row.querySelector('.correction-box');
      const correctionInput = row.querySelector('.correction-input');
      const correctionSubmit = row.querySelector('.correction-submit');

      thumbUp?.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'SUBMIT_FEEDBACK',
          payload: { memory_id: primaryId, feedback: 'positive' },
        });
        thumbUp.classList.add('active');
        thumbDown.classList.remove('active');
      });

      thumbDown?.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'SUBMIT_FEEDBACK',
          payload: { memory_id: primaryId, feedback: 'negative' },
        });
        thumbDown.classList.add('active');
        thumbUp.classList.remove('active');
      });

      correctBtn?.addEventListener('click', () => {
        correctionBox.classList.toggle('hidden');
        if (!correctionBox.classList.contains('hidden')) {
          correctionInput.focus();
        }
      });

      correctionSubmit?.addEventListener('click', () => {
        const text = correctionInput.value.trim();
        if (!text) return;

        correctionSubmit.disabled = true;
        chrome.runtime.sendMessage({
          type: 'SUBMIT_FEEDBACK',
          payload: {
            memory_id: primaryId,
            feedback: 'corrected',
            corrected_text: text,
          },
        }, (res) => {
          correctionSubmit.disabled = false;
          if (res && res.success) {
            correctionBox.innerHTML = `<span style="font-size: 11px; color: #10b981;">✓ Memory updated with correction</span>`;
          } else {
            const err = res?.error || 'Could not update memory on Brain server';
            const existingErr = correctionBox.querySelector('.correction-error');
            if (existingErr) {
              existingErr.textContent = `Error: ${err}`;
            } else {
              const errSpan = document.createElement('div');
              errSpan.className = 'correction-error';
              errSpan.style.cssText = 'font-size: 11px; color: #ef4444; margin-top: 4px;';
              errSpan.textContent = `Error: ${err}`;
              correctionBox.appendChild(errSpan);
            }
          }
        });
      });
    }

    scrollToBottom();
  }

  function formatAnswer(text) {
    if (!text) return '';
    return text
      .split('\n\n')
      .map((p) => `<p>${escapeHtml(p).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`)
      .join('');
  }

  function formatUrlLabel(url) {
    if (!url) return 'Source';
    try {
      const u = new URL(url);
      return u.hostname.replace('www.', '') + (u.pathname.length > 1 ? u.pathname.slice(0, 15) + '...' : '');
    } catch {
      return url.slice(0, 24);
    }
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // ==========================================
  // X ACTIONS VIEW LOGIC
  // ==========================================

  // 1. Sync Pending Suggestions from Storage
  function syncPendingSuggestions() {
    chrome.storage.local.get('xPendingSuggestions', (data) => {
      const list = Array.isArray(data.xPendingSuggestions) ? data.xPendingSuggestions : [];
      cachedPending = list;
      renderPendingSuggestions(list);
    });
  }

  // Set of suggestion keys currently executing an action
  const inFlightKeys = new Set();

  function suggestionKey(s) {
    return s.key || `${s.rule_id}|${s.post_url}`;
  }

  // Listen to live changes to pending suggestions
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.xPendingSuggestions) {
      cachedPending = changes.xPendingSuggestions.newValue || [];
      renderPendingSuggestions(cachedPending);
    }
  });

  function renderPendingSuggestions(list) {
    const count = list.length;
    xPendingCounter.textContent = String(count);

    if (count > 0) {
      xTabBadge.textContent = String(count);
      xTabBadge.classList.remove('hidden');
    } else {
      xTabBadge.classList.add('hidden');
    }

    if (count === 0 && inFlightKeys.size === 0) {
      xSuggestionsList.innerHTML = `
        <div class="x-empty-state">
          No pending suggestions. As you view posts on x.com matching your rules, suggestions will appear here.
        </div>
      `;
      return;
    }

    // Remove empty state if present
    const emptyState = xSuggestionsList.querySelector('.x-empty-state');
    if (emptyState) emptyState.remove();

    // Map existing cards in DOM
    const existingCards = new Map();
    xSuggestionsList.querySelectorAll('.x-card').forEach((card) => {
      if (card.dataset.key) existingCards.set(card.dataset.key, card);
    });

    const newKeys = new Set(list.map((s) => suggestionKey(s)));

    // Remove cards no longer present in storage, unless they are currently in-flight
    existingCards.forEach((card, key) => {
      if (!newKeys.has(key) && !inFlightKeys.has(key)) {
        card.remove();
        existingCards.delete(key);
      }
    });

    // Reconcile list items: keep in-flight cards and handlers intact
    list.forEach((s) => {
      const key = suggestionKey(s);
      const existingCard = existingCards.get(key);

      if (existingCard) {
        // If card is already executing in-flight, preserve active button state and listeners
        if (inFlightKeys.has(key) || s.in_flight) {
          const confirmBtn = existingCard.querySelector('.x-btn-confirm');
          const ignoreBtn = existingCard.querySelector('.x-btn-ignore');
          if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Executing...';
          }
          if (ignoreBtn) ignoreBtn.disabled = true;
          return;
        }

        // If not in-flight but has error, update status box and allow retry
        if (s.last_error) {
          const statusBox = existingCard.querySelector('.x-card-status');
          const confirmBtn = existingCard.querySelector('.x-btn-confirm');
          const ignoreBtn = existingCard.querySelector('.x-btn-ignore');
          if (statusBox) {
            statusBox.className = 'x-card-status error';
            statusBox.classList.remove('hidden');
            statusBox.textContent = `Failed: ${s.last_error}`;
          }
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = `Retry ${s.action || 'action'}`;
          }
          if (ignoreBtn) ignoreBtn.disabled = false;
        }
        return;
      }

      // Create new card and append
      const card = createSuggestionCard(s, key);
      xSuggestionsList.appendChild(card);
    });
  }

  function createSuggestionCard(s, key) {
    const card = document.createElement('div');
    card.className = 'x-card';
    card.dataset.key = key;

    const action = s.action || 'repost';
    const author = s.author ? `@${s.author.replace(/^@/, '')}` : 'Unknown author';
    const preview = s.text_preview || s.text || '';
    const condition = s.condition ? `Matched: "${s.condition}"` : '';

    let replyHtml = '';
    if (action === 'comment' && s.comment_text) {
      replyHtml = `<div class="x-card-comment-text"><strong>Reply:</strong> ${escapeHtml(s.comment_text)}</div>`;
    }

    card.innerHTML = `
      <div class="x-card-top">
        <span class="x-badge ${escapeHtml(action)}">${escapeHtml(action)}</span>
        <span class="x-author">${escapeHtml(author)}</span>
      </div>
      <div class="x-card-preview">${escapeHtml(preview)}</div>
      ${condition ? `<div class="x-card-condition">${escapeHtml(condition)}</div>` : ''}
      ${replyHtml}
      <div class="x-card-actions">
        <button class="x-btn-confirm" type="button">Confirm ${escapeHtml(action)}</button>
        <button class="x-btn-ignore" type="button">Ignore</button>
      </div>
      <div class="x-card-status hidden"></div>
    `;

    const confirmBtn = card.querySelector('.x-btn-confirm');
    const ignoreBtn = card.querySelector('.x-btn-ignore');
    const statusBox = card.querySelector('.x-card-status');

    if (s.in_flight) {
      inFlightKeys.add(key);
      confirmBtn.disabled = true;
      ignoreBtn.disabled = true;
      confirmBtn.textContent = 'Executing...';
      statusBox.className = 'x-card-status';
      statusBox.classList.remove('hidden');
      statusBox.textContent = 'Contacting page to perform action...';
    } else if (s.last_error) {
      confirmBtn.textContent = `Retry ${action}`;
      statusBox.className = 'x-card-status error';
      statusBox.classList.remove('hidden');
      statusBox.textContent = `Failed: ${s.last_error}`;
    }

    confirmBtn.addEventListener('click', () => {
      if (inFlightKeys.has(key)) return;
      inFlightKeys.add(key);
      confirmBtn.disabled = true;
      ignoreBtn.disabled = true;
      confirmBtn.textContent = 'Executing...';
      statusBox.className = 'x-card-status';
      statusBox.classList.remove('hidden');
      statusBox.textContent = 'Contacting page to perform action...';

      chrome.runtime.sendMessage({ type: 'X_CONFIRM', suggestion: s }, (res) => {
        inFlightKeys.delete(key);
        if (res && res.success) {
          statusBox.className = 'x-card-status success';
          statusBox.textContent = '✓ Action executed successfully on X!';
          setTimeout(() => {
            card.remove();
            loadXActivityLog();
            if (xSuggestionsList.querySelectorAll('.x-card').length === 0) {
              renderPendingSuggestions([]);
            }
          }, 1200);
        } else {
          confirmBtn.disabled = false;
          ignoreBtn.disabled = false;
          confirmBtn.textContent = `Retry ${action}`;
          statusBox.className = 'x-card-status error';
          statusBox.textContent = `Failed: ${res?.error || 'Action failed on page'}`;
          loadXActivityLog();
        }
      });
    });

    ignoreBtn.addEventListener('click', () => {
      if (inFlightKeys.has(key)) return;
      inFlightKeys.add(key);
      confirmBtn.disabled = true;
      ignoreBtn.disabled = true;
      chrome.runtime.sendMessage({ type: 'X_IGNORE', suggestion: s }, () => {
        inFlightKeys.delete(key);
        card.remove();
        loadXActivityLog();
        if (xSuggestionsList.querySelectorAll('.x-card').length === 0) {
          renderPendingSuggestions([]);
        }
      });
    });

    return card;
  }

  // 2. Teach X Rules Form
  let isTeachingRule = false;
  let lastTeachSubmitAt = 0;

  xTeachSubmitBtn.addEventListener('click', submitXTeachRule);
  xTeachInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      submitXTeachRule();
    }
  });

  function submitXTeachRule() {
    const now = Date.now();
    if (isTeachingRule || (now - lastTeachSubmitAt < 600)) return;
    const text = xTeachInput.value.trim();
    if (!text) return;

    isTeachingRule = true;
    lastTeachSubmitAt = now;
    xTeachSubmitBtn.disabled = true;
    xTeachInput.disabled = true;
    xTeachFeedback.className = 'x-teach-feedback hidden';

    chrome.runtime.sendMessage({ type: 'X_TEACH_NATURAL', text }, (res) => {
      isTeachingRule = false;
      xTeachSubmitBtn.disabled = false;
      xTeachInput.disabled = false;
      xTeachFeedback.classList.remove('hidden');

      if (res && res.success && res.data) {
        const d = res.data;
        if (d.status === 'learned') {
          xTeachFeedback.className = 'x-teach-feedback success';
          xTeachFeedback.textContent = `✓ Learned: ${d.rule?.action?.toUpperCase()} on "${d.rule?.condition}"`;
          xTeachInput.value = '';
          loadXRules();
        } else if (d.status === 'disabled') {
          xTeachFeedback.className = 'x-teach-feedback success';
          xTeachFeedback.textContent = `✓ Disabled ${d.disabled_ids?.length || 0} matching rule(s).`;
          xTeachInput.value = '';
          loadXRules();
        } else if (d.status === 'list') {
          xTeachFeedback.className = 'x-teach-feedback success';
          xTeachFeedback.textContent = `✓ Listed rules below.`;
          loadXRules();
        } else {
          xTeachFeedback.className = 'x-teach-feedback success';
          xTeachFeedback.textContent = `✓ Rule updated.`;
          loadXRules();
        }
      } else {
        xTeachFeedback.className = 'x-teach-feedback error';
        xTeachFeedback.textContent = `Error: ${res?.error || 'Could not parse rule'}`;
      }
      xTeachInput.focus();
    });
  }

  // 3. Load & Render Rules
  function loadXRules() {
    xRulesList.innerHTML = `<div class="x-loading-state">Loading rules...</div>`;
    chrome.runtime.sendMessage({ type: 'X_GET_RULES', all: true }, (res) => {
      if (res && res.success && Array.isArray(res.data)) {
        renderXRules(res.data);
      } else {
        xRulesList.innerHTML = `<div class="x-empty-state">Could not load rules from server.</div>`;
      }
    });
  }

  xRefreshRulesBtn.addEventListener('click', loadXRules);

  function renderXRules(rules) {
    if (rules.length === 0) {
      xRulesList.innerHTML = `
        <div class="x-empty-state">No rules learned yet. Use the input above to teach one.</div>
      `;
      return;
    }

    xRulesList.innerHTML = '';
    rules.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'x-rule-row';

      const isEnabled = r.enabled !== false && r.enabled !== 0;
      const actionBadge = `<span class="x-badge ${escapeHtml(r.action)}">${escapeHtml(r.action)}</span>`;

      row.innerHTML = `
        <div class="x-rule-info">
          <div class="x-rule-desc">
            ${actionBadge} when post contains <strong>"${escapeHtml(r.condition)}"</strong>
            ${r.comment_text ? `<div style="color: #93c5fd; font-size: 10.5px;">Reply: "${escapeHtml(r.comment_text)}"</div>` : ''}
          </div>
          <div class="x-rule-meta">Rule #${r.id}</div>
        </div>
        <div class="x-rule-actions">
          <button class="x-rule-toggle ${isEnabled ? 'active' : ''}" type="button">
            ${isEnabled ? 'Enabled' : 'Disabled'}
          </button>
          <button class="x-rule-del" type="button" title="Delete rule">✕</button>
        </div>
      `;

      const toggleBtn = row.querySelector('.x-rule-toggle');
      const delBtn = row.querySelector('.x-rule-del');

      toggleBtn.addEventListener('click', () => {
        const nextAction = isEnabled ? 'X_DISABLE_RULE' : 'X_ENABLE_RULE';
        chrome.runtime.sendMessage({ type: nextAction, rule_id: r.id }, () => {
          loadXRules();
        });
      });

      delBtn.addEventListener('click', () => {
        if (confirm(`Delete rule: ${r.action} on "${r.condition}"?`)) {
          chrome.runtime.sendMessage({ type: 'X_DELETE_RULE', rule_id: r.id }, () => {
            loadXRules();
          });
        }
      });

      xRulesList.appendChild(row);
    });
  }

  // 4. Load & Render Activity Log
  function loadXActivityLog() {
    xActivityList.innerHTML = `<div class="x-loading-state">Loading activity...</div>`;
    chrome.runtime.sendMessage({ type: 'X_GET_LOG', limit: 20 }, (res) => {
      if (res && res.success && Array.isArray(res.data)) {
        renderXActivityLog(res.data);
      } else {
        xActivityList.innerHTML = `<div class="x-empty-state">Could not load activity log.</div>`;
      }
    });
  }

  xRefreshLogBtn.addEventListener('click', loadXActivityLog);

  function renderXActivityLog(entries) {
    if (entries.length === 0) {
      xActivityList.innerHTML = `
        <div class="x-empty-state">No interactions recorded yet.</div>
      `;
      return;
    }

    xActivityList.innerHTML = '';
    entries.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'x-log-row';

      const status = e.status || 'unknown';
      const action = e.action || '';
      const urlText = formatUrlLabel(e.post_url);
      const timeStr = formatRelativeTime(e.created_at);

      row.innerHTML = `
        <div class="x-log-left">
          <span class="x-log-status ${escapeHtml(status)}">${escapeHtml(status)}</span>
          <span style="font-weight: 500; color: #94a3b8;">${escapeHtml(action)}</span>
          <a class="x-log-url" href="${escapeHtml(e.post_url)}" target="_blank" title="${escapeHtml(e.post_url)}">${escapeHtml(urlText)}</a>
        </div>
        <span class="x-log-time">${escapeHtml(timeStr)}</span>
      `;
      xActivityList.appendChild(row);
    });
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Initial Sync
  syncPendingSuggestions();
});
