import { getStandings, currentSeasonYear } from './api.js';
import { TEAMS, DIVISIONS, teamColor, teamName } from './teams.js';
import { openTeamSheet } from './team-sheet.js';
import { openGameSheet } from './game-sheet.js';
import { getFavorites } from './db.js';
import { psClass, renderWildcardCard, buildRaceContext, raceInfo } from './postseason.js';
import { renderGbRuler } from './gb-ruler.js';
import { loadBracket, renderBracket, wireBracket } from './bracket.js';

let cachedRecords = null;
let teamRecordById = new Map(); // teamId -> teamRecord（絞り込みの判定に使用）
let favoriteTeamIds = new Set();

// ポストシーズン用タブ（'standings' | 'bracket'）。日程が存在する時期だけタブ自体を出す。
let activeTab = 'standings';
let bracketData = null;
let bracketSeason = null;

// 絞り込み状態（球団マップ・下部の順位表テーブルで共通。何も選択しなければ全チームを表示）
let mapLeagueFilter = null; // null | 103 | 104
let mapDivisionFilter = null; // null | 'west' | 'central' | 'east'（リーグをまたいだ地区の括り）
let mapPlayoffOnly = false;

const ALL_DIVISION_IDS = [201, 202, 200, 204, 205, 203]; // ア東・ア中・ア西・ナ東・ナ中・ナ西の順で表示

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

// 絞り込みパネルの「地区」選択肢（表示順：西・中・東）。ア・ナ両リーグの同名地区をまとめて扱う。
const DIVISION_FILTER_OPTIONS = [
  { key: 'west', label: '西地区', divisionIds: [200, 203] },
  { key: 'central', label: '中地区', divisionIds: [202, 205] },
  { key: 'east', label: '東地区', divisionIds: [201, 204] },
];

async function loadFavorites() {
  const favs = await getFavorites();
  favoriteTeamIds = new Set(favs.filter((f) => f.type === 'team').map((f) => f.id));
}

// APIの teamRecord から「現在ポストシーズン進出圏内か」を判定
// （地区首位、またはワイルドカード枠を確保中のいずれか）
// 注：teamRecord.hasWildcard は「ワイルドカード制度の対象リーグか」を示す構造的なフラグで
// 全球団で true になるため使えない。実際の圏内判定は wildCardGamesBack の符号で行う
// （"-" または "+" で始まる＝ワイルドカード枠を確保中、符号なしの数字＝圏外で追う側）。
function isPlayoffPosition(teamId) {
  const tr = teamRecordById.get(teamId);
  if (!tr) return false;
  if (tr.divisionLeader === true) return true;
  const wcgb = tr.wildCardGamesBack;
  return wcgb === '-' || (typeof wcgb === 'string' && wcgb.startsWith('+'));
}

function matchesMapFilter(id) {
  const t = TEAMS[id];
  if (!t) return false;
  if (mapLeagueFilter && t.league !== mapLeagueFilter) return false;
  if (mapDivisionFilter) {
    const tier = DIVISION_FILTER_OPTIONS.find((o) => o.key === mapDivisionFilter);
    if (tier && !tier.divisionIds.includes(t.division)) return false;
  }
  if (mapPlayoffOnly && !isPlayoffPosition(Number(id))) return false;
  return true;
}

