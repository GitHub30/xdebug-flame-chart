import { parseXdebugTrace } from './parser.js?v=4';
import { generateSampleTrace } from './sample.js?v=4';
import { FlameChart } from './flamechart.js?v=4';
import { DetailsPanels } from './panels.js?v=4';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Core Components
  const flameChart = new FlameChart(
    'flamechart-container',
    'flamechart-canvas',
    'overview-canvas',
    'chart-tooltip'
  );

  const detailsPanels = new DetailsPanels(flameChart);

  // UI elements & Resizing states
  const welcomeView = document.getElementById('welcome-view');
  const viewerView = document.getElementById('viewer-view');
  const statsBar = document.getElementById('stats-bar');
  const dragOverlay = document.getElementById('drag-overlay');

  const chartPane = document.querySelector('.chart-pane');
  const detailsPane = document.querySelector('.details-pane');
  const paneResizer = document.getElementById('pane-resizer');

  let lastDraggedHeight = null;
  let isResizing = false;

  // Link Flame Chart select callback to Details Panels
  flameChart.onSelectCall = (call) => {
    if (call) {
      detailsPane.style.display = 'flex';
      paneResizer.style.display = 'block';
      detailsPanels.showSummary(call);

      if (lastDraggedHeight !== null) {
        chartPane.style.height = `${lastDraggedHeight}px`;
        chartPane.style.flex = 'none';
      }
    } else {
      detailsPane.style.display = 'none';
      paneResizer.style.display = 'none';

      chartPane.style.height = '';
      chartPane.style.flex = '';
    }
    flameChart.resize();
  };

  // Uploader elements
  const fileInputHeader = document.getElementById('file-input');
  const fileInputWelcome = document.getElementById('file-input-welcome');

  // Action buttons
  const btnLoadSampleWelcome = document.getElementById('btn-load-sample');
  const btnLoadSampleHeader = document.getElementById('header-load-sample');
  const btnResetZoom = document.getElementById('btn-reset-zoom');

  // Search inputs
  const searchInput = document.getElementById('search-input');
  const searchPrev = document.getElementById('search-prev');
  const searchNext = document.getElementById('search-next');

  // Load a trace and update UI state
  function loadTraceData(filename, fileContent) {
    try {
      const parsedData = parseXdebugTrace(fileContent);

      // Reset layout and heights
      lastDraggedHeight = null;
      if (flameChart.onSelectCall) {
        flameChart.onSelectCall(null);
      }

      // Update UI panels
      flameChart.setData(parsedData);
      detailsPanels.setData(parsedData);

      // Render Stats
      document.getElementById('stat-filename').textContent = filename;
      document.getElementById('stat-calls').textContent = parsedData.totalCallsCount.toLocaleString();
      document.getElementById('stat-duration').textContent = `${parsedData.duration.toFixed(2)} ms`;
      document.getElementById('stat-depth').textContent = parsedData.maxDepth;
      document.getElementById('stat-parsetime').textContent = `${parsedData.parseDurationMs.toFixed(1)} ms`;

      // Toggle Views
      welcomeView.style.display = 'none';
      viewerView.style.display = 'flex';
      statsBar.style.display = 'flex';

      // Resize canvases immediately to fit containers
      flameChart.resize();
    } catch (err) {
      console.error(err);
      alert('Failed to parse Xdebug trace file. Please check that it is a computerized format trace file (trace_format = 1).');
    }
  }

  // Helper to decompress Gzip format using native DecompressionStream
  async function decompressGzip(arrayBuffer) {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = new Response(arrayBuffer).body.pipeThrough(ds);
    const blob = await new Response(decompressedStream).blob();
    return await blob.text();
  }

  // Helper to decompress XZ format using xz-decompress library
  async function decompressXz(arrayBuffer) {
    const XzReadableStream = window['xz-decompress']?.XzReadableStream;
    if (!XzReadableStream) {
      throw new Error('XZ decompression library is not loaded. Please check your internet connection.');
    }
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(arrayBuffer));
        controller.close();
      }
    });
    const decompressedStream = new XzReadableStream(stream);
    const blob = await new Response(decompressedStream).blob();
    return await blob.text();
  }

  // File Reader helper
  function handleUploadedFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target.result;
      const lowercaseName = file.name.toLowerCase();
      try {
        let textContent;
        if (lowercaseName.endsWith('.gz')) {
          textContent = await decompressGzip(arrayBuffer);
        } else if (lowercaseName.endsWith('.xz')) {
          textContent = await decompressXz(arrayBuffer);
        } else {
          // Plain text files
          textContent = new TextDecoder('utf-8').decode(arrayBuffer);
        }
        loadTraceData(file.name, textContent);
      } catch (err) {
        console.error(err);
        alert('Decompression failed: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // --- EVENT LISTENERS ---

  // Standard File Inputs
  fileInputHeader.addEventListener('change', (e) => {
    handleUploadedFile(e.target.files[0]);
  });

  fileInputWelcome.addEventListener('change', (e) => {
    handleUploadedFile(e.target.files[0]);
  });

  // Load Sample Traces
  const triggerSampleLoad = () => {
    const sampleTrace = generateSampleTrace();
    loadTraceData('sample_trace.xt', sampleTrace);
  };

  btnLoadSampleWelcome.addEventListener('click', triggerSampleLoad);
  btnLoadSampleHeader.addEventListener('click', triggerSampleLoad);

  // Reset zoom
  btnResetZoom.addEventListener('click', () => {
    flameChart.resetZoom();
  });

  // Search input events
  searchInput.addEventListener('input', (e) => {
    flameChart.setSearchQuery(e.target.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        flameChart.prevSearchResult();
      } else {
        flameChart.nextSearchResult();
      }
    } else if (e.key === 'Escape') {
      searchInput.value = '';
      flameChart.setSearchQuery('');
      searchInput.blur();
    }
  });

  searchPrev.addEventListener('click', () => {
    flameChart.prevSearchResult();
  });

  searchNext.addEventListener('click', () => {
    flameChart.nextSearchResult();
  });

  // Pane Resizing Drag Events
  paneResizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    paneResizer.classList.add('active');
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const containerRect = viewerView.getBoundingClientRect();
    const relativeY = e.clientY - containerRect.top;

    const minChartHeight = 200;
    const minDetailsHeight = 150;
    const resizerHeight = 6;
    const totalHeight = containerRect.height - resizerHeight;

    let newChartHeight = relativeY;
    if (newChartHeight < minChartHeight) {
      newChartHeight = minChartHeight;
    }
    if (totalHeight - newChartHeight < minDetailsHeight) {
      newChartHeight = totalHeight - minDetailsHeight;
    }

    chartPane.style.height = `${newChartHeight}px`;
    chartPane.style.flex = 'none';
    lastDraggedHeight = newChartHeight;

    flameChart.resize();
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      paneResizer.classList.remove('active');
      document.body.style.cursor = '';
    }
  });

  // Global Hotkeys (Ctrl+F or Cmd+F to focus search)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // --- DRAG & DROP HANDLING ---

  let dragCounter = 0; // prevent premature dragleave triggers on inner elements

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dragOverlay.classList.add('active');
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dragOverlay.classList.remove('active');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.remove('active');

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadedFile(e.dataTransfer.files[0]);
    }
  });
});
