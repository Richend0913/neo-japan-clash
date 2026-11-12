// NEO JAPAN CLASH — 対戦シミュレーション（描画なし・ブラウザ / node 共用・状態は JSON 化可能）
(function (root) {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const DATA = NODE ? require('./data.js') : root.NJC, CHARS = DATA.CHARS, CMD_TYPES = DATA.CMD_TYPES;
  const K = { L: 1, R: 2, U: 4, D: 8, A: 16, H: 32, S: 64, G: 128, DL: 256, DR: 512 };
  const GY = 452, XL = 45, XR = 915, GRAV = 0.78, COST = 50, ROUND_FRAMES = 3600, WINS = 2;
  // ---- BRIEF13: 回避ステップ・二段ジャンプ ----
  // 回避ステップ（st='evade'）＝相手から離れる方向へのダッシュ。全体 EV_T フレームのうち、出した瞬間から EV_INV フレームは無敵（f.inv。doHit が防御側の inv>0 をスキップするので、
  // 打撃も飛び道具も当たらず、ガードにもならず、ヒットイベントも出ない）。残りは減速しながらの隙。回避中は攻撃・ガード・ジャンプ不可。クールダウンは通常ダッシュ（28）より長い EV_CD。
  // 二段ジャンプ＝空中（st='jump'）でジャンプ入力の立ち上がりがあれば、もう1回だけ跳べる（f.jc で回数を数える）。
  const EV_T = 16, EV_INV = 11, EV_CD = 36, JUMP_VY = -14.5, JUMP2_VY = -12, JUMP_MAX = 2;

  function newFighter(ci, side) {
    const c = CHARS[ci];
    return { ci, x: side ? 610 : 350, y: GY, vx: 0, vy: 0, face: side ? -1 : 1, hp: c.hp, meter: 30,
      st: 'idle', t: 0, atk: '', air: 0, hn: 0, ht: -99, stun: 0, combo: 0, dcd: 0, inv: 0, jc: 0, wins: 0, pi: 0, cr: 0, chainT: 0, lastKind: '', cq: '', ct: 99, chg: 0, cb: 0 }; // jc = 地面を離れてから使ったジャンプ回数（BRIEF13 二段ジャンプ。着地・被弾で 0）。 chg/cb = ため（BRIEF7）：押し続けているフレーム数と、そのボタンのビット。 cq/ct = コマンド入力の履歴（2文字×ステップ）と最後のステップからの経過フレーム
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
  // 技データ。'l'=弱 'h'=強 's'=必殺。派生技（BRIEF4）: 'dl'/'dh'=ダッシュ攻撃、'al'/'ah'=空中の落下攻撃（弱・強のデータから作る）
  // BRIEF5: 方向つき通常技 'cl'/'ch'=しゃがみ（↓）、'fl'/'fh'=前進（相手方向）、'bl'/'bh'=後退（逆方向）。チェイン 'l2'=2段目、'lf'=フィニッシュ
  const DERIVED = {}, CHAIN = 28, CHAIN_LENIENCY = 6;
  // ---- BRIEF6: コマンドコンボ ----
  // 種別は 'c' + コマンド番号(1〜5。4・5 は BRIEF8 の上級) + 段(0〜4) + 見た目2文字（例 'c10lf'）。段のデータはコマンドの型（data.js の CMD_TYPES）と強 h から作る。
  // ・ダメージ：h.dmg × 段の割合。コンボ補正（2発目 0.88、3発目 0.76）を打ち消してあるので、全段つながったときの合計が型の目安になる
  // ・途中の段：硬直 4f ですぐ次段へ。のけぞりは次段が連続ヒットになる長さ。最終段：強扱い、硬直は通常の強 +10f
  // ・ガードされたら削りダメージなし（nochip）
  const CMD_GAP = 25, CMD_AC = 3, CMD_RC = 4;
  const cmdSu = (c, sd, s) => (s === 0 ? Math.max(11, Math.min(14, c.h.su)) : sd.su);
  const cmdKind = (c, n, s) => 'c' + (n + 1) + s + CMD_TYPES[c.cmds[n].type].st[s].v;
  const isCmd = k => k.length === 5 && k[0] === 'c';
  function cmdStage(c, k) {
    const T = CMD_TYPES[c.cmds[+k[1] - 1].type], st = T.st, s = +k[2], sd = st[s], last = s === st.length - 1, h = c.h;
    const m = { su: cmdSu(c, sd, s), ac: last ? h.ac : CMD_AC, rc: last ? h.rc + (T.rcx || 10) : CMD_RC, dmg: h.dmg * sd.f / (1 - 0.12 * s), rng: h.rng,
      hs: last ? h.hs + 1 : CMD_AC + CMD_RC + cmdSu(c, st[s + 1], s + 1) + 5, kb: last ? h.kb * (sd.kb || 1) : (sd.kbi || 3), heavy: last ? 1 : 0, nochip: 1, cmd: 1 };
    // BRIEF8 ジャグル：空中段は判定を高く・広く。pop / spike は空中の相手に当たったときの縦の速さ（doHit）
    if (sd.hi) { m.y1 = 190; m.y0 = 20; m.rng = Math.round(h.rng * 1.2); }
    if (sd.pop) m.pop = sd.pop;
    if (sd.spike) m.spike = sd.spike;
    if (sd.step) { m.step = 1; m.adv = 2.2 + c.spd * 0.3; } else if (sd.adv) m.adv = sd.adv;
    if (sd.low) { m.low = 1; m.y0 = 4; m.y1 = 62; }
    if (sd.launch) m.launch = sd.launch;
    if (sd.stopx) m.stopx = sd.stopx;
    return m;
  }
  // 履歴の末尾がコマンド列と完全一致する番号（0〜4）。無ければ -1
  function matchCmd(c, q) { for (let n = 0; n < c.cmds.length; n++) if (q.endsWith(c.cmds[n].key)) return n; return -1; }
  // ボタンが押された瞬間に1ステップ記録し、成立したコマンド番号を返す（方向は f.face で相手基準に直す）
  const cmdStep = (f, inp, pr) => ((inp & K.D) ? 'd' : (inp & (f.face > 0 ? K.R : K.L)) ? 'f' : (inp & (f.face > 0 ? K.L : K.R)) ? 'b' : 'n') + ((pr & K.A) ? 'A' : 'H');
  function recCmd(f, c, inp, pr) {
    if (!(pr & (K.A | K.H))) return -1;
    if (f.ct > CMD_GAP) f.cq = '';
    f.cq = (f.cq + cmdStep(f, inp, pr)).slice(-10); f.ct = 0; // 最長5ステップ（上級）ぶん覚える
    return matchCmd(c, f.cq);
  }
  function startCmd(b, i, n) {
    const f = b.f[i], c = CHARS[f.ci];
    f.cq = ''; f.ct = 99; f.vx = 0;
    startAtk(b, i, cmdKind(c, n, 0));
    b.ev.push({ k: 'cmd', s: i, n, x: f.x, y: f.y - 130 });
  }
  // ---- BRIEF7: ため技（チャージ攻撃） ----
  // 地上の通常技（弱・強・方向つき）を出したボタンを押し続けると、その技の発生直前（予備動作の最後のフレーム）で止まって「ため」になる。
  // f.chg = 押し始めからのフレーム数（押した瞬間が 1、CHG_LV[2] で頭打ち）。離した瞬間に、Lv0 なら止めていた通常技がそのまま出て、
  // Lv1 以上ならチャージ攻撃 'g' + Lv(1〜3) + 元のボタン('l'/'h') に切り替わる。1フレームで離せば従来とまったく同じ進行になる。
  const CHG_LV = [15, 35, 60], CHG_DMG = [1.3, 1.8, 2.6], CHG_RNG = [1.1, 1.2, 1.35], CHG_KB = [1.3, 1.7, 2.4];
  const chgLv = n => (n >= CHG_LV[2] ? 3 : n >= CHG_LV[1] ? 2 : n >= CHG_LV[0] ? 1 : 0);
  const isChg = k => k.length === 3 && k[0] === 'g';
  const canChg = k => k === 'l' || k === 'h' || (k.length === 2 && (k[1] === 'l' || k[1] === 'h') && (k[0] === 'c' || k[0] === 'f' || k[0] === 'b')); // ためられる技（チェイン・ダッシュ攻撃・落下攻撃・コマンドコンボは不可）
  function chgMove(c, k) {
    const L = +k[1], q = L - 1, n = k[2] === 'h' ? c.h : c.l;
    // ためが予備動作の代わりなので発生は短い（Lv3 だけ少し遅い）。ガードされても削りダメージなし。Lv3 はガードの上から大きく押し戻す（gkb）
    return { su: L === 3 ? 6 : 3, ac: n.ac + 1, rc: n.rc + [3, 6, 10][q], dmg: n.dmg * CHG_DMG[q], rng: Math.round(n.rng * CHG_RNG[q]),
      hs: n.hs + [3, 6, 10][q], kb: n.kb * CHG_KB[q], heavy: (n.heavy || L >= 2) ? 1 : 0, stopx: [0, 2, 6][q], adv: 1.5 + L, nochip: 1, chg: L, gkb: L === 3 ? 2.2 : 1, gs: L === 3 ? 6 : 0 };
  }
  function derive(c, k) {
    if (isCmd(k)) return cmdStage(c, k);
    if (isChg(k)) return chgMove(c, k);
    const hv = k[1] === 'h' || k === 'lf', n = hv ? c.h : c.l;
    switch (k) {
      // しゃがみ技：低い位置を打つ（y0/y1 = 判定の下端・上端の高さ）。弱はリーチが長く硬直が短い、強は重いが発生が遅い
      case 'cl': return Object.assign({}, n, { dmg: n.dmg * 0.9, rng: Math.round(n.rng * 1.15), rc: n.rc - 2, y0: 4, y1: 62, low: 1 });
      case 'ch': return Object.assign({}, n, { dmg: n.dmg * 1.1, rng: Math.round(n.rng * 1.1), su: n.su + 2, y0: 4, y1: 62, low: 1 });
      // 前進技：出した瞬間から有効フレームの終わりまで前に進み続ける（ダッシュ攻撃より遅い）
      case 'fl': return Object.assign({}, n, { dmg: n.dmg * 1.1, rc: n.rc + 2, adv: 1.2 + c.spd * 0.3, step: 1 });
      case 'fh': return Object.assign({}, n, { dmg: n.dmg * 1.05, rc: n.rc + 3, adv: 1.5 + c.spd * 0.35, step: 1 });
      // 後退技：発生前のあいだ下がり（back = 速さ）、長いリーチで打つ。硬直が大きい
      case 'bl': return Object.assign({}, n, { rng: Math.round(n.rng * 1.2), rc: n.rc + 4, back: 3 });
      case 'bh': return Object.assign({}, n, { dmg: n.dmg * 1.15, rng: Math.round(n.rng * 1.2), rc: n.rc + 5, back: 3 });
      // チェイン2段目：速く軽い。少し踏み込み、相手をあまり押さない（3段目が届くように）
      case 'l2': return Object.assign({}, n, { su: Math.max(3, n.su - 2), dmg: n.dmg * 0.8, rc: n.rc - 2, adv: 3, kb: 3 });
      // フィニッシュ：強ベース。大きく吹き飛ばし、ヒットストップが長い
      case 'lf': return Object.assign({}, n, { su: n.su - 1, dmg: n.dmg * 1.15, kb: n.kb * 1.6, stopx: 3, adv: 3 });
    }
    if (k[0] === 'd') // ダッシュ攻撃：前進しながら攻撃。踏み込み大・ダメージ中・硬直やや大
      return { su: n.su + (hv ? 0 : 2), ac: n.ac + 3, rc: n.rc + (hv ? 8 : 6), dmg: hv ? n.dmg : Math.round(n.dmg * 1.5), rng: n.rng + 8,
        adv: (hv ? 4.5 : 5.5) + c.spd * 0.6, hs: hv ? 24 : 19, kb: hv ? 10 : 7, heavy: hv ? 1 : 0, dash: 1 };
    // 落下攻撃：斜め下へ踏み込み、着地するまで判定が続く。着地硬直 rc
    return { su: hv ? 7 : 4, ac: 60, rc: hv ? 15 : 9, dmg: hv ? n.dmg : n.dmg + 1, rng: Math.round(n.rng * 0.8), hs: hv ? 23 : 16, kb: hv ? 8 : 5,
      heavy: hv ? 1 : 0, fall: 1, fvx: hv ? 6.5 : 5, fvy: hv ? 12 : 9.5 };
  }
  function mv(c, k) {
    if (k === 'l') return c.l; if (k === 'h') return c.h; if (k === 's' || !k) return c.sp;
    return DERIVED[c.id + k] || (DERIVED[c.id + k] = derive(c, k));
  }
  const isHeavy = k => k === 'h' || k === 'lf' || isChg(k) || (k.length === 2 && k[1] === 'h') || (k.length === 5 && k[3] === 'h'); // 強攻撃系（強・ダッシュ強・落下強・しゃがみ強・前進強・後退強・フィニッシュ・チャージ攻撃）
  const chainStart = k => k === 'l' || k === 'cl' || k === 'fl'; // チェインの起点になれる弱攻撃
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
      const chip = m.nochip ? 0 : Math.max(1, Math.round(m.dmg * ca.pow * 0.12)); // コマンドコンボはガードされたらダメージ 0
      d.hp = Math.max(1, d.hp - chip);
      d.st = 'block'; d.t = 0; d.stun = (m.heavy ? 16 : 11) + (m.gs || 0); d.vx = dir * (m.kb || 4) * 0.7 * (m.gkb || 1);
      d.chainT = 0; if (!proj) a.chainT = 0; // ガードした側・された側ともチェイン窓は消える
      d.meter = Math.min(100, d.meter + 3);
      b.ev.push({ k: 'block', x: px, y: py, g: m.chg || 0 }); b.stop = m.chg === 3 ? 7 : 3;
    } else {
      d.combo = d.st === 'hit' ? d.combo + 1 : 1;
      const scale = Math.max(0.4, 1 - 0.12 * (d.combo - 1));
      const dmg = Math.max(1, Math.round(m.dmg * ca.pow * scale));
      d.hp -= dmg; d.st = 'hit'; d.t = 0; d.cr = 0; d.atk = ''; d.air = 0; d.jc = 0; d.chainT = 0; d.chg = 0; d.cb = 0; // 被弾でチェイン窓は消える。ため中ならチャージも 0 に戻る
      d.stun = m.hs || 15; d.vx = dir * (m.kb || 4);
      // チェイン：弱系がコンボの1発目として当たる／2段目が当たると、攻撃側に窓が開く。
      // 次の段（idle に戻ってすぐ押した場合＋猶予 CHAIN_LENIENCY フレーム）が連続ヒットになるだけ、のけぞりを延ばす
      if (!proj && ((chainStart(a.atk) && d.combo === 1) || a.atk === 'l2')) {
        a.chainT = CHAIN; a.lastKind = a.atk;
        d.stun = Math.max(d.stun, m.ac + m.rc + mv(ca, a.atk === 'l2' ? 'lf' : 'l2').su + 1 + CHAIN_LENIENCY);
      }
      if (m.launch) { d.vy = -m.launch; d.y = Math.min(d.y, GY - 1); d.stun = Math.max(d.stun, 34); }
      else if (d.y < GY) d.vy = m.spike || -(m.pop || 5); // 空中の相手：少し浮かせ直す（ジャグルの叩き落とし段は下向き）
      a.meter = Math.min(100, a.meter + dmg * 1.1); d.meter = Math.min(100, d.meter + dmg * 0.7);
      b.ev.push({ k: 'hit', x: px, y: py, h: (m.heavy || m.launch) ? 1 : 0, sp: m.sp ? 1 : 0, c: d.combo, s: ai, d: dmg, g: m.chg || 0 });
      b.stop = (m.heavy ? 9 : 4) + (m.stopx || 0); // ヒットストップ：強は弱の2倍以上（フィニッシュはさらに +3）
      if (d.hp <= 0) { d.hp = 0; d.st = 'ko'; d.t = 0; d.vy = -9; d.vx = dir * 6; d.y = Math.min(d.y, GY - 1); }
    }
    if (!proj && a.y >= GY && (d.x <= XL + 2 || d.x >= XR - 2)) a.vx = -dir * (m.kb || 4) * 0.8;
    return true;
  }

  function startAtk(b, i, k) {
    const f = b.f[i];
    f.st = 'atk'; f.t = 0; f.atk = k; f.hn = 0; f.ht = -99; f.air = f.y < GY ? 1 : 0; f.cr = 0; f.chainT = 0; f.chg = 0; f.cb = 0; // 何か技を出したら窓は閉じる
    if (f.air) { const o = b.f[1 - i]; if (o.x !== f.x) f.face = o.x > f.x ? 1 : -1; } // 落下攻撃は相手の方へ向き直る
    if (k === 's') b.ev.push({ k: 'sp', x: f.x, y: f.y - 70, s: i });
    else b.ev.push({ k: 'sw', h: isHeavy(k) ? 1 : 0, v: k[0] === 'd' ? 1 : k[0] === 'a' ? 2 : 0, m: k, x: f.x, y: f.y, s: i });
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
        if (m.dash || m.step) { if (t <= m.su + m.ac) f.vx = f.face * m.adv; else f.vx *= 0.7; } // ダッシュ攻撃・前進技：発生前から前進し続ける
        else if (m.back && t <= m.su) f.vx = -f.face * m.back; // 後退技：発生前のあいだ下がる
        else if (m.adv && t > m.su - 2 && t <= m.su + m.ac) f.vx = f.face * m.adv; else f.vx *= 0.7;
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
    } else if (m.fall) {
      if (t < m.su) { f.vy *= 0.6; f.vx *= 0.8; } // 一瞬ためてから
      else if (t === m.su) { f.vy = Math.max(f.vy, m.fvy); f.vx = f.face * m.fvx; } // 斜め下へ踏み込む
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
    if (f.st === 'atk' && m.cmd && t >= m.su + m.ac + m.rc && +f.atk[2] + 1 < CMD_TYPES[c.cmds[+f.atk[1] - 1].type].st.length) {
      // コマンドコンボ：硬直が終わった瞬間に次の段が自動で出る（入力は受け付けない。相手の方へ向き直る）
      if (o.x !== f.x) f.face = o.x > f.x ? 1 : -1;
      startAtk(b, i, cmdKind(c, +f.atk[1] - 1, +f.atk[2] + 1));
    } else if (f.st === 'atk' && t >= m.su + m.ac + m.rc) {
      if (f.y < GY) { f.st = 'jump'; f.atk = ''; } else { f.st = 'idle'; f.t = 0; f.vx = 0; f.atk = ''; }
    }
  }

  function upd(b, i, inp) {
    const f = b.f[i], o = b.f[1 - i], c = CHARS[f.ci];
    const pr = inp & ~f.pi; f.pi = inp; f.t++;
    if (f.dcd > 0) f.dcd--;
    if (f.chainT > 0) f.chainT--;
    if (f.ct < 99) f.ct++;
    if (f.inv > 0) f.inv--;
    const gnd = f.y >= GY;
    if (f.st === 'hit' || f.st === 'block') {
      f.stun--; if (gnd) f.vx *= 0.84;
      if (f.stun <= 0 && gnd) {
        f.st = 'idle'; f.t = 0; f.vx = 0; f.combo = 0;
        // BRIEF8: ガードを押し続けていれば、硬直が解けたそのフレームからガードになる（従来は1フレームだけ無防備で、段の間隔がちょうど合うストリングがガードを抜けていた）
        if (inp & K.G) { f.st = 'guard'; f.cr = (inp & K.D) ? 1 : 0; if (f.x !== o.x) f.face = o.x > f.x ? 1 : -1; }
      }
    } else if (f.st === 'ko') {
      if (gnd) f.vx *= 0.8;
    } else if (f.st === 'dash') {
      if (f.t >= 11) { f.st = 'idle'; f.t = 0; f.vx = 0; }
      else if ((pr & (K.A | K.H)) && (f.vx > 0 ? 1 : -1) === f.face) startAtk(b, i, (pr & K.A) ? 'dl' : 'dh'); // 前ダッシュ中の弱/強＝ダッシュ攻撃
    } else if (f.st === 'evade') {
      // BRIEF13 回避ステップ：無敵（f.inv）が切れたら減速して隙になる。攻撃・ガード・ジャンプは受け付けない
      if (f.t >= EV_T) { f.st = 'idle'; f.t = 0; f.vx = 0; }
      else if (f.t >= EV_INV) f.vx *= 0.72;
    } else if (f.st === 'atk' && f.cb && (inp & f.cb) && b.phase === 'fight') {
      // BRIEF7 ため中：ボタンを押し続けている。予備動作は普通に進み、発生直前（t = su）で止まる。止まっている間は動けず、ガードもできない
      const m = mv(c, f.atk), lv0 = chgLv(f.chg);
      if (f.chg < CHG_LV[2]) f.chg++;
      const lv = chgLv(f.chg);
      if (lv > lv0) b.ev.push({ k: 'chgup', s: i, lv, x: f.x, y: f.y });
      if (f.x !== o.x && f.t > m.su) f.face = o.x > f.x ? 1 : -1; // 止まっている間は相手の方を向き続ける
      // Lv1 になる前に限り、別のボタンを押せばコマンドの1ステップとして記録される（従来どおり。成立したらコンボへ）
      const n = lv0 === 0 ? recCmd(f, c, inp, pr) : -1;
      if (n >= 0) startCmd(b, i, n);
      else if (f.t > m.su) { f.t = m.su; if (gnd) f.vx *= 0.7; }
      else updAtk(b, i, f, o, c);
    } else if (f.st === 'atk' && f.cb && chgLv(f.chg) > 0 && b.phase === 'fight') {
      // ボタンを離した瞬間：Lv1 以上ならチャージ攻撃に切り替える（離したボタンが弱か強かで基礎威力が決まる）
      const lv = chgLv(f.chg), k = 'g' + lv + (f.cb === K.H ? 'h' : 'l');
      f.vx = 0; startAtk(b, i, k);
      b.ev.push({ k: 'chg', s: i, lv, x: f.x, y: f.y });
    } else if (f.st === 'atk') {
      f.cb = 0; f.chg = 0; // 離した（Lv0）：通常技がそのまま続く
      // 地上の通常技（弱・強・方向つき・チェイン）の最中に押したボタンも履歴に入り、コマンドが成立したらその技を中断してコンボに移る。
      // （強は全体 35f 以上あり、次のステップを 25f 以内に押すには技の最中に押すしかないため。必殺技・ダッシュ攻撃・落下攻撃・コンボ中は対象外）
      const n = !f.air && f.atk.length <= 2 && f.atk !== 's' && f.atk[0] !== 'd' && f.atk[0] !== 'a' ? recCmd(f, c, inp, pr) : -1;
      if (n >= 0) startCmd(b, i, n); else updAtk(b, i, f, o, c);
    } else if (f.st === 'jump') {
      if (pr & K.A) startAtk(b, i, 'al'); else if (pr & K.H) startAtk(b, i, 'ah'); // 空中の弱/強＝落下攻撃
      else if ((pr & K.U) && f.jc < JUMP_MAX && b.phase === 'fight') {
        // BRIEF13 二段ジャンプ：上向きの速さを付け直す。横は押している方向へ（押していなければ今の勢いのまま）。少し速くして、相手の頭上を越えやすくする
        const dx = ((inp & K.R) ? 1 : 0) - ((inp & K.L) ? 1 : 0);
        f.jc = JUMP_MAX; f.t = 0; f.vy = JUMP2_VY; if (dx) f.vx = dx * (c.spd * 0.95 + 1);
        b.ev.push({ k: 'jump2', x: f.x, y: f.y, s: i });
      }
    } else {
      if (f.x !== o.x) f.face = o.x > f.x ? 1 : -1;
      f.cr = 0;
      if ((pr & K.S) && f.meter >= COST) { f.meter -= COST; startAtk(b, i, 's'); }
      else if (recCmd(f, c, inp, pr) >= 0) startCmd(b, i, matchCmd(c, f.cq)); // コマンド成立：通常技・チェインより優先
      else if (pr & (K.A | K.H)) {
        // チェイン窓が開いていれば 弱→2段目（l 系のあと）、強→フィニッシュ（2段目のあと）。それ以外は押した瞬間の方向で種別を決める
        const lt = pr & K.A, fwd = f.face > 0 ? K.R : K.L, bwd = f.face > 0 ? K.L : K.R;
        if (f.chainT > 0 && lt && chainStart(f.lastKind)) startAtk(b, i, 'l2');
        else if (f.chainT > 0 && !lt && f.lastKind === 'l2') startAtk(b, i, 'lf');
        else startAtk(b, i, ((inp & K.D) ? 'c' : (inp & fwd) ? 'f' : (inp & bwd) ? 'b' : '') + (lt ? 'l' : 'h'));
        if (canChg(f.atk)) { f.cb = lt ? K.A : K.H; f.chg = 1; } // BRIEF7: このボタンを押し続けている間は「ため」
      }
      else if (inp & K.G) { setSt(f, 'guard'); f.vx = 0; f.cr = (inp & K.D) ? 1 : 0; }
      else if ((pr & (K.DL | K.DR)) && !f.dcd) {
        const dir = (pr & K.DL) ? -1 : 1;
        if (dir === f.face) { // 相手方向：従来のダッシュ（ダッシュ攻撃に派生できる）
          f.st = 'dash'; f.t = 0; f.vx = dir * (6 + c.spd * 1.2); f.dcd = 28;
          b.ev.push({ k: 'dash', x: f.x, y: f.y });
        } else { // 相手から離れる方向：回避ステップ（出した瞬間から無敵。通常ダッシュより少し速く長い）
          f.st = 'evade'; f.t = 0; f.vx = dir * (7 + c.spd * 1.2); f.dcd = EV_CD; f.inv = EV_INV;
          b.ev.push({ k: 'evade', x: f.x, y: f.y, s: i });
        }
      }
      else if (inp & K.U) { f.st = 'jump'; f.t = 0; f.jc = 1; f.vy = JUMP_VY; f.vx = (((inp & K.R) ? 1 : 0) - ((inp & K.L) ? 1 : 0)) * c.spd * 0.95; }
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
        f.y = GY; f.vy = 0; f.jc = 0; // 着地：ジャンプ回数を戻す
        if (f.st === 'jump') { f.st = 'idle'; f.t = 0; f.vx = 0; }
        else if (f.st === 'atk') {
          const m = mv(c, f.atk);
          if (f.air && m.fall) { f.air = 0; f.t = m.su + m.ac; f.vx = 0; b.ev.push({ k: 'land', x: f.x, h: m.heavy ? 1 : 0 }); } // 落下攻撃の着地硬直
          else if (f.air) { f.st = 'idle'; f.t = 0; f.vx = 0; f.atk = ''; f.air = 0; }
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
  const AI_CHAIN = [0.2, 0.33, 0.45, 0.55, 0.65]; // l 系を当てたあとチェインを狙う確率（Lv1〜5）。2段目→フィニッシュも同じ確率でもう一度判定
  const AI_CMD = [0.1, 0.175, 0.25, 0.325, 0.4], AI_CMD_CD = 150; // 中距離で手が空いているときにコマンドコンボを出す確率（Lv1〜5）と、次に出せるまでの間隔
  // BRIEF7 ため技：遠距離で手が空いているとき、AI_CHG_CD フレームに1回だけ判定して、ためるかどうか決める確率（Lv1〜5）。近づいてくる相手には出しやすい
  // BRIEF8 上級コンボ（c4 / c5）：Lv5 だけが、コマンドを出すと決めたときに AI_ADV の確率で上級を選ぶ。出したあとは AI_ADV_CD フレーム、コマンドコンボ自体を出さない
  const AI_ADV = 0.25, AI_ADV_CD = 420;
  const AI_CHG = [0.03, 0.14, 0.24, 0.34, 0.44], AI_CHG_CD = 150;
  // BRIEF13 回避ステップ：近くで相手の攻撃（または飛び道具）が見えたとき、ガードの判断より先に、この確率（Lv1〜5）で後ろダッシュ＝回避を選ぶ。
  // 判断は反応待ち（cd）ごとに1回だけ、クールダウン（dcd 36f）中は出せないので、逃げ続けることはない
  const AI_EV = [0.02, 0.04, 0.07, 0.1, 0.13];
  function newAI(lv) { return { lv: Math.max(1, Math.min(5, lv)), cd: 20, held: 0, mt: -99, cw: 0, q: [], ccd: 60, gcd: 90, cgb: 0, cgn: 0 }; }
  function aiInput(b, i, ai) {
    let inp = aiThink(b, i, ai);
    // 上級コンボは Lv5 だけ。Lv1〜4 は、普段のボタン入力がたまたま上級の列を完成させてしまう1回だけ、そのボタンを押さない（初級3つは従来どおり）
    if (ai.lv < 5 && (inp & (K.A | K.H))) {
      const f = b.f[i], pr = inp & ~f.pi;
      if (pr & (K.A | K.H)) {
        const q = (f.ct + 1 > CMD_GAP ? '' : f.cq) + cmdStep(f, inp, pr);
        if (CHARS[f.ci].cmds.some(m => m.adv && q.endsWith(m.key))) inp &= ~(K.A | K.H);
      }
    }
    return inp;
  }
  function aiThink(b, i, ai) {
    if (b.phase !== 'fight') return 0;
    const n = ai.lv - 1, f = b.f[i], o = b.f[1 - i], c = CHARS[f.ci], oc = CHARS[o.ci];
    const d = Math.abs(o.x - f.x), toward = o.x > f.x ? K.R : K.L, away = o.x > f.x ? K.L : K.R, dashT = o.x > f.x ? K.DR : K.DL;
    const R = Math.random;
    // コマンドコンボ：決めたコマンドのステップ列を、実際の入力として2フレームおきに押していく（履歴入力をそのまま再現する）
    if (ai.ccd > 0) ai.ccd--;
    if (ai.q.length) {
      if (f.st === 'hit' || f.st === 'block' || f.st === 'ko') ai.q.length = 0; // 途中で殴られたらやめる
      else if (b.stop > 0) return 0; // ヒットストップ中は入力が読まれないので待つ
      else { ai.cd = Math.max(ai.cd, 6); ai.held = 0; return ai.q.shift(); }
    }
    // ため技：決めたボタンを実際に押し続ける（人と同じ経路）。狙った Lv までためたら、相手が間合いに入るのを少しだけ（15f まで）待って離す。
    // Lv1 以上たまっていれば、相手が間合いに入った時点で離す。殴られたら（f.cb が消える）そこで終わり
    if (ai.gcd > 0) ai.gcd--;
    if (ai.cgb) {
      if (f.st !== 'atk' || !f.cb) ai.cgb = 0;
      else if (b.stop > 0) return ai.cgb;
      else {
        const lv = chgLv(f.chg), inR = d < (lv ? mv(c, 'g' + lv + (ai.cgb === K.H ? 'h' : 'l')).rng : mv(c, f.atk).rng) - 6;
        ai.cgn--;
        if ((inR && (lv >= 1 || ai.cgn <= 0)) || ai.cgn <= -15) { ai.cgb = 0; ai.held = 0; ai.cd = Math.max(ai.cd, 8); return 0; }
        return ai.cgb;
      }
    }
    // ダッシュ攻撃・落下攻撃（1回のダッシュ／ジャンプにつき1度だけ判断する。反応待ち cd とは別枠）
    if (b.frame - ai.mt > 30) {
      const fwd = (o.x > f.x ? 1 : -1) === f.face;
      if (f.st === 'dash' && f.t >= 3 && fwd && (f.vx > 0 ? 1 : -1) === f.face && d < mv(c, 'dh').rng + 110) {
        ai.mt = b.frame; if (R() < AI_T.aggr[n] * 0.8) return ai.held | (R() < 0.55 ? K.A : K.H);
      } else if (f.st === 'jump' && f.vy > -5 && d < 150 && f.y < GY - 50) {
        ai.mt = b.frame; if (R() < AI_T.aggr[n] * 0.75) return (R() < 0.6 ? K.A : K.H);
      }
    }
    // チェイン：窓が開いた時に1度だけ狙うか決め、idle に戻った最初のフレームで押す（反応待ち cd とは別枠）
    if (f.chainT > 0) {
      if (!ai.cw) ai.cw = R() < AI_CHAIN[n] ? 1 : 2;
      if (ai.cw === 1 && (f.st === 'idle' || f.st === 'walk' || f.st === 'crouch')) { ai.cw = 2; ai.cd = Math.max(ai.cd, 4); return f.lastKind === 'l2' ? K.H : K.A; }
    } else ai.cw = 0;
    if (ai.cd > 0) { ai.cd--; return ai.held; }
    const ocl = o.st === 'atk' && o.cb ? chgLv(o.chg) : 0; // 相手がため中なら、その Lv（リーチが伸びる）
    let threat = o.st === 'atk' && o.atk && d < Math.min(mv(oc, o.atk).rng * (ocl ? CHG_RNG[ocl - 1] : 1), 400) + 45;
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
    // 相手がためて止まっていて、こちらの技が届くなら、ガードより先に殴りに行く（ため中は無防備）
    if (ocl >= 1 && d < c.h.rng - 4 && (f.st === 'idle' || f.st === 'walk') && R() < AI_T.aggr[n]) { ai.held = 0; ai.cd = Math.round(r * 0.6) + 2; return d < c.l.rng - 4 ? K.A : K.H; }
    if (threat && !f.dcd && (f.st === 'idle' || f.st === 'walk' || f.st === 'crouch') && R() < AI_EV[n]) { ai.held = 0; ai.cd = EV_T + 2; return o.x > f.x ? K.DL : K.DR; }
    if (threat && R() < AI_T.guard[n]) { held = K.G; ai.cd = r + 8; ai.held = held; return held; }
    if (!ai.gcd && !b.stop && !threat && (f.st === 'idle' || f.st === 'walk') && !f.chainT && o.st !== 'ko' && o.st !== 'hit' && d > c.h.rng + 100 && d < 560) {
      ai.gcd = AI_CHG_CD;
      const coming = o.vx * (f.x - o.x) > 0; // 相手がこちらへ動いている
      if (R() < AI_CHG[n] * (coming ? 1.5 : 0.6)) {
        const z = R(), tl = n === 0 ? 1 : n === 1 ? (z < 0.7 ? 1 : 2) : n === 2 ? (z < 0.4 ? 1 : 2) : n === 3 ? (z < 0.2 ? 1 : z < 0.92 ? 2 : 3) : (z < 0.1 ? 1 : z < 0.78 ? 2 : 3);
        ai.cgb = R() < 0.55 ? K.H : K.A; ai.cgn = CHG_LV[tl - 1] + 2 + Math.floor(R() * 6); ai.held = 0;
        return ai.cgb;
      }
    }
    if (!ai.ccd && (f.st === 'idle' || f.st === 'walk') && o.st !== 'ko' && d > c.l.rng * 0.7 && d < c.h.rng + 70) {
      ai.ccd = AI_CMD_CD;
      if (R() < AI_CMD[n]) {
        let cn = Math.floor(R() * 3);
        if (CMD_TYPES[c.cmds[cn].type].st[0].step ? false : d > c.h.rng + 30) cn = c.cmds.findIndex(m => CMD_TYPES[m.type].st[0].step); // 遠めなら前進するラッシュ型
        if (n === 4 && R() < AI_ADV) { cn = d > c.h.rng + 30 ? 3 : 3 + Math.floor(R() * 2); ai.ccd = AI_ADV_CD; } // Lv5 だけ：たまに上級（遠めなら前進するロングストリング）
        for (const st of c.cmds[cn].seq) ai.q.push(((st[0] === 'd') ? K.D : st[0] === 'f' ? toward : st[0] === 'b' ? away : 0) | (st[1] === 'A' ? K.A : K.H), 0);
        ai.q.pop(); ai.held = 0;
        return ai.q.shift();
      }
    }
    if (spOk && R() < AI_T.sp[n] * 0.45) tap = K.S;
    else if (d < c.l.rng + 8) {
      const q = R();
      if (q < AI_T.aggr[n]) { tap = R() < 0.6 ? K.A : K.H; const z = R(); tap |= z < 0.13 ? K.D : z < 0.2 ? away : (z < 0.55 && d > c.l.rng * 0.55) ? toward : 0; } // たまにしゃがみ技・後退技、間合いが遠めなら前進技
      else if (q < AI_T.aggr[n] + 0.12) held = away;
      else held = K.G;
    } else if (d < c.h.rng + 12 && R() < AI_T.aggr[n] * 0.7) { const z = R(); tap = K.H | (z < 0.1 ? K.D : z < 0.18 ? away : z < 0.6 ? toward : 0); }
    else {
      const q = R();
      if (q < AI_T.aggr[n] + 0.12) {
        held = toward;
        if (R() < 0.08) held |= K.U;
        else if (d > 170 && R() < (d < 340 ? 0.34 : 0.15) && !f.dcd) tap = dashT; // 中距離はダッシュで詰める（→ ダッシュ攻撃）
      } else if (q > 0.93) held = away;
    }
    ai.held = held; ai.cd = Math.round(r * (0.6 + R() * 0.8));
    return held | tap;
  }

  const api = { K, GY, XL, XR, COST, WINS, CHAIN, CMD_GAP, EV_T, EV_INV, EV_CD, JUMP_MAX, CHG_LV, chgLv, isChg, cmdKind, isCmd, newBattle, step, mv, isHeavy, hurt, newAI, aiInput };
  if (NODE) module.exports = api; else root.NJC = Object.assign(root.NJC || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
