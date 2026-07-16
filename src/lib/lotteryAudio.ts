/** Lottery game audio — tick and reveal sounds using Web Audio API */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function unlockAudio() {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
}

/** Short tick beep played on each countdown second */
export function playTick(isLast = false) {
  try {
    unlockAudio();
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.frequency.value = isLast ? 880 : 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.09);
  } catch { /* ignore */ }
}

/** Win fanfare */
export function playWin() {
  try {
    unlockAudio();
    const c = getCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = c.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  } catch { /* ignore */ }
}

/** Lose sound */
export function playLose() {
  try {
    unlockAudio();
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.frequency.value = 200;
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.41);
  } catch { /* ignore */ }
}

/** Button click sound */
export function playClick() {
  try {
    unlockAudio();
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.frequency.value = 600;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.06);
  } catch { /* ignore */ }
}

document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });
