/**
 * Parser for Xdebug computerized trace format 1 (.xt files)
 */

export function parseXdebugTrace(text) {
  const startTimePerf = performance.now();
  
  // Split lines
  const lines = text.split(/\r?\n/);
  
  const calls = [];
  const rootCalls = [];
  const idToCall = new Map();
  const activeStack = [];
  
  let maxDepth = 0;
  let totalCallsCount = 0;
  let filePeakMem = 0;
  let lastTime = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    // Skip headers/footers
    if (line.startsWith('TRACE START') || 
        line.startsWith('TRACE END') || 
        line.startsWith('Version:') || 
        line.startsWith('File format:')) {
      continue;
    }
    
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    
    const level = parseInt(cols[0], 10);
    const funcId = parseInt(cols[1], 10);
    const type = cols[2];
    
    if (isNaN(level) || isNaN(funcId)) continue;
    
    const time = parseFloat(cols[3]); // seconds
    const mem = parseInt(cols[4], 10); // bytes
    
    if (!isNaN(time) && time > lastTime) {
      lastTime = time;
    }
    if (!isNaN(mem) && mem > filePeakMem) {
      filePeakMem = mem;
    }
    
    if (type === '0') { // Entry
      const funcName = cols[5] || '(anonymous)';
      const isUser = cols[6] === '1';
      const incFile = cols[7];
      const filename = cols[8] || '';
      const lineNum = parseInt(cols[9], 10) || 0;
      const argCount = parseInt(cols[10], 10) || 0;
      
      const args = [];
      if (argCount > 0 && cols.length > 11) {
        for (let a = 0; a < argCount; a++) {
          if (cols[11 + a] !== undefined) {
            args.push(cols[11 + a]);
          }
        }
      }
      
      const call = {
        id: funcId,
        level: level,
        name: funcName,
        nameLower: funcName.toLowerCase(),
        startTime: time * 1000, // convert to ms
        startMem: mem,
        endTime: null,
        endMem: null,
        duration: 0,
        selfTime: 0,
        childTime: 0,
        parent: null,
        children: [],
        filename: filename,
        line: lineNum,
        isUser: isUser,
        args: args,
        type: isUser ? 'user' : 'internal'
      };
      
      idToCall.set(funcId, call);
      calls.push(call);
      totalCallsCount++;
      
      if (level > maxDepth) {
        maxDepth = level;
      }
      
      // Maintain active stack for parent-child link
      while (activeStack.length > 0 && activeStack[activeStack.length - 1].level >= level) {
        activeStack.pop();
      }
      
      if (activeStack.length > 0) {
        const parent = activeStack[activeStack.length - 1];
        parent.children.push(call);
        call.parent = parent;
      } else {
        rootCalls.push(call);
      }
      
      activeStack.push(call);
      
    } else if (type === '1' || type === 'R') { // Exit / Return
      const call = idToCall.get(funcId);
      if (call) {
        call.endTime = time * 1000; // convert to ms
        call.endMem = mem;
        call.duration = call.endTime - call.startTime;
        
        // Remove from active stack if it matches
        const idx = activeStack.indexOf(call);
        if (idx !== -1) {
          activeStack.splice(idx, 1);
        }
      }
    }
  }
  
  // Close any unclosed calls (e.g. if trace is truncated due to exit/die or exception)
  const maxRecordedMs = lastTime * 1000;
  for (let j = 0; j < calls.length; j++) {
    const call = calls[j];
    if (call.endTime === null) {
      call.endTime = maxRecordedMs;
      call.endMem = call.startMem;
      call.duration = call.endTime - call.startTime;
    }
  }
  
  // Calculate childTime and selfTime
  // We process back-to-front so children durations are already finalised.
  for (let j = calls.length - 1; j >= 0; j--) {
    const call = calls[j];
    let childrenSum = 0;
    for (let c = 0; c < call.children.length; c++) {
      childrenSum += call.children[c].duration;
    }
    call.childTime = childrenSum;
    call.selfTime = Math.max(0, call.duration - childrenSum);
  }
  
  const parseTime = performance.now() - startTimePerf;
  
  return {
    calls,
    rootCalls,
    maxDepth,
    totalCallsCount,
    peakMemory: filePeakMem,
    duration: maxRecordedMs,
    parseDurationMs: parseTime
  };
}
