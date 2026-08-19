import { getTeamSchedule, getStandings, addDaysToDateString, toJstDateString, formatJstTime, formatJstDateLabel, currentSeasonYear } from './api.js';
import { teamName, teamColor, DIVISIONS } from './teams.js';
import { getFavorites, toggleFavorite } from './db.js';

function starIcon(filled) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>`;
}

export async function openTeamSheet(teamId) {
  const root = document.getElementById('sheet-root');
  const favorites = await getFavorites();
  let isFav = favorites.some((f) => f.favKey === `team:${teamId}`);

  root.innerHTML = `
    <div class="sheet-backdrop" id="sheet-backdrop">
      <div class="sheet">
        <div class="sheet-header">
          <h2 style="color:${teamColor(teamId)}">${teamName(teamId)}</h2>
          <div class="sheet-header-actions">
            <button class="fav-toggle-btn ${isFav ? 'active' : ''}" id="sheet-fav-btn" aria-label="お気に入り登録・解除">${starIcon(isFav)}</button>
            <button class="sheet-close" id="sheet-close">×</button>
          </div>
        </div>
        <div id="team-standing-summary"></div>
        <div class="section-title" style="margin-top:18px;">試合カレンダー</div>
        <div id="team-sheet-body"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('sheet-close').onclick = close;
  document.getElementById('sheet-backdrop').onclick = (e) => {
    if (e.target.id === 'sheet-backdrop') close();
  };
  document.getElementById('sheet-fav-btn').onclick = async () => {
    isFav = await toggleFavorite({ type: 'team', id: teamId, name: teamName(teamId) });
    const btn = document.getElementById('sheet-fav-btn');
    if (!btn) return;
    btn.classList.toggle('active', isFav);
    btn.innerHTML = starIcon(isFav);
  };

  loadStandingSummary(teamId);

  const today = toJstDateString();
  const startDate = addDaysToDateString(today, -6);
  const endDate = addDaysToDateString(today, 6);

  try {
    const { games } = await getTeamSchedule(teamId, startDate, endDate);
    const body = document.getElementById('team-sheet-body');
    if (!body) return; // シートが既に閉じられている場合
    if (!games.length) {
      body.innerHTML = `<div class="empty-state">直近の試合情報が見つかりませんでした。</div>`;
      return;
    }
    body.innerHTML = games.map((g) => renderRow(g, teamId)).join('');
  } catch (e) {
    const body = document.getElementById('team-sheet-body');
    if (body) body.innerHTML = `<div class="empty-state">試合カレンダーを取得できませんでした。</div>`;
  }
}

async function loadStandingSummary(teamId) {
  try {
    const { data } = await getStandings(currentSeasonYear());
    let found = null;
    for (const rec of data.records || []) {
      const tr = (rec.teamRecords || []).find((t) => t.team.id === teamId);
      if (tr) {
        found = { ...tr, divisionId: rec.division ? rec.division.id : null };
        break;
      }
    }
    const target = document.getElementById('team-standing-summary');
    if (target) target.innerHTML = renderStandingSummary(found);
  } catch (e) {
    const target = document.getElementById('team-standing-summary');
    if (target) target.innerHTML = '';
  }
}

function renderStandingSummary(standing) {
  if (!standing) return '';
  const divName = standing.divisionId && DIVISIONS[standing.divisionId] ? DIVISIONS[standing.divisionId] : '';
  return `
    <div class="standing-summary-card">
      <div class="standing-summary-row">
        <span>${divName}</span>
        <span class="standing-rank">${standing.divisionRank}位</span>
      </div>
      <div class="standing-summary-stats">
        <div><span class="stat-num">${standing.wins}</span><span class="stat-label">勝</span></div>
        <div><span class="stat-num">${standing.losses}</span><span class="stat-label">敗</span></div>
        <div><span class="stat-num">${standing.winningPercentage ?? '-'}</span><span class="stat-label">勝率</span></div>
        <div><span class="stat-num">${standing.gamesBack === '-' || !standing.gamesBack ? '-' : standing.gamesBack}</span><span class="stat-label">差</span></div>
      </div>
    </div>
  `;
}

function renderRow(game, teamId) {
  const isHome = game.teams.home.team.id === teamId;
  const opponent = isHome ? game.teams.away : game.teams.home;
  const self = isHome ? game.teams.home : game.teams.away;
  const isFinal = game.status.abstractGameState === 'Final';
  const started = game.status.abstractGameState !== 'Preview';

  let resultLabel = formatJstTime(game.gameDate) + ' 開始';
  if (isFinal) {
    const selfScore = self.score ?? 0;
    const oppScore = opponent.score ?? 0;
    const wl = selfScore > oppScore ? '○' : selfScore < oppScore ? '●' : '△';
    resultLabel = `${wl} ${selfScore}-${oppScore}`;
  } else if (started) {
    resultLabel = `試合中 ${self.score ?? 0}-${opponent.score ?? 0}`;
  }

  return `
    <div class="game-card" style="cursor:default;margin-bottom:8px;">
      <div class="status-row">
        <span class="game-time">${formatJstDateLabel(game.gameDate)}</span>
        <span class="status-pill ${isFinal ? 'final' : started ? 'live' : 'scheduled'}">${resultLabel}</span>
      </div>
      <div class="team-line">
        <span class="team-dot" style="background:${teamColor(opponent.team.id)}"></span>
        <span class="team-label">${isHome ? 'vs' : '@'} ${teamName(opponent.team.id)}</span>
      </div>
    </div>
  `;
}
