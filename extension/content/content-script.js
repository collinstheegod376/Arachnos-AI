// ==========================================
// ARACHNOS PERSONAL — CONTENT SCRIPT
// High-Fidelity Animated Spiders, Word Grab Visuals & On-Page Chatbot
// ==========================================

(() => {
  if (window.__ARACHNOS_INJECTED__) return;
  window.__ARACHNOS_INJECTED__ = true;

  console.log('[Arachnos Personal] Injected on:', window.location.href);

  // Configuration state
  let isActive = true;
  let spiderCount = 3;
  let totalWordsGrabbed = 0;
  let recentGrabbedFacts = [];

  // Autonomous Mode state
  let autonomousMode = false;
  let autoScroll = true;
  let autoFollowLinks = true;
  let userInteractionPauseUntil = 0;
  let lastAutoScrollTime = performance.now();
  let autonomousNavTimer = null;
  let autonomousNavCountdown = 4;
  let autonomousNavInterval = null;
  let autonomousNavBanner = null;
  let wordsGrabbedOnThisPage = 0;
  const visitedUrls = new Set([window.location.href.split('#')[0]]);

  // User manual interaction overrides autonomous actions for 5 seconds
  function handleUserInterruption() {
    userInteractionPauseUntil = Date.now() + 5000;
    if (autonomousNavTimer) {
      cancelAutonomousJump();
    }
  }
  window.addEventListener('wheel', handleUserInterruption, { passive: true });
  window.addEventListener('keydown', handleUserInterruption, { passive: true });
  window.addEventListener('touchstart', handleUserInterruption, { passive: true });

  // DOM tracking
  const harvestedElements = new Set();

  function isHarvested(el) {
    if (!el || typeof el !== 'object') return true;
    if (harvestedElements.has(el)) return true;
    try {
      if (el.dataset && el.dataset.arachnosHarvested === 'true') return true;
    } catch {
      // fallback
    }
    return false;
  }

  function markHarvested(el) {
    if (!el || typeof el !== 'object') return;
    try {
      harvestedElements.add(el);
      if (el.dataset) {
        el.dataset.arachnosHarvested = 'true';
      }
    } catch {
      // fallback
    }
  }

  const candidateElements = [];
  let lastDomScan = 0;

  // Visual Spider System
  let canvas = null;
  let ctx = null;
  let animationFrameId = null;
  let lastTime = performance.now();

  // Visual effects queues:
  // 1. Floating word particles physically lifted and grabbed by spiders
  const floatingWords = [];
  // 2. Silk tractor tethers connecting spider to words
  const activeTethers = [];
  // 3. Absorption ripples at spider mouth
  const absorptionRipples = [];
  // 4. Word highlight reticles on screen
  const activeTargetBoxes = [];

  // Spiders fleet configuration
  const SPIDER_PROFILES = [
    {
      id: 'spider-emerald-01',
      name: 'Emerald Harvester',
      glowColor: '#10b981',
      secondaryGlow: '#059669',
      bodyColor: '#111827',
      accentColor: '#34d399',
      speed: 2.5,
    },
    {
      id: 'spider-cyan-02',
      name: 'Cyan Synthesizer',
      glowColor: '#06b6d4',
      secondaryGlow: '#0891b2',
      bodyColor: '#0f172a',
      accentColor: '#38bdf8',
      speed: 2.3,
    },
    {
      id: 'spider-lime-03',
      name: 'Lime Explorer',
      glowColor: '#84cc16',
      secondaryGlow: '#65a30d',
      bodyColor: '#141e12',
      accentColor: '#a3e635',
      speed: 2.7,
    },
    {
      id: 'spider-amber-04',
      name: 'Amber Weaver',
      glowColor: '#f59e0b',
      secondaryGlow: '#d97706',
      bodyColor: '#1c1917',
      accentColor: '#fbbf24',
      speed: 2.2,
    },
  ];

  class Spider {
    constructor(profile, index) {
      this.profile = profile;
      this.index = index;
      const w = window.innerWidth || 1000;
      const h = window.innerHeight || 800;
      const sX = window.scrollX || window.pageXOffset || 0;
      const sY = window.scrollY || window.pageYOffset || 0;

      // Coordinates in document space (spawn reliably inside viewport with staggered spread)
      this.docX = sX + 120 + ((index * 180) % Math.max(w - 240, 200));
      this.docY = sY + 140 + ((index * 130) % Math.max(h - 280, 200));
      this.targetDocX = this.docX;
      this.targetDocY = this.docY;
      this.heading = (index * Math.PI) / 2;
      this.status = 'idle'; // 'moving' | 'harvesting' | 'idle'
      this.stepCycle = 0;
      this.currentTargetElement = null;
      this.harvestTimer = 0;
      this.idleTimer = 15 + index * 10;
      this.eyeIntensity = 1.0;
    }

    // Get current position relative to viewport
    getViewportPos() {
      const sX = window.scrollX || window.pageXOffset || 0;
      const sY = window.scrollY || window.pageYOffset || 0;
      return {
        x: this.docX - sX,
        y: this.docY - sY,
      };
    }

    update(dt) {
      if (!isActive) return;

      const vPos = this.getViewportPos();

      // If user scrolled far away and spider is deep offscreen, scurry back towards visible viewport
      if (vPos.y < -250 || vPos.y > window.innerHeight + 250 || vPos.x < -250 || vPos.x > window.innerWidth + 250) {
        this.targetDocX = window.scrollX + 100 + Math.random() * (window.innerWidth - 200);
        this.targetDocY = window.scrollY + 100 + Math.random() * (window.innerHeight - 200);
        this.status = 'moving';
      }

      if (this.status === 'harvesting') {
        this.harvestTimer -= dt;
        this.eyeIntensity = 1.0 + Math.sin(Date.now() * 0.02) * 0.5;

        if (this.harvestTimer <= 0) {
          this.status = 'idle';
          this.idleTimer = 30 + Math.random() * 40;
          this.currentTargetElement = null;
          this.eyeIntensity = 1.0;
        }
        return;
      }

      if (this.status === 'idle') {
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) {
          this.acquireNextTarget();
        }
        return;
      }

      if (this.status === 'moving') {
        const dx = this.targetDocX - this.docX;
        const dy = this.targetDocY - this.docY;
        const dist = Math.hypot(dx, dy);

        if (dist < 18) {
          if (this.currentTargetElement) {
            // Reached target words -> start grabbing them
            this.status = 'harvesting';
            this.harvestTimer = 90; // ~1.5s
            this.onHarvestStart();
          } else {
            // Wandered to open area -> go idle and pick a new target
            this.status = 'idle';
            this.idleTimer = 30 + Math.random() * 40;
          }
        } else {
          // Rotate smoothly towards target words
          const targetHeading = Math.atan2(dy, dx) + Math.PI / 2;
          let diff = targetHeading - this.heading;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          this.heading += diff * 0.12;

          // Advance in document space
          const moveSpeed = this.profile.speed;
          this.docX += Math.sin(this.heading) * moveSpeed;
          this.docY -= Math.cos(this.heading) * moveSpeed;
          this.stepCycle += 0.28;
        }
      }
    }

    acquireNextTarget() {
      scanDomForCandidates();

      let bestCandidate = null;
      let minDistance = Infinity;

      for (const item of candidateElements) {
        if (!item.element || !item.element.isConnected) continue;
        if (isHarvested(item.element)) continue;

        let rect;
        try {
          rect = item.element.getBoundingClientRect();
        } catch {
          continue;
        }

        // Prefer elements currently visible in viewport
        if (rect.bottom < 20 || rect.top > window.innerHeight - 20) continue;
        if (rect.right < 20 || rect.left > window.innerWidth - 20) continue;

        const docElemX = rect.left + window.scrollX + rect.width / 2;
        const docElemY = rect.top + window.scrollY + rect.height / 2;
        const d = Math.hypot(docElemX - this.docX, docElemY - this.docY);

        if (d < minDistance) {
          minDistance = d;
          bestCandidate = { element: item.element, rect, docX: docElemX, docY: docElemY };
        }
      }

      if (bestCandidate) {
        this.currentTargetElement = bestCandidate.element;
        this.targetDocX = bestCandidate.docX;
        this.targetDocY = bestCandidate.docY;
        this.status = 'moving';
      } else {
        // Smoothly explore visible viewport without harvesting target
        this.currentTargetElement = null;
        this.targetDocX = window.scrollX + 80 + Math.random() * (window.innerWidth - 160);
        this.targetDocY = window.scrollY + 80 + Math.random() * (window.innerHeight - 160);
        this.status = 'moving';
      }
    }

    onHarvestStart() {
      if (!this.currentTargetElement) {
        this.status = 'idle';
        this.idleTimer = 30;
        return;
      }

      const element = this.currentTargetElement;
      if (!element || typeof element !== 'object' || !element.isConnected) {
        this.currentTargetElement = null;
        this.status = 'idle';
        this.idleTimer = 30;
        return;
      }

      markHarvested(element);

      let rect;
      try {
        rect = element.getBoundingClientRect();
      } catch {
        this.currentTargetElement = null;
        this.status = 'idle';
        return;
      }

      const text = element.innerText?.trim() || element.textContent?.trim() || '';

      if (text.length > 5) {
        totalWordsGrabbed += 1;
        wordsGrabbedOnThisPage += 1;
        updateBotBadge();

        const vPos = this.getViewportPos();

        // 1. Add glowing target box around the element words
        activeTargetBoxes.push({
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          color: this.profile.glowColor,
          life: 85,
          maxLife: 85,
        });

        // 2. Extract prominent words from the element to grab
        const cleanWords = text
          .replace(/[^\w\s-]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length >= 3 && !/^(the|and|for|that|this|with|from)$/i.test(w))
          .slice(0, 5);

        const wordsToGrab = cleanWords.length > 0 ? cleanWords : text.split(/\s+/).slice(0, 3);

        // 3. Spawn floating word particles physically lifting off the screen!
        wordsToGrab.forEach((word, idx) => {
          const wordStartX = rect.left + (idx + 0.5) * (rect.width / Math.max(wordsToGrab.length, 1));
          const wordStartY = rect.top + rect.height * 0.5 + (Math.random() - 0.5) * 8;

          floatingWords.push({
            text: word,
            x: wordStartX,
            y: wordStartY,
            originX: wordStartX,
            originY: wordStartY,
            targetSpider: this,
            progress: 0,
            speed: 0.016 + idx * 0.003,
            color: this.profile.accentColor,
            glowColor: this.profile.glowColor,
            delay: idx * 8, // staggered lift off
          });
        });

        // 4. Send harvest event to background worker / local Brain
        const selector = getUniqueSelector(element);
        const payload = {
          type: 'harvest',
          spider_id: this.profile.id,
          page_url: window.location.href,
          content: text.slice(0, 3000),
          raw_text: text.slice(0, 3000),
          selector: selector,
          element_selector: selector,
          bounding_box: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
          confidence: 0.95,
          timestamp: new Date().toISOString(),
        };

        // Cache for on-page chatbot suggestions
        recentGrabbedFacts.unshift({
          snippet: text.slice(0, 140),
          words: wordsToGrab,
          time: new Date().toLocaleTimeString(),
        });
        if (recentGrabbedFacts.length > 10) recentGrabbedFacts.pop();

        chrome.runtime.sendMessage({
          type: 'HARVEST_EVENT',
          payload,
        }).catch(() => {});
      }
    }
  }

  let spiders = [];

  function initSpiders() {
    spiders = [];
    const count = Math.min(Math.max(spiderCount, 1), 4);
    for (let i = 0; i < count; i++) {
      spiders.push(new Spider(SPIDER_PROFILES[i], i));
    }
  }

  // Calculate 3-segment procedural spider leg
  function calculateLeg(hipX, hipY, legIndex, side, walkPhase, isMoving, isHarvesting, baseLength) {
    const angleOffsets = [
      Math.PI * 0.22,
      Math.PI * 0.45,
      Math.PI * 0.65,
      Math.PI * 0.88,
    ];

    const baseAngle = angleOffsets[legIndex] * side;
    const isTripodGroupA =
      (side === 1 && (legIndex === 0 || legIndex === 2)) ||
      (side === -1 && (legIndex === 1 || legIndex === 3));
    const phaseOffset = isTripodGroupA ? 0 : Math.PI;
    const currentPhase = walkPhase + phaseOffset;

    let tipReachX = 0;
    let tipReachY = 0;
    let tipLift = 0;

    if (isMoving) {
      const stride = baseLength * 0.36;
      const forwardOffset = Math.sin(currentPhase) * stride;
      tipLift = Math.max(0, Math.cos(currentPhase)) * 6;
      tipReachX = Math.sin(baseAngle) * (baseLength * 0.9) - side * 4;
      tipReachY = Math.cos(baseAngle) * (baseLength * 0.9) + forwardOffset;
    } else if (isHarvesting && legIndex === 0) {
      // Front pedipalps vibrating during word grab
      const jitter = Math.sin(Date.now() * 0.04 + legIndex) * 3;
      tipReachX = side * 13 + jitter;
      tipReachY = 28 + Math.cos(Date.now() * 0.03) * 2;
      tipLift = 4;
    } else {
      // Idle breathing
      const breathe = Math.sin(Date.now() * 0.003 + legIndex * 0.5) * 1.5;
      tipReachX = Math.sin(baseAngle) * (baseLength * 0.85 + breathe);
      tipReachY = Math.cos(baseAngle) * (baseLength * 0.85);
    }

    const tipX = hipX + tipReachX;
    const tipY = hipY + tipReachY;

    const kneeDist = baseLength * 0.55;
    const kneeAngle = baseAngle + side * 0.25;
    const kneeX = hipX + Math.sin(kneeAngle) * kneeDist;
    const kneeY = hipY + Math.cos(kneeAngle) * kneeDist - tipLift * 0.7;

    const ankleX = (kneeX + tipX) * 0.5 + side * 3;
    const ankleY = (kneeY + tipY) * 0.5 - tipLift * 0.3;

    return {
      knee: { x: kneeX, y: kneeY },
      ankle: { x: ankleX, y: ankleY },
      tip: { x: tipX, y: tipY },
    };
  }

  // Draw spider at screen coordinates
  function drawSpiderAt(ctx, spider, screenX, screenY) {
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(spider.heading);

    const isMoving = spider.status === 'moving';
    const isHarvesting = spider.status === 'harvesting';
    const walkPhase = spider.stepCycle * (isMoving ? 1.4 : 0.4);
    const scale = 0.88;

    ctx.scale(scale, scale);

    const legLength = 34;

    // 1. Draw 8 Procedural Legs
    for (let side of [-1, 1]) {
      for (let legIdx = 0; legIdx < 4; legIdx++) {
        const hipX = side * (5 + legIdx * 1.5);
        const hipY = -4 + legIdx * 5;

        const joints = calculateLeg(
          hipX,
          hipY,
          legIdx,
          side,
          walkPhase,
          isMoving,
          isHarvesting,
          legLength
        );

        // Leg Shadow
        ctx.beginPath();
        ctx.moveTo(hipX + 2, hipY + 3);
        ctx.lineTo(joints.knee.x + 2, joints.knee.y + 3);
        ctx.lineTo(joints.ankle.x + 2, joints.ankle.y + 3);
        ctx.lineTo(joints.tip.x + 2, joints.tip.y + 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Main Metallic Leg
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(joints.knee.x, joints.knee.y);
        ctx.lineTo(joints.ankle.x, joints.ankle.y);
        ctx.lineTo(joints.tip.x, joints.tip.y);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Emissive Joint Accents
        ctx.fillStyle = spider.profile.glowColor;
        ctx.beginPath();
        ctx.arc(joints.knee.x, joints.knee.y, 1.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(joints.tip.x, joints.tip.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Pedipalps (Front feelers)
    for (let side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 4, -12);
      ctx.quadraticCurveTo(side * 8, -20, side * 5, -24);
      ctx.strokeStyle = spider.profile.accentColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // 3. Abdomen (Rear)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 14, 10, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = spider.profile.bodyColor;
    ctx.fill();
    ctx.strokeStyle = spider.profile.secondaryGlow;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Luminescent lines on abdomen
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, 24);
    ctx.strokeStyle = spider.profile.glowColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 18, 2, 0, Math.PI * 2);
    ctx.fillStyle = spider.profile.accentColor;
    ctx.fill();
    ctx.restore();

    // 4. Cephalothorax (Front carapace)
    ctx.beginPath();
    ctx.ellipse(0, -4, 8, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = spider.profile.bodyColor;
    ctx.fill();
    ctx.strokeStyle = spider.profile.glowColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 5. Glowing Quad Eyes
    ctx.fillStyle = spider.profile.accentColor;
    ctx.shadowColor = spider.profile.glowColor;
    ctx.shadowBlur = 8 * spider.eyeIntensity;
    ctx.beginPath();
    ctx.arc(-3, -9, 1.8, 0, Math.PI * 2);
    ctx.arc(3, -9, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-5.5, -6.5, 1.2, 0, Math.PI * 2);
    ctx.arc(5.5, -6.5, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // Draw optical sensory scanning cone when spider is seeing the words
  function drawVisionCone(ctx, spider, spiderPos, targetRect) {
    if (!targetRect || !spiderPos) return;

    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    const angle = Math.atan2(targetCenterY - spiderPos.y, targetCenterX - spiderPos.x);
    const dist = Math.hypot(targetCenterX - spiderPos.x, targetCenterY - spiderPos.y);

    if (dist < 500 && dist > 15 && Number.isFinite(dist) && Number.isFinite(spiderPos.x) && Number.isFinite(spiderPos.y)) {
      ctx.save();
      const coneWidth = Math.min(dist * 0.35, 60);

      try {
        const grad = ctx.createRadialGradient(
          spiderPos.x, spiderPos.y, 10,
          targetCenterX, targetCenterY, dist
        );
        grad.addColorStop(0, spider.profile.glowColor + '33');
        grad.addColorStop(0.7, spider.profile.accentColor + '15');
        grad.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.moveTo(spiderPos.x, spiderPos.y);
        ctx.lineTo(
          targetCenterX - Math.sin(angle) * coneWidth,
          targetCenterY + Math.cos(angle) * coneWidth
        );
        ctx.lineTo(
          targetCenterX + Math.sin(angle) * coneWidth,
          targetCenterY - Math.cos(angle) * coneWidth
        );
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Scanning Laser Line over the words
        const scanOffset = (Date.now() % 1000) / 1000;
        const scanY = targetRect.top + targetRect.height * scanOffset;

        ctx.beginPath();
        ctx.moveTo(targetRect.left, scanY);
        ctx.lineTo(targetRect.left + targetRect.width, scanY);
        ctx.strokeStyle = spider.profile.accentColor;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.stroke();
      } catch {
        // ignore gradient arithmetic failure
      }

      ctx.restore();
    }
  }

  // Animation Loop (NEVER stops or disappears on scroll)
  function render(time) {
    animationFrameId = requestAnimationFrame(render);

    const dt = Math.min((time - lastTime) / 16.66, 3);
    lastTime = time;

    if (!canvas || !ctx) return;

    try {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, (canvas.width / dpr) + 100, (canvas.height / dpr) + 100);

      if (isActive) {
        // 1. Draw glowing targeting reticles around candidate words on screen
        for (let i = activeTargetBoxes.length - 1; i >= 0; i--) {
          const tb = activeTargetBoxes[i];
          tb.life -= dt;
          if (tb.life <= 0) {
            activeTargetBoxes.splice(i, 1);
            continue;
          }

          const alpha = (tb.life / tb.maxLife) * 0.7;
          const r = tb.rect;
          const corner = 6;

          ctx.save();
          ctx.strokeStyle = tb.color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1.4;

          // Corner brackets around the grabbed words: [  ]
          ctx.beginPath();
          ctx.moveTo(r.left, r.top + corner);
          ctx.lineTo(r.left, r.top);
          ctx.lineTo(r.left + corner, r.top);
          ctx.moveTo(r.left + r.width - corner, r.top);
          ctx.lineTo(r.left + r.width, r.top);
          ctx.lineTo(r.left + r.width, r.top + corner);
          ctx.moveTo(r.left, r.top + r.height - corner);
          ctx.lineTo(r.left, r.top + r.height);
          ctx.lineTo(r.left + corner, r.top + r.height);
          ctx.moveTo(r.left + r.width - corner, r.top + r.height);
          ctx.lineTo(r.left + r.width, r.top + r.height);
          ctx.lineTo(r.left + r.width, r.top + r.height - corner);
          ctx.stroke();
          ctx.restore();
        }

        // 2. Draw & update Floating Words physically lifted off the page towards spiders!
        for (let i = floatingWords.length - 1; i >= 0; i--) {
          const fw = floatingWords[i];
          if (fw.delay > 0) {
            fw.delay -= dt;
            continue;
          }

          fw.progress += fw.speed * dt;
          const spiderPos = fw.targetSpider.getViewportPos();

          // Bezier curve pulling word from DOM to spider mouth
          const t = Math.min(fw.progress, 1.0);
          const controlY = Math.min(fw.originY, spiderPos.y) - 25;
          const oneMinusT = 1 - t;

          fw.x = oneMinusT * oneMinusT * fw.originX + 2 * oneMinusT * t * ((fw.originX + spiderPos.x) / 2) + t * t * spiderPos.x;
          fw.y = oneMinusT * oneMinusT * fw.originY + 2 * oneMinusT * t * controlY + t * t * spiderPos.y;

          // Silk tractor beam filament connecting spider to the floating word
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(spiderPos.x, spiderPos.y);
          ctx.quadraticCurveTo((fw.x + spiderPos.x) / 2, controlY, fw.x, fw.y);
          ctx.strokeStyle = fw.glowColor;
          ctx.globalAlpha = Math.max(0, 0.6 * (1 - t * 0.8));
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
          ctx.restore();

          // Draw Glowing Floating Word
          const alpha = t < 0.8 ? 1.0 : Math.max(0, (1.0 - t) * 5);
          ctx.save();
          ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
          ctx.fillStyle = fw.color;
          ctx.shadowColor = fw.glowColor;
          ctx.shadowBlur = 10;
          ctx.globalAlpha = alpha;
          ctx.fillText(fw.text, fw.x - 8, fw.y);
          ctx.restore();

          if (fw.progress >= 1.0) {
            // Reached spider mouth -> create absorption ripple!
            absorptionRipples.push({
              x: spiderPos.x,
              y: spiderPos.y,
              radius: 2,
              maxRadius: 18,
              color: fw.color,
              life: 20,
              maxLife: 20,
            });
            floatingWords.splice(i, 1);
          }
        }

        // 3. Draw absorption ripples
        for (let i = absorptionRipples.length - 1; i >= 0; i--) {
          const ar = absorptionRipples[i];
          ar.life -= dt;
          ar.radius += 0.8 * dt;
          if (ar.life <= 0) {
            absorptionRipples.splice(i, 1);
            continue;
          }

          const alpha = ar.life / ar.maxLife;
          ctx.save();
          ctx.beginPath();
          ctx.arc(ar.x, ar.y, ar.radius, 0, Math.PI * 2);
          ctx.strokeStyle = ar.color;
          ctx.globalAlpha = alpha * 0.8;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }

      // 4. Update and draw spiders (ALWAYS visible, even while scrolling or paused)
      for (const spider of spiders) {
        if (isActive) {
          spider.update(dt);
        }
        const sPos = spider.getViewportPos();

        // Draw vision cone if spider is looking at a target element
        if (isActive && spider.currentTargetElement && spider.currentTargetElement.isConnected) {
          try {
            const rect = spider.currentTargetElement.getBoundingClientRect();
            drawVisionCone(ctx, spider, sPos, rect);
          } catch {
            // ignore
          }
        }

        // Draw the physical spider
        drawSpiderAt(ctx, spider, sPos.x, sPos.y);
      }

      tickAutonomousExploration(time);
    } catch (err) {
      console.warn('[Arachnos] Render frame error:', err);
    }
  }

  // ==========================================
  // AUTONOMOUS EXPLORATION ENGINE
  // Full page control: Auto-scrolling & link hopping
  // ==========================================
  function tickAutonomousExploration(currentTime) {
    if (!isActive || !autonomousMode) return;

    // Safety pause: if user manually scrolled or typed, wait until timeout expires
    if (Date.now() < userInteractionPauseUntil) return;

    // 1. Smooth Auto-Scroll down the page
    if (autoScroll && currentTime - lastAutoScrollTime > 3400) {
      const scrollY = window.scrollY;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

      if (scrollY < maxScroll - 60) {
        // Smoothly scroll down to reveal new content for spiders
        window.scrollBy({ top: 380, left: 0, behavior: 'smooth' });
        lastAutoScrollTime = currentTime;
        scanDomForCandidates();
      } else {
        // Page bottom reached! If autoFollowLinks, trigger hopping to an internal article/page
        if (autoFollowLinks && !autonomousNavTimer) {
          triggerAutonomousLinkHop();
        }
      }
    }

    // 2. Link hopping trigger after enough words harvested on current page
    if (autoFollowLinks && wordsGrabbedOnThisPage >= 12 && !autonomousNavTimer && (currentTime - lastAutoScrollTime > 7000)) {
      triggerAutonomousLinkHop();
    }
  }

  // Locate best next internal article/content link on current page
  function findBestNextLink() {
    const currentOrigin = window.location.origin;
    const currentClean = window.location.href.split('#')[0];
    const anchors = Array.from(document.querySelectorAll('a[href]'));

    const candidates = [];
    for (const a of anchors) {
      try {
        const href = a.href;
        if (!href.startsWith('http://') && !href.startsWith('https://')) continue;
        const url = new URL(href);
        if (url.origin !== currentOrigin) continue; // stay on same site
        const cleanHref = href.split('#')[0];
        if (cleanHref === currentClean) continue;
        if (visitedUrls.has(cleanHref)) continue;

        // Ignore logout/login/signup or media downloads
        if (/login|logout|signin|signup|privacy|terms|\.pdf$|\.zip$/i.test(url.pathname)) continue;

        const text = a.innerText?.trim();
        if (!text || text.length < 3) continue;

        candidates.push({ anchor: a, url: cleanHref, title: text });
      } catch {
        // invalid URL ignore
      }
    }

    if (candidates.length === 0) return null;

    // Prioritize links within main article / content tags
    candidates.sort((a, b) => {
      const aInMain = a.anchor.closest('main, article, .content, #content') ? 2 : 0;
      const bInMain = b.anchor.closest('main, article, .content, #content') ? 2 : 0;
      return bInMain - aInMain;
    });

    return candidates[0];
  }

  function triggerAutonomousLinkHop() {
    if (autonomousNavTimer) return;
    const target = findBestNextLink();
    if (!target) return;

    showAutonomousNavBanner(target);
  }

  function showAutonomousNavBanner(target) {
    if (!autonomousNavBanner) {
      autonomousNavBanner = document.createElement('div');
      autonomousNavBanner.id = 'arachnos-auto-banner';
      autonomousNavBanner.innerHTML = `
        <div style="position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 2147483647; background: #080c14; border: 1.5px solid #10b981; border-radius: 24px; padding: 10px 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 25px rgba(16,185,129,0.35); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; gap: 14px; color: #f8fafc; font-size: 13px;">
          <span style="font-size: 16px;">⚡</span>
          <div>
            <span style="font-weight: 700; color: #10b981;">AUTONOMOUS JUMP:</span>
            <span id="ab-hop-target" style="margin-left: 4px; color: #cbd5e1; max-width: 260px; display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom;"></span>
            <span id="ab-hop-countdown" style="margin-left: 6px; font-weight: 700; color: #34d399;">(4s)</span>
          </div>
          <button id="ab-cancel-hop-btn" style="background: rgba(239,68,68,0.2); border: 1px solid #ef4444; color: #fca5a5; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 12px; cursor: pointer;">Cancel</button>
        </div>
      `;
      document.documentElement.appendChild(autonomousNavBanner);

      document.getElementById('ab-cancel-hop-btn')?.addEventListener('click', () => {
        cancelAutonomousJump();
      });
    }

    autonomousNavBanner.style.display = 'block';
    const targetLabel = document.getElementById('ab-hop-target');
    const countdownLabel = document.getElementById('ab-hop-countdown');
    if (targetLabel) targetLabel.textContent = target.title || target.url;

    autonomousNavCountdown = 4;
    if (countdownLabel) countdownLabel.textContent = `(${autonomousNavCountdown}s)`;

    if (autonomousNavInterval) clearInterval(autonomousNavInterval);
    autonomousNavInterval = setInterval(() => {
      autonomousNavCountdown--;
      if (countdownLabel) countdownLabel.textContent = `(${autonomousNavCountdown}s)`;
      if (autonomousNavCountdown <= 0) {
        clearInterval(autonomousNavInterval);
        autonomousNavInterval = null;
      }
    }, 1000);

    autonomousNavTimer = setTimeout(() => {
      visitedUrls.add(target.url);
      window.location.href = target.url;
    }, 4000);
  }

  function cancelAutonomousJump() {
    if (autonomousNavTimer) {
      clearTimeout(autonomousNavTimer);
      autonomousNavTimer = null;
    }
    if (autonomousNavInterval) {
      clearInterval(autonomousNavInterval);
      autonomousNavInterval = null;
    }
    if (autonomousNavBanner) {
      autonomousNavBanner.style.display = 'none';
    }
    // Pause auto actions for 8s after cancel
    userInteractionPauseUntil = Date.now() + 8000;
  }

  function updateAutonomousUI() {
    const autoPill = document.getElementById('ab-auto-pill');
    if (autoPill) {
      if (autonomousMode) {
        autoPill.style.background = 'rgba(16, 185, 129, 0.2)';
        autoPill.style.borderColor = '#10b981';
        autoPill.style.color = '#34d399';
        autoPill.textContent = '⚡ Auto: ON';
      } else {
        autoPill.style.background = 'rgba(255,255,255,0.06)';
        autoPill.style.borderColor = 'rgba(255,255,255,0.15)';
        autoPill.style.color = '#94a3b8';
        autoPill.textContent = '⚡ Auto: OFF';
      }
    }
  }

  // Scan DOM for text nodes and structural content
  function scanDomForCandidates() {
    const now = Date.now();
    if (now - lastDomScan < 2500) return;
    lastDomScan = now;

    candidateElements.length = 0;
    const selectors = ['h1', 'h2', 'h3', 'h4', 'p', 'article', 'blockquote', 'li', 'td', 'pre'];
    const elements = document.querySelectorAll(selectors.join(','));

    for (const el of elements) {
      if (isHarvested(el)) continue;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      const text = el.innerText?.trim();
      if (!text || text.length < 10) continue;

      if (el.closest('nav, footer, script, style, noscript, [aria-hidden="true"], #arachnos-bot-widget')) continue;

      candidateElements.push({ element: el });
      if (candidateElements.length >= 80) break;
    }
  }

  // Create unique CSS selector
  function getUniqueSelector(el) {
    if (el.id) return `#${el.id}`;
    let path = [];
    let current = el;
    while (current && current !== document.body) {
      let tag = current.tagName.toLowerCase();
      let parent = current.parentElement;
      if (parent) {
        let siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          let idx = siblings.indexOf(current) + 1;
          tag += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(tag);
      current = parent;
      if (path.length >= 3) break;
    }
    return path.join(' > ') || 'body';
  }

  // Inject overlay canvas into page
  function injectCanvasOverlay() {
    if (document.getElementById('arachnos-spider-canvas')) return;

    canvas = document.createElement('canvas');
    canvas.id = 'arachnos-spider-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '2147483646';
    canvas.style.background = 'transparent';

    const host = document.body || document.documentElement;
    if (host) {
      host.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);

    scanDomForCandidates();
    initSpiders();
    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(render);
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth || document.documentElement.clientWidth || 1200;
    const h = window.innerHeight || document.documentElement.clientHeight || 800;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }

  // ==========================================
  // ON-PAGE FLOATING CHATBOT WIDGET
  // Answers with what Arachnos learns live
  // ==========================================
  let botWidget = null;
  let botBadge = null;
  let botCard = null;
  let botMessages = null;
  let botInput = null;

  function injectOnPageChatbot() {
    if (document.getElementById('arachnos-bot-widget')) return;

    botWidget = document.createElement('div');
    botWidget.id = 'arachnos-bot-widget';
    botWidget.innerHTML = `
      <style>
        #arachnos-bot-widget {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 2147483645;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          user-select: none;
        }
        #arachnos-bot-button {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #090e18;
          border: 1.5px solid #10b981;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 12px rgba(16,185,129,0.3);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        #arachnos-bot-button:hover {
          transform: scale(1.08);
          box-shadow: 0 4px 25px rgba(0,0,0,0.6), 0 0 18px rgba(16,185,129,0.5);
        }
        #arachnos-bot-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #10b981;
          color: #02140d;
          font-size: 10px;
          font-weight: 700;
          border-radius: 10px;
          padding: 1px 5px;
          min-width: 14px;
          text-align: center;
          box-shadow: 0 2px 5px rgba(0,0,0,0.4);
        }
        #arachnos-chat-card {
          display: none;
          position: absolute;
          bottom: 56px;
          right: 0;
          width: 340px;
          height: 460px;
          background: #080c14;
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 14px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.7), 0 0 20px rgba(16,185,129,0.15);
          flex-direction: column;
          overflow: hidden;
          backdrop-filter: blur(12px);
        }
        #arachnos-chat-card.open {
          display: flex;
        }
        .ab-header {
          padding: 12px 14px;
          background: #0c121e;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .ab-header-title {
          font-size: 13px;
          font-weight: 600;
          color: #f1f5f9;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ab-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 16px;
          cursor: pointer;
        }
        .ab-close-btn:hover { color: #f1f5f9; }
        .ab-messages {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-size: 12px;
          line-height: 1.5;
        }
        .ab-msg {
          padding: 8px 12px;
          border-radius: 10px;
          max-width: 90%;
          word-break: break-word;
        }
        .ab-msg.user {
          align-self: flex-end;
          background: #141f33;
          color: #f8fafc;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .ab-msg.bot {
          align-self: flex-start;
          background: #0e1522;
          color: #e2e8f0;
          border-left: 2.5px solid #10b981;
        }
        .ab-suggestions {
          padding: 6px 12px;
          display: flex;
          gap: 6px;
          overflow-x: auto;
          background: #090e18;
          border-top: 1px solid rgba(255,255,255,0.04);
        }
        .ab-chip {
          background: rgba(16,185,129,0.1);
          border: 1px solid rgba(16,185,129,0.25);
          color: #10b981;
          font-size: 10.5px;
          padding: 3px 8px;
          border-radius: 12px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s;
        }
        .ab-chip:hover { background: rgba(16,185,129,0.2); }
        .ab-footer {
          padding: 10px 12px;
          background: #080c14;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          gap: 8px;
        }
        .ab-input {
          flex: 1;
          background: #0e1522;
          border: 1px solid rgba(255,255,255,0.1);
          color: #f8fafc;
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 16px;
          outline: none;
        }
        .ab-input:focus { border-color: #10b981; }
        .ab-send {
          background: #10b981;
          border: none;
          color: #02120b;
          font-size: 11px;
          font-weight: 700;
          padding: 0 12px;
          border-radius: 16px;
          cursor: pointer;
        }
        .ab-send:hover { background: #34d399; }
      </style>

      <!-- Toggle Button -->
      <div id="arachnos-bot-button" title="Arachnos Chatbot (Answers with what it learns)">
        <svg viewBox="0 0 128 128" width="22" height="22">
          <ellipse cx="64" cy="78" rx="14" ry="18" fill="#111827" stroke="#10b981" stroke-width="3"/>
          <ellipse cx="64" cy="54" rx="11" ry="12" fill="#111827" stroke="#34d399" stroke-width="3"/>
          <circle cx="60" cy="50" r="2.5" fill="#34d399"/>
          <circle cx="68" cy="50" r="2.5" fill="#34d399"/>
          <path d="M 54 54 Q 30 26 18 36 M 52 62 Q 22 50 14 62" stroke="#10b981" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M 74 54 Q 98 26 110 36 M 76 62 Q 106 50 114 62" stroke="#10b981" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </svg>
        <span id="arachnos-bot-badge">0</span>
      </div>

      <!-- Expandable Chatbot Card -->
      <div id="arachnos-chat-card">
        <div class="ab-header">
          <div class="ab-header-title">
            <span style="color: #10b981;">🕷️</span> Arachnos Assistant
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="ab-auto-pill" title="Toggle Autonomous Mode" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #94a3b8; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 12px; cursor: pointer; transition: all 0.2s;">⚡ Auto: OFF</button>
            <button class="ab-close-btn" id="ab-close-btn">✕</button>
          </div>
        </div>

        <div class="ab-messages" id="ab-messages">
          <div class="ab-msg bot">
            I am watching this page! As my spiders harvest words and knowledge, ask me anything and I will answer with what I learn.
          </div>
        </div>

        <div class="ab-suggestions">
          <div class="ab-chip" data-q="What did you learn from this page?">What did you learn?</div>
          <div class="ab-chip" data-q="Summarize the key facts about this page">Summarize page</div>
          <div class="ab-chip" data-q="What numbers or metrics were found?">Metrics</div>
        </div>

        <form class="ab-footer" id="ab-form">
          <input type="text" class="ab-input" id="ab-input" placeholder="Ask what Arachnos learned..." autocomplete="off" />
          <button type="submit" class="ab-send">Ask</button>
        </form>
      </div>
    `;

    const host = document.body || document.documentElement;
    if (host) {
      host.appendChild(botWidget);
    }

    const btn = botWidget.querySelector('#arachnos-bot-button');
    botCard = botWidget.querySelector('#arachnos-chat-card');
    botBadge = botWidget.querySelector('#arachnos-bot-badge');
    botMessages = botWidget.querySelector('#ab-messages');
    botInput = botWidget.querySelector('#ab-input');
    const closeBtn = botWidget.querySelector('#ab-close-btn');
    const form = botWidget.querySelector('#ab-form');
    const autoPill = botWidget.querySelector('#ab-auto-pill');

    if (autoPill) {
      autoPill.addEventListener('click', () => {
        autonomousMode = !autonomousMode;
        chrome.runtime.sendMessage({
          type: 'SET_SETTINGS',
          payload: { autonomousMode }
        });
        updateAutonomousUI();
      });
    }

    if (btn && botCard) {
      btn.addEventListener('click', () => {
        botCard.classList.toggle('open');
        if (botCard.classList.contains('open') && botInput) {
          botInput.focus();
        }
      });
    }

    if (closeBtn && botCard) {
      closeBtn.addEventListener('click', () => {
        botCard.classList.remove('open');
      });
    }

    // Chips
    botWidget.querySelectorAll('.ab-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.dataset.q;
        if (q) handleBotQuery(q);
      });
    });

    if (form && botInput) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = botInput.value.trim();
        if (!q) return;
        botInput.value = '';
        handleBotQuery(q);
      });
    }
  }

  function updateBotBadge() {
    if (botBadge) {
      botBadge.textContent = totalWordsGrabbed.toString();
    }
  }

  function handleBotQuery(query) {
    if (!botMessages) return;

    // Append user message
    const userMsg = document.createElement('div');
    userMsg.className = 'ab-msg user';
    userMsg.textContent = query;
    botMessages.appendChild(userMsg);

    // Append loading placeholder
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'ab-msg bot';
    loadingMsg.style.fontStyle = 'italic';
    loadingMsg.style.color = '#94a3b8';
    loadingMsg.textContent = 'Searching what the spiders learned...';
    botMessages.appendChild(loadingMsg);
    botMessages.scrollTop = botMessages.scrollHeight;

    chrome.runtime.sendMessage({ type: 'QUERY_BRAIN', query }, (res) => {
      loadingMsg.remove();
      const botMsg = document.createElement('div');
      botMsg.className = 'ab-msg bot';

      if (res && res.success && res.data) {
        let answerText = res.data.answer || 'I have not harvested enough words on that topic yet.';
        botMsg.innerHTML = answerText.replace(/\n\n/g, '<br><br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // If citations exist, add tiny source pills
        if (res.data.citations && res.data.citations.length > 0) {
          const sourcesDiv = document.createElement('div');
          sourcesDiv.style.marginTop = '6px';
          sourcesDiv.style.fontSize = '10px';
          sourcesDiv.style.color = '#10b981';
          sourcesDiv.innerHTML = `📌 Grabbed from: <em>${res.data.citations[0].snippet ? res.data.citations[0].snippet.slice(0, 80) + '...' : 'page element'}</em>`;
          botMsg.appendChild(sourcesDiv);
        }
      } else {
        botMsg.textContent = 'Could not reach Brain server on http://localhost:3001. Ensure `npm start` is running!';
      }

      botMessages.appendChild(botMsg);
      botMessages.scrollTop = botMessages.scrollHeight;
    });
  }

  // Listen for background config updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CONFIG_UPDATED') {
      if (message.config.isActive !== undefined) {
        isActive = message.config.isActive;
      }
      if (message.config.spiderCount !== undefined && message.config.spiderCount !== spiderCount) {
        spiderCount = message.config.spiderCount;
        initSpiders();
      }
      if (message.config.autonomousMode !== undefined) {
        autonomousMode = message.config.autonomousMode;
        updateAutonomousUI();
      }
      if (message.config.autoScroll !== undefined) {
        autoScroll = message.config.autoScroll;
      }
      if (message.config.autoFollowLinks !== undefined) {
        autoFollowLinks = message.config.autoFollowLinks;
      }
    }
  });

  // Immediate startup: spiders and UI appear instantly on page load
  function startArachnos() {
    injectCanvasOverlay();
    injectOnPageChatbot();
    updateAutonomousUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startArachnos);
  } else {
    startArachnos();
  }

  // Sync background settings in parallel
  try {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res) {
        isActive = res.isActive !== undefined ? res.isActive : true;
        if (res.spiderCount && res.spiderCount !== spiderCount) {
          spiderCount = res.spiderCount;
          initSpiders();
        }
        autonomousMode = res.autonomousMode !== undefined ? res.autonomousMode : false;
        autoScroll = res.autoScroll !== undefined ? res.autoScroll : true;
        autoFollowLinks = res.autoFollowLinks !== undefined ? res.autoFollowLinks : true;
        updateAutonomousUI();
      }
    });
  } catch {
    // ignore
  }

  // MutationObserver for dynamic page SPAs
  const observer = new MutationObserver(() => {
    scanDomForCandidates();
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
