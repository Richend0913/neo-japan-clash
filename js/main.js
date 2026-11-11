// NEO JAPAN CLASH — 画面遷移・モード進行・メインループ
(function () {
  'use strict';
  const N = window.NJC, CHARS = N.CHARS, K = N.K, INITIAL = N.INITIAL, D = N.Draw, A = N.Audio, I = N.Input, Net = N.Net;
  const cv = document.getElementById('game'), ctx = cv.getContext('2d');
  const W = 960, H = 540, PI = Math.PI;
  let ratio = 1;
  function fit() {
    const vw = innerWidth, vh = innerHeight, s = Math.min(vw / W, vh / H);
    cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
    ratio = Math.min(2, Math.max(1, s * (devicePixelRatio || 1)));
    cv.width = Math.round(W * ratio); cv.height = Math.round(H * ratio);
    document.body.classList.toggle('portrait', vh > vw);
  }
  addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 200)); fit();

  // ---- セーブ（localStorage） ----
  const SAVE_KEY = 'njc_save_v1';
  const save = { un: {}, mute: false, onlineWins: 0, clears: 0 };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 保存が使えない環境でも遊べる */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 同上 */ } }
  const isUnlocked = ci => ci < INITIAL || !!save.un[CHARS[ci].id];
  function unlock(id) { if (save.un[id]) return false; save.un[id] = 1; persist(); return true; }
  const idx = id => CHARS.findIndex(c => c.id === id);
  function applyMute() { A.setMuted(save.mute); document.getElementById('bMute').classList.toggle('off', save.mute); }
  applyMute();

  // ---- 共通 UI ----
  let T = 0, scr = null, btns = [], focus = 0, toast = null, prev = 0;
  function go(s) { scr = s; }
  function setBtns(list, f) { btns = list; focus = f || 0; }
  function toastMsg(str, life) { toast = { str, life: life || 170 }; }
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function panel(x, y, w, h, col, a) { ctx.fillStyle = `rgba(10,4,30,${a == null ? 0.8 : a})`; rr(x, y, w, h, 8); ctx.fill(); ctx.strokeStyle = col || '#5fe0ff'; ctx.lineWidth = 2; rr(x, y, w, h, 8); ctx.stroke(); }
  function drawBtns() {
    btns.forEach((b, i) => {
      const f = i === focus, col = f ? '#ffd447' : (b.col || '#5fe0ff');
      ctx.fillStyle = f ? 'rgba(90,60,10,.88)' : 'rgba(10,4,30,.82)'; rr(b.x, b.y, b.w, b.h, 8); ctx.fill();
      if (f) D.glow(ctx, '#ffd447', 14);
      ctx.strokeStyle = col; ctx.lineWidth = f ? 3 : 2; rr(b.x, b.y, b.w, b.h, 8); ctx.stroke(); D.noGlow(ctx);
      D.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, b.size || 19, f ? '#fff6c8' : '#fff', 'center');
    });
  }
  function nav(dx, dy) {
    if (btns.length < 2) return;
    const c = btns[focus]; let best = -1, bd = 1e9;
    btns.forEach((b, i) => {
      if (i === focus) return;
      const ex = b.x + b.w / 2 - c.x - c.w / 2, ey = b.y + b.h / 2 - c.y - c.h / 2, along = ex * dx + ey * dy;
      if (along <= 4) return;
      const d = along + (Math.abs(ex * dy) + Math.abs(ey * dx)) * 2.5;
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { focus = best; A.play('move'); }
  }
  function press(i) { const b = btns[i]; if (!b) return; focus = i; A.play(b.snd || 'ok'); b.act(); }
  function menuUpdate(pr) {
    if (pr & K.L) nav(-1, 0); else if (pr & K.R) nav(1, 0); else if (pr & K.U) nav(0, -1); else if (pr & K.D) nav(0, 1);
    else if (pr & (K.A | I.OK)) press(focus);
    else if (pr & (K.H | I.BACK)) { if (scr.back) { A.play('back'); scr.back(); } }
  }
  function header(title, sub) {
    D.neonText(ctx, title, 480, 30, 30, '#ff7ad9');
    if (sub) D.text(ctx, sub, 480, 54, 13, '#cfe9ff', 'center');
  }
  function bg(dim) { D.drawStage(ctx, T, dim == null ? 0.55 : dim); D.drawPetals(ctx, T); }

  // ---- 効果音つきイベント処理 ----
  const SND = { block: 'block', sp: 'special', sw: 'swing', shot: 'shot', warp: 'warp', dash: 'dash', go: 'go', ko: 'ko', timeup: 'ko', over: 'win' };
  function fxAndSound(e, b) { D.fxEvent(e, b); A.play(e.k === 'hit' ? (e.h ? 'heavy' : 'hit') : SND[e.k]); }

  // ================= タイトル =================
  function toTitle() { Net.close(); go(Title()); }
  function Title() {
    const unlockedN = CHARS.filter((c, i) => isUnlocked(i)).length;
    const items = [['アーケード', startArcadeSelect], ['フリーバトル', startFree], ['オンライン対戦', startOnline], [`解放状況  ${unlockedN} / ${CHARS.length}`, () => go(Gallery())]];
    setBtns(items.map((it, i) => ({ x: 340, y: 250 + i * 58, w: 280, h: 46, label: it[0], act: it[1] })));
    const demo = [{ ci: 0, x: 170, y: 470, face: 1, st: 'idle', t: 0, vx: 0, atk: '' }, { ci: 3, x: 790, y: 470, face: -1, st: 'idle', t: 0, vx: 0, atk: '' }];
    return {
      kind: 'title',
      update(m, pr) { demo[0].t++; demo[1].t++; menuUpdate(pr); },
      draw() {
        D.drawStage(ctx, T, 0.4);
        for (const f of demo) { ctx.save(); ctx.translate(f.x, f.y); ctx.scale(1.5, 1.5); D.drawFighter(ctx, Object.assign({}, f, { x: 0, y: 0 })); ctx.restore(); }
        D.drawPetals(ctx, T);
        ctx.save(); ctx.translate(480, 0); ctx.rotate(-0.03);
        D.neonText(ctx, 'NEO JAPAN', 0, 92, 70, '#ff4fa8'); D.neonText(ctx, 'CLASH', 0, 162, 86, '#49d0ff');
        ctx.restore();
        D.text(ctx, 'ネオ・ジャパン・クラッシュ（仮）  ― 和 × 電脳 格闘 ―', 480, 218, 15, '#ffe9a8', 'center');
        drawBtns();
        D.text(ctx, '十字キー：選択　○：決定　×：もどる　♪：ミュート　｜　PC：矢印 + J/K/L/U・Q/E・Enter', 480, 496, 12, '#cfe9ff', 'center');
      },
    };
  }

  // ================= 汎用メニュー =================
  function Menu(title, items, onBack, o) {
    o = o || {};
    const h = 46, gap = 10, y0 = o.y0 || Math.max(110, 290 - items.length * (h + gap) / 2);
    setBtns(items.map((it, i) => ({ x: 330, y: y0 + i * (h + gap), w: 300, h, label: it[0], act: it[1], snd: it[2] })), o.focus || 0);
    return {
      kind: o.kind || 'menu', back: onBack,
      update(m, pr) { if (o.tick) o.tick(); menuUpdate(pr); },
      draw() { bg(o.dim); header(title, o.sub); if (o.draw) o.draw(); drawBtns(); },
    };
  }

  // ================= キャラクター選択 =================
  const COLS = 7, CW = 104, CH = 120, GAP = 6, X0 = 98, Y0 = 66; // 下段が左右のパッドに隠れない幅に収める
  const cellPos = i => ({ x: X0 + (i % COLS) * (CW + GAP), y: Y0 + Math.floor(i / COLS) * (CH + GAP) });
  const B_BACK = { x: 366, y: 492, w: 106, h: 38 }, B_OK = { x: 488, y: 492, w: 106, h: 38 };
  const inR = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  function Select(o) {
    let cur = o.cur || 0; setBtns([]);
    function pick() {
      if (o.gallery) return;
      if (!isUnlocked(cur)) { A.play('ng'); toastMsg('まだ使えません ― 解放条件：' + CHARS[cur].lock); return; }
      A.play('ok'); o.onPick(cur);
    }
    function mv(d) { const n = CHARS.length; cur = (cur + d + n) % n; A.play('move'); }
    return {
      kind: o.gallery ? 'gallery' : 'select', back: o.onBack, get cur() { return cur; },
      update(m, pr) {
        if (pr & K.L) mv(cur % COLS === 0 ? COLS - 1 : -1); else if (pr & K.R) mv(cur % COLS === COLS - 1 ? -(COLS - 1) : 1);
        else if (pr & (K.U | K.D)) mv(COLS);
        else if (pr & (K.A | I.OK)) pick();
        else if (pr & (K.H | I.BACK)) { A.play('back'); o.onBack(); }
      },
      tap(x, y) {
        for (let i = 0; i < CHARS.length; i++) { const p = cellPos(i); if (x >= p.x && x <= p.x + CW && y >= p.y && y <= p.y + CH) { if (cur === i) pick(); else { cur = i; A.play('move'); } return true; } }
        if (inR(B_BACK, x, y)) { A.play('back'); o.onBack(); return true; }
        if (!o.gallery && inR(B_OK, x, y)) { pick(); return true; }
        return false;
      },
      draw() {
        bg(0.62); header('CHARACTER SELECT', o.title);
        for (let i = 0; i < CHARS.length; i++) {
          const p = cellPos(i);
          D.drawPortrait(ctx, i, p.x, p.y, CW, CH, { locked: !isUnlocked(i), sel: i === cur, t: i === cur ? T : 0, tag: i === cur ? (o.tag || 'YOU') : null, selCol: o.tag === 'CPU' ? '#49d0ff' : '#ffd447' });
        }
        // 情報パネル
        const c = CHARS[cur], open = isUnlocked(cur), px = 196, py = 324, pw = 568;
        panel(px, py, pw, 160, open ? c.col.g : '#8d86b3');
        if (open) {
          D.text(ctx, c.name, px + 16, py + 24, 28, '#fff'); D.text(ctx, c.en, px + 20 + ctx.measureText(c.name).width + 10, py + 28, 14, c.col.g, 'left', true);
          D.text(ctx, c.title + ' ／ ' + c.type, px + 16, py + 52, 14, '#ffe9a8');
          const st = N.stats(c), rows = [['HP', st.hp, '#ff5d6c'], ['速度', st.spd, '#4dffb4'], ['威力', st.pow, '#ffd447']];
          rows.forEach((r, k) => {
            const y = py + 80 + k * 24; D.text(ctx, r[0], px + 16, y, 14, '#cfe9ff');
            for (let s = 0; s < 5; s++) { ctx.fillStyle = s < r[1] ? r[2] : 'rgba(255,255,255,.14)'; ctx.fillRect(px + 64 + s * 30, y - 6, 25, 12); }
          });
          D.text(ctx, '必殺技（□・ゲージ半分消費）', px + 262, py + 80, 13, '#cfe9ff');
          D.text(ctx, c.sp.name, px + 262, py + 108, 24, c.col.g, 'left', true);
          D.text(ctx, SP_DESC[c.sp.type], px + 262, py + 136, 12, '#fff');
        } else {
          D.text(ctx, '？？？', px + 16, py + 28, 28, '#8d86b3'); D.text(ctx, 'LOCKED', px + 130, py + 30, 14, '#8d86b3', 'left', true);
          D.text(ctx, '解放条件', px + 16, py + 72, 14, '#cfe9ff');
          D.text(ctx, c.lock, px + 16, py + 104, 22, '#ffd447');
          D.text(ctx, '条件を満たすとシルエットが解放され、使えるようになります', px + 16, py + 138, 12, '#fff');
        }
        for (const [r, label, on] of [[B_BACK, '× もどる', true], [B_OK, '○ 決定', !o.gallery]]) {
          if (!on) continue;
          ctx.fillStyle = 'rgba(10,4,30,.85)'; rr(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.strokeStyle = label[0] === '○' ? '#ff5d6c' : '#6fb7ff'; ctx.lineWidth = 2; rr(r.x, r.y, r.w, r.h, 8); ctx.stroke();
          D.text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, 16, '#fff', 'center');
        }
      },
    };
  }
  const SP_DESC = { lunge: '踏み込んで斬り抜ける突進技', proj: '飛び道具を放つ遠距離技', warp: '相手の背後へ瞬間移動して斬る（ガード不能方向）', quake: '掌打と同時に地を走る衝撃波', grab: 'ガード不能の投げ技（空中の相手には不発）', upper: '無敵つきで斬り上げる対空技', beam: '画面端まで届く照射ビーム', dive: '飛び上がって急降下キック' };
  function Gallery() {
    const n = CHARS.filter((c, i) => isUnlocked(i)).length;
    return Select({ gallery: true, title: `解放状況：${n} / ${CHARS.length} 体が使用可能（カーソルを合わせると解放条件を表示）`, onBack: toTitle, cur: INITIAL });
  }

  // ================= VS 画面 =================
  function VS(c0, c1, label, labels, next) {
    let t = 0; setBtns([]); A.play('special');
    return {
      kind: 'vs',
      update(m, pr) { t++; if (t > 120 || (t > 20 && (pr & (K.A | I.OK)))) next(); },
      tap() { if (t > 20) next(); return true; },
      draw() {
        bg(0.66); header(label);
        const k = Math.min(1, t / 14), off = (1 - k) * 300;
        D.drawPortrait(ctx, c0, 110 - off, 96, 250, 300, { nameSize: 26, t: T, sel: true, selCol: '#ff3d7f' });
        ctx.save(); ctx.translate(850 + off, 0); ctx.scale(-1, 1); D.drawPortrait(ctx, c1, 0, 96, 250, 300, { nameSize: 1, t: T, sel: true, selCol: '#1fd1ff' }); ctx.restore();
        D.text(ctx, CHARS[c1].name, 725 + off, 384, 26, '#fff', 'center');
        D.text(ctx, labels[0], 235 - off, 420, 16, '#ffb0c8', 'center', true); D.text(ctx, labels[1], 725 + off, 420, 16, '#9cf3ff', 'center', true);
        D.text(ctx, CHARS[c0].title, 235 - off, 444, 14, '#fff', 'center'); D.text(ctx, CHARS[c1].title, 725 + off, 444, 14, '#fff', 'center');
        ctx.save(); ctx.translate(480, 246); ctx.scale(2 - k, 2 - k); D.neonText(ctx, 'VS', 0, 0, 96, '#ffd447'); ctx.restore();
      },
    };
  }

  // ================= バトル（オフライン：対 CPU） =================
  function Battle(o) {
    const b = N.newBattle(o.c0, o.c1), ai = N.newAI(o.lv), view = { ghost: [], labels: o.labels };
    let paused = false, done = false;
    D.fxClear(); setBtns([]);
    const finish = () => { if (!done) { done = true; o.onEnd(b.winner === 0); } };
    const s = {
      kind: 'battle', b,
      menu() {
        if (b.phase === 'over') return;
        paused = !paused; A.play(paused ? 'ok' : 'back');
        setBtns(paused ? [{ x: 330, y: 250, w: 300, h: 46, label: 'つづける', act: () => s.menu(), snd: 'back' }, { x: 330, y: 306, w: 300, h: 46, label: 'タイトルへもどる', act: toTitle }] : []);
      },
      update(m, pr) {
        if (pr & I.BACK) { s.menu(); return; }
        if (paused) { menuUpdate(pr & ~I.BACK); return; }
        N.step(b, m & 1023, N.aiInput(b, 1, ai));
        for (const e of b.ev) fxAndSound(e, b);
        b.ev.length = 0; D.fxTick();
        if (b.phase === 'over' && (b.pt > 200 || (b.pt > 50 && (pr & (K.A | I.OK))))) finish();
      },
      tap() { if (b.phase === 'over' && b.pt > 50) { finish(); return true; } return false; },
      draw() {
        D.drawBattle(ctx, b, view, T);
        if (paused) { ctx.fillStyle = 'rgba(6,2,20,.7)'; ctx.fillRect(0, 0, W, H); D.neonText(ctx, 'PAUSE', 480, 180, 60, '#5fe0ff'); drawBtns(); }
      },
    };
    return s;
  }

  // ================= アーケード =================
  function startArcadeSelect() { go(Select({ title: 'アーケード：CPU と5連戦（だんだん強くなる）', onBack: toTitle, onPick: startArcade })); }
  function startArcade(ci) {
    const pool = []; for (let i = 0; i < INITIAL; i++) if (i !== ci) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
    const boss = ci === idx('ryujin') ? idx('mumei') : idx('ryujin');
    arcadeStage({ ci, opp: pool.slice(0, 4).concat([boss]), stage: 0, cont: false });
  }
  function arcadeStage(arc) {
    const c1 = arc.opp[arc.stage], lv = arc.stage + 1, labels = ['YOU', 'CPU Lv' + lv];
    go(VS(arc.ci, c1, `ARCADE  STAGE ${lv} / 5` + (lv === 5 ? '  ― FINAL ―' : ''), labels, () => go(Battle({
      c0: arc.ci, c1, lv, labels,
      onEnd(win) { if (!win) return go(Continue(arc)); arc.stage++; if (arc.stage >= 5) go(Clear(arc)); else arcadeStage(arc); },
    }))));
  }
  function Continue(arc) {
    let t = 0;
    return Menu('CONTINUE ?', [['コンティニューする', () => { arc.cont = true; arcadeStage(arc); }], ['あきらめる（タイトルへ）', toTitle, 'back']], toTitle, {
      kind: 'continue', y0: 300, tick() { if (++t >= 600) toTitle(); },
      draw() {
        D.neonText(ctx, String(Math.max(0, 9 - Math.floor(t / 60))), 480, 180, 120, '#ff3d7f');
        D.text(ctx, `STAGE ${arc.stage + 1} / 5 で敗北　※コンティニューすると「ノーコンティニュー」解放は対象外になります`, 480, 268, 13, '#ffe9a8', 'center');
      },
    });
  }
  function Clear(arc) {
    const got = [];
    save.clears = (save.clears || 0) + 1; persist();
    if (unlock('kurotengu')) got.push(idx('kurotengu'));
    if (!arc.cont && unlock('ryujin')) got.push(idx('ryujin'));
    if (CHARS[arc.ci].id === 'zanrai' && unlock('mumei')) got.push(idx('mumei'));
    A.play(got.length ? 'unlock' : 'win');
    return Menu('ARCADE CLEAR !', [['タイトルへ', toTitle]], toTitle, {
      kind: 'clear', y0: 470, dim: 0.6,
      draw() {
        D.text(ctx, `${CHARS[arc.ci].name} で5連戦を制覇！` + (arc.cont ? '（コンティニューあり）' : '（ノーコンティニュー）'), 480, 84, 18, '#ffe9a8', 'center');
        if (got.length) {
          D.neonText(ctx, 'NEW FIGHTER UNLOCKED', 480, 124, 26, '#ffd447');
          const w = 150, gap = 20, x0 = 480 - (got.length * w + (got.length - 1) * gap) / 2;
          got.forEach((ci, k) => { D.drawPortrait(ctx, ci, x0 + k * (w + gap), 150, w, 200, { t: T, sel: true, nameSize: 18 }); D.text(ctx, CHARS[ci].title, x0 + k * (w + gap) + w / 2, 368, 13, '#fff', 'center'); });
          D.text(ctx, 'キャラ選択画面で使えるようになりました', 480, 400, 14, '#cfe9ff', 'center');
        } else {
          D.drawPortrait(ctx, arc.ci, 405, 130, 150, 200, { t: T, sel: true, nameSize: 18 });
          D.text(ctx, '今回あたらしく解放されたキャラはいません（解放状況で条件を確認できます）', 480, 372, 14, '#cfe9ff', 'center');
        }
      },
    });
  }

  // ================= フリーバトル =================
  const LV_NAMES = ['Lv1 かんたん', 'Lv2 ふつう', 'Lv3 つよい', 'Lv4 げきつよ', 'Lv5 鬼'];
  function startFree() {
    go(Select({
      title: 'フリーバトル：自分のキャラを選択', onBack: toTitle,
      onPick(ci) {
        go(Select({
          title: 'フリーバトル：対戦相手（CPU）を選択', tag: 'CPU', cur: (ci + 1) % INITIAL, onBack: startFree,
          onPick(cj) { go(Menu('CPU の強さ', LV_NAMES.map((n, i) => [n, () => freeBattle(ci, cj, i + 1)]).concat([['もどる', startFree, 'back']]), startFree, { focus: 1, sub: `${CHARS[ci].name}  VS  ${CHARS[cj].name}` })); },
        }));
      },
    }));
  }
  function freeBattle(ci, cj, lv) {
    const labels = ['YOU', 'CPU Lv' + lv];
    go(VS(ci, cj, 'FREE BATTLE', labels, () => go(Battle({
      c0: ci, c1: cj, lv, labels,
      onEnd(win) { go(Menu(win ? 'YOU WIN !' : 'YOU LOSE…', [['もう一度', () => freeBattle(ci, cj, lv)], ['キャラ選択へ', startFree], ['タイトルへ', toTitle]], toTitle, { sub: `${CHARS[ci].name}  VS  ${CHARS[cj].name}（${LV_NAMES[lv - 1]}）` })); },
    }))));
  }

  // ================= オンライン =================
  const on = { ci: 0, code: '', room: null, match: null, b: null, role: '', remote: 0, pending: [], end: null, view: null, got: false, sent: false, newUnlock: false };
  function startOnline() {
    if (!Net.available()) { A.play('ng'); toastMsg('オンラインは server.js を起動して http://<ホスト>:8902/ で開くと使えます', 260); return; }
    go(Select({ title: 'オンライン対戦：使用キャラを選択', onBack: toTitle, onPick(ci) { on.ci = ci; go(OnlineMenu()); } }));
  }
  function connectThen(fn) { toastMsg('サーバーに接続中…', 60); Net.connect().then(fn).catch(() => { A.play('ng'); toastMsg(location.hostname.endsWith('github.io') ? 'オンライン対戦は準備中です（アーケード／フリーバトルは遊べます）' : 'サーバーに接続できませんでした'); }); }
  function OnlineMenu() {
    return Menu('ONLINE', [['ルームを作成（4桁コード発行）', () => connectThen(() => Net.send({ t: 'create', ci: on.ci }))], ['コードで参加', () => go(CodeEntry())], ['もどる', startOnline, 'back']], startOnline,
      { kind: 'online', sub: `使用キャラ：${CHARS[on.ci].name}　｜　最大4人・1対1の勝ち抜き戦（待機中は観戦）` });
  }
  function CodeEntry() {
    let code = '';
    const kx = 346, ky = 176, kw = 84, kh = 50, kg = 8, keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'OK'];
    const typeKey = k => {
      if (k === '←') code = code.slice(0, -1);
      else if (k === 'OK') { if (code.length === 4) connectThen(() => Net.send({ t: 'join', code, ci: on.ci })); else { A.play('ng'); toastMsg('4桁のコードを入力してください', 90); } }
      else if (code.length < 4) code += k;
    };
    setBtns(keys.map((k, i) => ({ x: kx + (i % 3) * (kw + kg), y: ky + Math.floor(i / 3) * (kh + kg), w: kw, h: kh, label: k, size: 24, act: () => typeKey(k), snd: 'move' }))
      .concat([{ x: kx, y: ky + 4 * (kh + kg) + 4, w: kw * 3 + kg * 2, h: 40, label: 'もどる', act: () => go(OnlineMenu()), snd: 'back' }]), 0);
    return {
      kind: 'code', back: () => go(OnlineMenu()), get code() { return code; },
      digit(d) { if (d < 0) code = code.slice(0, -1); else if (code.length < 4) code += d; A.play('move'); },
      update(m, pr) { menuUpdate(pr & ~I.OK); if (pr & I.OK) typeKey('OK'); },
      draw() {
        bg(0.66); header('JOIN ROOM', '4桁のルームコードを入力');
        for (let i = 0; i < 4; i++) { panel(366 + i * 58, 84, 50, 66, i === code.length ? '#ffd447' : '#5fe0ff'); if (code[i]) D.text(ctx, code[i], 391 + i * 58, 118, 40, '#fff', 'center', true); }
        drawBtns();
      },
    };
  }
  const slotOf = id => { const p = on.room && on.room.players.find(q => q.id === id); return p ? 'P' + p.slot : 'P?'; };
  const nameOf = id => slotOf(id) + (id === Net.id ? '（YOU）' : '');
  function leaveRoom() { Net.send({ t: 'leave' }); Net.close(); on.room = null; on.match = null; go(OnlineMenu()); }
  function Lobby() {
    let sig = '';
    function build() {
      const r = on.room, list = [];
      if (r && r.leader === Net.id && r.state === 'lobby') list.push(['対戦開始', () => Net.send({ t: 'start' })]);
      list.push(['キャラ変更', () => go(Select({ title: 'オンライン対戦：使用キャラを変更（次の試合から反映）', cur: on.ci, onBack: () => go(Lobby()), onPick(ci) { on.ci = ci; Net.send({ t: 'char', ci }); go(Lobby()); } }))]);
      list.push(['ルームを退出', leaveRoom, 'back']);
      setBtns(list.map((it, i) => ({ x: 340, y: 326 + i * 50, w: 280, h: 42, label: it[0], act: it[1], snd: it[2] })), 0);
    }
    build();
    return {
      kind: 'lobby', back: leaveRoom,
      update(m, pr) {
        const r = on.room, s = r ? r.leader + r.state + r.players.length : '';
        if (s !== sig) { sig = s; build(); }
        menuUpdate(pr);
      },
      draw() {
        bg(0.66); const r = on.room;
        D.text(ctx, 'ROOM CODE', 480, 22, 14, '#cfe9ff', 'center', true);
        D.neonText(ctx, on.code.split('').join(' '), 480, 58, 50, '#ffd447');
        if (!r) return;
        const w = 140, h = 190, gap = 14, x0 = 480 - (4 * w + 3 * gap) / 2;
        for (let i = 0; i < 4; i++) {
          const x = x0 + i * (w + gap), y = 96, p = r.players[i];
          if (!p) { panel(x, y, w, h, '#4a4370', 0.55); D.text(ctx, '募集中…', x + w / 2, y + h / 2, 15, '#8d86b3', 'center'); continue; }
          const me = p.id === Net.id;
          D.drawPortrait(ctx, p.ci, x, y, w, h - 34, { t: me ? T : 0, sel: me, nameSize: 15 });
          panel(x, y + h - 32, w, 32, me ? '#ffd447' : '#5fe0ff');
          D.text(ctx, 'P' + p.slot + (me ? ' YOU' : '') + (p.id === r.leader ? ' ★' : ''), x + 8, y + h - 15, 14, me ? '#ffd447' : '#fff', 'left', true);
          D.text(ctx, p.wins + '勝', x + w - 8, y + h - 15, 14, '#fff', 'right');
          D.text(ctx, i < 2 ? '対戦' : '観戦待ち', x + w - 6, y + 12, 12, i < 2 ? '#ff8ad0' : '#9cf3ff', 'right');
        }
        const n = r.players.length, lead = r.leader === Net.id;
        const msg = r.state === 'lobby' ? (n < 2 ? 'コードを友だちに伝えてください（2〜4人）' : lead ? '「対戦開始」で試合スタート（左の2人が対戦、残りは観戦）' : 'ホスト（★）の開始を待っています…') : r.state === 'between' ? 'まもなく次の試合がはじまります' : '試合中';
        D.text(ctx, msg, 480, 304, 15, '#ffe9a8', 'center');
        drawBtns();
      },
    };
  }
  function startOnlineMatch(m) {
    on.match = m; on.role = m.a === Net.id ? 'a' : m.b === Net.id ? 'b' : 's';
    on.b = N.newBattle(m.ca, m.cb); on.got = !m.late || on.role === 'a'; on.remote = 0; on.pending = []; on.end = null; on.sent = false; on.newUnlock = false;
    on.view = { ghost: [], labels: [nameOf(m.a), nameOf(m.b)] };
    D.fxClear(); go(OBattle());
  }
  function OBattle() {
    let lastIn = -1, sendT = 0, asking = false; setBtns([]);
    const s = {
      kind: 'obattle',
      menu() {
        asking = !asking; A.play(asking ? 'ok' : 'back');
        setBtns(asking ? [{ x: 330, y: 250, w: 300, h: 46, label: 'つづける', act: () => s.menu(), snd: 'back' }, { x: 330, y: 306, w: 300, h: 46, label: 'ルームを退出', act: leaveRoom, snd: 'back' }] : []);
      },
      update(m, pr) {
        const b = on.b, inp = asking ? 0 : (m & 1023);
        if (!on.end) {
          if (on.role === 'a') {
            // 対戦者A：シミュレーションを進め、状態スナップショットを配信する
            N.step(b, inp, on.remote);
            for (const e of b.ev) { fxAndSound(e, b); on.pending.push(e); }
            b.ev.length = 0;
            if (b.frame % 2 === 0) { Net.send({ t: 'state', n: on.match.n, s: { b, ev: on.pending } }); on.pending = []; }
            if (b.phase === 'over' && b.pt >= 150 && !on.sent) { on.sent = true; Net.send({ t: 'result', n: on.match.n, winner: b.winner === 0 ? 'a' : 'b' }); }
          } else {
            // 対戦者B：入力を送る ／ B・観戦者：受信した状態を最後の入力のまま外挿して滑らかに見せる
            if (on.role === 'b' && (inp !== lastIn || ++sendT >= 12)) { Net.send({ t: 'input', i: inp }); lastIn = inp; sendT = 0; }
            if (on.got) { N.step(b, b.f[0].pi, b.f[1].pi); b.ev.length = 0; }
          }
        }
        D.fxTick();
        if (pr & I.BACK) { s.menu(); return; }
        if (asking) menuUpdate(pr & ~I.BACK);
      },
      draw() {
        const r = on.room;
        if (!on.got) { bg(0.6); D.text(ctx, '試合に接続中…', 480, 270, 22, '#fff', 'center'); }
        else D.drawBattle(ctx, on.b, on.view, T);
        if (on.role === 's') { panel(420, 78, 120, 26, '#9cf3ff', 0.7); D.text(ctx, '観戦中', 480, 92, 15, '#9cf3ff', 'center'); }
        if (r) {
          const wait = r.order.slice(2).map(nameOf).join(' → ');
          D.text(ctx, `ROOM ${on.code}` + (wait ? `　｜　次の挑戦者：${wait}` : ''), 480, 528, 12, '#cfe9ff', 'center');
        }
        if (on.end) {
          const e = on.end, me = Net.id;
          ctx.fillStyle = 'rgba(6,2,20,.72)'; ctx.fillRect(0, 150, W, 230);
          D.neonText(ctx, e.winner === me ? 'YOU WIN !' : e.loser === me ? 'YOU LOSE…' : 'WINNER  ' + slotOf(e.winner), 480, 210, 58, e.winner === me ? '#ffd447' : '#5fe0ff');
          D.text(ctx, `${nameOf(e.winner)} の勝ち` + (e.forfeit ? '（相手が退出）' : '') + '　― 勝者は残り、敗者は観戦列の最後尾へ', 480, 270, 16, '#fff', 'center');
          if (on.newUnlock) D.text(ctx, 'NEW！ オンライン初勝利で「カグヤ.exe」を解放', 480, 304, 18, '#ffd447', 'center');
          D.text(ctx, 'まもなく次の試合…', 480, 344, 14, '#cfe9ff', 'center');
        }
        if (asking) { ctx.fillStyle = 'rgba(6,2,20,.7)'; ctx.fillRect(0, 0, W, H); D.text(ctx, 'ルームを退出しますか？（対戦中なら相手の不戦勝になります）', 480, 200, 18, '#fff', 'center'); drawBtns(); }
      },
    };
    return s;
  }
  Net.onMsg = m => {
    switch (m.t) {
      case 'joined': on.code = m.code; on.end = null; on.match = null; on.room = null; A.play('ok'); go(Lobby()); break;
      case 'room': on.room = m; if (on.view && on.match) on.view.labels = [nameOf(on.match.a), nameOf(on.match.b)]; if (m.state === 'lobby' && scr.kind === 'obattle') go(Lobby()); break;
      case 'err': A.play('ng'); toastMsg(m.msg); break;
      case 'match': startOnlineMatch(m); break;
      case 'state':
        if (on.match && m.n === on.match.n && on.role !== 'a' && m.s && m.s.b) { on.b = m.s.b; on.got = true; for (const e of (m.s.ev || [])) fxAndSound(e, on.b); }
        break;
      case 'input': on.remote = m.i | 0; break;
      case 'matchEnd':
        on.end = m;
        if (m.winner === Net.id) { save.onlineWins = (save.onlineWins || 0) + 1; persist(); if (unlock('kaguya')) { on.newUnlock = true; A.play('unlock'); } else A.play('win'); }
        break;
    }
  };
  Net.onClose = () => { if (scr.kind === 'lobby' || scr.kind === 'obattle' || scr.kind === 'online' || scr.kind === 'code') { toastMsg('サーバーとの接続が切れました'); on.room = null; on.match = null; go(Title()); } };

  // ================= 入力フック / メインループ =================
  I.onGesture = () => A.unlock();
  I.onMute = () => { save.mute = !save.mute; persist(); applyMute(); if (!save.mute) A.play('ok'); };
  I.onMenu = () => { if (scr.menu) scr.menu(); else if (scr.back) { A.play('back'); scr.back(); } };
  I.onDigit = d => { if (scr.digit) scr.digit(d); };
  I.onTap = (x, y) => {
    if (scr.tap && scr.tap(x, y)) return;
    for (let i = 0; i < btns.length; i++) if (inR(btns[i], x, y)) { press(i); return; }
  };
  function tick() {
    T++;
    const m = I.mask(), pr = m & ~prev; prev = m;
    scr.update(m, pr);
    if (toast && --toast.life <= 0) toast = null;
  }
  function render() {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    scr.draw();
    if (toast) {
      ctx.font = D.font(15); const w = Math.min(900, ctx.measureText(toast.str).width + 40);
      ctx.globalAlpha = Math.min(1, toast.life / 20); panel(480 - w / 2, 232, w, 40, '#ffd447', 0.92); D.text(ctx, toast.str, 480, 253, 15, '#fff', 'center'); ctx.globalAlpha = 1;
    }
  }
  let last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    acc += Math.min(100, ts - last); last = ts;
    let n = 0;
    while (acc >= 1000 / 60 && n < 5) { tick(); acc -= 1000 / 60; n++; }
    if (acc > 100) acc = 0;
    render();
  }
  go(Title());
  requestAnimationFrame(frame);

  // 自動確認用の覗き窓（ゲーム進行には使わない）
  N.debug = { get scr() { return scr; }, get btns() { return btns; }, get focus() { return focus; }, on, save, isUnlocked, tick, render };
})();
