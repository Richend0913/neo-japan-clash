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
    // 強：低く太く長い（弱＝高く短い、との差をはっきり付ける）
    swingH: () => { noise(0.2, 0.34, 520, 0.7); tone('sawtooth', 150, 55, 0.2, 0.2); },
    heavy: () => { noise(0.26, 0.9, 320, 0.6); noise(0.07, 0.5, 1600, 0.8); tone('sine', 120, 30, 0.38, 1.0); tone('square', 70, 32, 0.22, 0.32); tone('sawtooth', 55, 28, 0.3, 0.22, 0.03); },
    rush: () => { noise(0.16, 0.2, 1100, 0.5); tone('sine', 300, 520, 0.12, 0.1); },
    land: () => { noise(0.07, 0.3, 260, 0.7); tone('sine', 110, 50, 0.09, 0.4); },
    landH: () => { noise(0.14, 0.5, 180, 0.6); tone('sine', 85, 34, 0.2, 0.7); },
    block: () => { noise(0.05, 0.4, 3200, 2); tone('triangle', 900, 600, 0.06, 0.25); },
    special: () => { tone('sawtooth', 220, 1320, 0.32, 0.26); tone('square', 440, 1760, 0.3, 0.12, 0.05); noise(0.3, 0.2, 2600, 1.5); },
    shot: () => { tone('square', 1200, 300, 0.16, 0.2); },
    warp: () => { tone('sine', 1600, 200, 0.14, 0.25); },
    dash: () => noise(0.1, 0.2, 700, 0.6),
    go: () => { tone('square', 523, 523, 0.1, 0.2); tone('square', 784, 784, 0.22, 0.22, 0.1); },
    ko: () => { tone('sawtooth', 330, 55, 0.7, 0.4); noise(0.5, 0.5, 300, 0.5); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.16, 0.2, i * 0.12)); },
// BRIEF7 ため技：段階が上がるたびにピッチが上がる短い音、Lv3 を放つ音、Lv3 が当たった重い音
    chg1: () => tone('triangle', 520, 780, 0.09, 0.2),
    chg2: () => { tone('triangle', 700, 1050, 0.1, 0.22); tone('sine', 1400, 1400, 0.06, 0.08, 0.05); },
    chg3: () => { tone('triangle', 940, 1570, 0.14, 0.26); tone('square', 1570, 1570, 0.1, 0.1, 0.1); noise(0.12, 0.14, 3200, 2); },
    chgMax: () => { tone('sawtooth', 180, 900, 0.18, 0.22); noise(0.2, 0.3, 700, 0.6); },
    chgHit: () => { noise(0.4, 0.8, 200, 0.5); tone('sine', 90, 24, 0.55, 1.0); tone('square', 50, 25, 0.3, 0.3, 0.04); },
    unlock: () => { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.2, 0.3, i * 0.09)); },
  };
  N.Audio = {
    unlock: ensure,
    play(name) { if (muted || !S[name]) return; if (!ensure()) return; try { S[name](); } catch (e) { /* 音が出せなくても続行 */ } },
    setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 0.5; },
    get muted() { return muted; },
  };
})();
