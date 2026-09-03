// State Variables
let isRecording = false;       // General recording status
let activeSource = null;       // 'button', 'key', or null
let isKeyPressed = false;      // Prevents keydown repeat events

let accumulatedTranscript = '';
let recognition = null;
let recognitionRunning = false; // Tracks SpeechRecognition's internal active state
let isStarting = false;         // Tracks if recognition is in the process of starting
let pendingPunctuation = '';

// Settings State
let smartPunctuationEnabled = true;
let voiceCommandsEnabled = true;
let shortcutMode = 'hold'; // 'hold' or 'toggle'
let fontSize = 16; // default font size in px

// History State
let transcriptionHistory = [];

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
const statusText = statusIndicator ? statusIndicator.querySelector('.status-text') : null;
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
const downloadBtn = document.getElementById('downloadBtn');
const downloadMDBtn = document.getElementById('downloadMDBtn');
const copyBtn = document.getElementById('copyBtn');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const saveStatus = document.getElementById('saveStatus');
const saveStatusSeparator = document.getElementById('saveStatusSeparator');
const saveStatusText = document.getElementById('saveStatusText');

// New UI Elements
const smartPunctuationCheckbox = document.getElementById('smartPunctuationCheckbox');
const voiceCommandsCheckbox = document.getElementById('voiceCommandsCheckbox');
const shortcutModeSelect = document.getElementById('shortcutModeSelect');
const decFontBtn = document.getElementById('decFontBtn');
const incFontBtn = document.getElementById('incFontBtn');
const speakBtn = document.getElementById('speakBtn');
const shortcutDescText = document.getElementById('shortcutDescText');

// History UI Elements
const historyToggleBtn = document.getElementById('historyToggleBtn');
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyListContainer = document.getElementById('historyListContainer');
const historyCountText = document.getElementById('historyCountText');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Audio File Transcription State & UI Elements
let selectedAudioFile = null;
let fileAudioElement = null;
let fileMediaSourceNode = null;
let isFileTranscribing = false;

const audioDropzone = document.getElementById('audioDropzone');
const audioFileInput = document.getElementById('audioFileInput');
const fileStatusCard = document.getElementById('fileStatusCard');
const audioFileName = document.getElementById('audioFileName');
const audioFileDuration = document.getElementById('audioFileDuration');
const removeFileBtn = document.getElementById('removeFileBtn');
const speedSelect = document.getElementById('speedSelect');
const progressContainer = document.getElementById('progressContainer');
const audioProgressBar = document.getElementById('audioProgressBar');
const audioProgressPercent = document.getElementById('audioProgressPercent');
const startFileTranscribeBtn = document.getElementById('startFileTranscribeBtn');
const cancelFileTranscribeBtn = document.getElementById('cancelFileTranscribeBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const fileErrorBox = document.getElementById('fileErrorBox');
const fileErrorText = document.getElementById('fileErrorText');
const closeFileErrorBtn = document.getElementById('closeFileErrorBtn');

function showFileError(message) {
  if (fileErrorText) fileErrorText.textContent = message;
  if (fileErrorBox) fileErrorBox.classList.remove('hidden');
}

function hideFileError() {
  if (fileErrorBox) fileErrorBox.classList.add('hidden');
}

if (closeFileErrorBtn) {
  closeFileErrorBtn.addEventListener('click', hideFileError);
}

// Chrome Extension Global Command Listener
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle-recording') {
      if (isRecording) {
        stopRecording('button');
      } else {
        startRecording('button');
      }
      sendResponse({ status: 'ok', isRecording });
    }
  });
}

// Check Speech Recognition Support
if (!SpeechRecognition) {
  transcriptText.value = "Lo sentimos, tu navegador no soporta el reconocimiento de voz de la API de Web Speech. Por favor, usa Google Chrome u otro navegador compatible.";
  transcriptText.disabled = true;
  recordBtn.disabled = true;
  langSelect.disabled = true;
}

// -------------------------------------------------------------
// Grammar and Casing Helpers
// -------------------------------------------------------------

function adjustCasing(prevText, newText) {
  if (!prevText || !newText) return newText;

  // Find the first letter in newText (skipping leading spaces)
  let firstLetterIdx = 0;
  while (firstLetterIdx < newText.length && newText[firstLetterIdx] === ' ') {
    firstLetterIdx++;
  }

  if (firstLetterIdx >= newText.length) return newText;

  const trimmedPrev = prevText.trimEnd();
  if (trimmedPrev.length === 0) return newText;

  const lastChar = trimmedPrev[trimmedPrev.length - 1];
  const sentenceEndings = ['.', '?', '!', '\n'];
  const shouldCapitalize = sentenceEndings.includes(lastChar);

  if (!shouldCapitalize) {
    // Lowercase the first letter
    return newText.slice(0, firstLetterIdx) +
      newText.charAt(firstLetterIdx).toLowerCase() +
      newText.slice(firstLetterIdx + 1);
  } else {
    // Capitalize the first letter
    return newText.slice(0, firstLetterIdx) +
      newText.charAt(firstLetterIdx).toUpperCase() +
      newText.slice(firstLetterIdx + 1);
  }
}