function renderMap() {
  const dots = Object.entries(TEAMS).map(([id, t]) => {
    const pos = TEAM_POSITIONS[id];
    if (!pos || !matchesMapFilter(id)) return '';
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
      ${dots.trim() ? '' : '<div class="empty-state map-empty-state">条件に一致する球団がありません。</div>'}
    </div>
  `;
}

function renderMapFilters() {
  const leaguePills = [
    { value: null, label: 'すべて' },
    { value: 103, label: 'ア・リーグ' },
    { value: 104, label: 'ナ・リーグ' },
  ].map((o) => `<button class="filter-pill ${mapLeagueFilter === o.value ? 'active' : ''}" data-filter="league" data-value="${o.value ?? ''}">${o.label}</button>`).join('');

  const divisionPills = [{ key: null, label: 'すべて' }, ...DIVISION_FILTER_OPTIONS]
    .map((o) => `<button class="filter-pill ${mapDivisionFilter === o.key ? 'active' : ''}" data-filter="division" data-value="${o.key ?? ''}">${o.label}</button>`).join('');

  return `
    <div class="map-filter-bar">
      <div class="filter-row">
        <span class="filter-row-label">リーグ</span>
        <div class="filter-pill-group">${leaguePills}</div>
      </div>
      <div class="filter-row">
        <span class="filter-row-label">地区</span>
        <div class="filter-pill-group">${divisionPills}</div>
      </div>
      <div class="filter-row">
        <button class="filter-pill toggle-pill ${mapPlayoffOnly ? 'active' : ''}" data-filter="playoff">PS圏内のみ</button>
      </div>
    </div>
  `;
}

function wireMapTapTargets(container) {
  container.querySelectorAll('.team-map [data-teamid]').forEach((el) => {
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

function wireMapFilters(container) {
  container.querySelectorAll('.map-filter-bar [data-filter]').forEach((btn) => {
    btn.onclick = () => {
      const kind = btn.dataset.filter;
      if (kind === 'league') {
        mapLeagueFilter = btn.dataset.value ? Number(btn.dataset.value) : null;
      } else if (kind === 'division') {
        mapDivisionFilter = btn.dataset.value || null;
      } else if (kind === 'playoff') {
        mapPlayoffOnly = !mapPlayoffOnly;
      }
      refreshFiltered(container);
    };
  });
}

// 絞り込み状態が変わるたびに、球団マップ・絞り込みバー・下部の順位表テーブルをまとめて再描画する
// （地図表示と順位表を連動させるため）
function refreshFiltered(container) {
  const mapWrap = container.querySelector('.team-map-wrap');
  if (mapWrap) mapWrap.outerHTML = renderMap();
  const filterBar = container.querySelector('.map-filter-bar');
  if (filterBar) filterBar.outerHTML = renderMapFilters();
  wireMapTapTargets(container);
  wireMapFilters(container);
  renderBody(container);
}

// 「あと何勝で決まるか／もう届かないか」のバッジ。判定は postseason.js の raceInfo が持ち、
// ここでは表示だけを組み立てる。M・Eの意味は順位表の先頭に凡例を添える。
function raceTag(info) {
  if (!info || !info.kind) return '';
  if (info.kind === 'clinched') {
    return `<span class="clinch-tag is-clinched" title="${info.clinch.label}が確定">${info.clinch.label}</span>`;
  }
  if (info.kind === 'eliminated') {
    return `<span class="clinch-tag is-eliminated" title="ポストシーズン進出の可能性がなくなりました">敗退</span>`;
  }
  if (info.kind === 'magic') {
    const title = info.scope === 'division'
      ? `地区優勝のマジックナンバー：自チームの勝ちと2位の負けが合計${info.value}で優勝が決まります（目安）`
      : `ワイルドカード確保のマジックナンバー：自チームの勝ちと圏外首位の負けが合計${info.value}で枠が決まります（目安）`;
    return `<span class="clinch-tag is-magic" title="${title}">M${info.value}</span>`;
  }
  return `<span class="clinch-tag is-elim-num" title="ポストシーズン進出の可能性が消えるまであと${info.value}：自チームの負けとライバルの勝ちの合計（目安）">E${info.value}</span>`;
}

// records は絞り込み後のteamRecordの配列（0件になった球団は呼び出し側で除外済み）
function renderDivisionTable(records, ctx) {
  const sorted = [...records].sort((a, b) => a.divisionRank - b.divisionRank);
  const rows = sorted.map((r) => {
    const info = raceInfo(ctx, r);
    return `
    <tr data-teamid="${r.team.id}" class="${psClass(r)} ${info.kind === 'eliminated' ? 'is-eliminated' : ''}">
      <td>
        <div class="team-cell">
          <span class="rank-num">${r.divisionRank}</span>
          <span class="team-dot" style="background:${teamColor(r.team.id)}"></span>
          ${teamName(r.team.id)}
          ${raceTag(info)}
        </div>
      </td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.winningPercentage ?? '-'}</td>
      <td>${r.gamesBack === '-' || !r.gamesBack ? '-' : r.gamesBack}</td>
      <td>${info.remaining ?? '-'}</td>
    </tr>
  `;
  }).join('');

  return `
    <table class="standings-table">
      <thead>
        <tr><th>チーム</th><th>勝</th><th>敗</th><th>勝率</th><th>差</th><th title="残り試合数（目安）">残</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function wireInteractions(container) {
  container.querySelectorAll('tr[data-teamid]').forEach((row) => {
    row.onclick = () => openTeamSheet(Number(row.dataset.teamid));
  });
}

// 球団マップと同じ絞り込み条件（matchesMapFilter）で順位表テーブルも組み立てる
function renderBody(container) {
  const body = container.querySelector('#standings-body');
  if (!cachedRecords) {
    body.innerHTML = `<div class="spinner"></div>`;
    return;
  }
  if (!cachedRecords.length) {
    body.innerHTML = `<div class="empty-state">現在、順位表データがありません。シーズン開幕前後は表示できない場合があります。</div>`;
    return;
  }
  // マジックナンバー・敗退マジックは絞り込み前の全球団から求める
  // （リーグや地区で絞っても数字が変わらないようにするため）
  const raceCtx = buildRaceContext(cachedRecords);

  let isFirstBlock = true;
  const blocks = ALL_DIVISION_IDS.map((divId) => {
    const rec = cachedRecords.find((r) => r.division && r.division.id === divId);
    if (!rec) return '';
    const filteredTeams = (rec.teamRecords || []).filter((tr) => matchesMapFilter(tr.team.id));
    if (!filteredTeams.length) return '';
    // 軸の読み方の説明は繰り返しになるため、最初に表示する地区にだけ添える
    const withNote = isFirstBlock;
    isFirstBlock = false;
    return `
      <div class="division-block">
        <div class="division-header">${DIVISIONS[divId]}</div>
        ${renderGbRuler(DIVISIONS[divId], filteredTeams, withNote)}
        ${renderDivisionTable(filteredTeams, raceCtx)}
      </div>
    `;
  }).join('');

  const legend = `
    <div class="race-legend">
      <span><b>M</b>＝マジックナンバー（地区優勝・WC確保まで）</span>
      <span><b>E</b>＝ポストシーズン進出の可能性が消えるまでの数</span>
      <span><b>残</b>＝残り試合数</span>
      <em>いずれも勝敗数から求めた目安です。</em>
    </div>
  `;

  body.innerHTML = blocks
    ? legend + blocks
      + renderWildcardCard(cachedRecords, 104, 'ナ・リーグ', raceCtx)
      + renderWildcardCard(cachedRecords, 103, 'ア・リーグ', raceCtx)
    : `<div class="empty-state">条件に一致するチームがありません。</div>`;
  wireInteractions(container);
  body.querySelectorAll('.wc-row[data-teamid], .gb-row[data-teamid]').forEach((row) => {
    row.onclick = () => openTeamSheet(Number(row.dataset.teamid));
    row.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTeamSheet(Number(row.dataset.teamid));
      }
    };
  });
}

