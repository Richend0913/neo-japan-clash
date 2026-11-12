// NEO JAPAN CLASH — アカウント＋クラウドセーブ同期（BRIEF11）
// サーバーは Cloudflare Worker「njc-account」。ゲーム側が知っているのは、
//   ・サインイン橋 window.NJCAppleAuth.signIn() -> Promise<{ identityToken }>（アプリ版だけが持つ。Web 版には無い）
//   ・POST /auth/apple {identityToken} -> {session, sub} ／ GET・PUT /save ／ DELETE /account
// だけ。セッションはセーブ本体とは別の localStorage キー（njc_session_v1）に置く。
//
// 同期の決まり（main.js が bind() で渡す store を通してセーブに触る）：
//   ・サインイン直後（と、セッションを持ったままの起動時）に GET。
//   ・サーバーの updatedAt がローカルの savedAt より新しければサーバー側を採用（pid もサーバー側になる）。
//     そうでなければローカルを残す。どちらの場合も ent（買い切りパックの権利）は OR でまとめ、買った権利を失わない。
//   ・サインイン中はセーブのたびに 2 秒まとめて PUT（baseRev つき）。409 なら GET し直して同じ決まりでまとめ、1回だけ再送。
//   ・サインアウトはセッションを捨てるだけ（端末のセーブは残る）。アカウント削除は DELETE /account のあとセッションを捨てる。
(function (root) {
  'use strict';
  const SESSION_KEY = 'njc_session_v1';
  const DEFAULT_ENDPOINT = 'https://njc-account.burningbros.workers.dev';
  const DEBOUNCE_MS = 2000, TIMEOUT_MS = 15000;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  let endpoint = DEFAULT_ENDPOINT, debounceMs = DEBOUNCE_MS;
  let store = null;            // { snapshot(), savedAt(), adopt(serverSave, updatedAt) -> entChanged, mergeEnt(serverEnt) -> changed }
  let sess = null;             // { session, sub, rev }
  let status = 'idle';         // idle | syncing | synced | error
  let lastError = '', lastSyncAt = 0;
  let timer = null, dirty = false, busy = false, deleting = false, gen = 0;
  const listeners = [];
  const stats = { gets: 0, puts: 0, conflicts: 0, adopted: 0 };   // 自動確認用

  // ---- セッションの保存（セーブ本体とは別キー） ----
  function loadSession() {
    try {
      const o = JSON.parse(root.localStorage.getItem(SESSION_KEY) || 'null');
      if (isObj(o) && typeof o.session === 'string' && o.session && typeof o.sub === 'string') return { session: o.session, sub: o.sub, rev: Number.isInteger(o.rev) && o.rev >= 0 ? o.rev : 0 };
    } catch (e) { /* 壊れていたら未サインイン扱い */ }
    return null;
  }
  function storeSession() {
    try { if (sess) root.localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); else root.localStorage.removeItem(SESSION_KEY); } catch (e) { /* 保存できない環境では、このページを開いている間だけ有効 */ }
  }
  function emit() { for (const fn of listeners.slice()) { try { fn(state()); } catch (e) { /* 画面側の失敗で同期を止めない */ } } }
  function setStatus(s, err) { status = s; lastError = err || ''; if (s === 'synced') lastSyncAt = Date.now(); emit(); }
  function dropSession() {
    gen++; sess = null; storeSession();
    if (timer) { clearTimeout(timer); timer = null; }
    dirty = false; status = 'idle'; lastError = '';
  }

  // ---- 通信 ----
  // 戻り値 { status, body }。通信そのものの失敗は { status: 0 }。
  async function api(method, path, body, token) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const to = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await root.fetch(endpoint + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
      let j = null; try { j = await res.json(); } catch (e) { /* 本文なし */ }
      return { status: res.status, body: j };
    } catch (e) { return { status: 0, body: null }; }
    finally { if (to) clearTimeout(to); }
  }
  // セッションつきの呼び出し。401 はセッション切れとして捨てる（端末のセーブはそのまま）
  async function authed(method, path, body) {
    const g = gen, r = await api(method, path, body, sess.session);
    if (g !== gen) return { status: -1, body: null };            // 待っている間にサインアウトした
    if (r.status === 401) { dropSession(); lastError = 'expired'; emit(); return { status: 401, body: null }; }
    return r;
  }

  // ---- 同期 ----
  // サーバーのセーブとして受け入れてよい形か（セーブコードの読み込みと同じ最低限の確認）
  const validSave = s => isObj(s) && typeof s.pid === 'string' && UUID_RE.test(s.pid) && isObj(s.un) && isObj(s.ent);
  // GET の結果をローカルとまとめる。戻り値：サーバーへ送り直す必要があるか
  function reconcile(server) {
    sess.rev = Number.isInteger(server.rev) ? server.rev : 0; storeSession();
    if (!validSave(server.save)) {                                // サーバーに保存なし（または読めない形）→ ローカルを送る
      if (isObj(server.save) && isObj(server.save.ent)) store.mergeEnt(server.save.ent);
      return true;
    }
    const updatedAt = Number(server.updatedAt) || 0;
    if (updatedAt > store.savedAt()) { stats.adopted++; return !!store.adopt(server.save, updatedAt); }   // サーバー採用。ent が増えたときだけ送り直す
    store.mergeEnt(server.save.ent);                              // ローカルを残す（ent は OR）。サーバーへ送る
    return true;
  }
  async function pull() {
    stats.gets++;
    const r = await authed('GET', '/save');
    if (r.status !== 200 || !isObj(r.body)) return { ok: false, status: r.status };
    return { ok: true, push: reconcile(r.body) };
  }
  async function put() {
    stats.puts++;
    const r = await authed('PUT', '/save', { save: store.snapshot(), baseRev: sess.rev });
    if (r.status === 200 && isObj(r.body) && Number.isInteger(r.body.rev)) { sess.rev = r.body.rev; storeSession(); }
    return r.status;
  }
  // 送信（409 のときだけ：取り直し → 同じ決まりでまとめる → 1回だけ再送）
  async function push() {
    let st = await put();
    if (st === 409) {
      stats.conflicts++;
      const p = await pull();
      if (!p.ok) return p.status;
      if (!p.push) return 200;                                    // サーバー側を採用して差分なし
      st = await put();
    }
    return st;
  }
  const failWhy = st => (st === 0 ? 'network' : st === 401 ? 'expired' : st === 413 ? 'too_large' : st === 409 ? 'conflict' : 'server');
  // 1回分の同期。doPull=true なら先に GET（サインイン直後・起動時）
  async function run(doPull) {
    if (!sess || !store) return false;
    if (busy) { dirty = true; return false; }
    busy = true; const g = gen; dirty = false;
    setStatus('syncing');
    let st = 200;
    try {
      let need = true;
      if (doPull) { const p = await pull(); if (!p.ok) st = p.status; else need = p.push; }
      if (st === 200 && need && g === gen) st = await push();
    } catch (e) { st = 0; }
    busy = false;
    if (g !== gen || !sess) return false;                         // 途中でサインアウト／セッション切れ
    if (st === 200) setStatus('synced'); else setStatus('error', failWhy(st));
    if (dirty && st === 200) schedule();                          // 同期中に入った変更を送る
    return st === 200;
  }
  function schedule() {
    if (!sess || !store) return;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; run(false); }, debounceMs);
  }

  // ---- サインイン橋 ----
  // アプリ版（Capacitor）：@capgo/capacitor-social-login があれば NJCAppleAuth をここで用意する。
  // プラグインが無い環境（Web 版）では何もしない＝ NJCAppleAuth は未定義のまま。
  function installCapacitorBridge() {
    if (root.NJCAppleAuth) return;
    const C = root.Capacitor;
    if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return;
    const P = C.Plugins && C.Plugins.SocialLogin;
    if (!P || typeof P.login !== 'function') return;
    let ready = null;
    root.NJCAppleAuth = {
      async signIn() {
        if (!ready) ready = Promise.resolve(P.initialize({ apple: {} })).catch(e => { ready = null; throw e; });
        await ready;
        const r = await P.login({ provider: 'apple', options: { scopes: [] } });
        const t = r && r.result && r.result.idToken;
        if (!t) throw new Error('no identity token');
        return { identityToken: t };
      },
    };
  }
  try { installCapacitorBridge(); } catch (e) { /* 橋が作れなくてもゲームは動く */ }
  const bridge = () => { const b = root.NJCAppleAuth; return b && typeof b.signIn === 'function' ? b : null; };
  // 利用者がシートを閉じただけか（エラー表示にしない）
  const isCancel = e => { const m = String((e && (e.code || e.message)) || e || ''); return /cancel|1001/i.test(m); };

  // ---- 公開 API ----
  function state() { return { available: !!bridge(), signedIn: !!sess, sub: sess ? sess.sub : '', status, error: lastError, lastSyncAt, rev: sess ? sess.rev : 0 }; }

  // 戻り値 { status: 'signed_in' | 'cancelled' | 'unavailable' | 'error', why? }
  async function signIn() {
    const b = bridge();
    if (!b) return { status: 'unavailable' };
    let tok = '';
    try { const r = await b.signIn(); tok = r && r.identityToken; }
    catch (e) { return isCancel(e) ? { status: 'cancelled' } : { status: 'error', why: 'apple' }; }
    if (typeof tok !== 'string' || !tok) return { status: 'error', why: 'apple' };
    const r = await api('POST', '/auth/apple', { identityToken: tok });
    if (r.status !== 200 || !isObj(r.body) || typeof r.body.session !== 'string' || typeof r.body.sub !== 'string') return { status: 'error', why: r.status === 0 ? 'network' : r.status === 401 ? 'rejected' : 'server' };
    gen++; sess = { session: r.body.session, sub: r.body.sub, rev: 0 }; storeSession(); emit();
    const ok = await run(true);                                   // サインイン直後の GET（→必要なら PUT）
    return { status: 'signed_in', synced: ok };
  }
  function signOut() { dropSession(); emit(); }
  // 戻り値 { status: 'deleted' | 'not_signed_in' | 'error', why? }。失敗したときはセッションを残す（やり直せるように）
  async function deleteAccount() {
    if (!sess) return { status: 'not_signed_in' };
    if (deleting) return { status: 'error', why: 'busy' };
    deleting = true;                                              // この間の変更は送信予約しない
    try {
      if (timer) { clearTimeout(timer); timer = null; }
      dirty = false;
      // 送信中の PUT が終わるのを待ってから消す（DELETE のあとに PUT が届いて、消したセーブが復活しないように）
      for (let i = 0; busy && i < 400; i++) await new Promise(r => setTimeout(r, 50));
      if (!sess) return { status: 'deleted_session_expired' };
      const r = await authed('DELETE', '/account');
      if (r.status === 401 || r.status === -1) return { status: 'deleted_session_expired' };
      if (r.status !== 200) return { status: 'error', why: r.status === 0 ? 'network' : 'server' };
      dropSession(); emit();
      return { status: 'deleted' };
    } finally { deleting = false; }
  }

  sess = loadSession();

  root.NJCAccount = {
    SESSION_KEY, DEFAULT_ENDPOINT,
    get endpoint() { return endpoint; },
    // テスト用：同期先とまとめ待ち時間の差し替え（本番コードからは呼ばない）
    configure(o) { if (o && typeof o.endpoint === 'string') endpoint = o.endpoint.replace(/\/+$/, ''); if (o && Number.isFinite(o.debounceMs)) debounceMs = o.debounceMs; },
    // main.js が起動時に呼ぶ。セッションが残っていれば、その場で一度同期する
    bind(s) { store = s; if (sess) run(true); },
    state, stats,
    available: () => !!bridge(),
    signedIn: () => !!sess,
    onChange(fn) { listeners.push(fn); },
    touch() { if (sess && store && !deleting) schedule(); },                   // セーブが変わった（main.js の persist から）
    syncNow: () => run(true),
    signIn, signOut, deleteAccount,
  };
})(typeof window !== 'undefined' ? window : globalThis);