function applySmartPunctuation(text, lang) {
  if (!text) return text;

  let cleaned = text;
  const lowerLang = lang.toLowerCase();

  if (lowerLang.startsWith('es')) {
    const replacements = [
      { regex: /\bnuevo párrafo\b/gi, replacement: '\n\n' },
      { regex: /\bpunto y aparte\b/gi, replacement: '.\n\n' },
      { regex: /\bnueva línea\b/gi, replacement: '\n' },
      { regex: /\bpunto y coma\b/gi, replacement: ';' },
      { regex: /\bdos puntos\b/gi, replacement: ':' },
      { regex: /\bpunto\b/gi, replacement: '.' },
      { regex: /\bcoma\b/gi, replacement: ',' },
      { regex: /\bsigno de interrogación\b/gi, replacement: '?' },
      { regex: /\bsigno de exclamación\b/gi, replacement: '!' }
    ];
    replacements.forEach(r => {
      cleaned = cleaned.replace(r.regex, r.replacement);
    });
  } else if (lowerLang.startsWith('en')) {
    const replacements = [
      { regex: /\bnew paragraph\b/gi, replacement: '\n\n' },
      { regex: /\bnew line\b/gi, replacement: '\n' },
      { regex: /\bperiod\b/gi, replacement: '.' },
      { regex: /\bfull stop\b/gi, replacement: '.' },
      { regex: /\bcomma\b/gi, replacement: ',' },
      { regex: /\bsemicolon\b/gi, replacement: ';' },
      { regex: /\bcolon\b/gi, replacement: ':' },
      { regex: /\bquestion mark\b/gi, replacement: '?' },
      { regex: /\bexclamation mark\b/gi, replacement: '!' },
      { regex: /\bexclamation point\b/gi, replacement: '!' }
    ];
    replacements.forEach(r => {
      cleaned = cleaned.replace(r.regex, r.replacement);
    });
  } else if (lowerLang.startsWith('pt')) {
    const replacements = [
      { regex: /\bnovo parágrafo\b/gi, replacement: '\n\n' },
      { regex: /\bponto e vírgula\b/gi, replacement: ';' },
      { regex: /\bdois pontos\b/gi, replacement: ':' },
      { regex: /\bponto final\b/gi, replacement: '.' },
      { regex: /\bponto\b/gi, replacement: '.' },
      { regex: /\bvírgula\b/gi, replacement: ',' },
      { regex: /\bponto de interrogação\b/gi, replacement: '?' },
      { regex: /\bponto de exclamação\b/gi, replacement: '!' },
      { regex: /\bnova linha\b/gi, replacement: '\n' }
    ];
    replacements.forEach(r => {
      cleaned = cleaned.replace(r.regex, r.replacement);
    });
  } else if (lowerLang.startsWith('fr')) {
    const replacements = [
      { regex: /\bnouveau paragraphe\b/gi, replacement: '\n\n' },
      { regex: /\bnouvelle ligne\b/gi, replacement: '\n' },
      { regex: /\bpoint-virgule\b/gi, replacement: ';' },
      { regex: /\bdeux points\b/gi, replacement: ':' },
      { regex: /\bpoint d'interrogation\b/gi, replacement: '?' },
      { regex: /\bpoint d'exclamation\b/gi, replacement: '!' },
      { regex: /\bpoint\b/gi, replacement: '.' },
      { regex: /\bvirgule\b/gi, replacement: ',' }
    ];
    replacements.forEach(r => {
      cleaned = cleaned.replace(r.regex, r.replacement);
    });
  } else if (lowerLang.startsWith('de')) {
    const replacements = [
      { regex: /\bneuer absatz\b/gi, replacement: '\n\n' },
      { regex: /\bneue zeile\b/gi, replacement: '\n' },
      { regex: /\bsemikolon\b/gi, replacement: ';' },
      { regex: /\bdoppelpunkt\b/gi, replacement: ':' },
      { regex: /\bfragezeichen\b/gi, replacement: '?' },
      { regex: /\bausrufezeichen\b/gi, replacement: '!' },
      { regex: /\bpunkt\b/gi, replacement: '.' },
      { regex: /\bkomma\b/gi, replacement: ',' }
    ];
    replacements.forEach(r => {
      cleaned = cleaned.replace(r.regex, r.replacement);
    });
  } else if (lowerLang.startsWith('it')) {
    const replacements = [
      { regex: /\bnuovo paragrafo\b/gi, replacement: '\n\n' },
      { regex: /\bnuova riga\b/gi, replacement: '\n' },
      { regex: /\bpunto e virgola\b/gi, replacement: ';' },
      { regex: /\bdue punti\b/gi, replacement: ':' },
      { regex: /\bpunto interrogativo\b/gi, replacement: '?' },
      { regex: /\bpunto esclamativo\b/gi, replacement: '!' },
      { regex: /\bpunto\b/gi, replacement: '.' },
      { regex: /\bvirgola\b/gi, replacement: ',' }
    ];
    replacements.forEach(r => {
      cleaned = cleaned.replace(r.regex, r.replacement);
    });
  }

  return cleaned;
}

function handleVoiceCommands(chunk) {
  if (!voiceCommandsEnabled || !chunk) return false;

  const lower = chunk.trim().toLowerCase();

  // Clear command
  if (lower === 'limpiar todo' || lower === 'borrar todo' || lower === 'clear all') {
    archiveCurrentSession('Comando de voz: Limpiar');
    accumulatedTranscript = '';
    transcriptText.value = '';
    saveTranscriptToStorage();
    updateStats();
    showToast('Texto limpiado por comando de voz');
    return true;
  }

  // Delete last word command
  if (lower === 'borrar última palabra' || lower === 'delete last word') {
    if (accumulatedTranscript) {
      const words = accumulatedTranscript.trim().split(/\s+/);
      words.pop();
      accumulatedTranscript = words.join(' ');
      transcriptText.value = accumulatedTranscript;
      saveTranscriptToStorage();
      updateStats();
      showToast('Última palabra borrada');
    }
    return true;
  }

  return false;
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
    isStarting = false;
    pendingPunctuation = '';
    updateUI();
    initAudioContext().catch(err => console.warn('Web Audio initialization skipped:', err));
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let hasFinal = false;

    // We process results from the current event index
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        let finalChunk = event.results[i][0].transcript;

        // Check verbal voice commands
        if (handleVoiceCommands(finalChunk)) {
          hasFinal = true;
          continue;
        }

        if (smartPunctuationEnabled) {
          finalChunk = applySmartPunctuation(finalChunk, langSelect.value);
        }
        let adjustedChunk = adjustCasing(accumulatedTranscript, finalChunk);

        // Append chunk with smart spacing
        if (accumulatedTranscript) {
          const endsWithSpace = accumulatedTranscript.endsWith(' ');
          const startsWithSpace = adjustedChunk.startsWith(' ');

          if (endsWithSpace && startsWithSpace) {
            accumulatedTranscript += adjustedChunk.slice(1);
          } else if (!endsWithSpace && !startsWithSpace) {
            accumulatedTranscript += ' ' + adjustedChunk;
          } else {
            accumulatedTranscript += adjustedChunk;
          }
        } else {
          accumulatedTranscript += adjustedChunk.trimStart();
        }
        hasFinal = true;
      } else {
        let chunk = event.results[i][0].transcript;
        if (smartPunctuationEnabled) {
          chunk = applySmartPunctuation(chunk, langSelect.value);
        }
        interimTranscript += chunk;
      }
    }

    if (hasFinal && pendingPunctuation) {
      accumulatedTranscript = accumulatedTranscript.trimEnd();
      accumulatedTranscript += pendingPunctuation;
      pendingPunctuation = '';
    }

    // Build display text with interim text appended
    let displayText = accumulatedTranscript;
    if (interimTranscript) {
      let adjustedInterim = adjustCasing(accumulatedTranscript, interimTranscript);
      if (displayText) {
        const endsWithSpace = displayText.endsWith(' ');
        const startsWithSpace = adjustedInterim.startsWith(' ');

        if (endsWithSpace && startsWithSpace) {
          displayText += adjustedInterim.slice(1);
        } else if (!endsWithSpace && !startsWithSpace) {
          displayText += ' ' + adjustedInterim;
        } else {
          displayText += adjustedInterim;
        }
      } else {
        displayText += adjustedInterim.trimStart();
      }
    }
    transcriptText.value = displayText;

    // Scroll to the bottom of the textarea automatically
    transcriptText.scrollTop = transcriptText.scrollHeight;

    updateStats();

    if (hasFinal) {
      saveTranscriptToStorage();
    }

    if (interimTranscript) {
      interimText.textContent = interimTranscript;
      interimTextContainer.classList.add('active');
    } else {
      interimTextContainer.classList.remove('active');
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    isStarting = false;

    // 'no-speech' (silencio) y 'aborted' (detenido manualmente o reiniciado) son eventos normales no fatales
    if (event.error === 'no-speech' || event.error === 'aborted') {
      return;
    }

    let msg = 'Error en el reconocimiento de voz.';
    if (event.error === 'not-allowed') {
      msg = 'Permiso de micrófono denegado o bloqueado. Asegúrate de permitir el acceso al micrófono.';
    } else if (event.error === 'audio-capture') {
      msg = 'El micrófono o entrada de audio no responde.';
    } else if (event.error === 'network') {
      msg = 'Error de conexión de red con el servicio de reconocimiento de voz de Chrome.';
    }

    showToast(msg, 'danger');

    // Solo detener en caso de errores fatales reales (permiso denegado, red, captura de audio)
    isRecording = false;
    activeSource = null;
    if (isFileTranscribing) {
      finishFileTranscription(false);
    } else {
      if (recognition && recognitionRunning) {
        recognition.stop();
      }
      stopMicrophone();
      updateUI();
    }
  };

  recognition.onend = () => {
    recognitionRunning = false;
    isStarting = false;

    if (pendingPunctuation) {
      accumulatedTranscript = accumulatedTranscript.trimEnd();
      accumulatedTranscript += pendingPunctuation;
      pendingPunctuation = '';

      transcriptText.value = accumulatedTranscript;
      transcriptText.scrollTop = transcriptText.scrollHeight;
      saveTranscriptToStorage();
      updateStats();
    }

    // If the state is still recording, it means Chrome closed it due to silence,
    // or network fluctuations. We restart it to ensure continuous experience.
    if (isRecording) {
      // Add a small delay (e.g., 400ms) to let Chrome and PulseAudio/Pipewire
      // fully release the microphone before requesting it again.
      // This prevents the OS taskbar microphone notification from spamming/blinking.
      setTimeout(() => {
        if (isRecording) {
          startSpeechRecognitionEngine();
        }
      }, 400);
    } else {
      stopMicrophone();
      updateUI();
    }
  };
}

