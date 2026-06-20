// State Variables
let isRecording = false;       // General recording status
let activeSource = null;       // 'button', 'key', or null
let isKeyPressed = false;      // Prevents keydown repeat events

let accumulatedTranscript = '';
let recognition = null;
let recognitionRunning = false; // Tracks SpeechRecognition's internal active state

// Web Audio API variables for Visualizer
let audioCtx = null;
let analyser = null;
let dataArray = null;
let sourceNode = null;
let microphoneStream = null;

// SpeechRecognition setup check
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// UI Elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = statusIndicator.querySelector('.status-text');
const langSelect = document.getElementById('langSelect');
const recordBtn = document.getElementById('recordBtn');
const modeBtnIndicator = document.getElementById('modeBtnIndicator');
const modeKeyIndicator = document.getElementById('modeKeyIndicator');
const visualizer = document.getElementById('visualizer');
const visualizerOverlay = document.getElementById('visualizerOverlay');
const transcriptText = document.getElementById('transcriptText');
const interimTextContainer = document.getElementById('interimTextContainer');
const interimText = document.getElementById('interimText');
const charCount = document.getElementById('charCount');
const wordCount = document.getElementById('wordCount');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// Check Speech Recognition Support
if (!SpeechRecognition) {
  transcriptText.value = "Lo sentimos, tu navegador no soporta el reconocimiento de voz de la API de Web Speech. Por favor, usa Google Chrome u otro navegador compatible.";
  transcriptText.disabled = true;
  recordBtn.disabled = true;
  langSelect.disabled = true;
}

// -------------------------------------------------------------
// Speech Recognition Logic
// -------------------------------------------------------------

function initSpeechRecognition() {
  if (recognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    recognitionRunning = true;
    updateUI();
    initAudioContext().catch(err => console.warn('Web Audio initialization skipped:', err));
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    
    // We process results from the current event index
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        let finalChunk = event.results[i][0].transcript;
        
        // Trim leading space if appending, but ensure separation
        if (accumulatedTranscript && !accumulatedTranscript.endsWith(' ') && !finalChunk.startsWith(' ')) {
          accumulatedTranscript += ' ';
        }
        accumulatedTranscript += finalChunk;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    transcriptText.value = accumulatedTranscript;
    updateStats();

    if (interimTranscript) {
      interimText.textContent = interimTranscript;
      interimTextContainer.classList.add('active');
    } else {
      interimTextContainer.classList.remove('active');
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    // 'no-speech' is a normal event when the user is silent. We ignore it to let it restart.
    // For other fatal errors, we must stop recording to avoid infinite loop spams.
    if (event.error !== 'no-speech') {
      let msg = 'Error en el reconocimiento de voz.';
      if (event.error === 'not-allowed') {
        msg = 'Permiso de micrófono denegado o bloqueado.';
      } else if (event.error === 'audio-capture') {
        msg = 'El micrófono no responde. Asegúrate de que no esté en uso por otra app.';
      } else if (event.error === 'network') {
        msg = 'Error de red en el servicio de traducción.';
      }
      
      showToast(msg, 'danger');
      
      // Stop recording state to break the retry loop
      isRecording = false;
      activeSource = null;
      if (recognition && recognitionRunning) {
        recognition.stop();
      }
      stopMicrophone();
      updateUI();
    }
  };

  recognition.onend = () => {
    recognitionRunning = false;
    
    // If the state is still recording, it means Chrome closed it due to silence,
    // or network fluctuations. We restart it to ensure continuous experience.
    if (isRecording) {
      startSpeechRecognitionEngine();
    } else {
      stopMicrophone();
      updateUI();
    }
  };
}

function startSpeechRecognitionEngine() {
  if (!recognition) initSpeechRecognition();
  
  if (!recognitionRunning) {
    recognition.lang = langSelect.value;
    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
    }
  }
}

// -------------------------------------------------------------
// Recording State Transitions
// -------------------------------------------------------------

function startRecording(source) {
  if (!SpeechRecognition) return;

  // Track if we need to start
  if (!isRecording) {
    isRecording = true;
    activeSource = source;
    
    startSpeechRecognitionEngine();
  } else {
    // If it's already recording and we trigger it via button while key is active,
    // promote activeSource to 'button' so releasing the key won't stop it.
    if (source === 'button' && activeSource === 'key') {
      activeSource = 'button';
      updateUI();
    }
  }
}

