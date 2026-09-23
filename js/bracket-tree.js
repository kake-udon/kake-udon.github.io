// ポストシーズンのトーナメント表（樹形図）。
// 順位表（getStandings のレスポンス）から各リーグのシード1〜6を求め、
// ワイルドカード → ディビジョン → リーグ優勝決定 → ワールドシリーズの勝ち上がりを1枚の図にする。
// ポストシーズンの日程（bracket.js の buildBracket の結果）があれば、実際の対戦・勝敗で上書きする。
//
// 設計上の注意：
// - 追加のAPI呼び出しはしない。順位表と /schedule/postseason の既存レスポンスだけで組み立てる。
// - チーム名は「ポストシーズン進出が決まったチーム」だけをはっきり出し、まだ決まっていない枠は
//   「現時点の圏内」として薄く出す（決まったかのように見せない）。
// - シード順そのものはレギュラーシーズンが終わるまで入れ替わりうるので、終わるまでは暫定と明記する。
// - スマホ縦画面で収まるよう、樹形図の中は略称（NYYなど）にし、正式名は下のシード一覧に出す。
import { LEAGUES, TEAMS, teamName, teamShort, teamColor } from './teams.js';
import { buildRaceContext, raceInfo } from './postseason.js';

// 各リーグの組み合わせ（2022年以降の12球団制）。
//   WC：3位シード vs 6位シード、4位シード vs 5位シード（上位シードの本拠地で3試合）
//   DS：1位シード vs 4/5の勝者、2位シード vs 3/6の勝者
const WC_PAIRS = [[4, 5], [3, 6]];
const DS_BYES = [1, 2];

function winPct(tr) {
  const n = parseFloat(tr && tr.winningPercentage);
  if (Number.isFinite(n)) return n;
  const w = Number(tr && tr.wins) || 0;
  const l = Number(tr && tr.losses) || 0;
  return w + l ? w / (w + l) : 0;
}

// 地区首位の並び（勝率 → APIのリーグ順位）。同率時のタイブレーカーはAPIの leagueRank に任せる。
function byLeaderOrder(a, b) {
  const d = winPct(b) - winPct(a);
  if (d !== 0) return d;
  return Number(a.leagueRank || 99) - Number(b.leagueRank || 99);
}

// ワイルドカードの並び（APIのWC順位 → 勝ち数）。postseason.js の争いカードと同じ基準。
function byWildcardOrder(a, b) {
  const ra = Number(a.wildCardRank || 99);
  const rb = Number(b.wildCardRank || 99);
  if (ra !== rb) return ra - rb;
  return (b.wins || 0) - (a.wins || 0);
}

// リーグごとのシード1〜6。records は getStandings() の data.records。
// 各要素：{ seed, teamId, confirmed（ポストシーズン進出が確定しているか）, label（地区優勝／WC確保 など）, magic }
export function computeSeeds(records) {
  const ctx = buildRaceContext(records);
  const result = new Map(); // leagueId -> { seeds, finished }
  for (const leagueId of [103, 104]) {
    const list = ctx.byLeague.get(leagueId) || [];
    if (!list.length) continue;

    // 地区首位：divisionLeader を優先し、無ければ（同率など）地区順位1位を拾う
    const leaders = [];
    const byDiv = new Map();
    list.forEach((tr) => {
      const div = TEAMS[tr.team.id].division;
      if (!byDiv.has(div)) byDiv.set(div, []);
      byDiv.get(div).push(tr);
    });
    for (const teams of byDiv.values()) {
      const leader = teams.find((tr) => tr.divisionLeader === true)
        || [...teams].sort((a, b) => Number(a.divisionRank || 99) - Number(b.divisionRank || 99))[0];
      if (leader) leaders.push(leader);
    }
    leaders.sort(byLeaderOrder);
    const others = list.filter((tr) => !leaders.includes(tr)).sort(byWildcardOrder);
    const ordered = [...leaders.slice(0, 3), ...others.slice(0, 3)];

    const seeds = ordered.map((tr, i) => {
      const info = raceInfo(ctx, tr);
      const confirmed = info.kind === 'clinched';
      return {
        seed: i + 1,
        teamId: Number(tr.team.id),
        confirmed,
        label: confirmed ? info.clinch.label : null,
        magic: info.kind === 'magic' ? info.value : null,
        wins: tr.wins,
        losses: tr.losses,
      };
    });
    // レギュラーシーズンが全日程を終えたか（＝シード順が確定したか）
    const finished = list.every((tr) => raceInfo(ctx, tr).remaining === 0);
    result.set(leagueId, { seeds, finished });
  }
  return result;
}