function startSpeechRecognitionEngine() {
  if (!recognition) initSpeechRecognition();

  if (!recognitionRunning && !isStarting) {
    isStarting = true;
    recognition.lang = langSelect.value;
    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      isStarting = false;
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

    updateUI();
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
    if (statusIndicator) {
      if (recognitionRunning) {
        statusIndicator.className = 'status-badge status-recording';
        if (statusText) statusText.textContent = 'Grabando...';
      } else {
        statusIndicator.className = 'status-badge status-recording status-connecting';
        if (statusText) statusText.textContent = 'Iniciando...';
      }
    }

    // Update main button
    if (recordBtn) {
      recordBtn.classList.add('recording-active');
    }

    // Update indicators
    if (modeBtnIndicator) {
      if (activeSource === 'button') {
        modeBtnIndicator.className = 'mode-tag mode-active-btn';
      } else {
        modeBtnIndicator.className = 'mode-tag mode-inactive';
      }
    }

  } else {
    // Update Badge
    if (statusIndicator) {
      statusIndicator.className = 'status-badge status-idle';
      if (statusText) statusText.textContent = 'Listo';
    }

    // Update main button
    if (recordBtn) {
      recordBtn.classList.remove('recording-active');
    }

    // Update indicators
    if (modeBtnIndicator) {
      modeBtnIndicator.className = 'mode-tag mode-inactive';
    }
  }

  // Key indicator is driven directly by keyboard events state
  if (modeKeyIndicator) {
    if (isKeyPressed) {
      modeKeyIndicator.className = 'mode-tag mode-active-key';
    } else {
      modeKeyIndicator.className = 'mode-tag mode-inactive';
    }
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

  const displayTime = (type === 'danger') ? 10000 : 2500;

  if (type === 'danger') {
    toast.style.background = 'rgba(244, 63, 94, 0.95)';
    toast.style.boxShadow = '0 8px 24px rgba(244, 63, 94, 0.4)';
  } else {
    toast.style.background = 'rgba(16, 185, 129, 0.85)';
    toast.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.3)';
  }

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, displayTime);
}

