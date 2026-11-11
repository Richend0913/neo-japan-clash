// NEO JAPAN CLASH — WebAudio 効果音（外部素材なし・すべて合成）
(function () {
  'use strict';
  const N = window.NJC;
  let ac = null, master = null, noiseBuf = null, muted = false;
  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function tone(type, f0, f1, dur, vol, delay) {
    const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, delay) {
    const t = ac.currentTime + (delay || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  const S = {
    move: () => tone('square', 660, 660, 0.04, 0.12),
    ok: () => { tone('square', 660, 990, 0.08, 0.18); tone('square', 990, 1320, 0.1, 0.16, 0.07); },
    back: () => tone('square', 440, 220, 0.1, 0.16),
    ng: () => { tone('sawtooth', 160, 120, 0.14, 0.2); },
    swing: () => noise(0.09, 0.22, 1800, 0.8),
    hit: () => { noise(0.08, 0.6, 900, 0.7); tone('sine', 190, 60, 0.12, 0.6); },
    heavy: () => { noise(0.18, 0.8, 500, 0.6); tone('sine', 150, 38, 0.26, 0.9); tone('square', 90, 40, 0.14, 0.25); },
    block: () => { noise(0.05, 0.4, 3200, 2); tone('triangle', 900, 600, 0.06, 0.25); },
    special: () => { tone('sawtooth', 220, 1320, 0.32, 0.26); tone('square', 440, 1760, 0.3, 0.12, 0.05); noise(0.3, 0.2, 2600, 1.5); },
    shot: () => { tone('square', 1200, 300, 0.16, 0.2); },
    warp: () => { tone('sine', 1600, 200, 0.14, 0.25); },
    dash: () => noise(0.1, 0.2, 700, 0.6),
    go: () => { tone('square', 523, 523, 0.1, 0.2); tone('square', 784, 784, 0.22, 0.22, 0.1); },
    ko: () => { tone('sawtooth', 330, 55, 0.7, 0.4); noise(0.5, 0.5, 300, 0.5); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.16, 0.2, i * 0.12)); },
    unlock: () => { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.2, 0.3, i * 0.09)); },
  };
  N.Audio = {
    unlock: ensure,
    play(name) { if (muted || !S[name]) return; if (!ensure()) return; try { S[name](); } catch (e) { /* 音が出せなくても続行 */ } },
    setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 0.5; },
    get muted() { return muted; },
  };
})();
