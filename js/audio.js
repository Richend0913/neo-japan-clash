// NEO JAPAN CLASH — WebAudio 効果音・BGM（外部素材なし・すべて合成）＋キャラボイス（assets/voice/*.mp3。VOICEVOX で生成）
(function () {
  'use strict';
  const N = window.NJC;
  const VER = ((document.currentScript && /\?v=\w+/.exec(document.currentScript.src)) || [''])[0]; // ボイスの取得にも index.html と同じ stamp を付ける
  // 音量の配分：master 0.5 の下に SE（直結）・BGM（控えめ）・ボイス
  const MASTER_VOL = 0.5, BGM_VOL = 0.30, VOICE_VOL = 1.1;
  let ac = null, master = null, bgmBus = null, voiceBus = null, noiseBuf = null, muted = false;
  function mkNoise(ctx) { const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function build(ctx, vol) {
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    bgmBus = ctx.createGain(); bgmBus.gain.value = BGM_VOL; bgmBus.connect(master);
    voiceBus = ctx.createGain(); voiceBus.gain.value = VOICE_VOL; voiceBus.connect(master);
    noiseBuf = mkNoise(ctx);
  }
  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }
    build(ac, muted ? 0 : MASTER_VOL);
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
  // ================= BGM（BRIEF14）：ステップシーケンサ =================
  // 1ステップ = 16分音符、1小節 = 16ステップ。各パートは小節ごとの文字列の配列（曲の小節数に足りなければ頭から繰り返す）。
  //   メロディ系：「音名/長さ」を空白区切りで並べる（例 a4/2 = ラ4 を2ステップ。./4 = 4ステップ休み。c4+e4+g4/16 = 和音）。合計が 16 にならない小節は読み込み時に例外にする
  //   ドラム：16文字。x = 鳴らす ／ - = 弱く ／ o = 強く（ハットは開く） ／ . = 休み
  const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function noteHz(n) {
    let i = 1, k = SEMI[n[0]];
    if (n[1] === '#') { k++; i++; } else if (n[1] === 'b') { k--; i++; }
    const oct = +n.slice(i); if (k == null || !(oct >= 0)) throw new Error('BGM: 音名が読めません ' + n);
    return 440 * Math.pow(2, (k - 9 + (oct - 4) * 12) / 12);
  }
  function parseBar(str, who) {
    const bar = new Array(16).fill(null); let p = 0;
    for (const tok of str.trim().split(/\s+/)) {
      const m = /^([^/]+)(?:\/(\d+))?$/.exec(tok), len = m && m[2] ? +m[2] : 1;
      if (!m || p + len > 16) throw new Error('BGM: 小節が 16 ステップを超えます ' + who + ' "' + str + '"');
      if (m[1] !== '.') bar[p] = { f: m[1].split('+').map(noteHz), len };
      p += len;
    }
    if (p !== 16) throw new Error('BGM: 小節が 16 ステップになりません ' + who + ' "' + str + '"');
    return bar;
  }
  const rep = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push(...a); return o; };
  // コードごとの定型（ベース・アルペジオ）を作る小道具
  const perRoot = (roots, fn) => roots.map(fn);
  const TRACK_SRC = {
    // タイトル／メニュー：neon の親戚（同じイ短調）。遅めのテンポ・厚いパッド・ハーフタイムのドラムで少し荘厳に
    title: { name: 'タイトル', bpm: 96, bars: 8, key: 'A minor（自然短音階＋終止の E で G#）', prog: 'Am | F | C | G | Am | F | Dm | E',
      parts: [
        { inst: 'pad', vol: 0.085, seq: ['a2+e3+a3+c4/16', 'f2+c3+f3+a3/16', 'c3+g3+c4+e4/16', 'g2+d3+g3+b3/16', 'a2+e3+a3+c4/16', 'f2+c3+f3+a3/16', 'd3+a3+d4+f4/16', 'e3+b3+e4+g#4/16'] },
        { inst: 'bass', vol: 0.2, seq: perRoot(['a1', 'f1', 'c2', 'g1', 'a1', 'f1', 'd2', 'e2'], r => `${r}/6 ${r}/2 ${r.slice(0, -1)}${+r.slice(-1) + 1}/4 ${r}/4`) },
        { inst: 'bell', vol: 0.1, seq: ['a4/8 e5/8', 'f5/6 e5/2 c5/8', 'e5/8 g5/8', 'd5/12 b4/4', 'a4/8 e5/8', 'f5/6 g5/2 a5/8', 'f5/8 d5/8', 'e5/12 ./4'] },
        { inst: 'pluck', vol: 0.055, seq: ['a3/2 e4/2 a4/2 e4/2 c4/2 e4/2 a4/2 e4/2', 'f3/2 c4/2 f4/2 c4/2 a3/2 c4/2 f4/2 c4/2', 'c4/2 g4/2 c5/2 g4/2 e4/2 g4/2 c5/2 g4/2', 'g3/2 d4/2 g4/2 d4/2 b3/2 d4/2 g4/2 d4/2',
          'a3/2 e4/2 a4/2 e4/2 c4/2 e4/2 a4/2 e4/2', 'f3/2 c4/2 f4/2 c4/2 a3/2 c4/2 f4/2 c4/2', 'd4/2 a4/2 d5/2 a4/2 f4/2 a4/2 d5/2 a4/2', 'e4/2 b4/2 e5/2 b4/2 g#4/2 b4/2 e5/2 b4/2'] },
      ],
      drums: { kick: ['x.........x.....'], snare: ['........x.......', '........x.....x.'], hat: ['..-...-...-...-.'] }, dv: { kick: 0.5, snare: 0.16, hat: 0.05 } },
    // ネオン神社：ダークなシンセウェーブ。4つ打ち＋8分のオクターブベースで推進力を出す
    neon: { name: 'ネオン神社', bpm: 118, bars: 8, key: 'A minor（自然短音階＋終止の E で G#）', prog: 'Am | Am | F | G | Am | Am | F | E',
      parts: [
        { inst: 'bass', vol: 0.21, seq: perRoot(['a', 'a', 'f', 'g', 'a', 'a', 'f', 'e'], r => `${r}1/2 ${r}1/2 ${r}2/2 ${r}1/2 ${r}1/2 ${r}1/2 ${r}2/2 ${r}1/2`) },
        { inst: 'pluck', vol: 0.06, seq: ['a3 e4 a4 e4 c4 e4 a4 e4 a3 e4 a4 e4 c4 e4 a4 e4', 'a3 e4 a4 e4 c4 e4 a4 e4 a3 e4 a4 e4 c4 e4 b4 e4', 'f3 c4 f4 c4 a3 c4 f4 c4 f3 c4 f4 c4 a3 c4 f4 c4', 'g3 d4 g4 d4 b3 d4 g4 d4 g3 d4 g4 d4 b3 d4 g4 d4',
          'a3 e4 a4 e4 c4 e4 a4 e4 a3 e4 a4 e4 c4 e4 a4 e4', 'a3 e4 a4 e4 c4 e4 a4 e4 a3 e4 a4 e4 c4 e4 b4 e4', 'f3 c4 f4 c4 a3 c4 f4 c4 f3 c4 f4 c4 a3 c4 f4 c4', 'e3 b3 e4 b3 g#3 b3 e4 b3 e3 b3 e4 b3 g#3 b3 e4 b3'] },
        { inst: 'pad', vol: 0.05, seq: ['a3+c4+e4/16', 'a3+c4+e4/16', 'f3+a3+c4/16', 'g3+b3+d4/16', 'a3+c4+e4/16', 'a3+c4+e4/16', 'f3+a3+c4/16', 'e3+g#3+b3/16'] },
        { inst: 'lead', vol: 0.075, seq: ['./16', './16', './16', './8 b4/2 c5/2 d5/4', 'e5/6 d5/2 c5/4 a4/4', 'c5/6 b4/2 a4/8', 'a4/4 c5/4 f5/6 e5/2', 'e5/8 g#4/4 b4/4'] },
      ],
      drums: { kick: ['x...x...x...x...'], snare: ['....x.......x...', '....x.......x.-.'], hat: ['-.x.-.x.-.x.-.x.', '-.x.-.x.-.x.-.o.'] }, dv: { kick: 0.55, snare: 0.2, hat: 0.07 } },
    // 竹林の決闘場：都節音階（D Eb G A Bb）の琴風プラック。休符を多く取り、間を活かす。打楽器は太鼓がわりの低い一打とごく弱い拍子木だけ
    bamboo: { name: '竹林の決闘場', bpm: 84, bars: 8, key: 'D 都節音階（D Eb G A Bb の五音）', prog: 'D の持続（低音 D・G・A）',
      parts: [
        { inst: 'koto', vol: 0.2, seq: ['d4/2 ./2 a4/2 bb4/2 a4/4 ./4', 'g4/2 a4/2 d5/4 ./8', 'eb5/2 d5/2 bb4/2 a4/2 g4/4 ./4', 'a4/6 ./2 d4/4 ./4',
          'd5/2 ./2 eb5 d5 bb4/2 a4/4 ./4', 'g4/2 bb4/2 a4/4 d4/4 ./4', 'a4/2 d5/2 eb5/4 d5/2 bb4/2 a4/4', 'd4/8 ./8'] },
        { inst: 'sub', vol: 0.2, seq: ['d2/6 ./6 a2/4', 'd2/6 ./10', 'g2/6 ./6 d2/4', 'd2/6 ./10', 'd2/6 ./6 a2/4', 'g2/6 ./10', 'a2/6 ./6 a2/4', 'd2/8 ./8'] },
        { inst: 'flute', vol: 0.06, seq: ['./16', './16', './16', './8 d5/8', 'a5/12 ./4', './16', './16', 'bb5/4 a5/8 ./4'] },
      ],
      drums: { kick: ['x...............', 'x.........x.x...'], hat: ['........-.......', '....-.......-...'] }, dv: { kick: 0.42, snare: 0, hat: 0.04 } },
    // 雪の城下町：遅いテンポ・長いパッド・鐘の音をぽつぽつ。ドラムはほぼ無し（2小節に一度のごく弱い低音）
    snow: { name: '雪の城下町', bpm: 66, bars: 8, key: 'E minor（自然短音階）', prog: 'Em9 | Cmaj7 | G | D | Em9 | Cmaj7 | G | D',
      parts: [
        { inst: 'pad', vol: 0.1, seq: ['e3+g3+b3+d4/16', 'c3+e3+g3+b3/16', 'g3+b3+d4/16', 'd3+f#3+a3/16'] },
        { inst: 'sub', vol: 0.17, seq: ['e2/16', 'c2/16', 'g1/16', 'd2/16'] },
        { inst: 'bell', vol: 0.11, seq: ['b4/8 e5/8', './4 g5/12', 'd5/8 b4/8', './8 a4/8', 'b4/8 f#5/8', 'e5/12 ./4', 'd5/8 g5/8', 'f#5/16'] },
      ],
      drums: { kick: ['x...............', '................'], hat: ['................', '........-.......'] }, dv: { kick: 0.22, snare: 0, hat: 0.03 } },
    // 空のアリーナ：明るいハ長調の16分アルペジオ。跳ねるベースと軽いドラムで軽快に
    sky: { name: '空のアリーナ', bpm: 132, bars: 8, key: 'C major', prog: 'C | G | Am | F | C | G | F | G',
      parts: [
        { inst: 'pluck', vol: 0.085, seq: (() => { const C = rep(['c4 e4 g4 c5 e5 c5 g4 e4'], 2).join(' '), G = rep(['b3 d4 g4 b4 d5 b4 g4 d4'], 2).join(' '), A = rep(['a3 c4 e4 a4 c5 a4 e4 c4'], 2).join(' '), F = rep(['a3 c4 f4 a4 c5 a4 f4 c4'], 2).join(' '); return [C, G, A, F, C, G, F, G]; })() },
        { inst: 'bass', vol: 0.17, seq: perRoot(['c', 'g', 'a', 'f', 'c', 'g', 'f', 'g'], r => { const lo = r === 'c' ? 2 : 1; return `${r}${lo}/3 ./1 ${r}${lo}/2 ${r}${lo + 1}/2 ./2 ${r}${lo}/2 ${r}${lo + 1}/2 ${r}${lo}/2`; }) },
        { inst: 'lead', vol: 0.07, seq: ['g5/4 e5/2 c5/2 g5/4 ./4', 'd5/4 b4/2 d5/2 g5/8', 'e5/4 c5/2 a4/2 e5/6 d5/2', 'c5/6 a4/2 f5/8', 'g5/2 c6/6 b5/2 g5/2 e5/4', 'd5/4 g5/4 b5/8', 'a5/4 f5/4 c5/4 a5/4', 'g5/8 b5/4 d6/4'] },
        { inst: 'pad', vol: 0.04, seq: ['c4+e4+g4/16', 'b3+d4+g4/16', 'a3+c4+e4/16', 'a3+c4+f4/16', 'c4+e4+g4/16', 'b3+d4+g4/16', 'a3+c4+f4/16', 'b3+d4+g4/16'] },
      ],
      drums: { kick: ['x.......x.x.....'], snare: ['....x.......x...'], hat: ['x.-.x.-.x.-.x.-.'] }, dv: { kick: 0.42, snare: 0.15, hat: 0.055 } },
  };
  const TRACKS = {};
  for (const id of Object.keys(TRACK_SRC)) {
    const t = TRACK_SRC[id], D = t.drums || {};
    for (const k of Object.keys(D)) D[k].forEach(q => { if (q.length !== 16) throw new Error('BGM: ドラムの小節が 16 文字ではありません ' + id + '.' + k); });
    TRACKS[id] = { id, bpm: t.bpm, bars: t.bars, step: 60 / t.bpm / 4, drums: D, dv: t.dv || {}, parts: t.parts.map(p => ({ inst: p.inst, vol: p.vol, bars: p.seq.map(q => parseBar(q, id + '.' + p.inst)) })) };
  }
  // ---- 楽器（t = 開始時刻、f = 周波数、d = 長さ（秒）、v = 音量、out = 出力先） ----
  function gn(out) { const g = ac.createGain(); g.connect(out); return g; }
  function lp(freq, q, out) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7; f.connect(out); return f; }
  function osc(type, f, t, stop, out, det) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det; o.connect(out); o.start(t); o.stop(stop); return o; }
  // 立ち上がり a 秒 → 保持 → 終わりの r 秒で消える
  function hold(g, t, v, d, a, r) { d = Math.max(d, a + r + 0.01); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + d - r); g.gain.linearRampToValueAtTime(0, t + d); return t + d + 0.02; }
  // 弾いた音：すぐ立ち上がって dec 秒で減衰（音符の長さには依らない）
  function pick(g, t, v, dec) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dec); return t + dec + 0.02; }
  const INST = {
    bass(t, f, d, v, out) { const g = gn(lp(480, 3, out)), e = hold(g, t, v, d * 0.9, 0.005, Math.min(0.06, d / 3)); osc('sawtooth', f, t, e, g); const s = gn(g); s.gain.value = 0.7; osc('sine', f, t, e, s); },
    sub(t, f, d, v, out) { const g = gn(out), e = hold(g, t, v, d, 0.03, Math.min(0.25, d / 3)); osc('sine', f, t, e, g); const s = gn(g); s.gain.value = 0.25; osc('triangle', f * 2, t, e, s); },
    pluck(t, f, d, v, out) { const g = gn(lp(3200, 0.7, out)), e = pick(g, t, v, 0.32); osc('triangle', f, t, e, g); const s = gn(g); s.gain.value = 0.22; osc('square', f * 2, t, e, s); },
    koto(t, f, d, v, out) { // 琴：明るい立ち上がりからフィルタが閉じていく。弾いた瞬間だけ音程がわずかに高い
      const fl = lp(4200, 2, out); fl.frequency.setValueAtTime(4200, t); fl.frequency.exponentialRampToValueAtTime(700, t + 0.3);
      const g = gn(fl), e = pick(g, t, v, 1.1), o = osc('sawtooth', f * 1.014, t, e, g); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const s = gn(g); s.gain.value = 0.5; osc('triangle', f, t, e, s);
    },
    lead(t, f, d, v, out) { const g = gn(lp(2600, 0.7, out)), e = hold(g, t, v, d * 0.95, 0.012, Math.min(0.08, d / 3)); osc('square', f, t, e, g); osc('square', f, t, e, g, 8); },
    flute(t, f, d, v, out) { // 尺八がわり：ゆっくり立ち上がるサイン波に、遅いビブラート
      const g = gn(out), e = hold(g, t, v, d, 0.14, Math.min(0.3, d / 3)), o = osc('sine', f, t, e, g), l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = 5; lg.gain.value = f * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(e);
      const s = gn(g); s.gain.value = 0.18; osc('triangle', f * 2, t, e, s);
    },
    pad(t, f, d, v, out) { const g = gn(lp(1100, 0.5, out)), a = Math.min(0.5, d * 0.3), e = hold(g, t, v, d + 0.5, a, 0.6); osc('sawtooth', f, t, e, g, -7); osc('sawtooth', f, t, e, g, 7); },
    bell(t, f, d, v, out) { const g = gn(out), e = pick(g, t, v, 2.0); osc('sine', f, t, e, g); const s = gn(g); s.gain.value = 0.3; osc('sine', f * 2.76, t, t + 0.5, s); const u = gn(g); u.gain.value = 0.5; osc('sine', f * 2, t, e, u); },
  };
  function nz(t, dur, v, type, freq, q, out) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = gn(out);
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); s.start(t, Math.random() * 0.25); s.stop(t + dur + 0.02);
  }
  const DRUM = {
    kick(t, v, out) { const g = gn(out), o = osc('sine', 150, t, t + 0.26, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24); },
    snare(t, v, out) { nz(t, 0.13, v, 'bandpass', 1900, 0.8, out); const g = gn(out), o = osc('triangle', 190, t, t + 0.1, g); o.frequency.exponentialRampToValueAtTime(120, t + 0.08); g.gain.setValueAtTime(v * 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09); },
    hat(t, v, out, open) { nz(t, open ? 0.16 : 0.035, v, 'highpass', 7500, 0.7, out); },
  };
  const DRUM_LV = { x: 1, '-': 0.5, o: 1.25 };
  function schedStep(tr, n, t, out) {
    const bar = Math.floor(n / 16), st = n % 16;
    for (const p of tr.parts) { const e = p.bars[bar % p.bars.length][st]; if (e) for (const f of e.f) INST[p.inst](t, f, e.len * tr.step, p.vol, out); }
    for (const k of Object.keys(tr.drums)) { const pat = tr.drums[k], ch = pat[bar % pat.length][st], lv = DRUM_LV[ch]; if (lv && tr.dv[k]) DRUM[k](t, tr.dv[k] * lv, out, ch === 'o'); }
  }
  // ---- 再生の管理：want = 画面が望む曲、cur = いま鳴らしている曲。最初のユーザー操作（unlock）までは鳴らさない ----
  const FADE = 0.35, AHEAD = 0.2, bgm = { want: null, cur: null, gestured: false, timer: 0, starts: 0 };
  function fadeOut(c) { const t = ac.currentTime, g = c.g.gain; try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + FADE); } catch (e) { g.value = 0; } setTimeout(() => { try { c.g.disconnect(); } catch (e) { /* もう外れている */ } }, 1800); }
  function pump() {
    const c = bgm.cur; if (!c || !ac) return;
    if (c.next < ac.currentTime - 0.25) c.next = ac.currentTime + 0.05; // タイマーが止まっていた（裏に回っていた等）：たまった分は鳴らさず、いまから続ける
    while (c.next < ac.currentTime + AHEAD) { try { schedStep(c.tr, c.step, c.next, c.g); } catch (e) { /* 1音出せなくても続行 */ } c.step = (c.step + 1) % (c.tr.bars * 16); c.next += c.tr.step; }
  }
  function syncBgm() {
    const should = bgm.gestured && !muted && !document.hidden && TRACKS[bgm.want] ? bgm.want : null;
    if (bgm.cur && bgm.cur.id !== should) { fadeOut(bgm.cur); bgm.cur = null; }
    if (should && !bgm.cur && ensure()) {
      const g = ac.createGain(), t = ac.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + FADE); g.connect(bgmBus);
      bgm.cur = { id: should, tr: TRACKS[should], g, step: 0, next: t + 0.08 }; bgm.starts++; pump();
    }
    if (bgm.cur && !bgm.timer) bgm.timer = setInterval(pump, 40);
    else if (!bgm.cur && bgm.timer) { clearInterval(bgm.timer); bgm.timer = 0; }
  }
  document.addEventListener('visibilitychange', syncBgm);

  // ================= キャラボイス（BRIEF14） =================
  // 優先度：special > ko（＝ win）> hurt > atk。同じキャラが喋っている間は、優先度の低い声を落とす（同じか高ければ前の声を切って差し替える）。別キャラの声は重なってよい
  const V_KINDS = ['atk_l', 'atk_h', 'special', 'hurt', 'ko', 'win'], V_PRI = { special: 4, ko: 3, win: 3, hurt: 2, atk_h: 1, atk_l: 1 };
  const V_GAP = { atk: 250, hurt: 300 }, ATK_L_RATE = 0.7; // 同一キャラの間隔制限（ms）と、弱攻撃の声を出す確率
  const vo = { buf: {}, req: {}, cur: {}, last: {}, played: 0, lastPlay: null, dropped: 0 };
  function voicePreload(ids) {
    if (!ensure() || !window.fetch) return;
    for (const id of ids) for (const k of V_KINDS) {
      const key = id + '_' + k; if (vo.req[key]) continue; vo.req[key] = 1;
      fetch('assets/voice/' + key + '.mp3' + VER).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
        .then(ab => new Promise((res, rej) => ac.decodeAudioData(ab, res, rej))).then(b => { vo.buf[key] = b; }).catch(() => { vo.req[key] = 0; }); // 失敗したら次の対戦でもう一度試す（声が無くてもゲームは続く）
    }
  }
  function voiceCut(c, t) { try { c.g.gain.setTargetAtTime(0, t, 0.012); c.src.stop(t + 0.07); } catch (e) { /* 既に止まっている */ } }
  function voice(id, kind) {
    const pri = V_PRI[kind], b = vo.buf[id + '_' + kind];
    if (muted || !pri || !b || !ensure()) return false;
    const now = performance.now(), lk = pri === 1 ? 'atk' : kind, gap = V_GAP[lk], lkey = id + ':' + lk;
    if (gap && now - (vo.last[lkey] || -1e9) < gap) return false;
    if (kind === 'atk_l' && Math.random() >= ATK_L_RATE) return false;
    const t = ac.currentTime, c = vo.cur[id];
    if (c && c.end > t) { if (c.pri > pri) { vo.dropped++; return false; } voiceCut(c, t); }
    const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = b; src.connect(g); g.connect(voiceBus); src.start(t);
    vo.cur[id] = { pri, kind, end: t + b.duration, src, g }; vo.last[lkey] = now; vo.played++; vo.lastPlay = { id, kind };
    return true;
  }
  function voiceStop() { if (!ac) return; const t = ac.currentTime; for (const id of Object.keys(vo.cur)) { voiceCut(vo.cur[id], t); delete vo.cur[id]; } }
  // ---- 確認用：実時間を待たずに音を書き出す（OfflineAudioContext）。音量の測定と試聴ファイル作りに使う。ゲーム進行には使わない ----
  function render(sec, fill) {
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 44100, oc = new OC(1, Math.ceil(sr * sec), sr), sav = [ac, master, bgmBus, voiceBus, noiseBuf];
    try { ac = oc; build(oc, MASTER_VOL); fill(); } finally { [ac, master, bgmBus, voiceBus, noiseBuf] = sav; }
    return oc.startRendering().then(b => b.getChannelData(0));
  }
  const VOICE_CREDITS = ['青山龍星', '雨晴はう', '黒沢冴白', '麒ヶ島宗麟', '九州そら', '玄野武宏', '後鬼', '四国めたん', '波音リツ', 'Voidoll', '剣崎雌雄', '離途', 'No.7']; // 使用した話者（tools/gen-voices.py の SPEAKERS と同じ。重複なし）

  N.Audio = {
    unlock() { const ok = ensure(); bgm.gestured = true; syncBgm(); return ok; },
    play(name) { if (muted || !S[name]) return; if (!ensure()) return; try { S[name](); } catch (e) { /* 音が出せなくても続行 */ } },
    setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : MASTER_VOL; if (muted) voiceStop(); syncBgm(); },
    get muted() { return muted; },
    // BGM：画面が望む曲 id を伝える（同じ id なら何もしない。null で止める）
    bgm(id) { id = TRACKS[id] ? id : null; if (id !== bgm.want) { bgm.want = id; syncBgm(); } },
    get bgmState() { const c = bgm.cur; return { id: c ? c.id : null, want: bgm.want, playing: !!c && !!ac && ac.state === 'running', step: c ? c.step : 0, starts: bgm.starts, ctx: ac ? ac.state : 'none' }; },
    bgmTracks: Object.keys(TRACKS), bgmInfo: id => { const t = TRACK_SRC[id]; return t && { name: t.name, bpm: t.bpm, bars: t.bars, key: t.key, prog: t.prog, parts: t.parts.map(p => p.inst), drums: Object.keys(t.drums || {}) }; },
    voicePreload, voice, VOICE_KINDS: V_KINDS, VOICE_CREDITS,
    get voiceState() { const t = ac ? ac.currentTime : 0; return { loaded: Object.keys(vo.buf).length, active: Object.keys(vo.cur).filter(id => vo.cur[id].end > t).map(id => id + '_' + vo.cur[id].kind), played: vo.played, dropped: vo.dropped, last: vo.lastPlay }; },
    renderBgm: (id, sec) => render(sec, () => { const tr = TRACKS[id]; for (let n = 0, t = 0.05; t < sec; n++, t += tr.step) schedStep(tr, n % (tr.bars * 16), t, bgmBus); }),
    renderSe: (name, sec) => render(sec || 1, () => S[name]()),
  };
})();