// --- 実際の日程（bracket.js の buildBracket の結果）との突き合わせ ---

function roundSeries(bracket, gameType, leagueId) {
  if (!bracket) return [];
  const round = bracket.rounds.find((r) => r.round.gameType === gameType);
  if (!round) return [];
  return round.series.filter((s) => gameType === 'W' || s.leagueId === leagueId);
}

// 想定している参加チームのどれかを含むシリーズを探す。見つからず、そのラウンドにその
// リーグのシリーズが1つしか無い（リーグ優勝決定シリーズ・ワールドシリーズ）ならそれを使う。
function findActual(bracket, gameType, leagueId, teamIds, used) {
  const list = roundSeries(bracket, gameType, leagueId).filter((s) => !used.has(s));
  const ids = teamIds.filter(Boolean);
  for (const id of ids) {
    const hit = list.find((s) => s.teams.some((t) => t.id === id));
    if (hit) return hit;
  }
  const expected = gameType === 'W' || gameType === 'L' ? 1 : 2;
  if (list.length === 1 && expected === 1) return list[0];
  return null;
}

// 1つの枠（シリーズの片側）。state は confirmed（進出決定）／provisional（現時点の圏内）／tbd（勝ち上がり待ち）
function slotFromSeed(s) {
  if (!s) return { teamId: null, seed: null, state: 'tbd', wins: 0, hint: '未定' };
  return {
    teamId: s.teamId,
    seed: s.seed,
    state: s.confirmed ? 'confirmed' : 'provisional',
    wins: 0,
    hint: '',
  };
}

function slotFromWinner(node, seedOf) {
  if (node && node.winnerId) {
    return { teamId: node.winnerId, seed: seedOf(node.winnerId), state: 'confirmed', wins: 0, hint: '' };
  }
  return { teamId: null, seed: null, state: 'tbd', wins: 0, hint: node ? node.feederHint : '未定' };
}

// 想定の組み合わせに実際のシリーズを重ねる。実際の対戦が分かっていればそちらを優先する。
function applyActual(node, actual, seedOf) {
  if (!actual) return node;
  const actualIds = actual.teams.map((t) => t.id);
  let slots = node.slots;
  if (actualIds.filter(Boolean).length) {
    // 想定の並び（上位シードが上）をなるべく保ちつつ、実際のチームで置き換える
    const known = actualIds.filter(Boolean);
    const ordered = [...known].sort((a, b) => (seedOf(a) || 99) - (seedOf(b) || 99));
    slots = [0, 1].map((i) => {
      const id = ordered[i] || null;
      if (!id) return node.slots.find((s) => s.state === 'tbd' && !known.includes(s.teamId)) || { teamId: null, seed: null, state: 'tbd', wins: 0, hint: '未定' };
      return { teamId: id, seed: seedOf(id), state: 'confirmed', wins: 0, hint: '' };
    });
  }
  slots = slots.map((s) => {
    const t = actual.teams.find((x) => x.id && x.id === s.teamId);
    return t ? { ...s, wins: t.wins } : s;
  });
  return {
    ...node,
    slots,
    actual,
    winnerId: actual.winnerId,
    status: actual.status,
  };
}

function makeNode(key, gameType, slots, feederHint) {
  return { key, gameType, slots, actual: null, winnerId: null, status: 'projected', feederHint };
}

