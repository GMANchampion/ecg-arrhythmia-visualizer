(() => {
  "use strict";

  const VERSION = "v1.1.0";
  const FLAGS = {
  "eventScheduler": false,
  "pvcFixed": false,
  "vtach": false,
  "challenge": false,
  "sliders": false,
  "notesPanel": true
};
  const RHYTHM_ORDER = ["normal","tachycardia","bradycardia","afib"];
  const RHYTHMS = {
  "normal": {
    "label": "Normal sinus rhythm",
    "short": "Normal",
    "bpm": 72,
    "rr": 0.8333333333333334,
    "rate": "Normal",
    "p": "Present",
    "qrs": "Narrow",
    "morphology": "Organized P-QRS-T",
    "explanation": "The rhythm is steady. Each beat has a P wave, a narrow QRS complex, and a T wave.",
    "clues": [
      "Even spacing between beats.",
      "P wave before each QRS complex.",
      "Normal-looking narrow QRS complexes."
    ]
  },
  "tachycardia": {
    "label": "Sinus tachycardia",
    "short": "Tachy",
    "bpm": 124,
    "rr": 0.4838709677419355,
    "rate": "Fast",
    "p": "Present",
    "qrs": "Narrow",
    "morphology": "Compressed P-QRS-T",
    "explanation": "The beat shape is still organized, but the beats are closer together because the heart rate is fast.",
    "clues": [
      "Rate is above 100 bpm.",
      "P waves are still visible.",
      "The normal beat pattern is squeezed closer together."
    ]
  },
  "bradycardia": {
    "label": "Sinus bradycardia",
    "short": "Brady",
    "bpm": 45,
    "rr": 1.3333333333333333,
    "rate": "Slow",
    "p": "Present",
    "qrs": "Narrow",
    "morphology": "Slow P-QRS-T",
    "explanation": "The beat shape remains organized, but there is a longer pause between beats.",
    "clues": [
      "Rate is below 60 bpm.",
      "The rhythm is regular.",
      "There is more baseline space between beats."
    ]
  },
  "afib": {
    "label": "Atrial fibrillation",
    "short": "AFib",
    "bpm": 112,
    "rr": 0.5357142857142857,
    "rate": "Variable",
    "p": "Absent",
    "qrs": "Narrow",
    "morphology": "No clear P waves",
    "explanation": "The rhythm is irregular and does not have organized P waves. The baseline has a shaky fibrillatory look.",
    "clues": [
      "R-R spacing is uneven.",
      "P waves are missing or hard to identify.",
      "The baseline looks restless."
    ]
  }
};

  const canvas = document.getElementById("ecgCanvas");
  const ctx = canvas.getContext("2d");
  const rhythmButtons = document.getElementById("rhythmButtons");
  const rhythmName = document.getElementById("rhythmName");
  const heartRate = document.getElementById("heartRate");
  const qrsReadout = document.getElementById("qrsReadout");
  const rateReadout = document.getElementById("rateReadout");
  const pReadout = document.getElementById("pReadout");
  const morphReadout = document.getElementById("morphReadout");
  const infoTitle = document.getElementById("infoTitle");
  const explanation = document.getElementById("explanation");
  const clueList = document.getElementById("clueList");
  const sweepSlider = document.getElementById("sweepSlider");
  const gainSlider = document.getElementById("gainSlider");
  const artifactSlider = document.getElementById("artifactSlider");
  const sweepOutput = document.getElementById("sweepOutput");
  const gainOutput = document.getElementById("gainOutput");
  const artifactOutput = document.getElementById("artifactOutput");
  const startCaseButton = document.getElementById("startCaseButton");
  const revealButton = document.getElementById("revealButton");
  const choiceGrid = document.getElementById("choiceGrid");
  const challengeTitle = document.getElementById("challengeTitle");
  const challengeText = document.getElementById("challengeText");
  const feedback = document.getElementById("feedback");
  const scorePill = document.getElementById("scorePill");

  const TAU = Math.PI * 2;

  const state = {
    rhythmId: RHYTHM_ORDER[0],
    time: 0,
    lastFrame: 0,
    sweepSeconds: FLAGS.sliders ? 8 : 7,
    gain: 1,
    artifact: FLAGS.sliders ? 0.03 : 0.02,
    events: [],
    nextBeatTime: -8,
    schedulerIndex: 0,
    pvcCountdown: 4,
    challenge: {
      active: false,
      answered: false,
      target: null,
      correct: 0,
      total: 0,
    },
  };

  function gaussian(x, center, width, height) {
    const distance = (x - center) / width;
    return height * Math.exp(-0.5 * distance * distance);
  }

  function phaseOf(time, rr) {
    return ((time % rr) + rr) % rr / rr;
  }

  function normalBeat(phase, options = {}) {
    const pWave = options.pWave === false ? 0 : gaussian(phase, 0.18, 0.035, 0.15);
    const q = gaussian(phase, 0.34, 0.012, -0.18);
    const r = gaussian(phase, 0.37, 0.01, 1.15);
    const s = gaussian(phase, 0.4, 0.014, -0.35);
    const t = gaussian(phase, 0.62, 0.07, 0.36);
    return (pWave + q + r + s + t) * (options.scale || 1);
  }

  function pvcBeat(phase) {
    return (
      gaussian(phase, 0.27, 0.04, -0.3) +
      gaussian(phase, 0.35, 0.055, 1.2) +
      gaussian(phase, 0.45, 0.06, -0.75) +
      gaussian(phase, 0.68, 0.1, -0.22)
    );
  }

  function vtachBeat(phase) {
    return (
      gaussian(phase, 0.24, 0.08, 0.88) -
      gaussian(phase, 0.44, 0.09, 0.78) +
      gaussian(phase, 0.64, 0.11, 0.24)
    );
  }

  function baseline(time, rhythmId) {
    let value = 0.025 * Math.sin(time * 1.1) + state.artifact * Math.sin(time * 31);
    if (rhythmId === "afib") {
      value += 0.045 * Math.sin(time * 42) + 0.025 * Math.sin(time * 57);
    }
    return value;
  }

  function signalModulo(sampleTime) {
    const rhythm = RHYTHMS[state.rhythmId];
    const rr = 60 / rhythm.bpm;
    let adjusted = sampleTime;

    if (state.rhythmId === "afib") {
      adjusted += 0.13 * Math.sin(sampleTime * 4.1) + 0.07 * Math.sin(sampleTime * 9.3);
    }

    const phase = phaseOf(adjusted, rr);
    let value = baseline(sampleTime, state.rhythmId);

    if (state.rhythmId === "pvc") {
      const beatNumber = Math.floor(adjusted / rr);
      const pvcSlot = FLAGS.pvcFixed ? beatNumber % 5 === 3 : beatNumber % 4 === 2;
      if (pvcSlot) {
        const shiftedPhase = FLAGS.pvcFixed ? phaseOf(adjusted + rr * 0.22, rr) : phase;
        value += pvcBeat(shiftedPhase) * (FLAGS.pvcFixed ? 0.92 : 1.08);
      } else if (FLAGS.pvcFixed && beatNumber % 5 === 4 && phase < 0.4) {
        value += baseline(sampleTime, state.rhythmId);
      } else {
        value += normalBeat(phase);
      }
    } else {
      value += normalBeat(phase, { pWave: state.rhythmId !== "afib" });
    }

    return value;
  }

  function scheduleNextEvent() {
    const rhythm = RHYTHMS[state.rhythmId];
    const rr = 60 / rhythm.bpm;
    let event = { t: state.nextBeatTime, type: "normal", scale: 1 };

    if (state.rhythmId === "afib") {
      event = { t: state.nextBeatTime, type: "afib", scale: 0.9 + Math.random() * 0.18 };
      state.nextBeatTime += 0.4 + Math.random() * 0.56;
    } else if (state.rhythmId === "pvc") {
      if (state.pvcCountdown <= 0) {
        event = { t: state.nextBeatTime - rr * 0.32, type: "pvc", scale: 1 };
        state.nextBeatTime = event.t + rr * 1.55;
        state.pvcCountdown = 4 + Math.floor(Math.random() * 2);
      } else {
        state.nextBeatTime += rr;
        state.pvcCountdown -= 1;
      }
    } else if (state.rhythmId === "vtach") {
      event = { t: state.nextBeatTime, type: "vtach", scale: 1 };
      state.nextBeatTime += rr;
    } else {
      state.nextBeatTime += rr;
    }

    state.schedulerIndex += 1;
    return event;
  }

  function refillEvents() {
    if (!FLAGS.eventScheduler) {
      return;
    }
    while (state.nextBeatTime < state.time + 2) {
      state.events.push(scheduleNextEvent());
    }
    const oldest = state.time - state.sweepSeconds - 1.5;
    state.events = state.events.filter((event) => event.t >= oldest);
  }

  function resetEvents() {
    state.events = [];
    state.nextBeatTime = state.time - state.sweepSeconds - 1;
    state.schedulerIndex = 0;
    state.pvcCountdown = 4;
    refillEvents();
  }

  function signalEvents(sampleTime) {
    let value = baseline(sampleTime, state.rhythmId);
    for (const event of state.events) {
      const age = sampleTime - event.t;
      if (age < -0.35 || age > 0.72) {
        continue;
      }
      const phase = age + 0.37;
      if (event.type === "pvc") {
        value += pvcBeat(phase) * event.scale;
      } else if (event.type === "vtach") {
        value += vtachBeat(phase) * event.scale;
      } else if (event.type === "afib") {
        value += normalBeat(phase, { pWave: false, scale: event.scale });
      } else {
        value += normalBeat(phase, { scale: event.scale });
      }
    }
    return value;
  }

  function signalAt(sampleTime) {
    return FLAGS.eventScheduler ? signalEvents(sampleTime) : signalModulo(sampleTime);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function drawGrid(width, height) {
    ctx.fillStyle = "#06100d";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(117, 255, 156, 0.11)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += width / state.sweepSeconds / 5) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += 28) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(117, 255, 156, 0.2)";
    ctx.beginPath();
    ctx.moveTo(0, height * 0.52);
    ctx.lineTo(width, height * 0.52);
    ctx.stroke();
  }

  function draw() {
    if (!canvas.width || !canvas.height) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const centerY = height * 0.52;
    const samples = Math.max(500, Math.floor(width * 1.2));

    drawGrid(width, height);

    ctx.strokeStyle = state.rhythmId === "vtach" ? "#ff667a" : "#75ff9c";
    ctx.lineWidth = 2.3;
    ctx.shadowColor = state.rhythmId === "vtach" ? "rgba(255,102,122,0.55)" : "rgba(117,255,156,0.5)";
    ctx.shadowBlur = 8;
    ctx.beginPath();

    for (let i = 0; i <= samples; i += 1) {
      const progress = i / samples;
      const sampleTime = state.time - state.sweepSeconds + progress * state.sweepSeconds;
      const x = progress * width;
      const y = centerY - signalAt(sampleTime) * 112 * state.gain;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function renderButtons() {
    rhythmButtons.textContent = "";
    for (const rhythmId of RHYTHM_ORDER) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = RHYTHMS[rhythmId].short;
      button.className = rhythmId === state.rhythmId && !state.challenge.active ? "active" : "";
      button.addEventListener("click", () => setRhythm(rhythmId, false));
      rhythmButtons.append(button);
    }
  }

  function renderInfo() {
    const rhythm = RHYTHMS[state.rhythmId];
    const hidden = FLAGS.challenge && state.challenge.active && !state.challenge.answered;
    document.body.classList.toggle("danger-trace", state.rhythmId === "vtach");
    rhythmName.textContent = hidden ? "Mystery rhythm" : rhythm.label;
    heartRate.textContent = rhythm.bpm;
    qrsReadout.textContent = hidden ? "Assess" : rhythm.qrs;
    rateReadout.textContent = hidden ? "Estimate" : rhythm.rate;
    pReadout.textContent = hidden ? "Assess" : rhythm.p;
    morphReadout.textContent = hidden ? "Interpret strip" : rhythm.morphology;
    infoTitle.textContent = hidden ? "Hidden case" : rhythm.label;
    explanation.textContent = hidden
      ? "Use rate, regularity, P waves, and QRS width to make a guess."
      : rhythm.explanation;

    clueList.textContent = "";
    const clues = hidden ? ["The rhythm identity is hidden in this beta challenge."] : rhythm.clues;
    for (const clue of clues) {
      const li = document.createElement("li");
      li.textContent = clue;
      clueList.append(li);
    }
  }

  function renderSliders() {
    if (!FLAGS.sliders) {
      return;
    }
    sweepOutput.textContent = state.sweepSeconds + " s";
    gainOutput.textContent = state.gain.toFixed(1) + "x";
    artifactOutput.textContent = state.artifact < 0.03 ? "Clean" : state.artifact < 0.08 ? "Low" : "High";
  }

  function renderChallenge() {
    if (!FLAGS.challenge) {
      return;
    }
    scorePill.textContent = state.challenge.correct + " / " + state.challenge.total;
    revealButton.disabled = !state.challenge.active || state.challenge.answered;
    challengeTitle.textContent = state.challenge.active && !state.challenge.answered ? "Identify rhythm" : "Practice case";
    challengeText.textContent = state.challenge.active && !state.challenge.answered
      ? "The rhythm name is hidden. Choose the best answer."
      : "Start a hidden case and try to identify the rhythm.";

    choiceGrid.textContent = "";
    for (const rhythmId of RHYTHM_ORDER) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = RHYTHMS[rhythmId].label;
      button.disabled = !state.challenge.active || state.challenge.answered;
      button.addEventListener("click", () => answerCase(rhythmId));
      choiceGrid.append(button);
    }
  }

  function render() {
    renderButtons();
    renderInfo();
    renderSliders();
    renderChallenge();
    draw();
  }

  function setRhythm(rhythmId, keepChallenge) {
    state.rhythmId = rhythmId;
    if (!keepChallenge && FLAGS.challenge) {
      state.challenge.active = false;
      state.challenge.answered = false;
      state.challenge.target = null;
      feedback.textContent = "";
    }
    resetEvents();
    render();
  }

  function startCase() {
    const index = Math.floor(Math.random() * RHYTHM_ORDER.length);
    const rhythmId = RHYTHM_ORDER[index];
    state.challenge.active = true;
    state.challenge.answered = false;
    state.challenge.target = rhythmId;
    feedback.textContent = "";
    setRhythm(rhythmId, true);
  }

  function answerCase(rhythmId) {
    if (!FLAGS.challenge || !state.challenge.active || state.challenge.answered) {
      return;
    }
    state.challenge.answered = true;
    state.challenge.total += 1;
    if (rhythmId === state.challenge.target) {
      state.challenge.correct += 1;
      feedback.textContent = "Correct. " + RHYTHMS[state.challenge.target].clues[0];
    } else {
      feedback.textContent = "Not quite. This was " + RHYTHMS[state.challenge.target].label + ".";
    }
    render();
  }

  function revealCase() {
    if (!FLAGS.challenge || !state.challenge.active || state.challenge.answered) {
      return;
    }
    state.challenge.answered = true;
    feedback.textContent = "Revealed: " + RHYTHMS[state.challenge.target].label + ".";
    render();
  }

  function animate(frameTime) {
    if (!state.lastFrame) {
      state.lastFrame = frameTime;
    }
    const elapsed = Math.min(0.06, (frameTime - state.lastFrame) / 1000);
    state.lastFrame = frameTime;
    state.time += elapsed;
    refillEvents();
    draw();
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resizeCanvas);
  if (FLAGS.sliders) {
    sweepSlider.addEventListener("input", () => {
      state.sweepSeconds = Number(sweepSlider.value);
      resetEvents();
      render();
    });
    gainSlider.addEventListener("input", () => {
      state.gain = Number(gainSlider.value);
      render();
    });
    artifactSlider.addEventListener("input", () => {
      state.artifact = Number(artifactSlider.value);
      render();
    });
  }
  if (FLAGS.challenge) {
    startCaseButton.addEventListener("click", startCase);
    revealButton.addEventListener("click", revealCase);
  }

  resizeCanvas();
  resetEvents();
  render();
  requestAnimationFrame(animate);
})();
