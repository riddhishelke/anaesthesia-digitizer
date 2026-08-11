// Camera Capture and Calibration Tool - Complete Application

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const webcamFeed = document.getElementById('webcamFeed');
  const freezeCanvas = document.getElementById('freezeCanvas');
  const freezeBtn = document.getElementById('freezeBtn');
  const freezeBtnText = document.getElementById('freezeBtnText');
  const retakeBtn = document.getElementById('retakeBtn');
  const undoBtn = document.getElementById('undoBtn');
  const resetBtn = document.getElementById('resetBtn');
  const saveBtn = document.getElementById('saveBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const stepBadge = document.getElementById('stepBadge');
  const stepTitle = document.getElementById('stepTitle');
  const cameraError = document.getElementById('cameraError');
  const retryCameraBtn = document.getElementById('retryCameraBtn');
  const cameraSelect = document.getElementById('cameraSelect');
  const screenShareBtn = document.getElementById('screenShareBtn');
  const simulatedFeedBtn = document.getElementById('simulatedFeedBtn');
  const errorScreenShareBtn = document.getElementById('errorScreenShareBtn');
  const errorSimulatedBtn = document.getElementById('errorSimulatedBtn');
  const errorIcon = document.getElementById('errorIcon');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const errorDiagnosticHint = document.getElementById('errorDiagnosticHint');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const actualResText = document.getElementById('actualResText');
  const markedCount = document.getElementById('markedCount');
  const checklistGroup = document.getElementById('checklistGroup');
  
  // Stepper Elements
  const stepNode1 = document.getElementById('stepNode1');
  const stepNode2 = document.getElementById('stepNode2');
  const stepNode3 = document.getElementById('stepNode3');
  const stepNode4 = document.getElementById('stepNode4');
  const connector1 = document.getElementById('connector1');
  const connector2 = document.getElementById('connector2');
  const connector3 = document.getElementById('connector3');

  // Banner Elements
  const saveSuccessBanner = document.getElementById('saveSuccessBanner');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerText = document.getElementById('bannerText');
  const closeBannerBtn = document.getElementById('closeBannerBtn');

  // Modal Elements
  const labelModal = document.getElementById('labelModal');
  const labelOptBtns = document.querySelectorAll('.label-opt-btn');
  const cancelLabelBtn = document.getElementById('cancelLabelBtn');

  // Application State
  let mediaStream = null;
  let simulatedAnimationId = null;
  let isFrozen = false;
  let isDrawing = false;
  let startX = 0, startY = 0, currentX = 0, currentY = 0;
  let pendingBox = null;
  let boxes = [];

  // Offscreen canvas for storing snapshot of frozen frame
  const offscreenCanvas = document.createElement('canvas');
  const offscreenCtx = offscreenCanvas.getContext('2d');

  const TARGET_WIDTH = 1280;
  const TARGET_HEIGHT = 720;

  // Stop any existing stream or active simulation
  function stopActiveStream() {
    if (simulatedAnimationId) {
      cancelAnimationFrame(simulatedAnimationId);
      simulatedAnimationId = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
  }

  // Populate available video input devices in camera dropdown
  async function populateCameraDevices() {
    if (!cameraSelect || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      // Preserve current select value if possible
      const currentVal = cameraSelect.value;
      cameraSelect.innerHTML = '<option value="">Default Camera</option>';
      
      videoDevices.forEach((device, idx) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${idx + 1} (${device.deviceId.slice(0, 6)}...)`;
        cameraSelect.appendChild(option);
      });
      if (currentVal) cameraSelect.value = currentVal;
    } catch (e) {
      console.warn('Could not enumerate camera devices:', e);
    }
  }

  // Initialize Camera Access via getUserMedia with constraint fallbacks
  async function initCamera(selectedDeviceId = null) {
    stopActiveStream();
    hideError();
    updateStatus('connecting', 'Connecting camera...');
    freezeBtn.disabled = true;

    // Check secure context / mediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isFileProtocol = window.location.protocol === 'file:';
      const isHttpNonLocal = window.location.protocol === 'http:' && 
                             window.location.hostname !== 'localhost' && 
                             window.location.hostname !== '127.0.0.1';
      
      const errReason = isFileProtocol || isHttpNonLocal
        ? 'InsecureContext'
        : 'NotSupported';

      const customErr = new Error('MediaDevices API not available in this context');
      customErr.name = errReason;
      showError(customErr);
      return;
    }

    const targetDeviceId = selectedDeviceId || (cameraSelect ? cameraSelect.value : null);

    try {
      // Stage 1: Try high resolution with exact/ideal constraints
      try {
        const constraints = {
          video: targetDeviceId
            ? { deviceId: { exact: targetDeviceId }, width: { ideal: TARGET_WIDTH }, height: { ideal: TARGET_HEIGHT } }
            : { width: { ideal: TARGET_WIDTH }, height: { ideal: TARGET_HEIGHT } },
          audio: false
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e1) {
        console.warn('Stage 1 camera constraints failed, attempting fallback stage 2...', e1);
        // Stage 2: Basic video constraint without fixed resolution or deviceId restriction
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      webcamFeed.srcObject = mediaStream;

      webcamFeed.onloadedmetadata = () => {
        webcamFeed.play().catch(e => console.warn('Autoplay prevented:', e));
        const width = webcamFeed.videoWidth || TARGET_WIDTH;
        const height = webcamFeed.videoHeight || TARGET_HEIGHT;
        actualResText.textContent = `Feed Resolution: ${width} × ${height} px`;
        
        freezeCanvas.width = width;
        freezeCanvas.height = height;
        offscreenCanvas.width = width;
        offscreenCanvas.height = height;

        updateStatus('live', 'Live Feed');
        freezeBtn.disabled = false;
        updateStepper();
        populateCameraDevices();
      };

    } catch (err) {
      console.error('Error accessing webcam:', err);
      showError(err);
    }
  }

  // Fallback Mode 1: Screen Share (getDisplayMedia)
  async function initScreenShare() {
    stopActiveStream();
    hideError();
    updateStatus('connecting', 'Sharing screen...');
    freezeBtn.disabled = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('Screen sharing is not supported in this browser.');
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      webcamFeed.srcObject = mediaStream;

      webcamFeed.onloadedmetadata = () => {
        webcamFeed.play().catch(e => console.warn('Autoplay prevented:', e));
        const width = webcamFeed.videoWidth || TARGET_WIDTH;
        const height = webcamFeed.videoHeight || TARGET_HEIGHT;
        actualResText.textContent = `Feed Resolution: ${width} × ${height} px (Screen Share)`;

        freezeCanvas.width = width;
        freezeCanvas.height = height;
        offscreenCanvas.width = width;
        offscreenCanvas.height = height;

        updateStatus('live', 'Screen Share');
        freezeBtn.disabled = false;
        updateStepper();
      };

      // Listen for stream end (user clicks "Stop Sharing")
      mediaStream.getVideoTracks()[0].onended = () => {
        updateStatus('connecting', 'Screen share ended');
        showError({ name: 'Ended', message: 'Screen sharing session was ended.' });
      };

    } catch (err) {
      console.warn('Screen share canceled or failed:', err);
      if (err.name !== 'NotAllowedError') {
        showError(err);
      } else {
        updateStatus('error', 'Canceled');
      }
    }
  }

  // Fallback Mode 2: Simulated Patient Monitor Feed (Canvas Generator)
  function initSimulatedFeed() {
    stopActiveStream();
    hideError();
    updateStatus('live', 'Demo Monitor');
    freezeBtn.disabled = false;

    const simCanvas = document.createElement('canvas');
    simCanvas.width = TARGET_WIDTH;
    simCanvas.height = TARGET_HEIGHT;
    const simCtx = simCanvas.getContext('2d');

    let waveOffset = 0;

    function renderSimulatedFrame() {
      waveOffset += 0.05;

      // Dark medical screen background
      simCtx.fillStyle = '#090d16';
      simCtx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

      // Header Bar
      simCtx.fillStyle = '#1e293b';
      simCtx.fillRect(0, 0, TARGET_WIDTH, 48);
      simCtx.fillStyle = '#94a3b8';
      simCtx.font = '600 16px Inter, sans-serif';
      simCtx.fillText('PATIENT MONITOR - SIMULATOR FEED (OR-ROOM 3)', 20, 30);
      simCtx.fillStyle = '#10b981';
      simCtx.fillText('● MONITORED', TARGET_WIDTH - 160, 30);

      // Grid Lines
      simCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      simCtx.lineWidth = 1;
      for (let x = 0; x < TARGET_WIDTH; x += 40) {
        simCtx.beginPath(); simCtx.moveTo(x, 48); simCtx.lineTo(x, TARGET_HEIGHT); simCtx.stroke();
      }
      for (let y = 48; y < TARGET_HEIGHT; y += 40) {
        simCtx.beginPath(); simCtx.moveTo(0, y); simCtx.lineTo(TARGET_WIDTH, y); simCtx.stroke();
      }

      // Vital 1: Heart Rate (Green)
      simCtx.fillStyle = '#10b981';
      simCtx.font = 'bold 18px Inter, sans-serif';
      simCtx.fillText('ECG / HR', 30, 90);
      simCtx.font = 'bold 64px Inter, sans-serif';
      simCtx.fillText('74', 30, 160);
      simCtx.font = '14px Inter, sans-serif';
      simCtx.fillText('bpm', 120, 160);

      // ECG Waveform
      simCtx.strokeStyle = '#10b981';
      simCtx.lineWidth = 3;
      simCtx.beginPath();
      for (let x = 200; x < TARGET_WIDTH - 30; x += 2) {
        const t = (x / 50) - waveOffset;
        let y = 130 + Math.sin(t) * 8;
        // PQRST Spike simulation
        const cycle = (x + waveOffset * 60) % 180;
        if (cycle > 80 && cycle < 90) y -= 45; // R-peak
        else if (cycle >= 90 && cycle < 100) y += 15; // S-dip
        if (x === 200) simCtx.moveTo(x, y); else simCtx.lineTo(x, y);
      }
      simCtx.stroke();

      // Divider
      simCtx.strokeStyle = '#334155';
      simCtx.beginPath(); simCtx.moveTo(20, 200); simCtx.lineTo(TARGET_WIDTH - 20, 200); simCtx.stroke();

      // Vital 2: SpO2 (Cyan)
      simCtx.fillStyle = '#0284c7';
      simCtx.font = 'bold 18px Inter, sans-serif';
      simCtx.fillText('SpO2', 30, 240);
      simCtx.font = 'bold 64px Inter, sans-serif';
      simCtx.fillText('98', 30, 310);
      simCtx.font = '14px Inter, sans-serif';
      simCtx.fillText('%', 120, 310);

      // Pleth Waveform
      simCtx.strokeStyle = '#0284c7';
      simCtx.lineWidth = 3;
      simCtx.beginPath();
      for (let x = 200; x < TARGET_WIDTH - 30; x += 3) {
        const t = (x / 40) - waveOffset;
        let y = 280 + Math.sin(t) * 18 + Math.cos(t * 2) * 5;
        if (x === 200) simCtx.moveTo(x, y); else simCtx.lineTo(x, y);
      }
      simCtx.stroke();

      // Divider
      simCtx.beginPath(); simCtx.moveTo(20, 350); simCtx.lineTo(TARGET_WIDTH - 20, 350); simCtx.stroke();

      // Vital 3: NIBP Blood Pressure (Red/Orange)
      simCtx.fillStyle = '#d97706';
      simCtx.font = 'bold 18px Inter, sans-serif';
      simCtx.fillText('NIBP (Sys / Dia)', 30, 390);
      simCtx.font = 'bold 60px Inter, sans-serif';
      simCtx.fillText('120/80', 30, 460);
      simCtx.font = '14px Inter, sans-serif';
      simCtx.fillText('mmHg  (Mean 93)', 260, 460);

      // Divider
      simCtx.beginPath(); simCtx.moveTo(20, 500); simCtx.lineTo(TARGET_WIDTH - 20, 500); simCtx.stroke();

      // Vital 4: EtCO2 (Purple)
      simCtx.fillStyle = '#8b5cf6';
      simCtx.font = 'bold 18px Inter, sans-serif';
      simCtx.fillText('EtCO2', 30, 540);
      simCtx.font = 'bold 64px Inter, sans-serif';
      simCtx.fillText('36', 30, 610);
      simCtx.font = '14px Inter, sans-serif';
      simCtx.fillText('mmHg', 120, 610);

      // Capnography Waveform
      simCtx.strokeStyle = '#8b5cf6';
      simCtx.lineWidth = 3;
      simCtx.beginPath();
      for (let x = 200; x < TARGET_WIDTH - 30; x += 4) {
        const cycle = (x + waveOffset * 40) % 200;
        let y = 600;
        if (cycle > 40 && cycle < 140) y = 560 + Math.sin(x / 30) * 3;
        if (x === 200) simCtx.moveTo(x, y); else simCtx.lineTo(x, y);
      }
      simCtx.stroke();

      simulatedAnimationId = requestAnimationFrame(renderSimulatedFrame);
    }

    renderSimulatedFrame();

    const stream = simCanvas.captureStream(30);
    mediaStream = stream;
    webcamFeed.srcObject = mediaStream;

    actualResText.textContent = `Feed Resolution: ${TARGET_WIDTH} × ${TARGET_HEIGHT} px (Demo Feed)`;
    freezeCanvas.width = TARGET_WIDTH;
    freezeCanvas.height = TARGET_HEIGHT;
    offscreenCanvas.width = TARGET_WIDTH;
    offscreenCanvas.height = TARGET_HEIGHT;
    updateStepper();
  }

  // Toggle freeze / unfreeze frame
  function toggleFreezeFrame() {
    if (!isFrozen) {
      freezeCurrentFrame();
    } else {
      unfreezeToLiveFeed();
    }
  }

  // Freeze Frame Logic
  function freezeCurrentFrame() {
    const width = webcamFeed.videoWidth || TARGET_WIDTH;
    const height = webcamFeed.videoHeight || TARGET_HEIGHT;

    freezeCanvas.width = width;
    freezeCanvas.height = height;
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;

    // Capture frozen snapshot
    offscreenCtx.drawImage(webcamFeed, 0, 0, width, height);

    // Switch view visibility
    webcamFeed.classList.add('hidden');
    freezeCanvas.classList.remove('hidden');

    // Update UI headers & status
    stepBadge.textContent = 'Step 2 & 3';
    stepTitle.textContent = 'Click and drag to draw a box around each vital sign';
    freezeBtnText.textContent = 'Resume Live Feed';
    freezeBtn.classList.remove('btn-primary');
    freezeBtn.classList.add('btn-accent');
    updateStatus('frozen', 'Frame Frozen');

    isFrozen = true;
    retakeBtn.disabled = false;
    updateStepper();
    redrawCanvas();
  }

  // Unfreeze Frame / Resume Live Feed
  function unfreezeToLiveFeed() {
    freezeCanvas.classList.add('hidden');
    webcamFeed.classList.remove('hidden');

    stepBadge.textContent = 'Step 1';
    stepTitle.textContent = 'Point your camera at the monitor screen';
    freezeBtnText.textContent = 'Freeze Frame';
    freezeBtn.classList.remove('btn-accent');
    freezeBtn.classList.add('btn-primary');
    updateStatus('live', 'Live Feed');

    isFrozen = false;
    retakeBtn.disabled = true;
    updateStepper();
  }

  // Retake Frame Action
  function retakeFrame() {
    if (isFrozen) {
      unfreezeToLiveFeed();
    }
  }

  // Get canvas scaled coordinates from mouse event
  function getCanvasCoords(e) {
    const rect = freezeCanvas.getBoundingClientRect();
    const scaleX = freezeCanvas.width / rect.width;
    const scaleY = freezeCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // Mouse Event Handlers for Rectangle Drawing
  freezeCanvas.addEventListener('mousedown', (e) => {
    if (!isFrozen || boxes.length >= 4 || !labelModal.classList.contains('hidden')) return;
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;
    currentX = coords.x;
    currentY = coords.y;
    isDrawing = true;
  });

  freezeCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);
    currentX = coords.x;
    currentY = coords.y;
    redrawCanvas();
  });

  function finishDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;
    const coords = getCanvasCoords(e);
    currentX = coords.x;
    currentY = coords.y;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    if (w >= 15 && h >= 15) {
      pendingBox = { x, y, width: w, height: h };
      showLabelModal();
    } else {
      pendingBox = null;
    }
    redrawCanvas();
  }

  freezeCanvas.addEventListener('mouseup', finishDrawing);
  freezeCanvas.addEventListener('mouseleave', () => {
    if (isDrawing) {
      isDrawing = false;
      redrawCanvas();
    }
  });

  // Touch Event Support
  freezeCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      freezeCanvas.dispatchEvent(mouseEvent);
    }
  });

  freezeCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      freezeCanvas.dispatchEvent(mouseEvent);
    }
  });

  freezeCanvas.addEventListener('touchend', () => {
    const mouseEvent = new MouseEvent('mouseup', {});
    freezeCanvas.dispatchEvent(mouseEvent);
  });

  // Label Selection Modal Helpers
  function showLabelModal() {
    const assignedLabels = boxes.map(b => b.label);
    labelOptBtns.forEach(btn => {
      const label = btn.dataset.label;
      if (assignedLabels.includes(label)) {
        btn.disabled = true;
      } else {
        btn.disabled = false;
      }
    });

    labelModal.classList.remove('hidden');
  }

  function hideLabelModal() {
    labelModal.classList.add('hidden');
  }

  // Option Button Click Handler
  labelOptBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!pendingBox) return;

      const label = btn.dataset.label;
      const color = btn.dataset.color;

      boxes.push({
        id: Date.now(),
        label,
        color,
        x: pendingBox.x,
        y: pendingBox.y,
        width: pendingBox.width,
        height: pendingBox.height
      });

      pendingBox = null;
      hideLabelModal();
      updateChecklist();
      redrawCanvas();
    });
  });

  // Cancel Box Button Handler
  cancelLabelBtn.addEventListener('click', () => {
    pendingBox = null;
    hideLabelModal();
    redrawCanvas();
  });

  // Undo & Reset Action Handlers
  undoBtn.addEventListener('click', () => {
    if (boxes.length > 0) {
      boxes.pop();
      updateChecklist();
      redrawCanvas();
    }
  });

  resetBtn.addEventListener('click', () => {
    if (boxes.length > 0) {
      boxes = [];
      updateChecklist();
      redrawCanvas();
    }
  });

  // Build Calibration JSON Object
  function buildCalibrationJSON() {
    const findBox = (label) => boxes.find(b => b.label === label);

    const hrBox = findBox('Heart Rate');
    const spo2Box = findBox('SpO2');
    const bpBox = findBox('Blood Pressure');
    const etco2Box = findBox('EtCO2');

    return {
      calibratedAt: new Date().toISOString(),
      frameWidth: freezeCanvas.width || TARGET_WIDTH,
      frameHeight: freezeCanvas.height || TARGET_HEIGHT,
      regions: {
        heartRate: hrBox ? { x: Math.round(hrBox.x), y: Math.round(hrBox.y), width: Math.round(hrBox.width), height: Math.round(hrBox.height) } : null,
        spo2: spo2Box ? { x: Math.round(spo2Box.x), y: Math.round(spo2Box.y), width: Math.round(spo2Box.width), height: Math.round(spo2Box.height) } : null,
        bloodPressure: bpBox ? { x: Math.round(bpBox.x), y: Math.round(bpBox.y), width: Math.round(bpBox.width), height: Math.round(bpBox.height) } : null,
        etco2: etco2Box ? { x: Math.round(etco2Box.x), y: Math.round(etco2Box.y), width: Math.round(etco2Box.width), height: Math.round(etco2Box.height) } : null
      }
    };
  }

  // Save Calibration to LocalStorage
  function saveCalibration() {
    if (boxes.length < 4) return;

    const data = buildCalibrationJSON();
    try {
      localStorage.setItem('monitorCalibration', JSON.stringify(data, null, 2));
      showSuccessBanner(
        'Calibration Saved!',
        'Calibration saved! You can now start monitoring.'
      );
      showMonitoringSection();
    } catch (e) {
      console.error('Failed to save calibration to localStorage:', e);
      alert('Failed to save to localStorage.');
    }
  }

  // Download Calibration as JSON File
  function downloadCalibrationFile() {
    if (boxes.length < 4) return;

    const data = buildCalibrationJSON();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `monitor_calibration_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccessBanner(
      'File Downloaded!',
      'Calibration saved! You can now start monitoring.'
    );
    showMonitoringSection();
  }

  // Display Success Banner
  function showSuccessBanner(title, message) {
    bannerTitle.textContent = title;
    bannerText.textContent = message;
    saveSuccessBanner.classList.remove('hidden');
    saveSuccessBanner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  closeBannerBtn.addEventListener('click', () => {
    saveSuccessBanner.classList.add('hidden');
  });

  saveBtn.addEventListener('click', saveCalibration);
  downloadBtn.addEventListener('click', downloadCalibrationFile);

  // Update Checklist & Enable/Disable Action Buttons
  function updateChecklist() {
    markedCount.textContent = boxes.length;

    const markedLabels = boxes.map(b => b.label);
    const checklistItems = checklistGroup.querySelectorAll('.checklist-item');

    checklistItems.forEach(item => {
      const vitalName = item.dataset.vital;
      const statusSpan = item.querySelector('.vital-status');

      if (markedLabels.includes(vitalName)) {
        item.classList.add('marked');
        statusSpan.textContent = '✓ Marked';
        statusSpan.className = 'vital-status status-done';
      } else {
        item.classList.remove('marked');
        statusSpan.textContent = '(not yet)';
        statusSpan.className = 'vital-status status-pending';
      }
    });

    const isAllMarked = boxes.length === 4;
    saveBtn.disabled = !isAllMarked;
    downloadBtn.disabled = !isAllMarked;
    undoBtn.disabled = boxes.length === 0;
    resetBtn.disabled = boxes.length === 0;

    updateStepper();
  }

  // Update Visual Stepper State
  function updateStepper() {
    // Reset all nodes
    [stepNode1, stepNode2, stepNode3, stepNode4].forEach(n => n.className = 'step-node');
    [connector1, connector2, connector3].forEach(c => c.className = 'step-connector');

    if (!isFrozen) {
      stepNode1.classList.add('active');
    } else if (boxes.length < 4) {
      stepNode1.classList.add('complete');
      connector1.classList.add('complete');
      stepNode2.classList.add('complete');
      connector2.classList.add('complete');
      stepNode3.classList.add('active');
    } else {
      stepNode1.classList.add('complete');
      connector1.classList.add('complete');
      stepNode2.classList.add('complete');
      connector2.classList.add('complete');
      stepNode3.classList.add('complete');
      connector3.classList.add('complete');
      stepNode4.classList.add('active');
    }
  }

  // Redraw Canvas (Frozen Image + Boxes + Active Draft)
  function redrawCanvas() {
    const ctx = freezeCanvas.getContext('2d');
    ctx.clearRect(0, 0, freezeCanvas.width, freezeCanvas.height);

    if (offscreenCanvas.width > 0) {
      ctx.drawImage(offscreenCanvas, 0, 0);
    }

    boxes.forEach(box => {
      ctx.strokeStyle = box.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      ctx.fillStyle = box.color + '22';
      ctx.fillRect(box.x, box.y, box.width, box.height);

      ctx.font = 'bold 15px Inter, sans-serif';
      const textMetrics = ctx.measureText(box.label);
      const padX = 10;
      const pillWidth = textMetrics.width + (padX * 2);
      const pillHeight = 26;
      
      const pillY = box.y >= 32 ? box.y - 30 : box.y + 4;
      const pillX = box.x;

      ctx.fillStyle = box.color;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 4);
        ctx.fill();
      } else {
        ctx.fillRect(pillX, pillY, pillWidth, pillHeight);
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillText(box.label, pillX + padX, pillY + 18);
    });

    if (isDrawing && (startX !== currentX || startY !== currentY)) {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  // Helper for Status Badge
  function updateStatus(state, label) {
    statusBadge.className = `status-badge status-${state}`;
    statusText.textContent = label;
  }

  // Diagnostic Camera Error Handler
  function showError(err) {
    updateStatus('error', 'Camera Offline');
    cameraError.classList.remove('hidden');

    const errName = err && err.name ? err.name : '';
    const isFile = window.location.protocol === 'file:';
    const isHttpNonLocal = window.location.protocol === 'http:' && 
                           window.location.hostname !== 'localhost' && 
                           window.location.hostname !== '127.0.0.1';

    if (errName === 'InsecureContext' || isFile || isHttpNonLocal) {
      if (errorIcon) errorIcon.textContent = '🔒⚠️';
      if (errorTitle) errorTitle.textContent = 'Browser Security Restriction';
      if (errorMessage) errorMessage.textContent = 'Modern browsers block camera access when opening HTML directly as local files (file://) or over plain HTTP IP addresses.';
      if (errorDiagnosticHint) {
        errorDiagnosticHint.classList.remove('hidden');
        errorDiagnosticHint.innerHTML = `
          <strong>How to fix:</strong><br>
          1. Start the FastAPI backend server in terminal:<br>
          &nbsp;&nbsp;<code>uvicorn backend.main:app --reload</code><br>
          2. Open <a href="http://localhost:8000/app/index.html" target="_blank" style="color: #38bdf8; text-decoration: underline;">http://localhost:8000/app/index.html</a> in your browser.<br>
          3. Or click <strong>Screen Share</strong> or <strong>Demo Monitor</strong> below to test immediately!
        `;
      }
    } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      if (errorIcon) errorIcon.textContent = '🚫📷';
      if (errorTitle) errorTitle.textContent = 'Camera Access Blocked';
      if (errorMessage) errorMessage.textContent = 'Permission to access your webcam was denied in browser or system privacy settings.';
      if (errorDiagnosticHint) {
        errorDiagnosticHint.classList.remove('hidden');
        errorDiagnosticHint.innerHTML = `
          <strong>How to fix:</strong><br>
          1. Click the camera lock icon 🔒 next to the address bar.<br>
          2. Set Camera access to <strong>Allow</strong> and click <strong>Retry Camera</strong>.<br>
          3. Check Windows Privacy Settings → <em>Allow apps to access your camera</em>.
        `;
      }
    } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      if (errorIcon) errorIcon.textContent = '📷❓';
      if (errorTitle) errorTitle.textContent = 'No Camera Detected';
      if (errorMessage) errorMessage.textContent = 'No webcam hardware was found connected to your computer.';
      if (errorDiagnosticHint) {
        errorDiagnosticHint.classList.remove('hidden');
        errorDiagnosticHint.innerHTML = `
          Plug in a USB webcam, or use <strong>Screen Share</strong> / <strong>Demo Monitor</strong> mode below to calibrate without a camera.
        `;
      }
    } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
      if (errorIcon) errorIcon.textContent = '📷🔒';
      if (errorTitle) errorTitle.textContent = 'Camera Already in Use';
      if (errorMessage) errorMessage.textContent = 'Your webcam is being used by another application (e.g. Zoom, Teams, Skype, or another browser tab).';
      if (errorDiagnosticHint) {
        errorDiagnosticHint.classList.remove('hidden');
        errorDiagnosticHint.innerHTML = `
          Close other video apps or browser tabs accessing your camera, then click <strong>Retry Camera</strong>.
        `;
      }
    } else {
      if (errorIcon) errorIcon.textContent = '📷❌';
      if (errorTitle) errorTitle.textContent = 'Camera Connection Error';
      if (errorMessage) errorMessage.textContent = (err && err.message) ? err.message : 'Could not initialize camera stream.';
      if (errorDiagnosticHint) {
        errorDiagnosticHint.classList.remove('hidden');
        errorDiagnosticHint.innerHTML = `
          Try selecting a different camera device from the dropdown above, or use <strong>Screen Share</strong> / <strong>Demo Monitor</strong>.
        `;
      }
    }
  }

  function hideError() {
    cameraError.classList.add('hidden');
  }

  // Live Monitoring & Backend Communication State
  let monitoringInterval = null;
  let isMonitoring = false;

  const startMonitoringBtn = document.getElementById('startMonitoringBtn');
  const stopMonitoringBtn = document.getElementById('stopMonitoringBtn');
  const monitoringSection = document.getElementById('monitoringSection');
  const monitoringStatusBadge = document.getElementById('monitoringStatusBadge');
  const monitoringStatusText = document.getElementById('monitoringStatusText');

  function showMonitoringSection() {
    if (monitoringSection) {
      monitoringSection.classList.remove('hidden');
    }
  }

  function updateMonitoringStatus(state, label) {
    if (monitoringStatusBadge) {
      monitoringStatusBadge.className = `status-badge status-${state}`;
    }
    if (monitoringStatusText) {
      monitoringStatusText.textContent = label;
    }
  }

  function startMonitoring() {
    if (isMonitoring) return;

    const savedStr = localStorage.getItem('monitorCalibration');
    if (!savedStr) {
      alert('No saved calibration found. Please complete calibration first.');
      return;
    }

    let calibration;
    try {
      calibration = JSON.parse(savedStr);
    } catch (e) {
      alert('Invalid calibration data found in localStorage.');
      return;
    }

    if (!calibration.regions || !calibration.regions.heartRate) {
      alert('Incomplete calibration data.');
      return;
    }

    isMonitoring = true;
    if (isFrozen) {
      unfreezeToLiveFeed();
    }
    if (startMonitoringBtn) startMonitoringBtn.classList.add('hidden');
    if (stopMonitoringBtn) stopMonitoringBtn.classList.remove('hidden');
    updateMonitoringStatus('live', 'Monitoring Active (1s)');

    // Run first capture cycle immediately, then every 1 second for instant live updates
    captureAndProcessReadings(calibration);
    monitoringInterval = setInterval(() => {
      captureAndProcessReadings(calibration);
    }, 1000);
  }

  function stopMonitoring() {
    if (!isMonitoring) return;
    isMonitoring = false;
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    if (startMonitoringBtn) startMonitoringBtn.classList.remove('hidden');
    if (stopMonitoringBtn) stopMonitoringBtn.classList.add('hidden');
    updateMonitoringStatus('connecting', 'Monitoring Paused');
  }

  let isProcessingCycle = false;

  async function captureAndProcessReadings(calibration) {
    if (isProcessingCycle) return;
    isProcessingCycle = true;
    try {
      const width = (webcamFeed && webcamFeed.videoWidth) ? webcamFeed.videoWidth : (offscreenCanvas.width || calibration.frameWidth || TARGET_WIDTH);
      const height = (webcamFeed && webcamFeed.videoHeight) ? webcamFeed.videoHeight : (offscreenCanvas.height || calibration.frameHeight || TARGET_HEIGHT);

    // Capture full frame to canvas
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d');

    let drewFrame = false;

    // Prioritize live webcam/screen/demo video feed whenever active
    if (webcamFeed && webcamFeed.videoWidth > 0 && !webcamFeed.paused && !webcamFeed.ended) {
      try {
        fullCtx.drawImage(webcamFeed, 0, 0, width, height);
        drewFrame = true;
      } catch (e) {}
    }

    // Fall back to offscreen snapshot if live video feed is unavailable
    if (!drewFrame && offscreenCanvas.width > 0 && offscreenCanvas.height > 0) {
      fullCtx.drawImage(offscreenCanvas, 0, 0, width, height);
      drewFrame = true;
    }

    if (!drewFrame) {
      console.warn('No active frame available for monitoring capture');
      return;
    }

    const scaleX = width / (calibration.frameWidth || width);
    const scaleY = height / (calibration.frameHeight || height);

    const fieldsMap = [
      { key: 'heartRate', fieldType: 'heart_rate' },
      { key: 'spo2', fieldType: 'spo2' },
      { key: 'bloodPressure', fieldType: 'blood_pressure' },
      { key: 'etco2', fieldType: 'etco2' }
    ];

    const cycleResults = {};

    const tasks = fieldsMap.map(({ key, fieldType }) => {
      const region = calibration.regions[key];
      if (!region || !region.width || !region.height) {
        cycleResults[fieldType] = { raw_value: null, smoothed_value: null, status: "error" };
        updateFieldUI(fieldType, null, null, 'error');
        return Promise.resolve();
      }

      const rx = Math.round(region.x * scaleX);
      const ry = Math.round(region.y * scaleY);
      const rw = Math.round(region.width * scaleX);
      const rh = Math.round(region.height * scaleY);

      if (rw <= 0 || rh <= 0) {
        cycleResults[fieldType] = { raw_value: null, smoothed_value: null, status: "error" };
        updateFieldUI(fieldType, null, null, 'error');
        return Promise.resolve();
      }

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = rw;
      cropCanvas.height = rh;
      const cropCtx = cropCanvas.getContext('2d');

      cropCtx.drawImage(fullCanvas, rx, ry, rw, rh, 0, 0, rw, rh);

      return new Promise((resolve) => {
        cropCanvas.toBlob(async (blob) => {
          if (!blob) {
            cycleResults[fieldType] = { raw_value: null, smoothed_value: null, status: "error" };
            updateFieldUI(fieldType, null, null, 'error');
            resolve();
            return;
          }

          const formData = new FormData();
          formData.append('file', blob, `${fieldType}.jpg`);
          formData.append('field_type', fieldType);

          try {
            const resp = await fetch('http://localhost:8000/read-value', {
              method: 'POST',
              body: formData
            });

            if (!resp.ok) {
              cycleResults[fieldType] = { raw_value: null, smoothed_value: null, status: "error" };
              updateFieldUI(fieldType, null, null, 'error');
              resolve();
              return;
            }

            const resData = await resp.json();
            cycleResults[fieldType] = resData;
            updateFieldUI(
              fieldType,
              resData.raw_value,
              resData.smoothed_value,
              resData.status
            );
          } catch (err) {
            console.error(`Failed sending ROI frame for ${fieldType}:`, err);
            cycleResults[fieldType] = { raw_value: null, smoothed_value: null, status: "error" };
            updateFieldUI(fieldType, null, null, 'error');
          }
          resolve();
        }, 'image/jpeg', 0.9);
      });
    });

    await Promise.all(tasks);

    // Construct exact cycle payload
    const getVal = (fieldType) => (
      cycleResults[fieldType]?.status === 'ok' || cycleResults[fieldType]?.status === 'fallback_estimated'
        ? cycleResults[fieldType].smoothed_value
        : null
    );

    const hrVal = getVal('heart_rate');
    const spo2Val = getVal('spo2');
    const etco2Val = getVal('etco2');

    let bpSys = null;
    let bpDia = null;
    const bpVal = getVal('blood_pressure');
    if (typeof bpVal === 'string') {
      const match = bpVal.match(/^(\d+)\/(\d+)$/);
      if (match) {
        bpSys = parseFloat(match[1]);
        bpDia = parseFloat(match[2]);
      }
    }

    const cyclePayload = {
      heart_rate: hrVal,
      spo2: spo2Val,
      bp_systolic: bpSys,
      bp_diastolic: bpDia,
      etco2: etco2Val
    };

    try {
      const cycleResp = await fetch('http://localhost:8000/process-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cyclePayload)
      });

      if (cycleResp.ok) {
        const caseRes = await cycleResp.json();
        updateTopCaseStatus(caseRes.status, caseRes.case_id);

        const msg = caseRes.message || caseRes.status;
        const displayLabel = caseRes.case_id ? `${msg} (${caseRes.case_id})` : msg;
        
        if (caseRes.status === 'recording' || caseRes.status === 'case_started') {
          updateMonitoringStatus('live', displayLabel);
        } else if (caseRes.status === 'case_ended') {
          updateMonitoringStatus('frozen', displayLabel);
        } else {
          updateMonitoringStatus('connecting', displayLabel);
        }
      }
    } catch (err) {
      console.error('Failed to post cycle to /process-cycle:', err);
    }
  } catch (err) {
    console.error('Error during capture and process cycle:', err);
  } finally {
    isProcessingCycle = false;
  }
}

  function updateTopCaseStatus(status, caseId) {
    const caseStatusBar = document.getElementById('caseStatusBar');
    const caseStatusIcon = document.getElementById('caseStatusIcon');
    const caseStatusText = document.getElementById('caseStatusText');
    const caseIdBadge = document.getElementById('caseIdBadge');
    const caseIdText = document.getElementById('caseIdText');

    if (!caseStatusBar) return;

    caseStatusBar.className = 'case-status-bar';

    if (status === 'case_started' || status === 'recording') {
      caseStatusBar.classList.add('status-recording');
      if (caseStatusIcon) caseStatusIcon.textContent = '🟢';
      if (caseStatusText) caseStatusText.textContent = 'Case Started — Recording';
    } else if (status === 'case_ended') {
      caseStatusBar.classList.add('status-ended');
      if (caseStatusIcon) caseStatusIcon.textContent = '🔴';
      if (caseStatusText) caseStatusText.textContent = 'Case Ended';
    } else {
      caseStatusBar.classList.add('status-waiting');
      if (caseStatusIcon) caseStatusIcon.textContent = '⏳';
      if (caseStatusText) caseStatusText.textContent = 'Waiting for stable signal';
    }

    const dashboardLink = document.getElementById('dashboardLink');
    const cardDashboardBtn = document.getElementById('cardDashboardBtn');

    if (caseIdBadge && caseIdText) {
      if (caseId) {
        caseIdText.textContent = caseId;
        caseIdBadge.classList.remove('hidden');
        if (dashboardLink) {
          dashboardLink.href = `dashboard.html?case_id=${encodeURIComponent(caseId)}`;
        }
        if (cardDashboardBtn) {
          cardDashboardBtn.href = `dashboard.html?case_id=${encodeURIComponent(caseId)}`;
          cardDashboardBtn.classList.remove('hidden');
        }
      } else {
        caseIdBadge.classList.add('hidden');
        if (cardDashboardBtn) {
          cardDashboardBtn.classList.add('hidden');
        }
      }
    }
  }

  function updateFieldUI(fieldType, rawValue, smoothedValue, status) {
    const smoothedEl = document.getElementById(`smoothed-${fieldType}`);
    const rawEl = document.getElementById(`raw-${fieldType}`);
    const dotEl = document.getElementById(`dot-${fieldType}`);
    const statusEl = document.getElementById(`status-${fieldType}`);
    const noteEl = document.getElementById(`note-${fieldType}`);

    if (smoothedEl) {
      smoothedEl.textContent = smoothedValue !== null && smoothedValue !== undefined ? smoothedValue : '--';
    }
    if (rawEl) {
      rawEl.textContent = rawValue !== null && rawValue !== undefined ? rawValue : '--';
    }

    if (dotEl && statusEl) {
      dotEl.className = 'status-dot-indicator';

      if (status === 'ok') {
        dotEl.classList.add('dot-green');
        statusEl.textContent = 'ok';
        if (noteEl) noteEl.classList.add('hidden');
      } else if (status === 'fallback_estimated') {
        dotEl.classList.add('dot-purple');
        statusEl.textContent = 'Demo simulation';
        if (noteEl) noteEl.classList.add('hidden');
      } else if (status === 'bad_frame') {
        dotEl.classList.add('dot-orange');
        statusEl.textContent = 'bad frame';
        if (noteEl) noteEl.classList.remove('hidden');
      } else if (status === 'unreadable') {
        dotEl.classList.add('dot-gray');
        statusEl.textContent = 'unreadable';
        if (noteEl) noteEl.classList.remove('hidden');
      } else if (status === 'invalid_range') {
        dotEl.classList.add('dot-red');
        statusEl.textContent = 'invalid range';
        if (noteEl) noteEl.classList.remove('hidden');
        console.warn(`[Digitizer Warning] Invalid range for ${fieldType}: raw=${rawValue}, holding last smoothed=${smoothedValue}`);
      } else {
        dotEl.classList.add('dot-red');
        statusEl.textContent = 'error';
        if (noteEl) noteEl.classList.remove('hidden');
        console.warn(`[Digitizer Error] Processing error for ${fieldType}: status=${status}, holding last smoothed=${smoothedValue}`);
      }
    }
  }

  // Check for existing saved calibration in localStorage
  function checkSavedCalibration() {
    try {
      const savedStr = localStorage.getItem('monitorCalibration');
      if (savedStr) {
        const savedData = JSON.parse(savedStr);
        if (savedData && savedData.regions) {
          console.log('Saved monitor calibration found in localStorage:', savedData);
          showMonitoringSection();
        }
      }
    } catch (e) {
      console.warn('Could not read existing calibration:', e);
    }
  }

  // Event Listeners
  freezeBtn.addEventListener('click', toggleFreezeFrame);
  retakeBtn.addEventListener('click', retakeFrame);
  if (retryCameraBtn) {
    retryCameraBtn.addEventListener('click', () => initCamera());
  }
  if (cameraSelect) {
    cameraSelect.addEventListener('change', (e) => {
      initCamera(e.target.value);
    });
  }
  if (screenShareBtn) screenShareBtn.addEventListener('click', initScreenShare);
  if (simulatedFeedBtn) simulatedFeedBtn.addEventListener('click', initSimulatedFeed);
  if (errorScreenShareBtn) errorScreenShareBtn.addEventListener('click', initScreenShare);
  if (errorSimulatedBtn) errorSimulatedBtn.addEventListener('click', initSimulatedFeed);

  if (startMonitoringBtn) {
    startMonitoringBtn.addEventListener('click', startMonitoring);
  }
  if (stopMonitoringBtn) {
    stopMonitoringBtn.addEventListener('click', stopMonitoring);
  }

  // Initialize Application
  populateCameraDevices();
  initCamera();
  checkSavedCalibration();
});
