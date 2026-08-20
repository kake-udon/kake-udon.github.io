// マイ成績画面：お気に入り選手の当該シーズン成績をまとめて表示
import { getPlayerDetail, currentSeasonYear } from './api.js';
import { TEAMS } from './teams.js';
import { getFavorites } from './db.js';
import { openPlayerSheet, findSeasonStat, positionJa, hittingStatGrid, pitchingStatGrid } from './player-sheet.js';

function renderPlayerCard(fav, person, seasonYear) {
  if (!person) {
    return `
      <button class="game-card" data-personid="${fav.id}">
        <div class="status-row">
          <div class="team-line"><span class="player-row-name">${fav.name}</span></div>
        </div>
        <div class="empty-state" style="padding:14px;margin:0;">成績を取得できませんでした。</div>
      </button>
    `;
  }

  const team = person.currentTeam && TEAMS[person.currentTeam.id] ? TEAMS[person.currentTeam.id] : null;
  const hittingStat = findSeasonStat(person, 'hitting');
  const pitchingStat = findSeasonStat(person, 'pitching');

  const grids = [];
  if (hittingStat) grids.push(hittingStatGrid(hittingStat));
  if (pitchingStat) grids.push(pitchingStatGrid(pitchingStat));
  const body = grids.length
    ? grids.map((g, i) => (i > 0 ? `<div style="margin-top:10px;">${g}</div>` : g)).join('')
    : `<div class="empty-state" style="padding:14px;margin:0;">${seasonYear}年の成績データがありません。</div>`;

  return `
    <button class="game-card" data-personid="${person.id}">
      <div class="status-row">
        <div class="team-line">
          <span class="team-dot" style="background:${team ? team.color : '#555'}"></span>
          <span class="team-label">${person.fullName}</span>
        </div>
        <span class="game-time">${team ? team.short : '所属未定'} ・ ${positionJa(person.primaryPosition)}</span>
      </div>
      ${body}
    </button>
  `;
}

function wireTapTargets(container) {
  container.querySelectorAll('[data-personid]').forEach((el) => {
    el.onclick = () => openPlayerSheet(Number(el.dataset.personid));
  });
}

export async function renderMyPlayers(container) {
  const favorites = (await getFavorites()).filter((f) => f.type === 'player');

  if (!favorites.length) {
    container.innerHTML = `
      <div class="section-title">お気に入り選手の成績</div>
      <div class="empty-state">お気に入り選手が登録されていません。<br>「選手検索」から選手を検索し、★ボタンで登録してください。</div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="section-title">お気に入り選手の成績<span class="count">${favorites.length}名</span></div>
    <div id="my-players-list" class="scoreboard-list"><div class="spinner"></div></div>
  `;

  const seasonYear = currentSeasonYear();
  const results = await Promise.all(favorites.map(async (fav) => {
    try {
      const { person } = await getPlayerDetail(fav.id, seasonYear);
      return { fav, person };
    } catch (e) {
      return { fav, person: null };
    }
  }));

  const listEl = container.querySelector('#my-players-list');
  if (!listEl) return; // 画面が既に切り替わっている場合
  listEl.innerHTML = results.map(({ fav, person }) => renderPlayerCard(fav, person, seasonYear)).join('');
  wireTapTargets(container);
}
