// ポストシーズンのトーナメント表。
// getPostseasonSchedule() で取得した「試合の一覧」を、ラウンド（ワイルドカード／ディビジョン／
// リーグ優勝決定／ワールドシリーズ）ごとの「シリーズ」に畳んでから描画する。
//
// 設計上の注意：
// - スマホ縦画面が主戦場のため、横に広がる一般的なブラケット図は採らず、
//   ラウンドごとに縦に積むシリーズカードにしている。
// - シリーズの勝敗数は seriesStatus のような未確認フィールドに頼らず、
//   各試合の結果（isWinner / スコア）から数える。日程が未確定の枠も表示できるようにする。
import { LEAGUES, TEAMS, teamName, teamShort, teamColor } from './teams.js';
import { getPostseasonSchedule, currentSeasonYear, formatJstTime, formatJstDateLabel, toJstDateString } from './api.js';

// gameType は F=ワイルドカード, D=ディビジョン, L=リーグ優勝決定, W=ワールドシリーズ。
// winsNeeded は勝ち上がりに必要な勝ち数、defaultGames は最大試合数（日程が未確定のときの既定値）。
export const POSTSEASON_ROUNDS = [
  { gameType: 'F', ja: 'ワイルドカードシリーズ', shortJa: 'WC', winsNeeded: 2, defaultGames: 3 },
  { gameType: 'D', ja: 'ディビジョンシリーズ', shortJa: 'DS', winsNeeded: 3, defaultGames: 5 },
  { gameType: 'L', ja: 'リーグ優勝決定シリーズ', shortJa: 'LCS', winsNeeded: 4, defaultGames: 7 },
  { gameType: 'W', ja: 'ワールドシリーズ', shortJa: 'WS', winsNeeded: 4, defaultGames: 7 },
];

function roundOf(gameType) {
  return POSTSEASON_ROUNDS.find((r) => r.gameType === gameType) || null;
}

function isFinalGame(game) {
  const st = game && game.status;
  if (!st) return false;
  return st.abstractGameState === 'Final' || st.codedGameState === 'F' || st.codedGameState === 'O';
}

// 中止・延期など「行われなかった試合」。ポストシーズンでは「必要なら行う試合」が
// 決着によって不要になった場合もここに入る。
function isCalledOffGame(game) {
  const detailed = (game && game.status && game.status.detailedState) || '';
  return /Cancelled|Postponed|Suspended/i.test(detailed);
}

// 中止系ステータスの日本語表記（detailedState は英語で返ってくる）
function calledOffLabelJa(game) {
  const detailed = (game && game.status && game.status.detailedState) || '';
  if (/Postponed/i.test(detailed)) return '延期';
  if (/Suspended/i.test(detailed)) return 'サスペンド';
  return '行われず';
}

function teamIdOf(side) {
  const id = side && side.team && side.team.id;
  return TEAMS[id] ? Number(id) : null;
}

// 決着した試合の勝者チームID。isWinner が無い場合はスコアで判定する。
function gameWinnerId(game) {
  if (!isFinalGame(game) || isCalledOffGame(game)) return null;
  const away = (game.teams && game.teams.away) || {};
  const home = (game.teams && game.teams.home) || {};
  if (away.isWinner === true) return teamIdOf(away);
  if (home.isWinner === true) return teamIdOf(home);
  if (typeof away.score === 'number' && typeof home.score === 'number' && away.score !== home.score) {
    return away.score > home.score ? teamIdOf(away) : teamIdOf(home);
  }
  return null;
}

// 対戦が未確定の枠もまとめられるよう、両チームが分かる場合はチームIDの組で、
// 分からない場合は seriesNumber で1シリーズにまとめる。
function seriesKeyOf(game) {
  const awayId = teamIdOf(game.teams && game.teams.away);
  const homeId = teamIdOf(game.teams && game.teams.home);
  if (awayId && homeId) {
    return `${game.gameType}:${[awayId, homeId].sort((a, b) => a - b).join('-')}`;
  }
  const seriesNumber = (game.teams && game.teams.away && game.teams.away.seriesNumber) || game.seriesNumber || 0;
  return `${game.gameType}:tbd:${seriesNumber}:${game.description || game.seriesDescription || ''}`;
}

