import { getGamesForJstDate, addDaysToDateString, toJstDateString, formatJstTime, formatJstDateLabel } from './api.js';
import { teamName, teamColor, TEAMS } from './teams.js';
import { getFavorites, toggleFavorite } from './db.js';
import { openTeamSheet } from './team-sheet.js';

let favoriteTeamIds = new Set();

function statusInfo(game) {
  const state = game.status.abstractGameState; // Preview / Live / Final
  if (state === 'Live') return { label: 'LIVE', cls: 'live' };
  if (state === 'Final') return { label: game.status.detailedState === 'Postponed' ? '順延' : '試合終了', cls: 'final' };
  return { label: '試合前', cls: 'scheduled' };
}

function scoreOrDash(team, hasStarted) {
  if (!hasStarted) return null;
  return typeof team.score === 'number' ? team.score : 0;
}

function renderGameCard(game) {
  const away = game.teams.away;
  const home = game.teams.home;
  const info = statusInfo(game);
  const hasStarted = game.status.abstractGameState !== 'Preview';
  const isFinal = game.status.abstractGameState === 'Final';

  const awayScore = scoreOrDash(away, hasStarted);
  const homeScore = scoreOrDash(home, hasStarted);

  let awayWin = false, homeWin = false;
  if (isFinal && awayScore !== null && homeScore !== null) {
    awayWin = awayScore > homeScore;
    homeWin = homeScore > awayScore;
  }

  const isFav = favoriteTeamIds.has(away.team.id) || favoriteTeamIds.has(home.team.id);

  const timeOrScoreRight = (score, isWin) => {
    if (score === null) return '';
    return `<span class="score-digit ${isFinal && !isWin ? 'dim' : ''}">${score}</span>`;
  };

  return `
    <button class="game-card ${isFav ? 'is-favorite' : ''}" data-gamepk="${game.gamePk}" data-away="${away.team.id}" data-home="${home.team.id}">
      <div class="status-row">
        <span class="status-pill ${info.cls}">${info.label}</span>
        <span class="game-time">${hasStarted && !isFinal ? '' : formatJstTime(game.gameDate)}${!hasStarted ? ' 開始' : ''}</span>
      </div>
      <div class="matchup-row">
        <div class="team-line">
          <span class="team-dot" style="background:${teamColor(away.team.id)}"></span>
          <span class="team-label ${awayWin ? 'winner' : isFinal ? 'loser' : ''}">${teamName(away.team.id)}</span>
        </div>
        ${timeOrScoreRight(awayScore, awayWin)}
        <div class="team-line">
          <span class="team-dot" style="background:${teamColor(home.team.id)}"></span>
          <span class="team-label ${homeWin ? 'winner' : isFinal ? 'loser' : ''}">${teamName(home.team.id)}</span>
        </div>
        ${timeOrScoreRight(homeScore, homeWin)}
      </div>
    </button>
  `;
}

function renderGameList(games) {
  if (!games.length) {
    return `<div class="empty-state">この日は試合がありません。</div>`;
  }
  return `<div class="scoreboard-list">${games.map(renderGameCard).join('')}</div>`;
}

function renderTeamPicker() {
  const chips = Object.entries(TEAMS).map(([id, t]) => {
    const selected = favoriteTeamIds.has(Number(id));
    return `<div class="team-chip ${selected ? 'selected' : ''}" data-teamid="${id}">
      <div class="dot" style="background:${t.color}"></div>${t.name}
    </div>`;
  }).join('');
  return `
    <details class="collapsible" id="team-picker">
      <summary>
        <span class="section-title" style="margin:0;">お気に入りチームを選ぶ <span class="count">${favoriteTeamIds.size}</span></span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      </summary>
      <div class="team-chip-grid" style="margin-top:10px;">${chips}</div>
    </details>
  `;
}

async function loadFavorites() {
  const favs = await getFavorites();
  favoriteTeamIds = new Set(favs.filter((f) => f.type === 'team').map((f) => f.id));
}

