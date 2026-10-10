// ==========================================
// ARACHNOS PERSONAL — SIDEPANEL CHAT LOGIC
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const messagesContainer = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const clearChatBtn = document.getElementById('clear-chat-btn');
  const teachModalBtn = document.getElementById('teach-modal-btn');
  const teachDrawer = document.getElementById('teach-drawer');
  const teachInput = document.getElementById('teach-input');
  const cancelTeachBtn = document.getElementById('cancel-teach-btn');
  const submitTeachBtn = document.getElementById('submit-teach-btn');
  const statusEl = document.getElementById('connection-status');

  // Check health periodically
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

  // Teach Drawer Toggle
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

  // Chip quick queries
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.q;
      if (q) {
        chatInput.value = q;
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
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
    }, (res) => {
      teachDrawer.classList.add('hidden');
      teachInput.value = '';
      appendSystemMessage(`Remembered: "${text}"`);
    });
  });

  // Clear Chat
  clearChatBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = `
      <div class="welcome-card">
        <p class="welcome-text">Arachnos remembers pages you browse locally. Ask anything or teach facts you want reinforced.</p>
      </div>
    `;
  });

  // Handle Query Submission
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    chatInput.value = '';
    appendUserMessage(query);

    // Show typing placeholder
    const loadingRow = appendLoadingIndicator();

    chrome.runtime.sendMessage({ type: 'QUERY_BRAIN', query }, (res) => {
      loadingRow.remove();

      if (res && res.success && res.data) {
        appendAssistantMessage(res.data);
      } else {
        const errorMsg = res?.error || 'Could not reach local Brain server. Is `npm run start` running on http://localhost:3001?';
        appendAssistantMessage({
          answer: errorMsg,
          citations: [],
        });
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

    // Format clean answer
    const formattedAnswer = formatAnswer(data.answer);

    let html = `<div class="bubble assistant">${formattedAnswer}</div>`;

    // Add tiny source tags
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

    // Add interactive feedback controls (thumbs up / down / correct)
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

    // Attach feedback handlers
    if (primaryId) {
      const fbBar = row.querySelector('.feedback-bar');
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

        chrome.runtime.sendMessage({
          type: 'SUBMIT_FEEDBACK',
          payload: {
            memory_id: primaryId,
            feedback: 'corrected',
            corrected_text: text,
          },
        }, () => {
          correctionBox.innerHTML = `<span style="font-size: 11px; color: #10b981;">✓ Memory updated with correction</span>`;
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
});