// リーグの判定。チームが決まっていれば teams.js のメタデータから、
// 未確定なら試合の説明文（"AL Division Series" など）の接頭辞から拾う。
function leagueOfSeries(gameType, teamIds, sampleGame) {
  if (gameType === 'W') return null; // ワールドシリーズは両リーグ対決
  for (const id of teamIds) {
    if (TEAMS[id]) return TEAMS[id].league;
  }
  const text = `${(sampleGame && sampleGame.description) || ''} ${(sampleGame && sampleGame.seriesDescription) || ''}`;
  if (/\bAL\b|American League/i.test(text)) return 103;
  if (/\bNL\b|National League/i.test(text)) return 104;
  return null;
}

// 1シリーズ分の集計。games は同一シリーズの試合（開始時刻順）。
function buildSeries(key, games) {
  const round = roundOf(games[0].gameType);
  const winsNeeded = round ? round.winsNeeded : 4;

  // 第1戦のホームが上位シードなので、上位シードを上の行に置く。
  const first = games[0];
  const orderedIds = [teamIdOf(first.teams && first.teams.home), teamIdOf(first.teams && first.teams.away)];
  const knownIds = orderedIds.filter(Boolean);
  // 第1戦が未確定でも、後の試合で対戦が判明していればそちらを使う。
  if (knownIds.length < 2) {
    for (const g of games) {
      const ids = [teamIdOf(g.teams && g.teams.home), teamIdOf(g.teams && g.teams.away)].filter(Boolean);
      if (ids.length === 2) {
        orderedIds[0] = ids[0];
        orderedIds[1] = ids[1];
        break;
      }
    }
  }

  const winsById = new Map();
  let playedCount = 0;
  for (const g of games) {
    const winnerId = gameWinnerId(g);
    if (!winnerId) continue;
    playedCount += 1;
    winsById.set(winnerId, (winsById.get(winnerId) || 0) + 1);
  }

  const teams = orderedIds.map((id) => ({ id, wins: id ? (winsById.get(id) || 0) : 0 }));
  const winner = teams.find((t) => t.id && t.wins >= winsNeeded) || null;
  const scheduled = games.filter((g) => !isFinalGame(g) && !isCalledOffGame(g));
  const gamesInSeries = Number(first.gamesInSeries) || (round ? round.defaultGames : games.length);

  return {
    key,
    gameType: games[0].gameType,
    round,
    leagueId: leagueOfSeries(games[0].gameType, orderedIds, first),
    teams,
    games,
    playedCount,
    gamesInSeries,
    winsNeeded,
    winnerId: winner ? winner.id : null,
    nextGame: winner ? null : (scheduled[0] || null),
    status: winner ? 'final' : (playedCount > 0 ? 'inProgress' : 'scheduled'),
  };
}

// 試合の一覧をラウンド → シリーズの入れ子に畳む。DOMには触らない純粋な算出関数。
export function buildBracket(games) {
  const bySeries = new Map();
  for (const game of games || []) {
    if (!roundOf(game.gameType)) continue; // レギュラーシーズン・エキシビションは対象外
    const key = seriesKeyOf(game);
    if (!bySeries.has(key)) bySeries.set(key, []);
    bySeries.get(key).push(game);
  }

  const rounds = POSTSEASON_ROUNDS.map((round) => {
    const series = [];
    for (const [key, list] of bySeries) {
      if (!list.length || list[0].gameType !== round.gameType) continue;
      list.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
      series.push(buildSeries(key, list));
    }
    // ア・リーグ → ナ・リーグ → リーグ不明 の順に並べる（順位表の地区表示と同じ並び）
    series.sort((a, b) => {
      const oa = a.leagueId === 103 ? 0 : a.leagueId === 104 ? 1 : 2;
      const ob = b.leagueId === 103 ? 0 : b.leagueId === 104 ? 1 : 2;
      if (oa !== ob) return oa - ob;
      const ta = a.games[0] ? new Date(a.games[0].gameDate) : 0;
      const tb = b.games[0] ? new Date(b.games[0].gameDate) : 0;
      return ta - tb;
    });
    return { round, series };
  }).filter((r) => r.series.length > 0);

  return { rounds, seriesCount: bySeries.size };
}

