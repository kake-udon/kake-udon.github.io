// チーム検索画面：簡易US地図プロット・地区別リスト
// 地図は著作権のかからない自前の簡略化ポリゴンで、各球団本拠地のおおよその緯度経度から算出した座標にドットを配置する。
import { TEAMS, DIVISIONS, teamColor } from './teams.js';
import { openTeamSheet } from './team-sheet.js';
import { getFavorites } from './db.js';

const MAP_VIEWBOX = '0 0 900 560';

// 簡略化した米国本土のアウトライン（実際の海岸線ではなく、地図らしさを出すための概略図形）
const MAP_OUTLINE_POINTS = '5,35 12,172 38,263 119,377 157,377 282,392 420,519 476,437 610,431 683,528 671,420 688,370 755,312 748,280 778,215 809,194 839,172 885,112 816,103 702,138 633,172 580,108 458,22 320,22 168,22 31,22';

// 各球団本拠地の緯度経度から算出したおおよその地図座標（近接都市は視認性のため手動で微調整）
const TEAM_POSITIONS = {
  110: [738, 231], // BAL
  111: [823, 165], // BOS
  147: [771, 196], // NYY
  139: [646, 479], // TB
  141: [696, 137], // TOR
  145: [562, 172], // CWS
  114: [661, 183], // CLE
  116: [640, 165], // DET
  118: [466, 236], // KC
  142: [484, 108], // MIN
  117: [452, 436], // HOU
  108: [118, 358], // LAA
  133: [54, 246],  // ATH
  136: [41, 52],   // SEA
  140: [426, 372], // TEX
  144: [620, 350], // ATL
  146: [684, 522], // MIA
  121: [788, 203], // NYM
  143: [760, 217], // PHI
  120: [732, 239], // WSH
  112: [578, 179], // CHC
  113: [618, 235], // CIN
  158: [566, 150], // MIL
  134: [686, 206], // PIT
  138: [531, 245], // STL
  109: [197, 357], // AZ
  115: [305, 221], // COL
  119: [98, 338],  // LAD
  135: [120, 372], // SD
  137: [39, 263],  // SF
};

const DIVISION_ORDER = [201, 202, 200, 204, 205, 203]; // 東・中・西の順で表示

let favoriteTeamIds = new Set();

async function loadFavorites() {
  const favs = await getFavorites();
  favoriteTeamIds = new Set(favs.filter((f) => f.type === 'team').map((f) => f.id));
}

function renderMap() {
  const dots = Object.entries(TEAMS).map(([id, t]) => {
    const pos = TEAM_POSITIONS[id];
    if (!pos) return '';
    const isFav = favoriteTeamIds.has(Number(id));
    const cls = ['team-dot-map', isFav ? 'is-favorite' : ''].filter(Boolean).join(' ');
    return `
      <g class="${cls}" data-teamid="${id}" tabindex="0" role="button" aria-label="${t.name}">
        <circle cx="${pos[0]}" cy="${pos[1]}" r="16" fill="transparent" />
        <circle class="dot-core" cx="${pos[0]}" cy="${pos[1]}" r="7" style="fill:${t.color}" />
      </g>
    `;
  }).join('');

  return `
    <div class="team-map-wrap">
      <svg class="team-map" viewBox="${MAP_VIEWBOX}" preserveAspectRatio="xMidYMid meet">
        <polygon class="map-outline" points="${MAP_OUTLINE_POINTS}" />
        ${dots}
      </svg>
    </div>
  `;
}

function renderTeamRow(id, t) {
  const isFav = favoriteTeamIds.has(Number(id));
  return `
    <button class="team-search-row" data-teamid="${id}">
      <span class="team-dot" style="background:${t.color}"></span>
      <span class="team-row-name">${t.name}</span>
      <span class="team-row-short">${t.short}</span>
      ${isFav ? '<span class="fav-star-mini">★</span>' : ''}
    </button>
  `;
}

function renderGroupedList() {
  return DIVISION_ORDER.map((divId) => {
    const teamsInDiv = Object.entries(TEAMS).filter(([, t]) => t.division === divId);
    return `
      <div class="division-block">
        <div class="division-header">${DIVISIONS[divId]}</div>
        <div class="team-search-list">${teamsInDiv.map(([id, t]) => renderTeamRow(id, t)).join('')}</div>
      </div>
    `;
  }).join('');
}

function wireTapTargets(container) {
  container.querySelectorAll('[data-teamid]').forEach((el) => {
    const trigger = () => openTeamSheet(Number(el.dataset.teamid));
    el.onclick = trigger;
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger();
      }
    };
  });
}

export async function renderTeamSearch(container) {
  await loadFavorites();

  container.innerHTML = `
    <div class="section-title">球団マップ<span class="count">全30球団</span></div>
    ${renderMap()}
    <div id="team-search-list-wrap">${renderGroupedList()}</div>
  `;

  wireTapTargets(container);
}
