// 英語表記の選手名から「おおよそのカタカナ読み」を生成する簡易変換ユーティリティ。
// 発音辞書を持たない簡易な規則ベースの近似であり、正確な発音表記ではなく検索用途に限定する。
// ひらがな⇔カタカナの正規化、ローマ字→カタカナ近似変換、検索時のゆるい一致判定を提供する。

const VOWEL_KANA = { a: 'ア', i: 'イ', u: 'ウ', e: 'エ', o: 'オ' };

// 子音＋母音（five-vowel row）のカタカナ表。英語読みを既定とする。
const ROWS = {
  k: ['カ', 'キ', 'ク', 'ケ', 'コ'],
  g: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],
  s: ['サ', 'シ', 'ス', 'セ', 'ソ'],
  z: ['ザ', 'ジ', 'ズ', 'ゼ', 'ゾ'],
  t: ['タ', 'チ', 'ツ', 'テ', 'ト'],
  d: ['ダ', 'ディ', 'ドゥ', 'デ', 'ド'],
  n: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],
  h: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
  f: ['ファ', 'フィ', 'フ', 'フェ', 'フォ'],
  p: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],
  b: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'],
  m: ['マ', 'ミ', 'ム', 'メ', 'モ'],
  y: ['ヤ', 'イ', 'ユ', 'イェ', 'ヨ'],
  r: ['ラ', 'リ', 'ル', 'レ', 'ロ'],
  l: ['ラ', 'リ', 'ル', 'レ', 'ロ'],
  w: ['ワ', 'ウィ', 'ウ', 'ウェ', 'ウォ'],
  v: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'],
  j: ['ジャ', 'ジ', 'ジュ', 'ジェ', 'ジョ'],
  ch: ['チャ', 'チ', 'チュ', 'チェ', 'チョ'],
  sh: ['シャ', 'シ', 'シュ', 'シェ', 'ショ'],
  th: ['サ', 'シ', 'ス', 'セ', 'ソ'],
  wh: ['ワ', 'ウィ', 'ウ', 'ウェ', 'ウォ'],
};

// スペイン語圏の名前に多いj/gの子音は「ハ行」に近い（例: Jose→ホセ、Jimenez→ヒメネス）。
// 英語読みとは別に、この代替読みも生成して検索時にあわせて判定する。
const SPANISH_ROWS = {
  j: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
};

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
const VOWEL_ORDER = ['a', 'i', 'u', 'e', 'o'];

function rowKana(table, consonant, vowel) {
  const row = table[consonant] || ROWS[consonant];
  if (!row) return '';
  const idx = VOWEL_ORDER.indexOf(vowel);
  return idx >= 0 ? row[idx] : '';
}

