// NEO JAPAN CLASH — 描画（ステージ / ファイター / 飛び道具 / エフェクト / HUD）。
// ステージとキャラは assets/ の画像（スプライト）を使い、画像が無い・未ロードの間は canvas ベクター描画にフォールバックする
(function () {
  'use strict';
  const N = window.NJC, CHARS = N.CHARS, GY = N.GY;
  const W = 960, HH = 540, PI = Math.PI;
  const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif';
  const font = (px, it) => `${it ? 'italic ' : ''}900 ${px}px ${FONT}`;
  // shadowBlur は 1 回ごとにぼかし処理が走って重い。毎フレームの描画では使わず（GLOW=0 のとき glow は何もしない）、
  // 発光つきの絵（ネオン文字・ベクター背景）は一度だけオフスクリーンに描いてキャッシュし、以後は貼るだけにする。
  let GLOW = 0;
  const glow = (c, col, blur) => { if (GLOW) { c.shadowColor = col; c.shadowBlur = blur; } };
  const noGlow = c => { if (GLOW) { c.shadowBlur = 0; c.shadowColor = 'transparent'; } };
  // 表示倍率（論理 960x540 → 実ピクセル）。キャッシュは実ピクセル解像度で持つので、倍率が変わったら作り直す
  let SC = 1, CW = W, CHT = HH;
  const mkCv = (w, h) => { const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h)); return cv; };
  const MC = mkCv(4, 4).getContext('2d'); // 文字幅の計測用
  const TC = new Map(); // 文字などのスプライトキャッシュ
  function setScale(r, cw, ch) {
    if (r === SC && cw === CW && ch === CHT) return;
    SC = r; CW = cw; CHT = ch; stageKey = ''; dimKey = ''; TC.clear();
    for (const k in IMG) { IMG[k].sc = {}; IMG[k].scn = 0; }
    for (const k in GR) delete GR[k];
  }
  function sprite(key, build) {
    let e = TC.get(key);
    if (!e) { if (TC.size > 260) { let n = 0; for (const k of TC.keys()) { TC.delete(k); if (++n >= 90) break; } } e = build(); TC.set(key, e); }
    return e;
  }
  // 論理サイズ lw x lh のオフスクリーンに fn で描く（発光あり）
  function mkSprite(lw, lh, fn) {
    const cv = mkCv(lw * SC, lh * SC), x = cv.getContext('2d'); x.scale(SC, SC);
    const g0 = GLOW; GLOW = 1; fn(x); GLOW = g0;
    return { cv, lw: cv.width / SC, lh: cv.height / SC };
  }
  // キャッシュを論理座標 (x,y) に貼る。素の倍率のときは実ピクセルに合わせて等倍で貼る（にじみ防止・高速）
  function blit(c, e, x, y) {
    const m = c.getTransform();
    if (m.b === 0 && m.c === 0 && m.a === m.d && Math.abs(m.a - SC) < 1e-6) { c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(e.cv, Math.round(m.e + x * SC), Math.round(m.f + y * SC)); c.setTransform(m); }
    else c.drawImage(e.cv, x, y, e.lw, e.lh);
  }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ================= 画像アセット =================
  // スプライト素材（assets/sprites/<id>.webp と assets/portraits/<id>.webp）があるキャラの一覧。素材を追加したらここに id を足す。
  // 一覧に無いキャラは読み込みを試みず、ベクター描画のままになる（存在しない画像への 404 を出さないため）。
  // 体の中心（立ち位置の基準）は画像の不透明部分の重心から自動で決める。ずれるキャラは { ax: 0〜1 } で上書きできる。
  // ポーズ絵は <id>_atk（弱攻撃・必殺）/ <id>_hit（被弾・ダウン）/ <id>_grd（ガード）/ <id>_hev（強攻撃）。値は [待機, 攻撃, 被弾, ガード, 強攻撃] の体の中心の横位置（0〜1）。
  // 胴体の太い部分から事前に測った値で、ポーズを切り替えても体の位置が飛ばないようにする（武器やエフェクトの張り出しは無視）。
  const ART = {
    zanrai: [0.301, 0.467, 0.468, 0.46, 0.502], mikoto: [0.519, 0.444, 0.549, 0.579, 0.523], kagemaru: [0.366, 0.465, 0.446, 0.371, 0.518], gounen: [0.365, 0.407, 0.475, 0.44, 0.495],
    konko: [0.46, 0.336, 0.398, 0.473, 0.459], raidenzan: [0.427, 0.411, 0.341, 0.454, 0.537], shuki: [0.452, 0.48, 0.587, 0.468, 0.514], shion: [0.445, 0.372, 0.48, 0.437, 0.493],
    ougi: [0.532, 0.424, 0.483, 0.438, 0.555], nishiki: [0.244, 0.306, 0.43, 0.375, 0.515], kurotengu: [0.401, 0.489, 0.462, 0.409, 0.523], ryujin: [0.472, 0.468, 0.439, 0.489, 0.523],
    mumei: [0.445, 0.471, 0.517, 0.398, 0.417], kaguya: [0.492, 0.508, 0.578, 0.55, 0.463] };
  const POSES = ['atk', 'hit', 'grd', 'hev'];
  const IMG = {};
  function load(key, src, ax) { // 相対パス（GitHub Pages のサブパス配下でも動く）
    const im = new Image(), e = IMG[key] = { im, ok: false, bad: false, sc: {}, scn: 0 };
    if (ax != null) e.ax = ax;
    im.onload = () => { e.ok = im.naturalWidth > 0; }; im.onerror = () => { e.bad = true; };
    im.src = src; return e;
  }
  // 画像は必要になった時点で読み込む（起動時に全71枚・約6.5MBを先読みすると、回線の遅いスマホでは
  // タイトルが出る前に固まって見えるため）。読み込み前・読み込み中はベクター描画にフォールバックする。
  load('stage', 'assets/stage.webp');
  const REQ = {};
  function want(key, src, ax) { if (!REQ[key]) { REQ[key] = true; load(key, src, ax); } }
  function wantIdle(ci) { const id = CHARS[ci].id; if (ART[id]) want('s:' + id, `assets/sprites/${id}.webp`, ART[id][0]); }
  function wantPortrait(ci) { const id = CHARS[ci].id; if (ART[id]) want('p:' + id, `assets/portraits/${id}.webp`); }
  function wantPose(ci, ps) { const id = CHARS[ci].id, n = POSES.indexOf(ps); if (ART[id] && n >= 0) want('s:' + id + ':' + ps, `assets/sprites/${id}_${ps}.webp`, ART[id][n + 1]); }
  function preloadFighter(ci) { wantIdle(ci); wantPortrait(ci); POSES.forEach(ps => wantPose(ci, ps)); }
  function preloadPortraits() { CHARS.forEach((c, i) => wantPortrait(i)); }
  function preloadAll() { CHARS.forEach((c, i) => preloadFighter(i)); }
  const ready = key => { const e = IMG[key]; return e && e.ok ? e : null; };
  const spriteOf = ci => { wantIdle(ci); return ready('s:' + CHARS[ci].id); };
  const portraitOf = ci => { wantPortrait(ci); return ready('p:' + CHARS[ci].id); };
  const poseOf = (ci, ps) => { wantPose(ci, ps); return ready('s:' + CHARS[ci].id + ':' + ps); };
  // 不透明部分の重心の横位置（0〜1）。細い武器が長く突き出ていても胴体側に寄る
  function anchorX(e, id) {
    if (e.ax != null) return e.ax;
    let ax = null;
    if (ax == null) {
      ax = 0.45;
      try {
        const w = 48, h = 48, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const x = cv.getContext('2d'); x.drawImage(e.im, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h).data; let sum = 0, mom = 0;
        for (let i = 0; i < w * h; i++) { const a = d[i * 4 + 3]; sum += a; mom += a * ((i % w) + 0.5); }
        if (sum > 0) ax = mom / sum / w;
      } catch (err) { /* file:// など画素を読めない環境では既定値のまま */ }
    }
    return (e.ax = ax);
  }
  // 画像を表示する実ピクセルの高さ hpx に縮小したもの（毎フレーム 720px の原画を高品質縮小すると重いので一度だけ作る）。
  // col を渡すと、その形のまま単色で塗ったもの（被弾の白フラッシュ・ロック中の伏せ絵）
  function scaled(e, hpx, col) {
    hpx = Math.max(1, Math.round(hpx));
    const key = col ? hpx + col : hpx; let cv = e.sc[key];
    if (!cv) {
      const im = e.im, w = Math.max(1, Math.round(im.naturalWidth * hpx / im.naturalHeight));
      const base = col ? scaled(e, hpx) : null;
      if (++e.scn > 8) { e.sc = {}; e.scn = 1; }
      cv = mkCv(w, hpx); const x = cv.getContext('2d');
      if (col) { x.drawImage(base, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, w, hpx); }
      else { x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, w, hpx); }
      e.sc[key] = cv;
    }
    return cv;
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const assetState = () => ({ listed: Object.keys(ART).length, stage: !!ready('stage'), sprites: Object.keys(ART).filter(id => ready('s:' + id)), poses: Object.keys(ART).reduce((n, id) => n + POSES.filter(ps => ready('s:' + id + ':' + ps)).length, 0), portraits: Object.keys(ART).filter(id => ready('p:' + id)), failed: Object.keys(IMG).filter(k => IMG[k].bad) });

  // ================= ステージ =================
  let stageCv = null;
  const lanterns = [[92, 96], [168, 150], [246, 108], [716, 112], [792, 152], [868, 98], [40, 190], [920, 190]];
  function roofTier(c, cx, y, w, h, col, edge) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(cx - w / 2 - 14, y + 4); c.quadraticCurveTo(cx - w / 4, y - 2, cx - w / 3, y - h);
    c.lineTo(cx + w / 3, y - h); c.quadraticCurveTo(cx + w / 4, y - 2, cx + w / 2 + 14, y + 4); c.closePath(); c.fill();
    c.strokeStyle = edge; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - w / 2 - 14, y + 4); c.lineTo(cx + w / 2 + 14, y + 4); c.stroke();
  }
  function pagoda(c, cx, base, s, edge) {
    let y = base, w = 150 * s;
    for (let i = 0; i < 4; i++) {
      c.fillStyle = '#1a0b33'; c.fillRect(cx - w * 0.3, y - 46 * s, w * 0.6, 46 * s);
      c.fillStyle = 'rgba(255,170,90,.55)'; for (let k = -1; k <= 1; k++) c.fillRect(cx + k * w * 0.17 - 4, y - 34 * s, 8, 16 * s);
      roofTier(c, cx, y - 46 * s, w, 16 * s, '#241043', edge);
      y -= 62 * s; w *= 0.8;
    }
    c.strokeStyle = edge; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, y + 2); c.lineTo(cx, y - 30 * s); c.stroke();
  }
  function neonSign(c, x, y, w, h, text, col) {
    c.fillStyle = 'rgba(10,4,30,.85)'; c.fillRect(x, y, w, h);
    glow(c, col, 14); c.strokeStyle = col; c.lineWidth = 2.5; c.strokeRect(x, y, w, h);
    c.fillStyle = col; c.font = font(w * 0.62); c.textAlign = 'center'; c.textBaseline = 'middle';
    const n = text.length, stepY = (h - 8) / n;
    for (let i = 0; i < n; i++) c.fillText(text[i], x + w / 2, y + 4 + stepY * (i + 0.5));
    noGlow(c);
  }
  function buildStage() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = HH;
    const c = cv.getContext('2d'); seed = 11;
    const FL = GY - 40; // 床の上端
    let g = c.createLinearGradient(0, 0, 0, FL);
    g.addColorStop(0, '#07041c'); g.addColorStop(0.45, '#27104f'); g.addColorStop(0.8, '#6b1c7c'); g.addColorStop(1, '#d0408a');
    c.fillStyle = g; c.fillRect(0, 0, W, FL);
    // ホログラムの月
    glow(c, '#ff9df0', 40); c.fillStyle = 'rgba(255,214,245,.9)'; c.beginPath(); c.arc(480, 96, 46, 0, PI * 2); c.fill(); noGlow(c);
    c.strokeStyle = 'rgba(120,230,255,.55)'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(480, 96, 78, 16, -0.3, 0, PI * 2); c.stroke();
    // 遠景ビル群
    for (let layer = 0; layer < 2; layer++) {
      let x = -10;
      while (x < W) {
        const bw = 26 + rnd() * 46, bh = (layer ? 90 : 150) + rnd() * (layer ? 150 : 130);
        c.fillStyle = layer ? '#150a36' : '#22104a'; c.fillRect(x, FL - bh, bw, bh);
        for (let wy = FL - bh + 8; wy < FL - 10; wy += 11) for (let wx = x + 4; wx < x + bw - 5; wx += 8) {
          if (rnd() < 0.3) { c.fillStyle = rnd() < 0.5 ? 'rgba(255,110,200,.6)' : 'rgba(100,225,255,.55)'; c.fillRect(wx, wy, 3, 5); }
        }
        x += bw + 2 + rnd() * 8;
      }
    }
    // 五重塔（左右）
    pagoda(c, 118, FL, 1.0, '#ff4fa8'); pagoda(c, 842, FL, 1.0, '#49d0ff');
    // ネオン看板
    neonSign(c, 222, 150, 30, 118, '電脳神社', '#ff5fc0'); neonSign(c, 262, 196, 26, 84, '夜桜祭', '#5fe0ff');
    neonSign(c, 706, 144, 30, 118, '闘技奉納', '#5fe0ff'); neonSign(c, 668, 200, 26, 84, '花吹雪', '#ff5fc0');
    neonSign(c, 20, 236, 26, 100, '百鬼夜行', '#ffd447'); neonSign(c, 914, 236, 26, 100, '機巧演武', '#ffd447');
    // 奥の拝殿
    c.fillStyle = '#1b0c38'; c.fillRect(400, FL - 86, 160, 86);
    roofTier(c, 480, FL - 86, 190, 30, '#2a1250', '#ff4fa8');
    g = c.createLinearGradient(0, FL - 70, 0, FL); g.addColorStop(0, 'rgba(255,190,110,.9)'); g.addColorStop(1, 'rgba(255,90,160,.5)');
    c.fillStyle = g; c.fillRect(452, FL - 62, 56, 62);
    c.strokeStyle = '#1b0c38'; c.lineWidth = 3; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(452 + k * 14, FL - 62); c.lineTo(452 + k * 14, FL); c.stroke(); }
    // 床（石畳 + ネオン反射）
    g = c.createLinearGradient(0, FL, 0, HH); g.addColorStop(0, '#4a1c63'); g.addColorStop(0.25, '#2a1046'); g.addColorStop(1, '#0b0518');
    c.fillStyle = g; c.fillRect(0, FL, W, HH - FL);
    c.strokeStyle = 'rgba(110,230,255,.16)'; c.lineWidth = 1;
    for (let i = -14; i <= 14; i++) { c.beginPath(); c.moveTo(480 + i * 26, FL); c.lineTo(480 + i * 120, HH); c.stroke(); }
    for (let k = 0; k < 7; k++) { const y = FL + Math.pow(k / 7, 1.7) * (HH - FL); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (const [x, col] of [[237, '255,95,192'], [275, '95,224,255'], [721, '95,224,255'], [681, '255,95,192'], [480, '255,150,120']]) {
      g = c.createLinearGradient(0, FL, 0, HH); g.addColorStop(0, `rgba(${col},.38)`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.fillRect(x - 16, FL, 32, HH - FL);
    }
    glow(c, '#ff4fa8', 12); c.strokeStyle = '#ff7ac8'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, FL); c.lineTo(W, FL); c.stroke(); noGlow(c);
    // 大鳥居（ネオン縁取り）
    const tor = (stroke) => {
      c.beginPath(); c.moveTo(262, 150); c.quadraticCurveTo(480, 172, 698, 150); c.lineTo(690, 128); c.quadraticCurveTo(480, 150, 270, 128); c.closePath();
      stroke ? c.stroke() : c.fill();
      for (const r of [[300, 196, 360, 16], [322, 168, 24, FL - 168 + 6], [614, 168, 24, FL - 168 + 6], [468, 166, 24, 32]]) stroke ? c.strokeRect(...r) : c.fillRect(...r);
    };
    c.fillStyle = '#a80f2c'; tor(false);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(334, 168, 12, FL - 162); c.fillRect(626, 168, 12, FL - 162);
    glow(c, '#ff4fa8', 18); c.strokeStyle = '#ff8ad0'; c.lineWidth = 2.5; tor(true); noGlow(c);
    glow(c, '#5fe0ff', 10); c.fillStyle = '#bff4ff'; c.font = font(20); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('闘', 480, 183); noGlow(c);
    // しめ縄と紙垂
    c.strokeStyle = '#f3e3b0'; c.lineWidth = 4; c.beginPath(); c.moveTo(346, 214); c.quadraticCurveTo(480, 244, 614, 214); c.stroke();
    c.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { const x = 380 + k * 50, y = 222 + Math.sin((k / 4) * PI) * 12; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 7, y + 9); c.lineTo(x, y + 12); c.lineTo(x + 7, y + 22); c.lineTo(x - 3, y + 14); c.lineTo(x + 3, y + 10); c.closePath(); c.fill(); }
    // 提灯の吊り紐
    c.strokeStyle = 'rgba(20,8,40,.9)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, 70); c.quadraticCurveTo(170, 190, 300, 120); c.stroke();
    c.beginPath(); c.moveTo(W, 70); c.quadraticCurveTo(790, 190, 660, 120); c.stroke();
    // 桜の枝（上隅）
    for (const sx of [0, 1]) {
      c.strokeStyle = '#1c0a2a'; c.lineWidth = 7; c.beginPath();
      const ox = sx ? W : 0, d = sx ? -1 : 1;
      c.moveTo(ox, 8); c.quadraticCurveTo(ox + d * 120, 20, ox + d * 230, 62); c.stroke();
      c.lineWidth = 4; c.beginPath(); c.moveTo(ox + d * 90, 20); c.quadraticCurveTo(ox + d * 130, 60, ox + d * 150, 96); c.stroke();
      for (let k = 0; k < 90; k++) {
        const u = rnd(), px = ox + d * (u * 250), py = 6 + u * 54 + (rnd() - 0.4) * 46;
        c.fillStyle = ['rgba(255,150,205,.85)', 'rgba(255,190,225,.8)', 'rgba(236,104,176,.8)'][k % 3];
        c.beginPath(); c.arc(px, py, 5 + rnd() * 9, 0, PI * 2); c.fill();
      }
    }
    return cv;
  }
  const petals = [], holos = [];
  for (let i = 0; i < 44; i++) petals.push({ x: Math.random() * W, y: Math.random() * HH, s: 3 + Math.random() * 4, vx: -0.5 - Math.random() * 1.1, vy: 0.5 + Math.random() * 0.9, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.12 });
  for (let i = 0; i < 26; i++) holos.push({ x: Math.random() * W, y: Math.random() * HH, s: 2 + Math.random() * 3, vy: -0.25 - Math.random() * 0.6, ph: Math.random() * 6 });
  // 背景は実ピクセル解像度のオフスクリーンに一度だけ描き、毎フレームは等倍で貼る（1792x1008 の画像を毎フレーム縮小して貼るのが最も重かった）。
  // メニュー用の暗幕つき背景も1枚だけキャッシュする。
  // ※ 背景を別の DOM レイヤーに分けて毎フレーム貼らない案も試したが、透明キャンバスの合成が増えて計測上は遅くなったので採っていない
  let stageL = null, stageKey = '', dimL = null, dimKey = '';
  function stageLayer(dim) {
    const st = ready('stage'), key = (st ? 'i' : 'v') + CW + 'x' + CHT;
    if (stageKey !== key) {
      stageKey = key; dimKey = ''; stageL = mkCv(CW, CHT); const x = stageL.getContext('2d', { alpha: false });
      x.imageSmoothingQuality = 'high'; x.scale(CW / W, CHT / HH);
      if (st) { // 背景画像を 960x540 に cover フィット（はみ出す側を中央基準で切る）
        const iw = st.im.naturalWidth, ih = st.im.naturalHeight, k = Math.max(W / iw, HH / ih), sw = W / k, sh = HH / k;
        x.drawImage(st.im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, HH);
      } else { if (!stageCv) { GLOW = 1; stageCv = buildStage(); GLOW = 0; } x.drawImage(stageCv, 0, 0); }
    }
    if (!dim) return stageL;
    if (dimKey !== stageKey + dim) {
      dimKey = stageKey + dim; if (!dimL || dimL.width !== CW || dimL.height !== CHT) dimL = mkCv(CW, CHT);
      const x = dimL.getContext('2d', { alpha: false }); x.drawImage(stageL, 0, 0); x.fillStyle = `rgba(6,2,20,${dim})`; x.fillRect(0, 0, CW, CHT);
    }
    return dimL;
  }
  function drawStage(c, t, dim) {
    const st = ready('stage'), k = 1 - (dim || 0);
    c.imageSmoothingEnabled = false; c.drawImage(stageLayer(dim || 0), 0, 0, W, HH); c.imageSmoothingEnabled = true;
    // 提灯（ゆらぎ発光）※ベクター背景のときだけ。画像背景には提灯が描き込まれている
    c.globalAlpha = k;
    for (let i = 0; !st && i < lanterns.length; i++) {
      const [x, y] = lanterns[i], fl = 0.75 + 0.25 * Math.sin(t * 0.05 + i * 1.7);
      c.fillStyle = `rgba(255,120,70,${0.16 * fl})`; c.beginPath(); c.arc(x, y, 30, 0, PI * 2); c.fill();
      c.fillStyle = `rgb(${220 + 35 * fl | 0},${60 + 50 * fl | 0},50)`; c.beginPath(); c.ellipse(x, y, 11, 15, 0, 0, PI * 2); c.fill();
      c.fillStyle = '#1a0a1f'; c.fillRect(x - 6, y - 17, 12, 3); c.fillRect(x - 6, y + 14, 12, 3);
      c.fillStyle = `rgba(255,235,170,${0.8 * fl})`; c.fillRect(x - 1.5, y - 8, 3, 16);
    }
    // ホログラム粒子（26個固定）
    c.fillStyle = 'rgb(120,235,255)';
    for (const h of holos) {
      h.y += h.vy; if (h.y < -8) { h.y = HH + 8; h.x = Math.random() * W; }
      const a = (0.35 + 0.3 * Math.sin(t * 0.08 + h.ph)) * k;
      c.globalAlpha = a; c.fillRect(h.x, h.y, h.s, h.s);
      c.globalAlpha = a * 0.35; c.fillRect(h.x - h.s, h.y + h.s * 0.25, h.s * 3, h.s * 0.5);
    }
    c.globalAlpha = 1;
  }
  // 花びら（44枚固定）。見た目は従来どおりの回転する楕円だが、save/restore をやめて1本のパスにまとめて1回で塗る
  function drawPetals(c, t) {
    c.fillStyle = 'rgba(255,170,215,.85)'; c.beginPath();
    for (const p of petals) {
      p.x += p.vx + Math.sin(t * 0.02 + p.r) * 0.4; p.y += p.vy; p.r += p.vr;
      if (p.y > HH + 8 || p.x < -10) { p.y = -8; p.x = Math.random() * (W + 200); }
      c.moveTo(p.x + Math.cos(p.r) * p.s, p.y + Math.sin(p.r) * p.s);
      c.ellipse(p.x, p.y, p.s, p.s * 0.6 * (0.55 + 0.4 * Math.sin(t * 0.06 + p.r)), p.r, 0, PI * 2);
    }
    c.fill();
  }

  // ================= ファイター =================
  const UL = 28, LL = 30, TOR = 44, UA = 22, LA = 22, HR = 13;
  const isHv = N.isHeavy;
  // 種別 → 基本（'l' 弱 / 'h' 強 / 's' 必殺）と、変種（'d' ダッシュ / 'a' 落下 / 'c' しゃがみ / 'f' 前進 / 'b' 後退 / '2' チェイン2段目 / 'x' フィニッシュ）
  // BRIEF6: コマンドコンボの段（'c' + 番号 + 段 + 見た目2文字）は、種別の末尾2文字がそのまま 基本／変種
  // BRIEF7: チャージ攻撃（'g' + Lv + 'l'/'h'）は、強の絵（hev）を基本に、変種 'g'。Lv は種別の2文字目
  const baseK = k => (k === 'l2' ? 'l' : k === 'lf' ? 'h' : k.length === 5 ? k[3] : k.length === 3 ? 'h' : k.length === 2 ? k[1] : k), varK = k => (k === 'l2' ? '2' : k === 'lf' ? 'x' : k.length === 5 ? k[4] : k.length === 3 ? 'g' : k.length === 2 ? k[0] : '');
  const CHG_COL = (lv, g) => (lv >= 3 ? '#ff7a3d' : lv === 2 ? '#ffe066' : g); // ための色：Lv1＝キャラの発光色、Lv2＝金、Lv3＝橙
  const pt = (p, a, l) => ({ x: p.x + Math.sin(a) * l, y: p.y + Math.cos(a) * l });
  const BASE = { lean: 0.1, aF: [0.55, 1.9], aB: [0.25, 1.6], lF: [0.3, -0.05], lB: [-0.3, -0.3], w: 2.5 };
  const P = o => Object.assign({}, BASE, o);
  function mix(a, b, u) {
    const o = { lean: a.lean + (b.lean - a.lean) * u, w: a.w + (b.w - a.w) * u };
    for (const k of ['aF', 'aB', 'lF', 'lB']) o[k] = [a[k][0] + (b[k][0] - a[k][0]) * u, a[k][1] + (b[k][1] - a[k][1]) * u];
    return o;
  }
  const CROUCH_F = [1.25, -0.35], CROUCH_B = [0.5, -1.15], AIR_F = [1.0, -0.5], AIR_B = [0.35, -1.0];
  function atkPoses(f, m) {
    const k = baseK(f.atk);
    if (k === 'l') return [P({ aF: [0.1, 2.3], w: 2.6, lean: 0 }), P({ aF: [1.5, 1.57], w: 1.57, lean: 0.28, lF: [0.55, 0], lB: [-0.5, -0.45] })];
    if (k === 'h') return [P({ aF: [2.7, 3.1], aB: [2.3, 2.9], w: 3.7, lean: -0.12 }), P({ aF: [1.15, 1.3], aB: [0.9, 1.3], w: 1.15, lean: 0.48, lF: [0.85, -0.1], lB: [-0.7, -0.55] })];
    switch (m.type) {
      case 'proj': return [P({ aF: [2.4, 2.9], aB: [-0.4, 0.3], w: 3, lean: -0.1 }), P({ aF: [1.5, 1.6], aB: [1.3, 1.7], w: 1.6, lean: 0.25, lF: [0.6, 0], lB: [-0.5, -0.4] })];
      case 'beam': return [P({ aF: [1.2, 1.57], aB: [1.0, 1.9], w: 1.57, lean: 0.1, lF: [0.5, 0], lB: [-0.6, -0.5] }), P({ aF: [1.57, 1.57], aB: [1.2, 1.8], w: 1.57, lean: -0.08, lF: [0.5, 0], lB: [-0.6, -0.5] })];
      case 'grab': return [P({ aF: [0.9, 1.9], aB: [0.8, 1.8], lean: 0.2 }), P({ aF: [1.45, 1.2], aB: [1.6, 1.3], w: 1.3, lean: 0.45, lF: [0.8, -0.1], lB: [-0.6, -0.5] })];
      case 'quake': return [P({ aF: [2.9, 3.1], aB: [2.7, 3.0], w: 3.1, lean: -0.15 }), P({ aF: [0.7, 0.4], aB: [0.5, 0.3], w: 0.4, lean: 0.75, lF: CROUCH_F, lB: CROUCH_B })];
      case 'upper': return [P({ aF: [0.3, 1.0], w: 1.0, lean: 0.4, lF: CROUCH_F, lB: CROUCH_B }), P({ aF: [2.9, 3.05], aB: [-0.4, 0.2], w: 3.1, lean: -0.15, lF: [0.9, -0.6], lB: [0.1, -0.2] })];
      case 'dive': return [P({ aF: [2.6, 2.9], aB: [2.4, 2.8], w: 3, lean: -0.1, lF: AIR_F, lB: AIR_B }), P({ aF: [-0.6, -1.0], aB: [-0.9, -1.3], w: -1, lean: 0.5, lF: [1.25, 1.25], lB: [0.9, -0.9] })];
      default: return [P({ aF: [-0.5, 0.4], aB: [0.3, 1.2], w: -1.3, lean: 0.3, lF: [0.9, -0.2], lB: [-0.4, -0.6] }), P({ aF: [1.5, 1.6], aB: [-0.5, -0.2], w: 1.6, lean: 0.6, lF: [1.0, -0.15], lB: [-0.9, -0.6] })];
    }
  }
  function pose(f, ch) {
    const t = f.t;
    switch (f.st) {
      case 'walk': { const s = Math.sin(t * 0.28); return P({ lF: [s * 0.55, s * 0.55 - 0.25], lB: [-s * 0.55, -s * 0.55 - 0.25], aB: [0.25 + s * 0.2, 1.6] }); }
      case 'jump': return P({ lean: 0.15, lF: AIR_F, lB: AIR_B, aF: [1.2, 2.2], aB: [-0.7, -0.2] });
      case 'crouch': return P({ lean: 0.3, lF: CROUCH_F, lB: CROUCH_B, aF: [0.7, 2.1] });
      case 'guard': case 'block': { const g = P({ lean: f.st === 'block' ? -0.2 : -0.06, aF: [1.25, 2.95], aB: [1.05, 2.75], w: 3.05 }); if (f.cr) { g.lF = CROUCH_F; g.lB = CROUCH_B; } return g; }
      case 'dash': { const fw = (f.vx > 0 ? 1 : -1) === f.face; return P({ lean: fw ? 0.55 : -0.3, lF: [0.95, -0.3], lB: [-0.9, -1.2], aB: [-0.8, -0.3] }); }
      case 'hit': return P({ lean: -0.45, aF: [-0.3, 0.7], aB: [-0.9, -0.2], lF: [0.4, 0.1], lB: [-0.2, -0.5], w: 1 });
      case 'ko': return P({ lean: -0.25, aF: [-0.6, -0.2], aB: [-1.2, -0.8], lF: [0.5, 0.2], lB: [0.1, -0.3], w: 0.6 });
      case 'atk': {
        const m = N.mv(ch, f.atk), ps = atkPoses(f, m); let p;
        if (t <= m.su) p = mix(BASE, ps[0], varK(f.atk) === 'g' ? 1 : Math.min(1, t / Math.max(2, m.su * 0.6)));
        else if (t <= m.su + m.ac) {
          p = mix(ps[0], ps[1], Math.min(1, (t - m.su) / 2));
          if (f.atk === 's' && m.spin) { const a = 1.57 + (t - m.su) * 0.9; p.aF = [a, a]; p.w = a; p.lean = 0.2; }
        } else p = mix(ps[1], BASE, Math.min(1, (t - m.su - m.ac) / m.rc));
        if (f.air) { p.lF = AIR_F; p.lB = AIR_B; }
        else if (varK(f.atk) === 'c') { p.lF = CROUCH_F; p.lB = CROUCH_B; } // しゃがみ技
        return p;
      }
      default: return P({});
    }
  }

  function drawWeapon(c, type, h, a, C, sil) {
    const dx = Math.sin(a), dy = Math.cos(a), nx = dy, ny = -dx;
    const ln = (x0, y0, x1, y1, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    const G = (col, b) => { if (!sil) glow(c, col, b); };
    switch (type) {
      case 'katana': case 'nodachi': {
        const len = type === 'nodachi' ? 82 : 62;
        ln(h.x - dx * 10, h.y - dy * 10, h.x + dx * 4, h.y + dy * 4, C('a'), 5);
        ln(h.x + dx * 4 + nx * 5, h.y + dy * 4 + ny * 5, h.x + dx * 4 - nx * 5, h.y + dy * 4 - ny * 5, sil ? C('a') : '#ffd447', 3);
        G(C('g'), 12); ln(h.x + dx * 6, h.y + dy * 6, h.x + dx * len, h.y + dy * len, sil ? C('a') : (type === 'nodachi' ? '#ffd9e0' : '#e6fbff'), 3.5); noGlow(c);
        break;
      }
      case 'kunai': G(C('g'), 8); ln(h.x, h.y, h.x + dx * 22, h.y + dy * 22, C('g'), 4); noGlow(c); break;
      case 'club': {
        c.fillStyle = C('a'); c.beginPath();
        c.moveTo(h.x - dx * 10 + nx * 3, h.y - dy * 10 + ny * 3); c.lineTo(h.x + dx * 72 + nx * 10, h.y + dy * 72 + ny * 10);
        c.lineTo(h.x + dx * 72 - nx * 10, h.y + dy * 72 - ny * 10); c.lineTo(h.x - dx * 10 - nx * 3, h.y - dy * 10 - ny * 3); c.closePath(); c.fill();
        c.fillStyle = C('g');
        for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
          const bx = h.x + dx * (30 + k * 12), by = h.y + dy * (30 + k * 12), wv = 6 + k * 1.2;
          c.beginPath(); c.moveTo(bx + nx * s * wv - dx * 3, by + ny * s * wv - dy * 3); c.lineTo(bx + nx * s * (wv + 7), by + ny * s * (wv + 7)); c.lineTo(bx + nx * s * wv + dx * 3, by + ny * s * wv + dy * 3); c.fill();
        }
        break;
      }
      case 'naginata': {
        ln(h.x - dx * 32, h.y - dy * 32, h.x + dx * 60, h.y + dy * 60, C('a'), 4);
        G(C('g'), 12); c.strokeStyle = sil ? C('a') : '#f1e4ff'; c.lineWidth = 5; c.beginPath();
        c.moveTo(h.x + dx * 60, h.y + dy * 60); c.quadraticCurveTo(h.x + dx * 76 + nx * 9, h.y + dy * 76 + ny * 9, h.x + dx * 90 - nx * 2, h.y + dy * 90 - ny * 2); c.stroke(); noGlow(c);
        break;
      }
      case 'staff': {
        ln(h.x - dx * 34, h.y - dy * 34, h.x + dx * 56, h.y + dy * 56, C('a'), 4);
        G(C('g'), 10); c.strokeStyle = C('g'); c.lineWidth = 3; c.beginPath(); c.arc(h.x + dx * 62, h.y + dy * 62, 8, 0, PI * 2); c.stroke(); noGlow(c);
        break;
      }
      case 'fan': {
        const base = Math.atan2(dy, dx);
        G(C('g'), 8); c.fillStyle = C('a'); c.beginPath(); c.moveTo(h.x, h.y); c.arc(h.x, h.y, 30, base - 0.95, base + 0.95); c.closePath(); c.fill(); noGlow(c);
        c.strokeStyle = C('m'); c.lineWidth = 1.5;
        for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(h.x + Math.cos(base + k * 0.42) * 30, h.y + Math.sin(base + k * 0.42) * 30); c.stroke(); }
        break;
      }
      case 'gohei': {
        ln(h.x - dx * 6, h.y - dy * 6, h.x + dx * 36, h.y + dy * 36, sil ? C('a') : '#8a5a2b', 3);
        c.strokeStyle = C('m'); c.lineWidth = 3;
        for (const s of [-1, 1]) { c.beginPath(); let x = h.x + dx * 34, y = h.y + dy * 34; c.moveTo(x, y); for (let k = 1; k <= 3; k++) { x += s * 5 * (k % 2 ? 1 : -0.4); y += 7; c.lineTo(x, y); } c.stroke(); }
        break;
      }
      case 'mic': ln(h.x, h.y, h.x + dx * 12, h.y + dy * 12, C('a'), 3); G(C('g'), 8); c.fillStyle = C('a'); c.beginPath(); c.arc(h.x + dx * 15, h.y + dy * 15, 5, 0, PI * 2); c.fill(); noGlow(c); break;
      case 'fist': case 'palm': c.fillStyle = C(type === 'fist' ? 'g' : 'a'); c.beginPath(); c.arc(h.x + dx * 3, h.y + dy * 3, type === 'fist' ? 11 : 10, 0, PI * 2); c.fill(); break;
      case 'cannon': {
        ln(h.x - dx * 14, h.y - dy * 14, h.x + dx * 16, h.y + dy * 16, C('a'), 17);
        G(C('g'), 10); c.fillStyle = C('g'); c.beginPath(); c.arc(h.x + dx * 22, h.y + dy * 22, 5, 0, PI * 2); c.fill(); noGlow(c);
        break;
      }
      case 'claw': G(C('g'), 8); for (let k = -1; k <= 1; k++) ln(h.x + nx * k * 4, h.y + ny * k * 4, h.x + dx * 16 + nx * k * 7, h.y + dy * 16 + ny * k * 7, C('g'), 2.5); noGlow(c); break;
      case 'orb': G(C('g'), 14); c.fillStyle = C('g'); c.beginPath(); c.arc(h.x + dx * 10, h.y + dy * 10 - 6, 8, 0, PI * 2); c.fill(); noGlow(c); break;
    }
  }

  function drawHead(c, type, hd, C, hairC, sil, t) {
    const x = hd.x, y = hd.y, r = HR;
    const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); };
    const ball = (col, rr) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, rr || r, 0, PI * 2); c.fill(); };
    const eye = (col, ex, ey, w) => { if (sil) return; glow(c, col, 8); c.strokeStyle = col; c.lineWidth = w || 2.5; c.beginPath(); c.moveTo(x + (ex || 3), y + (ey || -1)); c.lineTo(x + r - 1, y + (ey || -1)); c.stroke(); noGlow(c); };
    const dot = () => { if (sil) return; c.fillStyle = '#1a1020'; c.beginPath(); c.arc(x + 6, y - 1, 1.8, 0, PI * 2); c.fill(); };
    const gold = sil ? C('a') : '#ffd447';
    switch (type) {
      case 'kabuto':
        poly([x - r - 1, y - 3, x - r - 10, y + 11, x - 1, y + 9], C('a')); ball(C('m'));
        c.fillStyle = C('a'); c.beginPath(); c.arc(x, y - 1, r + 1.5, PI, PI * 2); c.closePath(); c.fill();
        c.strokeStyle = gold; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 3, y - r); c.quadraticCurveTo(x + 14, y - r - 6, x + 15, y - r - 19); c.moveTo(x + 1, y - r); c.quadraticCurveTo(x - 9, y - r - 6, x - 9, y - r - 19); c.stroke();
        eye(C('g')); break;
      case 'longhair':
        ball(C('s')); c.fillStyle = hairC; c.beginPath(); c.arc(x - 1, y - 2, r + 1.5, PI * 0.95, PI * 1.9); c.closePath(); c.fill();
        poly([x + 2, y - r - 1, x + 11, y - 4, x + 4, y - 5], hairC);
        poly([x - 9, y - r - 5, x - 1, y - r + 2, x - 13, y - r + 4], C('a')); dot(); break;
      case 'hood':
        ball(C('m')); poly([x - r + 2, y - 9, x - r - 9, y - 3, x - r + 3, y + 5], C('m')); eye(C('g'), 1, -2, 3.5); break;
      case 'monkhood':
        poly([x - r - 4, y + 9, x - 3, y - r - 15, x + r + 2, y + 2], C('m')); ball(C('a'), r - 1.5);
        eye(C('g'), 3, -2, 3); if (!sil) { c.strokeStyle = C('g'); c.lineWidth = 1.5; c.beginPath(); c.arc(x + 5, y + 5, 4, 0.2, PI - 0.2); c.stroke(); } break;
      case 'fox':
        ball(C('s')); c.fillStyle = hairC; c.beginPath(); c.arc(x - 1, y - 2, r + 1.5, PI * 0.9, PI * 1.92); c.closePath(); c.fill();
        poly([x - 10, y - r + 3, x - 9, y - r - 17, x + 1, y - r - 1], hairC); poly([x + 1, y - r, x + 9, y - r - 16, x + 12, y - r + 5], hairC);
        if (!sil) { poly([x - 8, y - r + 1, x - 8, y - r - 10, x - 2, y - r - 1], '#fff'); }
        dot(); break;
      case 'mage':
        ball(C('s'), r + 1); c.fillStyle = C('a'); c.beginPath(); c.arc(x, y - 2, r + 2, PI, PI * 2); c.closePath(); c.fill();
        c.beginPath(); c.ellipse(x - 2, y - r - 5, 9, 5, -0.2, 0, PI * 2); c.fill();
        eye(C('g'), 2, 0, 4); break;
      case 'oni':
        poly([x - r - 2, y + 6, x - r - 9, y - 8, x - r + 1, y - 5, x - r - 3, y - 17, x - 2, y - r + 1], C('a')); ball(C('s'));
        poly([x + 3, y - r + 2, x + 9, y - r - 15, x + 11, y - r + 4], gold); poly([x - 7, y - r + 3, x - 5, y - r - 13, x, y - r + 1], gold);
        eye(gold, 3, -2, 3); if (!sil) poly([x + 6, y + 5, x + 8, y + 10, x + 10, y + 5], '#fff'); break;
      case 'ponytail':
        ball(C('s')); c.fillStyle = hairC; c.beginPath(); c.arc(x - 1, y - 2, r + 1.5, PI * 0.9, PI * 1.9); c.closePath(); c.fill();
        c.strokeStyle = gold; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 4, y - r - 1); c.lineTo(x + 6, y - r - 12); c.moveTo(x - 6, y - r - 1); c.lineTo(x - 10, y - r - 13); c.stroke();
        dot(); break;
      case 'geisha':
        ball(C('s')); c.fillStyle = hairC; c.beginPath(); c.arc(x - 1, y - 2, r + 1.5, PI * 0.85, PI * 1.9); c.closePath(); c.fill();
        c.beginPath(); c.arc(x - 3, y - r - 6, 10, 0, PI * 2); c.fill(); c.beginPath(); c.arc(x - 13, y - 6, 7, 0, PI * 2); c.fill();
        c.strokeStyle = gold; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 12, y - r - 14); c.lineTo(x + 10, y - r - 2); c.moveTo(x + 6, y - r - 16); c.lineTo(x - 12, y - r - 2); c.stroke();
        dot(); break;
      case 'mech':
        c.fillStyle = C('m'); c.fillRect(x - r, y - r + 1, r * 2 + 3, r * 2 - 3); c.fillStyle = C('a'); c.fillRect(x - r, y + 5, r * 2 + 3, 5);
        c.strokeStyle = C('a'); c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 6, y - r + 1); c.lineTo(x - 11, y - r - 15); c.stroke();
        if (!sil) { glow(c, C('g'), 10); c.fillStyle = C('g'); c.beginPath(); c.arc(x + 7, y - 2, 4.5, 0, PI * 2); c.fill(); noGlow(c); } break;
      case 'tengu':
        poly([x - r, y - 6, x - r - 9, y + 2, x - r - 4, y + 12, x - 3, y + 8], sil ? C('a') : '#eee'); ball(C('s'));
        c.strokeStyle = C('s'); c.lineWidth = 5; c.beginPath(); c.moveTo(x + r - 3, y + 1); c.lineTo(x + r + 15, y + 3); c.stroke();
        c.fillStyle = C('m'); c.fillRect(x - 1, y - r - 6, 10, 9); eye(gold, 4, -3, 2.5); break;
      case 'dragon':
        poly([x - r, y - 4, x - r - 10, y - 12, x - r - 3, y + 2, x - r - 12, y + 5, x - 4, y + 9], C('a')); ball(C('m'));
        poly([x + 4, y - 6, x + r + 13, y - 1, x + r + 12, y + 6, x + 3, y + 9], C('m'));
        c.strokeStyle = gold; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 1, y - r + 1); c.quadraticCurveTo(x - 8, y - r - 10, x - 19, y - r - 14); c.moveTo(x + 4, y - r + 2); c.quadraticCurveTo(x - 1, y - r - 12, x - 9, y - r - 20); c.stroke();
        eye(C('g'), 4, -3, 3); break;
      case 'kasa':
        ball(C('s')); poly([x - 27, y - 2, x + 1, y - r - 13, x + 29, y - 2], C('m'));
        if (!sil) { c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + 1, y - r - 13); c.lineTo(x + 1 + k * 11, y - 2); c.stroke(); } }
        eye(C('g'), 3, 3, 2.5); break;
      case 'crown':
        ball(C('s')); c.fillStyle = hairC; c.beginPath(); c.arc(x - 1, y - 2, r + 1.5, PI * 0.9, PI * 1.9); c.closePath(); c.fill();
        if (!sil) glow(c, C('g'), 12); c.strokeStyle = gold; c.lineWidth = 3; c.beginPath(); c.arc(x, y - r - 9, 9, PI * 0.15, PI * 0.85, true); c.stroke(); noGlow(c);
        dot(); break;
      default: ball(C('s'));
    }
  }

  function drawFighterVec(c, f, o) {
    const ch = CHARS[f.ci], b = ch.b, sc = b.sc || 1, sil = !!o.sil;
    const C = k => (sil ? '#05030a' : ch.col[k]);
    const hairC = sil ? '#05030a' : (b.hair || ch.col.a);
    const p = pose(f, ch);
    if (o.win) { p.aF = [2.9, 3.0]; p.w = 3.1; }
    const t = f.t, bob = (f.st === 'idle' || f.st === 'guard') ? Math.sin(t * 0.09) * 1.5 : 0;
    const m = f.st === 'atk' ? N.mv(ch, f.atk) : null;
    c.save(); c.translate(f.x, f.y);
    if (f.st === 'ko') c.rotate(-f.face * Math.min(1, t / 16) * 1.45);
    c.scale(f.face * sc, sc);
    let alpha = o.alpha == null ? 1 : o.alpha;
    if (m && f.atk === 's' && m.type === 'warp' && t < m.su) alpha *= 0.25 + 0.3 * Math.abs(Math.sin(t));
    if (b.holo && !sil) alpha *= 0.86 + 0.1 * Math.sin(t * 0.3);
    c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round';
    const legH = Math.max(Math.cos(p.lF[0]) * UL + Math.cos(p.lF[1]) * LL, Math.cos(p.lB[0]) * UL + Math.cos(p.lB[1]) * LL, 18);
    const hip = { x: 0, y: -legH }, sh = { x: hip.x + Math.sin(p.lean) * TOR, y: hip.y - Math.cos(p.lean) * TOR + bob };
    const hd = { x: sh.x + Math.sin(p.lean) * (HR + 2), y: sh.y - Math.cos(p.lean) * (HR + 2) };
    const kF = pt(hip, p.lF[0], UL), fF = pt(kF, p.lF[1], LL), kB = pt(hip, p.lB[0], UL), fB = pt(kB, p.lB[1], LL);
    const shF = { x: sh.x + 2, y: sh.y + 6 }, shB = { x: sh.x - 3, y: sh.y + 6 };
    const eF = pt(shF, p.aF[0], UA), hF = pt(eF, p.aF[1], LA), eB = pt(shB, p.aB[0], UA), hB = pt(eB, p.aB[1], LA);
    const lw = b.limb, tw = b.tw, sway = Math.sin(t * 0.12) * 3 - f.vx * f.face * 1.2;
    const line = (a, q, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(q.x, q.y); c.stroke(); };
    const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); };
    const footY = Math.max(fF.y, fB.y);

    // --- 背面パーツ ---
    if (b.wings) for (const k of [0, 1]) poly([sh.x - 4, sh.y + 4, sh.x - 52 - k * 8, sh.y - 34 + k * 26 + sway, sh.x - 40, sh.y + 4 + k * 20, sh.x - 30 - k * 4, sh.y + 24 + k * 18 + sway, sh.x - 8, sh.y + 26], k ? C('a') : C('m'));
    if (b.tail === 1) { c.strokeStyle = C('a'); c.lineWidth = 15; c.beginPath(); c.moveTo(hip.x - 4, hip.y - 2); c.quadraticCurveTo(hip.x - 34, hip.y + 4, hip.x - 36, hip.y - 32 + sway); c.stroke(); c.strokeStyle = sil ? C('a') : '#fff'; c.lineWidth = 9; c.beginPath(); c.moveTo(hip.x - 36, hip.y - 26 + sway); c.lineTo(hip.x - 36, hip.y - 33 + sway); c.stroke(); }
    if (b.tail === 2) { c.strokeStyle = C('m'); c.lineWidth = 12; c.beginPath(); c.moveTo(hip.x - 4, hip.y); c.quadraticCurveTo(hip.x - 40, hip.y + 26, hip.x - 62, hip.y + 6 + sway); c.stroke(); c.lineWidth = 6; c.strokeStyle = C('g'); c.beginPath(); c.moveTo(hip.x - 62, hip.y + 6 + sway); c.lineTo(hip.x - 72, hip.y - 6 + sway); c.stroke(); }
    if (b.scarf) { c.strokeStyle = C(b.head === 'kasa' ? 'g' : 'g'); c.lineWidth = 5; c.beginPath(); c.moveTo(sh.x - 2, sh.y - 2); c.quadraticCurveTo(sh.x - 24, sh.y - 8 + sway, sh.x - 46, sh.y + 4 - sway * 1.5); c.stroke(); }
    if (b.head === 'longhair' || b.head === 'crown') poly([hd.x - 6, hd.y - 12, hd.x - 22 - sway * 0.5, hd.y + 30, hd.x - 18 - sway, hip.y + (b.head === 'crown' ? 34 : 8), hd.x - 4 - sway, hip.y + (b.head === 'crown' ? 26 : 0), hd.x + 2, hd.y + 6], hairC);
    if (b.head === 'ponytail') { c.strokeStyle = hairC; c.lineWidth = 8; c.beginPath(); c.moveTo(hd.x - 6, hd.y - 12); c.quadraticCurveTo(hd.x - 30, hd.y - 18 + sway, hd.x - 30 - sway, hd.y + 34); c.stroke(); }
    if (b.head === 'fox') for (const k of [0, 1]) { c.strokeStyle = hairC; c.lineWidth = 7; c.beginPath(); c.moveTo(hd.x - 8, hd.y - 4); c.quadraticCurveTo(hd.x - 26 - k * 4, hd.y + sway, hd.x - 22 - k * 8 - sway, hd.y + 30); c.stroke(); }
    // 後ろ腕
    line(shB, eB, C(b.sleeves ? 'm' : 'a'), lw - 1); line(eB, hB, C(b.sleeves ? 'm' : 's'), lw - 2);
    if (b.weapon === 'fan' || b.weapon === 'fist' || b.weapon === 'palm' || b.weapon === 'claw') drawWeapon(c, b.weapon, hB, p.aB[1] + 0.3, C, sil);
    // 後ろ脚
    const legCol = b.robe === 'hakama' ? C('a') : (b.robe === 'none' ? C('m') : C('s')), lx = b.robe === 'hakama' ? 5 : 0;
    line(hip, kB, legCol, lw + lx + 1); line(kB, fB, legCol, lw + lx - 1); line(fB, { x: fB.x + 6, y: fB.y }, C('a'), lw - 1);
    // 胴
    line({ x: hip.x, y: hip.y - 2 }, { x: sh.x, y: sh.y + 4 }, C('m'), tw);
    if (!sil) { glow(c, C('g'), 6); line({ x: hip.x + Math.sin(p.lean) * 12 + 3, y: hip.y - 12 }, { x: sh.x + 3, y: sh.y + 10 }, C('g'), 2); noGlow(c); }
    c.lineCap = 'butt'; line({ x: hip.x + Math.sin(p.lean) * 2, y: hip.y - 2 }, { x: hip.x + Math.sin(p.lean) * 10, y: hip.y - 10 }, C('a'), tw + 3); c.lineCap = 'round';
    if (b.robe === 'mawashi') { line({ x: hip.x - tw / 2, y: hip.y }, { x: hip.x + tw / 2, y: hip.y }, C('a'), 12); if (!sil) line({ x: hip.x + tw / 2 - 6, y: hip.y }, { x: hip.x + tw / 2 - 6, y: hip.y + 14 }, C('g'), 7); }
    if (b.beads) { c.fillStyle = sil ? C('a') : '#5a2412'; for (let k = 0; k < 7; k++) { const a = 0.3 + k * 0.42; c.beginPath(); c.arc(sh.x + Math.cos(a) * 15, sh.y + 8 + Math.sin(a) * 14, 3.6, 0, PI * 2); c.fill(); } }
    // 前脚
    line(hip, kF, legCol, lw + lx + 2); line(kF, fF, legCol, lw + lx); line(fF, { x: fF.x + 7, y: fF.y }, C('a'), lw);
    if (b.robe === 'none' && !sil) { c.fillStyle = C('a'); for (const k of [kF, kB]) { c.beginPath(); c.arc(k.x, k.y, lw * 0.55, 0, PI * 2); c.fill(); } }
    // 衣装
    if (b.robe === 'kimono') {
      poly([hip.x - tw / 2 - 1, hip.y - 4, hip.x + tw / 2 + 1, hip.y - 4, Math.max(fF.x, kF.x) + 8, footY - 4, Math.min(fB.x, kB.x) - 8, footY - 4], C('m'));
      if (!sil) { c.strokeStyle = C('a'); c.lineWidth = 3; c.beginPath(); c.moveTo(Math.max(fF.x, kF.x) + 8, footY - 5); c.lineTo(Math.min(fB.x, kB.x) - 8, footY - 5); c.stroke(); line({ x: hip.x + 3, y: hip.y }, { x: (fF.x + fB.x) / 2 + 4, y: footY - 6 }, C('a'), 2); }
    } else if (b.robe === 'skirt') {
      poly([hip.x - tw / 2, hip.y - 5, hip.x + tw / 2, hip.y - 5, Math.max(kF.x, hip.x + 12) + 9, hip.y + 24, Math.min(kB.x, hip.x - 12) - 9, hip.y + 24], C('a'));
    } else if (b.robe === 'loin') {
      poly([hip.x - tw / 2, hip.y - 4, hip.x + tw / 2, hip.y - 4, hip.x + tw / 2 + 4, hip.y + 20, hip.x - tw / 2 - 4, hip.y + 20], sil ? C('a') : '#ffc21a');
      if (!sil) { c.strokeStyle = '#1a1208'; c.lineWidth = 2.5; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(hip.x + k * 8 - 3, hip.y - 2); c.lineTo(hip.x + k * 8 + 3, hip.y + 18); c.stroke(); } }
    }
    if (b.pads) { poly([sh.x - 16, sh.y + 8, sh.x - 13, sh.y - 5, sh.x + 13, sh.y - 6, sh.x + 17, sh.y + 8], C('a')); if (!sil) { c.strokeStyle = C('g'); c.lineWidth = 1.5; c.beginPath(); c.moveTo(sh.x - 15, sh.y + 8); c.lineTo(sh.x + 16, sh.y + 8); c.stroke(); } }
    // 頭
    line({ x: sh.x, y: sh.y }, hd, C('s'), 7);
    drawHead(c, b.head, hd, C, hairC, sil, t);
    // 前腕 + 武器
    line(shF, eF, C(b.sleeves ? 'm' : 'a'), lw); line(eF, hF, C(b.sleeves ? 'm' : 's'), lw - 1);
    if (b.sleeves) { poly([eF.x, eF.y, hF.x, hF.y, hF.x - 5, hF.y + 24 + sway, eF.x - 6, eF.y + 12], C('m')); if (!sil) line({ x: hF.x, y: hF.y + 2 }, { x: hF.x - 5, y: hF.y + 24 + sway }, C('a'), 2.5); }
    drawWeapon(c, b.weapon, hF, p.w, C, sil);
    if (b.weapon === 'gohei' && !sil) for (let k = 0; k < 3; k++) { const a = t * 0.05 + k * 2.1; c.save(); c.translate(sh.x - 6 + Math.cos(a) * 30, sh.y - 6 + Math.sin(a * 1.3) * 16); c.rotate(Math.sin(a) * 0.4); glow(c, C('g'), 8); c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(-4, -7, 8, 14); c.fillStyle = C('a'); c.fillRect(-1, -4, 2, 8); noGlow(c); c.restore(); }
    if (m && !sil) drawAtkFx(c, f, m, C('g'), alpha, { hx: hF.x, hy: hF.y, cy: sh.y + 10, R: m.rng / sc * 0.96, ay: hip.y - 14, k: 1 });
    c.restore();
  }
  // 斬撃の弧・ビーム・必殺技の溜めオーラ（ベクター／スプライト共通。向きを反転済みの座標系で呼ぶ）
  // geo: hx,hy=手元  cy=弧の中心の高さ  R=弧の半径  ay=オーラ中心の高さ  k=太さなどの倍率
  function drawAtkFx(c, f, m, g, alpha, geo) {
    const t = f.t, ty = f.atk === 's' ? m.type : '', k = geo.k, hv = isHv(f.atk), fall = !!m.fall, vr = varK(f.atk);
    const gl = vr === 'g' ? +f.atk[1] : 0, gc = CHG_COL(gl, g); // チャージ攻撃：Lv が高いほど弧が大きく太く、色が強い
    const cy = vr === 'c' ? geo.cy * 0.7 : geo.cy; // しゃがみ技は弧の中心も低い
    const tail = hv ? 7 : 3; // 強の斬撃は長く残る
    if (t > m.su && t <= m.su + m.ac + tail && !(fall && !f.air)) {
      const u = fall ? 0.8 : 1 - (t - m.su) / (m.ac + tail + 1);
      if (ty === 'beam') {
        if (t <= m.su + m.ac) {
          const hgt = (13 + Math.sin(t * 1.7) * 4) * k;
          c.fillStyle = g; c.globalAlpha = alpha * 0.28; c.fillRect(geo.hx + 14, geo.hy - hgt * 1.3, 900, hgt * 2.6);
          c.globalAlpha = alpha; c.fillRect(geo.hx + 20, geo.hy - hgt / 2, 900, hgt);
          c.fillStyle = '#fff'; c.fillRect(geo.hx + 20, geo.hy - hgt / 5, 900, hgt / 2.5);
          c.strokeStyle = g; c.lineWidth = 2; for (let n = 0; n < 3; n++) { c.beginPath(); c.arc(geo.hx + 26 + n * 16, geo.hy, 12 + n * 7 + (t % 4), 0, PI * 2); c.stroke(); }
        }
      } else if (m.dmg > 0) {
        let a0 = -0.5, a1 = 0.45;
        if (hv || ty === 'quake') { a0 = -1.45; a1 = 0.7; } else if (ty === 'upper') { a0 = -1.5; a1 = 0.7; } else if (ty) { a0 = -0.8; a1 = 0.7; }
        if (f.air || ty === 'dive') { a0 = -0.2; a1 = 1.3; }
        else if (vr === 'c') { if (hv) { a0 = -0.3; a1 = 0.95; } else { a0 = 0.1; a1 = 0.85; } } // しゃがみ技：足元を払う低い弧
        else if (vr === 'f') { a0 += 0.12; a1 += 0.18; } // 前進技：前へ突き出す
        else if (vr === 'b') a0 -= 0.3; // 後退技：長く振り抜く
        else if (vr === '2') { a0 = -0.28; a1 = 0.3; } // 2段目：小さい弧
        else if (vr === 'u') { a0 = -1.8; a1 = -0.25; } // BRIEF8 ジャグルの空中段：頭上へ振り上げる弧
        // 弱＝細く短い弧、強＝太く大きい二重の弧（発光はぼかしではなく、太い半透明の線を下に敷く）
        const R = geo.R * (hv ? 1.14 : 1) * (vr === '2' ? 0.8 : vr === 'x' ? 1.1 : 1) * (1 + 0.04 * gl), lw = (ty ? 13 : hv ? 17 : 8) * k * (vr === '2' ? 0.75 : vr === 'x' ? 1.2 : 1) * (1 + 0.2 * gl), a = alpha * Math.max(0, u);
        if (gl) { a0 -= 0.08 * gl; a1 += 0.06 * gl; }
        c.lineCap = 'round'; c.strokeStyle = gc;
        if (gl === 3) { // Lv3：弧を二重にして、後ろに残像の弧を引く
          for (let n = 2; n >= 1; n--) { c.globalAlpha = a * 0.28 / n; c.lineWidth = lw; c.beginPath(); c.arc(-16 * n * k, cy, R, a0 - 0.14 * n, a1 - 0.14 * n); c.stroke(); }
          c.globalAlpha = a * 0.85; c.lineWidth = lw * 0.5; c.beginPath(); c.arc(0, cy, R + lw * 1.5, a0 - 0.12, a1 + 0.1); c.stroke();
          c.strokeStyle = '#fff'; c.lineWidth = 2.5 * k; c.beginPath(); c.arc(0, cy, R + lw * 1.5 + 2, a0, a1); c.stroke(); c.strokeStyle = gc;
        }
        c.globalAlpha = a * 0.26; c.lineWidth = lw * 2.3; c.beginPath(); c.arc(0, cy, R, a0, a1); c.stroke();
        c.globalAlpha = a; c.lineWidth = lw; c.beginPath(); c.arc(0, cy, R, a0, a1); c.stroke();
        if (hv) { c.globalAlpha = a * 0.55; c.lineWidth = lw * 0.5; c.beginPath(); c.arc(0, cy, R - lw * 1.5, a0 + 0.25, a1 - 0.1); c.stroke(); c.globalAlpha = a; }
        c.strokeStyle = '#fff'; c.lineWidth = (hv ? 4.5 : 2.5) * k; c.beginPath(); c.arc(0, cy, R + 2, a0 + 0.1, a1 - 0.1); c.stroke();
        if (vr === 'x') { // フィニッシュ：弧の先に十字の閃光
          const q = Math.max(0, 1 - (t - m.su - 1) / 6), fx0 = R * 0.98, len = (70 + 50 * q) * k;
          for (const [ang, w, col, al] of [[0.5, 9, g, 0.5], [0.5, 3.5, '#fff', 1], [-0.95, 7, g, 0.45], [-0.95, 2.5, '#fff', 0.9]]) {
            c.globalAlpha = alpha * al * q; c.strokeStyle = col; c.lineWidth = w * k; c.beginPath();
            c.moveTo(fx0 - Math.cos(ang) * len, cy - Math.sin(ang) * len); c.lineTo(fx0 + Math.cos(ang) * len, cy + Math.sin(ang) * len); c.stroke();
          }
          c.globalAlpha = alpha * 0.8 * q; c.fillStyle = '#fff'; c.beginPath(); c.arc(fx0, cy, 13 * k * (0.5 + q), 0, PI * 2); c.fill();
        }
        c.lineCap = 'butt'; c.globalAlpha = alpha;
      }
    }
    if (f.atk === 's' && t <= m.su) {
      c.globalAlpha = 0.55; c.strokeStyle = g; c.lineWidth = 3;
      c.beginPath(); c.ellipse(0, geo.ay, (36 + (m.su - t) * 1.6) * k, (62 + (m.su - t) * 1.6) * k, 0, 0, PI * 2); c.stroke();
    }
    // 強攻撃の溜め：光の輪が体に向かって縮む（弱には無い）
    if (hv && !fall && t <= m.su) {
      const u = t / m.su;
      c.strokeStyle = g; c.lineWidth = 3.5 * k;
      for (let n = 0; n < 2; n++) { const q = Math.max(0, u - n * 0.3); if (q <= 0) continue; c.globalAlpha = alpha * 0.7 * q; c.beginPath(); c.arc(0, geo.ay, (70 - 48 * q) * k, 0, PI * 2); c.stroke(); }
    }
    c.globalAlpha = alpha;
  }

  // ---- スプライト描画（1枚絵 + 手続きアニメーション。動きは sim の状態だけから決める） ----
  // 表示の高さは体格 b.sc に比例（sc 0.9→200px 〜 1.15→270px。BRIEF3 で従来の8割に縮小。当たり判定は変えていない）
  const spriteH = ch => Math.max(200, Math.min(270, 200 + ((ch.b.sc || 1) - 0.9) / 0.25 * 70));
  // 攻撃ポーズを出す区間：有効フレーム（active）＋硬直の頭 ATK_HOLD フレームまで（active だけだと弱攻撃で3フレームしか見えない）
  const atkHold = m => Math.min(6, Math.round(m.rc * 0.4));
  // sim の状態から使うポーズを選ぶ（'' = 待機絵）
  function poseKind(f, m) {
    switch (f.st) {
      case 'atk': return f.t > m.su && f.t <= m.su + m.ac + atkHold(m) ? (isHv(f.atk) ? 'hev' : 'atk') : ''; // 強攻撃系は専用ポーズ
      case 'hit': case 'ko': return 'hit';
      case 'guard': case 'block': return 'grd';
      default: return '';
    }
  }
  // ポーズ切替のクロスフェード用に、直前に描いたポーズ絵を覚えておく（描画側だけの記憶。sim には触らない）
  const poseMem = [{}, {}], XFADE = [0.6, 0.36, 0.16];
  function drawSprite(c, f, o, idle) {
    const ch = CHARS[f.ci], t = f.t, st = f.st, g = ch.col.g;
    const m = st === 'atk' ? N.mv(ch, f.atk) : null, ty = m && f.atk === 's' ? m.type : '';
    const kind = o.win ? '' : poseKind(f, m);
    // ポーズ絵が未ロードなら待機絵（強攻撃ポーズが未ロードの間は通常の攻撃ポーズ）
    const pe = kind ? (poseOf(f.ci, kind) || (kind === 'hev' ? poseOf(f.ci, 'atk') : null)) : null;
    const e = pe || idle, im = e.im, z = (o.zoom || 1) * SC;
    // 高さを待機絵と同じ H に揃える（攻撃絵は武器ぶん横に広いだけで、体の大きさは変わらない）
    const H = spriteH(ch), Wd = im.naturalWidth * H / im.naturalHeight, ax = anchorX(e, ch.id) * Wd;
    const fw = (f.vx >= 0 ? 1 : -1) === f.face; // 前進中か
    // dx,dy=ずらし（+x は相手方向）  rot=傾き（+ は前傾）  py=回転の中心の高さ  white=白フラッシュの濃さ  ghost=残像の枚数  streak=スピード線（1=水平 2=斜め下）
    let dx = 0, dy = 0, rot = 0, sx = 1, sy = 1, py = 0, white = 0, ghost = 0, ga = 0.3, streak = 0, gfix = 0, alpha = o.alpha == null ? 1 : o.alpha;
    switch (st) {
      case 'walk': rot = (fw ? 1 : -1) * 0.05 * Math.min(1, t / 5); dy = -Math.abs(Math.sin(t * Math.abs(f.vx) * 0.07)) * 3; break; // 進行方向へ最大約3°傾く。上下動は移動速度に同期
      case 'dash': rot = fw ? 0.2 : -0.14; dy = -3; ghost = 3; break;
      case 'jump': py = H * 0.5; rot = Math.max(-0.22, Math.min(0.22, f.vy * 0.011 + f.vx * f.face * 0.012)); break;
      case 'crouch': sy = 0.74; sx = 1.05; break;
      case 'guard': case 'block': // ガード絵があれば絵に任せ、無ければ従来の沈み込み
        sy = f.cr ? 0.74 : pe ? 1 : 0.93; sx = f.cr ? 1.05 : pe ? 1 : 1.01; rot = pe ? 0 : -0.04; if (st === 'block') dx = -6 * Math.max(0, 1 - t / 8); break;
      case 'hit': { const u = Math.max(0, 1 - t / 16); rot = pe ? -0.03 - 0.1 * u : -0.1 - 0.24 * u; dx = -8 * u; white = t < 9 && (t >> 1) % 2 === 0 ? 0.9 : 0; break; }
      case 'ko': { const u = Math.min(1, t / 16); rot = -u * PI / 2; dy = -ax * u; white = t < 6 && t % 2 === 0 ? 0.9 : 0; alpha *= 1 - 0.5 * clamp01((t - 30) / 40); break; }
      case 'atk': {
        const end = m.su + m.ac, vr = varK(f.atk), sp = f.atk === 's', hv = isHv(f.atk);
        if (m.fall) { // 落下攻撃：ためて → 斜め下へ傾いて突っ込む → 着地で沈む
          if (f.air) {
            py = H * 0.5;
            if (t <= m.su) { const u = t / m.su; rot = -0.28 * u; sy = 1 - 0.04 * u; }
            else { rot = hv ? 0.6 : 0.46; ghost = hv ? 3 : 2; ga = 0.42; streak = 2; }
          } else { const u = 1 - Math.min(1, (t - end) / m.rc); sy = 1 - 0.13 * u; sx = 1 + 0.06 * u; rot = 0.1 * u; }
        } else if (vr === 'd') { // ダッシュ攻撃：前傾のまま走り込み、スピード線と濃い残像
          const lean = hv ? 0.24 : 0.18;
          if (t <= m.su) { rot = 0.2; dy = -3; ghost = 3; ga = 0.42; streak = 1; }
          else if (t <= end) { const u = Math.min(1, (t - m.su) / 2); dx = 16 * u; rot = 0.2 + (lean - 0.2) * u; ghost = 4; ga = 0.46; streak = 1; }
          else { const u = 1 - Math.min(1, (t - end) / m.rc); dx = 16 * u * u; rot = lean * u; if (u > 0.6) ghost = 2; }
        } else {
          // 弱＝小さく速い。強＝大きく引いて（溜め）深く踏み込む。突進系の必殺技は sim 側が本体を動かすので、見た目の踏み込みは小さくする
          const big = hv && !sp, lt = !hv && !sp;
          let lean = lt ? 0.08 : big ? 0.2 : 0.15;
          let reach = lt ? 20 : big ? 44 : (m.adv || ty === 'dive' || ty === 'upper' || ty === 'warp') ? 12 : 26;
          let back = big ? 22 : 10, br = big ? 0.14 : 0.07; const bs = big ? 0.09 : 0.05;
          // BRIEF5 の変種（絵は同じ。傾き・踏み込み・潰しで差を付ける）
          if (vr === 'f') { lean *= 2.1; reach += 8; back = 0; br = big ? -0.14 : -0.1; ghost = 1; } // 前進技：発生前から前のめり（引かない）
          else if (vr === 'b') { back += 12; br += 0.17; lean += 0.1; reach += 6; } // 後退技：発生中は大きく後ろに反り、打ち出しで前傾
          else if (vr === '2') { lean = 0.05; reach = 12; back = 3; br = 0.02; } // 2段目：小さく速い
          else if (vr === 'x') { lean = 0.27; reach = 54; back = 26; } // フィニッシュ：強より深く
          else if (vr === 'u') { lean = -0.07; reach = lt ? 14 : 24; back = 6; br = 0.04; } // ジャグルの空中段：上を向いて小さく速く突き上げる
          else if (vr === 'g') { const L = +f.atk[1]; lean = 0.2 + 0.05 * L; reach = 44 + 9 * L; back = 22 + 4 * L; br = 0.14 + 0.03 * L; } // チャージ攻撃：Lv が高いほど深く引いて深く踏み込む
          if (t <= m.su) { let u = vr === 'g' ? 1 : t / m.su; if (big) u = u * u * (3 - 2 * u); dx = -back * u; rot = -br * u; sy = 1 - bs * u; sx = 1 + bs * 0.4 * u; if (big && t > m.su - 3) dx += (t % 2 ? 1.5 : -1.5); } // 予備動作：沈んで後ろに引く（強は深く、最後に震える）
          else if (t <= end) { const u = Math.min(1, (t - m.su) / 2); dx = -back + (reach + back) * u; rot = -br + (lean + br) * u; if (m.adv) ghost = 2; }
          else { const u = 1 - Math.min(1, (t - end) / m.rc); dx = reach * u * u; rot = lean * u; }
          if (f.air || ty === 'dive') { py = H * 0.5; rot += 0.16; }
          if (vr === 'c') { const q = t <= end ? Math.min(1, t / 3) : 1 - Math.min(1, (t - end) / m.rc); sy *= 1 - 0.22 * q; sx *= 1 + 0.06 * q; rot *= 0.6; } // しゃがみ技：低く潰して打つ
          if (vr === 'x' && t > m.su && t <= m.su + 2) white = 0.55; // フィニッシュの出際は白く光る
          if (vr === 'g') { // チャージ攻撃：Lv2 以上は出際に白く光る。Lv3 は振り抜くまで残像を引く
            const L = +f.atk[1]; if (L >= 2 && t > m.su && t <= m.su + 2) white = L === 3 ? 0.75 : 0.45;
            if (L === 3 && t <= end + 4) { ghost = 3; ga = 0.4; gfix = t <= m.su ? -9 : -20; }
          }
          if (f.cb && f.chg >= 8 && t >= m.su) { // ため中：小刻みに震え、Lv が上がるほど深く沈む。Lv が上がった瞬間は白く光る
            const L = N.chgLv(f.chg), since = L ? f.chg - N.CHG_LV[L - 1] : 9;
            dx += ((o.frame | 0) % 2 ? 1 : -1) * (0.5 + 0.7 * L); sy *= 1 - 0.018 * L; sx *= 1 + 0.008 * L;
            if (L < 3 ? since < 3 : f.chg < N.CHG_LV[2]) white = 0.65; else if (L === 3 && (o.frame | 0) % 8 < 2) white = 0.4; // Lv3 は満タンのあいだ、ゆっくり明滅する
          }
        }
        if (ty === 'warp' && t < m.su) alpha *= 0.25 + 0.3 * Math.abs(Math.sin(t));
        if (f.ht >= 0 && t >= f.ht && t - f.ht <= 5) { const zz = 1 + (hv ? 0.13 : 0.08) * (1 - (t - f.ht) / 6); sx *= zz; sy *= zz; } // ヒットの瞬間だけ拡大（強は大きく）
        break;
      }
      default: { const b = Math.sin(t * 0.08); sy = 1 + b * 0.009; sx = 1 - b * 0.004; } // 待機：呼吸（足は地面に付けたまま、ごく小さく伸び縮み）
    }
    if (o.land && st !== 'ko' && st !== 'hit') { sy *= 1 - 0.06 * o.land; sx *= 1 + 0.03 * o.land; } // 着地の瞬間だけ縦に潰れる
    if (o.win) dy = -Math.abs(Math.sin(t * 0.14)) * 12;
    if (ch.b.holo) alpha *= 0.86 + 0.1 * Math.sin(t * 0.3);
    // クロスフェード：ポーズ絵が変わってから3フレームは、前のポーズ絵を薄く重ねてパッと切り替わる感じを消す
    let old = null, oa = 0;
    if (o.slot != null && o.frame != null) {
      const pm = poseMem[o.slot];
      if (pm.ci !== f.ci || o.frame < pm.frame || o.frame - pm.frame > 20) { pm.ci = f.ci; pm.e = e; pm.prev = null; }
      else if (pm.e !== e) { pm.prev = pm.e; pm.at = o.frame; pm.e = e; }
      pm.frame = o.frame;
      if (pm.prev && pm.prev.ok && o.frame - pm.at < XFADE.length) { old = pm.prev; oa = XFADE[o.frame - pm.at]; }
    }
    c.save(); c.translate(f.x, f.y); c.scale(f.face, 1); // 原画は右向き。左向きは水平反転
    c.imageSmoothingQuality = 'low'; // 縮小済みのキャッシュを貼るだけなので高品質補間は不要
    if (streak) { // スピード線（進行方向の後ろへ流れる）
      c.save(); if (streak === 2) { c.translate(0, -H * 0.5); c.rotate(Math.atan2(m.fvy, m.fvx)); } else c.translate(0, -H * 0.5);
      for (let n = 0; n < 6; n++) {
        const len = 46 + ((t * 37 + n * 53) % 60), yy = (n - 2.5) * H * 0.13 + ((t * 11 + n * 7) % 9), x0 = -H * 0.16 - ((t * 23 + n * 31) % 30);
        c.globalAlpha = alpha * (n % 2 ? 0.5 : 0.32); c.fillStyle = n % 2 ? '#fff' : g; c.fillRect(x0 - len, yy, len, n % 2 ? 2 : 3.5);
      }
      c.restore();
    }
    const put = (img, a, ox, w, an) => { c.globalAlpha = a; c.save(); c.translate(dx + ox, dy - py); c.rotate(rot); c.scale(sx, sy); c.drawImage(img, -an, py - H, w, H); c.restore(); };
    const src = scaled(e, H * z);
    const gs = gfix || (Math.abs(f.vx) > 1 ? -f.vx * f.face * 3.2 : 0), gy = streak === 2 ? -f.vy * 2.2 : 0;
    // 残像・クロスフェード・白フラッシュは薄い重ね描きなので補間なし（最近傍）で貼る。重ね描きが続く瞬間のコマ落ちを減らすため
    c.imageSmoothingEnabled = false;
    if (gs || gy) for (let n = ghost; n >= 1; n--) { c.globalAlpha = alpha * ga / n; c.save(); c.translate(dx + gs * n, dy - py + gy * n); c.rotate(rot); c.scale(sx, sy); c.drawImage(src, -ax, py - H, Wd, H); c.restore(); }
    c.imageSmoothingEnabled = true;
    put(src, alpha, 0, Wd, ax);
    c.imageSmoothingEnabled = false;
    if (old) { const ow = old.im.naturalWidth * H / old.im.naturalHeight; put(scaled(old, H * z), alpha * oa, 0, ow, anchorX(old, ch.id) * ow); }
    if (white) put(scaled(e, H * z, '#fff'), alpha * white, 0, Wd, ax);
    c.imageSmoothingEnabled = true;
    if (st === 'guard' || st === 'block') { // ガード：前面にシールド
      const r = H * (f.cr ? 0.3 : 0.4), hy = -H * (f.cr ? 0.32 : 0.45), hx = Math.min(Wd - ax, H * 0.28) - r * 0.55;
      const a = st === 'block' ? 0.95 : 0.5 + 0.12 * Math.sin(t * 0.3);
      c.globalAlpha = alpha * a * 0.22; c.fillStyle = g; c.beginPath(); c.arc(hx, hy, r, -1.05, 1.05); c.closePath(); c.fill();
      c.strokeStyle = g; c.globalAlpha = alpha * a * 0.28; c.lineWidth = 13; c.beginPath(); c.arc(hx, hy, r, -1.05, 1.05); c.stroke();
      c.globalAlpha = alpha * a; c.lineWidth = 5; c.beginPath(); c.arc(hx, hy, r, -1.05, 1.05); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(hx, hy, r - 5, -0.95, 0.95); c.stroke();
    }
    c.globalAlpha = alpha;
    if (m) drawAtkFx(c, f, m, g, alpha, { hx: H * 0.3, hy: -H * 0.56, cy: -H * 0.5, R: m.rng * 0.96 + 18, ay: -H * 0.45, k: H / 160 });
    c.restore();
  }
  // バトル前の先回り：そのキャラの絵を表示サイズに縮小したキャッシュを、1回の呼び出しにつき1枚ずつ作る（VS 画面・ラウンド開始演出の間に呼ぶ）。
  // 試合中に初めて出るポーズで画像のデコードと縮小が走り、一瞬止まるのを防ぐ。全部そろったら true
  function warmFighter(ci) {
    const ch = CHARS[ci], id = ch.id; if (!ART[id]) return true;
    const hpx = Math.round(spriteH(ch) * SC); let pending = false;
    for (const k of ['s:' + id].concat(POSES.map(ps => 's:' + id + ':' + ps))) {
      const e = IMG[k]; if (!e || (!e.ok && !e.bad)) { pending = true; continue; }
      if (e.ok && !e.sc[hpx]) { scaled(e, hpx); return false; }
    }
    const hit = ready('s:' + id + ':hit'); if (hit && !hit.sc[hpx + '#fff']) { scaled(hit, hpx, '#fff'); return false; }
    return !pending;
  }
  const hasSprite = ci => !!spriteOf(ci);
  // スプライトがあればスプライト、無い・未ロードならベクター描画（o.sil=シルエット指定は常にベクター）
  function drawFighter(c, f, o) {
    o = o || {};
    const e = o.sil ? null : spriteOf(f.ci);
    if (e) drawSprite(c, f, o, e); else drawFighterVec(c, f, o);
  }
  // 足元の楕円の影（高く跳ぶほど小さく薄く）
  function drawShadow(c, f) {
    const ch = CHARS[f.ci], k = Math.max(0.35, 1 - (GY - f.y) / 260);
    const rx = (spriteOf(f.ci) ? spriteH(ch) * 0.27 : 38 * ch.b.wd), ry = spriteOf(f.ci) ? 11 : 8;
    c.fillStyle = `rgba(4,0,14,${0.3 + 0.28 * k})`; c.beginPath(); c.ellipse(f.x, GY + 4, rx * k, ry * k, 0, 0, PI * 2); c.fill();
    c.fillStyle = ch.col.g; c.globalAlpha = 0.13 * k; c.beginPath(); c.ellipse(f.x, GY + 4, rx * 1.3 * k, ry * 1.4 * k, 0, 0, PI * 2); c.fill(); c.globalAlpha = 1;
  }

  function drawProj(c, p, b) {
    const ch = CHARS[b.f[p.o].ci], g = ch.col.g, d = p.vx > 0 ? 1 : -1, t = b.frame;
    c.save(); c.translate(p.x, p.y); c.scale(d, 1);
    const halo = r => { c.globalAlpha = 0.24; c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, PI * 2); c.fill(); c.globalAlpha = 1; }; // 発光の代わり（ぼかし無し）
    switch (p.k) {
      case 'ofuda':
        c.fillStyle = g; c.globalAlpha = 0.35; c.fillRect(-34, -5, 28, 10); c.globalAlpha = 1;
        halo(20); c.rotate(Math.sin(t * 0.4 + p.ph) * 0.25); c.fillStyle = '#fff'; c.fillRect(-13, -8, 26, 16);
        c.fillStyle = ch.col.a; c.fillRect(-9, -2, 18, 4); c.fillRect(-2, -6, 4, 12); break;
      case 'heart':
        halo(24); c.fillStyle = ch.col.m; c.rotate(Math.sin(t * 0.3) * 0.3); c.beginPath();
        c.moveTo(0, 12); c.bezierCurveTo(-22, -4, -10, -20, 0, -7); c.bezierCurveTo(10, -20, 22, -4, 0, 12); c.fill();
        c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(-5, -6, 3, 0, PI * 2); c.fill(); break;
      case 'quake':
        c.fillStyle = g;
        for (let k = 0; k < 4; k++) { const x = -24 + k * 16, h = 18 + ((t * 3 + k * 13) % 26); c.beginPath(); c.moveTo(x - 9, 22); c.lineTo(x, 22 - h); c.lineTo(x + 9, 22); c.fill(); }
        c.fillStyle = '#fff'; c.fillRect(-28, 18, 56, 4); break;
      case 'wind':
        c.strokeStyle = g; c.lineWidth = 16; c.globalAlpha = 0.2; c.beginPath(); c.arc(-34, 0, 50, -0.85, 0.85); c.stroke(); c.lineWidth = 7; c.globalAlpha = 0.85;
        for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(-34 - k * 12, 0, 50, -0.85 + k * 0.12, 0.85 - k * 0.12); c.stroke(); c.globalAlpha *= 0.6; c.lineWidth -= 2; }
        c.globalAlpha = 1; c.fillStyle = '#ffc0e0'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(-10 + Math.sin(t * 0.3 + k * 2) * 12, -34 + k * 22, 3, 0, PI * 2); c.fill(); } break;
      case 'dragon':
        c.fillStyle = g; for (let k = 1; k < 6; k++) { c.globalAlpha = 0.5 - k * 0.08; c.beginPath(); c.arc(-k * 20, Math.sin(t * 0.4 + k) * 8, 22 - k * 3, 0, PI * 2); c.fill(); }
        c.globalAlpha = 1; halo(40); c.fillStyle = ch.col.m; c.beginPath(); c.moveTo(-28, -22); c.lineTo(36, -14); c.lineTo(14, -2); c.lineTo(36, 14); c.lineTo(-28, 22); c.closePath(); c.fill();
        c.strokeStyle = g; c.lineWidth = 3; c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(-2, -11, 4, 0, PI * 2); c.fill();
        c.strokeStyle = g; c.lineWidth = 3; c.beginPath(); c.moveTo(-22, -22); c.lineTo(-40, -36); c.moveTo(-22, 22); c.lineTo(-40, 36); c.stroke(); break;
      default: // orb
        halo(19); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 9, 0, PI * 2); c.fill();
        c.strokeStyle = g; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 0, 16, 6, t * 0.15 + p.ph, 0, PI * 2); c.stroke();
    }
    c.restore();
  }

  // ================= エフェクト =================
  const fx = { parts: [], texts: [], rings: [], slashes: [], shake: 0, flash: 0, cut: null };
  const MAX_PARTS = 150; // 粒子の上限（連続ヒットで増え続けないように。超えた分は古いものから捨てる）
  function part(p) { if (fx.parts.length >= MAX_PARTS) fx.parts.shift(); fx.parts.push(p); }
  function sparks(x, y, col, n, sp) {
    for (let i = 0; i < n; i++) { const a = Math.random() * PI * 2, v = sp * (0.4 + Math.random()); part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 14 + Math.random() * 14, max: 28, col, s: 2 + Math.random() * 3 }); }
  }
  // 足元の土煙（着地・ダッシュ）
  function dust(x, n, v) {
    for (let i = 0; i < n; i++) { const d = i % 2 ? 1 : -1; part({ x: x + d * (4 + Math.random() * 10), y: GY - 1, vx: d * (0.8 + Math.random() * v), vy: -0.4 - Math.random() * 1.6, life: 10 + Math.random() * 8, max: 18, col: 'rgba(225,210,255,.75)', s: 3 + Math.random() * 2.5 }); }
  }
  // ため中のエフェクト（BRIEF7）：足元の光の輪が立ちのぼり、光の粒が上がる。Lv が上がるほど濃く・大きく・数が増える。Lv3 は体を包む光
  function drawCharge(c, f, frame) {
    if (f.st !== 'atk' || !f.cb || f.chg < 8) return;
    const ch = CHARS[f.ci], H = spriteH(ch), L = N.chgLv(f.chg), col = CHG_COL(L, ch.col.g), rx = H * (0.24 + 0.07 * L), up = H * (0.3 + 0.14 * L);
    c.save(); c.translate(f.x, f.y);
    c.globalAlpha = 0.14 + 0.08 * L; c.fillStyle = col; c.beginPath(); c.ellipse(0, 3, rx * 1.15, rx * 0.27, 0, 0, PI * 2); c.fill();
    c.strokeStyle = col;
    for (let k = 0, n = 2 + L; k < n; k++) {
      const q = (frame * (0.035 + 0.01 * L) + k / n) % 1, w = 1 - 0.4 * q;
      c.globalAlpha = (0.4 + 0.15 * L) * (1 - q); c.lineWidth = 2 + L; c.beginPath(); c.ellipse(0, 3 - q * up, rx * w, rx * 0.25 * w, 0, 0, PI * 2); c.stroke();
    }
    for (let k = 0, n = 4 + L * 4; k < n; k++) {
      const q = (frame * (0.03 + 0.012 * L) + k * 0.37) % 1, xx = Math.sin(k * 2.4) * rx, hh = 9 + 7 * L;
      c.globalAlpha = (0.45 + 0.15 * L) * (1 - q); c.fillStyle = k % 2 ? '#fff' : col; c.fillRect(xx - 1.5, -q * (up + H * 0.3) - hh, 3, hh);
    }
    if (L === 3) {
      const pu = 0.5 + 0.5 * Math.sin(frame * 0.7);
      c.globalAlpha = 0.07 + 0.06 * pu; c.fillStyle = col; c.beginPath(); c.ellipse(0, -H * 0.45, H * 0.36, H * 0.56, 0, 0, PI * 2); c.fill();
      c.globalAlpha = 0.6 + 0.4 * pu; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, -H * 0.45, H * (0.36 + 0.02 * pu), H * (0.56 + 0.02 * pu), 0, 0, PI * 2); c.stroke();
    }
    c.restore(); c.globalAlpha = 1;
  }
  function fxEvent(e, b) {
    switch (e.k) {
      case 'hit': {
        const g = CHARS[b.f[e.s].ci].col.g;
        // 弱＝小さな火花と小さな揺れ（従来どおり）。強＝大きな火花・二重の輪・斬撃の閃光・大きな揺れ
        sparks(e.x, e.y, '#fff', e.h ? 14 : 5, e.h ? 11 : 6); sparks(e.x, e.y, g, e.h ? 18 : 6, e.h ? 8 : 4);
        fx.rings.push({ x: e.x, y: e.y, r: 6, vr: e.h ? 8 : 4.5, life: 10, col: g });
        if (e.h) {
          fx.rings.push({ x: e.x, y: e.y, r: 2, vr: 13, life: 9, col: '#fff' });
          const a = -0.75 + Math.random() * 0.5, d = e.s ? -1 : 1;
          fx.slashes.push({ x: e.x, y: e.y, a: d > 0 ? a : PI - a, len: 190, life: 10, max: 10, col: g }, { x: e.x, y: e.y, a: (d > 0 ? a : PI - a) + 1.25 * d, len: 120, life: 8, max: 8, col: '#fff' });
        }
        fx.shake = Math.max(fx.shake, e.h ? 16 : 4); if (e.h) fx.flash = 4;
        if (e.c >= 2) { fx.texts = fx.texts.filter(t => t.kind !== 'combo' + e.s); fx.texts.push({ kind: 'combo' + e.s, x: e.s ? 800 : 160, y: 150, str: e.c + ' HITS', life: 70, col: '#ffd447', size: 34 }); }
        if (e.h && e.sp) fx.texts.push({ x: e.x, y: e.y - 30, str: 'HI IMPACT', life: 40, col: '#ff8a3d', size: 22, rise: 1 });
        if (e.g >= 2) { // チャージ攻撃のヒット：Lv2 は揺れ大、Lv3 は揺れ特大＋白フラッシュ＋三重の輪
          const col = CHG_COL(e.g, g);
          fx.shake = Math.max(fx.shake, e.g === 3 ? 30 : 21); sparks(e.x, e.y, col, e.g === 3 ? 26 : 12, e.g === 3 ? 13 : 9);
          fx.rings.push({ x: e.x, y: e.y, r: 10, vr: 10, life: 12, col });
          if (e.g === 3) {
            fx.flash = 8; fx.rings.push({ x: e.x, y: e.y, r: 4, vr: 18, life: 11, col: '#fff' }, { x: e.x, y: e.y, r: 20, vr: 6, life: 12, col });
            fx.texts.push({ x: e.x, y: e.y - 40, str: 'FULL CHARGE', life: 46, col: '#ff7a3d', size: 24, rise: 1 });
          }
        }
        break;
      }
      case 'block': sparks(e.x, e.y, '#8fdcff', 6, 4); fx.rings.push({ x: e.x, y: e.y, r: 5, vr: 3, life: 8, col: '#8fdcff' }); fx.shake = Math.max(fx.shake, 2);
        if (e.g === 3) { sparks(e.x, e.y, '#fff', 14, 9); fx.rings.push({ x: e.x, y: e.y, r: 8, vr: 11, life: 10, col: '#fff' }); fx.shake = Math.max(fx.shake, 11); fx.flash = Math.max(fx.flash, 2); } // Lv3 をガード：大きく押される
        break;
      case 'chgup': { // ための段階が上がった瞬間：体から光の輪。Lv3 到達時だけ小さく画面が震える
        const col = CHG_COL(e.lv, CHARS[b.f[e.s].ci].col.g);
        fx.rings.push({ x: e.x, y: e.y - 70, r: 12, vr: 5 + e.lv * 2, life: 10, col }); sparks(e.x, e.y - 50, col, 3 + e.lv * 3, 3 + e.lv);
        if (e.lv === 3) { fx.rings.push({ x: e.x, y: e.y - 70, r: 4, vr: 13, life: 9, col: '#fff' }); fx.shake = Math.max(fx.shake, 5); }
        break;
      }
      case 'chg': { // チャージ攻撃を放った瞬間：足元の土煙と、段階の表示
        dust(e.x, 3 + e.lv * 2, 1.5 + e.lv);
        fx.texts = fx.texts.filter(t => t.kind !== 'cmd' + e.s);
        fx.texts.push({ kind: 'cmd' + e.s, x: e.s ? 800 : 160, y: 190, str: e.lv === 3 ? 'フルチャージ！' : 'ため Lv' + e.lv, life: 60, col: CHG_COL(e.lv, CHARS[b.f[e.s].ci].col.g), size: e.lv === 3 ? 28 : 22 });
        break;
      }
      case 'sp': { const ch = CHARS[b.f[e.s].ci]; fx.rings.push({ x: e.x, y: e.y, r: 10, vr: 9, life: 14, col: ch.col.g }); fx.cut = { s: e.s, str: ch.sp.name, col: ch.col.g, life: 60 }; break; }
      case 'warp': sparks(e.x, e.y, '#3dff9a', 10, 5); break;
      case 'shot': fx.rings.push({ x: e.x, y: e.y, r: 4, vr: 5, life: 8, col: CHARS[b.f[e.s].ci].col.g }); break;
      case 'dash': dust(e.x, 5, 2); break;
      case 'cmd': { // コマンドコンボ発動：技名をコンボ数表示の下に短時間出す（キャラのテーマカラー）＋足元から光の輪
        const ch = CHARS[b.f[e.s].ci], nm = ch.cmds[e.n].name;
        fx.texts = fx.texts.filter(t => t.kind !== 'cmd' + e.s);
        fx.texts.push({ kind: 'cmd' + e.s, x: e.s ? 800 : 160, y: 190, str: (ch.cmds[e.n].adv ? '★' : '') + nm, life: ch.cmds[e.n].adv ? 110 : 80, col: ch.col.g, size: nm.length > 10 ? 19 : nm.length > 8 ? 22 : 26 }); // 上級（BRIEF8）は ★ つきで少し長く出す
        fx.rings.push({ x: e.x, y: e.y + 60, r: 14, vr: 7, life: 12, col: ch.col.g });
        break;
      }
      case 'sw': if (e.v === 1) dust(e.x, 4, 2.5); else if (e.m && e.m.length === 2 && (e.m[0] === 'f' || e.m[0] === 'b')) dust(e.x, 3, 1.6); break; // ダッシュ攻撃の踏み切り／前進技・後退技の足元
      case 'land': dust(e.x, e.h ? 10 : 6, e.h ? 4 : 2.8); fx.shake = Math.max(fx.shake, e.h ? 6 : 2.5); break; // 落下攻撃の着地
      case 'ko': fx.shake = 16; fx.flash = 6; break;
    }
  }
  function fxClear() { fx.parts.length = 0; fx.texts.length = 0; fx.rings.length = 0; fx.slashes.length = 0; fx.shake = 0; fx.flash = 0; fx.cut = null; }
  function fxTick() {
    for (let i = fx.parts.length - 1; i >= 0; i--) { const p = fx.parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.35; if (--p.life <= 0) fx.parts.splice(i, 1); }
    for (let i = fx.rings.length - 1; i >= 0; i--) { const r = fx.rings[i]; r.r += r.vr; if (--r.life <= 0) fx.rings.splice(i, 1); }
    for (let i = fx.slashes.length - 1; i >= 0; i--) { if (--fx.slashes[i].life <= 0) fx.slashes.splice(i, 1); }
    for (let i = fx.texts.length - 1; i >= 0; i--) { const t = fx.texts[i]; if (t.rise) t.y -= 0.8; if (--t.life <= 0) fx.texts.splice(i, 1); }
    if (fx.shake > 0) fx.shake *= 0.82; if (fx.shake < 0.4) fx.shake = 0;
    if (fx.flash > 0) fx.flash--;
    if (fx.cut && --fx.cut.life <= 0) fx.cut = null;
  }
  function drawFx(c) {
    for (const r of fx.rings) { c.globalAlpha = r.life / 12; c.strokeStyle = r.col; c.lineWidth = 4; c.beginPath(); c.arc(r.x, r.y, r.r, 0, PI * 2); c.stroke(); }
    c.lineCap = 'round';
    for (const q of fx.slashes) { // 強ヒットの斬撃の閃光：伸びながら細く消える線
      const u = q.life / q.max, h = q.len * (0.55 + 0.45 * (1 - u)) / 2, cx = Math.cos(q.a) * h, cy = Math.sin(q.a) * h;
      c.strokeStyle = q.col; c.globalAlpha = 0.35 * u; c.lineWidth = 20 * u; c.beginPath(); c.moveTo(q.x - cx, q.y - cy); c.lineTo(q.x + cx, q.y + cy); c.stroke();
      c.strokeStyle = '#fff'; c.globalAlpha = Math.min(1, u * 1.4); c.lineWidth = 6 * u; c.beginPath(); c.moveTo(q.x - cx, q.y - cy); c.lineTo(q.x + cx, q.y + cy); c.stroke();
    }
    c.lineCap = 'butt';
    for (const p of fx.parts) { c.globalAlpha = Math.min(1, p.life / 10); c.fillStyle = p.col; c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    c.globalAlpha = 1;
    for (const t of fx.texts) { c.globalAlpha = Math.min(1, t.life / 14); text(c, t.str, t.x, t.y, t.size, t.col, 'center', true); }
    c.globalAlpha = 1;
  }

  // ================= テキスト / HUD =================
  // 文字は縁取りつきで一度だけオフスクリーンに描いてキャッシュし、以後は貼るだけ（strokeText・発光を毎フレーム実行しない）。
  // 注意：呼び出し側の c.font は変更しない
  function text(c, s, x, y, px, col, align, it, strokeCol) {
    s = String(s); if (!s) return;
    col = col || '#fff';
    const e = sprite('t' + px + (it ? 'i' : 'n') + col + '|' + (strokeCol || '') + '|' + s, () => {
      MC.font = font(px, it);
      const w = MC.measureText(s).width, lw = Math.max(3, px * 0.18), pad = Math.ceil(lw / 2 + px * 0.3) + 1, mid = Math.ceil(px * 0.75) + pad;
      const sp = mkSprite(w + pad * 2, mid * 2, q => {
        q.font = font(px, it); q.textAlign = 'left'; q.textBaseline = 'middle'; q.lineJoin = 'round';
        q.strokeStyle = strokeCol || 'rgba(8,2,24,.92)'; q.lineWidth = lw; q.strokeText(s, pad, mid); q.fillStyle = col; q.fillText(s, pad, mid);
      });
      sp.w = w; sp.pad = pad; sp.mid = mid; return sp;
    });
    blit(c, e, x - e.pad - (align === 'center' ? e.w / 2 : align === 'right' ? e.w : 0), y - e.mid);
  }
  function neonText(c, s, x, y, px, col, align) {
    s = String(s); if (!s) return;
    const e = sprite('n' + px + col + '|' + s, () => {
      MC.font = font(px, true);
      const w = MC.measureText(s).width, blur = px * 0.45, pad = Math.ceil(blur * 2.2 + px * 0.2), mid = Math.ceil(px * 0.75) + pad;
      const sp = mkSprite(w + pad * 2, mid * 2, q => {
        q.font = font(px, true); q.textAlign = 'left'; q.textBaseline = 'middle';
        glow(q, col, blur); q.fillStyle = col; q.fillText(s, pad, mid); noGlow(q);
        q.fillStyle = '#fff'; q.globalAlpha = 0.9; q.fillText(s, pad, mid - 1);
      });
      sp.w = w; sp.pad = pad; sp.mid = mid; return sp;
    });
    align = align || 'center';
    blit(c, e, x - e.pad - (align === 'center' ? e.w / 2 : align === 'right' ? e.w : 0), y - e.mid);
  }
  const GR = {}; // HP バーのグラデーション（毎フレーム作らない）
  function bar(c, x, y, w, h, frac, ghost, right, c0, c1) {
    const sk = 8, shape = (x0, x1) => { c.beginPath(); c.moveTo(x0 + sk, y); c.lineTo(x1 + sk, y); c.lineTo(x1, y + h); c.lineTo(x0, y + h); c.closePath(); };
    c.fillStyle = 'rgba(8,2,24,.8)'; shape(x - 2, x + w + 2); c.fill();
    const seg = fr => (right ? [x + w * (1 - fr), x + w] : [x, x + w * fr]);
    if (ghost > frac) { c.fillStyle = '#fff3b0'; const s = seg(ghost); shape(s[0], s[1]); c.fill(); }
    if (frac > 0) { const gk = x + '|' + w + '|' + (right ? 1 : 0) + c0 + c1; let g = GR[gk]; if (!g) { g = GR[gk] = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, right ? c1 : c0); g.addColorStop(1, right ? c0 : c1); } c.fillStyle = g; const s = seg(frac); shape(s[0], s[1]); c.fill(); c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(s[0] + sk, y + 1, Math.max(0, s[1] - s[0] - 2), h * 0.3); }
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.5; shape(x - 2, x + w + 2); c.stroke();
  }
  // view: { ghost:[hp,hp], labels:[str,str] }
  function drawHud(c, b, view, T) {
    for (let i = 0; i < 2; i++) {
      const f = b.f[i], ch = CHARS[f.ci], right = i === 0, x = i ? 524 : 96, w = 340;
      const frac = Math.max(0, f.hp / ch.hp);
      view.ghost[i] = Math.max(frac, (view.ghost[i] == null ? frac : view.ghost[i]) - 0.006);
      bar(c, x, 26, w, 17, frac, view.ghost[i], right, i ? '#1fd1ff' : '#ff3d7f', i ? '#9cf3ff' : '#ffb03d');
      text(c, ch.en, i ? x + w : x + 6, 14, 15, '#fff', i ? 'right' : 'left', true);
      text(c, (view.labels && view.labels[i] || '') + '  ' + ch.name, i ? x + 6 : x + w, 14, 12, i ? '#9cf3ff' : '#ffb0c8', i ? 'left' : 'right');
      // 必殺ゲージ
      const mw = 170, mx = i ? x + w - mw : x + 8, ready = f.meter >= N.COST, mf = f.meter / 100;
      c.fillStyle = 'rgba(8,2,24,.8)'; c.fillRect(mx - 1, 49, mw + 2, 8);
      c.fillStyle = ready ? (Math.floor(T / 6) % 2 ? '#fff6a8' : '#ffd447') : '#7a6cff';
      if (i) c.fillRect(mx + mw * (1 - mf), 50, mw * mf, 6); else c.fillRect(mx, 50, mw * mf, 6);
      c.fillStyle = 'rgba(8,2,24,.9)'; c.fillRect(mx + mw / 2 - 1, 49, 2, 8);
      text(c, ready ? '必殺 OK' : '必殺', i ? mx - 6 : mx + mw + 6, 54, 11, ready ? '#ffd447' : '#b9a8ff', i ? 'right' : 'left');
      // ためゲージ（BRIEF7）：必殺ゲージのすぐ下の細いバー。ため中だけ伸び、Lv1 / Lv2 の境目に目盛り。満タン（Lv3）で色が変わって点滅する。放った直後はその Lv のまま残す
      const rl = f.st === 'atk' && N.isChg(f.atk) ? +f.atk[1] : 0, cgN = f.st === 'atk' && f.cb ? f.chg : rl ? N.CHG_LV[rl - 1] : 0, cl = rl || N.chgLv(cgN), cf = cgN / N.CHG_LV[2];
      const ccol = cl === 3 ? (Math.floor(T / 4) % 2 ? '#fff' : '#ff7a3d') : cl === 2 ? '#ffe066' : cl === 1 ? '#5fe0ff' : '#9fb4d8';
      c.fillStyle = 'rgba(8,2,24,.8)'; c.fillRect(mx - 1, 60, mw + 2, 7);
      c.fillStyle = ccol; if (i) c.fillRect(mx + mw * (1 - cf), 61, mw * cf, 5); else c.fillRect(mx, 61, mw * cf, 5);
      c.fillStyle = 'rgba(255,255,255,.55)'; for (const q of [N.CHG_LV[0] / N.CHG_LV[2], N.CHG_LV[1] / N.CHG_LV[2]]) c.fillRect(mx + mw * (i ? 1 - q : q) - 1, 60, 2, 7);
      text(c, cgN ? (cl === 3 ? 'ため MAX' : 'ため Lv' + cl) : 'ため', i ? mx - 6 : mx + mw + 6, 65, 10, cgN ? (cl === 3 ? '#ff7a3d' : ccol) : '#7f8bb0', i ? 'right' : 'left');
      // ラウンド取得マーク
      for (let k = 0; k < N.WINS; k++) { const px = i ? 536 + k * 18 : 424 - k * 18; c.fillStyle = k < f.wins ? '#ffd447' : 'rgba(8,2,24,.8)'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px, 60); c.lineTo(px + 6, 66); c.lineTo(px, 72); c.lineTo(px - 6, 66); c.closePath(); c.fill(); c.stroke(); }
    }
    const sec = Math.ceil(b.timer / 60);
    text(c, String(sec), 480, 36, 44, sec <= 10 ? '#ff5a5a' : '#ffd447', 'center', true);
    // 必殺技カットイン
    if (fx.cut) {
      const k = fx.cut, a = Math.min(1, k.life / 12, (60 - k.life) / 6), x = k.s ? 950 : 10;
      c.globalAlpha = a * 0.85; c.fillStyle = 'rgba(8,2,24,.8)'; c.fillRect(k.s ? 560 : 0, 96, 400, 34); c.fillStyle = k.col; c.fillRect(k.s ? 560 : 0, 128, 400, 3);
      c.globalAlpha = a; text(c, k.str, x, 113, 22, k.col, k.s ? 'right' : 'left', true); c.globalAlpha = 1;
    }
    // フェーズ表示
    if (b.phase === 'intro') {
      if (b.pt < 58) { c.globalAlpha = Math.min(1, b.pt / 8); neonText(c, 'ROUND ' + b.round, 480, 230, 64, '#5fe0ff'); c.globalAlpha = 1; }
      else splash(c, '対戦', (b.pt - 58) / 52);
    } else if (b.phase === 'fight' && b.pt === 0 && b.timer > 3600 - 30) {
      c.globalAlpha = 1 - (3600 - b.timer) / 30; splash(c, '対戦', 1); c.globalAlpha = 1;
    } else if (b.phase === 'ko') {
      const s = b.tu ? 'TIME UP' : 'K.O.', k = Math.min(1, b.pt / 10);
      c.save(); c.translate(480, 236); c.scale(2 - k, 2 - k); c.globalAlpha = k; neonText(c, s, 0, 0, 92, b.tu ? '#ffd447' : '#ff3d7f'); c.restore();
      if (b.pt > 50) text(c, b.rw < 0 ? 'DRAW' : CHARS[b.f[b.rw].ci].name + ' の勝ち', 480, 310, 24, '#fff', 'center');
    } else if (b.phase === 'over') {
      neonText(c, 'WINNER', 480, 200, 58, '#ffd447');
      text(c, CHARS[b.f[b.winner].ci].name + '  ' + CHARS[b.f[b.winner].ci].en, 480, 262, 30, '#fff', 'center', true);
    }
  }
  function splash(c, s, u) {
    const k = Math.min(1, u * 4);
    c.save(); c.translate(480, 232); c.rotate(-0.06); c.scale(1.7 - 0.7 * k, 1.7 - 0.7 * k);
    c.fillStyle = 'rgba(8,2,24,.85)'; c.beginPath(); c.moveTo(-190, -20); c.lineTo(170, -52); c.lineTo(196, 30); c.lineTo(-160, 52); c.closePath(); c.fill();
    const e = sprite('splash|' + s, () => {
      MC.font = font(96, true); const w = MC.measureText(s).width, pad = 48, mid = 72 + pad;
      const sp = mkSprite(w + pad * 2, mid * 2, q => {
        q.font = font(96, true); q.textAlign = 'left'; q.textBaseline = 'middle'; q.lineJoin = 'round';
        q.strokeStyle = '#fff'; q.lineWidth = 12; q.strokeText(s, pad, mid); glow(q, '#ff3d3d', 18); q.fillStyle = '#e8102e'; q.fillText(s, pad, mid); noGlow(q);
      });
      sp.w = w; sp.pad = pad; sp.mid = mid; return sp;
    });
    c.drawImage(e.cv, -e.pad - e.w / 2, -e.mid, e.lw, e.lh);
    c.restore();
  }

  const landMem = [{ y: GY, at: -99, frame: 0 }, { y: GY, at: -99, frame: 0 }];
  function drawBattle(c, b, view, T) {
    // 揺れは実ピクセル単位に丸める（背景を等倍のまま貼れるように）
    const sx = fx.shake ? Math.round((Math.random() - 0.5) * fx.shake * 2 * SC) / SC : 0, sy = fx.shake ? Math.round((Math.random() - 0.5) * fx.shake * SC) / SC : 0;
    c.save(); c.translate(sx, sy);
    drawStage(c, T, 0);
    drawShadow(c, b.f[0]); drawShadow(c, b.f[1]);
    // 着地の検出（描画側だけで持つ。sim には触らない）：空中→接地に変わったフレームから2フレーム強く、3フレーム目は弱く潰す
    const land = [0, 0];
    for (let i = 0; i < 2; i++) {
      const f = b.f[i], mem = landMem[i];
      if (b.frame < mem.frame) mem.at = -99;
      if (mem.y < GY && f.y >= GY && b.frame > mem.frame) { mem.at = b.frame; if (f.st !== 'atk' && f.st !== 'ko' && b.frame - mem.frame < 4) dust(f.x, 6, 2.2); } // 着地の小さな土煙（落下攻撃は sim のイベント側で出す）
      mem.y = f.y; mem.frame = b.frame;
      const d = b.frame - mem.at; land[i] = d <= 1 ? 1 : d === 2 ? 0.5 : 0;
    }
    // 攻撃中の側を手前に描く
    const front = b.f[1].st === 'atk' ? 1 : 0;
    drawFighter(c, b.f[1 - front], { win: b.phase === 'over' && b.winner === 1 - front, land: land[1 - front], slot: 1 - front, frame: b.frame });
    drawFighter(c, b.f[front], { win: b.phase === 'over' && b.winner === front, land: land[front], slot: front, frame: b.frame });
    drawCharge(c, b.f[0], b.frame); drawCharge(c, b.f[1], b.frame);
    for (const p of b.p) drawProj(c, p, b);
    drawFx(c); drawPetals(c, T);
    c.restore();
    if (fx.flash > 0) { c.fillStyle = `rgba(255,255,255,${fx.flash * 0.07})`; c.fillRect(0, 0, W, HH); }
    drawHud(c, b, view, T);
  }

  // キャラ選択用ポートレート
  function drawPortrait(c, ci, x, y, w, h, o) {
    o = o || {};
    const ch = CHARS[ci], col = o.locked ? '#5b5770' : ch.col.g;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    const g = c.createLinearGradient(0, y, 0, y + h);
    if (o.locked) { g.addColorStop(0, '#1b1830'); g.addColorStop(1, '#0a0816'); } else { g.addColorStop(0, '#120a2c'); g.addColorStop(1, ch.col.a === '#12161c' ? '#0c3a2e' : ch.col.a); }
    c.fillStyle = g; c.fillRect(x, y, w, h);
    if (!o.locked) { c.globalAlpha = 0.22; c.fillStyle = ch.col.g; c.beginPath(); c.arc(x + w / 2, y + h * 0.5, w * 0.48, 0, PI * 2); c.fill(); c.globalAlpha = 0.18; c.strokeStyle = ch.col.g; c.lineWidth = 1; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(x, y + k * h / 5); c.lineTo(x + w, y + k * h / 5 - 18); c.stroke(); } c.globalAlpha = 1; }
    const por = portraitOf(ci);
    if (por) {
      // 顔寄りの絵をセルに cover フィット（上寄せ）。ロック中は黒く伏せたシルエットにする
      const pw = por.im.naturalWidth, ph = por.im.naturalHeight, k = Math.max(w / pw, h / ph), dw = pw * k, dh = ph * k;
      const bob = o.locked ? 0 : Math.sin((o.t || 0) * 0.09) * 2;
      const zz = Math.abs(c.getTransform().a); // 実ピクセルの大きさに縮小済みのキャッシュを貼る
      c.drawImage(scaled(por, dh * zz, o.locked ? '#05030a' : null), x + (w - dw) / 2, y + bob + 2, dw, dh);
      const ng = c.createLinearGradient(0, y + h - 46, 0, y + h); ng.addColorStop(0, 'rgba(8,2,24,0)'); ng.addColorStop(0.6, 'rgba(8,2,24,.78)'); ng.addColorStop(1, 'rgba(8,2,24,.92)');
      c.fillStyle = ng; c.fillRect(x, y + h - 46, w, 46); // 名前の帯
    } else {
      const s = (o.scale || 1) * (h - 30) / 158 / (ch.b.sc || 1) * Math.min(1, 1.12 / ch.b.wd);
      c.save(); c.translate(x + w / 2 - 6 * s, y + h - 24); c.scale(s, s);
      drawFighterVec(c, { ci, x: 0, y: 0, face: 1, st: 'idle', t: o.t || 0, vx: 0, atk: '' }, { sil: o.locked });
      c.restore();
    }
    if (o.locked) { text(c, '？', x + w / 2, y + h * 0.42, h * 0.3, '#8d86b3', 'center'); text(c, 'LOCKED', x + w / 2, y + h - 12, 12, '#8d86b3', 'center', true); }
    else text(c, ch.name, x + w / 2, y + h - 12, o.nameSize || 15, '#fff', 'center');
    c.restore();
    if (o.sel) { c.strokeStyle = o.selCol || '#ffd447'; c.globalAlpha = 0.22; c.lineWidth = 12; c.strokeRect(x, y, w, h); c.globalAlpha = 1; } // 選択中の発光（ぼかし無し）
    c.strokeStyle = o.sel ? (o.selCol || '#ffd447') : col; c.lineWidth = o.sel ? 4 : 2; c.strokeRect(x, y, w, h);
    if (o.tag) { c.fillStyle = o.selCol || '#ffd447'; c.fillRect(x, y - 1, 44, 16); c.font = font(11, true); c.fillStyle = '#12061f'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.tag, x + 22, y + 7.5); }
  }

  N.Draw = { W, H: HH, FONT, font, text, neonText, glow, noGlow, setScale, drawStage, drawPetals, drawFighter, drawBattle, drawPortrait, hasSprite, assetState, preloadFighter, warmFighter, preloadPortraits, preloadAll, poseKind, fxEvent, fxTick, fxClear, fx };
})();
