// NEO JAPAN CLASH — 入力（画面上ゲームパッド：マルチタッチ / キーボード）
(function () {
  'use strict';
  const N = window.NJC, K = N.K;
  const OK = 1024, BACK = 2048;
  const KEYS = {
    ArrowLeft: K.L, ArrowRight: K.R, ArrowUp: K.U, ArrowDown: K.D, KeyA: K.L, KeyD: K.R, KeyW: K.U, KeyS: K.D,
    KeyJ: K.A, KeyK: K.H, KeyL: K.S, KeyU: K.G, KeyQ: K.DL, KeyE: K.DR, Enter: OK, Space: OK, Escape: BACK,
  };
  const I = { keys: 0, pad: 0, OK, BACK, onTap: null, onMenu: null, onMute: null, onDigit: null, onGesture: null,
    latch: 0,
    // 押下はラッチしておき、フレームの合間に押して離した短いタップも必ず1フレーム分は拾う
    mask() { const m = this.keys | this.pad | this.latch; this.latch = 0; return m; } };

  addEventListener('keydown', e => {
    if (I.onGesture) I.onGesture();
    if (e.code === 'KeyM') { if (!e.repeat && I.onMute) I.onMute(); return; }
    if (e.code === 'KeyP') { if (!e.repeat) document.body.classList.toggle('nopad'); return; }
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
  function hitTest(x, y) {
    let r = dpad.getBoundingClientRect();
    if (r.width) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d < R * 1.15) {
        if (d < R * 0.16) return { bits: 0, els: [] };
        const a = Math.atan2(dy, dx), oct = Math.round(a / (Math.PI / 4)); // -4..4
        const bits = [K.R, K.R | K.D, K.D, K.D | K.L, K.L, K.L | K.U, K.U, K.U | K.R][((oct % 8) + 8) % 8];
        return { bits, els: Object.keys(arrows).filter(b => bits & b).map(b => arrows[b]) };
      }
    }
    let best = null, bd = 1e9;
    for (const f of faces) {
      r = f.el.getBoundingClientRect(); if (!r.width) continue;
      const d = Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2);
      if (d < r.width * 0.68 && d < bd) { bd = d; best = f; }
    }
    if (best) return { bits: best.bit, els: [best.el] };
    for (const s of shoulders) {
      r = s.el.getBoundingClientRect(); if (!r.width) continue;
      if (x > r.left - 8 && x < r.right + 8 && y > r.top - 8 && y < r.bottom + 10) return { bits: s.bit, els: [s.el] };
    }
    return null;
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
    if (inside($('bMute'), e)) { if (I.onMute) I.onMute(); e.preventDefault(); return; }
    if (inside($('bMenu'), e)) { if (I.onMenu) I.onMenu(); e.preventDefault(); return; }
    if (!document.body.classList.contains('nopad') && hitTest(e.clientX, e.clientY)) {
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

  N.Input = I;
})();