// -------------------------------------------------------------
// Web Audio API & Visualizer
// -------------------------------------------------------------

async function initAudioContext(disableAEC = false) {
  if (audioCtx && microphoneStream) return;

  try {
    const audioConstraints = disableAEC
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : true;

    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

    // Hide permission overlay
    if (visualizerOverlay) visualizerOverlay.classList.add('hidden');

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64; // High frequency granularity not needed for clean bars

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    sourceNode = audioCtx.createMediaStreamSource(microphoneStream);
    sourceNode.connect(analyser);
  } catch (err) {
    console.warn('Microphone access denied or failed for Web Audio:', err);
    if (visualizerOverlay) visualizerOverlay.innerHTML = '<p style="color:var(--color-danger)">Acceso al micrófono denegado o dispositivo bloqueado</p>';
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

  if (document.hidden) return;

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

  // Posicionar cursor al final de la caja de texto y darle foco
  if (transcriptText) {
    transcriptText.focus();
    const len = transcriptText.value.length;
    transcriptText.setSelectionRange(len, len);
  }
});

// Keyboard Listeners (F2 and F9 for Push-to-Talk, Punctuation hotkeys during recording)
window.addEventListener('keydown', (e) => {
  // Punctuation Hotkeys while recording
  const punctuationKeys = ['.', ',', ';', ':', '?', '!'];
  if (isRecording && punctuationKeys.includes(e.key)) {
    const isTextareaFocused = document.activeElement === transcriptText;
    const interimLen = (interimText.textContent || '').length;

    // Only intercept if not focused, or focused but cursor is at the end (ignoring interim text)
    if (!isTextareaFocused || transcriptText.selectionStart >= transcriptText.value.length - interimLen) {
      e.preventDefault();

      // Store the punctuation to be appended after finalization
      pendingPunctuation = e.key;

      // Stop the engine. This forces it to finalize the current interim transcript.
      if (recognition && recognitionRunning) {
        recognition.stop();
      }

      // Clear interim UI state immediately
      interimText.textContent = '';
      interimTextContainer.classList.remove('active');
      return;
    }
  }

  if (e.key === 'F2' || e.key === 'F9') {
    e.preventDefault();

    if (isKeyPressed) return; // Prevent repeated keydown firing from keyboard repeat
    isKeyPressed = true;

    if (shortcutMode === 'hold') {
      startRecording('key');
    } else {
      if (isRecording && activeSource === 'key') {
        stopRecording('key');
      } else {
        startRecording('key');
      }
    }
    updateUI();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'F2' || e.key === 'F9') {
    e.preventDefault();

    isKeyPressed = false;
    if (shortcutMode === 'hold') {
      stopRecording('key');
      updateUI();
    }
  }
});

// Select language changed
langSelect.addEventListener('change', () => {
  saveTranscriptToStorage();
  if (isRecording) {
    // Restart recognition with updated language setting
    recognition.stop(); // will trigger onend, starting again with new langSelect value
  }
});

// Text Input manually modified (sync accumulator)
transcriptText.addEventListener('input', () => {
  if (isRecording && interimText.textContent) {
    const val = transcriptText.value;
    const interim = interimText.textContent;
    if (val.endsWith(interim)) {
      accumulatedTranscript = val.substring(0, val.length - interim.length).trimEnd();
    } else {
      accumulatedTranscript = val;
    }
  } else {
    accumulatedTranscript = transcriptText.value;
  }
  saveTranscriptToStorage();
  updateStats();
});

// Action Button: Clear Text
clearBtn.addEventListener('click', () => {
  if (transcriptText.value.trim() === '') return;

  if (confirm('¿Estás seguro de que deseas limpiar el texto transcrito? (Se guardará una copia en el Historial)')) {
    archiveCurrentSession('Limpieza manual');
    accumulatedTranscript = '';
    transcriptText.value = '';
    saveTranscriptToStorage();
    updateStats();
    showToast('Texto borrado (Archivado en Historial)');
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

// Action Button: Download Text as .txt File
downloadBtn.addEventListener('click', () => {
  const text = transcriptText.value.trim();
  if (text === '') {
    showToast('No hay texto para descargar', 'danger');
    return;
  }

  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    a.href = url;
    a.download = `transcripcion_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.txt`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('¡Archivo .txt descargado!');
  } catch (err) {
    console.error('Error downloading text:', err);
    showToast('Error al descargar el archivo', 'danger');
  }
});

// Action Button: Download Text as Markdown (.md) File
if (downloadMDBtn) {
  downloadMDBtn.addEventListener('click', () => {
    const text = transcriptText.value.trim();
    if (text === '') {
      showToast('No hay texto para descargar', 'danger');
      return;
    }

    try {
      const now = new Date();
      const dateStr = now.toLocaleString();
      const wordLen = text.split(/\s+/).length;
      const charLen = text.length;

      const markdownContent = `# Transcripción de Audio\n\n` +
        `**Fecha:** ${dateStr}  \n` +
        `**Idioma:** ${langSelect.options[langSelect.selectedIndex].text}  \n` +
        `**Estadísticas:** ${wordLen} palabras | ${charLen} caracteres\n\n` +
        `---\n\n` +
        `${text}\n`;

      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');

      a.href = url;
      a.download = `transcripcion_${year}-${month}-${day}_${hours}-${minutes}.md`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('¡Archivo Markdown (.md) descargado!');
    } catch (err) {
      console.error('Error downloading markdown:', err);
      showToast('Error al descargar el archivo Markdown', 'danger');
    }
  });
}

// -------------------------------------------------------------
// Storage & Recovery Logic
// -------------------------------------------------------------

function saveTranscriptToStorage() {
  const data = {
    savedTranscript: accumulatedTranscript,
    savedLanguage: langSelect.value,
    savedSmartPunctuation: smartPunctuationEnabled,
    savedVoiceCommands: voiceCommandsEnabled,
    savedShortcutMode: shortcutMode,
    savedFontSize: fontSize,
    savedHistory: transcriptionHistory,
    savedApiKey: apiKeyInput ? apiKeyInput.value : ''
  };

  if (saveStatus && saveStatusText) {
    saveStatus.style.display = 'inline-flex';
    if (saveStatusSeparator) saveStatusSeparator.style.display = 'inline';
    saveStatusText.textContent = 'Guardando...';
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        console.warn('Error saving to chrome.storage:', chrome.runtime.lastError);
      } else {
        if (saveStatusText) saveStatusText.textContent = 'Guardado';
      }
    });
  } else {
    try {
      localStorage.setItem('savedTranscript', accumulatedTranscript);
      localStorage.setItem('savedLanguage', langSelect.value);
      localStorage.setItem('savedSmartPunctuation', smartPunctuationEnabled);
      localStorage.setItem('savedVoiceCommands', voiceCommandsEnabled);
      localStorage.setItem('savedShortcutMode', shortcutMode);
      localStorage.setItem('savedFontSize', fontSize);
      localStorage.setItem('savedHistory', JSON.stringify(transcriptionHistory));
      if (saveStatusText) saveStatusText.textContent = 'Guardado';
    } catch (err) {
      console.warn('Error saving to localStorage:', err);
    }
  }
}

function loadTranscriptFromStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['savedTranscript', 'savedLanguage', 'savedSmartPunctuation', 'savedVoiceCommands', 'savedShortcutMode', 'savedFontSize', 'savedHistory', 'savedApiKey'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('Error loading from chrome.storage:', chrome.runtime.lastError);
        loadFallback();
        return;
      }

      let hasData = false;
      if (result.savedTranscript !== undefined) {
        accumulatedTranscript = result.savedTranscript;
        transcriptText.value = accumulatedTranscript;
        hasData = true;
      }
      if (result.savedLanguage !== undefined) {
        langSelect.value = result.savedLanguage;
      }
      if (result.savedSmartPunctuation !== undefined) {
        smartPunctuationEnabled = result.savedSmartPunctuation;
        if (smartPunctuationCheckbox) smartPunctuationCheckbox.checked = smartPunctuationEnabled;
      }
      if (result.savedApiKey !== undefined && apiKeyInput) {
        apiKeyInput.value = result.savedApiKey;
      }
      if (result.savedVoiceCommands !== undefined) {
        voiceCommandsEnabled = result.savedVoiceCommands;
        if (voiceCommandsCheckbox) voiceCommandsCheckbox.checked = voiceCommandsEnabled;
      }
      if (result.savedShortcutMode !== undefined) {
        shortcutMode = result.savedShortcutMode;
        if (shortcutModeSelect) shortcutModeSelect.value = shortcutMode;
        updateShortcutDesc();
      }
      if (result.savedFontSize !== undefined) {
        fontSize = result.savedFontSize;
        applyFontSize();
      }
      if (result.savedHistory && Array.isArray(result.savedHistory)) {
        transcriptionHistory = result.savedHistory;
        renderHistoryList();
      }

      if (hasData && saveStatus && saveStatusSeparator) {
        saveStatus.style.display = 'inline-flex';
        saveStatusSeparator.style.display = 'inline';
        if (saveStatusText) saveStatusText.textContent = 'Guardado';
      }
      updateStats();
    });
  } else {
    loadFallback();
  }

  function loadFallback() {
    try {
      const savedTxt = localStorage.getItem('savedTranscript');
      const savedLang = localStorage.getItem('savedLanguage');
      const savedSmartPunc = localStorage.getItem('savedSmartPunctuation');
      const savedVoiceCmds = localStorage.getItem('savedVoiceCommands');
      const savedShortMode = localStorage.getItem('savedShortcutMode');
      const savedFontS = localStorage.getItem('savedFontSize');
      const savedHist = localStorage.getItem('savedHistory');

      let hasData = false;
      if (savedTxt !== null) {
        accumulatedTranscript = savedTxt;
        transcriptText.value = accumulatedTranscript;
        hasData = true;
      }
      if (savedLang !== null) {
        langSelect.value = savedLang;
      }
      if (savedSmartPunc !== null) {
        smartPunctuationEnabled = (savedSmartPunc === 'true');
        if (smartPunctuationCheckbox) smartPunctuationCheckbox.checked = smartPunctuationEnabled;
      }
      if (savedVoiceCmds !== null) {
        voiceCommandsEnabled = (savedVoiceCmds === 'true');
        if (voiceCommandsCheckbox) voiceCommandsCheckbox.checked = voiceCommandsEnabled;
      }
      if (savedShortMode !== null) {
        shortcutMode = savedShortMode;
        if (shortcutModeSelect) shortcutModeSelect.value = shortcutMode;
        updateShortcutDesc();
      }
      if (savedFontS !== null) {
        fontSize = parseInt(savedFontS, 10);
        applyFontSize();
      }
      if (savedHist !== null) {
        try {
          transcriptionHistory = JSON.parse(savedHist) || [];
          renderHistoryList();
        } catch (e) { }
      }

      if (hasData && saveStatus && saveStatusSeparator) {
        saveStatus.style.display = 'inline-flex';
        saveStatusSeparator.style.display = 'inline';
        if (saveStatusText) saveStatusText.textContent = 'Guardado';
      }
      updateStats();
    } catch (err) {
      console.warn('Error loading from localStorage:', err);
    }
  }
}

// Helper functions for new controls
function applyFontSize() {
  if (transcriptText) {
    transcriptText.style.fontSize = `${fontSize}px`;
  }
}

