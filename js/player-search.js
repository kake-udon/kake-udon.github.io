// 選手検索画面：名前検索（英語表記・日本人選手は日本語表記・その他の選手もカタカナ近似で検索可能）
import { getAllPlayers, currentSeasonYear } from './api.js';
import { TEAMS } from './teams.js';
import { getFavorites } from './db.js';
import { openPlayerSheet } from './player-sheet.js';
import { toKatakana, containsKana, loosenKana, kanaMatches, getApproxKatakanaCached } from './kana.js';

const RESULT_LIMIT = 40;

// 日本出身選手は日本語名でも検索できるようにする対応表（MLB Stats APIは英語表記のみのため）
const JP_NAME_ALIASES = {
  660271: ['大谷翔平', 'おおたに'],
  808967: ['山本由伸', 'やまもと'],
  808963: ['佐々木朗希', 'ささき'],
  684007: ['今永昇太', 'いまなが'],
  673540: ['千賀滉大', 'せんが'],
  579328: ['菊池雄星', 'きくち'],
  673548: ['鈴木誠也', 'すずき'],
  807799: ['吉田正尚', 'よしだ'],
  608372: ['菅野智之', 'すがの'],
  837227: ['今井達也', 'いまい'],
  673513: ['松井裕樹', 'まつい'],
  808959: ['村上宗隆', 'むらかみ'],
  807747: ['西田陸', 'にしだ'],
  672960: ['岡本和真', 'おかもと'],
};

let allPlayers = [];
let loaded = false;
let favoritePlayerIds = new Set();
let query = '';

async function ensurePlayersLoaded() {
  if (loaded) return;
  const { players } = await getAllPlayers(currentSeasonYear());
  allPlayers = players;
  loaded = true;
}

async function loadFavorites() {
  const favs = await getFavorites();
  favoritePlayerIds = new Set(favs.filter((f) => f.type === 'player').map((f) => f.id));
}

// カタカナ・ひらがなでの検索は、日本人選手は対応表の読みと突き合わせ、
// それ以外の選手は英語名から生成したカタカナ近似（おおよその音写）とのゆるい一致で判定する。
function matchesKana(p, katakanaQuery) {
  const aliases = JP_NAME_ALIASES[p.id];
  if (aliases && aliases.some((a) => toKatakana(a).includes(katakanaQuery))) return true;

  const looseQuery = loosenKana(katakanaQuery);
  if (!looseQuery) return false;
  const approx = getApproxKatakanaCached(p.id, p.fullName);
  return kanaMatches(looseQuery, approx);
}

function matchesQuery(p, q) {
  if (p.fullName.toLowerCase().includes(q)) return true;
  const trimmed = query.trim();
  const aliases = JP_NAME_ALIASES[p.id];
  // 漢字での直接一致（大谷翔平 など）
  if (aliases && aliases.some((a) => a.includes(trimmed))) return true;
  // ひらがな・カタカナ入力は、日本語の読み・カタカナ近似とゆるく突き合わせる
  if (containsKana(trimmed)) return matchesKana(p, toKatakana(trimmed));
  return false;
}

function renderPlayerRow(p) {
  const team = p.currentTeam && TEAMS[p.currentTeam.id] ? TEAMS[p.currentTeam.id] : null;
  const isFav = favoritePlayerIds.has(p.id);
  const posLabel = p.primaryPosition ? p.primaryPosition.abbreviation : '';
  return `
    <button class="player-search-row" data-personid="${p.id}">
      <span class="team-dot" style="background:${team ? team.color : '#555'}"></span>
      <span class="player-row-name">${p.fullName}</span>
      <span class="player-row-meta">${team ? team.short : '所属未定'}${posLabel ? ' ・ ' + posLabel : ''}</span>
      ${isFav ? '<span class="fav-star-mini">★</span>' : ''}
    </button>
  `;
}

function renderResults() {
  const q = query.trim().toLowerCase();

  if (!q) {
    if (!favoritePlayerIds.size) {
      return `<div class="empty-state">選手名を入力して検索してください。<br>例：Ohtani、大谷翔平、クルーズ</div>`;
    }
    const favs = allPlayers.filter((p) => favoritePlayerIds.has(p.id));
    return `
      <div class="section-title">お気に入り選手<span class="count">${favs.length}</span></div>
      <div class="team-search-list">${favs.map(renderPlayerRow).join('')}</div>
    `;
  }

  const matched = allPlayers.filter((p) => matchesQuery(p, q));
  if (!matched.length) {
    return `<div class="empty-state">該当する選手が見つかりませんでした。</div>`;
  }
  matched.sort((a, b) => a.fullName.localeCompare(b.fullName));
  const shown = matched.slice(0, RESULT_LIMIT);
  const note = matched.length > RESULT_LIMIT
    ? `<div class="search-note">${matched.length}件中${RESULT_LIMIT}件を表示中。さらに絞り込んでください。</div>`
    : '';
  return `
    <div class="team-search-list">${shown.map(renderPlayerRow).join('')}</div>
    ${note}
  `;
}

function wireTapTargets(container) {
  container.querySelectorAll('[data-personid]').forEach((el) => {
    el.onclick = () => openPlayerSheet(Number(el.dataset.personid));
  });
}

function refresh(container) {
  const wrap = container.querySelector('#player-search-results');
  if (wrap) wrap.innerHTML = renderResults();
  wireTapTargets(container);
}

export async function renderPlayerSearch(container) {
  query = '';
  await loadFavorites();

  container.innerHTML = `
    <div class="search-input-wrap">
      <input type="search" id="player-search-input" class="search-input" placeholder="選手名で検索（例：Ohtani、大谷翔平、クルーズ）" />
    </div>
    <div id="player-search-results"><div class="spinner"></div></div>
  `;

  const input = container.querySelector('#player-search-input');
  input.oninput = () => {
    query = input.value;
    refresh(container);
  };

  try {
    await ensurePlayersLoaded();
    refresh(container);
  } catch (e) {
    const wrap = container.querySelector('#player-search-results');
    if (wrap) wrap.innerHTML = `<div class="empty-state">選手一覧を取得できませんでした。通信状況をご確認のうえ、後ほどお試しください。</div>`;
  }
}