// --- ポストシーズン（トーナメント表）タブ ---
// ボトムナビは既に6つあり7つ目を足すと1つあたりが狭くなるため、順位表画面の上部にタブを置いて
// 「順位表」と「トーナメント」を切り替える。ポストシーズンの日程が無い時期はタブ自体を出さない。

function renderTabBar(container) {
  const bar = container.querySelector('#ps-tab-bar');
  if (!bar) return;
  if (!bracketData) {
    bar.innerHTML = '';
    return;
  }
  const tabs = [
    { key: 'standings', label: '順位表' },
    { key: 'bracket', label: 'トーナメント' },
  ].map((t) => `<button class="ps-tab ${activeTab === t.key ? 'active' : ''}" data-tab="${t.key}" role="tab" aria-selected="${activeTab === t.key}">${t.label}</button>`).join('');
  bar.innerHTML = `<div class="ps-tabs" role="tablist">${tabs}</div>`;
  bar.querySelectorAll('.ps-tab').forEach((btn) => {
    btn.onclick = () => switchTab(container, btn.dataset.tab);
  });
}

function renderBracketPane(container) {
  const pane = container.querySelector('#bracket-pane');
  if (!pane || !bracketData) return;
  pane.innerHTML = renderBracket(bracketData, bracketSeason);
  wireBracket(pane, {
    onTeam: (teamId) => openTeamSheet(teamId),
    onGame: (gamePk) => openGameSheet(gamePk),
  });
}

