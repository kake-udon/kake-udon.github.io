import { getGamesForJstDate, addDaysToDateString, toJstDateString, formatJstTime, formatJstDateLabel } from './api.js';
import { teamName, teamColor, TEAMS } from './teams.js';
import { getFavorites, toggleFavorite } from './db.js';
import { openGameSheet } from './game-sheet.js';
import { pickTrivia } from './trivia.js';
import { isSupported, getPermissionState, getSubscription, enableNotifications, disableNotifications, syncFavoriteTeams } from './notifications.js';
import { renderTodayStats } from './today-stats.js';

let favoriteTeamIds = new Set();
let currentTrivia = null;

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

function renderGameList(games) {
  if (!games.length) {
    return `<div class="empty-state">この日は試合がありません。</div>`;
  }
  return `<div class="scoreboard-list">${sortGamesByFavorite(games).map(renderGameCard).join('')}</div>`;
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
    <div class="section-title">通知設定</div>
    <div id="notification-section"><div class="spinner"></div></div>
    <div class="section-title">本日の試合 <span class="count" id="today-count"></span></div>
    <div id="today-games"><div class="spinner"></div></div>
    <div id="today-stats-section" style="margin-top:22px;"></div>
    <details class="collapsible" style="margin-top:22px;">
      <summary>
        <span class="section-title" style="margin:0;">前日の結果</span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      </summary>
      <div id="yesterday-games" style="margin-top:10px;"><div class="spinner"></div></div>
    </details>
    <div class="section-title">豆知識
      <button id="trivia-refresh" class="trivia-refresh-btn" aria-label="別の豆知識を見る">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.6-6.36"/><path d="M21 4v5h-5"/></svg>
      </button>
    </div>
    <div id="trivia-wrap">${renderTriviaCard()}</div>
  `;

  wireTeamPicker(container);
  wireGameCardTaps(container);
  wireTriviaRefresh(container);
  renderNotificationSection(container);
  renderTodayStats(container.querySelector('#today-stats-section'));

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
  container.querySelectorAll('.game-card[data-gamepk]').forEach((btn) => {
    btn.onclick = () => {
      openGameSheet(Number(btn.dataset.gamepk));
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
      syncFavoriteTeams(favoriteTeamIds);
    };
  });
}

// 通知設定：対応状況・許可状態に応じてトグルを表示し、有効/無効の切り替えを行う
async function renderNotificationSection(container) {
  const wrap = container.querySelector('#notification-section');
  if (!wrap) return;

  if (!isSupported()) {
    wrap.innerHTML = `<div class="empty-state">お使いのブラウザは通知に対応していません。</div>`;
    return;
  }

  if (getPermissionState() === 'denied') {
    wrap.innerHTML = `<div class="empty-state">通知がブラウザでブロックされています。ブラウザの設定から許可してください。</div>`;
    return;
  }

  const subscription = await getSubscription();
  const wrapNow = container.querySelector('#notification-section');
  if (!wrapNow) return; // 取得中に画面が切り替わった場合
  const enabled = !!subscription;

  wrapNow.innerHTML = `
    <div class="notify-toggle-row">
      <div>
        <div class="notify-toggle-label">毎日18時に試合結果と次戦予定をお知らせ</div>
        <div class="notify-toggle-sub" id="notify-toggle-sub">${enabled ? '通知は有効です' : 'お気に入りチームの情報をプッシュ通知で受け取れます'}</div>
      </div>
      <button id="notify-toggle-btn" class="toggle-switch ${enabled ? 'on' : ''}" role="switch" aria-checked="${enabled}" aria-label="通知の有効・無効を切り替え">
        <span class="toggle-knob"></span>
      </button>
    </div>
  `;

  const btn = wrapNow.querySelector('#notify-toggle-btn');
  btn.onclick = async () => {
    btn.disabled = true;
    const subLabel = wrapNow.querySelector('#notify-toggle-sub');
    try {
      if (enabled) {
        await disableNotifications();
      } else {
        if (subLabel) subLabel.textContent = '設定中…';
        await enableNotifications(favoriteTeamIds);
      }
      renderNotificationSection(container);
    } catch (e) {
      if (subLabel) subLabel.textContent = e.message || '通知設定の変更に失敗しました';
      btn.disabled = false;
    }
  };
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

function wireTriviaRefresh(container) {
  const btn = container.querySelector('#trivia-refresh');
  if (!btn) return;
  btn.onclick = () => {
    const wrap = container.querySelector('#trivia-wrap');
    if (wrap) wrap.innerHTML = renderTriviaCard();
  };
}
