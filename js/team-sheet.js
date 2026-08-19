import { getTeamSchedule, addDaysToDateString, toJstDateString, formatJstTime, formatJstDateLabel } from './api.js';
import { teamName, teamColor } from './teams.js';

export async function openTeamSheet(teamId) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" id="sheet-backdrop">
      <div class="sheet">
        <div class="sheet-header">
          <h2 style="color:${teamColor(teamId)}">${teamName(teamId)}</h2>
          <button class="sheet-close" id="sheet-close">×</button>
        </div>
        <div class="section-title" style="margin-top:0;">試合カレンダー</div>
        <div id="team-sheet-body"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('sheet-close').onclick = close;
  document.getElementById('sheet-backdrop').onclick = (e) => {
    if (e.target.id === 'sheet-backdrop') close();
  };

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
