// NEO JAPAN CLASH — 入力（画面上ゲームパッド：左＝バーチャルスティック・右＝ボタン。マルチタッチ / マウス / キーボード）
(function () {
  'use strict';
  const N = window.NJC, K = N.K;
  const OK = 1024, BACK = 2048;
  const KEYS = {
    ArrowLeft: K.L, ArrowRight: K.R, ArrowUp: K.U, ArrowDown: K.D, KeyA: K.L, KeyD: K.R, KeyW: K.U, KeyS: K.D,
    KeyJ: K.A, KeyK: K.H, KeyL: K.S, KeyU: K.G, KeyQ: K.DL, KeyE: K.DR, Enter: OK, Space: OK, Escape: BACK,
  };
  const I = { keys: 0, pad: 0, OK, BACK, onTap: null, onMenu: null, onMute: null, onDigit: null, onGesture: null, onFps: null, hitTest: null,
    latch: 0,
    // 押下はラッチしておき、フレームの合間に押して離した短いタップも必ず1フレーム分は拾う
    mask() { const m = this.keys | this.pad | this.latch; this.latch = 0; return m; } };

  // BRIEF10: DOM の入力オーバーレイ（名前変更・セーブコード）を開いている間は body.modal が付く。
  // その間はゲーム側でキーやタッチを拾わず、preventDefault もしない（input / textarea に普通に打てて、選択・貼り付けもできるように）
  const modal = () => document.body.classList.contains('modal');
  addEventListener('keydown', e => {
    if (modal()) return;
    if (I.onGesture) I.onGesture();
    if (e.code === 'KeyM') { if (!e.repeat && I.onMute) I.onMute(); return; }
    if (e.code === 'KeyP') { if (!e.repeat) document.body.classList.toggle('nopad'); return; }
    if (e.code === 'KeyF') { if (!e.repeat && I.onFps) I.onFps(); return; }
    if (/^(Digit|Numpad)\d$/.test(e.code)) { if (I.onDigit) I.onDigit(+e.code.slice(-1)); return; }
    if (e.code === 'Backspace') { if (I.onDigit) I.onDigit(-1); e.preventDefault(); return; }
    const b = KEYS[e.code];
    // 押し始めを見ていないキーの自動リピートは無視する（オーバーレイを Enter で閉じたあと、押しっぱなしの Enter が新しい押下に化けないように）
    if (b) { e.preventDefault(); if (e.repeat && !(I.keys & b)) return; if (!e.repeat) I.latch |= b; I.keys |= b; }
  });
  addEventListener('keyup', e => { const b = KEYS[e.code]; if (b) I.keys &= ~b; });
  addEventListener('blur', () => { I.keys = 0; ptrs.clear(); stickEnd(); recompute(); });

  // ---- 画面上ゲームパッド ----
  const $ = id => document.getElementById(id);
  const cv = $('game'), padEl = $('pad'), stickEl = $('stick'), knobEl = $('stickKnob');
  const faces = [...document.querySelectorAll('.fb')].map(el => ({ el, bit: K[el.dataset.b] }));
  const shoulders = [{ el: $('bL'), bit: K.DL }, { el: $('bR'), bit: K.DR }];
  const ptrs = new Map();
  // ---- BRIEF13: フローティング式バーチャルスティック（左側。十字キーの置き換え） ----
  // 左側の操作ゾーン（画面の左 42%・上 30% より下）に触れた位置が原点になり、そこに台座が出る。ドラッグでノブが半径 STK_R まで動き、それより先へ指が行くと台座が指を追う。
  // 離すとニュートラルに戻り、台座は左下の定位置に薄く戻る。寸法は論理座標（960×540）で持ち、画面の拡大率 k を掛けて使う。
  // 方向：不感帯 STK_DEAD を超えたベクトルの角度で決める。水平から ±35° までが左右だけ、±62° より立っていれば上下だけ、その間が斜め
  // （8等分より左右を広くしてある。歩いているつもりで少し上にずれただけでジャンプに化けないように）。
  // フリック：同じ左右方向（真横）へ FLICK_MS 以内に2回倒す（間にニュートラルへ戻すか、指を離す）と、ダッシュ（K.DL / K.DR）を1フレームだけ出す。
  const STK_R = 52, STK_DEAD = 9, STK_H = 35, STK_V = 62, FLICK_MS = 350, TAP_MS = 500, ZONE_W = 0.42, ZONE_TOP = 0.30;
  const stk = { id: null, ox: 0, oy: 0, x: 0, y: 0, bits: 0, armed: true, moved: false, t0: 0, x0: 0, y0: 0, lastDir: 0, lastT: -1e9, dashes: 0 };
  const scaleK = () => { const r = cv.getBoundingClientRect(); return (r.width || 960) / 960; };
  const inZone = (x, y) => x >= 0 && x <= innerWidth * ZONE_W && y >= innerHeight * ZONE_TOP && y <= innerHeight;
  function stickBits(dx, dy, k) {
    if (Math.hypot(dx, dy) <= STK_DEAD * k) return 0;
    const el = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI; // 水平からの角度（0〜90°）
    return (el < STK_V ? (dx < 0 ? K.L : K.R) : 0) | (el > STK_H ? (dy < 0 ? K.U : K.D) : 0);
  }
  function layoutStick() { // 台座の直径（ノブの可動半径 + ノブの半分ぶんの縁）。拡大率が変わったら付け直す
    const k = scaleK(); padEl.style.setProperty('--sd', Math.round((STK_R * 2 + 44) * k) + 'px');
  }
  function drawStick() {
    const k = scaleK(), on = stk.id !== null;
    stickEl.classList.toggle('on', on);
    if (on) { const d = stickEl.offsetWidth; stickEl.style.left = (stk.ox - d / 2) + 'px'; stickEl.style.top = (stk.oy - d / 2) + 'px'; stickEl.style.bottom = 'auto'; }
    else { stickEl.style.left = ''; stickEl.style.top = ''; stickEl.style.bottom = ''; }
    let dx = on ? stk.x - stk.ox : 0, dy = on ? stk.y - stk.oy : 0; const n = Math.hypot(dx, dy), R = STK_R * k;
    if (n > R) { dx *= R / n; dy *= R / n; }
    knobEl.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    stickEl.dataset.dir = (stk.bits & K.U ? 'U' : stk.bits & K.D ? 'D' : '') + (stk.bits & K.L ? 'L' : stk.bits & K.R ? 'R' : '');
  }
  function stickMove(x, y, now) {
    const k = scaleK(), R = STK_R * k;
    stk.x = x; stk.y = y;
    const dx = x - stk.ox, dy = y - stk.oy, n = Math.hypot(dx, dy);
    if (n > R) { stk.ox = x - dx * R / n; stk.oy = y - dy * R / n; } // 指が半径の外へ出たら台座が付いていく（切り返しが遅れないように）
    stk.bits = stickBits(x - stk.ox, y - stk.oy, k);
    if (stk.bits) stk.moved = true;
    // フリック判定：ニュートラル（または触れた直後）から真横へ倒した瞬間だけを数える。斜め・上下へ倒したら数え直し。
    // 倒したまま回しただけ（右 → 右上 → 右）ではニュートラルを通らないので数えない
    if (!stk.bits) stk.armed = true;
    else if (stk.armed) {
      stk.armed = false;
      const h = stk.bits === K.L ? -1 : stk.bits === K.R ? 1 : 0;
      if (h && h === stk.lastDir && now - stk.lastT <= FLICK_MS) { I.latch |= h < 0 ? K.DL : K.DR; stk.dashes++; stk.lastDir = 0; } // 2回目：ダッシュをワンショットで出す
      else { stk.lastDir = h; stk.lastT = now; }
    }
  }
  function stickEnd() { stk.id = null; stk.bits = 0; }
  function hitTest(x, y) {
    for (const f of faces) { // 見た目の円の範囲だけ（四角の角は円の外なので反応しない）
      const r = f.el.getBoundingClientRect(); if (!r.width) continue;
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      if (dx * dx + dy * dy <= (r.width / 2) * (r.width / 2)) return { bits: f.bit, els: [f.el] };
    }
    for (const sb of shoulders) { // 見た目の枠の範囲だけ
      const r = sb.el.getBoundingClientRect();
      if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { bits: sb.bit, els: [sb.el] };
    }
    return null;
  }
  const all = [...faces.map(f => f.el), ...shoulders.map(s => s.el)];
  function recompute() {
    let m = stk.id !== null ? stk.bits : 0; const on = new Set();
    for (const p of ptrs.values()) { const h = hitTest(p.x, p.y); if (h) { m |= h.bits; h.els.forEach(e => on.add(e)); } }
    for (const el of all) el.classList.toggle('on', on.has(el));
    drawStick();
    if ((m & ~I.pad) && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* 非対応端末 */ } }
    I.latch |= m & ~I.pad; I.pad = m;
  }
  const inside = (el, e) => { const r = el.getBoundingClientRect(); return r.width && e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6; };
  const canvasTap = (cx, cy) => {
    const r = cv.getBoundingClientRect();
    const x = (cx - r.left) / r.width * 960, y = (cy - r.top) / r.height * 540;
    if (x >= 0 && x <= 960 && y >= 0 && y <= 540 && I.onTap) I.onTap(x, y);
  };
  addEventListener('pointerdown', e => {
    if (modal()) return;
    if (I.onGesture) I.onGesture();
    if (document.body.classList.contains('portrait')) return;
    const pad = !document.body.classList.contains('nopad'), hit = pad ? hitTest(e.clientX, e.clientY) : null;
    for (const [id, fn] of [['bMute', I.onMute], ['bMenu', I.onMenu]]) {
      if (!inside($(id), e)) continue;
      // すぐ上の L/R の広げた当たり判定と重なる所は、中心に近い方を採る
      const sh = hit && hit.els[0] && hit.els[0].classList.contains('sb') ? hit.els[0].getBoundingClientRect() : null, r = $(id).getBoundingClientRect();
      if (sh && Math.hypot(e.clientX - sh.left - sh.width / 2, e.clientY - sh.top - sh.height / 2) < Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2)) break;
      if (fn) fn(); e.preventDefault(); return;
    }
    if (hit) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); recompute(); e.preventDefault(); return;
    }
    if (pad && stk.id === null && inZone(e.clientX, e.clientY)) {
      // スティック開始：触れた位置が原点。動かさずにすぐ離した場合だけ、離した時に画面タップとして扱う（左側にあるメニューのボタンを押せるように）
      stk.id = e.pointerId; stk.ox = stk.x = stk.x0 = e.clientX; stk.oy = stk.y = stk.y0 = e.clientY; stk.bits = 0; stk.armed = true; stk.moved = false; stk.t0 = e.timeStamp;
      layoutStick(); recompute(); e.preventDefault(); return;
    }
    canvasTap(e.clientX, e.clientY);
    e.preventDefault();
  }, { passive: false });
  addEventListener('pointermove', e => {
    if (e.pointerId === stk.id) { stickMove(e.clientX, e.clientY, e.timeStamp); recompute(); return; }
    const p = ptrs.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; recompute(); }
  });
  const up = e => {
    if (e.pointerId === stk.id) {
      const tap = e.type === 'pointerup' && !stk.moved && e.timeStamp - stk.t0 <= TAP_MS;
      stickEnd(); recompute();
      if (tap && !modal()) canvasTap(stk.x0, stk.y0);
      return;
    }
    if (ptrs.delete(e.pointerId)) recompute();
  };
  addEventListener('resize', layoutStick); addEventListener('load', layoutStick); addEventListener('orientationchange', () => setTimeout(layoutStick, 250)); layoutStick(); // 起動時は canvas の大きさが決まる前に一度呼ばれるので、load でも付け直す
  // ?pad デバッグ：ボタンの当たり範囲（枠）、スティックの操作ゾーン・台座（可動半径）・不感帯・ノブ・現在の方向、ゲームが受け取ったタッチ位置（十字）を重ねて表示する
  if (/[?&]pad(=|&|$)/.test(location.search)) {
    const oc = document.createElement('canvas');
    oc.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:99;pointer-events:none'; // 幅と高さを明示する（指定しないと canvas は内部解像度の大きさで出て、DPR 2 の端末では枠が2倍にずれる）
    document.body.appendChild(oc);
    const draw = () => {
      const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
      if (oc.width !== W * dpr) { oc.width = W * dpr; oc.height = H * dpr; }
      const c = oc.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      c.lineWidth = 1.5; c.font = '11px sans-serif';
      const box = (el, col) => { const r = el.getBoundingClientRect(); if (!r.width) return; c.strokeStyle = col; c.strokeRect(r.left, r.top, r.width, r.height); };
      for (const f of faces) box(f.el, '#ffd447'); for (const sb of shoulders) box(sb.el, '#ff8ad8');
      // スティック：操作ゾーン（破線）、台座＝可動半径の円、不感帯の円、ノブの位置、方向
      const k = scaleK(), on = stk.id !== null, sr = stickEl.getBoundingClientRect();
      const ox = on ? stk.ox : sr.left + sr.width / 2, oy = on ? stk.oy : sr.top + sr.height / 2;
      c.strokeStyle = 'rgba(95,224,255,.6)'; c.setLineDash([6, 5]); c.strokeRect(0.75, H * ZONE_TOP, W * ZONE_W, H * (1 - ZONE_TOP) - 0.75); c.setLineDash([]);
      c.strokeStyle = '#5fe0ff'; c.beginPath(); c.arc(ox, oy, STK_R * k, 0, 7); c.stroke();
      c.strokeStyle = '#ff8ad8'; c.beginPath(); c.arc(ox, oy, STK_DEAD * k, 0, 7); c.stroke();
      let kx = on ? stk.x - ox : 0, ky = on ? stk.y - oy : 0; const kn = Math.hypot(kx, ky); if (kn > STK_R * k) { kx *= STK_R * k / kn; ky *= STK_R * k / kn; }
      c.fillStyle = on ? '#ffd447' : 'rgba(255,212,71,.5)'; c.beginPath(); c.arc(ox + kx, oy + ky, 6, 0, 7); c.fill();
      c.strokeStyle = '#ffd447'; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + kx, oy + ky); c.stroke();
      const dir = Object.keys(K).filter(n => n.length === 1 && 'LRUD'.includes(n) && (stk.bits & K[n])).join('+') || 'ニュートラル';
      c.fillStyle = '#5fe0ff'; c.fillText('stick ' + (on ? '(' + Math.round(kx / k) + ', ' + Math.round(ky / k) + ') ' : '') + dir + '  dash×' + stk.dashes, ox - STK_R * k, oy - STK_R * k - 8);
      const now = performance.now();
      for (const p of ptrs.values()) I._lastPad = { x: p.x, y: p.y, t: now };
      if (on) I._lastPad = { x: stk.x, y: stk.y, t: now };
      const L = I._lastPad;
      if (L && now - L.t < 2500) {
        c.strokeStyle = '#ff3355'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(L.x - 16, L.y); c.lineTo(L.x + 16, L.y); c.moveTo(L.x, L.y - 16); c.lineTo(L.x, L.y + 16); c.stroke();
        c.fillStyle = '#ff3355'; c.fillText('touch (' + Math.round(L.x) + ', ' + Math.round(L.y) + ') pad=' + I.pad, L.x + 20, L.y - 8);
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  for (const ev of ['contextmenu', 'gesturestart', 'dblclick', 'selectstart']) addEventListener(ev, e => { if (!modal()) e.preventDefault(); });
  addEventListener('touchmove', e => { if (!modal()) e.preventDefault(); }, { passive: false });

  I.hitTest = hitTest; // 自動確認用
  I.stick = stk; I.STICK = { R: STK_R, DEAD: STK_DEAD, FLICK_MS, ZONE_W, ZONE_TOP, scale: scaleK }; // 自動確認用（スティックの状態と寸法）
  N.Input = I;
})();
