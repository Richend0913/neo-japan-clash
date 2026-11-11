// NEO JAPAN CLASH — 入力（画面上ゲームパッド：マルチタッチ / キーボード）
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

  addEventListener('keydown', e => {
    if (I.onGesture) I.onGesture();
    if (e.code === 'KeyM') { if (!e.repeat && I.onMute) I.onMute(); return; }
    if (e.code === 'KeyP') { if (!e.repeat) document.body.classList.toggle('nopad'); return; }
    if (e.code === 'KeyF') { if (!e.repeat && I.onFps) I.onFps(); return; }
    if (/^(Digit|Numpad)\d$/.test(e.code)) { if (I.onDigit) I.onDigit(+e.code.slice(-1)); return; }
    if (e.code === 'Backspace') { if (I.onDigit) I.onDigit(-1); e.preventDefault(); return; }
    const b = KEYS[e.code]; if (b) { if (!e.repeat) I.latch |= b; I.keys |= b; e.preventDefault(); }
  });
  addEventListener('keyup', e => { const b = KEYS[e.code]; if (b) I.keys &= ~b; });
  addEventListener('blur', () => { I.keys = 0; ptrs.clear(); recompute(); });

  // ---- 画面上ゲームパッド ----
  const $ = id => document.getElementById(id);
  const cv = $('game'), dpad = $('dpad');
  const arrows = { [K.U]: $('dU'), [K.D]: $('dD'), [K.L]: $('dL'), [K.R]: $('dR') };
  const faces = [...document.querySelectorAll('.fb')].map(el => ({ el, bit: K[el.dataset.b] }));
  const shoulders = [{ el: $('bL'), bit: K.DL }, { el: $('bR'), bit: K.DR }];
  const ptrs = new Map();
  // 十字キー：見えている矢印（.da）の四角の中は必ずその方向だけ。四角の外（すき間）は角度で決め、
  // 上下左右を各70°、斜めを各20°にする（8等分だと「上」を少し外しただけで斜めジャンプに化けるため）。中心 0.22R は不感帯。
  const DIRS = [[K.R, 0], [K.D, 90], [K.L, 180], [K.U, 270]], CARD = 35; // CARD = カーディナルの半角（度）
  function dpadBits(x, y) {
    const r = dpad.getBoundingClientRect(); if (!r.width) return -1;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d >= R * 1.3) return -1;
    if (d < R * 0.22) return 0;
    for (const b in arrows) { const q = arrows[b].getBoundingClientRect(); if (x >= q.left && x <= q.right && y >= q.top && y <= q.bottom) return +b; }
    const a = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    let bits = 0, best = 0, bd = 999;
    for (const [bit, ang] of DIRS) {
      const df = Math.abs(((a - ang + 540) % 360) - 180);
      if (df <= CARD) return bit;
      if (df < 90 - CARD) bits |= bit; // 斜めの20°帯（隣り合う2方向の両方から 35°超〜55°未満）
      if (df < bd) { bd = df; best = bit; }
    }
    return bits || best;
  }
  // 丸ボタンと L/R：見た目より広く拾う（丸＝半径+8px 以上、L/R＝外側に12px）。範囲が重なったら中心に近い方
  function hitTest(x, y) {
    const db = dpadBits(x, y);
    if (db >= 0) return { bits: db, els: Object.keys(arrows).filter(b => db & b).map(b => arrows[b]) };
    let best = null, bd = 1e9;
    for (const f of faces) {
      const r = f.el.getBoundingClientRect(); if (!r.width) continue;
      const d = Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2);
      if (d < Math.max(r.width * 0.7, r.width / 2 + 8) && d < bd) { bd = d; best = f; }
    }
    for (const s of shoulders) {
      const r = s.el.getBoundingClientRect(); if (!r.width) continue;
      const d = Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2);
      if (x > r.left - 12 && x < r.right + 12 && y > r.top - 12 && y < r.bottom + 12 && d < bd) { bd = d; best = s; }
    }
    if (!best) { // ボタン群の範囲内なら、個別の半径の外でも一番近い丸ボタンを拾う（指の腹で押す実機向け）
      const br = $('btns').getBoundingClientRect();
      if (br.width && x > br.left - 14 && x < br.right + 14 && y > br.top - 14 && y < br.bottom + 14) {
        for (const f of faces) {
          const r = f.el.getBoundingClientRect(); if (!r.width) continue;
          const d = Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2);
          if (d < bd) { bd = d; best = f; }
        }
      }
    }
    return best ? { bits: best.bit, els: [best.el] } : null;
  }
  const all = [...Object.values(arrows), ...faces.map(f => f.el), ...shoulders.map(s => s.el)];
  function recompute() {
    let m = 0; const on = new Set();
    for (const p of ptrs.values()) { const h = hitTest(p.x, p.y); if (h) { m |= h.bits; h.els.forEach(e => on.add(e)); } }
    for (const el of all) el.classList.toggle('on', on.has(el));
    if ((m & ~I.pad) && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* 非対応端末 */ } }
    I.latch |= m & ~I.pad; I.pad = m;
  }
  const inside = (el, e) => { const r = el.getBoundingClientRect(); return r.width && e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6; };
  addEventListener('pointerdown', e => {
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
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 960, y = (e.clientY - r.top) / r.height * 540;
    if (x >= 0 && x <= 960 && y >= 0 && y <= 540 && I.onTap) I.onTap(x, y);
    e.preventDefault();
  }, { passive: false });
  addEventListener('pointermove', e => { const p = ptrs.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; recompute(); } });
  const up = e => { if (ptrs.delete(e.pointerId)) recompute(); };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  for (const ev of ['contextmenu', 'gesturestart', 'dblclick', 'selectstart']) addEventListener(ev, e => e.preventDefault());
  addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  I.hitTest = hitTest; // 自動確認用
  N.Input = I;
})();
