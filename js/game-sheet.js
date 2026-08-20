// 試合詳細ボトムシート：スコアボード（ラインスコア）と打席ごとの結果
import { getGameSummary, getGameLinescore, getGamePlayByPlay, formatJstTime, formatJstDateLabel } from './api.js';
import { teamName, teamShort, teamColor } from './teams.js';

// MLB Stats APIの result.event（英語）を日本語の短いラベルに変換する。
// 未登録のイベントは英語表記のままフォールバックする。
const EVENT_JA = {
  'Single': '単打',
  'Double': '二塁打',
  'Triple': '三塁打',
  'Home Run': '本塁打',
  'Walk': '四球',
  'Intent Walk': '敬遠',
  'Hit By Pitch': '死球',
  'Strikeout': '三振',
  'Strikeout Double Play': '三振（併殺)',
  'Field Error': '失策',
  'Fielders Choice': '野選',
  'Fielders Choice Out': '野選（アウト）',
  'Forceout': 'フォースアウト',
  'Grounded Into DP': 'ゴロ併殺打',
  'Double Play': '併殺',
  'Triple Play': '三重殺',
  'Sac Bunt': '犠打',
  'Sac Fly': '犠飛',
  'Sac Fly Double Play': '犠飛（併殺）',
  'Flyout': 'フライアウト',
  'Groundout': 'ゴロアウト',
  'Lineout': 'ライナーアウト',
  'Pop Out': 'ポップアウト',
  'Bunt Groundout': 'バントゴロ',
  'Bunt Pop Out': 'バントポップ',
  'Bunt Lineout': 'バントライナー',
  'Runner Out': '走塁アウト',
  'Pickoff': '牽制アウト',
  'Wild Pitch': '暴投',
  'Passed Ball': '捕逸',
  'Balk': 'ボーク',
  'Catcher Interference': '捕手妨害',
  'Batter Interference': '打者妨害',
};

function translateEvent(event) {
  if (!event) return '';
  if (EVENT_JA[event]) return EVENT_JA[event];
  if (event.startsWith('Caught Stealing')) return '盗塁死';
  if (event.startsWith('Pickoff Caught Stealing')) return '牽制盗塁死';
  if (event.startsWith('Stolen Base')) return '盗塁';
  return event;
}

function statusLabel(game) {
  const state = game.status.abstractGameState;
  if (state === 'Final') return game.status.detailedState === 'Postponed' ? '順延' : '試合終了';
  if (state === 'Live') return 'LIVE';
  return '試合前';
}

