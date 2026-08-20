// 試合詳細ボトムシート：スコアボード（ラインスコア）と打席ごとの結果
import { getGameSummary, getGameLinescore, getGamePlayByPlay, formatJstTime, formatJstDateLabel } from './api.js';
import { teamName, teamShort, teamColor } from './teams.js';

// MLB Stats APIの result.event（英語）を日本語の短いラベルに変換する。
// 未登録のイベントは英語表記のままフォールバックする。
const EVENT_JA = {
  'Single': '一塁打',
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

export function translateEvent(event) {
  if (!event) return '';
  if (EVENT_JA[event]) return EVENT_JA[event];
  if (event.startsWith('Caught Stealing')) return '盗塁死';
  if (event.startsWith('Pickoff Caught Stealing')) return '牽制盗塁死';
  if (event.startsWith('Stolen Base')) return '盗塁';
  return event;
}

// 打球の軌道（trajectory）・守備位置番号（location）の日本語表記
const TRAJECTORY_JA = { ground_ball: 'ゴロ', line_drive: 'ライナー', fly_ball: 'フライ', popup: 'ポップフライ' };
const LOCATION_JA = { '1': 'ピッチャー', '2': 'キャッチャー', '3': 'ファースト', '4': 'セカンド', '5': 'サード', '6': 'ショート', '7': 'レフト', '8': 'センター', '9': 'ライト' };

// そのプレーの打球データ（軌道・守備位置・飛距離）をplayEventsから探す
function findHitData(play) {
  const events = play.playEvents || [];
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].hitData) return events[i].hitData;
  }
  return null;
}

// そのプレーで生還した走者（打者本人を除く）の名前一覧
function scoringRunnerNames(play) {
  const batterId = play.matchup && play.matchup.batter ? play.matchup.batter.id : null;
  return (play.runners || [])
    .filter((r) => r.details && r.details.isScoringEvent && r.details.runner && r.details.runner.id !== batterId)
    .map((r) => r.details.runner.fullName);
}

// MLB Stats APIの英語のプレー詳細（result.description）の代わりに、
// 打者名・打球データ・生還した走者などの構造化データから日本語の説明文を組み立てる。
// 選手名は他画面と同様に原語表記のまま扱う（機械翻訳による表記揺れを避けるため）。
function translateDescription(play) {
  const batter = play.matchup && play.matchup.batter ? play.matchup.batter.fullName : '';
  const eventType = play.result.eventType || '';
  const hit = findHitData(play);
  const trajectoryJa = hit ? (TRAJECTORY_JA[hit.trajectory] || '') : '';
  const locationJa = hit && hit.location ? (LOCATION_JA[hit.location] || '') : '';
  const scoreNote = scoringRunnerNames(play).map((name) => `${name} が 得点。`).join('');

  switch (eventType) {
    case 'single':
    case 'double':
    case 'triple': {
      const place = locationJa ? `${locationJa} への` : '';
      const traj = trajectoryJa ? `${trajectoryJa} で` : '';
      return `${batter} が ${place}${traj}${translateEvent(play.result.event)}。${scoreNote}`;
    }
    case 'home_run': {
      const dist = hit && hit.totalDistance ? `（推定${Math.round(hit.totalDistance)}フィート）` : '';
      return `${batter} が 本塁打${dist}。${scoreNote}`;
    }
    case 'walk':
      return `${batter} が 四球で出塁。`;
    case 'intent_walk':
      return `${batter} が 申告敬遠で出塁。`;
    case 'hit_by_pitch':
      return `${batter} が 死球で出塁。`;
    case 'strikeout':
    case 'strikeout_double_play': {
      const lastPitch = [...(play.playEvents || [])].reverse().find((e) => e.isPitch);
      const looking = lastPitch && lastPitch.details && lastPitch.details.call && lastPitch.details.call.code === 'C';
      return `${batter} が ${looking ? '見逃し三振' : '空振り三振'}。`;
    }
    case 'field_out':
    case 'force_out':
    case 'forceout': {
      const desc = locationJa && trajectoryJa ? `${locationJa}${trajectoryJa}` : (locationJa || trajectoryJa || '');
      return `${batter} が ${desc ? `${desc}で` : ''}アウト。`;
    }
    case 'grounded_into_double_play':
    case 'double_play':
      return `${batter} が ${locationJa}${trajectoryJa || 'ゴロ'}で併殺。`;
    case 'triple_play':
      return `${batter} が ${locationJa}${trajectoryJa || 'ゴロ'}で三重殺。`;
    case 'sac_bunt':
      return `${batter} が 犠打。${scoreNote}`;
    case 'sac_fly':
    case 'sac_fly_double_play':
      return `${batter} が ${locationJa} への犠飛。${scoreNote}`;
    case 'field_error':
      return `${batter} の打球を ${locationJa} が失策。`;
    case 'fielders_choice':
    case 'fielders_choice_out':
      return `${batter} が 野選で出塁。`;
    case 'catcher_interf':
      return `${batter} が 捕手妨害で出塁。`;
    case 'batter_interference':
      return `${batter} が 打者妨害。`;
    default: {
      const eventJa = translateEvent(play.result.event);
      if (eventJa && eventJa !== play.result.event) return `${batter} が ${eventJa}。${scoreNote}`;
      return play.result.description || '';
    }
  }
}

