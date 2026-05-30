import { formatBytes, escapeHTML, getFilenameBase } from './flamechart.js?v=4';

export class DetailsPanels {
  constructor(flameChart) {
    this.flameChart = flameChart;
    this.traceData = null;
    
    // Tab selectors
    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.tabPanes = document.querySelectorAll('.tab-pane');
    
    // Summary Tab elements
    this.sumEmpty = document.getElementById('summary-empty');
    this.sumContent = document.getElementById('summary-content');
    this.sumFuncName = document.getElementById('sum-func-name');
    this.sumFuncLevel = document.getElementById('sum-func-level');
    this.sumFuncType = document.getElementById('sum-func-type');
    this.sumTimeInclusive = document.getElementById('sum-time-inclusive');
    this.sumTimeExclusive = document.getElementById('sum-time-exclusive');
    this.sumTimeStart = document.getElementById('sum-time-start');
    this.sumTimeEnd = document.getElementById('sum-time-end');
    this.sumMemDelta = document.getElementById('sum-mem-delta');
    this.sumMemStart = document.getElementById('sum-mem-start');
    this.sumMemEnd = document.getElementById('sum-mem-end');
    this.sumFile = document.getElementById('sum-file');
    this.sumLine = document.getElementById('sum-line');
    this.sumArgs = document.getElementById('sum-args');
    
    // Bottom-Up Tab states
    this.bottomUpList = document.getElementById('bottomup-list');
    this.bottomUpSortField = 'self';
    this.bottomUpSortAsc = false;
    
    // Call Tree Tab states
    this.callTreeList = document.getElementById('calltree-list');
    this.expandedCalls = new Set();
    
    // Event Log Tab states
    this.eventLogList = document.getElementById('eventlog-list');
    this.eventLogSortField = 'start';
    this.eventLogSortAsc = true;
    this.eventLogQuery = '';
    this.eventLogMinDuration = 0;
    
    this.initEvents();
  }
  
  setData(traceData) {
    this.traceData = traceData;
    this.expandedCalls.clear();
    
    // If there is a root call, expand it by default
    if (traceData.rootCalls && traceData.rootCalls.length > 0) {
      for (const root of traceData.rootCalls) {
        this.expandedCalls.add(root.id);
        // Expand second level too for visual start
        for (const child of root.children) {
          this.expandedCalls.add(child.id);
        }
      }
    }
    
    this.clearSummary();
    this.renderBottomUp();
    this.renderCallTree();
    this.renderEventLog();
  }
  