// 「1勝1敗」「王手」など、シリーズの現況を1行の日本語にする。
export function seriesSummaryJa(series) {
  const [a, b] = series.teams;
  if (series.status === 'scheduled') {
    return series.teams.some((t) => t.id) ? 'これから開幕' : '対戦カード未定';
  }
  const leader = a.wins >= b.wins ? a : b;
  const trailer = leader === a ? b : a;
  const record = `${leader.wins}勝${trailer.wins}敗`;
  if (series.status === 'final') {
    return `${teamShort(series.winnerId)} シリーズ突破（${record}）`;
  }
  if (a.wins === b.wins) return `${a.wins}勝${b.wins}敗のタイ`;
  if (leader.wins === series.winsNeeded - 1) {
    return `${teamShort(leader.id)} ${record}で王手`;
  }
  return `${teamShort(leader.id)} ${record}でリード`;
}

function gameWhenJa(game) {
  if (game.status && game.status.startTimeTBD) {
    return `${formatJstDateLabel(game.gameDate)} 時間未定`;
  }
  return `${formatJstDateLabel(game.gameDate)} ${formatJstTime(game.gameDate)}`;
}

function renderTeamRow(series, team) {
  if (!team.id) {
    return `<div class="series-team-row is-tbd"><span class="series-team-name">対戦相手 未定</span></div>`;
  }
  const isWinner = series.winnerId === team.id;
  const isOut = series.winnerId && !isWinner;
  const cls = ['series-team-row', isWinner ? 'is-winner' : '', isOut ? 'is-out' : ''].filter(Boolean).join(' ');
  return `
    <div class="${cls}" data-teamid="${team.id}" role="button" tabindex="0" aria-label="${teamName(team.id)}">
      <span class="team-dot" style="background:${teamColor(team.id)}"></span>
      <span class="series-team-abbr">${teamShort(team.id)}</span>
      <span class="series-team-name">${teamName(team.id)}</span>
      <span class="series-wins">${team.wins}</span>
    </div>
  `;
}

function renderGameRow(series, game, index) {
  const no = Number(game.seriesGameNumber) || index + 1;
  const away = (game.teams && game.teams.away) || {};
  const home = (game.teams && game.teams.home) || {};
  const awayId = teamIdOf(away);
  const homeId = teamIdOf(home);
  let right;
  if (isCalledOffGame(game)) {
    right = `<span class="series-game-note">${calledOffLabelJa(game)}</span>`;
  } else if (isFinalGame(game) && typeof away.score === 'number' && typeof home.score === 'number') {
    const winnerId = gameWinnerId(game);
    const awayCls = winnerId && winnerId === awayId ? 'is-win' : '';
    const homeCls = winnerId && winnerId === homeId ? 'is-win' : '';
    right = `
      <span class="series-game-score">
        <em class="${awayCls}">${teamShort(awayId)} ${away.score}</em>
        <i>-</i>
        <em class="${homeCls}">${home.score} ${teamShort(homeId)}</em>
      </span>
    `;
  } else {
    right = `<span class="series-game-when">${gameWhenJa(game)}</span>`;
  }
  const ifNecessary = game.ifNecessary === 'Y' && !isFinalGame(game) && !isCalledOffGame(game)
    ? '<span class="series-game-if">必要な場合のみ</span>'
    : '';
  return `
    <div class="series-game-row" data-gamepk="${game.gamePk}" role="button" tabindex="0" aria-label="第${no}戦の試合詳細">
      <span class="series-game-no">第${no}戦</span>
      ${right}
      ${ifNecessary}
    </div>
  `;
}

function renderSeriesCard(series) {
  // ラウンド見出しに「ワールドシリーズ」と出るため、カード側は対戦の枠組みを示す表記にする
  const leagueLabel = series.gameType === 'W'
    ? `${LEAGUES[103]} 対 ${LEAGUES[104]}`
    : (LEAGUES[series.leagueId] || 'リーグ未定');
  const badge = series.status === 'final'
    ? '<span class="series-badge is-final">終了</span>'
    : series.status === 'inProgress'
      ? `<span class="series-badge is-live">第${series.playedCount + 1}戦へ</span>`
      : `<span class="series-badge">${series.winsNeeded}勝先取</span>`;

  const nextLabel = series.status === 'scheduled' ? '開幕' : '次戦';
  const next = series.nextGame
    ? `<div class="series-next">${nextLabel}　${gameWhenJa(series.nextGame)}</div>`
    : '';

  const body = `
    <div class="series-card ${series.status === 'final' ? 'is-final' : ''}">
      <div class="series-card-head">
        <span class="series-title">${leagueLabel}</span>
        ${badge}
      </div>
      ${series.teams.every((t) => !t.id)
        ? '<div class="series-team-row is-tbd"><span class="series-team-name">対戦カード未定（勝ち上がり待ち）</span></div>'
        : series.teams.map((t) => renderTeamRow(series, t)).join('')}
      <div class="series-summary">${seriesSummaryJa(series)}<span class="series-format">${series.gamesInSeries}戦${series.winsNeeded}勝制</span></div>
      ${next}
      <div class="series-games">${series.games.map((g, i) => renderGameRow(series, g, i)).join('')}</div>
    </div>
  `;
  // 勝ち上がったシリーズは金箔のフレームで囲む
  return series.status === 'final' ? `<div class="foil-frame series-foil">${body}</div>` : body;
}