function stopRecording(source) {
  if (!isRecording) return;

  // We only stop if the source requesting the stop matches the active source.
  // For instance, if recording is active via button, releasing F2/F9 shouldn't stop it.
  if (source === activeSource) {
    isRecording = false;
    activeSource = null;
    
    if (recognition && recognitionRunning) {
      recognition.stop();
    }
    
    // Clear interim view
    interimTextContainer.classList.remove('active');
    interimText.textContent = '';
  }
}

// -------------------------------------------------------------
// UI Updates & Stats
// -------------------------------------------------------------

function updateUI() {
  if (isRecording) {
    // Update Badge
    statusIndicator.className = 'status-badge status-recording';
    statusText.textContent = 'Grabando...';
    
    // Update main button
    recordBtn.classList.add('recording-active');
    
    // Update indicators
    if (activeSource === 'button') {
      modeBtnIndicator.className = 'mode-tag mode-active-btn';
    } else {
      modeBtnIndicator.className = 'mode-tag mode-inactive';
    }
    
  } else {
    // Update Badge
    statusIndicator.className = 'status-badge status-idle';
    statusText.textContent = 'Listo';
    
    // Update main button
    recordBtn.classList.remove('recording-active');
    
    // Update indicators
    modeBtnIndicator.className = 'mode-tag mode-inactive';
  }
  
  // Key indicator is driven directly by keyboard events state
  if (isKeyPressed) {
    modeKeyIndicator.className = 'mode-tag mode-active-key';
  } else {
    modeKeyIndicator.className = 'mode-tag mode-inactive';
  }
}

function updateStats() {
  const text = transcriptText.value.trim();
  const charLength = text.length;
  const wordLength = text === '' ? 0 : text.split(/\s+/).length;
  
  charCount.textContent = `${charLength} ${charLength === 1 ? 'carácter' : 'caracteres'}`;
  wordCount.textContent = `${wordLength} ${wordLength === 1 ? 'palabra' : 'palabras'}`;
}

function showToast(message, type = 'success') {
  toastMsg.textContent = message;
  
  if (type === 'danger') {
    toast.style.background = 'rgba(244, 63, 94, 0.85)';
    toast.style.boxShadow = '0 8px 24px rgba(244, 63, 94, 0.3)';
  } else {
    toast.style.background = 'rgba(16, 185, 129, 0.85)';
    toast.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.3)';
  }
  
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// -------------------------------------------------------------
// Web Audio API & Visualizer
// -------------------------------------------------------------

async function initAudioContext() {
  if (audioCtx) return;
  
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Hide permission overlay
    visualizerOverlay.classList.add('hidden');
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64; // High frequency granularity not needed for clean bars
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    sourceNode = audioCtx.createMediaStreamSource(microphoneStream);
    sourceNode.connect(analyser);
  } catch (err) {
    console.warn('Microphone access denied or failed for Web Audio:', err);
    visualizerOverlay.innerHTML = '<p style="color:var(--color-danger)">Acceso al micrófono denegado o dispositivo bloqueado</p>';
    throw err;
  }
}

function stopMicrophone() {
  if (microphoneStream) {
    microphoneStream.getTracks().forEach(track => track.stop());
    microphoneStream = null;
  }
  if (audioCtx) {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(err => console.warn('Error closing AudioContext:', err));
    }
    audioCtx = null;
  }
  analyser = null;
  sourceNode = null;
  
  // Reset overlay visual state
  visualizerOverlay.classList.remove('hidden');
  visualizerOverlay.innerHTML = '<p>Graba para activar el visualizador de audio</p>';
}

// Canvas Setup & Resize
const canvasCtx = visualizer.getContext('2d');