function updateShortcutDesc() {
  if (shortcutDescText) {
    if (shortcutMode === 'hold') {
      shortcutDescText.textContent = 'Mantén presionado para hablar (Push-to-Talk)';
    } else {
      shortcutDescText.textContent = 'Presiona una vez para encender/apagar';
    }
  }
}

// Font Control Listeners
if (decFontBtn) {
  decFontBtn.addEventListener('click', () => {
    if (fontSize > 12) {
      fontSize -= 2;
      applyFontSize();
      saveTranscriptToStorage();
    }
  });
}

if (incFontBtn) {
  incFontBtn.addEventListener('click', () => {
    if (fontSize < 32) {
      fontSize += 2;
      applyFontSize();
      saveTranscriptToStorage();
    }
  });
}

// Voice Commands Checkbox Listener
if (voiceCommandsCheckbox) {
  voiceCommandsCheckbox.addEventListener('change', () => {
    voiceCommandsEnabled = voiceCommandsCheckbox.checked;
    saveTranscriptToStorage();
  });
}

// -------------------------------------------------------------
// History Management Functions
// -------------------------------------------------------------

function archiveCurrentSession(note = 'Sesión guardada') {
  const text = transcriptText.value.trim();
  if (!text) return;

  const now = new Date();
  const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const wordLen = text.split(/\s+/).length;
  const charLen = text.length;

  const item = {
    id: 'session_' + Date.now(),
    timestamp: Date.now(),
    dateStr,
    text,
    wordLen,
    charLen,
    note
  };

  // Add to top of history list (max 50 sessions)
  transcriptionHistory.unshift(item);
  if (transcriptionHistory.length > 50) {
    transcriptionHistory.pop();
  }

  saveTranscriptToStorage();
  renderHistoryList();
}

function renderHistoryList() {
  if (!historyListContainer) return;

  const count = transcriptionHistory.length;
  if (historyCountText) {
    historyCountText.textContent = `${count} ${count === 1 ? 'sesión guardada' : 'sesiones guardadas'}`;
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.style.display = count > 0 ? 'inline-block' : 'none';
  }

  if (count === 0) {
    historyListContainer.innerHTML = `
      <div class="history-empty-state">
        <p>No tienes sesiones guardadas aún.</p>
        <p class="empty-sub">Las transcripciones limpiadas o archivadas aparecerán aquí.</p>
      </div>
    `;
    return;
  }

  historyListContainer.innerHTML = transcriptionHistory.map(item => `
    <div class="history-card" data-id="${item.id}">
      <div class="history-card-header">
        <span class="history-time">${item.dateStr} (${item.note || 'Sesión'})</span>
        <span class="history-stats-tag">${item.wordLen} palabras • ${item.charLen} caract.</span>
      </div>
      <div class="history-preview">${escapeHtml(item.text)}</div>
      <div class="history-card-actions">
        <button class="history-btn-sm restore-btn" data-id="${item.id}">Cargar</button>
        <button class="history-btn-sm delete-sm delete-btn" data-id="${item.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  // Attach event listeners for history card buttons
  historyListContainer.querySelectorAll('.restore-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      restoreHistorySession(id);
    });
  });

  historyListContainer.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      deleteHistorySession(id);
    });
  });
}

function restoreHistorySession(id) {
  const item = transcriptionHistory.find(h => h.id === id);
  if (!item) return;

  if (transcriptText.value.trim() !== '') {
    if (!confirm('¿Deseas reemplazar el texto actual por la sesión seleccionada?')) return;
  }

  accumulatedTranscript = item.text;
  transcriptText.value = accumulatedTranscript;
  saveTranscriptToStorage();
  updateStats();
  closeHistoryModal();
  showToast('Sesión cargada en el editor');
}

function deleteHistorySession(id) {
  transcriptionHistory = transcriptionHistory.filter(h => h.id !== id);
  saveTranscriptToStorage();
  renderHistoryList();
  showToast('Sesión eliminada');
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// History Modal Controls
function openHistoryModal() {
  if (historyModal) {
    historyModal.classList.add('active');
    renderHistoryList();
  }
}

function closeHistoryModal() {
  if (historyModal) {
    historyModal.classList.remove('active');
  }
}

if (historyToggleBtn) {
  historyToggleBtn.addEventListener('click', openHistoryModal);
}

if (closeHistoryBtn) {
  closeHistoryBtn.addEventListener('click', closeHistoryModal);
}

if (historyModal) {
  historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) {
      closeHistoryModal();
    }
  });
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('¿Estás seguro de que deseas eliminar todo el historial de sesiones?')) {
      transcriptionHistory = [];
      saveTranscriptToStorage();
      renderHistoryList();
      showToast('Historial limpiado');
    }
  });
}

// -------------------------------------------------------------
// Audio File Transcription Engine
// -------------------------------------------------------------

function handleSelectedAudioFile(file) {
  if (!file) return;

  if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !/\.(mp3|mp4|wav|m4a|ogg|webm|flac|aac)$/i.test(file.name)) {
    showToast('Por favor selecciona un archivo válido (.mp3, .mp4, .wav, .m4a, .ogg)', 'danger');
    return;
  }

  selectedAudioFile = file;

  // Update UI State
  if (audioFileName) audioFileName.textContent = file.name;
  if (audioDropzone) audioDropzone.classList.add('hidden');
  if (fileStatusCard) fileStatusCard.classList.remove('hidden');

  // Calculate audio duration
  const tempAudio = new Audio();
  const objectUrl = URL.createObjectURL(file);
  tempAudio.src = objectUrl;

  tempAudio.onloadedmetadata = () => {
    const duration = tempAudio.duration;
    if (duration && !isNaN(duration)) {
      const mins = Math.floor(duration / 60);
      const secs = Math.floor(duration % 60);
      if (audioFileDuration) {
        audioFileDuration.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    } else {
      if (audioFileDuration) audioFileDuration.textContent = '--:--';
    }
    URL.revokeObjectURL(objectUrl);
  };

  tempAudio.onerror = () => {
    if (audioFileDuration) audioFileDuration.textContent = '--:--';
    URL.revokeObjectURL(objectUrl);
  };
}

function resetAudioFileState() {
  if (isFileTranscribing) {
    finishFileTranscription(false);
  }

  selectedAudioFile = null;
  if (audioFileInput) audioFileInput.value = '';
  if (fileStatusCard) fileStatusCard.classList.add('hidden');
  if (audioDropzone) audioDropzone.classList.remove('hidden');
  if (progressContainer) progressContainer.classList.add('hidden');
  if (audioProgressBar) audioProgressBar.style.width = '0%';
  if (audioProgressPercent) audioProgressPercent.textContent = '0%';
}

async function transcribeWithGoogleAPI(userApiKey, selectedAudioFile, shortLang) {
  const base64Data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(selectedAudioFile);
  });

  if (audioProgressBar) audioProgressBar.style.width = '40%';
  if (audioProgressPercent) audioProgressPercent.textContent = '40%';

  let mimeType = selectedAudioFile.type || 'audio/mp3';
  if (selectedAudioFile.name.endsWith('.mp4')) mimeType = 'video/mp4';

  let modelsToTry = [];

  // 1. Dynamic model lookup via ListModels
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${userApiKey}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      if (listData.models && Array.isArray(listData.models)) {
        const found = listData.models
          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name.replace(/^models\//, ''));
        modelsToTry.push(...found);
      }
    }
  } catch (e) {
    console.warn('ListModels query failed:', e);
  }

  // 2. Candidate fallback models
  const candidateModels = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-pro'
  ];

  for (const c of candidateModels) {
    if (!modelsToTry.includes(c)) {
      modelsToTry.push(c);
    }
  }

  let lastError = null;

  // 3. Loop over candidate models across v1beta and v1 endpoints
  for (const modelName of modelsToTry) {
    const apiEndpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${userApiKey}`,
      `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${userApiKey}`
    ];

    for (const googleUrl of apiEndpoints) {
      try {
        const response = await fetch(googleUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: mimeType, data: base64Data } },
                { text: `Transcribe con total exactitud las palabras habladas en este archivo en idioma ${shortLang}. Devuelve strictly solo el texto transcrito sin introducciones ni comentarios.` }
              ]
            }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
        } else {
          const errJson = await response.json().catch(() => ({}));
          lastError = errJson.error?.message || `HTTP ${response.status}`;
        }
      } catch (e) {
        lastError = e.message;
      }
    }
  }

  // 4. Fallback to Google Cloud Speech-to-Text v1 API
  try {
    const langCodeMap = { 'es': 'es-ES', 'en': 'en-US', 'pt': 'pt-BR', 'fr': 'fr-FR', 'de': 'de-DE', 'it': 'it-IT' };
    const langCode = langCodeMap[shortLang] || 'es-ES';

    let encoding = 'MP3';
    if (selectedAudioFile.name.endsWith('.wav')) encoding = 'LINEAR16';
    if (selectedAudioFile.name.endsWith('.ogg')) encoding = 'OGG_OPUS';
    if (selectedAudioFile.name.endsWith('.flac')) encoding = 'FLAC';

    const sttUrl = `https://speech.googleapis.com/v1/speech:recognize?key=${userApiKey}`;
    const sttResponse = await fetch(sttUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: encoding,
          sampleRateHertz: 16000,
          languageCode: langCode,
          enableAutomaticPunctuation: true
        },
        audio: { content: base64Data }
      })
    });

    if (sttResponse.ok) {
      const sttData = await sttResponse.json();
      if (sttData.results && sttData.results.length > 0) {
        return sttData.results.map(r => r.alternatives?.[0]?.transcript || '').join(' ');
      }
    }
  } catch (sttErr) {
    console.warn('STT fallback failed:', sttErr);
  }

  throw new Error(`Google API: ${lastError || 'No disponible para esta clave'}`);
}

