// 選手検索画面：名前検索（英語表記・日本人選手は日本語表記・その他の選手もカタカナ近似で検索可能）と、
// 「日本人選手」クイックフィルター（探さなくても一覧で見られる導線）
import { getAllPlayers, currentSeasonYear } from './api.js';
import { TEAMS } from './teams.js';
import { getFavorites } from './db.js';
import { openPlayerSheet } from './player-sheet.js';
import { toKatakana, containsKana, loosenKana, kanaMatches, getApproxKatakanaCached } from './kana.js';
import { JP_NAME_ALIASES } from './player-names.js';

const RESULT_LIMIT = 40;

let allPlayers = [];
let loaded = false;
let favoritePlayerIds = new Set();
let query = '';
let jpOnly = false; // 「日本人選手」フィルターの状態

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

// 日本人選手かどうか。APIの birthCountry が入っていればそれを使い、
// 入っていない場合は日本語表記の対応表（player-names.js）に載っているかで判定する。
// /sports/1/players のレスポンスに birthCountry が含まれるかは未確認のため、両方を見る。
function isJapanesePlayer(p) {
  if (p.birthCountry === 'Japan') return true;
  return Boolean(JP_NAME_ALIASES[p.id]);
}

function renderFilterBar() {
  return `
    <div class="filter-row search-filter-row">
      <button class="filter-pill toggle-pill ${jpOnly ? 'active' : ''}" id="jp-only-filter" aria-pressed="${jpOnly}">日本人選手</button>
    </div>
  `;
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
  const base = jpOnly ? allPlayers.filter(isJapanesePlayer) : allPlayers;

  if (!q) {
    // 「日本人選手」フィルターだけを押した状態は、検索せずに一覧を見るための表示
    if (jpOnly) {
      if (!base.length) {
        return `<div class="empty-state">日本人選手が見つかりませんでした。</div>`;
      }
      const list = [...base].sort((a, b) => a.fullName.localeCompare(b.fullName));
      return `
        <div class="section-title">日本人選手<span class="count">${list.length}人</span></div>
        <div class="team-search-list">${list.map(renderPlayerRow).join('')}</div>
      `;
    }
    if (!favoritePlayerIds.size) {
      return `<div class="empty-state">選手名を入力して検索してください。<br>例：Ohtani、大谷翔平、クルーズ</div>`;
    }
    const favs = allPlayers.filter((p) => favoritePlayerIds.has(p.id));
    return `
      <div class="section-title">お気に入り選手<span class="count">${favs.length}</span></div>
      <div class="team-search-list">${favs.map(renderPlayerRow).join('')}</div>
    `;
  }

  const matched = base.filter((p) => matchesQuery(p, q));
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

function wireFilterBar(container) {
  const btn = container.querySelector('#jp-only-filter');
  if (!btn) return;
  btn.onclick = () => {
    jpOnly = !jpOnly;
    refresh(container);
  };
}

function refresh(container) {
  const bar = container.querySelector('.search-filter-row');
  if (bar) bar.outerHTML = renderFilterBar();
  const wrap = container.querySelector('#player-search-results');
  if (wrap) wrap.innerHTML = renderResults();
  wireFilterBar(container);
  wireTapTargets(container);
}

export async function renderPlayerSearch(container) {
  query = '';
  jpOnly = false;
  await loadFavorites();

  container.innerHTML = `
    <div class="search-input-wrap">
      <input type="search" id="player-search-input" class="search-input" placeholder="選手名で検索（例：Ohtani、大谷翔平、クルーズ）" />
    </div>
    ${renderFilterBar()}
    <div id="player-search-results"><div class="spinner"></div></div>
  `;

  const input = container.querySelector('#player-search-input');
  input.oninput = () => {
    query = input.value;
    refresh(container);
  };
  wireFilterBar(container);

  try {
    await ensurePlayersLoaded();
    refresh(container);
  } catch (e) {
    const wrap = container.querySelector('#player-search-results');
    if (wrap) wrap.innerHTML = `<div class="empty-state">選手一覧を取得できませんでした。通信状況をご確認のうえ、後ほどお試しください。</div>`;
  }
}
