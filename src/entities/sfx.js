// src/entities/sfx.js — tiny WebAudio synth, no asset files
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { try { ac(); } catch { /* ignore */ } }

export function scream() {
  const c = ac(), t = c.currentTime;

  const o = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.Q.value = 5;
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(430, t);
  o.frequency.exponentialRampToValueAtTime(72, t + 0.9);
  f.frequency.setValueAtTime(1300, t);
  f.frequency.exponentialRampToValueAtTime(280, t + 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.30, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(f).connect(g).connect(c.destination);
  o.start(t); o.stop(t + 1.2);

  const len = Math.floor(c.sampleRate * 1.0);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const n = c.createBufferSource(); n.buffer = buf;
  const ng = c.createGain(); ng.gain.value = 0.16;
  n.connect(ng).connect(c.destination); n.start(t);
}

export function doorCreak() {
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(160, t);
  o.frequency.linearRampToValueAtTime(95, t + 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + 0.65);
}

export function screech() {
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 900;
  o.type = 'square';
  o.frequency.setValueAtTime(2100, t);
  o.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(f).connect(g).connect(c.destination);
  o.start(t); o.stop(t + 0.5);
}

export function thud() {
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + 0.4);
}
