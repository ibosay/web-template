let audioContext;

const context = () => {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  try {
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContext();
    return audioContext;
  } catch (e) {
    return null;
  }
};

const tone = (frequency, duration, volume = 0.045, delay = 0) => {
  const ctx = context();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      const resumeResult = ctx.resume();
      if (resumeResult && typeof resumeResult.catch === 'function') resumeResult.catch(() => {});
    }
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch (e) {
    // Audio feedback is optional and must never interrupt gameplay.
  }
};

export const playQuizSound = (type, enabled = true) => {
  if (!enabled) return;
  if (type === 'correct') {
    tone(660, 0.12);
    tone(880, 0.16, 0.04, 0.1);
  } else if (type === 'incorrect' || type === 'timeout') {
    tone(220, 0.2);
    tone(165, 0.2, 0.035, 0.12);
  } else if (type === 'tap') {
    tone(440, 0.06, 0.025);
  }
};