function renderHeader(game) {
  const away = game.teams.away;
  const home = game.teams.home;
  const isFinal = game.status.abstractGameState === 'Final';
  const started = game.status.abstractGameState !== 'Preview';
  const awayScore = started ? (away.score ?? 0) : null;
  const homeScore = started ? (home.score ?? 0) : null;
  const awayWin = isFinal && awayScore > homeScore;
  const homeWin = isFinal && homeScore > awayScore;

  return `
    <div class="game-sheet-header">
      <div class="status-pill ${isFinal ? 'final' : started ? 'live' : 'scheduled'}">${statusLabel(game)}</div>
      <div class="game-sheet-date">${formatJstDateLabel(game.gameDate)} ${formatJstTime(game.gameDate)}${!started ? ' 開始' : ''}</div>
      <div class="game-sheet-matchup">
        <div class="game-sheet-team">
          <span class="team-dot" style="background:${teamColor(away.team.id)}"></span>
          <span class="team-label ${awayWin ? 'winner' : isFinal ? 'loser' : ''}">${teamName(away.team.id)}</span>
          ${awayScore !== null ? `<span class="score-digit ${isFinal && !awayWin ? 'dim' : ''}">${awayScore}</span>` : ''}
        </div>
        <div class="game-sheet-team">
          <span class="team-dot" style="background:${teamColor(home.team.id)}"></span>
          <span class="team-label ${homeWin ? 'winner' : isFinal ? 'loser' : ''}">${teamName(home.team.id)}</span>
          ${homeScore !== null ? `<span class="score-digit ${isFinal && !homeWin ? 'dim' : ''}">${homeScore}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderLinescore(linescore, game) {
  const innings = linescore.innings || [];
  if (!innings.length) return '';
  const awayId = game.teams.away.team.id;
  const homeId = game.teams.home.team.id;
  const totals = linescore.teams || {};

  const inningHeaders = innings.map((inn) => `<th>${inn.num}</th>`).join('');
  const awayCells = innings.map((inn) => `<td>${inn.away ? (inn.away.runs ?? '-') : '-'}</td>`).join('');
  const homeCells = innings.map((inn) => `<td>${inn.home ? (inn.home.runs ?? '-') : '-'}</td>`).join('');

  return `
    <div class="linescore-scroll">
      <table class="linescore-table">
        <thead>
          <tr><th class="linescore-team-col">チーム</th>${inningHeaders}<th>R</th><th>H</th><th>E</th></tr>
        </thead>
        <tbody>
          <tr>
            <td class="linescore-team-col"><span class="linescore-team-inner"><span class="team-dot" style="background:${teamColor(awayId)}"></span>${teamShort(awayId)}</span></td>
            ${awayCells}
            <td class="linescore-total">${totals.away ? totals.away.runs : '-'}</td>
            <td>${totals.away ? totals.away.hits : '-'}</td>
            <td>${totals.away ? totals.away.errors : '-'}</td>
          </tr>
          <tr>
            <td class="linescore-team-col"><span class="linescore-team-inner"><span class="team-dot" style="background:${teamColor(homeId)}"></span>${teamShort(homeId)}</span></td>
            ${homeCells}
            <td class="linescore-total">${totals.home ? totals.home.runs : '-'}</td>
            <td>${totals.home ? totals.home.hits : '-'}</td>
            <td>${totals.home ? totals.home.errors : '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderPlayByPlay(playByPlay) {
  const plays = (playByPlay.allPlays || []).filter((p) => p.result && p.result.type === 'atBat');
  if (!plays.length) return '';

  let lastHalf = null;
  const rows = plays.map((play) => {
    const half = `${play.about.inning}-${play.about.halfInning}`;
    let inningHeader = '';
    if (half !== lastHalf) {
      lastHalf = half;
      const halfLabel = play.about.halfInning === 'top' ? '表' : '裏';
      inningHeader = `<div class="pbp-inning-header">${play.about.inning}回${halfLabel}</div>`;
    }
    const batter = play.matchup && play.matchup.batter ? play.matchup.batter.fullName : '';
    const pitcher = play.matchup && play.matchup.pitcher ? play.matchup.pitcher.fullName : '';
    const eventJa = translateEvent(play.result.event);
    return `
      ${inningHeader}
      <div class="pbp-play ${play.about.isScoringPlay ? 'scoring' : ''}">
        <div class="pbp-play-top">
          <span class="pbp-batter">${batter}</span>
          <span class="pbp-event">${eventJa}</span>
        </div>
        <div class="pbp-play-desc">${play.result.description || ''}</div>
        <div class="pbp-play-pitcher">投手: ${pitcher}</div>
      </div>
    `;
  }).join('');

  return `
    <details class="collapsible" id="pbp-collapsible" style="margin-top:18px;">
      <summary>
        <span class="section-title" style="margin:0;">打席ごとの結果 <span class="count">${plays.length}打席</span></span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      </summary>
      <div class="pbp-list" style="margin-top:10px;">${rows}</div>
    </details>
  `;
}

export async function openGameSheet(gamePk) {
  const root = document.getElementById('sheet-root');

  root.innerHTML = `
    <div class="sheet-backdrop" id="sheet-backdrop">
      <div class="sheet">
        <div class="sheet-header">
          <h2>試合詳細</h2>
          <div class="sheet-header-actions">
            <button class="sheet-close" id="sheet-close">×</button>
          </div>
        </div>
        <div id="game-sheet-body"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('sheet-close').onclick = close;
  document.getElementById('sheet-backdrop').onclick = (e) => {
    if (e.target.id === 'sheet-backdrop') close();
  };

  try {
    const { game } = await getGameSummary(gamePk);
    if (!game) throw new Error('試合情報が見つかりませんでした');

    const body = document.getElementById('game-sheet-body');
    if (!body) return; // シートが既に閉じられている場合

    const started = game.status.abstractGameState !== 'Preview';
    let html = renderHeader(game);

    if (!started) {
      const awayProbable = game.teams.away.probablePitcher;
      const homeProbable = game.teams.home.probablePitcher;
      html += `
        <div class="empty-state" style="margin-top:14px;">
          この試合はまだ始まっていません。${awayProbable || homeProbable ? '<br>予告先発：' : ''}
          ${awayProbable ? `${teamShort(game.teams.away.team.id)} ${awayProbable.fullName}` : ''}
          ${awayProbable && homeProbable ? ' / ' : ''}
          ${homeProbable ? `${teamShort(game.teams.home.team.id)} ${homeProbable.fullName}` : ''}
        </div>
      `;
      body.innerHTML = html;
      return;
    }

    body.innerHTML = html + `<div class="spinner"></div>`;

    const [linescoreRes, playByPlayRes] = await Promise.all([
      getGameLinescore(gamePk),
      getGamePlayByPlay(gamePk),
    ]);

    const bodyNow = document.getElementById('game-sheet-body');
    if (!bodyNow) return;

    html += renderLinescore(linescoreRes.data, game);
    html += renderPlayByPlay(playByPlayRes.data);
    bodyNow.innerHTML = html;
  } catch (e) {
    const body = document.getElementById('game-sheet-body');
    if (body) body.innerHTML = `<div class="empty-state">試合詳細を取得できませんでした。</div>`;
  }
}
