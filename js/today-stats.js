// ホーム画面の「お気に入り選手の今日の成績」コーナー：
// 野手は本日の打席結果を、投手は投球回・球数・被安打などを一覧表示する。
import { getGamesForJstDate, toJstDateString, getPlayerDetail, getGameBoxscore, getGamePlayByPlay, currentSeasonYear } from './api.js';
import { teamShort } from './teams.js';
import { getFavorites } from './db.js';
import { openPlayerSheet } from './player-sheet.js';
import { translateEvent } from './game-sheet.js';

// ボックススコアから該当選手の成績行と所属チームIDを探す
function findBoxscorePlayer(boxscore, personId) {
  if (!boxscore || !boxscore.teams) return null;
  const sides = [boxscore.teams.away, boxscore.teams.home];
  for (const side of sides) {
    const p = side.players && side.players[`ID${personId}`];
    if (p) return { player: p, teamId: side.team.id };
  }
  return null;
}

// 打者：本日の各打席の結果をチップで並べる
function renderBattingLine(personId, playByPlay, battingStat) {
  const plays = ((playByPlay && playByPlay.allPlays) || []).filter(
    (p) => p.result && p.result.type === 'atBat' && p.matchup && p.matchup.batter && p.matchup.batter.id === personId
  );
  if (!plays.length) return '';

  const chips = plays.map((p) => `<span class="pa-chip ${p.about.isScoringPlay ? 'scoring' : ''}">${translateEvent(p.result.event)}</span>`).join('');
  const hits = battingStat && typeof battingStat.hits === 'number' ? battingStat.hits : plays.filter((p) => ['single', 'double', 'triple', 'home_run'].includes(p.result.eventType)).length;
  const atBats = battingStat && typeof battingStat.atBats === 'number' ? battingStat.atBats : plays.length;
  const rbi = battingStat ? battingStat.rbi : null;

  return `
    <div class="today-stat-line">${hits}安打 ${atBats}打数${rbi ? ` ・ 打点${rbi}` : ''}</div>
    <div class="pa-chip-row">${chips}</div>
  `;
}

// 投手：投球回・球数・被安打などを数字グリッドで表示
function renderPitchingLine(stat) {
  const ip = stat.inningsPitched || '0.0';
  const pitches = stat.numberOfPitches ?? stat.pitchesThrown ?? '-';
  return `
    <div class="today-stat-line">${ip}回 ${pitches}球</div>
    <div class="standing-summary-stats">
      <div><span class="stat-num">${stat.hits ?? 0}</span><span class="stat-label">被安打</span></div>
      <div><span class="stat-num">${stat.runs ?? 0}</span><span class="stat-label">失点</span></div>
      <div><span class="stat-num">${stat.baseOnBalls ?? 0}</span><span class="stat-label">四球</span></div>
      <div><span class="stat-num">${stat.strikeOuts ?? 0}</span><span class="stat-label">奪三振</span></div>
    </div>
  `;
}

function renderPlayerCard(fav, person, game, gameData) {
  const name = person ? person.fullName : fav.name;
  const boxInfo = gameData ? findBoxscorePlayer(gameData.boxscore, fav.id) : null;
  const teamLabel = boxInfo ? teamShort(boxInfo.teamId) : '';

  let body = '';
  if (boxInfo) {
    const battingStat = boxInfo.player.stats && boxInfo.player.stats.batting;
    const pitchingStat = boxInfo.player.stats && boxInfo.player.stats.pitching;
    if (battingStat && (battingStat.plateAppearances > 0 || battingStat.atBats > 0)) {
      body += renderBattingLine(fav.id, gameData.playByPlay, battingStat);
    }
    if (pitchingStat && pitchingStat.inningsPitched && pitchingStat.inningsPitched !== '0.0') {
      body += renderPitchingLine(pitchingStat);
    }
  }
  if (!body) {
    body = `<div class="empty-state" style="padding:14px;margin:0;">本日はまだ出場していません。</div>`;
  }

  return `
    <button class="game-card" data-personid="${fav.id}">
      <div class="status-row">
        <div class="team-line"><span class="player-row-name">${name}</span></div>
        <span class="game-time">${teamLabel}</span>
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

export async function renderTodayStats(container) {
  const favorites = (await getFavorites()).filter((f) => f.type === 'player');
  if (!favorites.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="section-title">お気に入り選手の今日の成績</div>
    <div id="today-stats-body"><div class="spinner"></div></div>
  `;
  const body = () => container.querySelector('#today-stats-body');

  try {
    const todayJst = toJstDateString();
    const { games } = await getGamesForJstDate(todayJst);
    if (!games.length) {
      const b = body();
      if (b) b.innerHTML = `<div class="empty-state">本日の試合がありません。</div>`;
      return;
    }

    const seasonYear = currentSeasonYear();
    const playerDetails = await Promise.all(favorites.map(async (fav) => {
      try {
        const { person } = await getPlayerDetail(fav.id, seasonYear);
        return { fav, person };
      } catch (e) {
        return { fav, person: null };
      }
    }));

    const gameByTeamId = new Map();
    games.forEach((g) => {
      gameByTeamId.set(g.teams.away.team.id, g);
      gameByTeamId.set(g.teams.home.team.id, g);
    });

    const relevant = playerDetails
      .map(({ fav, person }) => {
        const teamId = person && person.currentTeam ? person.currentTeam.id : null;
        const game = teamId ? gameByTeamId.get(teamId) : null;
        return { fav, person, game };
      })
      .filter((r) => r.game);

    if (!relevant.length) {
      const b = body();
      if (b) b.innerHTML = `<div class="empty-state">本日出場予定のお気に入り選手はいません。</div>`;
      return;
    }

    // 同じ試合に複数のお気に入り選手がいる場合も、試合ごとのデータ取得は1回で済ませる
    const gamePks = [...new Set(relevant.map((r) => r.game.gamePk))];
    const dataByGamePk = new Map();
    await Promise.all(gamePks.map(async (gamePk) => {
      try {
        const [boxscoreRes, pbpRes] = await Promise.all([
          getGameBoxscore(gamePk),
          getGamePlayByPlay(gamePk),
        ]);
        dataByGamePk.set(gamePk, { boxscore: boxscoreRes.data, playByPlay: pbpRes.data });
      } catch (e) {
        dataByGamePk.set(gamePk, null);
      }
    }));

    const cards = relevant
      .map(({ fav, person, game }) => renderPlayerCard(fav, person, game, dataByGamePk.get(game.gamePk)))
      .join('');

    const b = body();
    if (!b) return; // 画面が既に切り替わっている場合
    b.innerHTML = `<div class="scoreboard-list">${cards}</div>`;
    wireTapTargets(b);
  } catch (e) {
    const b = body();
    if (b) b.innerHTML = `<div class="empty-state">今日の成績を取得できませんでした。</div>`;
  }
}
