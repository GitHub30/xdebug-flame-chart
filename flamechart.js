/**
 * Flame Chart and Overview Timeline Visualisation Engine
 */

export class FlameChart {
  constructor(containerId, canvasId, overviewCanvasId, tooltipId) {
    this.container = document.getElementById(containerId);
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    this.overviewCanvas = document.getElementById(overviewCanvasId);
    this.overviewCtx = this.overviewCanvas.getContext('2d');

    this.tooltip = document.getElementById(tooltipId);

    // Core data
    this.traceData = null;
    this.calls = [];
    this.maxDepth = 1;
    this.duration = 0; // total duration in ms

    // Layout parameters
    this.barHeight = 20;
    this.barSpacing = 1;
    this.paddingTop = 30; // space for time markers
    this.levelOffset = 0; // scroll offset in levels (Y direction)

    // Viewport state (Main Chart)
    // xAxis values represent time in ms
    this.viewStart = 0; // ms
    this.viewEnd = 0; // ms

    // Interaction states
    this.hoveredCall = null;
    this.selectedCall = null;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartViewStart = 0;
    this.dragStartLevelOffset = 0;
    this.dragDirection = null;

    // Search states
    this.searchQuery = '';
    this.searchResults = [];
    this.currentSearchIndex = -1;

    // Overview minimap state
    this.overviewDragMode = null; // 'pan', 'left-handle', 'right-handle', 'brush'
    this.overviewDragStartTime = 0;
    this.overviewDragStartX = 0;

    // Event callback
    this.onSelectCall = null;
    this.renderPending = false;

    this.initEvents();
    this.resize();
  }

  setData(traceData) {
    this.traceData = traceData;
    this.calls = traceData.calls;
    this.maxDepth = traceData.maxDepth;
    this.duration = traceData.duration;

    // Optimization 1: Group calls by level for instant hover checks
    this.callsByLevel = new Map();
    for (let i = 0; i < this.calls.length; i++) {
      const call = this.calls[i];
      if (!this.callsByLevel.has(call.level)) {
        this.callsByLevel.set(call.level, []);
      }
      this.callsByLevel.get(call.level).push(call);
    }

    // Optimization 2: Precalculate Overview Max Depths (Static Profile)
    const bucketCount = 2000;
    this.overviewMaxDepths = new Array(bucketCount).fill(0);
    const timeScale = this.duration / bucketCount;
    if (this.duration > 0) {
      for (let i = 0; i < this.calls.length; i++) {
        const call = this.calls[i];
        const startBucket = Math.floor(call.startTime / timeScale);
        const endBucket = Math.floor(call.endTime / timeScale);

        const bStart = Math.max(0, startBucket);
        const bEnd = Math.min(bucketCount - 1, endBucket);
        for (let b = bStart; b <= bEnd; b++) {
          if (call.level > this.overviewMaxDepths[b]) {
            this.overviewMaxDepths[b] = call.level;
          }
        }
      }
    }

    // Set default viewport to show whole trace
    this.viewStart = 0;
    this.viewEnd = this.duration;
    this.selectedCall = null;
    this.hoveredCall = null;
    this.levelOffset = 0;
    this.searchQuery = '';
    this.searchResults = [];
    this.currentSearchIndex = -1;
    this.totalMatchTime = 0;

    this.updateSearchCount();
    this.render();
  }

  resize() {
    // Setup Main Canvas DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.scale(dpr, dpr);

    // Setup Overview Canvas DPI
    const overviewRect = this.overviewCanvas.parentElement.getBoundingClientRect();
    this.overviewCanvas.width = overviewRect.width * dpr;
    this.overviewCanvas.height = overviewRect.height * dpr;
    this.overviewCanvas.style.width = overviewRect.width + 'px';
    this.overviewCanvas.style.height = overviewRect.height + 'px';
    this.overviewCtx.scale(dpr, dpr);

    this.render();
  }

  // Calculate stable hash color based on function name
  getCallColor(call) {
    const name = call.name;
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Design decision: User functions in blue/purple, internal in orange/amber
    if (call.isUser) {
      // User functions: Hues 195 to 260
      const hue = 195 + Math.abs(hash % 65);
      return `hsl(${hue}, 60%, 42%)`;
    } else {
      // Internal functions: Hues 25 to 70
      const hue = 25 + Math.abs(hash % 45);
      return `hsl(${hue}, 70%, 48%)`;
    }
  }