function switchTab(container, tab) {
  activeTab = tab;
  const standingsPane = container.querySelector('#standings-pane');
  const bracketPane = container.querySelector('#bracket-pane');
  if (standingsPane) standingsPane.classList.toggle('pane-hidden', tab !== 'standings');
  if (bracketPane) bracketPane.classList.toggle('pane-hidden', tab !== 'bracket');
  if (tab === 'bracket') renderBracketPane(container);
  renderTabBar(container);
}

// ポストシーズンの日程を取得してタブを出す。日程が無い時期・取得できなかった場合は
// loadBracket が null を返すので、タブが出ないだけで順位表の表示には影響しない。
async function loadPostseasonTab(container) {
  const season = currentSeasonYear();
  const bracket = await loadBracket(season);
  if (!bracket) return;
  bracketData = bracket;
  bracketSeason = season;
  renderTabBar(container);
}

export async function renderStandings(container) {
  await loadFavorites();
  // 画面を開き直したときは必ず順位表タブから始める（前回どのタブにいたかは持ち越さない）
  activeTab = 'standings';
  bracketData = null;

  container.innerHTML = `
    <div id="ps-tab-bar"></div>
    <div id="standings-pane">
      <div class="section-title">球団マップ<span class="count">全30球団</span></div>
      ${renderMap()}
      ${renderMapFilters()}
      <div id="standings-body"><div class="spinner"></div></div>
    </div>
    <div id="bracket-pane" class="pane-hidden"></div>
  `;
  wireInteractions(container);
  wireMapTapTargets(container);
  wireMapFilters(container);
  // 順位表の描画を待たせないよう、ポストシーズン日程の取得は待たずに走らせる
  loadPostseasonTab(container);

  try {
    const { data, offline } = await getStandings(currentSeasonYear());
    cachedRecords = data.records || [];
    teamRecordById = new Map();
    cachedRecords.forEach((rec) => {
      (rec.teamRecords || []).forEach((tr) => teamRecordById.set(tr.team.id, tr));
    });
    const offlineEl = document.getElementById('offline-indicator');
    if (offlineEl) offlineEl.innerHTML = offline ? `<span class="offline-badge">オフライン・前回取得したデータを表示中</span>` : '';
    renderBody(container);
    if (mapPlayoffOnly) { // PS圏内データが揃った時点で地図にも反映
      const mapWrap = container.querySelector('.team-map-wrap');
      if (mapWrap) mapWrap.outerHTML = renderMap();
      wireMapTapTargets(container);
    }
  } catch (e) {
    container.querySelector('#standings-body').innerHTML = `<div class="empty-state">順位表を取得できませんでした。通信状況をご確認のうえ、後ほどお試しください。</div>`;
  }
}