// bracket は buildBracket() の戻り値。
export function renderBracket(bracket, season) {
  if (!bracket || !bracket.rounds.length) {
    return `<div class="empty-state">${season}年のポストシーズンの日程はまだ発表されていません。</div>`;
  }
  const rounds = bracket.rounds.map(({ round, series }) => `
    <div class="bracket-round">
      <div class="bracket-round-head">${round.ja}<span class="count">${series.length}シリーズ</span></div>
      ${series.map(renderSeriesCard).join('')}
    </div>
  `).join('');

  return `
    ${rounds}
    <div class="bracket-note">日付・時刻はすべて日本時間。シリーズのチーム名をタップすると球団の紹介、各試合をタップすると試合詳細が開きます。</div>
  `;
}

// トーナメント表のタップ操作をつなぐ。
// openTeamSheet / openGameSheet は呼び出し側（画面モジュール）から渡してもらい、
// この算出＋描画モジュールが画面遷移そのものを抱え込まないようにする。
export function wireBracket(container, { onTeam, onGame }) {
  const bind = (el, handler) => {
    el.onclick = handler;
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    };
  };
  container.querySelectorAll('.series-team-row[data-teamid]').forEach((el) => {
    bind(el, () => onTeam(Number(el.dataset.teamid)));
  });
  container.querySelectorAll('.series-game-row[data-gamepk]').forEach((el) => {
    bind(el, () => onGame(Number(el.dataset.gamepk)));
  });
}

// --- 画面をまたいで使う共通処理 ---

// ポストシーズンの日程を取得してシリーズに畳む。日程が無い時期・取れなかった場合は null。
// ホーム／順位表／試合詳細／お知らせから同じキーで呼ぶため、cachedFetch のキャッシュを共有し、
// 画面をまたいでも実際の通信は増えない。
export async function loadBracket(season = currentSeasonYear()) {
  if (!isPostseasonWindow()) return null;
  try {
    const { games } = await getPostseasonSchedule(season);
    const bracket = buildBracket(games);
    return bracket.rounds.length ? bracket : null;
  } catch (e) {
    return null; // ポストシーズン情報が取れなくても、呼び出し元の本来の表示は続けられるようにする
  }
}

export function findSeriesForGame(bracket, gamePk) {
  if (!bracket) return null;
  const target = Number(gamePk);
  for (const { series } of bracket.rounds) {
    for (const s of series) {
      if (s.games.some((g) => Number(g.gamePk) === target)) return s;
    }
  }
  return null;
}

// そのチームが登場する最も後のラウンドのシリーズ（＝現在地）を返す。
export function findSeriesForTeam(bracket, teamId) {
  if (!bracket) return null;
  let found = null;
  for (const { series } of bracket.rounds) {
    for (const s of series) {
      if (s.teams.some((t) => t.id === Number(teamId))) found = s;
    }
  }
  return found;
}

// ポストシーズン全体で次に行われる試合（移動日の表示に使う）。
// 決着したシリーズの「必要な場合のみ」の試合は、日程に残っていても行われないので除く。
export function nextPostseasonGame(bracket, from = new Date()) {
  if (!bracket) return null;
  let next = null;
  for (const { series } of bracket.rounds) {
    for (const s of series) {
      if (s.status === 'final') continue;
      for (const g of s.games) {
        if (isFinalGame(g) || isCalledOffGame(g)) continue;
        const t = new Date(g.gameDate);
        if (t <= from) continue;
        if (!next || t < new Date(next.gameDate)) next = g;
      }
    }
  }
  return next;
}