  // Convert time (ms) to canvas X coordinate
  timeToX(time) {
    const viewWidth = this.canvas.width / (window.devicePixelRatio || 1);
    const viewDuration = this.viewEnd - this.viewStart;
    if (viewDuration <= 0) return 0;
    return ((time - this.viewStart) / viewDuration) * viewWidth;
  }

  // Convert canvas X coordinate to time (ms)
  xToTime(x) {
    const viewWidth = this.canvas.width / (window.devicePixelRatio || 1);
    const viewDuration = this.viewEnd - this.viewStart;
    return this.viewStart + (x / viewWidth) * viewDuration;
  }

  // Convert level to canvas Y coordinate
  levelToY(level) {
    return this.paddingTop + (level - 1 - this.levelOffset) * (this.barHeight + this.barSpacing);
  }

  // Convert canvas Y coordinate to level (1-indexed)
  yToLevel(y) {
    if (y < this.paddingTop) return null;
    return Math.floor((y - this.paddingTop) / (this.barHeight + this.barSpacing)) + 1 + this.levelOffset;
  }

  // Find call node at canvas coordinates
  findCallAt(x, y) {
    if (!this.traceData || this.calls.length === 0 || !this.callsByLevel) return null;

    const time = this.xToTime(x);
    const level = this.yToLevel(y);
    if (level === null) return null;

    const levelCalls = this.callsByLevel.get(level);
    if (!levelCalls || levelCalls.length === 0) return null;

    // Binary search on levelCalls for the call that overlaps the time
    let low = 0;
    let high = levelCalls.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const call = levelCalls[mid];
      if (time >= call.startTime && time <= call.endTime) {
        return call;
      } else if (time < call.startTime) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return null;
  }

  initEvents() {
    window.addEventListener('resize', () => this.resize());

    // --- MAIN CANVAS EVENTS ---
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.traceData) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.isDragging = true;
      this.dragStartX = x;
      this.dragStartY = y;
      this.dragStartViewStart = this.viewStart;
      this.dragStartLevelOffset = this.levelOffset;
      this.dragDirection = null;

