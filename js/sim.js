// NEO JAPAN CLASH — 対戦シミュレーション（描画なし・ブラウザ / node 共用・状態は JSON 化可能）
(function (root) {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const CHARS = NODE ? require('./data.js').CHARS : root.NJC.CHARS;
  const K = { L: 1, R: 2, U: 4, D: 8, A: 16, H: 32, S: 64, G: 128, DL: 256, DR: 512 };
  const GY = 452, XL = 45, XR = 915, GRAV = 0.78, COST = 50, ROUND_FRAMES = 3600, WINS = 2;

  function newFighter(ci, side) {
    const c = CHARS[ci];
    return { ci, x: side ? 610 : 350, y: GY, vx: 0, vy: 0, face: side ? -1 : 1, hp: c.hp, meter: 30,
      st: 'idle', t: 0, atk: '', air: 0, hn: 0, ht: -99, stun: 0, combo: 0, dcd: 0, inv: 0, wins: 0, pi: 0, cr: 0 };
  }
  function newBattle(c0, c1) {
    return { f: [newFighter(c0, 0), newFighter(c1, 1)], p: [], timer: ROUND_FRAMES, round: 1,
      phase: 'intro', pt: 0, stop: 0, frame: 0, winner: -1, rw: -1, tu: 0, ev: [] };
  }
  function resetRound(b) {
    for (let i = 0; i < 2; i++) {
      const o = b.f[i], n = newFighter(o.ci, i);
      n.wins = o.wins; n.meter = o.meter; n.pi = o.pi; b.f[i] = n;
    }
    b.p = []; b.timer = ROUND_FRAMES; b.phase = 'intro'; b.pt = 0; b.rw = -1; b.tu = 0; b.stop = 0;
  }
  const mv = (c, k) => (k === 'l' ? c.l : k === 'h' ? c.h : c.sp);
  function setSt(f, s) { if (f.st !== s) { f.st = s; f.t = 0; } }
  function hurt(f) {
    const c = CHARS[f.ci], sc = c.b.sc || 1;
    const w = 22 * c.b.wd * sc, h = ((f.st === 'crouch' || f.cr) ? 72 : 114) * sc;
    return { x0: f.x - w, x1: f.x + w, y0: f.y - h, y1: f.y };
  }

  function doHit(b, ai, m, px, py, proj) {
    if (b.phase !== 'fight') return false;
    const a = b.f[ai], d = b.f[1 - ai], ca = CHARS[a.ci];
    if (d.inv > 0 || d.st === 'ko') return false;
    const dir = proj ? m.dir : a.face;
    const guarding = (d.st === 'guard' || d.st === 'block') && d.face === -dir && !m.unblock && d.y >= GY;
    if (guarding) {
      const chip = Math.max(1, Math.round(m.dmg * ca.pow * 0.12));
      d.hp = Math.max(1, d.hp - chip);
      d.st = 'block'; d.t = 0; d.stun = m.heavy ? 16 : 11; d.vx = dir * (m.kb || 4) * 0.7;
      d.meter = Math.min(100, d.meter + 3);
      b.ev.push({ k: 'block', x: px, y: py }); b.stop = 3;
    } else {
      d.combo = d.st === 'hit' ? d.combo + 1 : 1;
      const scale = Math.max(0.4, 1 - 0.12 * (d.combo - 1));
      const dmg = Math.max(1, Math.round(m.dmg * ca.pow * scale));
      d.hp -= dmg; d.st = 'hit'; d.t = 0; d.cr = 0; d.atk = ''; d.air = 0;
      d.stun = m.hs || 15; d.vx = dir * (m.kb || 4);
      if (m.launch) { d.vy = -m.launch; d.y = Math.min(d.y, GY - 1); d.stun = Math.max(d.stun, 34); }
      else if (d.y < GY) d.vy = -5;
      a.meter = Math.min(100, a.meter + dmg * 1.1); d.meter = Math.min(100, d.meter + dmg * 0.7);
      b.ev.push({ k: 'hit', x: px, y: py, h: (m.heavy || m.launch) ? 1 : 0, sp: m.sp ? 1 : 0, c: d.combo, s: ai, d: dmg });
      b.stop = m.heavy ? 7 : 4;
      if (d.hp <= 0) { d.hp = 0; d.st = 'ko'; d.t = 0; d.vy = -9; d.vx = dir * 6; d.y = Math.min(d.y, GY - 1); }
    }
    if (!proj && a.y >= GY && (d.x <= XL + 2 || d.x >= XR - 2)) a.vx = -dir * (m.kb || 4) * 0.8;
    return true;
  }

  function startAtk(b, i, k) {
    const f = b.f[i];
    f.st = 'atk'; f.t = 0; f.atk = k; f.hn = 0; f.ht = -99; f.air = f.y < GY ? 1 : 0; f.cr = 0;
    if (k === 's') b.ev.push({ k: 'sp', x: f.x, y: f.y - 70, s: i });
    else b.ev.push({ k: 'sw', h: k === 'h' ? 1 : 0 });
  }

  function spawnProj(b, i, f, m) {
    const p = m.proj;
    for (let k = 0; k < p.n; k++) {
      b.p.push({ o: i, x: f.x + f.face * 34, y: p.ground ? GY - p.h / 2 : f.y - 72,
        vx: f.face * (p.vx + k * (p.dvx || 0)), vy: (p.vy0 || 0) + (k - (p.n - 1) / 2) * (p.spread || 0),
        g: p.g || 0, bn: p.bn || 0, wv: p.wv || 0, ph: k * 9, life: p.life, dmg: p.dmg, w: p.w, h: p.h, k: p.k,
        hs: p.hs || 16, kb: p.kb || 4, la: p.la || 0, hv: p.hv || 0 });
    }
    b.ev.push({ k: 'shot', x: f.x + f.face * 34, y: f.y - 72, s: i });
  }

  function updAtk(b, i, f, o, c) {
    const m = mv(c, f.atk), t = f.t, ty = f.atk === 's' ? m.type : '', gnd = f.y >= GY;
    if (!f.air) {
      if (ty === 'dive') {
        if (t === 1) { f.vy = -13; f.vx = f.face * 1.5; }
        else if (t === m.su) { f.vy = 10; f.vx = f.face * 11; }
      } else if (ty === 'upper') {
        if (t === m.su) { f.vy = m.jump; f.vx = f.face * 3; }
        if (t < m.su + 4) f.inv = 2; else if (gnd) f.vx *= 0.7;
      } else if (gnd) {
        if (m.adv && t > m.su - 2 && t <= m.su + m.ac) f.vx = f.face * m.adv; else f.vx *= 0.7;
      }
      if (ty === 'warp' && t === m.su - 1) {
        const side = o.x > f.x ? 1 : -1;
        let nx = o.x + side * 62;
        if (nx > XR - 10 || nx < XL + 10) nx = o.x - side * 62;
        b.ev.push({ k: 'warp', x: f.x, y: f.y - 60 });
        f.x = nx; f.face = o.x >= f.x ? 1 : -1;
        b.ev.push({ k: 'warp', x: f.x, y: f.y - 60 });
      }
      if (m.proj && t === m.su) spawnProj(b, i, f, m);
    }
    if (t > m.su && t <= m.su + m.ac && m.dmg > 0 && f.hn < (m.hits || 1) && t - f.ht >= (m.gap || 1)) {
      const xa = f.x + f.face * 6, xb = f.x + f.face * m.rng;
      const bx0 = Math.min(xa, xb), bx1 = Math.max(xa, xb);
      let y0 = f.y - (m.y1 || 100), y1 = f.y - (m.y0 || 25);
      if (f.air || ty === 'dive') { y0 = f.y - 95; y1 = f.y + 18; }
      const h = hurt(o);
      if (bx1 > h.x0 && bx0 < h.x1 && y1 > h.y0 && y0 < h.y1 && !(ty === 'grab' && o.y < GY)) {
        const px = Math.max(bx0, Math.min(bx1, o.x)), py = (Math.max(y0, h.y0) + Math.min(y1, h.y1)) / 2;
        if (doHit(b, i, m, px, py, false)) { f.hn++; f.ht = t; }
      }
    }
    if (f.st === 'atk' && t >= m.su + m.ac + m.rc) {
      if (f.y < GY) { f.st = 'jump'; f.atk = ''; } else { f.st = 'idle'; f.t = 0; f.vx = 0; f.atk = ''; }
    }
  }

  function upd(b, i, inp) {
    const f = b.f[i], o = b.f[1 - i], c = CHARS[f.ci];
    const pr = inp & ~f.pi; f.pi = inp; f.t++;
    if (f.dcd > 0) f.dcd--;
    if (f.inv > 0) f.inv--;
    const gnd = f.y >= GY;
    if (f.st === 'hit' || f.st === 'block') {
      f.stun--; if (gnd) f.vx *= 0.84;
      if (f.stun <= 0 && gnd) { f.st = 'idle'; f.t = 0; f.vx = 0; f.combo = 0; }
    } else if (f.st === 'ko') {
      if (gnd) f.vx *= 0.8;
    } else if (f.st === 'dash') {
      if (f.t >= 11) { f.st = 'idle'; f.t = 0; f.vx = 0; }
    } else if (f.st === 'atk') {
      updAtk(b, i, f, o, c);
    } else if (f.st === 'jump') {
      if (pr & K.A) startAtk(b, i, 'l'); else if (pr & K.H) startAtk(b, i, 'h');
    } else {
      if (f.x !== o.x) f.face = o.x > f.x ? 1 : -1;
      f.cr = 0;
      if ((pr & K.S) && f.meter >= COST) { f.meter -= COST; startAtk(b, i, 's'); }
      else if (pr & K.A) startAtk(b, i, 'l');
      else if (pr & K.H) startAtk(b, i, 'h');
      else if (inp & K.G) { setSt(f, 'guard'); f.vx = 0; f.cr = (inp & K.D) ? 1 : 0; }
      else if ((pr & (K.DL | K.DR)) && !f.dcd) {
        f.st = 'dash'; f.t = 0; f.vx = ((pr & K.DL) ? -1 : 1) * (6 + c.spd * 1.2); f.dcd = 28;
        b.ev.push({ k: 'dash', x: f.x, y: f.y });
      }
      else if (inp & K.U) { f.st = 'jump'; f.t = 0; f.vy = -14.5; f.vx = (((inp & K.R) ? 1 : 0) - ((inp & K.L) ? 1 : 0)) * c.spd * 0.95; }
      else if (inp & K.D) { setSt(f, 'crouch'); f.vx = 0; }
      else {
        const dx = ((inp & K.R) ? 1 : 0) - ((inp & K.L) ? 1 : 0);
        if (dx) { setSt(f, 'walk'); f.vx = dx * c.spd * (dx === f.face ? 1 : 0.8); }
        else { setSt(f, 'idle'); f.vx = 0; }
      }
    }
    // 物理
    if (f.y < GY || f.vy < 0) {
      f.vy += GRAV; f.y += f.vy;
      if (f.y >= GY) {
        f.y = GY; f.vy = 0;
        if (f.st === 'jump') { f.st = 'idle'; f.t = 0; f.vx = 0; }
        else if (f.st === 'atk') {
          const m = mv(c, f.atk);
          if (f.air) { f.st = 'idle'; f.t = 0; f.vx = 0; f.atk = ''; f.air = 0; }
          else if (f.atk === 's' && m.type === 'dive' && f.t < m.su + m.ac) { f.t = m.su + m.ac; f.vx = 0; }
        } else if (f.st === 'ko') f.vx *= 0.5;
      }
    }
    f.x += f.vx;
    if (f.x < XL) f.x = XL; if (f.x > XR) f.x = XR;
  }

  function updProj(b) {
    for (let j = b.p.length - 1; j >= 0; j--) {
      const p = b.p[j];
      p.x += p.vx; if (p.g) p.vy += p.g; p.y += p.vy;
      if (p.bn && p.y > GY - 14) { p.y = GY - 14; p.vy = -Math.abs(p.vy) * 0.9; }
      if (p.wv) p.y += Math.sin((b.frame + p.ph) * 0.2) * 2.2;
      p.life--;
      const h = hurt(b.f[1 - p.o]);
      if (p.x + p.w / 2 > h.x0 && p.x - p.w / 2 < h.x1 && p.y + p.h / 2 > h.y0 && p.y - p.h / 2 < h.y1) {
        if (doHit(b, p.o, { dmg: p.dmg, hs: p.hs, kb: p.kb, launch: p.la, heavy: p.hv, sp: 1, dir: p.vx > 0 ? 1 : -1 }, p.x, p.y, true)) {
          b.p.splice(j, 1); continue;
        }
      }
      if (p.life <= 0 || p.x < XL - 70 || p.x > XR + 70) b.p.splice(j, 1);
    }
  }

  function endRound(b) {
    if (b.rw >= 0) b.f[b.rw].wins++;
    let w = -1;
    if (b.f[0].wins >= WINS) w = 0; else if (b.f[1].wins >= WINS) w = 1;
    else if (b.round >= 6) w = b.f[1].wins > b.f[0].wins ? 1 : 0; // 引き分け続きの保険
    if (w >= 0) { b.phase = 'over'; b.pt = 0; b.winner = w; b.ev.push({ k: 'over', s: w }); }
    else { b.round++; resetRound(b); }
  }

  // 1フレーム進める。i0 / i1 は各ファイターの入力ビットマスク
  function step(b, i0, i1) {
    b.frame++;
    const f0 = b.f[0], f1 = b.f[1];
    if (b.phase === 'intro') {
      b.pt++; f0.t++; f1.t++; f0.pi = i0; f1.pi = i1;
      if (b.pt >= 110) { b.phase = 'fight'; b.pt = 0; b.ev.push({ k: 'go' }); }
      return;
    }
    if (b.stop > 0) { b.stop--; return; }
    if (b.phase === 'fight') {
      b.timer--;
      f0.meter = Math.min(100, f0.meter + 0.02); f1.meter = Math.min(100, f1.meter + 0.02);
      upd(b, 0, i0); upd(b, 1, i1);
      updProj(b);
      const dx = f1.x - f0.x, minD = 44;
      if (Math.abs(dx) < minD && Math.abs(f0.y - f1.y) < 70 && f0.st !== 'ko' && f1.st !== 'ko') {
        const s = dx >= 0 ? 1 : -1, ov = (minD - Math.abs(dx)) / 2;
        f0.x = Math.max(XL, Math.min(XR, f0.x - s * ov)); f1.x = Math.max(XL, Math.min(XR, f1.x + s * ov));
      }
      const k0 = f0.hp <= 0, k1 = f1.hp <= 0;
      if (k0 || k1) { b.phase = 'ko'; b.pt = 0; b.rw = (k0 && k1) ? -1 : k0 ? 1 : 0; b.tu = 0; b.ev.push({ k: 'ko' }); }
      else if (b.timer <= 0) {
        b.timer = 0;
        const r0 = f0.hp / CHARS[f0.ci].hp, r1 = f1.hp / CHARS[f1.ci].hp;
        b.phase = 'ko'; b.pt = 0; b.rw = r0 > r1 ? 0 : r1 > r0 ? 1 : -1; b.tu = 1; b.ev.push({ k: 'timeup' });
      }
    } else {
      b.pt++; upd(b, 0, 0); upd(b, 1, 0); b.p.length = 0;
      if (b.phase === 'ko' && b.pt >= 150) endRound(b);
    }
  }

  // ---- CPU AI ----
  const AI_T = { react: [26, 20, 14, 9, 5], aggr: [0.35, 0.5, 0.65, 0.8, 0.92], guard: [0.1, 0.25, 0.45, 0.65, 0.85], sp: [0.2, 0.35, 0.5, 0.7, 0.9] };
  function newAI(lv) { return { lv: Math.max(1, Math.min(5, lv)), cd: 20, held: 0 }; }
  function aiInput(b, i, ai) {
    if (b.phase !== 'fight') return 0;
    if (ai.cd > 0) { ai.cd--; return ai.held; }
    const n = ai.lv - 1, f = b.f[i], o = b.f[1 - i], c = CHARS[f.ci], oc = CHARS[o.ci];
    const d = Math.abs(o.x - f.x), toward = o.x > f.x ? K.R : K.L, away = o.x > f.x ? K.L : K.R, dashT = o.x > f.x ? K.DR : K.DL;
    const R = Math.random;
    let threat = o.st === 'atk' && o.atk && d < Math.min(mv(oc, o.atk).rng, 400) + 45;
    for (const p of b.p) if (p.o !== i && Math.abs(p.x - f.x) < 170 && (p.vx > 0) === (f.x > p.x)) threat = true;
    let held = 0, tap = 0;
    const sp = c.sp, r = AI_T.react[n];
    let spOk = f.meter >= COST;
    if (spOk) {
      if (sp.type === 'proj' || sp.type === 'beam') spOk = d > 130;
      else if (sp.type === 'lunge') spOk = d < sp.rng + sp.adv * 4;
      else if (sp.type === 'grab' || sp.type === 'upper') spOk = d < sp.rng - 6;
      else if (sp.type === 'quake') spOk = d < 330;
      else if (sp.type === 'dive') spOk = d > 120 && d < 380;
      else spOk = d < 480;
    }
    if (threat && R() < AI_T.guard[n]) { held = K.G; ai.cd = r + 8; ai.held = held; return held; }
    if (spOk && R() < AI_T.sp[n] * 0.45) tap = K.S;
    else if (d < c.l.rng + 8) {
      const q = R();
      if (q < AI_T.aggr[n]) tap = R() < 0.6 ? K.A : K.H;
      else if (q < AI_T.aggr[n] + 0.12) held = away;
      else held = K.G;
    } else if (d < c.h.rng + 12 && R() < AI_T.aggr[n] * 0.7) tap = K.H;
    else {
      const q = R();
      if (q < AI_T.aggr[n] + 0.12) {
        held = toward;
        if (R() < 0.08) held |= K.U;
        else if (d > 260 && R() < 0.15) tap = dashT;
      } else if (q > 0.93) held = away;
    }
    ai.held = held; ai.cd = Math.round(r * (0.6 + R() * 0.8));
    return held | tap;
  }

  const api = { K, GY, XL, XR, COST, WINS, newBattle, step, mv, hurt, newAI, aiInput };
  if (NODE) module.exports = api; else root.NJC = Object.assign(root.NJC || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
