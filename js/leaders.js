// 個人成績ランキング（順位表画面の「個人成績」タブ）。
// 打撃・投手の主要部門の上位選手を、MLB全体／ア・リーグ／ナ・リーグで切り替えて表示する。
// オフシーズンは直近の完了シーズン（displaySeasonYear）の最終ランキングになるので、
// 試合が無い時期でも「今年のタイトルは誰だったか」を振り返れる。
//
// データは api.js の getStatLeaders（/stats/leaders）。打撃・投手 × リーグの組み合わせごとに
// 1リクエストで全部門をまとめて取り、部門の切り替えでは通信しない。
// レスポンスの形は2026-11-14に実データで確認済み。シーズン開幕直後など部門が欠ける場合に備え、
// 取れた部門だけを出し、1つも取れなければ案内文を出す（画面全体は壊さない）。
import { getStatLeaders } from './api.js';
import { teamShort, teamColor } from './teams.js';
import { japaneseName, JP_NAME_ALIASES } from './player-names.js';
import { openPlayerSheet } from './player-sheet.js';
import { getFavorites } from './db.js';

const GROUPS = {
  hitting: {
    label: '打撃',
    categories: [
      { key: 'homeRuns', label: '本塁打' },
      { key: 'battingAverage', label: '打率', rate: true },
      { key: 'runsBattedIn', label: '打点' },
      { key: 'onBasePlusSlugging', label: 'OPS', rate: true },
      { key: 'hits', label: '安打' },
      { key: 'stolenBases', label: '盗塁' },
    ],
  },
  pitching: {
    label: '投手',
    categories: [
      { key: 'earnedRunAverage', label: '防御率', rate: true },
      { key: 'wins', label: '勝利' },
      { key: 'strikeouts', label: '奪三振' },
      { key: 'saves', label: 'セーブ' },
      { key: 'walksAndHitsPerInningPitched', label: 'WHIP', rate: true },
    ],
  },
};

const LEAGUE_OPTIONS = [
  { value: null, label: 'MLB全体' },
  { value: 103, label: 'ア・リーグ' },
  { value: 104, label: 'ナ・リーグ' },
];

// 選んだ条件は画面を開いている間だけ覚えておく（タブを行き来しても戻らないように）
const state = {
  group: 'hitting',
  league: null,
  category: 'homeRuns',
};

// 'hitting:all' などをキーに、部門キー -> 上位選手の配列 を覚えておく（同じ画面内での再取得を避ける）
const loaded = new Map();
let favoritePlayerIds = new Set();
let loadToken = 0;

function comboKey(season) {
  return `${season}:${state.group}:${state.league || 'all'}`;
}

// leagueLeaders の1要素から、部門キーと上位選手を取り出す。
// 部門名の大文字小文字や、statGroup が別グループの行（打者の三振など）が混ざっても取り違えないようにする。
function indexLeaders(leagueLeaders, group) {
  const wanted = new Map(GROUPS[group].categories.map((c) => [c.key.toLowerCase(), c.key]));
  const byCategory = {};
  for (const entry of leagueLeaders || []) {
    const cat = wanted.get(String(entry.leaderCategory || '').toLowerCase());
    if (!cat) continue;
    if (entry.statGroup && String(entry.statGroup).toLowerCase() !== group) continue;
    const rows = (entry.leaders || [])
      .filter((l) => l && l.person && l.person.id)
      .map((l) => ({
        rank: l.rank,
        value: l.value,
        personId: l.person.id,
        name: japaneseName(l.person.id) || l.person.fullName || '',
        teamId: l.team ? l.team.id : null,
        isJapanese: Boolean(JP_NAME_ALIASES[l.person.id]),
      }));
    if (rows.length && !byCategory[cat]) byCategory[cat] = rows;
  }
  return byCategory;
}

function renderControls() {
  const groupPills = Object.entries(GROUPS).map(([key, g]) => `
    <button class="filter-pill ${state.group === key ? 'active' : ''}" data-ld-group="${key}">${g.label}</button>
  `).join('');
  const leaguePills = LEAGUE_OPTIONS.map((o) => `
    <button class="filter-pill ${state.league === o.value ? 'active' : ''}" data-ld-league="${o.value ?? ''}">${o.label}</button>
  `).join('');
  return `
    <div class="map-filter-bar leaders-filter">
      <div class="filter-row">
        <span class="filter-row-label">種類</span>
        <div class="filter-pill-group">${groupPills}</div>
      </div>
      <div class="filter-row">
        <span class="filter-row-label">対象</span>
        <div class="filter-pill-group">${leaguePills}</div>
      </div>
    </div>
  `;
}

function renderCategoryChips(byCategory) {
  return `
    <div class="leaders-cats" role="tablist">
      ${GROUPS[state.group].categories.map((c) => {
        const has = Boolean(byCategory && byCategory[c.key]);
        return `<button class="leaders-cat ${state.category === c.key ? 'active' : ''}" data-ld-cat="${c.key}" role="tab" aria-selected="${state.category === c.key}" ${has ? '' : 'disabled'}>${c.label}</button>`;
      }).join('')}
    </div>
  `;
}

