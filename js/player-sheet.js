// 選手詳細ボトムシート：基本プロフィール・当該シーズン成績・お気に入り登録
import { getPlayerDetail, currentSeasonYear } from './api.js';
import { TEAMS } from './teams.js';
import { getFavorites, toggleFavorite } from './db.js';

const POSITION_JA = {
  'Pitcher': '投手',
  'Catcher': '捕手',
  'First Base': '一塁手',
  'Second Base': '二塁手',
  'Third Base': '三塁手',
  'Shortstop': '遊撃手',
  'Outfielder': '外野手',
  'Left Field': '左翼手',
  'Center Field': '中堅手',
  'Right Field': '右翼手',
  'Designated Hitter': '指名打者',
  'Two-Way Player': '二刀流',
};
const SIDE_JA = { L: '左', R: '右', S: '両' };

function starIcon(filled) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>`;
}

export function positionJa(pos) {
  if (!pos) return '';
  return POSITION_JA[pos.name] || pos.abbreviation || pos.name;
}

// person.stats（hydrate=stats(...)で取得した配列）から指定グループの当該シーズン成績を取り出す
export function findSeasonStat(person, groupName) {
  const group = (person.stats || []).find((g) => g.group && g.group.displayName === groupName);
  if (!group || !group.splits || !group.splits.length) return null;
  return group.splits[0].stat;
}

export function hittingStatGrid(stat) {
  return `
    <div class="standing-summary-stats">
      <div><span class="stat-num">${stat.avg ?? '-'}</span><span class="stat-label">打率</span></div>
      <div><span class="stat-num">${stat.homeRuns ?? '-'}</span><span class="stat-label">本塁打</span></div>
      <div><span class="stat-num">${stat.rbi ?? '-'}</span><span class="stat-label">打点</span></div>
      <div><span class="stat-num">${stat.ops ?? '-'}</span><span class="stat-label">OPS</span></div>
    </div>
  `;
}

export function pitchingStatGrid(stat) {
  return `
    <div class="standing-summary-stats">
      <div><span class="stat-num">${stat.era ?? '-'}</span><span class="stat-label">防御率</span></div>
      <div><span class="stat-num">${stat.wins ?? 0}-${stat.losses ?? 0}</span><span class="stat-label">勝敗</span></div>
      <div><span class="stat-num">${stat.strikeOuts ?? '-'}</span><span class="stat-label">奪三振</span></div>
      <div><span class="stat-num">${stat.whip ?? '-'}</span><span class="stat-label">WHIP</span></div>
    </div>
  `;
}

function renderHittingBlock(stat, seasonYear) {
  return `
    <div class="section-title" style="margin-top:18px;">打撃成績<span class="count">${seasonYear}年</span></div>
    <div class="standing-summary-card">${hittingStatGrid(stat)}</div>
  `;
}

function renderPitchingBlock(stat, seasonYear) {
  return `
    <div class="section-title" style="margin-top:18px;">投手成績<span class="count">${seasonYear}年</span></div>
    <div class="standing-summary-card">${pitchingStatGrid(stat)}</div>
  `;
}

function renderBody(person, seasonYear) {
  const team = person.currentTeam && TEAMS[person.currentTeam.id] ? TEAMS[person.currentTeam.id] : null;
  const hittingStat = findSeasonStat(person, 'hitting');
  const pitchingStat = findSeasonStat(person, 'pitching');

  let html = `
    <div class="standing-summary-card">
      <div class="standing-summary-row">
        <span style="color:${team ? team.color : 'inherit'}">${team ? team.name : '所属未定'}</span>
        <span class="standing-rank">${positionJa(person.primaryPosition)}</span>
      </div>
      <div class="standing-summary-stats">
        <div><span class="stat-num">${person.primaryNumber ? '#' + person.primaryNumber : '-'}</span><span class="stat-label">背番号</span></div>
        <div><span class="stat-num">${person.currentAge ?? '-'}</span><span class="stat-label">歳</span></div>
        <div><span class="stat-num">${person.batSide ? (SIDE_JA[person.batSide.code] || '-') : '-'}</span><span class="stat-label">打席</span></div>
        <div><span class="stat-num">${person.pitchHand ? (SIDE_JA[person.pitchHand.code] || '-') : '-'}</span><span class="stat-label">投球</span></div>
      </div>
    </div>
  `;

  if (hittingStat) html += renderHittingBlock(hittingStat, seasonYear);
  if (pitchingStat) html += renderPitchingBlock(pitchingStat, seasonYear);
  if (!hittingStat && !pitchingStat) {
    html += `<div class="empty-state" style="margin-top:18px;">${seasonYear}年シーズンの成績データがありません。</div>`;
  }
  return html;
}

export async function openPlayerSheet(personId) {
  const root = document.getElementById('sheet-root');
  const favorites = await getFavorites();
  let isFav = favorites.some((f) => f.favKey === `player:${personId}`);
  let playerName = '';

  root.innerHTML = `
    <div class="sheet-backdrop" id="sheet-backdrop">
      <div class="sheet">
        <div class="sheet-header">
          <h2 id="player-sheet-name">読み込み中…</h2>
          <div class="sheet-header-actions">
            <button class="fav-toggle-btn ${isFav ? 'active' : ''}" id="sheet-fav-btn" aria-label="お気に入り登録・解除">${starIcon(isFav)}</button>
            <button class="sheet-close" id="sheet-close">×</button>
          </div>
        </div>
        <div id="player-sheet-body"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('sheet-close').onclick = close;
  document.getElementById('sheet-backdrop').onclick = (e) => {
    if (e.target.id === 'sheet-backdrop') close();
  };
  document.getElementById('sheet-fav-btn').onclick = async () => {
    isFav = await toggleFavorite({ type: 'player', id: personId, name: playerName });
    const btn = document.getElementById('sheet-fav-btn');
    if (!btn) return;
    btn.classList.toggle('active', isFav);
    btn.innerHTML = starIcon(isFav);
  };

  try {
    const seasonYear = currentSeasonYear();
    const { person } = await getPlayerDetail(personId, seasonYear);
    if (!person) throw new Error('選手情報が見つかりませんでした');
    playerName = person.fullName;

    const nameEl = document.getElementById('player-sheet-name');
    if (nameEl) nameEl.textContent = person.fullName;

    const body = document.getElementById('player-sheet-body');
    if (!body) return; // シートが既に閉じられている場合
    body.innerHTML = renderBody(person, seasonYear);
  } catch (e) {
    const body = document.getElementById('player-sheet-body');
    if (body) body.innerHTML = `<div class="empty-state">選手情報を取得できませんでした。</div>`;
  }
}