      const call = this.findCallAt(x, y);
      if (call) {
        this.selectedCall = call;
        this.render();
        if (this.onSelectCall) this.onSelectCall(call);
      } else {
        this.selectedCall = null;
        this.render();
        if (this.onSelectCall) this.onSelectCall(null);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.traceData) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (this.isDragging) {
        const dx = x - this.dragStartX;
        const dy = y - this.dragStartY;

        // Lock drag direction after moving 5px
        if (this.dragDirection === null) {
          const dist = Math.hypot(dx, dy);
          if (dist > 5) {
            if (Math.abs(dx) > Math.abs(dy)) {
              this.dragDirection = 'horizontal';
            } else {
              this.dragDirection = 'vertical';
            }
          }
        }

        if (this.dragDirection === 'horizontal') {
          // Panning horizontally (adjust viewStart & viewEnd)
          const dTime = this.xToTime(this.dragStartX) - this.xToTime(x);
          const viewDuration = this.viewEnd - this.viewStart;

          this.viewStart = Math.max(0, Math.min(this.duration - viewDuration, this.dragStartViewStart + dTime));
          this.viewEnd = this.viewStart + viewDuration;
          
          this.updateTooltip(null, 0, 0);
          this.render();
        } else if (this.dragDirection === 'vertical') {
          // Panning vertically (adjust levelOffset)
          const dLevels = Math.round(dy / (this.barHeight + this.barSpacing));
          this.levelOffset = Math.max(0, Math.min(this.maxDepth - 2, this.dragStartLevelOffset - dLevels));
          
          this.updateTooltip(null, 0, 0);
          this.render();
        }
      } else {
        const call = this.findCallAt(x, y);
        if (call !== this.hoveredCall) {
          this.hoveredCall = call;
          this.render();
        }

        if (call) {
          this.updateTooltip(call, e.clientX, e.clientY);
        } else {
          this.updateTooltip(null, 0, 0);
        }
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.hoveredCall = null;
      this.updateTooltip(null, 0, 0);
      this.render();
    });

    this.canvas.addEventListener('dblclick', () => {
      this.resetZoom();
    });

    // Zoom centered around mouse cursor
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.traceData) return;
      e.preventDefault();

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseTime = this.xToTime(mouseX);

      // Calculate zoom factor
      const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;

      let viewDuration = this.viewEnd - this.viewStart;

      // Don't zoom in closer than 0.005ms (5 microseconds)
      if (zoomFactor < 1 && viewDuration < 0.005) return;

      // Limit zoom out to max duration
      viewDuration = Math.min(this.duration, viewDuration * zoomFactor);

      // Calculate new view bounds keeping mouseTime invariant
      this.viewStart = Math.max(0, mouseTime - (mouseX / rect.width) * viewDuration);
      this.viewEnd = this.viewStart + viewDuration;

      // Align viewEnd to boundary if viewStart is 0 or hit duration limit
      if (this.viewStart === 0) {
        this.viewEnd = viewDuration;
      }
      if (this.viewEnd > this.duration) {
        this.viewEnd = this.duration;
        this.viewStart = Math.max(0, this.duration - viewDuration);
      }

      this.updateTooltip(null, 0, 0);
      this.render();
    }, { passive: false });

    // --- OVERVIEW MINIMAP EVENTS ---
    this.overviewCanvas.addEventListener('mousedown', (e) => {
      if (!this.traceData) return;
      const rect = this.overviewCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;

      const pxStart = (this.viewStart / this.duration) * width;
      const pxEnd = (this.viewEnd / this.duration) * width;

      // Detect hit-test on handles or active body
      const handleTolerance = 8;

      if (Math.abs(x - pxStart) <= handleTolerance) {
        this.overviewDragMode = 'left-handle';
      } else if (Math.abs(x - pxEnd) <= handleTolerance) {
        this.overviewDragMode = 'right-handle';
      } else if (x > pxStart && x < pxEnd) {
        this.overviewDragMode = 'pan';
        this.overviewDragStartTime = this.viewStart;
        this.overviewDragStartX = x;
      } else {
        this.overviewDragMode = 'brush';
        // Create new brush bounds
        const clickTime = (x / width) * this.duration;
        this.viewStart = clickTime;
        this.viewEnd = clickTime;
        this.overviewDragStartX = x;
      }
    });

    this.overviewCanvas.addEventListener('mousemove', (e) => {
      if (!this.traceData || !this.overviewDragMode) {
        // Just cursor styling if hovering
        if (this.traceData) {
          const rect = this.overviewCanvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const width = rect.width;
          const pxStart = (this.viewStart / this.duration) * width;
          const pxEnd = (this.viewEnd / this.duration) * width;
          const handleTolerance = 8;

          if (Math.abs(x - pxStart) <= handleTolerance || Math.abs(x - pxEnd) <= handleTolerance) {
            this.overviewCanvas.style.cursor = 'ew-resize';
          } else if (x > pxStart && x < pxEnd) {
            this.overviewCanvas.style.cursor = 'grab';
          } else {
            this.overviewCanvas.style.cursor = 'crosshair';
          }
        }
        return;
      }

      const rect = this.overviewCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const width = rect.width;

      if (this.overviewDragMode === 'left-handle') {
        const targetTime = (x / width) * this.duration;
        this.viewStart = Math.max(0, Math.min(this.viewEnd - 0.005, targetTime));
      } else if (this.overviewDragMode === 'right-handle') {
        const targetTime = (x / width) * this.duration;
        this.viewEnd = Math.min(this.duration, Math.max(this.viewStart + 0.005, targetTime));
      } else if (this.overviewDragMode === 'pan') {
        const dx = x - this.overviewDragStartX;
        const dTime = (dx / width) * this.duration;
        const viewDuration = this.viewEnd - this.viewStart;

        this.viewStart = Math.max(0, Math.min(this.duration - viewDuration, this.overviewDragStartTime + dTime));
        this.viewEnd = this.viewStart + viewDuration;
      } else if (this.overviewDragMode === 'brush') {
        const targetTime = (x / width) * this.duration;
        const clickTime = (this.overviewDragStartX / width) * this.duration;

        if (targetTime < clickTime) {
          this.viewStart = targetTime;
          this.viewEnd = clickTime;
        } else {
          this.viewStart = clickTime;
          this.viewEnd = targetTime;
        }
        // Prevent 0-width brush
        if (Math.abs(this.viewEnd - this.viewStart) < 0.005) {
          this.viewEnd = this.viewStart + 0.005;
        }
      }

      this.render();
    });

    const endOverviewDrag = () => {
      this.overviewDragMode = null;
    };

    this.overviewCanvas.addEventListener('mouseup', endOverviewDrag);
    this.overviewCanvas.addEventListener('mouseleave', endOverviewDrag);
  }

  resetZoom() {
    if (!this.traceData) return;
    this.viewStart = 0;
    this.viewEnd = this.duration;
    this.levelOffset = 0;
    this.selectedCall = null;
    this.render();
    if (this.onSelectCall) this.onSelectCall(null);
  }

  zoomToCall(call) {
    if (!call) return;
    const padding = call.duration * 0.1;
    this.viewStart = Math.max(0, call.startTime - padding);
    this.viewEnd = Math.min(this.duration, call.endTime + padding);

    // Keep vertical scroll at the top so that parent nodes (main, etc.) are always visible
    this.levelOffset = 0;

    this.selectedCall = call;
    this.render();
    if (this.onSelectCall) this.onSelectCall(call);
  }

  updateTooltip(call, clientX, clientY) {
    if (!call) {
      this.tooltip.style.display = 'none';
      return;
    }

    const selfTimePct = ((call.selfTime / call.duration) * 100 || 0).toFixed(1);
    const totalTimePct = ((call.duration / this.duration) * 100 || 0).toFixed(1);
    const memDeltaBytes = (call.endMem - call.startMem);
    const memDeltaStr = formatBytes(memDeltaBytes);

    this.tooltip.innerHTML = `
      <div class="tooltip-title">${escapeHTML(call.name)}</div>
      <div class="tooltip-row">
        <span class="tooltip-label">Duration (Total):</span>
        <span class="tooltip-val">${call.duration.toFixed(3)} ms (${totalTimePct}%)</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Self Time (Exclusive):</span>
        <span class="tooltip-val">${call.selfTime.toFixed(3)} ms (${selfTimePct}%)</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Memory Delta:</span>
        <span class="tooltip-val" style="color: ${memDeltaBytes >= 0 ? 'var(--error-color)' : 'var(--success-color)'}">${memDeltaBytes >= 0 ? '+' : ''}${memDeltaStr}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Location:</span>
        <span class="tooltip-val">${escapeHTML(getFilenameBase(call.filename))}:${call.line}</span>
      </div>
    `;

    // Position tooltip checking boundaries
    const offset = 15;
    let x = clientX + offset;
    let y = clientY + offset;

    const tooltipRect = this.tooltip.getBoundingClientRect();
    if (x + tooltipRect.width > window.innerWidth) {
      x = clientX - tooltipRect.width - offset;
    }
    if (y + tooltipRect.height > window.innerHeight) {
      y = clientY - tooltipRect.height - offset;
    }

    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
    this.tooltip.style.display = 'block';
  }

  // Search feature: find matching functions and index them
  setSearchQuery(query) {
    this.searchQuery = query.trim().toLowerCase();
    this.searchResults = [];
    this.currentSearchIndex = -1;
    this.totalMatchTime = 0;

    if (this.searchQuery && this.traceData) {
      for (let i = 0; i < this.calls.length; i++) {
        const call = this.calls[i];
        if (call.nameLower.includes(this.searchQuery)) {
          this.searchResults.push(call);
          this.totalMatchTime += call.duration;
        }
      }
      if (this.searchResults.length > 0) {
        this.currentSearchIndex = 0;
        this.zoomToCall(this.searchResults[0]);
      }
    }

    this.updateSearchCount();
    this.render();
  }

  nextSearchResult() {
    if (this.searchResults.length === 0) return;
    this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResults.length;
    this.zoomToCall(this.searchResults[this.currentSearchIndex]);
    this.updateSearchCount();
  }

  prevSearchResult() {
    if (this.searchResults.length === 0) return;
    this.currentSearchIndex = (this.currentSearchIndex - 1 + this.searchResults.length) % this.searchResults.length;
    this.zoomToCall(this.searchResults[this.currentSearchIndex]);
    this.updateSearchCount();
  }

  updateSearchCount() {
    const el = document.getElementById('search-count');
    const elTime = document.getElementById('search-duration');
    if (!el) return;

    if (this.searchResults.length > 0) {
      el.textContent = `${this.currentSearchIndex + 1}/${this.searchResults.length}`;
      if (elTime) {
        const timeStr = this.totalMatchTime >= 1000
          ? `${(this.totalMatchTime / 1000).toFixed(2)} s`
          : `${this.totalMatchTime.toFixed(2)} ms`;
        elTime.textContent = `Match Time: ${timeStr}`;
        elTime.style.display = 'inline';
      }
    } else {
      el.textContent = '0/0';
      if (elTime) {
        elTime.textContent = '';
        elTime.style.display = 'none';
      }
    }
  }

  render() {
    if (this.renderPending) return;
    this.renderPending = true;
    requestAnimationFrame(() => {
      this.renderPending = false;
      this.renderImmediate();
    });
  }

  renderImmediate() {
    this.renderMainChart();
    this.renderOverview();
  }

  renderMainChart() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    this.ctx.clearRect(0, 0, width, height);

    if (!this.traceData || this.calls.length === 0) {
      return;
    }

    // Draw Grid Lines and Time Markers
    this.renderGrid(width, height);

    const viewDuration = this.viewEnd - this.viewStart;

    // Start rendering from the first call. The loop will break early once call.startTime > viewEnd.
    let startIndex = 0;

    this.ctx.font = '10px var(--font-sans)';
    this.ctx.textBaseline = 'middle';

    // Draw calls
    for (let i = startIndex; i < this.calls.length; i++) {
      const call = this.calls[i];

      // Stop rendering if call starts after viewport ends
      if (call.startTime > this.viewEnd) break;

      // Skip if call ends before viewport starts
      if (call.endTime < this.viewStart) continue;

      // Y bounds based on scroll offset
      const y = this.levelToY(call.level);

      // Skip drawing if outside vertical canvas bounds
      if (y + this.barHeight < this.paddingTop || y > height) continue;

      // X bounds
      const x1 = this.timeToX(call.startTime);
      const x2 = this.timeToX(call.endTime);
      const barW = Math.max(0.5, x2 - x1);

      // Determine colors & states
      let color = this.getCallColor(call);
      let isDimmed = false;
      let isHighlighted = false;

      // Check search match
      if (this.searchQuery) {
        const matches = call.nameLower.includes(this.searchQuery);
        if (matches) {
          isHighlighted = true;
        } else {
          isDimmed = true; // dim non-matches
        }
      }

      // Render rectangle
      this.ctx.fillStyle = color;

      if (isDimmed) {
        this.ctx.globalAlpha = 0.25;
      } else {
        this.ctx.globalAlpha = 1.0;
      }

      // Soft rounded rect behavior or standard rect
      this.ctx.fillRect(x1, y, barW, this.barHeight);
      this.ctx.globalAlpha = 1.0;

      // Selected border (Blue)
      if (call === this.selectedCall) {
        this.ctx.strokeStyle = '#3b82f6';
        this.ctx.lineWidth = 2.0;
        this.ctx.strokeRect(x1 + 1, y + 1, barW - 2, this.barHeight - 2);
      }
      // Hovered border (White)
      else if (call === this.hoveredCall) {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 1.0;
        this.ctx.strokeRect(x1 + 0.5, y + 0.5, barW - 1, this.barHeight - 1);
      }
      // Search highlight (Neon Orange outline)
      else if (isHighlighted) {
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(x1 + 0.5, y + 0.5, barW - 1, this.barHeight - 1);
      }
      // Subtle block divider border
      else {
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(x1, y, barW, this.barHeight);
      }

      // Draw text label
      const visibleW = Math.min(width, x2) - Math.max(0, x1);
      if (visibleW > 25) {
        this.ctx.fillStyle = '#ffffff';
        // Check if dark or light background to alter text contrast if needed, HSL works well with white text

        let label = call.name;
        // Truncate text if it doesn't fit in the visible portion
        const textLimit = visibleW - 8;
        let textWidth = this.ctx.measureText(label).width;

        if (textWidth > textLimit) {
          // Truncation loop
          while (label.length > 3 && textWidth > textLimit) {
            label = label.slice(0, -1);
            textWidth = this.ctx.measureText(label + '...').width;
          }
          label = label + '...';
        }

        if (label.length > 3) {
          const textX = Math.max(0, x1) + 4;
          this.ctx.fillText(label, textX, y + this.barHeight / 2);
        }
      }
    }
  }

  renderGrid(width, height) {
    const viewDuration = this.viewEnd - this.viewStart;

    // Choose nice steps for time grid lines (in ms)
    // Find scale order
    const logVal = Math.log10(viewDuration);
    const exponent = Math.floor(logVal);
    const fractional = logVal - exponent;

    let step = Math.pow(10, exponent);
    if (fractional < Math.log10(2)) {
      step = step / 5; // e.g. if duration is 15, steps of 2
    } else if (fractional < Math.log10(5)) {
      step = step / 2; // e.g. steps of 5
    }

    if (step <= 0) return;

    // Start grid lines at a multiple of step
    const firstGridTime = Math.ceil(this.viewStart / step) * step;

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    this.ctx.lineWidth = 1;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.font = '9px var(--font-sans)';
    this.ctx.textBaseline = 'top';

    // Header background area for timeline markers
    this.ctx.fillStyle = 'var(--bg-secondary)';
    this.ctx.fillRect(0, 0, width, this.paddingTop - 2);
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

    for (let t = firstGridTime; t <= this.viewEnd; t += step) {
      const x = this.timeToX(t);

      // Draw grid line (skip header space)
      this.ctx.beginPath();
      this.ctx.moveTo(x, this.paddingTop);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();

      // Draw time label in header
      this.ctx.fillText(`${t.toFixed(2)} ms`, x + 4, 8);
    }

    // Draw boundary line for header
    this.ctx.strokeStyle = 'var(--border-color)';
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.paddingTop - 2);
    this.ctx.lineTo(width, this.paddingTop - 2);
    this.ctx.stroke();
  }

  renderOverview() {
    const width = this.overviewCanvas.width / (window.devicePixelRatio || 1);
    const height = this.overviewCanvas.height / (window.devicePixelRatio || 1);

    this.overviewCtx.clearRect(0, 0, width, height);

    if (!this.traceData || this.calls.length === 0 || !this.overviewMaxDepths) {
      return;
    }

    // Draw precalculated density profile bars
    this.overviewCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    const bucketCount = this.overviewMaxDepths.length;
    const barW = width / bucketCount;
    for (let b = 0; b < bucketCount; b++) {
      const depthRatio = this.overviewMaxDepths[b] / this.maxDepth;
      const h = Math.max(2, depthRatio * (height - 10));
      this.overviewCtx.fillRect(b * barW, height - h, barW, h);
    }

    // 2. Draw selected window and masks
    const pxStart = (this.viewStart / this.duration) * width;
    const pxEnd = (this.viewEnd / this.duration) * width;

    // Left side mask
    this.overviewCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    this.overviewCtx.fillRect(0, 0, pxStart, height);

    // Right side mask
    this.overviewCtx.fillRect(pxEnd, 0, width - pxEnd, height);

    // Selected region box
    this.overviewCtx.strokeStyle = '#3b82f6';
    this.overviewCtx.lineWidth = 1.5;
    this.overviewCtx.strokeRect(pxStart, 0, pxEnd - pxStart, height);
    this.overviewCtx.fillStyle = 'rgba(59, 130, 246, 0.03)';
    this.overviewCtx.fillRect(pxStart, 0, pxEnd - pxStart, height);

    // Drag handle indicators (small vertical grab zones)
    this.overviewCtx.fillStyle = '#60a5fa';
    this.overviewCtx.fillRect(pxStart - 2, 0, 4, height);
    this.overviewCtx.fillRect(pxEnd - 2, 0, 4, height);

    // Small dots in handle
    this.overviewCtx.fillStyle = '#ffffff';
    this.overviewCtx.fillRect(pxStart - 1, height / 2 - 4, 2, 8);
    this.overviewCtx.fillRect(pxEnd - 1, height / 2 - 4, 2, 8);
  }
}

// Utility formatting helpers
export function formatBytes(bytes) {
  if (isNaN(bytes)) return '0 B';
  const isNegative = bytes < 0;
  const absBytes = Math.abs(bytes);
  if (absBytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(absBytes) / Math.log(k));
  const val = parseFloat((absBytes / Math.pow(k, i)).toFixed(2));

  return `${isNegative ? '-' : ''}${val} ${sizes[i]}`;
}

export function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getFilenameBase(filepath) {
  if (!filepath) return 'unknown';
  const slash = filepath.includes('/') ? '/' : '\\';
  return filepath.substring(filepath.lastIndexOf(slash) + 1);
}
