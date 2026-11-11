// NEO JAPAN CLASH — キャラクターデータ（ブラウザ / node 共用）
(function (root) {
  'use strict';
  // 弱攻撃 / 強攻撃のフレームデータ生成
  const L = (rng, dmg, su, ac, rc) => ({ su: su || 5, ac: ac || 3, rc: rc || 9, dmg: dmg || 5, rng, hs: 15, kb: 4 });
  const H = (rng, dmg, su, ac, rc) => ({ su: su || 11, ac: ac || 4, rc: rc || 18, dmg: dmg || 11, rng, hs: 23, kb: 8, heavy: 1 });

  // col: m=メイン a=サブ(暗) g=発光 s=肌   b: 体格・シルエット指定
  const CHARS = [
    { id: 'zanrai', name: '斬雷', en: 'ZANRAI', title: 'サイバー侍', type: '刀・バランス',
      hp: 100, spd: 4.2, pow: 1.0,
      col: { m: '#c8102e', a: '#1a1c2c', g: '#49d0ff', s: '#2a2d40' },
      b: { sc: 1.0, limb: 9, tw: 22, head: 'kabuto', weapon: 'katana', robe: 'hakama', pads: 1 },
      l: L(78, 5), h: H(102, 12),
      sp: { name: '雷閃・一文字', type: 'lunge', su: 10, ac: 8, rc: 22, dmg: 22, rng: 112, adv: 13, hs: 28, kb: 12, heavy: 1 } },

    { id: 'mikoto', name: 'ミコト', en: 'MIKOTO', title: '巫女ハッカー', type: '飛び道具',
      hp: 85, spd: 4.0, pow: 0.9,
      col: { m: '#f4f1f7', a: '#d81e4a', g: '#ff7ad9', s: '#ffe1d0' },
      b: { sc: 0.94, limb: 7, tw: 18, head: 'longhair', weapon: 'gohei', robe: 'skirt', sleeves: 1, hair: '#ff9ccf' },
      l: L(58, 4), h: H(80, 10),
      sp: { name: 'ホロ札・三連', type: 'proj', su: 12, ac: 2, rc: 22, dmg: 0, rng: 0,
        proj: { n: 3, dmg: 7, vx: 9, spread: 1.3, w: 26, h: 18, life: 80, k: 'ofuda', hs: 16, kb: 4 } } },

    { id: 'kagemaru', name: '影丸', en: 'KAGEMARU', title: '電脳忍者', type: '高速・背後取り',
      hp: 80, spd: 5.6, pow: 0.85,
      col: { m: '#12161c', a: '#0c3a2e', g: '#3dff9a', s: '#12161c' },
      b: { sc: 0.95, limb: 7, tw: 17, head: 'hood', weapon: 'kunai', robe: 'none', scarf: 1 },
      l: L(56, 4, 3, 3, 7), h: H(74, 9, 8, 4, 14),
      sp: { name: '電影・瞬身斬', type: 'warp', su: 12, ac: 5, rc: 16, dmg: 18, rng: 88, hs: 24, kb: 9, heavy: 1 } },

    { id: 'gounen', name: '剛念', en: 'GOUNEN', title: 'ロボット僧', type: '重い一撃',
      hp: 125, spd: 3.0, pow: 1.25,
      col: { m: '#e8621a', a: '#7a1d10', g: '#ffc23d', s: '#b9432a' },
      b: { sc: 1.12, wd: 1.25, limb: 13, tw: 32, head: 'monkhood', weapon: 'fist', robe: 'kimono', beads: 1 },
      l: L(66, 6, 7, 3, 11), h: H(92, 14, 15, 5, 22),
      sp: { name: '鉄掌・大震', type: 'quake', su: 18, ac: 4, rc: 24, dmg: 10, rng: 78, hs: 22, kb: 8, heavy: 1,
        proj: { n: 1, dmg: 16, vx: 7, w: 54, h: 44, life: 45, k: 'quake', ground: 1, la: 9, hs: 24, kb: 6, hv: 1 } } },

    { id: 'konko', name: 'コンコ', en: 'KONKO', title: '狐アイドル', type: 'トリッキー',
      hp: 88, spd: 4.8, pow: 0.9,
      col: { m: '#ff4f8b', a: '#ffd23d', g: '#ff9df0', s: '#ffe4d6' },
      b: { sc: 0.9, limb: 7, tw: 17, head: 'fox', weapon: 'mic', robe: 'skirt', tail: 1, hair: '#ffb3d9' },
      l: L(54, 4, 4, 3, 8), h: H(82, 10, 10, 4, 16),
      sp: { name: 'ラブ・狐火バウンド', type: 'proj', su: 10, ac: 2, rc: 20, dmg: 0, rng: 0,
        proj: { n: 2, dmg: 10, vx: 5.5, dvx: 2.5, vy0: -6, g: 0.45, bn: 1, w: 28, h: 28, life: 120, k: 'heart', hs: 18, kb: 5 } } },

    { id: 'raidenzan', name: '雷電山', en: 'RAIDENZAN', title: 'メカ力士', type: '投げ・耐久',
      hp: 140, spd: 2.8, pow: 1.15,
      col: { m: '#d9dde6', a: '#1b3a8a', g: '#5ad1ff', s: '#aab3c6' },
      b: { sc: 1.15, wd: 1.5, limb: 15, tw: 44, head: 'mage', weapon: 'palm', robe: 'mawashi' },
      l: L(62, 6, 6, 3, 10), h: H(84, 13, 13, 5, 20),
      sp: { name: '電脳・大雷投げ', type: 'grab', su: 7, ac: 4, rc: 26, dmg: 28, rng: 80, unblock: 1, launch: 12, hs: 40, kb: 10, heavy: 1 } },

    { id: 'shuki', name: '朱鬼', en: 'SHUKI', title: '金棒の鬼', type: 'パワー・リーチ',
      hp: 115, spd: 3.4, pow: 1.3,
      col: { m: '#d92b2b', a: '#2b1a12', g: '#ffb300', s: '#d92b2b' },
      b: { sc: 1.1, wd: 1.15, limb: 12, tw: 28, head: 'oni', weapon: 'club', robe: 'loin' },
      l: L(84, 6, 8, 3, 12), h: H(116, 15, 16, 5, 24),
      sp: { name: '金棒・鬼旋風', type: 'lunge', su: 12, ac: 24, rc: 20, dmg: 7, hits: 4, gap: 6, rng: 106, adv: 4.5, hs: 20, kb: 5, spin: 1 } },

    { id: 'shion', name: '紫苑', en: 'SHION', title: '機甲女武者', type: '薙刀・対空',
      hp: 95, spd: 4.5, pow: 1.0,
      col: { m: '#7b3fe4', a: '#1d1533', g: '#d58bff', s: '#f3dccb' },
      b: { sc: 0.98, limb: 8, tw: 19, head: 'ponytail', weapon: 'naginata', robe: 'skirt', pads: 1, hair: '#2b1d4d' },
      l: L(82, 5), h: H(108, 11, 12, 4, 19),
      sp: { name: '月輪・昇り薙ぎ', type: 'upper', su: 6, ac: 10, rc: 24, dmg: 20, rng: 92, y1: 160, launch: 11, jump: -12, hs: 30, kb: 5, heavy: 1 } },

    { id: 'ougi', name: '扇姫', en: 'OUGI', title: 'ホロ舞姫', type: '扇・設置',
      hp: 90, spd: 4.4, pow: 0.95,
      col: { m: '#4fc3f7', a: '#f2a93b', g: '#9cf3ff', s: '#fbe6da' },
      b: { sc: 0.96, limb: 7, tw: 18, head: 'geisha', weapon: 'fan', robe: 'kimono', sleeves: 1, hair: '#1a1730' },
      l: L(60, 5, 4, 3, 9), h: H(86, 10),
      sp: { name: '風刃・花嵐', type: 'proj', su: 14, ac: 2, rc: 20, dmg: 0, rng: 0,
        proj: { n: 1, dmg: 17, vx: 5.5, w: 44, h: 92, life: 120, k: 'wind', hs: 22, kb: 7, hv: 1 } } },

    { id: 'nishiki', name: '弐式', en: 'NISHIKI', title: '機巧兵', type: '砲撃',
      hp: 110, spd: 3.6, pow: 1.1,
      col: { m: '#6f8f4e', a: '#26331f', g: '#ff4d6d', s: '#4d6636' },
      b: { sc: 1.08, wd: 1.1, limb: 11, tw: 26, head: 'mech', weapon: 'cannon', robe: 'none', pads: 1 },
      l: L(64, 5, 6, 3, 10), h: H(86, 12, 13, 4, 20),
      sp: { name: '曼荼羅・照射砲', type: 'beam', su: 20, ac: 16, rc: 22, dmg: 7, hits: 3, gap: 5, rng: 800, y1: 88, y0: 50, hs: 18, kb: 6 } },

    // ---- 解放キャラ ----
    { id: 'kurotengu', name: '黒天狗', en: 'KUROTENGU', title: '電翼の天狗', type: '空中強襲',
      hp: 95, spd: 5.0, pow: 1.05, lock: 'アーケードを誰かでクリア',
      col: { m: '#23232e', a: '#b3122a', g: '#ffd447', s: '#b3122a' },
      b: { sc: 1.0, limb: 8, tw: 20, head: 'tengu', weapon: 'staff', robe: 'hakama', wings: 1 },
      l: L(70, 5), h: H(98, 11),
      sp: { name: '天狗・流星脚', type: 'dive', su: 16, ac: 40, rc: 16, dmg: 20, rng: 62, hs: 26, kb: 10, heavy: 1 } },

    { id: 'ryujin', name: '龍神Ω', en: 'RYUJIN-OMEGA', title: '電脳龍神', type: 'ボス級・咆哮',
      hp: 120, spd: 3.8, pow: 1.2, lock: 'アーケードをノーコンティニューでクリア',
      col: { m: '#0f8f86', a: '#0a2a33', g: '#ffe066', s: '#0f8f86' },
      b: { sc: 1.14, wd: 1.2, limb: 12, tw: 28, head: 'dragon', weapon: 'claw', robe: 'none', tail: 2, pads: 1 },
      l: L(70, 6, 6, 3, 10), h: H(96, 13, 12, 5, 20),
      sp: { name: '龍神・電磁咆哮', type: 'proj', su: 16, ac: 2, rc: 24, dmg: 0, rng: 0,
        proj: { n: 1, dmg: 24, vx: 8.5, w: 72, h: 52, life: 100, k: 'dragon', la: 8, hs: 26, kb: 8, hv: 1 } } },

    { id: 'mumei', name: '無銘', en: 'MUMEI', title: '影の剣客', type: '高速連斬',
      hp: 90, spd: 5.0, pow: 1.15, lock: 'サイバー侍（斬雷）でアーケードをクリア',
      col: { m: '#e9e6df', a: '#15131a', g: '#ff2d55', s: '#15131a' },
      b: { sc: 1.02, limb: 8, tw: 20, head: 'kasa', weapon: 'nodachi', robe: 'kimono', scarf: 1 },
      l: L(82, 5, 4, 3, 8), h: H(108, 12, 10, 4, 17),
      sp: { name: '無銘・三段影斬', type: 'lunge', su: 8, ac: 15, rc: 20, dmg: 8, hits: 3, gap: 5, rng: 116, adv: 9, hs: 20, kb: 4, heavy: 1 } },

    { id: 'kaguya', name: 'カグヤ.exe', en: 'KAGUYA.EXE', title: '月のホログラム姫', type: '衛星弾幕',
      hp: 85, spd: 4.6, pow: 1.0, lock: 'オンライン対戦で1勝する',
      col: { m: '#dfe9ff', a: '#3b4fa8', g: '#a8c8ff', s: '#eef3ff' },
      b: { sc: 0.97, limb: 7, tw: 18, head: 'crown', weapon: 'orb', robe: 'kimono', sleeves: 1, hair: '#8fa8ff', holo: 1 },
      l: L(58, 4, 4, 3, 8), h: H(82, 10),
      sp: { name: '月詠・ホロ衛星', type: 'proj', su: 12, ac: 2, rc: 20, dmg: 0, rng: 0,
        proj: { n: 3, dmg: 8, vx: 6, dvx: 2, w: 24, h: 24, life: 110, k: 'orb', wv: 1, hs: 16, kb: 4 } } },
  ];
  CHARS.forEach((c, i) => { c.i = i; c.sp.sp = 1; c.b.wd = c.b.wd || 1; });
  const INITIAL = 10; // 0..9 が初期キャラ
  // ステータス表示用（1〜5）
  function stats(c) {
    const r = (v, lo, hi) => Math.max(1, Math.min(5, Math.round(1 + 4 * (v - lo) / (hi - lo))));
    return { hp: r(c.hp, 80, 140), spd: r(c.spd, 2.8, 5.6), pow: r(c.pow, 0.85, 1.3) };
  }
  const api = { CHARS, INITIAL, stats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NJC = Object.assign(root.NJC || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