async function startFileTranscribe() {
  if (!selectedAudioFile) return;

  if (isRecording) {
    stopRecording('button');
  }

  isFileTranscribing = true;
  hideFileError();

  if (progressContainer) progressContainer.classList.remove('hidden');
  if (startFileTranscribeBtn) startFileTranscribeBtn.classList.add('hidden');
  if (cancelFileTranscribeBtn) cancelFileTranscribeBtn.classList.remove('hidden');

  if (audioProgressBar) audioProgressBar.style.width = '20%';
  if (audioProgressPercent) audioProgressPercent.textContent = '20%';

  try {
    showToast(`Transcribiendo "${selectedAudioFile.name}"...`);

    const userApiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    const shortLang = langSelect ? langSelect.value.split('-')[0] : 'es';

    let resultText = '';

    if (userApiKey && (userApiKey.startsWith('AIza') || userApiKey.startsWith('AQ.') || (!userApiKey.startsWith('sk-') && !userApiKey.startsWith('gsk_')))) {
      showToast('Transcribiendo con Google API...');
      resultText = await transcribeWithGoogleAPI(userApiKey, selectedAudioFile, shortLang);
    } else {
      const formData = new FormData();
      formData.append('file', selectedAudioFile);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', shortLang);

      let apiUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
      let headers = {};

      if (userApiKey) {
        if (userApiKey.startsWith('sk-')) {
          apiUrl = 'https://api.openai.com/v1/audio/transcriptions';
          formData.set('model', 'whisper-1');
        } else {
          apiUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
        }
        headers['Authorization'] = `Bearer ${userApiKey}`;
      }

      if (audioProgressBar) audioProgressBar.style.width = '55%';
      if (audioProgressPercent) audioProgressPercent.textContent = '55%';

      let response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headers,
          body: formData
        });
      } catch (netErr) {
        console.warn('Groq/OpenAI STT fetch failed, trying public inference STT:', netErr);
        const publicUrl = 'https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo';
        response = await fetch(publicUrl, {
          method: 'POST',
          body: selectedAudioFile
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error en servidor (${response.status}): ${errText}`);
      }

      const data = await response.json();
      resultText = data.text || data.text_output || '';
    }

    if (audioProgressBar) audioProgressBar.style.width = '90%';
    if (audioProgressPercent) audioProgressPercent.textContent = '90%';

    if (resultText && smartPunctuationEnabled) {
      resultText = applySmartPunctuation(resultText, langSelect.value);
    }

    if (resultText.trim()) {
      if (accumulatedTranscript) {
        accumulatedTranscript += '\n\n' + resultText.trim();
      } else {
        accumulatedTranscript = resultText.trim();
      }
      transcriptText.value = accumulatedTranscript;
      transcriptText.scrollTop = transcriptText.scrollHeight;
      updateStats();
      saveTranscriptToStorage();
    } else {
      showToast('No se detectó texto en el archivo de audio', 'danger');
    }

    if (audioProgressBar) audioProgressBar.style.width = '100%';
    if (audioProgressPercent) audioProgressPercent.textContent = '100%';

    finishFileTranscription(true);
  } catch (err) {
    console.error('File transcription failed:', err);
    const errMessage = err.message || 'Error al procesar el archivo.';
    showToast('La API de la clave no respondió. Cambiando a transcripción local por reproducción...', 'warning');
    showFileError(`${errMessage}. Iniciando transcripción en vivo reproduciendo el audio...`);
    
    // Automatic failover: stream audio playback locally into Web Speech API
    await runWebAudioStreamFallback();
  }
}

async function runWebAudioStreamFallback() {
    try {
      const objectUrl = URL.createObjectURL(selectedAudioFile);
      fileAudioElement = new Audio(objectUrl);

      const speed = parseFloat(speedSelect ? speedSelect.value : 1.5);
      fileAudioElement.playbackRate = speed;

      stopMicrophone();
      await initAudioContext(true);

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      fileMediaSourceNode = audioCtx.createMediaElementSource(fileAudioElement);
      if (analyser) {
        fileMediaSourceNode.connect(analyser);
      }
      fileMediaSourceNode.connect(audioCtx.destination);

      isRecording = true;
      activeSource = 'button';
      updateUI();
      startSpeechRecognitionEngine();

      fileAudioElement.ontimeupdate = () => {
        if (fileAudioElement && fileAudioElement.duration) {
          const pct = Math.min(100, Math.floor((fileAudioElement.currentTime / fileAudioElement.duration) * 100));
          if (audioProgressBar) audioProgressBar.style.width = pct + '%';
          if (audioProgressPercent) audioProgressPercent.textContent = pct + '%';
        }
      };

      fileAudioElement.onended = () => {
        finishFileTranscription(true);
      };

      fileAudioElement.onerror = (err) => {
        console.error('Audio file playback error:', err);
        showToast('Error al reproducir el archivo de audio', 'danger');
        finishFileTranscription(false);
      };

      await fileAudioElement.play();
      showToast(`Transcribiendo "${selectedAudioFile.name}" a ${speed}x...`);
    } catch (err) {
      console.error('Failed to start file transcription fallback:', err);
      showToast('Error al procesar el archivo', 'danger');
      finishFileTranscription(false);
    }
  }

  function finishFileTranscription(completed = false) {
    if (fileAudioElement) {
      fileAudioElement.pause();
      if (fileAudioElement.src) {
        URL.revokeObjectURL(fileAudioElement.src);
      }
      fileAudioElement = null;
    }

    if (fileMediaSourceNode) {
      try {
        fileMediaSourceNode.disconnect();
      } catch (e) { }
      fileMediaSourceNode = null;
    }

    isFileTranscribing = false;
    isRecording = false;
    activeSource = null;

    if (recognition && recognitionRunning) {
      recognition.stop();
    }

    updateUI();

    // Reset UI Controls
    if (startFileTranscribeBtn) startFileTranscribeBtn.classList.remove('hidden');
    if (cancelFileTranscribeBtn) cancelFileTranscribeBtn.classList.add('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');

    if (completed && selectedAudioFile) {
      if (audioProgressBar) audioProgressBar.style.width = '100%';
      if (audioProgressPercent) audioProgressPercent.textContent = '100%';

      archiveCurrentSession(`Audio subido: ${selectedAudioFile.name}`);
      showToast('¡Transcripción de archivo de audio completada!');
    }
  }

  // Drag and Drop Event Listeners
  if (audioDropzone) {
    audioDropzone.addEventListener('click', (e) => {
      if (audioFileInput && e.target !== audioFileInput) {
        audioFileInput.click();
      }
    });

    audioDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      audioDropzone.classList.add('dropzone-hover');
    });

    audioDropzone.addEventListener('dragleave', () => {
      audioDropzone.classList.remove('dropzone-hover');
    });

    audioDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      audioDropzone.classList.remove('dropzone-hover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleSelectedAudioFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (audioFileInput) {
    audioFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleSelectedAudioFile(e.target.files[0]);
      }
    });
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', resetAudioFileState);
  }

  if (startFileTranscribeBtn) {
    startFileTranscribeBtn.addEventListener('click', startFileTranscribe);
  }

  if (cancelFileTranscribeBtn) {
    cancelFileTranscribeBtn.addEventListener('click', () => {
      finishFileTranscription(false);
      showToast('Transcripción de archivo detenida');
    });
  }

  if (speedSelect) {
    speedSelect.addEventListener('change', () => {
      if (fileAudioElement && isFileTranscribing) {
        fileAudioElement.playbackRate = parseFloat(speedSelect.value);
        showToast(`Velocidad cambiada a ${speedSelect.value}x`);
      }
    });
  }

  // Load storage on startup
  loadTranscriptFromStorage();


