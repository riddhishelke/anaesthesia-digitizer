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

  // Initialize Camera Access via getUserMedia
  async function initCamera() {
    hideError();
    updateStatus('connecting', 'Connecting camera...');
    freezeBtn.disabled = true;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: TARGET_WIDTH },
          height: { ideal: TARGET_HEIGHT },
          facingMode: 'user'
        },
        audio: false
      });

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
      };

    } catch (err) {
      console.error('Error accessing webcam:', err);
      showError(err);
    }
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

  function showError(err) {
    updateStatus('error', 'Camera Offline');
    cameraError.classList.remove('hidden');
  }

  function hideError() {
    cameraError.classList.add('hidden');
  }

  // Check for existing saved calibration in localStorage
  function checkSavedCalibration() {
    try {
      const savedStr = localStorage.getItem('monitorCalibration');
      if (savedStr) {
        const savedData = JSON.parse(savedStr);
        if (savedData && savedData.regions) {
          console.log('Saved monitor calibration found in localStorage:', savedData);
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
    retryCameraBtn.addEventListener('click', initCamera);
  }

  // Initialize
  initCamera();
  checkSavedCalibration();
});
