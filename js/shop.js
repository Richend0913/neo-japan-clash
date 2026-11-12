// NEO JAPAN CLASH — 買い切りパックの購入ブリッジ（BRIEF9）
// ゲーム側が知っているのは「商品一覧」と「権利（エンタイトルメント）を持っているか」だけ。実際の決済はここでは行わない。
// iOS アプリ版が後から window.NJCPurchaseHandler を差し込むと、purchase / restore がそこへ委譲される（RevenueCat / StoreKit を想定）。
//
//   window.NJCPurchaseHandler = {
//     purchase(productId, product) -> Promise<{ status: 'purchased' | 'cancelled' | 'pending' | 'error', message? }>,
//     restore()                    -> Promise<{ status: 'restored', owned: [productId, ...] } | { status: 'error', message? }>,
//   };
//
// ハンドラが無い環境（Web 版）では purchase / restore は { status: 'app_only' } を返すだけで、権利は一切立てない。
// 「購入できたことにする」ダミーの経路は置かない。権利が立つのは、ハンドラが 'purchased' / 'restored' を返したときと、
// テスト用の NJC.debug.grant() だけ。
(function (root) {
  'use strict';
  const PRODUCTS = [
    { id: 'njc_unlock_all', ent: 'unlockall', name: '全キャラ解放パック', price: '¥980',
      desc: ['隠しキャラ4人をすぐに使えます', '黒天狗・龍神Ω・無銘・カグヤ.exe', '（クリア条件での解放もそのまま残ります）'] },
    { id: 'njc_stages_1', ent: 'stages1', name: '追加ステージパック第1弾', price: '¥480',
      desc: ['新しいステージ3種を追加', '竹林の決闘場・雪の城下町・空のアリーナ', '（フリーバトルで選択／アーケードはランダム）'] },
  ];
  const product = id => PRODUCTS.find(p => p.id === id) || null;
  const SAVE_KEY = 'njc_save_v1';
  // 権利の置き場所。ゲーム本体（main.js）が起動時に bind() でセーブデータを渡す。それまでは localStorage を直接読む（読み取りのみ）。
  let store = null;
  const listeners = [];
  function readEnt(key) {
    if (store) return !!store.get(key);
    try { const s = JSON.parse(root.localStorage.getItem(SAVE_KEY) || '{}'); return !!(s && s.ent && s.ent[key]); } catch (e) { return false; }
  }
  function owned(id) { const p = product(id); return !!p && readEnt(p.ent); }
  // 権利を立てる／下ろす（永続化まで行う）。呼ぶのは「決済ハンドラが成功を返したとき」と debug.grant / revoke だけ。
  function setOwned(id, on) {
    const p = product(id);
    if (!p || !store) return false;
    store.set(p.ent, on ? 1 : 0);
    for (const fn of listeners) { try { fn(id, !!on); } catch (e) { /* 画面側の都合で購入結果を壊さない */ } }
    return true;
  }
  const handler = () => { const h = root.NJCPurchaseHandler; return h && typeof h === 'object' ? h : null; };
  const available = () => { const h = handler(); return !!(h && typeof h.purchase === 'function'); };

  function purchase(id) {
    const p = product(id);
    if (!p) return Promise.resolve({ status: 'error', message: 'unknown product: ' + id });
    if (owned(id)) return Promise.resolve({ status: 'owned' });
    if (!available()) return Promise.resolve({ status: 'app_only' }); // Web 版：決済手段が無い。何も立てない
    return Promise.resolve().then(() => handler().purchase(id, p)).then(r => {
      const status = r && r.status;
      if (status === 'purchased') { if (!setOwned(id, true)) return { status: 'error', message: 'save unavailable' }; return { status: 'purchased' }; }
      if (status === 'cancelled' || status === 'pending') return { status };
      return { status: 'error', message: (r && r.message) || '' };
    }, e => ({ status: 'error', message: (e && e.message) || String(e) }));
  }
  function restore() {
    const h = handler();
    if (!h || typeof h.restore !== 'function') return Promise.resolve({ status: 'app_only' });
    return Promise.resolve().then(() => h.restore()).then(r => {
      if (!r || r.status !== 'restored' || !Array.isArray(r.owned)) return { status: 'error', message: (r && r.message) || '' };
      const got = r.owned.filter(id => product(id));
      for (const id of got) if (!owned(id)) setOwned(id, true);
      return { status: 'restored', owned: got };
    }, e => ({ status: 'error', message: (e && e.message) || String(e) }));
  }

  root.NJCShop = {
    PRODUCTS, product, owned, purchase, restore, available,
    bind(s) { store = s; }, setOwned, onChange(fn) { listeners.push(fn); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