function outsJa(outs) {
  if (outs === 0) return 'ノーアウト';
  if (outs === 1) return 'ワンアウト';
  if (outs === 2) return 'ツーアウト';
  return `${outs}アウト`;
}

// 全プレー（打席以外のアクションも含む）を時系列で辿り、各プレー開始時点の
// 走者状況（一・二・三塁）とアウト数をあらかじめ計算しておく。
// イニングの表裏が変わった時点で走者・アウトはリセットする。
function computeStateBefore(allPlays) {
  const map = new Map();
  let prevHalf = null;
  let prevInning = null;
  let prevMatchup = null;
  let prevOuts = 0;
  allPlays.forEach((play) => {
    const half = play.about.halfInning;
    const inning = play.about.inning;
    const isNewHalf = half !== prevHalf || inning !== prevInning;
    const before = isNewHalf
      ? { first: false, second: false, third: false, outs: 0 }
      : {
          first: !!(prevMatchup && prevMatchup.postOnFirst),
          second: !!(prevMatchup && prevMatchup.postOnSecond),
          third: !!(prevMatchup && prevMatchup.postOnThird),
          outs: prevOuts,
        };
    map.set(play, before);
    prevHalf = half;
    prevInning = inning;
    prevMatchup = play.matchup || null;
    prevOuts = play.count && typeof play.count.outs === 'number' ? play.count.outs : prevOuts;
  });
  return map;
}

