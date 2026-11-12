// NEO JAPAN CLASH — キャラクターデータ（ブラウザ / node 共用）
(function (root) {
  'use strict';
  // 弱攻撃 / 強攻撃のフレームデータ生成
  const L = (rng, dmg, su, ac, rc) => ({ su: su || 5, ac: ac || 3, rc: rc || 9, dmg: dmg || 5, rng, hs: 15, kb: 4 });
  // 強は溜め（発生前）を弱より長く取る：BRIEF4 で各キャラ +2 フレーム
  const H = (rng, dmg, su, ac, rc) => ({ su: (su || 11) + 2, ac: ac || 4, rc: rc || 18, dmg: dmg || 11, rng, hs: 23, kb: 8, heavy: 1 });

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
  // ---- BRIEF6: コマンドコンボ（鉄拳式）。キャラごとに初級3つ（R/L/S）＋ BRIEF8 の上級2つ（X/J。各キャラ2行目）。seq は「ボタンを押した瞬間に保持していた方向 + ボタン」の列 ----
  // 方向は相手基準：n=なし d=下 f=相手方向 b=逆方向。ボタン：A=弱（○） H=強（×）。type は下の CMD_TYPES の型
  const CMDS = {
    zanrai: [['fA fA', '雷鳴二連斬', 'R'], ['dH fH', '紫電崩し', 'L'], ['nA nH nA', '天雷三段', 'S'],
      ['fA nA dH nH nA', '雷神連続斬', 'X'], ['dH fA nA fH', '天覇雷獄', 'J']],
    mikoto: [['nA nA nH', '神楽連舞', 'R'], ['dA fH', '破魔旋風', 'L'], ['fH dH', '鈴祓い', 'S'],
      ['nA fA dA nH nA', '神楽・千本桜', 'X'], ['dA nH nA nH', '天祓い旋回', 'J']],
    kagemaru: [['bA fA', '影縫い', 'R'], ['dH dH', '朧打ち上げ', 'L'], ['nA fH nA', '残影三手', 'S'],
      ['bA nA fA dH nH', '影縫い・獄', 'X'], ['dH nH fA fH nA', '朧月落とし', 'J']],
    gounen: [['fH fH', '金剛連打', 'R'], ['dH nH', '羅漢打ち上げ', 'L'], ['nH nA nH', '破戒の一撃', 'S'],
      ['fH nA nH dH fH', '金剛破砕連拳', 'X'], ['dH dH fA nH', '羅漢天昇脚', 'J']],
    konko: [['nA fA nA', 'きらめきステップ', 'R'], ['dA nH', 'スターダストスピン', 'L'], ['fA dH', 'アンコールフィーバー', 'S'],
      ['fA nA nA dH fH', 'きらめきフィーバーラッシュ', 'X'], ['dA dH fA nH', 'スターダストドリーム', 'J']],
    raidenzan: [['fH fA', '雷張り手', 'R'], ['dH dH', '大地持ち上げ', 'L'], ['nH nH nA', '四股踏み崩し', 'S'],
      ['fH dH nA nH fH', '雷鳴四股連撃', 'X'], ['dH nH fH nA nH', '大地天昇', 'J']],
    shuki: [['fA nH', '鬼連牙', 'R'], ['bH dH', '天魔打ち', 'L'], ['nA nA dH', '羅刹滅砕', 'S'],
      ['fA dH nA dH nH', '羅刹獄連牙', 'X'], ['bH nH dA nH', '天魔轟落', 'J']],
    shion: [['fA fH', '紫電の連なり', 'R'], ['dA fH', '月下打ち上げ', 'L'], ['nA nH fH', '終わりの太刀', 'S'],
      ['fA nA fH dA nH', '紫電・終わりなき連なり', 'X'], ['dA nH fA nH', '月下天斬', 'J']],
    ougi: [['nA fA nH', '花吹雪', 'R'], ['dH fA', '舞い上がり', 'L'], ['fH nA nH', '千年桜', 'S'],
      ['nA nA fH dH nA', '千年桜乱舞', 'X'], ['dH nA nA nH', '舞扇天昇', 'J']],
    nishiki: [['fA fA fA', '高速三連打', 'R'], ['dH dH', 'ブーストアッパー', 'L'], ['nA nH nH', 'オーバードライブ', 'S'],
      ['fA fA nA nH fH', 'オーバードライブ連打改', 'X'], ['dH nH fA nH', 'ブーストジャグリング', 'J']],
    kurotengu: [['bA bA', '烏羽連撃', 'R'], ['dA fH', '天狗跳ね', 'L'], ['fH dA nH', '神風崩し', 'S'],
      ['bA fA nA dH nH', '神風獄連撃', 'X'], ['dA nH nA fH', '天狗天落', 'J']],
    ryujin: [['fH nA nH', '龍連爪', 'R'], ['dH fH', '昇龍撃', 'L'], ['nH dH nA', 'Ωフィニッシュ', 'S'],
      ['fH nA fH nH dH', '龍神滅爪連撃', 'X'], ['dH nH nA nH', 'Ωライジング', 'J']],
    mumei: [['nA nA nA', '無銘三連', 'R'], ['bH fH', '居合い崩し', 'L'], ['dA nH nA', '名無しの終わり', 'S'],
      ['nA nA dA nH dA', '名無しの連なり・終', 'X'], ['bH dH fA nH', '無銘天落', 'J']],
    kaguya: [['fA nA fH', '月読プログラム', 'R'], ['dA dH', 'グラビティリフト', 'L'], ['nA fH nH', '.exeクラッシュ', 'S'],
      ['fA nA nH dH nH', '.exeフルクラッシュ', 'X'], ['dA nH fA nH', 'ルナティックジャグル', 'J']],
  };
  // 型ごとの段データ。f=その段のダメージ（強 h に対する割合。コンボ補正ぶんは sim が打ち消す） v=見た目（1文字目 l/h=攻撃絵/強攻撃絵、2文字目=変種 c しゃがみ / f 前傾 / b 後傾 / 2 小振り / x 閃光）
  // su=発生（1段目は sim が強の発生から 11〜14f に収める） step=発生前から前進し続ける adv=打つ瞬間の踏み込み low=下段の高さ launch=打ち上げ初速 kb=ノックバック倍率 stopx=ヒットストップ追加
  const CMD_TYPES = {
    R: { label: 'ラッシュ', st: [{ f: 0.5, v: 'lf', step: 1 }, { f: 0.5, v: 'l2', su: 7, step: 1 }, { f: 0.8, v: 'hf', su: 8, step: 1 }] },
    L: { label: 'ランチャー', st: [{ f: 0.6, v: 'lc', adv: 4 }, { f: 1.0, v: 'hb', su: 9, adv: 4, launch: 10 }] },
    S: { label: 'フィニッシュ', st: [{ f: 0.5, v: 'lc', adv: 4, low: 1 }, { f: 0.6, v: 'lf', su: 7, adv: 4 }, { f: 1.1, v: 'hx', su: 10, adv: 4, kb: 2, stopx: 4 }] },
    // ---- BRIEF8: 上級（adv: 1）。rcx = 最終段の硬直の上乗せ（強 +16f。初級は +10f） kbi = 途中段のノックバック（既定 3）
    // X ロングストリング：地上5段。中段・下段を交互に混ぜ、最終段は大きく吹き飛ばす。配分の合計 3.2
    X: { label: 'ロングストリング', adv: 1, rcx: 16, st: [{ f: 0.5, v: 'lf', step: 1 }, { f: 0.5, v: 'lc', su: 7, adv: 4, low: 1 }, { f: 0.55, v: 'l2', su: 7, step: 1 },
      { f: 0.65, v: 'hc', su: 8, adv: 4, low: 1 }, { f: 1.0, v: 'hx', su: 10, adv: 4, kb: 2.2, stopx: 4 }] },
    // J ジャグル：打ち上げ → 空中2段 → 叩き落とし。hi = 当たり判定を高く・広く（空中の相手に届く） pop = 空中の相手を浮かせ直す初速 spike = 空中の相手を叩き落とす下向きの速さ。配分の合計 3.0
    J: { label: 'ジャグル', adv: 1, rcx: 16, st: [{ f: 0.6, v: 'hb', adv: 4, launch: 11, kbi: 2 }, { f: 0.6, v: 'lu', su: 6, adv: 3, hi: 1, pop: 5, kbi: 1.2 },
      { f: 0.7, v: 'hu', su: 6, adv: 3, hi: 1, pop: 5, kbi: 1.2 }, { f: 1.1, v: 'hx', su: 8, adv: 3, hi: 1, spike: 13, kb: 1.4, stopx: 3 }] },
  };
  const ARROW = { n: '', d: '↓', f: '→', b: '←' }, BTN = { A: '○', H: '×' };
  // 技表の表記（相手が右にいるときの向き。弱=○ / 強=×）
  const cmdText = seq => seq.map(s => ARROW[s[0]] + BTN[s[1]]).join(' ');
  CHARS.forEach(c => { c.cmds = CMDS[c.id].map(([q, name, type]) => { const seq = q.split(' '); return { name, type, seq, key: seq.join(''), text: cmdText(seq), adv: CMD_TYPES[type].adv ? 1 : 0 }; }); });
  const INITIAL = 10; // 0..9 が初期キャラ
  // ステータス表示用（1〜5）
  function stats(c) {
    const r = (v, lo, hi) => Math.max(1, Math.min(5, Math.round(1 + 4 * (v - lo) / (hi - lo))));
    return { hp: r(c.hp, 80, 140), spd: r(c.spd, 2.8, 5.6), pow: r(c.pow, 0.85, 1.3) };
  }
  // ---- BRIEF9: ステージ（見た目だけ。対戦ロジックには関わらない）。pack = 必要な買い切りパックの商品 id（null は最初から使える） ----
  const STAGES = [
    { id: 'neon', name: 'ネオン神社', file: 'stage.webp', pack: null },
    { id: 'bamboo', name: '竹林の決闘場', file: 'stage_bamboo.webp', pack: 'njc_stages_1' },
    { id: 'snow', name: '雪の城下町', file: 'stage_snow.webp', pack: 'njc_stages_1' },
    { id: 'sky', name: '空のアリーナ', file: 'stage_sky.webp', pack: 'njc_stages_1' },
  ];
  const api = { CHARS, INITIAL, stats, CMD_TYPES, cmdText, STAGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NJC = Object.assign(root.NJC || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