// その試合を終えた時点でのシリーズ勝敗。過去の試合カードに「現在の」勝敗を出さないために使う。
// 対象試合がシリーズに無ければ null。
export function seriesRecordAsOf(series, game) {
  if (!series || !game) return null;
  const target = Number(game.gamePk);
  const wins = new Map();
  let reached = false;
  for (const g of series.games) {
    const winnerId = gameWinnerId(g);
    if (winnerId) wins.set(winnerId, (wins.get(winnerId) || 0) + 1);
    if (Number(g.gamePk) === target) { reached = true; break; }
  }
  if (!reached) return null;
  return series.teams.map((t) => ({ id: t.id, wins: t.id ? (wins.get(t.id) || 0) : 0 }));
}

// その試合でシリーズが決着したか
export function isSeriesClincher(series, game) {
  const record = seriesRecordAsOf(series, game);
  if (!record) return false;
  return record.some((t) => t.id && t.wins >= series.winsNeeded);
}

// ホームのコンパクトな試合カード用の1行。「DS 第3戦・1勝1敗」のように短くまとめる。
export function seriesShortLineJa(series, game) {
  if (!series || !series.round) return '';
  const no = Number(game && game.seriesGameNumber) || null;
  const head = `${series.round.shortJa}${no ? ` 第${no}戦` : ''}`;
  const record = seriesRecordAsOf(series, game);
  if (!record) return head;
  if (isSeriesClincher(series, game)) {
    const winner = record.find((t) => t.id && t.wins >= series.winsNeeded);
    return `${head}・${teamShort(winner.id)}突破`;
  }
  const counts = record.filter((t) => t.id).map((t) => t.wins);
  if (counts.length < 2) return head;
  const hi = Math.max(...counts);
  const lo = Math.min(...counts);
  if (hi === 0 && lo === 0) return head;
  return `${head}・${hi}勝${lo}敗`;
}

// 試合詳細のスコアボード見出し用。「ア・リーグ ディビジョンシリーズ 第3戦」。
export function seriesTitleJa(series, game) {
  if (!series || !series.round) return '';
  const league = series.gameType === 'W' ? '' : (LEAGUES[series.leagueId] || '');
  const no = Number(game && game.seriesGameNumber) || null;
  return [league, series.round.ja, no ? `第${no}戦` : ''].filter(Boolean).join(' ');
}

// お気に入りチームから見たシリーズの状況（お知らせ画面の見出しに使う）。
export function seriesTeamStatus(series, teamId) {
  if (!series) return null;
  const id = Number(teamId);
  const me = series.teams.find((t) => t.id === id);
  if (!me) return null;
  const opp = series.teams.find((t) => t.id !== id) || { id: null, wins: 0 };
  const need = series.winsNeeded;
  const oppName = opp.id ? teamShort(opp.id) : '対戦相手未定';
  const record = `${me.wins}勝${opp.wins}敗`;

  if (series.status === 'final') {
    return series.winnerId === id
      ? { key: 'advanced', label: 'シリーズ突破', detail: `${record}で${oppName}を下しました。` }
      : { key: 'eliminated', label: '敗退', detail: `${me.wins}勝${opp.wins}敗で${oppName}に敗れました。` };
  }
  if (series.status === 'scheduled') {
    return { key: 'upcoming', label: 'これから開幕', detail: `${oppName}と${series.gamesInSeries}戦${need}勝制で対戦します。` };
  }
  const matchPoint = me.wins === need - 1;
  const facingElimination = opp.wins === need - 1;
  if (matchPoint && facingElimination) {
    return { key: 'decider', label: '最終戦', detail: `${record}。次の試合で勝ち上がりが決まります。` };
  }
  if (matchPoint) return { key: 'matchpoint', label: '王手', detail: `${record}。あと1勝で勝ち上がりです。` };
  if (facingElimination) return { key: 'facing', label: '崖っぷち', detail: `${record}。あと1敗で敗退です。` };
  if (me.wins === opp.wins) return { key: 'even', label: 'タイ', detail: `${record}の五分です。` };
  return me.wins > opp.wins
    ? { key: 'lead', label: 'リード', detail: `${record}でリードしています。` }
    : { key: 'trail', label: 'ビハインド', detail: `${record}で追う展開です。` };
}

// トーナメント表を出す時期かどうか。ポストシーズンの日程が存在しない時期に
// 毎回スケジュールを取りに行かないための目安（9/1〜11/20 JST）。
// 実際にタブを出すかどうかは、この期間内で取得した日程に試合があるかで最終判断する。
export function isPostseasonWindow(jstDateStr = toJstDateString()) {
  const md = jstDateStr.slice(5); // 'MM-DD'
  return md >= '09-01' && md <= '11-20';
}