function resizeCanvas() {
  visualizer.width = visualizer.clientWidth * window.devicePixelRatio;
  visualizer.height = visualizer.clientHeight * window.devicePixelRatio;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Visualizer Render Loop
function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  
  const width = visualizer.width;
  const height = visualizer.height;
  
  canvasCtx.clearRect(0, 0, width, height);
  
  const barCount = 20;
  const pixelRatio = window.devicePixelRatio || 1;
  const barWidth = (width / barCount) * 0.65;
  const barGap = (width / barCount) * 0.35;
  
  let data = [];
  
  if (isRecording && analyser) {
    analyser.getByteFrequencyData(dataArray);
    
    // Map frequency data bins into our barCount
    const step = Math.ceil(dataArray.length / barCount);
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < step; j++) {
        const index = i * step + j;
        if (index < dataArray.length) {
          sum += dataArray[index];
          count++;
        }
      }
      data.push(count > 0 ? sum / count : 0);
    }
  } else {
    // Generate soft animated wave when idle
    const time = Date.now() * 0.0025;
    for (let i = 0; i < barCount; i++) {
      // Create a nice fluid landscape using sine waves
      const sineVal = Math.sin(i * 0.4 + time) * Math.cos(i * 0.1 - time * 0.5);
      const normalized = (sineVal + 1) / 2; // scale 0 to 1
      data.push(normalized * 12); // low height idle bars
    }
  }
  
  // Draw the frequency bars
  for (let i = 0; i < barCount; i++) {
    let percent = data[i] / 255;
    
    if (!isRecording) {
      percent = data[i] / 100; // custom scale for idle animations
    }
    
    // Calculate final height, ensuring a small minimum height line for aesthetics
    const barHeight = Math.max(height * percent, 4 * pixelRatio);
    const x = i * (barWidth + barGap) + barGap / 2;
    const y = (height - barHeight) / 2; // Center vertically
    
    // Apply linear gradient color styling
    const gradient = canvasCtx.createLinearGradient(x, y, x, y + barHeight);
    if (isRecording) {
      gradient.addColorStop(0, '#f43f5e'); // Pinkish red
      gradient.addColorStop(0.5, '#a855f7'); // Purple
      gradient.addColorStop(1, '#6366f1'); // Indigo
    } else {
      gradient.addColorStop(0, '#a855f7'); // Purple
      gradient.addColorStop(1, '#6366f1'); // Indigo
    }
    
    canvasCtx.fillStyle = gradient;
    drawRoundedRect(canvasCtx, x, y, barWidth, barHeight, barWidth / 2);
  }
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

// Start visualizer right away (it will use idle animation until permission is granted)
drawVisualizer();

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------

// Toggle Button "Grabar" Click
recordBtn.addEventListener('click', () => {
  if (isRecording && activeSource === 'button') {
    stopRecording('button');
  } else {
    startRecording('button');
  }
});

// Keyboard Listeners (F2 and F9 for Push-to-Talk)
window.addEventListener('keydown', (e) => {
  if (e.key === 'F2' || e.key === 'F9') {
    e.preventDefault();
    
    if (isKeyPressed) return; // Prevent repeated keydown firing from keyboard repeat
    isKeyPressed = true;
    
    startRecording('key');
    updateUI();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'F2' || e.key === 'F9') {
    e.preventDefault();
    
    isKeyPressed = false;
    stopRecording('key');
    updateUI();
  }
});

// Select language changed
langSelect.addEventListener('change', () => {
  if (isRecording) {
    // Restart recognition with updated language setting
    recognition.stop(); // will trigger onend, starting again with new langSelect value
  }
});

// Text Input manually modified (sync accumulator)
transcriptText.addEventListener('input', () => {
  accumulatedTranscript = transcriptText.value;
  updateStats();
});

// Action Button: Clear Text
clearBtn.addEventListener('click', () => {
  if (transcriptText.value.trim() === '') return;
  
  if (confirm('¿Estás seguro de que deseas limpiar el texto transcrito?')) {
    accumulatedTranscript = '';
    transcriptText.value = '';
    updateStats();
    showToast('Texto borrado');
  }
});

// Action Button: Copy to Clipboard
copyBtn.addEventListener('click', async () => {
  const text = transcriptText.value.trim();
  if (text === '') {
    showToast('No hay texto para copiar', 'danger');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(text);
    showToast('¡Texto copiado al portapapeles!');
  } catch (err) {
    console.error('Error copying text:', err);
    showToast('Error al copiar el texto', 'danger');
  }
});