// シードと実際の日程から、リーグごとの樹形図を組み立てる。DOMには触らない純粋な算出関数。
export function buildTree(seedsByLeague, bracket) {
  const leagues = {};
  const used = new Set();
  for (const leagueId of [103, 104]) {
    const entry = seedsByLeague.get(leagueId);
    const seeds = entry ? entry.seeds : [];
    const bySeed = (n) => seeds.find((s) => s.seed === n) || null;
    const seedOf = (teamId) => {
      const s = seeds.find((x) => x.teamId === teamId);
      return s ? s.seed : null;
    };

    const wc = WC_PAIRS.map(([hi, lo]) => {
      let node = makeNode(`wc-${hi}-${lo}`, 'F', [slotFromSeed(bySeed(hi)), slotFromSeed(bySeed(lo))], `${hi}位・${lo}位の勝者`);
      const actual = findActual(bracket, 'F', leagueId, node.slots.map((s) => s.teamId), used);
      if (actual) used.add(actual);
      node = applyActual(node, actual, seedOf);
      return node;
    });

    const ds = DS_BYES.map((top, i) => {
      const feeder = wc[i];
      let node = makeNode(`ds-${top}`, 'D', [slotFromSeed(bySeed(top)), slotFromWinner(feeder, seedOf)], '');
      const actual = findActual(bracket, 'D', leagueId, node.slots.map((s) => s.teamId), used);
      if (actual) used.add(actual);
      node = applyActual(node, actual, seedOf);
      node.feederHint = `${top}位側の勝者`;
      return node;
    });

    let lcs = makeNode('lcs', 'L', [slotFromWinner(ds[0], seedOf), slotFromWinner(ds[1], seedOf)], '');
    const lcsActual = findActual(bracket, 'L', leagueId, lcs.slots.map((s) => s.teamId), used);
    if (lcsActual) used.add(lcsActual);
    lcs = applyActual(lcs, lcsActual, seedOf);
    lcs.feederHint = `${LEAGUES[leagueId]}優勝`;

    leagues[leagueId] = {
      leagueId,
      seeds,
      finished: entry ? entry.finished : false,
      wc,
      ds,
      lcs,
      seedOf,
    };
  }

  const alSlot = slotFromWinner(leagues[103].lcs, leagues[103].seedOf);
  const nlSlot = slotFromWinner(leagues[104].lcs, leagues[104].seedOf);
  let ws = makeNode('ws', 'W', [alSlot, nlSlot], '');
  const wsActual = findActual(bracket, 'W', null, ws.slots.map((s) => s.teamId), used);
  if (wsActual) {
    // ワールドシリーズはシード順ではなく「ア・リーグ代表が上」で固定する
    ws.actual = wsActual;
    ws.winnerId = wsActual.winnerId;
    ws.status = wsActual.status;
    ws.slots = [103, 104].map((lg, i) => {
      const t = wsActual.teams.find((x) => x.id && TEAMS[x.id] && TEAMS[x.id].league === lg);
      if (!t) return ws.slots[i];
      return { teamId: t.id, seed: leagues[lg].seedOf(t.id), state: 'confirmed', wins: t.wins, hint: '' };
    });
  }
  return { leagues, ws };
}

// --- 描画 ---

function seedMark(seed) {
  return seed ? `<span class="bk-seed">${seed}</span>` : '<span class="bk-seed is-empty"></span>';
}

function renderSlot(node, slot) {
  if (!slot.teamId) {
    return `
      <div class="bk-team is-tbd">
        ${seedMark(null)}
        <span class="bk-abbr">${slot.hint || '未定'}</span>
      </div>
    `;
  }
  const isWinner = node.winnerId && node.winnerId === slot.teamId;
  const isOut = node.winnerId && !isWinner;
  const cls = [
    'bk-team',
    slot.state === 'provisional' ? 'is-provisional' : '',
    isWinner ? 'is-winner' : '',
    isOut ? 'is-out' : '',
  ].filter(Boolean).join(' ');
  const showWins = node.actual && node.status !== 'scheduled';
  const title = slot.state === 'provisional'
    ? `${teamName(slot.teamId)}（現時点の圏内・進出未確定）`
    : teamName(slot.teamId);
  return `
    <div class="${cls}" data-teamid="${slot.teamId}" role="button" tabindex="0" aria-label="${title}" title="${title}">
      ${seedMark(slot.seed)}
      <span class="team-dot" style="background:${teamColor(slot.teamId)}"></span>
      <span class="bk-abbr">${teamShort(slot.teamId)}</span>
      ${showWins ? `<span class="bk-wins">${slot.wins}</span>` : ''}
    </div>
  `;
}

function nodeStatusLabel(node) {
  if (!node.actual) return '';
  if (node.status === 'final') return '<span class="bk-status is-final">終了</span>';
  if (node.status === 'inProgress') return '<span class="bk-status is-live">対戦中</span>';
  return '<span class="bk-status">日程確定</span>';
}

function renderMatch(node, extraCls = '') {
  const cls = ['bk-match', extraCls, node.status === 'final' ? 'is-final' : ''].filter(Boolean).join(' ');
  return `
    <div class="${cls}">
      ${node.slots.map((s) => renderSlot(node, s)).join('')}
      ${nodeStatusLabel(node)}
    </div>
  `;
}

// DSから登場する上位シード（ワイルドカードシリーズは免除）
function renderBye(league, seed) {
  const s = league.seeds.find((x) => x.seed === seed);
  const slot = slotFromSeed(s);
  return `
    <div class="bk-match is-bye">
      ${renderSlot({ winnerId: null, actual: null }, slot)}
      <span class="bk-bye-note">WC免除</span>
    </div>
  `;
}