  initEvents() {
    // Tab switching
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        
        this.tabButtons.forEach(b => b.classList.remove('active'));
        this.tabPanes.forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
      });
    });
    
    // Sort Bottom-Up
    const buHeaders = document.querySelectorAll('#bottomup-table th.sortable');
    buHeaders.forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (this.bottomUpSortField === field) {
          this.bottomUpSortAsc = !this.bottomUpSortAsc;
        } else {
          this.bottomUpSortField = field;
          this.bottomUpSortAsc = false;
        }
        
        buHeaders.forEach(h => h.classList.remove('active'));
        th.classList.add('active');
        this.renderBottomUp();
      });
    });
    
    // Event Log Filters
    const elFilter = document.getElementById('eventlog-filter');
    elFilter.addEventListener('input', (e) => {
      this.eventLogQuery = e.target.value.toLowerCase();
      this.renderEventLog();
    });
    
    const elMinDur = document.getElementById('eventlog-min-duration');
    elMinDur.addEventListener('input', (e) => {
      this.eventLogMinDuration = parseFloat(e.target.value) || 0;
      this.renderEventLog();
    });
    
    // Sort Event Log
    const elHeaders = document.querySelectorAll('#eventlog-table th.sortable');
    elHeaders.forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (this.eventLogSortField === field) {
          this.eventLogSortAsc = !this.eventLogSortAsc;
        } else {
          this.eventLogSortField = field;
          this.eventLogSortAsc = true;
        }
        
        elHeaders.forEach(h => h.classList.remove('active'));
        th.classList.add('active');
        this.renderEventLog();
      });
    });
  }
  
  // --- SUMMARY TAB ---
  
  clearSummary() {
    this.sumEmpty.style.display = 'flex';
    this.sumContent.style.display = 'none';
  }
  
  showSummary(call) {
    this.sumEmpty.style.display = 'none';
    this.sumContent.style.display = 'grid';
    
    const selfTimePct = ((call.selfTime / call.duration) * 100 || 0).toFixed(1);
    const totalTimePct = ((call.duration / this.traceData.duration) * 100 || 0).toFixed(1);
    const memDeltaBytes = call.endMem - call.startMem;
    
    this.sumFuncName.textContent = call.name;
    this.sumFuncLevel.textContent = call.level;
    this.sumFuncType.textContent = call.isUser ? 'User defined (PHP)' : 'Internal (C)';
    
    this.sumTimeInclusive.textContent = `${call.duration.toFixed(3)} ms (${totalTimePct}% of trace)`;
    this.sumTimeExclusive.textContent = `${call.selfTime.toFixed(3)} ms (${selfTimePct}% of call)`;
    this.sumTimeStart.textContent = `${call.startTime.toFixed(3)} ms`;
    this.sumTimeEnd.textContent = `${call.endTime.toFixed(3)} ms`;
    
    this.sumMemDelta.textContent = `${memDeltaBytes >= 0 ? '+' : ''}${formatBytes(memDeltaBytes)}`;
    this.sumMemDelta.style.color = memDeltaBytes >= 0 ? 'var(--error-color)' : 'var(--success-color)';
    
    this.sumMemStart.textContent = formatBytes(call.startMem);
    this.sumMemEnd.textContent = formatBytes(call.endMem);
    
    this.sumFile.textContent = call.filename || '(internal)';
    this.sumLine.textContent = call.line || '-';
    
    if (call.args && call.args.length > 0) {
      this.sumArgs.innerHTML = '<ol>' + call.args.map(arg => `<li><code>${escapeHTML(arg)}</code></li>`).join('') + '</ol>';
    } else {
      this.sumArgs.textContent = 'None';
    }
  }
  
  // --- BOTTOM-UP TAB ---
  
  renderBottomUp() {
    if (!this.traceData) {
      this.bottomUpList.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No trace loaded</td></tr>';
      return;
    }
    
    // Aggregate by function name
    const agg = new Map();
    const totalTraceDuration = this.traceData.duration;
    
    for (let i = 0; i < this.traceData.calls.length; i++) {
      const call = this.traceData.calls[i];
      let entry = agg.get(call.name);
      if (!entry) {
        entry = {
          name: call.name,
          calls: 0,
          self: 0,
          total: 0,
          mem: 0,
          firstCall: call // Keep reference to jump to
        };
        agg.set(call.name, entry);
      }
      entry.calls++;
      entry.self += call.selfTime;
      entry.total += call.duration;
      entry.mem += (call.endMem - call.startMem);
    }
    
    const rows = Array.from(agg.values());
    
    // Sort
    rows.sort((a, b) => {
      let valA = a[this.bottomUpSortField];
      let valB = b[this.bottomUpSortField];
      
      if (typeof valA === 'string') {
        return this.bottomUpSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return this.bottomUpSortAsc ? valA - valB : valB - valA;
    });
    
    this.bottomUpList.innerHTML = '';
    
    for (const row of rows) {
      const selfPct = ((row.self / totalTraceDuration) * 100).toFixed(1);
      const totalPct = ((row.total / totalTraceDuration) * 100).toFixed(1);
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td><a class="code-link" data-id="${row.firstCall.id}">${escapeHTML(row.name)}</a></td>
        <td class="numeric mono">${row.calls}</td>
        <td class="numeric mono">${row.self.toFixed(3)}</td>
        <td class="numeric mono">${selfPct}%</td>
        <td class="numeric mono">${row.total.toFixed(3)}</td>
        <td class="numeric mono">${totalPct}%</td>
        <td class="numeric mono" style="color: ${row.mem >= 0 ? 'var(--error-color)' : 'var(--success-color)'}">
          ${row.mem >= 0 ? '+' : ''}${formatBytes(row.mem)}
        </td>
      `;
      
      // Link behavior to jump to the first instance in the flame chart
      tr.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        this.flameChart.zoomToCall(row.firstCall);
      });
      
      this.bottomUpList.appendChild(tr);
    }
  }
  
  // --- CALL TREE TAB ---
  
  renderCallTree() {
    if (!this.traceData || this.traceData.rootCalls.length === 0) {
      this.callTreeList.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No trace loaded</td></tr>';
      return;
    }
    
    const totalDuration = this.traceData.duration;
    this.callTreeList.innerHTML = '';
    
    // We construct the visible flat list based on expanded Set
    const rows = [];
    const traverse = (call, depth) => {
      rows.push({ call, depth });
      if (this.expandedCalls.has(call.id) && call.children.length > 0) {
        // Sort children by duration descending (heavier first)
        const sortedChildren = [...call.children].sort((a, b) => b.duration - a.duration);
        for (const child of sortedChildren) {
          traverse(child, depth + 1);
        }
      }
    };
    
    // Sort root calls by duration too
    const sortedRoots = [...this.traceData.rootCalls].sort((a, b) => b.duration - a.duration);
    for (const root of sortedRoots) {
      traverse(root, 0);
    }
    
    const fragment = document.createDocumentFragment();
    
    for (const row of rows) {
      const call = row.call;
      const totalPct = ((call.duration / totalDuration) * 100).toFixed(1);
      const selfPct = ((call.selfTime / totalDuration) * 100).toFixed(1);
      
      const hasChildren = call.children.length > 0;
      const isExpanded = this.expandedCalls.has(call.id);
      const memDelta = call.endMem - call.startMem;
      
      const tr = document.createElement('tr');
      const paddingLeft = row.depth * 16;
      
      tr.innerHTML = `
        <td>
          <div class="tree-node-name" style="padding-left: ${paddingLeft}px;">
            ${hasChildren ? `<span class="tree-toggle" data-id="${call.id}">${isExpanded ? '▼' : '▶'}</span>` : '<span style="width:16px; display:inline-block;"></span>'}
            <a class="code-link" data-id="${call.id}" title="${escapeHTML(call.name)}">${escapeHTML(call.name)}</a>
          </div>
        </td>
        <td class="numeric mono">${call.duration.toFixed(3)}</td>
        <td class="numeric mono">${totalPct}%</td>
        <td class="numeric mono">${call.selfTime.toFixed(3)}</td>
        <td class="numeric mono">${selfPct}%</td>
        <td class="numeric mono" style="color: ${memDelta >= 0 ? 'var(--error-color)' : 'var(--success-color)'}">
          ${memDelta >= 0 ? '+' : ''}${formatBytes(memDelta)}
        </td>
        <td class="mono" style="color: var(--text-muted); font-size: 0.75rem;">
          ${escapeHTML(getFilenameBase(call.filename))}:${call.line}
        </td>
      `;
      
      // Expand/Collapse toggle behavior
      if (hasChildren) {
        tr.querySelector('.tree-toggle').addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(e.target.getAttribute('data-id'), 10);
          if (this.expandedCalls.has(id)) {
            this.expandedCalls.delete(id);
          } else {
            this.expandedCalls.add(id);
          }
          this.renderCallTree();
        });
      }
      
      // Select call in flame chart
      tr.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        this.flameChart.zoomToCall(call);
      });
      
      fragment.appendChild(tr);
    }
    
    this.callTreeList.appendChild(fragment);
  }
  
  // --- EVENT LOG TAB ---
  
  renderEventLog() {
    if (!this.traceData) {
      this.eventLogList.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No trace loaded</td></tr>';
      return;
    }
    
    let filteredCalls = this.traceData.calls;
    
    // Apply filters
    if (this.eventLogQuery || this.eventLogMinDuration > 0) {
      filteredCalls = filteredCalls.filter(call => {
        const matchesQuery = !this.eventLogQuery || 
                             call.name.toLowerCase().includes(this.eventLogQuery) ||
                             call.filename.toLowerCase().includes(this.eventLogQuery);
        const matchesDuration = call.duration >= this.eventLogMinDuration;
        return matchesQuery && matchesDuration;
      });
    }
    
    // Sort
    const sorted = [...filteredCalls];
    sorted.sort((a, b) => {
      let valA, valB;
      
      switch (this.eventLogSortField) {
        case 'start':
          valA = a.startTime;
          valB = b.startTime;
          break;
        case 'duration':
          valA = a.duration;
          valB = b.duration;
          break;
        case 'level':
          valA = a.level;
          valB = b.level;
          break;
        case 'name':
          valA = a.name;
          valB = b.name;
          break;
        case 'mem':
          valA = a.endMem - a.startMem;
          valB = b.endMem - b.startMem;
          break;
        case 'file':
          valA = a.filename;
          valB = b.filename;
          break;
        default:
          valA = a.startTime;
          valB = b.startTime;
      }
      
      if (typeof valA === 'string') {
        return this.eventLogSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return this.eventLogSortAsc ? valA - valB : valB - valA;
    });
    
    this.eventLogList.innerHTML = '';
    
    // Limit to 1000 items to avoid DOM overload, providing message if truncated
    const displayLimit = 1000;
    const countToDisplay = Math.min(sorted.length, displayLimit);
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < countToDisplay; i++) {
      const call = sorted[i];
      const memDelta = call.endMem - call.startMem;
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td class="mono numeric">${call.startTime.toFixed(3)}</td>
        <td class="mono numeric">${call.duration.toFixed(3)}</td>
        <td class="mono numeric">${call.level}</td>
        <td><a class="code-link" data-id="${call.id}">${escapeHTML(call.name)}</a></td>
        <td class="numeric mono" style="color: ${memDelta >= 0 ? 'var(--error-color)' : 'var(--success-color)'}">
          ${memDelta >= 0 ? '+' : ''}${formatBytes(memDelta)}
        </td>
        <td class="mono" style="color: var(--text-muted); font-size: 0.75rem;">
          ${escapeHTML(getFilenameBase(call.filename))}:${call.line}
        </td>
      `;
      
      tr.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        this.flameChart.zoomToCall(call);
      });
      
      fragment.appendChild(tr);
    }
    
    this.eventLogList.appendChild(fragment);
    
    // Add truncation notice if matching size
    if (sorted.length > displayLimit) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic;">
          Showing first ${displayLimit} of ${sorted.length} events matching current filters.
        </td>
      `;
      this.eventLogList.appendChild(tr);
    }
  }
}
