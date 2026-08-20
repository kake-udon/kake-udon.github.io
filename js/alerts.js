// お知らせ画面：お気に入り投手の次回先発予定・お気に入り野手の本塁打・
// お気に入りチームの試合予定をまとめて表示する。
import { getFavorites } from './db.js';
import {
  getPlayerDetail, getTeamSchedule, getGamesForJstDate, getGamePlayByPlay,
  toJstDateString, addDaysToDateString, formatJstTime, formatJstDateLabel, currentSeasonYear,
} from './api.js';
import { teamName, teamShort, teamColor } from './teams.js';
import { openGameSheet } from './game-sheet.js';
import { openPlayerSheet } from './player-sheet.js';
import { isSupported, getPermissionState, getSubscription, enableNotifications, disableNotifications } from './notifications.js';

const SCHEDULE_LOOKAHEAD_DAYS = 10;

function opponentSide(game, teamId) {
  const isHome = game.teams.home.team.id === teamId;
  return { self: isHome ? game.teams.home : game.teams.away, opponent: isHome ? game.teams.away : game.teams.home, isHome };
}

// お気に入り選手（投手・野手）のプロフィールをまとめて取得する
async function loadFavoritePlayers(favorites) {
  const seasonYear = currentSeasonYear();
  const favPlayers = favorites.filter((f) => f.type === 'player');
  const results = await Promise.all(favPlayers.map(async (fav) => {
    try {
      const { person } = await getPlayerDetail(fav.id, seasonYear);
      return { fav, person };
    } catch (e) {
      return { fav, person: null };
    }
  }));
  return results.filter((r) => r.person && r.person.currentTeam);
}

// お気に入り投手の次回先発予定
async function loadPitcherStarts(players) {
  const pitchers = players.filter((r) => {
    const abbr = r.person.primaryPosition && r.person.primaryPosition.abbreviation;
    return abbr === 'P' || abbr === 'TWP';
  });
  if (!pitchers.length) return { html: '', empty: 'お気に入りの投手が登録されていません。' };

  const today = toJstDateString();
  const endDate = addDaysToDateString(today, SCHEDULE_LOOKAHEAD_DAYS);

  const entries = [];
  await Promise.all(pitchers.map(async ({ fav, person }) => {
    try {
      const teamId = person.currentTeam.id;
      const { games } = await getTeamSchedule(teamId, today, endDate);
      const upcoming = games.find((g) => {
        if (g.status.abstractGameState === 'Final') return false;
        const { self } = opponentSide(g, teamId);
        return self.probablePitcher && self.probablePitcher.id === fav.id;
      });
      if (upcoming) {
        const { opponent, isHome } = opponentSide(upcoming, teamId);
        entries.push({ gameDate: upcoming.gameDate, personId: fav.id, html: `
          <div class="status-row">
            <span class="player-row-name">${person.fullName}</span>
            <span class="game-time">${teamShort(teamId)}</span>
          </div>
          <div class="today-stat-line">${formatJstDateLabel(upcoming.gameDate)} ${formatJstTime(upcoming.gameDate)} ${isHome ? 'vs' : '@'} ${teamName(opponent.team.id)} に先発予定</div>
        ` });
      }
    } catch (e) {
      // このお気に入り投手の予定は取得できなかったため、次回に持ち越す
    }
  }));

  entries.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  if (!entries.length) return { html: '', empty: '現在発表されている先発予定はありません。' };

  const html = entries.map((e) => `<button class="game-card" data-personid="${e.personId}">${e.html}</button>`).join('');
  return { html: `<div class="scoreboard-list">${html}</div>`, empty: '' };
}

// お気に入り野手の本塁打（本日・前日の試合から）
async function loadBatterHomeRuns(players) {
  const batters = players.filter((r) => {
    const abbr = r.person.primaryPosition && r.person.primaryPosition.abbreviation;
    return abbr !== 'P';
  });
  if (!batters.length) return { html: '', empty: 'お気に入りの野手が登録されていません。' };

  const today = toJstDateString();
  const yesterday = addDaysToDateString(today, -1);
  const [{ games: todayGames }, { games: yesterdayGames }] = await Promise.all([
    getGamesForJstDate(today),
    getGamesForJstDate(yesterday),
  ]);
  const candidateGames = [...todayGames, ...yesterdayGames];

  const pbpCache = new Map();
  const getPbp = async (gamePk) => {
    if (!pbpCache.has(gamePk)) {
      pbpCache.set(gamePk, getGamePlayByPlay(gamePk).then((r) => r.data).catch(() => null));
    }
    return pbpCache.get(gamePk);
  };

  const entries = [];
  await Promise.all(batters.map(async ({ fav, person }) => {
    const teamId = person.currentTeam.id;
    const game = candidateGames.find((g) => g.teams.away.team.id === teamId || g.teams.home.team.id === teamId);
    if (!game || game.status.abstractGameState === 'Preview') return;
    try {
      const playByPlay = await getPbp(game.gamePk);
      if (!playByPlay) return;
      const hrPlays = (playByPlay.allPlays || []).filter((p) => p.result && p.result.eventType === 'home_run' && p.matchup && p.matchup.batter && p.matchup.batter.id === fav.id);
      if (!hrPlays.length) return;
      const { opponent, isHome } = opponentSide(game, teamId);
      entries.push({ gameDate: game.gameDate, personId: fav.id, html: `
        <div class="status-row">
          <span class="player-row-name">${person.fullName}</span>
          <span class="game-time">${teamShort(teamId)}</span>
        </div>
        <div class="today-stat-line">${formatJstDateLabel(game.gameDate)} ${isHome ? 'vs' : '@'} ${teamName(opponent.team.id)}</div>
        <div class="pa-chip-row"><span class="pa-chip scoring">本塁打${hrPlays.length > 1 ? ` ×${hrPlays.length}` : ''}</span></div>
      ` });
    } catch (e) {
      // このお気に入り野手の試合結果は取得できなかったため、次回に持ち越す
    }
  }));

  entries.sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  if (!entries.length) return { html: '', empty: '直近の本塁打はありません。' };

  const html = entries.map((e) => `<button class="game-card" data-personid="${e.personId}">${e.html}</button>`).join('');
  return { html: `<div class="scoreboard-list">${html}</div>`, empty: '' };
}

// お気に入りチームの試合予定・開始時間
async function loadTeamSchedules(favTeamIds) {
  if (!favTeamIds.length) return { html: '', empty: 'お気に入りチームが登録されていません。' };

  const today = toJstDateString();
  const endDate = addDaysToDateString(today, SCHEDULE_LOOKAHEAD_DAYS);

  const perTeam = await Promise.all(favTeamIds.map(async (teamId) => {
    try {
      const { games } = await getTeamSchedule(teamId, today, endDate);
      const upcoming = games.filter((g) => g.status.abstractGameState !== 'Final').slice(0, 3);
      return { teamId, upcoming };
    } catch (e) {
      return { teamId, upcoming: [] };
    }
  }));

  const sections = perTeam
    .filter((t) => t.upcoming.length)
    .map(({ teamId, upcoming }) => {
      const rows = upcoming.map((g) => {
        const { opponent, isHome } = opponentSide(g, teamId);
        const started = g.status.abstractGameState === 'Live';
        return `
          <button class="game-card" data-gamepk="${g.gamePk}">
            <div class="status-row">
              <span class="player-row-name">${formatJstDateLabel(g.gameDate)}${started ? '（試合中）' : ''}</span>
              <span class="game-time">${started ? '' : formatJstTime(g.gameDate)}</span>
            </div>
            <div class="today-stat-line">${isHome ? 'vs' : '@'} ${teamName(opponent.team.id)}</div>
          </button>
        `;
      }).join('');
      return `
        <div class="box-team-section">
          <div class="box-team-header"><span class="team-dot" style="background:${teamColor(teamId)}"></span>${teamName(teamId)}</div>
          <div class="scoreboard-list">${rows}</div>
        </div>
      `;
    });

  if (!sections.length) return { html: '', empty: '予定されている試合はありません。' };
  return { html: sections.join(''), empty: '' };
}

function wireTapTargets(container) {
  container.querySelectorAll('[data-gamepk]').forEach((el) => {
    el.onclick = () => openGameSheet(Number(el.dataset.gamepk));
  });
  container.querySelectorAll('[data-personid]').forEach((el) => {
    el.onclick = () => openPlayerSheet(Number(el.dataset.personid));
  });
}

async function loadSection(container, sectionId, loader) {
  const target = container.querySelector(`#${sectionId}`);
  if (!target) return;
  try {
    const { html, empty } = await loader();
    const targetNow = container.querySelector(`#${sectionId}`);
    if (!targetNow) return;
    targetNow.innerHTML = html || `<div class="empty-state">${empty}</div>`;
    wireTapTargets(targetNow);
  } catch (e) {
    const targetNow = container.querySelector(`#${sectionId}`);
    if (targetNow) targetNow.innerHTML = `<div class="empty-state">情報を取得できませんでした。</div>`;
  }
}

// 通知設定：対応状況・許可状態に応じてトグルを表示し、有効/無効の切り替えを行う
async function renderNotificationSection(container, favTeamIds) {
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
        await enableNotifications(favTeamIds);
      }
      renderNotificationSection(container, favTeamIds);
    } catch (e) {
      if (subLabel) subLabel.textContent = e.message || '通知設定の変更に失敗しました';
      btn.disabled = false;
    }
  };
}

export async function renderAlerts(container) {
  container.innerHTML = `
    <div class="section-title">通知設定</div>
    <div id="notification-section"><div class="spinner"></div></div>
    <div class="section-title" style="margin-top:22px;">お気に入り投手の先発予定</div>
    <div id="alerts-pitchers"><div class="spinner"></div></div>
    <div class="section-title" style="margin-top:22px;">お気に入り野手の本塁打</div>
    <div id="alerts-homeruns"><div class="spinner"></div></div>
    <div class="section-title" style="margin-top:22px;">お気に入りチームの試合予定</div>
    <div id="alerts-schedule"><div class="spinner"></div></div>
  `;

  const favorites = await getFavorites();
  const favTeamIds = favorites.filter((f) => f.type === 'team').map((f) => f.id);
  const players = await loadFavoritePlayers(favorites);

  renderNotificationSection(container, favTeamIds);

  await Promise.all([
    loadSection(container, 'alerts-pitchers', () => loadPitcherStarts(players)),
    loadSection(container, 'alerts-homeruns', () => loadBatterHomeRuns(players)),
    loadSection(container, 'alerts-schedule', () => loadTeamSchedules(favTeamIds)),
  ]);
}
