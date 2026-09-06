import { getGamesForJstDate, addDaysToDateString, toJstDateString, formatJstTime, formatJstDateLabel } from './api.js';
import { teamName, teamShort, teamColor } from './teams.js';
import { getFavorites } from './db.js';
import { openGameSheet } from './game-sheet.js';
import { pickTrivia } from './trivia.js';
import { renderTodayStats } from './today-stats.js';
import { loadBracket, findSeriesForGame, nextPostseasonGame, seriesShortLineJa } from './bracket.js';

let favoriteTeamIds = new Set();
let currentTrivia = null;
// ポストシーズン中だけ使うシリーズ情報（日程が無い時期は null のまま）
let bracket = null;

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

  // ポストシーズンの試合には「DS 第3戦・1勝1敗」のような1行を添える
  const series = findSeriesForGame(bracket, game.gamePk);
  const seriesLine = series ? `<div class="game-card-series">${seriesShortLineJa(series, game)}</div>` : '';

  return `
    <button class="game-card game-card-compact ${isFav ? 'is-favorite' : ''}" data-gamepk="${game.gamePk}" data-away="${away.team.id}" data-home="${home.team.id}">
      ${seriesLine}
      <div class="status-row">
        <span class="status-pill ${info.cls}">${info.label}</span>
        <span class="game-time">${hasStarted && !isFinal ? '' : formatJstTime(game.gameDate)}${!hasStarted ? ' 開始' : ''}</span>
      </div>
      <div class="matchup-row">
        <div class="team-line">
          <span class="team-dot" style="background:${teamColor(away.team.id)}"></span>
          <span class="team-label ${awayWin ? 'winner' : isFinal ? 'loser' : ''}" title="${teamName(away.team.id)}">${teamShort(away.team.id)}</span>
        </div>
        ${timeOrScoreRight(awayScore, awayWin)}
        <div class="team-line">
          <span class="team-dot" style="background:${teamColor(home.team.id)}"></span>
          <span class="team-label ${homeWin ? 'winner' : isFinal ? 'loser' : ''}" title="${teamName(home.team.id)}">${teamShort(home.team.id)}</span>
        </div>
        ${timeOrScoreRight(homeScore, homeWin)}
      </div>
    </button>
  `;
}

// お気に入りチームが関わる試合を先頭に集める（それぞれのグループ内の順序は元のまま維持）
function sortGamesByFavorite(games) {
  const favGames = [];
  const otherGames = [];
  games.forEach((g) => {
    const isFav = favoriteTeamIds.has(g.teams.away.team.id) || favoriteTeamIds.has(g.teams.home.team.id);
    (isFav ? favGames : otherGames).push(g);
  });
  return [...favGames, ...otherGames];
}

// ポストシーズンは試合のない日（移動日）が普通にあるため、
// 「試合がありません」だけだと不具合に見える。次の試合の日時まで出す。
function renderNoGamesState() {
  if (!bracket) return `<div class="empty-state">この日は試合がありません。</div>`;
  const next = nextPostseasonGame(bracket);
  if (!next) return `<div class="empty-state">ポストシーズンの全日程が終了しました。</div>`;
  return `
    <div class="travel-day-card">
      <div class="travel-day-title">今日は移動日です</div>
      <div class="travel-day-next">次の試合は ${formatJstDateLabel(next.gameDate)} ${next.status && next.status.startTimeTBD ? '時間未定' : formatJstTime(next.gameDate)}</div>
    </div>
  `;
}

function renderGameList(games) {
  if (!games.length) {
    return renderNoGamesState();
  }
  return `<div class="scoreboard-list game-grid">${sortGamesByFavorite(games).map(renderGameCard).join('')}</div>`;
}

async function loadFavorites() {
  const favs = await getFavorites();
  favoriteTeamIds = new Set(favs.filter((f) => f.type === 'team').map((f) => f.id));
}

export async function renderHome(container) {
  await loadFavorites();

  container.innerHTML = `
    <button class="race-link-bar" id="go-standings">
      <span class="race-link-text">優勝争い・ポストシーズン</span>
      <span class="race-link-cta">順位表を見る
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m10 6 6 6-6 6"/></svg>
      </span>
    </button>
    <div class="section-title">豆知識
      <button id="trivia-refresh" class="trivia-refresh-btn" aria-label="別の豆知識を見る">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.6-6.36"/><path d="M21 4v5h-5"/></svg>
      </button>
    </div>
    <div id="trivia-wrap">${renderTriviaCard()}</div>
    <div class="section-title" style="margin-top:22px;">本日の試合 <span class="count" id="today-count"></span></div>
    <div id="today-games"><div class="spinner"></div></div>
    <div id="today-stats-section" style="margin-top:22px;"></div>
    <details class="collapsible" style="margin-top:22px;">
      <summary>
        <span class="section-title" style="margin:0;">前日の結果</span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      </summary>
      <div id="yesterday-games" style="margin-top:10px;"><div class="spinner"></div></div>
    </details>
  `;

  wireGameCardTaps(container);
  wireTriviaRefresh(container);
  wireStandingsLink(container);
  renderTodayStats(container.querySelector('#today-stats-section'));

  const todayJst = toJstDateString();
  const yesterdayJst = addDaysToDateString(todayJst, -1);

  // 試合カードを描く前にシリーズ情報を用意する。日程が無い時期は null のままで、
  // レギュラーシーズン中の表示はこれまでと変わらない。
  bracket = await loadBracket();

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
  container.querySelectorAll('.game-card[data-gamepk]').forEach((btn) => {
    btn.onclick = () => {
      openGameSheet(Number(btn.dataset.gamepk));
    };
  });
}

function renderTriviaCard() {
  currentTrivia = pickTrivia(currentTrivia ? currentTrivia.text : null);
  return `
    <div class="trivia-card">
      <span class="trivia-tag">${currentTrivia.category}</span>
      ${currentTrivia.text}
    </div>
  `;
}

// ホームから順位表へ移る導線。app.js の navigate を直接呼ぶと循環インポートになるため、
// ボトムナビの該当ボタンを押したことにして画面遷移させる。
function wireStandingsLink(container) {
  const btn = container.querySelector('#go-standings');
  if (!btn) return;
  btn.onclick = () => {
    const navBtn = document.querySelector('.nav-btn[data-route="standings"]');
    if (navBtn) navBtn.click();
  };
}

function wireTriviaRefresh(container) {
  const btn = container.querySelector('#trivia-refresh');
  if (!btn) return;
  btn.onclick = () => {
    const wrap = container.querySelector('#trivia-wrap');
    if (wrap) wrap.innerHTML = renderTriviaCard();
  };
}