// 単語1つをカタカナ近似に変換する。spanishはj/gの読みをハ行寄りにする代替モード。
function transliterateWord(word, spanish) {
  let s = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';

  // 綴りの前処理（複合子音・無声化しやすいパターンを単純化）
  // c は e/i/y の前で s 音、それ以外は k 音（ch はここでは変えない）
  s = s
    .replace(/c(?!h)(?=[eiy])/g, 's')
    .replace(/c(?!h)/g, 'k')
    .replace(/tch/g, 'ch')
    .replace(/dge/g, 'j')
    // MLBの選手名はスペイン語圏の姓が多いため、"qu"「gue」「gui」はスペイン語式（uが無音）を既定にする
    // （例: Quintana→キンタナ、Guerrero→ゲレロ、Guillen→ギレン）
    .replace(/qu/g, 'k')
    .replace(/gue/g, 'ge')
    .replace(/gui/g, 'gi')
    .replace(/ph/g, 'f')
    .replace(/gh/g, 'g')
    .replace(/x/g, 'kus')
    // 長母音になりやすい二重母音字を近似
    .replace(/ee|ea/g, 'i')
    .replace(/oo/g, 'u')
    // 語末が a/e/i + z の場合は無声化してs音で表記される慣例が強い（例: Ramirez→ラミレス、Diaz→ディアス）。
    // u/oの後のzは有声のまま（例: Cruz→クルーズ）。
    .replace(/([aei])z$/, '$1s');

  // 語末の "yCe" は "iCe"（マジックE）と同様に扱う
  s = s.replace(/y(?=[bcdfgklmnprstvz]e$)/, 'i');
  // マジックE（母音+子音+e の語末パターン）を長母音・二重母音として展開し、eを落とす
  s = s.replace(/([aiueo])([bcdfgklmnprstvz])e$/, (m, v, c) => {
    const map = { a: 'ei', i: 'ai', e: 'ii', o: 'ou', u: 'uu' };
    return (map[v] || v) + c;
  });

  const table = spanish ? { ...ROWS, ...SPANISH_ROWS } : ROWS;
  const n = s.length;
  let i = 0;
  const out = [];

  while (i < n) {
    const c = s[i];

    if (VOWELS.has(c)) {
      out.push(VOWEL_KANA[c]);
      i += 1;
      continue;
    }

    if (c === 'y') {
      const next = s[i + 1];
      if (next && VOWELS.has(next) && next !== 'i') {
        out.push(rowKana(table, 'y', next));
        i += 2;
      } else {
        out.push('イ');
        i += 1;
      }
      continue;
    }

    if (c === 'n' && !(s[i + 1] && VOWELS.has(s[i + 1]))) {
      out.push('ン');
      i += 1;
      continue;
    }

    // 2文字の子音クラスタ（ch/sh/th/wh）。文字列末尾で1文字しか残っていない場合、
    // その1文字がたまたま単一子音のキー（'t'など）と一致してしまうのを避けるため長さも確認する。
    const two = s.slice(i, i + 2);
    if (two.length === 2 && ROWS[two]) {
      const next = s[i + 2];
      if (next && VOWELS.has(next)) {
        out.push(rowKana(table, two, next));
        i += 3;
      } else {
        out.push(rowKana(table, two, 'u'));
        i += 2;
      }
      continue;
    }

    // r/l/m/y/w のような継続音の重複（guerrero の rr など）は促音化せず、
    // 1文字分としてそのまま畳み込む（借用語表記の慣例に合わせる）
    if (s[i + 1] === c && ['r', 'l', 'm', 'y', 'w'].includes(c)) {
      i += 1;
      continue;
    }

    // 同じ子音の連続（促音・二重子音）
    if (s[i + 1] === c && c !== 'n') {
      out.push('ッ');
      i += 1;
      continue;
    }

    // 母音を伴わない語末の "ts" は「ツ」1音にまとまる（例: Betts→ベッツ）
    if (c === 't' && s[i + 1] === 's' && i + 2 === n) {
      out.push(rowKana(table, 't', 'u'));
      i += 2;
      continue;
    }

    const next = s[i + 1];
    if (next && VOWELS.has(next)) {
      out.push(rowKana(table, c, next));
      i += 2;
    } else {
      // 母音を伴わない子音（語末や子音クラスタの一部）は近似の母音を補う
      const filler = c === 't' || c === 'd' ? 'o' : 'u';
      out.push(rowKana(table, c, filler));
      i += 1;
    }
  }

  return out.join('');
}

// 英語表記のフルネームから、検索用のカタカナ近似候補を生成する。
// full: 名前全体をつなげた候補（連続一致=containsの判定にのみ使う。誤検出を避けるため）
// words: 単語（名・姓など）ごとの候補（ゆるい一致=部分列判定にも使ってよい。文字列が短く誤検出が少ない）
export function toApproxKatakana(fullName) {
  const words = (fullName || '').split(/[\s.'-]+/).filter(Boolean);
  if (!words.length) return { full: [], words: [] };

  const english = words.map((w) => transliterateWord(w, false));
  const spanish = words.map((w) => transliterateWord(w, true));

  const full = new Set([english.join(''), english.join('・')]);
  if (spanish.join('') !== english.join('')) {
    full.add(spanish.join(''));
    full.add(spanish.join('・'));
  }

  const perWord = [...new Set([...english, ...spanish])].filter(Boolean);

  return { full: [...full].filter(Boolean), words: perWord };
}

// カタカナ近似候補（toApproxKatakanaの戻り値）と、正規化済みの検索クエリを突き合わせる。
// 短いクエリでの偶発的な一致（誤検出）を避けるため、連続した文字列としての一致のみを採用する
// （部分列一致は長めの単語だと無関係な名前にも偶然マッチしやすく、誤検出の方が実害が大きいため不採用）。
export function kanaMatches(looseQuery, approx) {
  if (!looseQuery || !approx) return false;
  if (approx.full.some((c) => loosenKana(c).includes(looseQuery))) return true;
  return approx.words.some((w) => loosenKana(w).includes(looseQuery));
}

// ひらがな→カタカナ正規化（ひらがな入力でも検索できるようにする）
export function toKatakana(str) {
  return (str || '').replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

// 入力にひらがな・カタカナが含まれるかどうか
export function containsKana(str) {
  return /[぀-ヿ]/.test(str || '');
}

// ゆるい一致判定用に、長音符（伸ばす位置がずれやすい）を取り除いて正規化する。
// 促音（ッ）は語の識別に重要な情報（例: Witt と Whitlock の違い）のため取り除かない。
export function loosenKana(str) {
  return toKatakana(str || '').replace(/ー/g, '');
}

const katakanaCache = new Map();

// 選手IDごとにカタカナ近似候補をメモ化して返す（同じ選手について毎回再計算しない）
export function getApproxKatakanaCached(personId, fullName) {
  if (katakanaCache.has(personId)) return katakanaCache.get(personId);
  const result = toApproxKatakana(fullName);
  katakanaCache.set(personId, result);
  return result;
}