// 打者が打席に入った時点の走者状況を示すミニダイヤモンドアイコン
// （二塁=上、一塁=右、三塁=左。塗りつぶしは走者あり）
function baseStateIcon(state) {
  const dot = (occupied) => occupied ? 'fill:var(--amber);stroke:var(--amber);' : 'fill:none;stroke:var(--chalk-dim);';
  return `
    <svg class="pbp-bases" width="18" height="16" viewBox="0 0 18 16" xmlns="http://www.w3.org/2000/svg" stroke-width="1.5">
      <rect x="6" y="0" width="6" height="6" transform="rotate(45 9 3)" style="${dot(state.second)}"/>
      <rect x="10.5" y="6" width="6" height="6" transform="rotate(45 13.5 9)" style="${dot(state.first)}"/>
      <rect x="1.5" y="6" width="6" height="6" transform="rotate(45 4.5 9)" style="${dot(state.third)}"/>
    </svg>
  `;
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

// スコアボード直下に表示する試合結果サマリー（勝敗投手・セーブ・本塁打）と、
// 打席ごとの結果セクションへのジャンプリンク
function renderResultSummary(game, playByPlay) {
  const decisions = game.decisions || {};
  const awayId = game.teams.away.team.id;
  const homeId = game.teams.home.team.id;

  const hrMap = new Map();
  ((playByPlay && playByPlay.allPlays) || []).forEach((play) => {
    if (play.result && play.result.eventType === 'home_run' && play.matchup && play.matchup.batter) {
      const batter = play.matchup.batter;
      const teamId = play.about.isTopInning ? awayId : homeId;
      const entry = hrMap.get(batter.id) || { name: batter.fullName, teamId, count: 0 };
      entry.count += 1;
      hrMap.set(batter.id, entry);
    }
  });

  const decisionParts = [];
  if (decisions.winner) decisionParts.push(`<span class="result-tag win">勝</span>${decisions.winner.fullName}`);
  if (decisions.loser) decisionParts.push(`<span class="result-tag loss">敗</span>${decisions.loser.fullName}`);
  if (decisions.save) decisionParts.push(`<span class="result-tag save">S</span>${decisions.save.fullName}`);

  const hrParts = [...hrMap.values()].map((h) => `${teamShort(h.teamId)} ${h.name}${h.count > 1 ? ` ×${h.count}` : ''}`);

  if (!decisionParts.length && !hrParts.length) return '';

  return `
    <div class="game-result-summary">
      ${decisionParts.length ? `<div class="result-row">${decisionParts.join('　')}</div>` : ''}
      ${hrParts.length ? `<div class="result-row"><span class="result-tag hr">本塁打</span>${hrParts.join('、')}</div>` : ''}
      <a class="pbp-jump-link" id="pbp-jump-link" href="#pbp-collapsible">打席ごとの結果を見る
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </a>
    </div>
  `;
}

function renderPlayByPlay(playByPlay, game) {
  const allPlays = playByPlay.allPlays || [];
  const stateBefore = computeStateBefore(allPlays);
  const plays = allPlays.filter((p) => p.result && p.result.type === 'atBat');
  if (!plays.length) return '';

  const awayId = game.teams.away.team.id;
  const homeId = game.teams.home.team.id;

  let lastHalf = null;
  const rows = plays.map((play) => {
    const half = `${play.about.inning}-${play.about.halfInning}`;
    let inningHeader = '';
    if (half !== lastHalf) {
      lastHalf = half;
      const halfLabel = play.about.halfInning === 'top' ? '表' : '裏';
      const battingTeam = teamName(play.about.isTopInning ? awayId : homeId);
      inningHeader = `<div class="pbp-inning-header">${play.about.inning}回${halfLabel}　${battingTeam}の打撃</div>`;
    }
    const batter = play.matchup && play.matchup.batter ? play.matchup.batter.fullName : '';
    const pitcher = play.matchup && play.matchup.pitcher ? play.matchup.pitcher.fullName : '';
    const eventJa = translateEvent(play.result.event);
    const before = stateBefore.get(play) || { first: false, second: false, third: false, outs: 0 };
    const count = play.count ? `${play.count.balls ?? 0}-${play.count.strikes ?? 0}` : '';
    return `
      ${inningHeader}
      <div class="pbp-play ${play.about.isScoringPlay ? 'scoring' : ''}">
        <div class="pbp-play-state">
          ${baseStateIcon(before)}
          <span class="pbp-count">${count}${count ? '、' : ''}${outsJa(before.outs)}</span>
        </div>
        <div class="pbp-play-top">
          <span class="pbp-batter">${batter}</span>
          <span class="pbp-event">${eventJa}</span>
        </div>
        <div class="pbp-play-desc">${translateDescription(play)}</div>
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
    html += renderResultSummary(game, playByPlayRes.data);
    html += renderPlayByPlay(playByPlayRes.data, game);
    bodyNow.innerHTML = html;

    const jumpLink = bodyNow.querySelector('#pbp-jump-link');
    if (jumpLink) {
      jumpLink.onclick = (e) => {
        e.preventDefault();
        const details = bodyNow.querySelector('#pbp-collapsible');
        if (details) {
          details.open = true;
          details.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
    }
  } catch (e) {
    const body = document.getElementById('game-sheet-body');
    if (body) body.innerHTML = `<div class="empty-state">試合詳細を取得できませんでした。</div>`;
  }
}