function renderLeagueTree(league) {
  const [dsTop, dsBottom] = league.ds;
  const [wcTop, wcBottom] = league.wc;
  return `
    <div class="bk-league">
      <div class="bk-league-head">
        <span>${LEAGUES[league.leagueId]}</span>
        ${league.finished ? '' : '<span class="bk-provisional-tag">シード暫定</span>'}
      </div>
      <div class="bk-cols-head"><span>WC</span><span>DS</span><span>LCS</span></div>
      <div class="bk-tree">
        <div class="bk-cell" style="grid-column:1;grid-row:1">${renderBye(league, 1)}</div>
        <div class="bk-cell" style="grid-column:1;grid-row:2">${renderMatch(wcTop)}</div>
        <div class="bk-cell" style="grid-column:1;grid-row:3">${renderBye(league, 2)}</div>
        <div class="bk-cell" style="grid-column:1;grid-row:4">${renderMatch(wcBottom)}</div>
        <div class="bk-join" style="grid-column:2;grid-row:1 / 3"></div>
        <div class="bk-join" style="grid-column:2;grid-row:3 / 5"></div>
        <div class="bk-cell" style="grid-column:3;grid-row:1 / 3">${renderMatch(dsTop)}</div>
        <div class="bk-cell" style="grid-column:3;grid-row:3 / 5">${renderMatch(dsBottom)}</div>
        <div class="bk-join is-wide" style="grid-column:4;grid-row:1 / 5"></div>
        <div class="bk-cell" style="grid-column:5;grid-row:1 / 5">${renderMatch(league.lcs, 'is-lcs')}</div>
      </div>
    </div>
  `;
}

function renderWorldSeries(ws) {
  const body = `
    <div class="bk-ws ${ws.status === 'final' ? 'is-final' : ''}">
      <div class="bk-ws-head">ワールドシリーズ${nodeStatusLabel(ws)}</div>
      <div class="bk-ws-teams">
        ${renderSlot(ws, ws.slots[0])}
        <span class="bk-ws-vs">対</span>
        ${renderSlot(ws, ws.slots[1])}
      </div>
      ${ws.winnerId ? `<div class="bk-ws-champion">${teamName(ws.winnerId)} 世界一</div>` : ''}
    </div>
  `;
  return ws.status === 'final' ? `<div class="foil-frame bk-ws-foil">${body}</div>` : body;
}

// シード一覧（正式名・確定状況）。樹形図は略称なので、ここでチーム名をはっきり示す。
function renderSeedList(league) {
  if (!league.seeds.length) return '';
  const rows = league.seeds.map((s) => {
    const status = s.confirmed
      ? `<span class="bk-seed-status is-confirmed">${s.label || '進出決定'}</span>`
      : `<span class="bk-seed-status">${s.magic ? `M${s.magic}` : '未確定'}</span>`;
    return `
      <div class="bk-seed-row ${s.confirmed ? 'is-confirmed' : 'is-provisional'}" data-teamid="${s.teamId}" role="button" tabindex="0">
        <span class="bk-seed">${s.seed}</span>
        <span class="team-dot" style="background:${teamColor(s.teamId)}"></span>
        <span class="bk-seed-name">${teamName(s.teamId)}</span>
        <span class="bk-seed-wl">${s.wins}-${s.losses}</span>
        ${status}
      </div>
    `;
  }).join('');
  return `
    <div class="bk-seed-list">
      <div class="bk-seed-list-head">${LEAGUES[league.leagueId]}のシード${league.finished ? '' : '（現時点）'}</div>
      ${rows}
    </div>
  `;
}

export function renderTree(tree) {
  const al = tree.leagues[103];
  const nl = tree.leagues[104];
  if (!al.seeds.length && !nl.seeds.length) return '';
  const anyUnfinished = !al.finished || !nl.finished;
  return `
    <div class="bk-legend">
      <span><i class="lg-confirmed"></i>進出決定</span>
      <span><i class="lg-provisional"></i>現時点の圏内（未確定）</span>
    </div>
    ${renderLeagueTree(al)}
    ${renderWorldSeries(tree.ws)}
    ${renderLeagueTree(nl)}
    ${anyUnfinished ? '<div class="bracket-note">数字はシード（1〜3位＝地区優勝チームを勝率順、4〜6位＝ワイルドカード）。レギュラーシーズン終了まではシード順が入れ替わることがあります。</div>' : ''}
    ${renderSeedList(al)}
    ${renderSeedList(nl)}
  `;
}

export function wireTree(container, { onTeam }) {
  container.querySelectorAll('.bk-team[data-teamid], .bk-seed-row[data-teamid]').forEach((el) => {
    const handler = () => onTeam(Number(el.dataset.teamid));
    el.onclick = handler;
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    };
  });
}
