// NEO JAPAN CLASH — 画面遷移・モード進行・メインループ
(function () {
  'use strict';
  const N = window.NJC, CHARS = N.CHARS, STAGES = N.STAGES, Shop = window.NJCShop, Acc = window.NJCAccount || null, K = N.K, INITIAL = N.INITIAL, D = N.Draw, A = N.Audio, I = N.Input, Net = N.Net;
  const cv = document.getElementById('game'), ctx = cv.getContext('2d', { alpha: false }); // 不透明キャンバス（合成が軽い）
  const W = 960, H = 540, PI = Math.PI;
  let ratio = 1;
  const MAX_RATIO = 1.75;
  let maxR = MAX_RATIO; // 遅い端末では試合中に自動で下げる（下の「自動解像度」）
  function fit() {
    const vw = innerWidth, vh = innerHeight, s = Math.min(vw / W, vh / H);
    cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
    // 内部解像度：表示サイズ × DPR。ただし上限は 1.75 倍（1680x945）。DPR 3 の端末で 2 倍（1920x1080）まで描くと塗る画素が3割増えて重い。
    // 幅を 16 の倍数にして、倍率・高さが端数にならないようにする（キャッシュした背景や文字を等倍で貼るため）
    const cw = Math.round(W * Math.max(1, Math.min(maxR, s * (devicePixelRatio || 1))) / 16) * 16, ch = cw * 9 / 16;
    ratio = cw / W;
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    D.setScale(ratio, cw, ch);
    document.body.classList.toggle('portrait', vh > vw);
  }
  addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 200)); fit();

  // ---- セーブ（localStorage） ----
  const SAVE_KEY = 'njc_save_v1';
  const save = { un: {}, mute: false, onlineWins: 0, clears: 0 };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 保存が使えない環境でも遊べる */ }
  const idx = id => CHARS.findIndex(c => c.id === id);
  const MY = N.MYPAGE, EQ_KEY = { titles: 'title', frames: 'frame', bgs: 'mypageBg' };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  // プレイヤーID（UUID v4）。randomUUID は https / localhost でしか使えないので、無ければ乱数から組み立てる
  function newPid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* 下の方法で作る */ }
    const b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0; }
    b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
    const h = Array.from(b, x => (x + 256).toString(16).slice(1)).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const NAME_MAX = 12;
  const cleanName = v => Array.from(typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '').slice(0, NAME_MAX).join('').trim();
  const nat = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  // セーブの形を整える（起動時と、セーブコードの読み込み後に呼ぶ）。旧セーブに無い項目は既定値で補い、既にある項目の意味は変えない。
  // BRIEF9: ent（買い切りパックの権利）。BRIEF10: pid / pname / title / frame / mypageBg / mainChar / col / wins / losses と ent.colors1 / ent.mypage1。
  // 戻り値：プレイヤーID を新しく作ったら true（その場で保存して、次の起動でも同じ ID になるようにする）
  function normalizeSave() {
    const un = save.un && typeof save.un === 'object' ? save.un : {};
    save.un = {}; for (const c of CHARS) if (un[c.id]) save.un[c.id] = 1;
    save.mute = !!save.mute; save.onlineWins = nat(save.onlineWins); save.clears = nat(save.clears);
    const ent = Object.assign({ unlockall: 0, stages1: 0, colors1: 0, mypage1: 0 }, save.ent && typeof save.ent === 'object' ? save.ent : null);
    save.ent = {}; for (const k in ent) save.ent[k] = ent[k] ? 1 : 0;
    let fresh = false;
    if (typeof save.pid !== 'string' || !UUID_RE.test(save.pid)) { save.pid = newPid(); fresh = true; }
    save.pname = cleanName(save.pname) || 'プレイヤー';
    for (const kind in EQ_KEY) { const k = EQ_KEY[kind]; if (!MY[kind].some(it => it.id === save[k])) save[k] = MY[kind][0].id; }
    if (idx(save.mainChar) < 0) save.mainChar = CHARS[0].id;
    const col = save.col && typeof save.col === 'object' ? save.col : {};
    save.col = {}; for (const c of CHARS) if (col[c.id] === 0 || col[c.id] === 1 || col[c.id] === 2) save.col[c.id] = col[c.id];
    save.wins = nat(save.wins); save.losses = nat(save.losses);
    save.savedAt = nat(save.savedAt); // BRIEF11: 最後に変更を保存した時刻（ms）。旧セーブには無いので 0
    return fresh;
  }
  // BRIEF11: persist() は「遊んだ結果の変更」を保存する。savedAt を刻み、サインイン中ならクラウド同期（2秒まとめて送信）を予約する。
  // writeSave() は書き込みだけ（起動時のプレイヤーID 自動作成と、クラウド側のセーブを取り込むとき。savedAt を「いま」にしない）。
  function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 同上 */ } }
  function persist() { save.savedAt = Date.now(); writeSave(); if (Acc) Acc.touch(); }
  if (normalizeSave()) writeSave();
  Shop.bind({ get: k => save.ent[k], set(k, v) { save.ent[k] = v ? 1 : 0; persist(); } });
  // 隠しキャラ：従来の条件で解放済み、または全キャラ解放パックを所有（両立）
  const isUnlocked = ci => ci < INITIAL || !!save.un[CHARS[ci].id] || Shop.owned('njc_unlock_all');
  const stageOwned = st => !st.pack || Shop.owned(st.pack);
  const ownedStages = () => STAGES.filter(stageOwned);
  const stageName = id => (STAGES.find(st => st.id === id) || STAGES[0]).name;
  function unlock(id) { if (save.un[id]) return false; save.un[id] = 1; persist(); return true; }
  // ---- BRIEF10: マイページのカスタム（称号・フレーム・背景）とカラーバリエーション ----
  // 項目が使えるか：無料は常に可 ／ 実績（cond）はセーブの数値が条件以上 ／ 有料（pack）はパックを所有
  const itemOpen = it => (it.pack ? Shop.owned(it.pack) : it.cond ? (save[it.cond.k] || 0) >= it.cond.n : true);
  const itemWhy = it => (it.pack ? `「${Shop.product(it.pack).name}」に入っています ― タイトルの「ショップ」へ` : '解放条件：' + it.lock);
  // 装備中の項目。権利を失った（パックを下ろした）項目を装備していたら、セーブは書き換えずに無料の先頭を表示する
  const equipped = kind => { const it = MY[kind].find(x => x.id === save[EQ_KEY[kind]]); return it && itemOpen(it) ? it : MY[kind][0]; };
  const mainCharIdx = () => { const i = idx(save.mainChar); return i >= 0 && isUnlocked(i) ? i : 0; };
  const COLOR_PACK = 'njc_colors_1', colorOwned = () => Shop.owned(COLOR_PACK);
  // そのキャラで実際に使うカラー（0=通常）。パック未所有なら、保存された選択に関わらず常に通常色
  const colorOf = ci => (colorOwned() ? (save.col[CHARS[ci].id] || 0) : 0);

  // ---- BRIEF10: セーブコード（'NJC1:' + Base64）。中身は { g:'njc', v:1, c:チェックサム, s:セーブ全体 } の JSON（UTF-8） ----
  const CODE_PREFIX = 'NJC1:', SAVE_FIELDS = ['un', 'mute', 'onlineWins', 'clears', 'ent', 'pid', 'pname', 'title', 'frame', 'mypageBg', 'mainChar', 'col', 'wins', 'losses'];
  function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
  const b64enc = str => { let q = ''; for (const x of new TextEncoder().encode(str)) q += String.fromCharCode(x); return btoa(q); };
  const b64dec = b => { const q = atob(b), u = new Uint8Array(q.length); for (let i = 0; i < q.length; i++) u[i] = q.charCodeAt(i); return new TextDecoder('utf-8', { fatal: true }).decode(u); };
  function makeSaveCode() {
    const o = {}; for (const k of SAVE_FIELDS) o[k] = save[k];
    return CODE_PREFIX + b64enc(JSON.stringify({ g: 'njc', v: 1, c: fnv(JSON.stringify(o)), s: o }));
  }
  // 形式チェック。通ったときだけ { ok:true, s }。通らなければ { ok:false, why }（このときセーブには一切触らない）
  function readSaveCode(str) {
    const code = String(str == null ? '' : str).replace(/\s+/g, ''), bad = why => ({ ok: false, why });
    if (!code) return bad('コードが入力されていません');
    if (!code.startsWith(CODE_PREFIX)) return bad('このゲームのセーブコードではありません（NJC1: で始まるコードを貼ってください）');
    const body = code.slice(CODE_PREFIX.length); let o = null;
    if (!body || body.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return bad('コードが壊れています（途中で切れていないか確認してください）');
    try { o = JSON.parse(b64dec(body)); } catch (e) { return bad('コードが壊れています（途中で切れていないか確認してください）'); }
    if (!o || typeof o !== 'object' || o.g !== 'njc' || o.v !== 1 || !o.s || typeof o.s !== 'object' || Array.isArray(o.s)) return bad('このゲームのセーブコードではありません');
    if (o.c !== fnv(JSON.stringify(o.s))) return bad('コードが壊れています（内容が一致しません）');
    const q = o.s;
    if (typeof q.pid !== 'string' || !UUID_RE.test(q.pid) || !q.un || typeof q.un !== 'object' || !q.ent || typeof q.ent !== 'object') return bad('コードの内容が正しくありません');
    return { ok: true, s: q };
  }
  // 読み込んだセーブで上書きする（readSaveCode を通ったものだけを渡すこと）。save は同じオブジェクトのまま中身を入れ替える
  function applySaveCode(q) {
    for (const k of Object.keys(save)) delete save[k];
    for (const k of SAVE_FIELDS) if (k in q) save[k] = q[k];
    normalizeSave(); persist(); applyMute();
  }
  function applyMute() { A.setMuted(save.mute); document.getElementById('bMute').classList.toggle('off', save.mute); }
  applyMute();
  // ---- BRIEF11: クラウドセーブ同期（js/account.js）にセーブの出し入れ口を渡す ----
  // ent（買い切りパックの権利）は、どちらのセーブを採用しても OR でまとめる（買った権利を失わない）
  const ENT_KEY = /^[a-z0-9_]{1,32}$/;
  function orEnt(from) { let grew = false; if (from && typeof from === 'object') for (const k of Object.keys(from)) if (from[k] && ENT_KEY.test(k) && !save.ent[k]) { save.ent[k] = 1; grew = true; } return grew; }
  if (Acc) Acc.bind({
    snapshot() { const o = {}; for (const k of SAVE_FIELDS) o[k] = save[k]; o.savedAt = save.savedAt; return o; },
    savedAt: () => save.savedAt,
    // サーバー側のセーブを採用する（pid もサーバー側になる）。戻り値：端末側の権利を足した（＝サーバーへ送り直す必要がある）か
    adopt(q, updatedAt) {
      const mine = Object.assign({}, save.ent);
      for (const k of Object.keys(save)) delete save[k];
      for (const k of SAVE_FIELDS) if (k in q) save[k] = q[k];
      normalizeSave(); const grew = orEnt(mine);
      save.savedAt = grew ? Date.now() : nat(updatedAt); writeSave(); applyMute();
      return grew;
    },
    // 端末側のセーブを残すとき：サーバー側にだけある権利を足す
    mergeEnt(e) { const grew = orEnt(e); if (grew) { save.savedAt = Date.now(); writeSave(); } return grew; },
  });

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
      if (b.dis) { // 無効ボタン（購入済みなど）：灰色で、フォーカスしても光らせない
        ctx.fillStyle = 'rgba(30,28,44,.85)'; rr(b.x, b.y, b.w, b.h, 8); ctx.fill(); ctx.strokeStyle = f ? '#b9b3d6' : '#5b5770'; ctx.lineWidth = 2; rr(b.x, b.y, b.w, b.h, 8); ctx.stroke();
        if (b.why) D.drawLock(ctx, b.x + 16, b.y + b.h / 2, 16, '#8d86b3'); // ロック中（押すと理由を案内する）
        D.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + (b.sub ? -7 : 1), b.size || 19, '#8d86b3', 'center');
        if (b.sub) D.text(ctx, b.sub, b.x + b.w / 2, b.y + b.h / 2 + 11, 10, '#ffe9a8', 'center'); return;
      }
      ctx.fillStyle = f ? 'rgba(90,60,10,.88)' : 'rgba(10,4,30,.82)'; rr(b.x, b.y, b.w, b.h, 8); ctx.fill();
      if (f) { ctx.strokeStyle = '#ffd447'; ctx.globalAlpha = 0.22; ctx.lineWidth = 11; rr(b.x, b.y, b.w, b.h, 8); ctx.stroke(); ctx.globalAlpha = 1; } // フォーカスの発光（ぼかし無し）
      ctx.strokeStyle = col; ctx.lineWidth = f ? 3 : 2; rr(b.x, b.y, b.w, b.h, 8); ctx.stroke();
      D.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + (b.sub ? -7 : 1), b.size || 19, f ? '#fff6c8' : '#fff', 'center');
      if (b.sub) D.text(ctx, b.sub, b.x + b.w / 2, b.y + b.h / 2 + 11, 10, b.subCol || '#cfe9ff', 'center');
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
  function press(i) { const b = btns[i]; if (!b) return; focus = i; if (b.dis) { A.play('ng'); if (b.why) toastMsg(b.why, 220); return; } A.play(b.snd || 'ok'); b.act(); }
  function menuUpdate(pr) {
    if (pr & K.L) nav(-1, 0); else if (pr & K.R) nav(1, 0); else if (pr & K.U) nav(0, -1); else if (pr & K.D) nav(0, 1);
    else if (pr & (K.A | I.OK)) press(focus);
    else if (pr & (K.H | I.BACK)) { if (scr.back) { A.play('back'); scr.back(); } }
  }
  function header(title, sub) {
    D.neonText(ctx, title, 480, 30, 30, '#ff7ad9');
    if (sub) D.text(ctx, sub, 480, 54, 13, '#cfe9ff', 'center');
  }
  function bg(dim, stage) { D.drawStage(ctx, T, dim == null ? 0.55 : dim, stage); D.drawPetals(ctx, T); }
  // 幅 max に収まるまで文字を小さくして描く（下限 min）
  function textFit(str, x, y, px, col, align, max, it, min) {
    let q = px; for (; q > (min || 8); q--) { ctx.font = D.font(q, it); if (ctx.measureText(str).width <= max) break; }
    D.text(ctx, str, x, y, q, col, align, it);
  }

  // ---- 効果音つきイベント処理 ----
  const SND = { block: 'block', sp: 'special', shot: 'shot', warp: 'warp', dash: 'dash', go: 'go', ko: 'ko', timeup: 'ko', over: 'win' };
  function fxAndSound(e, b) {
    D.fxEvent(e, b);
    // 弱＝高く軽い音、強＝低く太い音。ダッシュ攻撃・落下攻撃は踏み切り音を足す
    if (e.k === 'hit') { A.play(e.h ? 'heavy' : 'hit'); if (e.g === 3) A.play('chgHit'); }
    else if (e.k === 'chgup') A.play('chg' + e.lv); // ための段階が上がった（Lv ごとにピッチ違い）
    else if (e.k === 'chg') { if (e.lv === 3) A.play('chgMax'); }
    else if (e.k === 'sw') { A.play(e.h ? 'swingH' : 'swing'); if (e.v) A.play('rush'); }
    else if (e.k === 'land') A.play(e.h ? 'landH' : 'land');
    else if (e.k === 'cmd') A.play('rush'); // コマンドコンボ発動
    else A.play(SND[e.k]);
  }

  // ================= タイトル =================
  function toTitle() { Net.close(); go(Title()); }
  function Title() {
    const unlockedN = CHARS.filter((c, i) => isUnlocked(i)).length;
    const items = [['アーケード', startArcadeSelect], ['フリーバトル', startFree], ['オンライン対戦', startOnline], [`解放状況  ${unlockedN} / ${CHARS.length}`, () => go(Gallery())], ['ショップ', () => go(ShopScreen())], ['マイページ', () => go(MyPage())]];
    setBtns(items.map((it, i) => ({ x: 340, y: 234 + i * 42, w: 280, h: 36, size: 18, label: it[0], act: it[1] }))); // BRIEF10: 6項目に増えたので 40px・間隔48 → 36px・間隔42 に詰めた
    const demo = [{ ci: 0, x: 120, y: 478, face: 1, st: 'idle', t: 0, vx: 0, atk: '' }, { ci: 1, x: 820, y: 478, face: -1, st: 'idle', t: 0, vx: 0, atk: '' }];
    return {
      kind: 'title',
      update(m, pr) { demo[0].t++; demo[1].t++; menuUpdate(pr); },
      draw() {
        D.drawStage(ctx, T, 0.4);
        for (const f of demo) { ctx.save(); ctx.translate(f.x, f.y); const k = D.hasSprite(f.ci) ? 1.3 : 1.5; ctx.scale(k, k); D.drawFighter(ctx, Object.assign({}, f, { x: 0, y: 0 }), { zoom: k }); ctx.restore(); }
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
  // BRIEF10: カラー切替（o.color を渡した「自分のキャラ」の選択画面だけ）。L / R（Q / E）で前後、またはこのボタンをタップで次へ
  const B_COL = { x: 606, y: 492, w: 158, h: 38 };
  // カラーの目印の色：素材と同じ考え方（彩度のある色だけ色相を +0.30 / +0.60 回す）で、キャラの代表色から作る。目安であって素材そのものの色ではない
  function hsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, d / (1 - Math.abs(2 * l - 1)), l];
  }
  function chipCol(ch, v) { const a = hsl(ch.col.m), b = hsl(ch.col.g), q = a[1] >= 0.35 ? a : b; /* 本体色（m）が無彩色に近いキャラだけ差し色（g）を使う */ return `hsl(${Math.round(((q[0] + v * 0.3) % 1) * 360)},${Math.round(q[1] * 100)}%,${Math.round(Math.max(0.35, Math.min(0.7, q[2])) * 100)}%)`; }
  function Select(o) {
    D.preloadPortraits();
    let cur = o.cur || 0, cmdLayout = [], cmdBadge = null, pv = 0; setBtns([]);
    function cycle(d) {
      if (!o.color) return;
      if (!isUnlocked(cur)) { A.play('ng'); return; }
      if (!colorOwned()) { A.play('ng'); toastMsg(`カラー2・3は「${Shop.product(COLOR_PACK).name}」で解放 ― タイトルの「ショップ」へ`, 220); return; }
      const id = CHARS[cur].id; save.col[id] = ((save.col[id] || 0) + d + 3) % 3; persist(); A.play('move'); pv = 150;
    }
    function pick() {
      if (o.gallery) return;
      if (!isUnlocked(cur)) { A.play('ng'); toastMsg('まだ使えません ― 解放条件：' + CHARS[cur].lock); return; }
      A.play('ok'); o.onPick(cur);
    }
    function mv(d) { const n = CHARS.length; cur = (cur + d + n) % n; pv = 0; A.play('move'); }
    return {
      kind: o.gallery ? 'gallery' : 'select', back: o.onBack, get cur() { return cur; }, get cmdLayout() { return cmdLayout; }, get cmdBadge() { return cmdBadge; },
      get color() { return o.color ? colorOf(cur) : 0; }, get colorUI() { return o.color ? Object.assign({ owned: colorOwned(), preview: pv > 0 }, B_COL) : null; },
      update(m, pr) {
        if (pv > 0) pv--;
        if (pr & K.DL) cycle(-1); else if (pr & K.DR) cycle(1);
        else if (pr & K.L) mv(cur % COLS === 0 ? COLS - 1 : -1); else if (pr & K.R) mv(cur % COLS === COLS - 1 ? -(COLS - 1) : 1);
        else if (pr & (K.U | K.D)) mv(COLS);
        else if (pr & (K.A | I.OK)) pick();
        else if (pr & (K.H | I.BACK)) { A.play('back'); o.onBack(); }
      },
      tap(x, y) {
        for (let i = 0; i < CHARS.length; i++) { const p = cellPos(i); if (x >= p.x && x <= p.x + CW && y >= p.y && y <= p.y + CH) { if (cur === i) pick(); else { cur = i; pv = 0; A.play('move'); } return true; } }
        if (inR(B_BACK, x, y)) { A.play('back'); o.onBack(); return true; }
        if (!o.gallery && inR(B_OK, x, y)) { pick(); return true; }
        if (o.color && inR(B_COL, x, y)) { cycle(1); return true; }
        return false;
      },
      draw() {
        bg(0.62); header('CHARACTER SELECT', o.title);
        for (let i = 0; i < CHARS.length; i++) {
          const p = cellPos(i);
          D.drawPortrait(ctx, i, p.x, p.y, CW, CH, { locked: !isUnlocked(i), sel: i === cur, t: i === cur ? T : 0, tag: i === cur ? (o.tag || 'YOU') : null, selCol: o.tag === 'CPU' ? '#49d0ff' : '#ffd447' });
        }
        // 情報パネル
        // BRIEF6: 情報パネルを詰め、その下に技表の帯を置く。BRIEF8: パネルをさらに 110→100px に詰め、帯を2段（上段＝初級3つ／下段＝上級2つ）にした
        const c = CHARS[cur], open = isUnlocked(cur), px = 196, py = 322, pw = 568, col = o.tag === 'CPU' ? '#49d0ff' : '#ffd447';
        panel(px, py, pw, 100, open ? c.col.g : '#8d86b3');
        if (open) {
          D.text(ctx, c.name, px + 16, py + 20, 24, '#fff'); ctx.font = D.font(24); const nw = ctx.measureText(c.name).width;
          D.text(ctx, c.en, px + 26 + nw, py + 23, 13, c.col.g, 'left', true);
          D.text(ctx, c.title + ' ／ ' + c.type, px + pw - 16, py + 21, 13, '#ffe9a8', 'right');
          const st = N.stats(c), rows = [['HP', st.hp, '#ff5d6c'], ['速度', st.spd, '#4dffb4'], ['威力', st.pow, '#ffd447']];
          rows.forEach((r, k) => {
            const y = py + 47 + k * 18; D.text(ctx, r[0], px + 16, y, 13, '#cfe9ff');
            for (let s = 0; s < 5; s++) { ctx.fillStyle = s < r[1] ? r[2] : 'rgba(255,255,255,.14)'; ctx.fillRect(px + 64 + s * 30, y - 5, 25, 10); }
          });
          D.text(ctx, '必殺技（□・ゲージ半分消費）', px + 262, py + 45, 12, '#cfe9ff');
          D.text(ctx, c.sp.name, px + 262, py + 65, 21, c.col.g, 'left', true);
          D.text(ctx, SP_DESC[c.sp.type], px + 262, py + 85, 12, '#fff');
        } else {
          D.text(ctx, '？？？', px + 16, py + 20, 24, '#8d86b3'); D.text(ctx, 'LOCKED', px + 116, py + 22, 13, '#8d86b3', 'left', true);
          D.text(ctx, '解放条件', px + 16, py + 47, 13, '#cfe9ff');
          D.text(ctx, c.lock, px + 96, py + 47, 18, '#ffd447');
          D.text(ctx, '条件を満たすとシルエットが解放され、使えるようになります', px + 16, py + 71, 12, '#fff');
          D.text(ctx, 'ショップの全キャラ解放パックでも解放できます', px + 16, py + 88, 11, '#9cf3ff');
        }
        // 技表の帯：カーソルが合っているキャラのコマンドコンボ5つ（技名＋コマンド。弱=○ / 強=×、矢印は相手が右にいるときの向き）
        // 上段＝初級3つ（3列）、下段＝上級2つ（2列。金色の地＋「★上級」バッジ＋★つきの金色の技名で区別）
        const by = py + 103, bh = 64, rh = bh / 2, lw = 84, ADV_COL = '#ffc43c';
        panel(px, by, pw, bh, col, 0.86);
        ctx.fillStyle = 'rgba(255,196,60,.13)'; ctx.fillRect(px + 2, by + rh, pw - 4, rh - 2);
        ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(px + 8, by + rh - 0.5, pw - 16, 1);
        D.text(ctx, 'コマンド技', px + 10, by + 10, 12, col); D.text(ctx, '○弱 ×強', px + 10, by + 23, 10, '#cfe9ff');
        const fit = (str, px0, max, it) => { let q = px0; for (; q > 8; q--) { ctx.font = D.font(q, it); if (ctx.measureText(str).width <= max) break; } return q; };
        cmdLayout = []; cmdBadge = null;
        if (open) { // 「★上級」バッジ（下段の左）
          cmdBadge = { x: px + 9, y: by + rh + 6, w: 66, h: 19, label: '★上級' };
          ctx.fillStyle = ADV_COL; rr(cmdBadge.x, cmdBadge.y, cmdBadge.w, cmdBadge.h, 5); ctx.fill();
          ctx.font = D.font(13); ctx.fillStyle = '#2a1400'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cmdBadge.label, cmdBadge.x + cmdBadge.w / 2, cmdBadge.y + cmdBadge.h / 2 + 1); ctx.textAlign = 'left'; // 金地に濃い文字（縁取りなしで読みやすく）
        }
        (open ? c.cmds : []).forEach((m, k) => {
          const row = m.adv ? 1 : 0, col2 = row ? k - 3 : k, cw = (pw - lw - 8) / (row ? 2 : 3);
          const x = px + lw + col2 * cw, y = by + row * rh, max = cw - 14, label = (row ? '★' : '') + m.name;
          if (col2) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x - 5, y + 5, 1, rh - 10); }
          const s1 = fit(label, 12, max, false), s2 = fit(m.text, 15, max, true);
          D.text(ctx, label, x + 2, y + 10, s1, row ? ADV_COL : c.col.g);
          D.text(ctx, m.text, x + 2, y + 23, s2, '#fff', 'left', true);
          ctx.font = D.font(s1); const w1 = ctx.measureText(label).width; ctx.font = D.font(s2, true); const w2 = ctx.measureText(m.text).width;
          cmdLayout.push({ name: m.name, text: m.text, adv: row, label, x: x + 2, y, row, max, w: Math.max(w1, w2), px: [s1, s2], right: x + 2 + Math.max(w1, w2), bandRight: px + pw, bandBottom: by + bh });
        });
        if (!open) D.text(ctx, '？？？　（解放すると見られます）', px + lw + 2, by + bh / 2, 13, '#8d86b3');
        for (const [r, label, on] of [[B_BACK, '× もどる', true], [B_OK, '○ 決定', !o.gallery]]) {
          if (!on) continue;
          ctx.fillStyle = 'rgba(10,4,30,.85)'; rr(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.strokeStyle = label[0] === '○' ? '#ff5d6c' : '#6fb7ff'; ctx.lineWidth = 2; rr(r.x, r.y, r.w, r.h, 8); ctx.stroke();
          D.text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, 16, '#fff', 'center');
        }
        if (o.color) { // カラー切替ボタン：3色の目印（選択中は金の輪、未所有の2色は薄く＋鍵）
          const r = B_COL, own = colorOwned(), v = colorOf(cur), ch = CHARS[cur], cy = r.y + r.h / 2;
          ctx.fillStyle = 'rgba(10,4,30,.85)'; rr(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.strokeStyle = own ? '#c79bff' : '#5b5770'; ctx.lineWidth = 2; rr(r.x, r.y, r.w, r.h, 8); ctx.stroke();
          D.text(ctx, 'カラー', r.x + 10, cy - 7, 13, own ? '#fff' : '#b9b3d6');
          D.text(ctx, own ? 'L / R で切替' : 'パックで解放', r.x + 10, cy + 9, 9, own ? '#cfe9ff' : '#ffe9a8');
          for (let k = 0; k < 3; k++) {
            const x = r.x + 84 + k * 27, open = k === 0 || own;
            ctx.globalAlpha = open ? 1 : 0.35; ctx.fillStyle = isUnlocked(cur) ? chipCol(ch, k) : '#5b5770'; ctx.beginPath(); ctx.arc(x, cy, 9, 0, PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            ctx.strokeStyle = k === v ? '#ffd447' : 'rgba(255,255,255,.45)'; ctx.lineWidth = k === v ? 3 : 1; ctx.beginPath(); ctx.arc(x, cy, k === v ? 11.5 : 9, 0, PI * 2); ctx.stroke();
            if (!open) D.drawLock(ctx, x, cy, 11, '#f1eeff');
          }
          if (pv > 0 && isUnlocked(cur)) { // 切り替えた直後だけ、そのカラーの立ち絵を見せる（ポートレートは通常色のままなので）
            const bx = 385, by = 70, bw = 190, bh = 244;
            ctx.globalAlpha = Math.min(1, pv / 12); panel(bx, by, bw, bh, '#ffd447', 0.94);
            D.text(ctx, ch.name + '　カラー' + (v + 1), bx + bw / 2, by + 18, 15, '#fff', 'center');
            if (v ? D.variantReady(cur, v) : D.hasSprite(cur)) {
              ctx.save(); ctx.beginPath(); ctx.rect(bx + 3, by + 32, bw - 6, bh - 36); ctx.clip();
              const k = 0.72; ctx.translate(bx + bw / 2, by + bh - 12); ctx.scale(k, k); D.drawFighter(ctx, { ci: cur, x: 0, y: 0, face: 1, st: 'idle', t: T, vx: 0, atk: '' }, { zoom: k, v, alpha: Math.min(1, pv / 12) }); ctx.restore();
            } else D.text(ctx, '読み込み中…', bx + bw / 2, by + bh / 2, 13, '#8d86b3', 'center');
            ctx.globalAlpha = 1;
          }
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
  function VS(c0, c1, label, labels, next, stage, v0) { // v0 = P1 のカラー（BRIEF10。ここで絵を読み始めておく。ポートレートは通常色のまま）
    let t = 0; setBtns([]); A.play('special'); D.preloadFighter(c0, v0); D.preloadFighter(c1); if (stage) D.preloadStage(stage);
    return {
      kind: 'vs',
      update(m, pr) { t++; if (D.warmFighter(c0, v0)) D.warmFighter(c1); if (t > 120 || (t > 20 && (pr & (K.A | I.OK)))) next(); },
      tap() { if (t > 20) next(); return true; },
      draw() {
        bg(0.66); header(label, stage ? 'STAGE：' + stageName(stage) : '');
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
    const stage = (STAGES.find(st => st.id === o.stage) || STAGES[0]).id; // BRIEF9: ステージは見た目だけ。sim の状態 b には入れず、画面側が持つ
    // BRIEF10: カラーも見た目だけなので view 側に持つ（P1 = 選んだカラー、CPU は通常色固定）
    const col = [o.col === 1 || o.col === 2 ? o.col : 0, 0];
    const b = N.newBattle(o.c0, o.c1), ai = N.newAI(o.lv), view = { ghost: [], labels: o.labels, stage, col };
    D.preloadStage(stage); D.preloadFighter(o.c0, col[0]);
    let paused = false, done = false, counted = false;
    D.fxClear(); setBtns([]);
    const finish = () => { if (!done) { done = true; o.onEnd(b.winner === 0); } };
    const s = {
      kind: 'battle', b, stage, col,
      menu() {
        if (b.phase === 'over') return;
        paused = !paused; A.play(paused ? 'ok' : 'back');
        setBtns(paused ? [{ x: 330, y: 250, w: 300, h: 46, label: 'つづける', act: () => s.menu(), snd: 'back' }, { x: 330, y: 306, w: 300, h: 46, label: 'タイトルへもどる', act: toTitle }] : []);
      },
      update(m, pr) {
        if (pr & I.BACK) { s.menu(); return; }
        if (paused) { menuUpdate(pr & ~I.BACK); return; }
        if (b.phase === 'intro' && D.warmFighter(o.c0, col[0])) D.warmFighter(o.c1);
        N.step(b, m & 1023, N.aiInput(b, 1, ai));
        for (const e of b.ev) fxAndSound(e, b);
        b.ev.length = 0; D.fxTick();
        // BRIEF10: CPU戦（アーケード＋フリーバトル）の戦績。決着がついた時点で1回だけ数える
        if (b.phase === 'over' && !counted) { counted = true; if (b.winner === 0) save.wins++; else save.losses++; persist(); }
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
  function startArcadeSelect() { go(Select({ title: 'アーケード：CPU と5連戦（だんだん強くなる）', color: true, onBack: toTitle, onPick: startArcade })); }
  function startArcade(ci) {
    const pool = []; for (let i = 0; i < INITIAL; i++) if (i !== ci) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
    const boss = ci === idx('ryujin') ? idx('mumei') : idx('ryujin');
    arcadeStage({ ci, opp: pool.slice(0, 4).concat([boss]), stage: 0, cont: false });
  }
  function arcadeStage(arc) {
    const c1 = arc.opp[arc.stage], lv = arc.stage + 1, labels = ['YOU', 'CPU Lv' + lv];
    const pool = ownedStages(), stage = pool[Math.floor(Math.random() * pool.length)].id; // BRIEF9: マッチごとに所有ステージからランダム
    const v0 = colorOf(arc.ci);
    go(VS(arc.ci, c1, `ARCADE  STAGE ${lv} / 5` + (lv === 5 ? '  ― FINAL ―' : ''), labels, () => go(Battle({
      c0: arc.ci, c1, lv, labels, stage, col: v0,
      onEnd(win) { if (!win) return go(Continue(arc)); arc.stage++; if (arc.stage >= 5) go(Clear(arc)); else arcadeStage(arc); },
    })), stage, v0));
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
      title: 'フリーバトル：自分のキャラを選択', color: true, onBack: toTitle,
      onPick(ci) {
        go(Select({
          title: 'フリーバトル：対戦相手（CPU）を選択', tag: 'CPU', cur: (ci + 1) % INITIAL, onBack: startFree,
          onPick(cj) { freeLevel(ci, cj, 1); },
        }));
      },
    }));
  }
  // キャラ → CPU の強さ → ステージ（BRIEF9）→ 対戦
  function freeLevel(ci, cj, f) {
    go(Menu('CPU の強さ', LV_NAMES.map((n, i) => [n, () => go(StageSelect({ sub: `${CHARS[ci].name}  VS  ${CHARS[cj].name}（${LV_NAMES[i]}）`, onBack: () => freeLevel(ci, cj, i), onPick: st => freeBattle(ci, cj, i + 1, st) }))]).concat([['もどる', startFree, 'back']]), startFree, { focus: f, sub: `${CHARS[ci].name}  VS  ${CHARS[cj].name}` }));
  }
  function freeBattle(ci, cj, lv, stage) {
    const labels = ['YOU', 'CPU Lv' + lv], v0 = colorOf(ci);
    go(VS(ci, cj, 'FREE BATTLE', labels, () => go(Battle({
      c0: ci, c1: cj, lv, labels, stage, col: v0,
      onEnd(win) { go(Menu(win ? 'YOU WIN !' : 'YOU LOSE…', [['もう一度', () => freeBattle(ci, cj, lv, stage)], ['キャラ選択へ', startFree], ['タイトルへ', toTitle]], toTitle, { sub: `${CHARS[ci].name}  VS  ${CHARS[cj].name}（${LV_NAMES[lv - 1]}・${stageName(stage)}）` })); },
    })), stage, v0));
  }

  // ================= ステージ選択（BRIEF9） =================
  // 4枚を横一列に並べる。所有ステージだけ決定できる。ロック中は灰色＋鍵マーク＋パック名を出し、決定するとショップへ案内する
  const SG = { w: 180, h: 101, gap: 12, y: 96 }, sgX = i => 480 - (STAGES.length * SG.w + (STAGES.length - 1) * SG.gap) / 2 + i * (SG.w + SG.gap);
  let lastStage = 'neon';
  function StageSelect(o) {
    STAGES.forEach(st => D.preloadStage(st.id));
    let cur = Math.max(0, STAGES.findIndex(st => st.id === lastStage)); if (!stageOwned(STAGES[cur])) cur = 0;
    setBtns([]);
    const packName = st => Shop.product(st.pack).name;
    function pick() {
      const st = STAGES[cur];
      if (!stageOwned(st)) { A.play('ng'); toastMsg(`このステージは「${packName(st)}」に入っています ― タイトルの「ショップ」へ`, 220); return; }
      A.play('ok'); lastStage = st.id; o.onPick(st.id);
    }
    function mv(d) { const n = STAGES.length; cur = (cur + d + n) % n; A.play('move'); }
    return {
      kind: 'stage', back: o.onBack, get cur() { return cur; }, get stageId() { return STAGES[cur].id; },
      get list() { return STAGES.map((st, i) => ({ id: st.id, name: st.name, owned: stageOwned(st), x: sgX(i), y: SG.y, w: SG.w, h: SG.h })); },
      update(m, pr) {
        if (pr & K.L) mv(-1); else if (pr & K.R) mv(1);
        else if (pr & (K.A | I.OK)) pick();
        else if (pr & (K.H | I.BACK)) { A.play('back'); o.onBack(); }
      },
      tap(x, y) {
        for (let i = 0; i < STAGES.length; i++) if (inR({ x: sgX(i), y: SG.y, w: SG.w, h: SG.h + 30 }, x, y)) { if (cur === i) pick(); else { cur = i; A.play('move'); } return true; }
        if (inR(B_BACK, x, y)) { A.play('back'); o.onBack(); return true; }
        if (inR(B_OK, x, y)) { pick(); return true; }
        return false;
      },
      draw() {
        bg(0.66); header('STAGE SELECT', o.sub);
        STAGES.forEach((st, i) => {
          const x = sgX(i), y = SG.y, own = stageOwned(st), sel = i === cur, col = sel ? '#ffd447' : own ? '#5fe0ff' : '#5b5770';
          D.drawStageThumb(ctx, st.id, x, y, SG.w, SG.h, !own);
          ctx.fillStyle = 'rgba(10,4,30,.9)'; ctx.fillRect(x, y + SG.h, SG.w, 30);
          D.text(ctx, st.name, x + SG.w / 2, y + SG.h + 15, 15, own ? '#fff' : '#b9b3d6', 'center');
          if (!own) { D.drawLock(ctx, x + SG.w / 2, y + SG.h / 2 - 12, 36, '#d9d4f0'); D.text(ctx, packName(st), x + SG.w / 2, y + SG.h - 16, 12, '#ffe9a8', 'center'); }
          if (sel) { ctx.strokeStyle = '#ffd447'; ctx.globalAlpha = 0.22; ctx.lineWidth = 12; ctx.strokeRect(x, y, SG.w, SG.h + 30); ctx.globalAlpha = 1; }
          ctx.strokeStyle = col; ctx.lineWidth = sel ? 4 : 2; ctx.strokeRect(x, y, SG.w, SG.h + 30);
        });
        const st = STAGES[cur], own = stageOwned(st), px = 196, py = 262, pw = 568;
        panel(px, py, pw, 208, own ? '#ffd447' : '#8d86b3');
        D.drawStageThumb(ctx, st.id, px + 12, py + 12, 327, 184, !own);
        D.text(ctx, st.name, px + 354, py + 34, 22, own ? '#fff' : '#b9b3d6');
        if (own) {
          D.text(ctx, st.pack ? packName(st) : '最初から遊べるステージ', px + 354, py + 64, 12, '#9cf3ff');
          D.text(ctx, '○ / Enter でこのステージに決定', px + 354, py + 104, 12, '#fff');
          D.text(ctx, '← → でステージを切替', px + 354, py + 124, 12, '#cfe9ff');
        } else {
          D.drawLock(ctx, px + 12 + 327 / 2, py + 12 + 92, 56, '#d9d4f0');
          D.text(ctx, 'LOCKED', px + 354, py + 62, 13, '#8d86b3', 'left', true);
          D.text(ctx, packName(st), px + 354, py + 92, 15, '#ffe9a8');
          D.text(ctx, 'に入っているステージです', px + 354, py + 112, 12, '#fff');
          D.text(ctx, 'タイトルの「ショップ」で', px + 354, py + 142, 12, '#cfe9ff');
          D.text(ctx, '内容を確認できます', px + 354, py + 160, 12, '#cfe9ff');
        }
        for (const [r, label] of [[B_BACK, '× もどる'], [B_OK, '○ 決定']]) {
          ctx.fillStyle = 'rgba(10,4,30,.85)'; rr(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.strokeStyle = label[0] === '○' ? '#ff5d6c' : '#6fb7ff'; ctx.lineWidth = 2; rr(r.x, r.y, r.w, r.h, 8); ctx.stroke();
          D.text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, 16, '#fff', 'center');
        }
      },
    };
  }

  // ================= ショップ（BRIEF9：買い切りパック） =================
  // 決済そのものは持たない。NJCShop（js/shop.js）に頼み、返ってきた status をそのまま正直に表示する。
  // Web 版では app_only が返るので「iOS アプリ版で購入できます」と案内するだけで、購入済みにはならない。
  const SHOP_MSG = {
    buy_app_only: '購入は iOS アプリ版で可能です（配信後に有効になります）',
    restore_app_only: '購入の復元は iOS アプリ版で行えます（配信後に有効になります）',
    purchased: '購入が完了しました。ありがとうございます！', owned: 'このパックは購入済みです', pending: '購入の承認待ちです（承認されると有効になります）',
    error: '購入を完了できませんでした。時間をおいてもう一度お試しください', restore_error: '購入を復元できませんでした。時間をおいてもう一度お試しください',
    restored: '購入を復元しました', restored_none: '復元できる購入はありませんでした',
  };
  // BRIEF10: 商品が4点になったので、カードを 2×2 に並べる（1枚 316×160。左に中身の絵、右に説明、下段に価格と購入ボタン）
  function ShopScreen() {
    const P = Shop.PRODUCTS, CWD = 316, CHG = 160, cx = i => 146 + (i % 2) * (CWD + 12), cy = i => 66 + Math.floor(i / 2) * (CHG + 8);
    let sig = '', busy = false, last = null;
    D.preloadPortraits(); STAGES.forEach(st => D.preloadStage(st.id));
    const say = (key, snd) => { last = key; A.play(snd || 'ng'); toastMsg(SHOP_MSG[key], 240); };
    function buy(id) {
      if (busy) return; busy = true;
      Shop.purchase(id).then(r => {
        busy = false;
        if (r.status === 'app_only') say('buy_app_only'); else if (r.status === 'purchased') say('purchased', 'unlock');
        else if (r.status === 'owned') say('owned'); else if (r.status === 'pending') say('pending', 'ok'); else if (r.status === 'cancelled') last = 'cancelled'; else say('error');
      });
    }
    function restore() {
      if (busy) return; busy = true;
      Shop.restore().then(r => {
        busy = false;
        if (r.status === 'app_only') say('restore_app_only'); else if (r.status === 'restored') say(r.owned.length ? 'restored' : 'restored_none', r.owned.length ? 'unlock' : 'ok'); else say('restore_error');
      });
    }
    function build(f) {
      const list = P.map((p, i) => Shop.owned(p.id)
        ? { x: cx(i) + CWD - 142, y: cy(i) + 114, w: 132, h: 36, size: 17, label: '購入済み', dis: true, act() {} }
        : { x: cx(i) + CWD - 142, y: cy(i) + 114, w: 132, h: 36, size: 17, label: '購入する', col: '#ffd447', act: () => buy(p.id) });
      list.push({ x: 286, y: 404, w: 200, h: 36, label: '購入を復元', size: 16, act: restore });
      list.push({ x: 502, y: 404, w: 172, h: 36, label: '× もどる', size: 16, act: toTitle, snd: 'back' });
      setBtns(list, f || 0);
    }
    build();
    // カード左の絵（112×60）：パックの中身を小さく見せる
    function art(p, x, y) {
      const w = 112, h = 60;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.fillStyle = 'rgba(4,0,14,.55)'; ctx.fillRect(x, y, w, h);
      if (p.id === 'njc_unlock_all') { for (let k = 0; k < 4; k++) D.drawPortrait(ctx, INITIAL + k, x + k * 28, y, 27, h, { nameSize: 1 }); } // 隠しキャラ4人の顔ぶれ
      else if (p.id === 'njc_stages_1') STAGES.filter(st => st.pack === p.id).forEach((st, k) => D.drawStageThumb(ctx, st.id, x + k * 38, y, 36, h)); // 追加ステージ3種
      else if (p.id === COLOR_PACK) { // 同じキャラの3色（通常・カラー2・カラー3）
        for (let v = 0; v < 3; v++) { ctx.save(); ctx.translate(x + 20 + v * 36, y + h - 2); ctx.scale(0.24, 0.24); D.drawFighter(ctx, { ci: 0, x: 0, y: 0, face: 1, st: 'idle', t: 0, vx: 0, atk: '' }, { zoom: 0.24, v }); ctx.restore(); }
      } else { // マイページカスタム：フレームつきポートレート＋背景＋称号
        D.drawStageThumb(ctx, 'bamboo', x, y, w, h);
        D.drawPortrait(ctx, 0, x + 8, y + 5, 36, 50, { nameSize: 1 }); drawFrame('gold', x + 8, y + 5, 36, 50, 0.4);
        ctx.fillStyle = 'rgba(10,4,30,.82)'; ctx.fillRect(x + 50, y + 20, 58, 20); D.text(ctx, '《称号》', x + 79, y + 30, 11, '#ffd447', 'center');
      }
      ctx.restore(); ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    }
    return {
      kind: 'shop', back: toTitle, get last() { return last; }, get busy() { return busy; },
      get cards() { return P.map((p, i) => ({ id: p.id, name: p.name, price: p.price, owned: Shop.owned(p.id), x: cx(i), y: cy(i), w: CWD, h: CHG, btn: btns[i].label, dis: !!btns[i].dis })); },
      update(m, pr) {
        const s = P.map(p => Shop.owned(p.id) ? 1 : 0).join('');
        if (s !== sig) { if (sig) build(focus); sig = s; }
        menuUpdate(pr);
      },
      draw() {
        bg(0.7); header('SHOP', '買い切りパック ― 一度買えばずっと使えます（ガチャはありません）');
        P.forEach((p, i) => {
          const x = cx(i), y = cy(i), own = Shop.owned(p.id), tx = x + 132, tw = CWD - 132 - 10;
          panel(x, y, CWD, CHG, own ? '#4dffb4' : '#ffd447', 0.88);
          textFit(p.name, x + CWD / 2, y + 17, 17, '#fff', 'center', CWD - 20, false, 12);
          art(p, x + 10, y + 32);
          textFit(p.desc[0], tx, y + 41, 12, '#fff', 'left', tw, false, 9);
          textFit(p.desc[1], tx, y + 60, 11, '#ffe9a8', 'left', tw, false, 9);
          textFit(p.desc[2], tx, y + 79, 10, '#cfe9ff', 'left', tw, false, 8);
          D.text(ctx, p.price, x + 14, y + 124, 26, '#ffd447', 'left', true);
          D.text(ctx, '（税込・予定価格）', x + 10, y + 147, 10, '#cfe9ff');
        });
        drawBtns();
        D.text(ctx, Shop.available() ? '購入は App Store の決済で行われます' : 'Web 版は商品のご案内のみです。購入・復元は iOS アプリ版で行えます（配信後に有効になります）', 480, 462, 12, '#ffe9a8', 'center');
      },
    };
  }

  // ================= マイページ（BRIEF10） =================
  // フレーム（有料4種）は線で描く。k = 太さの倍率（ショップの小さい見本用）
  function drawFrame(id, x, y, w, h, k) {
    k = k || 1; if (id === 'none') return;
    const box = (d, col, lw, a) => { ctx.globalAlpha = a == null ? 1 : a; ctx.strokeStyle = col; ctx.lineWidth = lw * k; ctx.strokeRect(x - d * k, y - d * k, w + 2 * d * k, h + 2 * d * k); ctx.globalAlpha = 1; };
    const corners = fn => { for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.save(); ctx.translate(px, py); ctx.scale(sx * k, sy * k); fn(); ctx.restore(); } };
    if (id === 'gold') {
      box(4, '#ffd447', 6); box(8, '#8a5a00', 2); box(1, '#fff3b0', 1.5);
      corners(() => { ctx.fillStyle = '#ffd447'; ctx.fillRect(-11, -11, 16, 16); ctx.fillStyle = '#8a5a00'; ctx.beginPath(); ctx.moveTo(-3, -9); ctx.lineTo(3, -3); ctx.lineTo(-3, 3); ctx.lineTo(-9, -3); ctx.closePath(); ctx.fill(); });
    } else if (id === 'neon') {
      const p = 0.75 + 0.25 * Math.sin(T * 0.08);
      box(4, '#ff4fa8', 14, 0.2 * p); box(4, '#ff4fa8', 4); box(10, '#49d0ff', 10, 0.2 * p); box(10, '#49d0ff', 2.5); box(4, '#fff', 1, 0.8);
    } else if (id === 'sakura') {
      box(4, '#ff9ccf', 5); box(8, '#ffe1ef', 1.5);
      corners(() => { for (let n = 0; n < 5; n++) { ctx.save(); ctx.translate(-4, -4); ctx.rotate(n * PI * 2 / 5 + T * 0.004); ctx.fillStyle = n % 2 ? '#ffd0e6' : '#ff9ccf'; ctx.beginPath(); ctx.ellipse(0, -8, 4, 7.5, 0, 0, PI * 2); ctx.fill(); ctx.restore(); } ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(-4, -4, 2.6, 0, PI * 2); ctx.fill(); });
    } else if (id === 'raijin') {
      box(4, '#ffe066', 5); box(9, '#5ad1ff', 2);
      ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 2 * k; ctx.lineJoin = 'miter';
      for (const yy of [y - 13 * k, y + h + 13 * k]) { ctx.beginPath(); const n = 8; for (let q = 0; q <= n; q++) { const px = x + w * q / n, py = yy + (q % 2 ? -4 : 4) * k; if (q) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
      corners(() => { ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-3, -6); ctx.lineTo(-6, -1); ctx.lineTo(4, -3); ctx.lineTo(-8, 8); ctx.lineTo(-5, 1); ctx.lineTo(-14, 3); ctx.closePath(); ctx.fill(); });
    }
  }
  const ACCOUNT_NOTE = 'クラウドセーブ（Sign in with Apple）はアプリ版アップデートで提供予定';
  // ---- BRIEF11: アカウント（クラウドセーブ）。Web 版はサインイン橋が無いので、従来の案内文のまま ----
  const ACC_OFF = { available: false, signedIn: false, status: 'idle', error: '' };
  const accState = () => (Acc ? Acc.state() : ACC_OFF);
  const ACC_ERR = { network: '通信できませんでした', expired: 'サインインの有効期限が切れました', too_large: 'セーブが大きすぎて保存できません', conflict: '別の端末の変更と重なりました', server: 'サーバーで問題が起きました' };
  function accHead() {
    const a = accState();
    if (!a.signedIn) return a.error === 'expired' ? '未連携（期限切れ。もう一度サインインしてください）' : '未連携（この端末だけに保存）';
    return '連携中 ― ' + (a.status === 'syncing' ? '同期中…' : a.status === 'error' ? '同期できていません' : a.status === 'synced' ? '同期済み' : '待機中');
  }
  function accNote() {
    const a = accState();
    if (a.signedIn) return a.status === 'error' ? (ACC_ERR[a.error] || ACC_ERR.server) + '（次のセーブ時に再試行）' : 'Apple でサインイン済み（クラウドセーブ有効）';
    return a.available ? 'サインインすると、セーブをクラウドに保存できます' : ACCOUNT_NOTE;
  }
  let accBusy = false;
  function accSignIn() {
    if (!Acc || accBusy) return;
    accBusy = true; toastMsg('Apple でサインインしています…', 600);
    Acc.signIn().then(r => {
      accBusy = false;
      if (r.status === 'signed_in') { A.play('unlock'); toastMsg(r.synced ? 'サインインしました。クラウドセーブと同期しました' : 'サインインしました（同期はまだです。次にセーブしたときに再試行します）', 240); }
      else if (r.status === 'cancelled') toastMsg('サインインをやめました', 100);
      else { A.play('ng'); toastMsg(r.why === 'network' ? 'サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください' : r.status === 'unavailable' ? 'サインインは iOS アプリ版で行えます' : 'サインインできませんでした。時間をおいて、もう一度お試しください', 260); }
    }, () => { accBusy = false; A.play('ng'); toastMsg('サインインできませんでした。時間をおいて、もう一度お試しください', 260); });
  }
  function accSignOut() { if (!Acc) return; Acc.signOut(); toastMsg('サインアウトしました（この端末のセーブはそのまま残ります）', 220); }
  const shortPid = () => save.pid.slice(0, 8) + '…';
  function MyPage(f) {
    D.preloadPortraits();
    const items = [['名前を変更', openName], ['メインキャラ', pickMain], ['称号', () => go(EquipPick('titles'))], ['フレーム', () => go(EquipPick('frames'))], ['背景', () => go(EquipPick('bgs'))]];
    const list = items.map((it, i) => ({ x: 166 + i * 127, y: 284, w: 120, h: 38, size: 16, label: it[0], act: it[1] }));
    list.push({ x: 166, y: 332, w: 247, h: 38, size: 16, label: 'セーブコード（発行・読み込み）', act: openCode });
    list.push({ x: 420, y: 332, w: 150, h: 38, size: 16, label: '× もどる', act: toTitle, snd: 'back' });
    // BRIEF11: アカウント欄のボタン。サインイン橋（アプリ版）がある時だけ「Sign in with Apple」、サインイン中は「サインアウト」「削除」。
    // Web 版（橋なし・未サインイン）ではボタンを足さない＝従来どおり案内文だけ
    const base = list.length; let sig = '';
    const accSig = () => { const a = accState(); return (a.signedIn ? 2 : a.available ? 1 : 0) + ''; };
    function build(fc) {
      const a = accState(), l = list.slice(0, base);
      if (a.signedIn) {
        l.push({ x: 428, y: 392, w: 100, h: 38, size: 13, label: 'サインアウト', id: 'accOut', act: accSignOut });
        l.push({ x: 534, y: 392, w: 230, h: 38, size: 13, label: 'アカウントとクラウドデータを削除', id: 'accDel', col: '#ff5d6c', act: openDel });
      } else if (a.available) l.push({ x: 548, y: 392, w: 216, h: 38, size: 15, label: 'Sign in with Apple', id: 'accIn', act: accSignIn });
      setBtns(l, Math.min(fc || 0, l.length - 1)); sig = accSig();
    }
    build(f || 0);
    function pickMain() {
      go(Select({ title: 'マイページ：メインキャラを選択', cur: mainCharIdx(), onBack: () => go(MyPage(1)), onPick(ci) { save.mainChar = CHARS[ci].id; persist(); go(MyPage(1)); } }));
    }
    return {
      kind: 'mypage', back: toTitle,
      // 画面に出している内容（自動確認用）
      get info() { return { pid: save.pid, pidShort: shortPid(), pname: save.pname, title: equipped('titles').name, frame: equipped('frames').id, bg: equipped('bgs').id, main: CHARS[mainCharIdx()].id, wins: save.wins, losses: save.losses, clears: save.clears, onlineWins: save.onlineWins, account: accNote(), accountHead: accHead(), accountButtons: btns.filter(b => b.id).map(b => b.id) }; },
      update(m, pr) { if (accSig() !== sig) build(focus); menuUpdate(pr); },
      draw() {
        bg(0.6, equipped('bgs').stage); header('MY PAGE');
        const mc = mainCharIdx(), px = 166, py = 70, pw = 150, ph = 196;
        D.drawPortrait(ctx, mc, px, py, pw, ph, { t: T, nameSize: 16, front: true }); drawFrame(equipped('frames').id, px, py, pw, ph);
        const ix = 336, iw = 458; panel(ix, 62, iw, 212, '#5fe0ff', 0.84);
        ctx.fillStyle = 'rgba(90,60,10,.7)'; rr(ix + 14, 72, 250, 26, 6); ctx.fill(); ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 1.5; rr(ix + 14, 72, 250, 26, 6); ctx.stroke();
        D.text(ctx, '称号', ix + 24, 86, 11, '#ffe9a8'); textFit(equipped('titles').name, ix + 60, 86, 16, '#ffd447', 'left', 196, false, 11);
        textFit(save.pname, ix + 16, 126, 32, '#fff', 'left', iw - 32, false, 16);
        D.text(ctx, 'PLAYER ID', ix + 16, 160, 11, '#9cf3ff', 'left', true); D.text(ctx, shortPid(), ix + 96, 160, 15, '#fff', 'left', true);
        D.text(ctx, '（全文は「セーブコード」に表示）', ix + 196, 161, 11, '#cfe9ff');
        ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(ix + 14, 176, iw - 28, 1);
        D.text(ctx, '戦績', ix + 16, 190, 12, '#ffe9a8');
        const rows = [['CPU戦 勝ち', save.wins, '#ffd447'], ['CPU戦 負け', save.losses, '#cfe9ff'], ['アーケードクリア', save.clears, '#4dffb4'], ['オンライン勝利', save.onlineWins, '#ff8ad0']];
        rows.forEach((r, k) => {
          const x = ix + 14 + k * 108, y = 202; ctx.fillStyle = 'rgba(4,0,14,.55)'; rr(x, y, 102, 60, 6); ctx.fill();
          D.text(ctx, r[0], x + 51, y + 14, 11, '#cfe9ff', 'center'); D.text(ctx, String(r[1]), x + 51, y + 40, 26, r[2], 'center', true);
        });
        // アカウント欄。Web 版は案内だけ（ボタンなし）。アプリ版はこの枠の中にボタンが乗るので、枠を先に描く
        const a = accState();
        panel(166, 384, 628, 54, a.signedIn ? '#2f8f6f' : '#5b5770', 0.72);
        drawBtns();
        if (!a.signedIn && !a.available) { // Web 版：従来どおり案内だけ
          D.text(ctx, 'アカウント', 180, 400, 12, '#b9b3d6'); D.text(ctx, accHead(), 780, 400, 11, '#b9b3d6', 'right');
          D.text(ctx, accNote(), 180, 422, 13, '#cfe9ff');
        } else {                           // アプリ版：左に状態、右にボタン
          D.text(ctx, 'アカウント', 180, 400, 12, a.signedIn ? '#4dffb4' : '#b9b3d6'); textFit(accHead(), 250, 400, 11, a.signedIn ? '#4dffb4' : '#b9b3d6', 'left', a.signedIn ? 170 : 290, false, 8);
          textFit(accNote(), 180, 422, 12, '#cfe9ff', 'left', a.signedIn ? 240 : 360, false, 8);
        }
        D.text(ctx, a.signedIn ? 'セーブはクラウドにも保存されます（変更のたびに自動で同期）。サインアウトしても、この端末のセーブは残ります' : 'いまのセーブはこの端末の中だけにあります。機種変更やデータ消去の前に、セーブコードを発行して控えてください', 480, 456, 11, '#ffe9a8', 'center');
      },
    };
  }
  // 称号・フレーム・背景の装備変更。未所有の項目はロック表示（鍵＋パック名／解放条件）で、決定すると理由を案内する
  const EQ_TITLE = { titles: '称号', frames: 'フレーム', bgs: '背景' }, EQ_FOCUS = { titles: 2, frames: 3, bgs: 4 };
  function EquipPick(kind) {
    const list = MY[kind], key = EQ_KEY[kind], cols = kind === 'titles' ? 3 : 1, bw = cols === 3 ? 204 : 300, bh = 44, x0 = 166, y0 = 72, back = () => go(MyPage(EQ_FOCUS[kind]));
    let sig = '';
    const sigNow = () => list.map(it => (itemOpen(it) ? 1 : 0)).join('') + equipped(kind).id;
    if (kind === 'bgs') list.forEach(it => D.preloadStage(it.stage));
    function build(f) {
      const eq = equipped(kind).id;
      const l = list.map((it, i) => {
        const open = itemOpen(it), b = { x: x0 + (i % cols) * (bw + 8), y: y0 + Math.floor(i / cols) * (bh + 6), w: bw, h: bh, size: 15, label: it.name };
        if (!open) return Object.assign(b, { dis: true, why: itemWhy(it), sub: it.pack ? Shop.product(it.pack).name : '条件：' + it.lock, act() {} });
        return Object.assign(b, { sub: it.id === eq ? '装備中' : it.pack ? 'カスタムパック' : it.cond ? '実績で解放' : '基本', subCol: it.id === eq ? '#4dffb4' : '#cfe9ff', col: it.id === eq ? '#4dffb4' : '#5fe0ff', act() { save[key] = it.id; persist(); build(i); } });
      });
      l.push({ x: 405, y: 452, w: 150, h: 38, size: 16, label: '× もどる', act: back, snd: 'back' });
      setBtns(l, f == null ? Math.max(0, list.findIndex(it => it.id === eq)) : f); sig = sigNow();
    }
    build();
    const cur = () => list[focus] || equipped(kind);
    return {
      kind: 'equip', back, what: kind,
      get items() { return list.map((it, i) => ({ id: it.id, name: it.name, open: itemOpen(it), eq: equipped(kind).id === it.id, pack: it.pack || null, sub: btns[i].sub, dis: !!btns[i].dis })); },
      update(m, pr) { if (sigNow() !== sig) build(focus); menuUpdate(pr); },
      draw() {
        const it = cur();
        bg(kind === 'bgs' ? 0.45 : 0.66, kind === 'bgs' ? it.stage : equipped('bgs').stage); header('MY PAGE ― ' + EQ_TITLE[kind], '装備する項目を選んでください（鍵つきは未所有）');
        drawBtns();
        if (kind === 'frames') {
          const px = 592, py = 86; D.drawPortrait(ctx, mainCharIdx(), px, py, 150, 196, { t: T, nameSize: 16, front: true }); drawFrame(it.id, px, py, 150, 196);
          D.text(ctx, it.name, px + 75, py + 232, 15, itemOpen(it) ? '#fff' : '#b9b3d6', 'center');
        } else if (kind === 'bgs') {
          const px = 496, py = 76; panel(px - 6, py - 6, 302, 208, itemOpen(it) ? '#ffd447' : '#8d86b3', 0.86);
          D.drawStageThumb(ctx, it.stage, px, py, 290, 163, !itemOpen(it)); if (!itemOpen(it)) D.drawLock(ctx, px + 145, py + 76, 44, '#d9d4f0');
          D.text(ctx, it.name, px + 145, py + 182, 15, itemOpen(it) ? '#fff' : '#b9b3d6', 'center');
        }
        if (!itemOpen(it)) D.text(ctx, itemWhy(it), 480, 424, 13, '#ffe9a8', 'center');
      },
    };
  }

  // ---- DOM オーバーレイ（名前変更・セーブコード）。開いている間は body.modal が付き、input.js はキーもタッチも拾わない ----
  const $ = id => document.getElementById(id), ovl = $('ovl');
  let ovOpen = '', pendingCode = null;
  function openOv(id) { ovOpen = id; for (const k of ['ovName', 'ovCode', 'ovDel']) $(k).hidden = k !== id; ovl.hidden = false; document.body.classList.add('modal'); I.keys = 0; }
  function closeOv() { ovOpen = ''; pendingCode = null; ovl.hidden = true; document.body.classList.remove('modal'); const a = document.activeElement; if (a && a.blur) a.blur(); }
  const ovMsg = (id, cls, str) => { const e = $(id); e.className = 'ovmsg' + (cls ? ' ' + cls : ''); e.textContent = str || ''; };
  function openName() { openOv('ovName'); const i = $('ovNameIn'); i.value = save.pname; ovMsg('ovNameMsg'); setTimeout(() => { i.focus(); i.select(); }, 0); }
  function commitName() {
    const v = cleanName($('ovNameIn').value);
    if (!v) { ovMsg('ovNameMsg', 'err', '名前を1文字以上入力してください'); return; }
    save.pname = v; persist(); closeOv(); A.play('ok'); toastMsg('プレイヤー名を「' + v + '」に変更しました', 150);
  }
  function codeConfirm(on) { $('ovCodeMain').hidden = on; $('ovCodeConfirm').hidden = !on; $('ovCodeTa').readOnly = on; if (!on) pendingCode = null; }
  function openCode() { openOv('ovCode'); $('ovPid').textContent = save.pid; $('ovCodeTa').value = ''; ovMsg('ovCodeMsg'); codeConfirm(false); }
  function codeIssue() { const ta = $('ovCodeTa'); ta.value = makeSaveCode(); ta.focus(); ta.select(); ovMsg('ovCodeMsg', 'ok', '発行しました。このコードをコピーして、メモなどに控えてください'); }
  function codeCopy() {
    const ta = $('ovCodeTa'); if (!ta.value.trim()) { ovMsg('ovCodeMsg', 'err', 'コピーするコードがありません（先に「発行」を押してください）'); return; }
    const done = () => ovMsg('ovCodeMsg', 'ok', 'コピーしました'), manual = () => { ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 下で案内 */ } if (ok) done(); else ovMsg('ovCodeMsg', '', '自動でコピーできませんでした。コードを長押し（選択）してコピーしてください'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, manual); else manual();
  }
  function codeLoad() {
    const r = readSaveCode($('ovCodeTa').value);
    if (!r.ok) { ovMsg('ovCodeMsg', 'err', r.why + '。セーブは変更していません'); return; }
    pendingCode = r.s; codeConfirm(true); pendingCode = r.s;
    ovMsg('ovCodeMsg', '', `「${cleanName(r.s.pname) || 'プレイヤー'}」（ID ${r.s.pid.slice(0, 8)}…）のセーブで、この端末のセーブを上書きします。元には戻せません。よろしいですか？`);
  }
  function codeYes() {
    if (!pendingCode) return;
    applySaveCode(pendingCode); codeConfirm(false); $('ovPid').textContent = save.pid; A.play('unlock');
    ovMsg('ovCodeMsg', 'ok', 'セーブコードを読み込みました（解放状況・購入済みパック・名前・カラーを反映）');
  }
  function codeNo() { codeConfirm(false); ovMsg('ovCodeMsg', '', 'やめました。セーブは変更していません'); }
  // BRIEF11: アカウント削除の確認（App Store 5.1.1(v)）。「削除する」で初めて DELETE /account を送る
  let delBusy = false;
  function delMode(done) { $('ovDelAsk').hidden = done; $('ovDelDone').hidden = !done; $('ovDelText').hidden = done; $('ovDelAfter').hidden = !done; }
  function openDel() { if (!Acc || !Acc.signedIn()) return; openOv('ovDel'); delBusy = false; $('ovDelYes').disabled = false; delMode(false); ovMsg('ovDelMsg'); }
  function delYes() {
    if (delBusy || !Acc) return;
    delBusy = true; $('ovDelYes').disabled = true; ovMsg('ovDelMsg', '', '削除しています…');
    Acc.deleteAccount().then(r => {
      delBusy = false; $('ovDelYes').disabled = false;
      if (r.status === 'deleted') { delMode(true); A.play('ok'); ovMsg('ovDelMsg', 'ok', 'クラウドのデータを削除し、サインアウトしました'); }
      else if (r.status === 'deleted_session_expired' || r.status === 'not_signed_in') ovMsg('ovDelMsg', 'err', 'サインインの有効期限が切れていたため、削除できませんでした。もう一度サインインしてからやり直してください');
      else ovMsg('ovDelMsg', 'err', (r.why === 'network' ? '通信できませんでした' : 'サーバーで問題が起きました') + '。まだ削除されていません。もう一度お試しください');
    });
  }
  $('ovDelNo').addEventListener('click', () => { if (!delBusy) closeOv(); }); $('ovDelYes').addEventListener('click', delYes); $('ovDelClose').addEventListener('click', closeOv);
  $('ovNameOk').addEventListener('click', commitName); $('ovNameCancel').addEventListener('click', closeOv);
  $('ovCodeClose').addEventListener('click', closeOv); $('ovCodeIssue').addEventListener('click', codeIssue); $('ovCodeCopy').addEventListener('click', codeCopy);
  $('ovCodeLoad').addEventListener('click', codeLoad); $('ovCodeYes').addEventListener('click', codeYes); $('ovCodeNo').addEventListener('click', codeNo);
  // オーバーレイを開いている間のキーはゲームへ流さない（window のキャプチャ段階で止める。入力欄にフォーカスが無くても Esc で閉じられる）。
  // 閉じた瞬間に同じ Enter / Esc がゲーム側のメニューを動かさないようにするため。日本語変換の確定 Enter では決定しない
  addEventListener('keydown', e => {
    if (!ovOpen) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (pendingCode) codeNo(); else if (!delBusy) closeOv(); }
    else if (e.key === 'Enter' && e.target === $('ovNameIn') && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); commitName(); }
  }, true);

  // ================= オンライン =================
  const on = { ci: 0, code: '', room: null, match: null, b: null, role: '', remote: 0, pending: [], end: null, view: null, got: false, sent: false, newUnlock: false };
  function startOnline() {
    if (!Net.available()) { A.play('ng'); toastMsg('オンラインは server.js を起動して http://<ホスト>:8902/ で開くと使えます', 260); return; }
    go(Select({ title: 'オンライン対戦：使用キャラを選択', onBack: toTitle, onPick(ci) { on.ci = ci; go(OnlineMenu()); } }));
  }
  function connectThen(fn) { toastMsg('サーバーに接続中…', 60); Net.connect().then(fn).catch(() => { A.play('ng'); toastMsg(!/^(localhost|127[.]0[.]0[.]1)$/.test(location.hostname) ? 'オンライン対戦は準備中です（アーケード／フリーバトルは遊べます）' : 'サーバーに接続できませんでした'); }); }
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
    D.preloadFighter(m.ca); D.preloadFighter(m.cb);
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
        if (b.phase === 'intro' && D.warmFighter(b.f[0].ci)) D.warmFighter(b.f[1].ci);
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
  // ---- FPS 統計（直近120フレームの平均と最低）。F キーまたは URL に ?fps で画面にも出す ----
  const FPS_N = 120, dts = new Float32Array(FPS_N); let dtI = 0, dtN = 0, showFps = /[?&]fps\b/.test(location.search), fpsStr = '', dropped = 0;
  function fpsStats() {
    if (!dtN) return { n: 0, avg: 0, min: 0, dropped };
    let sum = 0, mx = 0; for (let i = 0; i < dtN; i++) { sum += dts[i]; if (dts[i] > mx) mx = dts[i]; }
    return { n: dtN, avg: 1000 / (sum / dtN), min: 1000 / mx, dropped };
  }
  I.onFps = () => { showFps = !showFps; };
  function render() {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    scr.draw();
    if (toast) {
      ctx.font = D.font(15); const w = Math.min(900, ctx.measureText(toast.str).width + 40);
      ctx.globalAlpha = Math.min(1, toast.life / 20); panel(480 - w / 2, 232, w, 40, '#ffd447', 0.92); D.text(ctx, toast.str, 480, 253, 15, '#fff', 'center'); ctx.globalAlpha = 1;
    }
    if (showFps) {
      if (T % 20 === 0 || !fpsStr) { const f = fpsStats(); fpsStr = `FPS avg ${f.avg.toFixed(1)} / min ${f.min.toFixed(1)}  (${cv.width}x${cv.height})`; }
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(330, 76, 300, 18); ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#7dff9a'; ctx.fillText(fpsStr, 480, 85);
    }
  }
  // 固定タイムステップ（60 回/秒）。
  // ・60Hz 表示では rAF の時刻が ±数ms 揺れるので、そのまま足すと「0ステップの次に2ステップ」が混ざって動きがガタつく。
  //   16.7ms 前後の間隔はちょうど1ステップとして扱う。
  // ・遅れても 1フレームに進めるのは最大2ステップ。それ以上の遅れは捨てる（追いつこうとして更に重くなる悪循環を防ぐ）。
  // ・ステップが進まなかったフレーム（120Hz 表示の2回に1回）は描き直さない。
  const STEP = 1000 / 60, MAX_STEPS = 2;
  // ---- 自動解像度：試合中に 60fps を保てない端末では、内部解像度を一段ずつ下げる（画が少し甘くなる代わりに動きを優先）。
  // 120フレームごとに「21ms を超えた（＝60fps に間に合わなかった）フレームの割合」を見て、2回続けて 12% を超えたら 0.85 倍に下げる（下限は等倍 1.0）。
  // 下げても割合が 3/4 以下に減らなければ解像度が原因ではないので、元に戻して以後は触らない。URL に ?noadapt を付けると無効。
  const adapt = { on: !/[?&]noadapt\b/.test(location.search), n: 0, slow: 0, bad: 0, prev: null, log: [] };
  function adaptTick(dt) {
    if (!adapt.on || !scr || (scr.kind !== 'battle' && scr.kind !== 'obattle')) { adapt.n = 0; adapt.slow = 0; adapt.bad = 0; return; }
    if (++adapt.n <= 0) return; // 切替直後の様子見
    if (dt > 21) adapt.slow++;
    if (adapt.n < 120) return;
    const r = adapt.slow / adapt.n; adapt.n = 0; adapt.slow = 0;
    if (adapt.prev) { // 直前に下げた結果の判定
      const p = adapt.prev; adapt.prev = null;
      if (r > p.r * 0.75) { maxR = p.maxR; adapt.on = false; adapt.log.push({ revertTo: p.maxR, slow: +r.toFixed(2) }); fit(); return; }
      adapt.bad = r > 0.12 ? 1 : 0; // 効いた。まだ遅ければ次の窓でもう一段
    } else adapt.bad = r > 0.12 ? adapt.bad + 1 : 0;
    if (adapt.bad >= 2 && ratio > 1) {
      adapt.prev = { maxR, r }; maxR = Math.max(1, ratio * 0.85); adapt.bad = 0; adapt.n = -30;
      fit(); adapt.log.push({ ratio: +ratio.toFixed(3), slow: +r.toFixed(2) });
    }
  }
  let last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!frame.booted) { frame.booted = true; const b = document.getElementById('boot'); if (b) b.remove(); }
    if (!last) { last = ts; tick(); render(); return; }
    let dt = ts - last; last = ts;
    if (dt > 0 && dt < 1000) { dts[dtI] = dt; dtI = (dtI + 1) % FPS_N; if (dtN < FPS_N) dtN++; adaptTick(dt); }
    if (Math.abs(dt - STEP) < 3) dt = STEP;
    acc += Math.min(100, dt);
    let n = 0;
    while (acc >= STEP - 0.05 && n < MAX_STEPS) { tick(); acc -= STEP; n++; }
    if (acc >= STEP) { dropped += Math.floor(acc / STEP); acc = 0; }
    else if (acc < 0) acc = 0;
    if (n) render();
  }
  go(Title());
  requestAnimationFrame(frame);

  // 自動確認用の覗き窓（ゲーム進行には使わない）
  // grant / revoke はテスト用：買い切りパックの権利を直接立てる／下ろして保存する（決済は通らない。本番の購入経路ではない）
  N.debug = { get scr() { return scr; }, get btns() { return btns; }, get focus() { return focus; }, get ratio() { return ratio; }, get toast() { return toast ? toast.str : ''; }, get T() { return T; }, on, save, isUnlocked, tick, render, fps: fpsStats, adapt,
    grant: id => Shop.setOwned(id, true), revoke: id => Shop.setOwned(id, false), ownedStages: () => ownedStages().map(st => st.id),
    colorOf, makeSaveCode, readSaveCode, get overlay() { return ovOpen; }, account: Acc };
})();
