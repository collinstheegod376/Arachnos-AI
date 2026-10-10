// ==========================================
// ARACHNOS PERSONAL — POPUP LOGIC
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggle-btn');
  const toggleLabel = document.getElementById('toggle-label');
  const connectionDot = document.getElementById('connection-dot');
  const fleetButtons = document.querySelectorAll('.fleet-btn');
  const autonomousBtn = document.getElementById('autonomous-btn');
  const autonomousLabel = document.getElementById('autonomous-label');
  const openSidepanelBtn = document.getElementById('open-sidepanel');
  const openOptionsBtn = document.getElementById('open-options');
  const visibilityBtn = document.getElementById('visibility-btn');

  let currentSettings = {
    isActive: true,
    spiderCount: 3,
    serverUrl: 'http://localhost:3001',
    connected: false,
    autonomousMode: false,
    spidersVisible: true,
  };

  // 1. Fetch current settings from background
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
    if (res) {
      currentSettings = { ...currentSettings, ...res };
      updateUI();
    }
  });

  // 2. Check connection health
  chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' }, (res) => {
    if (res && res.online !== undefined) {
      currentSettings.connected = res.online;
      updateUI();
    }
  });

  function updateUI() {
    // Toggle Button
    if (currentSettings.isActive) {
      toggleBtn.classList.add('active');
      toggleLabel.textContent = 'ACTIVE';
    } else {
      toggleBtn.classList.remove('active');
      toggleLabel.textContent = 'PAUSED';
    }

    // Connection Dot
    if (currentSettings.connected) {
      connectionDot.className = 'dot online';
      connectionDot.title = 'Local Brain Online (http://localhost:3001)';
    } else {
      connectionDot.className = 'dot offline';
      connectionDot.title = 'Local Brain Offline';
    }

    // Spider Count Selector
    fleetButtons.forEach((btn) => {
      const count = parseInt(btn.dataset.count, 10);
      if (count === currentSettings.spiderCount) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Autonomous Mode
    if (currentSettings.autonomousMode) {
      autonomousBtn.classList.add('active');
      autonomousLabel.textContent = 'Autonomous: ON';
    } else {
      autonomousBtn.classList.remove('active');
      autonomousLabel.textContent = 'Autonomous: OFF';
    }

    // Spider Visibility
    const visible = currentSettings.spidersVisible !== false;
    visibilityBtn.classList.toggle('on', visible);
    visibilityBtn.setAttribute('aria-checked', String(visible));
  }

  // Handle Spider Visibility Toggle (independent of Active/Paused)
  visibilityBtn.addEventListener('click', () => {
    const isCurrentlyVisible = currentSettings.spidersVisible !== false;
    currentSettings.spidersVisible = !isCurrentlyVisible;
    updateUI();
    chrome.runtime.sendMessage({
      type: 'SET_SETTINGS',
      payload: { spidersVisible: currentSettings.spidersVisible },
    });
  });

  // Handle Autonomous Toggle
  autonomousBtn.addEventListener('click', () => {
    currentSettings.autonomousMode = !currentSettings.autonomousMode;
    updateUI();
    chrome.runtime.sendMessage({
      type: 'SET_SETTINGS',
      payload: { autonomousMode: currentSettings.autonomousMode },
    });
  });

  // Handle Start/Stop toggle
  toggleBtn.addEventListener('click', () => {
    currentSettings.isActive = !currentSettings.isActive;
    updateUI();
    chrome.runtime.sendMessage({
      type: 'SET_SETTINGS',
      payload: { isActive: currentSettings.isActive },
    });
  });

  // Handle Spider Count click
  fleetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const count = parseInt(btn.dataset.count, 10);
      currentSettings.spiderCount = count;
      updateUI();
      chrome.runtime.sendMessage({
        type: 'SET_SETTINGS',
        payload: { spiderCount: count },
      });
    });
  });

  // Open Side Panel Chat
  openSidepanelBtn.addEventListener('click', async () => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id });
      } else {
        chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
      }
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/index.html') });
    }
  });

  // Open Options Page
  openOptionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html') });
    }
  });
});
