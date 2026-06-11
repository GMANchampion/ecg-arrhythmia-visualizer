const canvas = document.getElementById("ecgCanvas");
const ctx = canvas.getContext("2d");
const rhythmName = document.getElementById("rhythmName");
const heartRate = document.getElementById("heartRate");
const buttons = document.querySelectorAll("[data-rhythm]");

// This object is the simple "rhythm database".
// maybe later include explanations, clues, QRS width, danger labels, and challenge-mode answers.
const rhythms = {
  normal: {
    name: "Normal sinus rhythm",
    bpm: 72,
    irregular: false,
    pWave: true,
  },
  tachycardia: {
    name: "Sinus tachycardia",
    bpm: 124,
    irregular: false,
    pWave: true,
  },
  bradycardia: {
    name: "Sinus bradycardia",
    bpm: 45,
    irregular: false,
    pWave: true,
  },
  afib: {
    name: "Atrial fibrillation rough draft",
    bpm: 110,
    irregular: true,
    pWave: false,
  },
  // TODO: PVC settings will go here later.
  // TODO: Ventricular tachycardia settings will go here later.
};

// tells program which rhythm should be drawn rn.
let currentRhythm = "normal";

// app's running clock. It makes the ECG appear to move.
let time = 0;
let lastFrame = 0;

// The ECG waves are built by adding several small and large bumps together.
function gaussian(x, center, width, height) {
  const distance = (x - center) / width;
  return height * Math.exp(-0.5 * distance * distance);
}

// Create one simplified heartbeat.
// phase is where we are inside the beat, from 0 to 1.
function normalBeat(phase, rhythm) {
  let voltage = 0;

  // P wave: small bump before the big spike. AFib removes this in the prototype.
  if (rhythm.pWave) {
    voltage += gaussian(phase, 0.18, 0.035, 0.15);
  }

  // QRS complex: the sharp down-up-down shape when the ventricles squeeze.
  voltage += gaussian(phase, 0.34, 0.012, -0.18);
  voltage += gaussian(phase, 0.37, 0.01, 1.15);
  voltage += gaussian(phase, 0.4, 0.014, -0.35);

  // T wave: wider rounded bump after the QRS complex as the heart resets.
  voltage += gaussian(phase, 0.62, 0.07, 0.36);

  return voltage;
}

// Find the ECG voltage at one exact moment in time.
// The drawing function calls this many times to create the visible line.
function signalAt(sampleTime) {
  const rhythm = rhythms[currentRhythm];
  const beatLength = 60 / rhythm.bpm;
  let adjustedTime = sampleTime;

  // Rough first draft of AFib irregularity.
  // Later, this should become real irregular R-R beat scheduling instead of sine-wave timing.
  if (rhythm.irregular) {
    adjustedTime += 0.14 * Math.sin(sampleTime * 4.1) + 0.08 * Math.sin(sampleTime * 9.3);
  }

  // Convert the current time into a position inside one heartbeat.
  const phase = (adjustedTime % beatLength) / beatLength;
  let voltage = normalBeat(phase, rhythm);

  // Small motion/noise keeps the strip from looking too perfectly computer-generated.
  const baselineWander = 0.03 * Math.sin(sampleTime * 1.2);
  const tinyNoise = 0.015 * Math.sin(sampleTime * 37);
  voltage += baselineWander + tinyNoise;

  // AFib should have a shaky-looking baseline.
  // This is a placeholder version; better fibrillatory waves could be added later.
  if (rhythm.irregular) {
    voltage += 0.05 * Math.sin(sampleTime * 42) + 0.03 * Math.sin(sampleTime * 57);
  }

  return voltage;
}

// Resize the canvas so the drawing stays sharp on normal and high-resolution screens.
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Draw the green monitor grid behind the ECG trace.
function drawGrid(width, height) {
  ctx.fillStyle = "#06100d";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(83, 255, 138, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x < width; x += 28) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }

  for (let y = 0; y < height; y += 28) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }

  ctx.stroke();
}

// Draw the ECG line from left to right.
function drawWaveform() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const centerY = height * 0.52;

  // The prototype shows the last 7 seconds of the simulated ECG.
  const secondsShown = 7;

  // More samples make the waveform smoother, but too many can slow the page.
  const samples = 700;

  drawGrid(width, height);

  ctx.strokeStyle = "#6dff96";
  ctx.lineWidth = 2.4;
  ctx.shadowColor = "rgba(109, 255, 150, 0.5)";
  ctx.shadowBlur = 8;
  ctx.beginPath();

  // Build the ECG trace one small point at a time.
  for (let i = 0; i <= samples; i += 1) {
    const progress = i / samples;
    const sampleTime = time - secondsShown + progress * secondsShown;
    const x = progress * width;
    const y = centerY - signalAt(sampleTime) * 105;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.shadowBlur = 0;

  // TODO: Add labels for P wave, QRS complex, and T wave after the drawing math is stable.
}

// Main animation loop. The browser calls this again and again.
function animate(frameTime) {
  if (!lastFrame) {
    lastFrame = frameTime;
  }

  // elapsed is how much time passed since the last frame.
  // The cap keeps the animation from jumping too far if the tab pauses.
  const elapsed = Math.min(0.05, (frameTime - lastFrame) / 1000);
  lastFrame = frameTime;
  time += elapsed;

  drawWaveform();
  requestAnimationFrame(animate);
}

// Change the selected rhythm and update the text on screen.
function setRhythm(rhythmId) {
  currentRhythm = rhythmId;
  const rhythm = rhythms[currentRhythm];
  rhythmName.textContent = rhythm.name;
  heartRate.textContent = rhythm.bpm;

  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.rhythm === rhythmId);
  });

  // TODO: Later, update an explanation box here when the rhythm changes.
}

// Each rhythm button gets a click listener.
buttons.forEach((button) => {
  button.addEventListener("click", () => {
    setRhythm(button.dataset.rhythm);
  });
});

// If the browser window changes size, redraw the canvas at the new size.
window.addEventListener("resize", resizeCanvas);

// Start the prototype.
resizeCanvas();
setRhythm(currentRhythm);
requestAnimationFrame(animate);