export async function renderHome(container) {
  await loadFavorites();

  container.innerHTML = `
    <div class="section-title">お気に入り</div>
    ${renderTeamPicker()}
    <div class="section-title">本日の試合 <span class="count" id="today-count"></span></div>
    <div id="today-games"><div class="spinner"></div></div>
    <details class="collapsible" style="margin-top:22px;">
      <summary>
        <span class="section-title" style="margin:0;">前日の結果</span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      </summary>
      <div id="yesterday-games" style="margin-top:10px;"><div class="spinner"></div></div>
    </details>
    <div class="section-title">豆知識</div>
    <div class="trivia-card">${randomTrivia()}</div>
  `;

  wireTeamPicker(container);
  wireGameCardTaps(container);

  const todayJst = toJstDateString();
  const yesterdayJst = addDaysToDateString(todayJst, -1);

  try {
    const { games, offline } = await getGamesForJstDate(todayJst);
    container.querySelector('#today-games').innerHTML = renderGameList(games);
    container.querySelector('#today-count').textContent = games.length ? `${games.length}試合` : '';
    setOfflineBadge(offline);
    wireGameCardTaps(container);
  } catch (e) {
    container.querySelector('#today-games').innerHTML = `<div class="empty-state">試合情報を取得できませんでした。通信状況をご確認のうえ、後ほどお試しください。</div>`;
  }

  try {
    const { games } = await getGamesForJstDate(yesterdayJst);
    container.querySelector('#yesterday-games').innerHTML = renderGameList(games);
    wireGameCardTaps(container);
  } catch (e) {
    container.querySelector('#yesterday-games').innerHTML = `<div class="empty-state">前日の結果を取得できませんでした。</div>`;
  }
}

function setOfflineBadge(offline) {
  const el = document.getElementById('offline-indicator');
  el.innerHTML = offline ? `<span class="offline-badge">オフライン・前回取得したデータを表示中</span>` : '';
}

function wireGameCardTaps(container) {
  container.querySelectorAll('.game-card').forEach((btn) => {
    btn.onclick = () => {
      const homeId = Number(btn.dataset.home);
      openTeamSheet(homeId);
    };
  });
}

function wireTeamPicker(container) {
  container.querySelectorAll('.team-chip').forEach((chip) => {
    chip.onclick = async () => {
      const id = Number(chip.dataset.teamid);
      const wasSelected = favoriteTeamIds.has(id);
      await toggleFavorite({ type: 'team', id, name: teamName(id) });
      if (wasSelected) favoriteTeamIds.delete(id); else favoriteTeamIds.add(id);
      chip.classList.toggle('selected');
      const countEl = container.querySelector('#team-picker .count');
      if (countEl) countEl.textContent = favoriteTeamIds.size;
      container.querySelectorAll('.game-card').forEach((card) => {
        const away = Number(card.dataset.away);
        const home = Number(card.dataset.home);
        card.classList.toggle('is-favorite', favoriteTeamIds.has(away) || favoriteTeamIds.has(home));
      });
    };
  });
}

const TRIVIA = [
  'ピッチクロックは投手が捕手からボールを受け取ってから、走者なしの場合15秒、走者ありの場合20秒以内に投球動作を開始しないと違反となるルールです。',
  'ABSチャレンジ（自動ボール・ストライク判定への異議）は、打者・投手・捕手のいずれかが可能で、1試合につき各チーム2回まで、成功すれば回数は減りません。',
  'ポストシーズンは各リーグの地区優勝3チームとワイルドカード3チームの計6チームで争われ、地区優勝チームのうち成績上位2チームはワイルドカードシリーズを免除されます。',
  'ワールドシリーズは7戦4勝制で、アメリカン・リーグとナショナル・リーグの優勝チームが対戦します。',
  'セーブの条件は、リードした状態で試合を終えた救援投手が、3点差以内で1イニング以上を投げる、または最低3イニングを投げる、など複数のパターンがあります。',
];
function randomTrivia() {
  return TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
}