function renderList(rows, category) {
  const items = rows.map((r) => {
    const isFav = favoritePlayerIds.has(r.personId);
    const isTop = Number(r.rank) === 1;
    return `
      <li class="leader-row ${isFav ? 'is-favorite' : ''} ${isTop ? 'is-top' : ''}" data-personid="${r.personId}" tabindex="0" role="button">
        <span class="leader-rank">${r.rank ?? ''}</span>
        <span class="leader-name">
          ${r.name}
          ${r.isJapanese ? '<span class="leader-jp" title="日本出身の選手">日本</span>' : ''}
          ${isFav ? '<span class="leader-fav" title="お気に入り選手">★</span>' : ''}
        </span>
        <span class="leader-team">${r.teamId ? `<span class="team-dot" style="background:${teamColor(r.teamId)}"></span>${teamShort(r.teamId)}` : ''}</span>
        <span class="leader-value">${r.value ?? '-'}</span>
      </li>
    `;
  }).join('');
  return `
    <ol class="leaders-list" aria-label="${category.label}ランキング">${items}</ol>
    ${category.rate ? '<p class="leaders-note">率の部門は、規定打席・規定投球回に達した選手が対象です（集計はMLB公式データに準じます）。</p>' : ''}
  `;
}

function renderResult(pane, season) {
  const target = pane.querySelector('#leaders-result');
  if (!target) return;
  const byCategory = loaded.get(comboKey(season));
  if (byCategory === undefined) {
    target.innerHTML = '<div class="spinner"></div>';
    return;
  }
  if (byCategory === null || !Object.keys(byCategory).length) {
    target.innerHTML = `<div class="empty-state">${season}年の個人成績ランキングを取得できませんでした。シーズン開幕直後や通信状況によって表示できない場合があります。</div>`;
    return;
  }
  // 選んでいた部門が取れていなければ、取れた最初の部門に寄せる
  if (!byCategory[state.category]) {
    const first = GROUPS[state.group].categories.find((c) => byCategory[c.key]);
    state.category = first.key;
  }
  const category = GROUPS[state.group].categories.find((c) => c.key === state.category);
  target.innerHTML = renderCategoryChips(byCategory) + renderList(byCategory[state.category], category);

  target.querySelectorAll('[data-ld-cat]').forEach((btn) => {
    btn.onclick = () => {
      state.category = btn.dataset.ldCat;
      renderResult(pane, season);
    };
  });
  target.querySelectorAll('.leader-row[data-personid]').forEach((row) => {
    const open = () => openPlayerSheet(Number(row.dataset.personid));
    row.onclick = open;
    row.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    };
  });
}

async function loadCombo(pane, season) {
  const key = comboKey(season);
  if (loaded.has(key)) {
    renderResult(pane, season);
    return;
  }
  const token = ++loadToken;
  renderResult(pane, season); // スピナー
  const group = state.group;
  let byCategory = null;
  try {
    const cats = GROUPS[group].categories.map((c) => c.key);
    const { leaders } = await getStatLeaders(season, group, cats, state.league);
    byCategory = indexLeaders(leaders, group);
  } catch (e) {
    byCategory = null;
  }
  // 取得失敗は覚えず、次にタブを開いたときにもう一度試す
  if (byCategory && Object.keys(byCategory).length) loaded.set(key, byCategory);
  else loaded.delete(key);
  if (token !== loadToken) return; // 取得中に条件が切り替わった
  if (!loaded.has(key)) {
    const target = pane.querySelector('#leaders-result');
    if (target) target.innerHTML = `<div class="empty-state">${season}年の個人成績ランキングを取得できませんでした。シーズン開幕直後や通信状況によって表示できない場合があります。</div>`;
    return;
  }
  renderResult(pane, season);
}

// 順位表画面の「個人成績」タブの中身を描く。タブを開いたときだけ呼ばれる（開かなければ通信しない）。
export async function renderLeadersPane(pane, season, { isFinal = false } = {}) {
  const favs = await getFavorites();
  favoritePlayerIds = new Set(favs.filter((f) => f.type === 'player').map((f) => f.id));

  pane.innerHTML = `
    <div class="section-title">個人成績ランキング<span class="count">${season}年${isFinal ? '・最終' : ''}</span></div>
    ${renderControls()}
    <div id="leaders-result"><div class="spinner"></div></div>
  `;
  pane.querySelectorAll('[data-ld-group]').forEach((btn) => {
    btn.onclick = () => {
      if (state.group === btn.dataset.ldGroup) return;
      state.group = btn.dataset.ldGroup;
      state.category = GROUPS[state.group].categories[0].key;
      renderLeadersPane(pane, season, { isFinal });
    };
  });
  pane.querySelectorAll('[data-ld-league]').forEach((btn) => {
    btn.onclick = () => {
      const v = btn.dataset.ldLeague ? Number(btn.dataset.ldLeague) : null;
      if (state.league === v) return;
      state.league = v;
      renderLeadersPane(pane, season, { isFinal });
    };
  });
  await loadCombo(pane, season);
}
