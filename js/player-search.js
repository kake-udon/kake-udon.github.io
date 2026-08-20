// 選手検索画面：名前検索（英語表記・主要な日本人選手は日本語表記にも対応）
import { getAllPlayers, currentSeasonYear } from './api.js';
import { TEAMS } from './teams.js';
import { getFavorites } from './db.js';
import { openPlayerSheet } from './player-sheet.js';

const RESULT_LIMIT = 40;

// 日本ゆかりの主要選手のみ、日本語名でも検索できるようにする簡易対応表（MLB Stats APIは英語表記のみのため）
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

function matchesQuery(p, q) {
  if (p.fullName.toLowerCase().includes(q)) return true;
  const aliases = JP_NAME_ALIASES[p.id];
  return !!aliases && aliases.some((a) => a.includes(query.trim()));
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
      return `<div class="empty-state">選手名を入力して検索してください。<br>例：Ohtani、大谷翔平</div>`;
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
      <input type="search" id="player-search-input" class="search-input" placeholder="選手名で検索（例：Ohtani、大谷翔平）" />
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
