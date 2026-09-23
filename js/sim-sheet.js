// 順位シミュレーションの全画面シート。
// 地区の残り試合の勝敗を1試合ずつ選ぶと、仮の順位表・ゲーム差・地区優勝マジックがその場で変わる。
// 「ア WC」「ナ WC」ではリーグ全体のワイルドカード争い（圏内3枠・WC確保のM・敗退までのE）を同じ操作で試せる。
// 計算は js/standings-sim.js（UI非依存の純粋関数）に任せ、ここでは
// 「APIのレスポンスを standings-sim.js のデータ形式に直す」ことと表示だけを受け持つ。
//
// データの出どころ：
//   勝敗 … getStandings（順位表画面と同じレスポンス）
//   直接対決成績・残り試合 … 地区5球団ぶんの getTeamRegularSeasonSchedule
//     （ワイルドカードでは、まだ進出の目が残っているリーグの球団ぶん）
// 選んだ勝敗はメモリ上にだけ持つ（アプリを開き直すと消える。実際の成績と混ざらないようにするため）。
import { getStandings, getTeamRegularSeasonSchedule, currentSeasonYear, toJstDateString, formatJstTime, formatJstDateLabel } from './api.js';
import { TEAMS, DIVISIONS, LEAGUES, teamName, teamShort, teamColor } from './teams.js';
import { closeSheet, pushSheetBack } from './sheet-stack.js';
import { openTeamSheet } from './team-sheet.js';
import {
  applyPicks, divisionMagic, sortDivision, gamesBehind, remaining, hasTiebreaker, formatPct, wildcardRace,
} from './standings-sim.js';

// 地区の切り替えボタン（順位表画面と同じ ア東・ア中・ア西・ナ東・ナ中・ナ西 の順）と、
// リーグ単位のワイルドカード争い。id は地区IDの数値、またはワイルドカードの 'wc103' / 'wc104'。
const DIVISION_TABS = [
  { id: 201, label: 'ア東' },
  { id: 202, label: 'ア中' },
  { id: 200, label: 'ア西' },
  { id: 'wc103', label: 'ア WC' },
  { id: 204, label: 'ナ東' },
  { id: 205, label: 'ナ中' },
  { id: 203, label: 'ナ西' },
  { id: 'wc104', label: 'ナ WC' },
];

const WC_SLOTS = 3;

// 'wc103' → 103、地区IDなら null
function wildcardLeagueOf(scope) {
  const m = /^wc(\d+)$/.exec(String(scope));
  return m ? Number(m[1]) : null;
}

// gamePk -> 勝ちチームID。地区を切り替えても、シートを閉じても、アプリを開いている間は保持する。
const picks = new Map();

// 描画中の状態（シートを開くたびに作り直す）
let state = null;

function isCalledOff(game) {
  const detailed = (game && game.status && game.status.detailedState) || '';
  return /Cancelled|Postponed/i.test(detailed);
}

// 延期された試合は元の日付（Postponed）と振替日の2か所に同じ gamePk で載るため、
// abstractGameState だけでは「終わった試合」を見分けられない（延期も Final で返る）。
function isCompleted(game) {
  return !isCalledOff(game) && game.status && game.status.abstractGameState === 'Final';
}

function sideId(game, side) {
  const id = game.teams && game.teams[side] && game.teams[side].team && game.teams[side].team.id;
  return TEAMS[id] ? Number(id) : null;
}

function winnerIdOf(game) {
  const away = game.teams.away || {};
  const home = game.teams.home || {};
  if (away.isWinner === true) return sideId(game, 'away');
  if (home.isWinner === true) return sideId(game, 'home');
  if (typeof away.score === 'number' && typeof home.score === 'number' && away.score !== home.score) {
    return away.score > home.score ? sideId(game, 'away') : sideId(game, 'home');
  }
  return null;
}

// 地区5球団の日程（重複あり）から、直接対決成績と残り試合を取り出す。
function digestSchedules(allGames) {
  // 同じ gamePk の試合は1つにまとめる（地区内の対戦は両チームの日程に載る。延期分も重複する）。
  const byPk = new Map();
  for (const g of allGames) {
    if (!g || !g.gamePk || !g.teams) continue;
    if (!byPk.has(g.gamePk)) byPk.set(g.gamePk, []);
    byPk.get(g.gamePk).push(g);
  }

  const h2h = {};
  const meetings = {}; // 2球団の今季の対戦数（消化済み＋残り）。別地区どうしのタイブレーカー判定に使う
  const meet = (a, b) => {
    meetings[a] ??= {};
    meetings[b] ??= {};
    meetings[a][b] = (meetings[a][b] ?? 0) + 1;
    meetings[b][a] = (meetings[b][a] ?? 0) + 1;
  };
  const games = [];
  for (const entries of byPk.values()) {
    const done = entries.find(isCompleted);
    if (done) {
      const winnerId = winnerIdOf(done);
      const awayId = sideId(done, 'away');
      const homeId = sideId(done, 'home');
      if (awayId && homeId) meet(awayId, homeId);
      if (winnerId && awayId && homeId) {
        const loserId = winnerId === homeId ? awayId : homeId;
        h2h[winnerId] ??= {};
        h2h[winnerId][loserId] = (h2h[winnerId][loserId] ?? 0) + 1;
      }
      continue;
    }
    // 未消化の試合。延期前の日付の行ではなく、振替後の日付の行を使う。
    const live = entries.filter((g) => !isCalledOff(g))
      .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))[0];
    if (!live) continue;
    const awayId = sideId(live, 'away');
    const homeId = sideId(live, 'home');
    if (!awayId || !homeId) continue;
    meet(awayId, homeId);
    games.push({
      gamePk: live.gamePk,
      homeId,
      awayId,
      gameDate: live.gameDate,
      isLive: live.status && live.status.abstractGameState === 'Live',
    });
  }
  games.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  return { h2h, meetings, games };
}

// 順位表のレスポンスを standings-sim.js の teams 形式に直す（30球団ぶん）
function toSimTeams(records) {
  const teams = [];
  for (const rec of records || []) {
    for (const tr of rec.teamRecords || []) {
      const meta = TEAMS[tr.team && tr.team.id];
      if (!meta) continue;
      teams.push({
        id: Number(tr.team.id),
        name: meta.name,
        wins: Number(tr.wins) || 0,
        losses: Number(tr.losses) || 0,
        divisionId: meta.division,
      });
    }
  }
  return teams;
}

// 表の列が7つあるため、チーム名は「地名・」を省いた愛称で出す（正式名は title に入れる）
function nickname(teamId) {
  const name = teamName(teamId);
  return `<span class="sim-team-name" title="${name}">${name.split('・').pop()}</span>`;
}

function currentPicks() {
  return state.games.map((g) => ({
    gamePk: g.gamePk, homeId: g.homeId, awayId: g.awayId, winnerId: picks.get(g.gamePk) ?? null,
  }));
}

function formatGb(gb) {
  if (gb === 0) return '-';
  return Number.isInteger(gb) ? `${gb}.0` : `${gb}`;
}

function magicTag(value) {
  if (value === null) {
    return `<span class="clinch-tag is-eliminated" title="残り試合をすべて勝っても地区優勝に届きません">脱落</span>`;
  }
  if (value === 0) {
    return `<span class="clinch-tag is-clinched" title="地区優勝が確定">優勝</span>`;
  }
  return `<span class="clinch-tag is-magic" title="自チームの勝ちとライバルの負けが合計${value}で地区優勝が決まります（目安）">M${value}</span>`;
}

function rankMoveTag(move) {
  if (!move) return '';
  return move > 0
    ? `<span class="sim-move is-up" title="実際の順位より${move}つ上">▲${move}</span>`
    : `<span class="sim-move is-down" title="実際の順位より${-move}つ下">▼${-move}</span>`;
}

// 同率で並んだ隣どうしについて、どちらが上になったか（直接対決）を一言添える。
function tieNotes(sorted, h2h) {
  const notes = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a.wins !== b.wins || a.losses !== b.losses) continue;
    const aw = h2h?.[a.id]?.[b.id] ?? 0;
    const bw = h2h?.[b.id]?.[a.id] ?? 0;
    const decided = hasTiebreaker(h2h, a.id, b.id) ? '（直接対決の勝ち越しが確定）' : '';
    notes.push(aw === bw
      ? `${teamName(a.id)}と${teamName(b.id)}が同率・直接対決も${aw}勝${bw}敗で互角です。`
      : `${teamName(a.id)}と${teamName(b.id)}が同率。直接対決${aw}勝${bw}敗で${teamName(a.id)}が上位${decided}。`);
  }
  return notes;
}

function renderTable() {
  if (state.league) return renderWildcardTable();
  const divId = state.divisionId;
  const actualDiv = state.teams.filter((t) => t.divisionId === divId);
  const actualOrder = sortDivision(actualDiv, state.h2h).map((t) => t.id);

  const sim = applyPicks(state.teams, state.h2h, currentPicks());
  const simDiv = sim.teams.filter((t) => t.divisionId === divId);
  const sorted = sortDivision(simDiv, sim.h2h);
  const leader = sorted[0];

  const rows = sorted.map((t, i) => {
    const magic = divisionMagic(t, simDiv, sim.h2h);
    const actual = actualDiv.find((x) => x.id === t.id);
    const addW = t.wins - actual.wins;
    const addL = t.losses - actual.losses;
    const move = actualOrder.indexOf(t.id) - i;
    return `
      <tr data-teamid="${t.id}" class="${magic === null ? 'is-eliminated' : ''}">
        <td>
          <div class="team-cell">
            <span class="rank-num">${i + 1}</span>
            <span class="team-dot" style="background:${teamColor(t.id)}"></span>
            ${nickname(t.id)}
            ${rankMoveTag(move)}
          </div>
        </td>
        <td>${t.wins}${addW ? `<small class="sim-add">+${addW}</small>` : ''}</td>
        <td>${t.losses}${addL ? `<small class="sim-add">+${addL}</small>` : ''}</td>
        <td>${formatPct(t)}</td>
        <td>${formatGb(gamesBehind(leader, t))}</td>
        <td>${remaining(t)}</td>
        <td>${magicTag(magic)}</td>
      </tr>
    `;
  }).join('');

  const notes = tieNotes(sorted, sim.h2h);
  const picked = state.games.filter((g) => picks.has(g.gamePk)).length;

  return `
    <table class="standings-table sim-table">
      <thead>
        <tr><th>チーム</th><th>勝</th><th>敗</th><th>率</th><th>差</th><th title="残り試合数（目安）">残</th><th title="地区優勝のマジックナンバー">優勝</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sim-status">残り${state.games.length}試合のうち <b>${picked}</b> 試合の勝敗を選択中</div>
    ${notes.map((n) => `<div class="sim-tie-note">${n}</div>`).join('')}
  `;
}

// ワイルドカード争いの「状況」列
function wildcardTag(row) {
  if (row.status === 'clinched') {
    return `<span class="clinch-tag is-clinched" title="ワイルドカード枠を確保（目安）">WC確保</span>`;
  }
  if (row.status === 'magic') {
    return `<span class="clinch-tag is-magic" title="自チームの勝ちと圏外の先頭（WC${WC_SLOTS + 1}位）の負けが合計${row.value}でWC確保（目安）">M${row.value}</span>`;
  }
  if (row.status === 'eliminated') {
    return `<span class="clinch-tag is-eliminated" title="残り試合をすべて勝ってもWC圏内・地区優勝のどちらにも届きません">敗退</span>`;
  }
  if (row.value === 0) {
    return `<span class="clinch-tag is-elim-num" title="WC圏内には届きませんが、地区優勝の可能性が残っています">地区のみ</span>`;
  }
  return `<span class="clinch-tag is-elim-num" title="WC${WC_SLOTS}位の勝ちと自チームの負けが合計${row.value}でWCの可能性が消えます（目安）">E${row.value}</span>`;
}

// 勝率の差を「ゲーム差」にした値。圏内は圏外の先頭に対するリード（+）、圏外は当落線までの差。
function wildcardGb(row, list) {
  const t = row.team;
  if (row.rank <= WC_SLOTS) {
    const firstOut = list[WC_SLOTS];
    if (!firstOut) return '-';
    const lead = gamesBehind(t, firstOut.team);
    return lead === 0 ? '-' : `+${formatGb(lead)}`;
  }
  return formatGb(gamesBehind(list[WC_SLOTS - 1].team, t));
}

// リーグのワイルドカード争い。地区首位（シミュレーション上）を上に3行、その下にWC争い。
function renderWildcardTable() {
  const league = state.league;
  const leagueActual = state.teams.filter((t) => TEAMS[t.id].league === league);
  const actualRace = wildcardRace(leagueActual, state.h2h, state.meetings, WC_SLOTS);
  const actualRank = new Map(actualRace.wildcard.map((r) => [r.team.id, r.rank]));

  const sim = applyPicks(state.teams, state.h2h, currentPicks());
  const leagueSim = sim.teams.filter((t) => TEAMS[t.id].league === league);
  const race = wildcardRace(leagueSim, sim.h2h, state.meetings, WC_SLOTS);
  const actualById = new Map(state.teams.map((t) => [t.id, t]));

  const cells = (t) => {
    const actual = actualById.get(t.id);
    const addW = t.wins - actual.wins;
    const addL = t.losses - actual.losses;
    return `
      <td>${t.wins}${addW ? `<small class="sim-add">+${addW}</small>` : ''}</td>
      <td>${t.losses}${addL ? `<small class="sim-add">+${addL}</small>` : ''}</td>
      <td>${formatPct(t)}</td>
    `;
  };
  const nameCell = (t, rankLabel, extra = '') => `
    <td>
      <div class="team-cell">
        <span class="rank-num">${rankLabel}</span>
        <span class="team-dot" style="background:${teamColor(t.id)}"></span>
        ${nickname(t.id)}
        ${extra}
      </div>
    </td>
  `;

  const winnerRows = race.divisionWinners.map((w) => `
    <tr data-teamid="${w.team.id}" class="ps-division">
      ${nameCell(w.team, '首')}
      ${cells(w.team)}
      <td>-</td>
      <td>${remaining(w.team)}</td>
      <td>${magicTag(w.magic)}</td>
    </tr>
  `).join('');

  // 可能性が消えている球団は、日程を読み込んでいない（シミュレーション対象外）ので行を省く
  const shown = race.wildcard.filter((r) => state.contenderIds.has(r.team.id));
  const rows = shown.map((r) => {
    const before = actualRank.get(r.team.id);
    // 地区首位だった球団がWC争いに落ちてきた場合は「実際の順位」が無いので矢印を出さない
    const move = before ? before - r.rank : 0;
    const inRace = r.rank <= WC_SLOTS;
    const cls = [inRace ? 'ps-wildcard' : '', r.status === 'eliminated' ? 'is-eliminated' : '', r.rank === WC_SLOTS ? 'sim-cutline' : '']
      .filter(Boolean).join(' ');
    return `
      <tr data-teamid="${r.team.id}" class="${cls}">
        ${nameCell(r.team, inRace ? `WC${r.rank}` : r.rank, rankMoveTag(move))}
        ${cells(r.team)}
        <td>${wildcardGb(r, race.wildcard)}</td>
        <td>${remaining(r.team)}</td>
        <td>${wildcardTag(r)}</td>
      </tr>
    `;
  }).join('');

  const notes = tieNotes(race.wildcard.map((r) => r.team), sim.h2h);
  const scopeIds = scopeTeamIds();
  const scoped = state.games.filter((g) => scopeIds.has(g.homeId) || scopeIds.has(g.awayId));
  const picked = scoped.filter((g) => picks.has(g.gamePk)).length;
  const omitted = leagueActual.length - race.divisionWinners.length - shown.length;

  return `
    <table class="standings-table sim-table">
      <thead>
        <tr><th>チーム</th><th>勝</th><th>敗</th><th>率</th><th title="圏内は圏外の先頭とのゲーム差、圏外はWC${WC_SLOTS}位とのゲーム差">差</th><th title="残り試合数（目安）">残</th><th title="ポストシーズン進出の状況">状況</th></tr>
      </thead>
      <tbody>
        <tr class="sim-group-row"><td colspan="7">地区首位（${LEAGUES[league]}）</td></tr>
        ${winnerRows}
        <tr class="sim-group-row"><td colspan="7">ワイルドカード（上位${WC_SLOTS}球団が進出）</td></tr>
        ${rows}
      </tbody>
    </table>
    ${omitted > 0 ? `<div class="sim-tie-note">すでに可能性が消えている${omitted}球団は省いています。</div>` : ''}
    <div class="sim-status">残り${scoped.length}試合のうち <b>${picked}</b> 試合の勝敗を選択中</div>
    ${notes.map((n) => `<div class="sim-tie-note">${n}</div>`).join('')}
  `;
}

// いま表示している範囲（地区 or ワイルドカード争い）の球団ID
function scopeTeamIds() {
  if (state.league) return state.contenderIds;
  return new Set(state.teams.filter((t) => t.divisionId === state.divisionId).map((t) => t.id));
}

function renderGameRow(g) {
  const winner = picks.get(g.gamePk);
  const btn = (teamId, side) => `
    <button class="sim-pick ${winner === teamId ? 'is-win' : ''} ${winner && winner !== teamId ? 'is-lose' : ''}"
      data-gamepk="${g.gamePk}" data-teamid="${teamId}" style="--team-color:${teamColor(teamId)}"
      aria-pressed="${winner === teamId}" aria-label="${teamName(teamId)}の勝ちにする">
      <span class="team-dot" style="background:${teamColor(teamId)}"></span>
      <span class="sim-pick-name">${teamShort(teamId)}</span>
      <span class="sim-pick-mark">${winner === teamId ? '勝' : (winner ? '負' : '')}</span>
      ${side === 'home' ? '<span class="sim-pick-home">主催</span>' : ''}
    </button>
  `;
  return `
    <div class="sim-game" data-gamepk="${g.gamePk}">
      <span class="sim-game-time">${formatJstTime(g.gameDate)}${g.isLive ? '<em>試合中</em>' : ''}</span>
      ${btn(g.awayId, 'away')}
      <span class="sim-game-at">@</span>
      ${btn(g.homeId, 'home')}
    </div>
  `;
}

function renderGames() {
  const divTeamIds = scopeTeamIds();
  const list = state.games.filter((g) => divTeamIds.has(g.homeId) || divTeamIds.has(g.awayId));
  if (!list.length) {
    return `<div class="empty-state">レギュラーシーズンの残り試合がありません。</div>`;
  }
  // 日本時間の日付ごとにまとめる
  const groups = [];
  for (const g of list) {
    const key = toJstDateString(new Date(g.gameDate));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.games.push(g);
    else groups.push({ key, label: formatJstDateLabel(g.gameDate), games: [g] });
  }
  return groups.map((grp) => `
    <div class="sim-date-head">${grp.label}</div>
    ${grp.games.map(renderGameRow).join('')}
  `).join('');
}

function renderQuickActions() {
  const ids = scopeTeamIds();
  const divTeams = state.teams.filter((t) => ids.has(t.id));
  const pills = divTeams.map((t) => `
    <button class="filter-pill" data-sweep="${t.id}"><span class="team-dot" style="background:${teamColor(t.id)}"></span>${teamShort(t.id)} 全勝</button>
  `).join('');
  return `
    <div class="sim-actions">
      <div class="filter-pill-group">${pills}</div>
      <button class="filter-pill sim-reset" data-reset="1">${state.league ? 'この表示の' : 'この地区の'}選択をリセット</button>
    </div>
  `;
}

function renderDivisionTabs() {
  return `
    <div class="filter-pill-group sim-division-tabs">
      ${DIVISION_TABS.map((d) => `<button class="filter-pill ${d.id === state.scope ? 'active' : ''} ${wildcardLeagueOf(d.id) ? 'is-wc' : ''}" data-division="${d.id}">${d.label}</button>`).join('')}
    </div>
  `;
}

function divisionGames() {
  const divTeamIds = scopeTeamIds();
  return state.games.filter((g) => divTeamIds.has(g.homeId) || divTeamIds.has(g.awayId));
}

function refreshTable(body) {
  const box = body.querySelector('#sim-table');
  if (box) box.innerHTML = renderTable();
  wireTable(body);
}

function refreshGames(body) {
  const box = body.querySelector('#sim-games');
  if (box) box.innerHTML = renderGames();
  wireGames(body);
}

function wireTable(body) {
  body.querySelectorAll('#sim-table tr[data-teamid]').forEach((row) => {
    row.onclick = () => {
      const scope = state.scope;
      pushSheetBack(() => openSimSheet(scope));
      openTeamSheet(Number(row.dataset.teamid));
    };
  });
}

function wireGames(body) {
  body.querySelectorAll('.sim-pick').forEach((btn) => {
    btn.onclick = () => {
      const gamePk = Number(btn.dataset.gamepk);
      const teamId = Number(btn.dataset.teamid);
      // 同じチームをもう一度押したら「未選択」に戻す
      if (picks.get(gamePk) === teamId) picks.delete(gamePk);
      else picks.set(gamePk, teamId);
      const game = state.games.find((g) => g.gamePk === gamePk);
      const row = btn.closest('.sim-game');
      if (game && row) {
        row.outerHTML = renderGameRow(game);
        wireGames(body);
      }
      refreshTable(body);
    };
  });
}

// 地区の切り替えは日程の読み直しが要るため、openSimSheet の load を呼ぶ
function wireControls(body) {
  body.querySelectorAll('[data-division]').forEach((btn) => {
    btn.onclick = () => {
      const v = btn.dataset.division;
      state.reload(wildcardLeagueOf(v) ? v : Number(v));
    };
  });
}

function wireActions(body) {
  body.querySelectorAll('[data-sweep]').forEach((btn) => {
    btn.onclick = () => {
      const teamId = Number(btn.dataset.sweep);
      state.games
        .filter((g) => g.homeId === teamId || g.awayId === teamId)
        .forEach((g) => picks.set(g.gamePk, teamId));
      refreshGames(body);
      refreshTable(body);
    };
  });
  const reset = body.querySelector('[data-reset]');
  if (reset) {
    reset.onclick = () => {
      divisionGames().forEach((g) => picks.delete(g.gamePk));
      refreshGames(body);
      refreshTable(body);
    };
  }
}

function renderLoaded(body) {
  body.innerHTML = `
    ${renderDivisionTabs()}
    <div class="sim-intro">
      ${state.league
        ? `残り試合の勝ちチームを選ぶと、${LEAGUES[state.league]}の地区首位とワイルドカード${WC_SLOTS}枠の行方が変わります。もう一度押すと未選択に戻ります。`
        : '残り試合の勝ちチームを選ぶと、順位とマジックナンバーが変わります。もう一度押すと未選択に戻ります。'}
    </div>
    <div class="division-block">
      <div class="division-header">${state.league ? `${LEAGUES[state.league]} ワイルドカード争い` : DIVISIONS[state.divisionId]}のシミュレーション結果</div>
      <div id="sim-table">${renderTable()}</div>
    </div>
    <div class="section-title" style="margin-top:18px;">残り試合<span class="count">時刻は日本時間</span></div>
    ${renderQuickActions()}
    <div id="sim-games">${renderGames()}</div>
    <div class="sim-footnote">
      順位は勝率→直接対決の順で並べた目安です（3球団以上の同率は簡易的に処理しています）。
      マジックナンバーは直接対決の勝ち越し（同地区は13試合中7勝、別地区は対戦数の過半数）が確定していれば1つ減らしています。
      ${state.league ? `ワイルドカードのM・Eは圏外の先頭／WC${WC_SLOTS}位との比較で、地区首位の入れ替わりまでは織り込んでいない目安です。` : ''}
      選んだ勝敗はこの端末のメモリ上だけに保持され、アプリを閉じると元に戻ります。
    </div>
  `;
  wireControls(body);
  wireTable(body);
  wireActions(body);
  wireGames(body);
}

// ワイルドカード争いで日程を読み込む球団（＝まだポストシーズン進出の目が残っている球団）。
// 全勝しても「自地区の首位」にも「自分以外のWC3位」にも届かない球団は、どの勝敗を選んでも
// 結果に関わらないので省く（リーグ15球団ぶんの日程を毎回取りに行かないため）。
function wildcardContenders(teams, league) {
  const leagueTeams = teams.filter((t) => TEAMS[t.id].league === league);
  const byDiv = new Map();
  leagueTeams.forEach((t) => {
    if (!byDiv.has(t.divisionId)) byDiv.set(t.divisionId, []);
    byDiv.get(t.divisionId).push(t);
  });
  const leaderIds = new Set([...byDiv.values()].map((list) => [...list].sort((a, b) => b.wins - a.wins)[0].id));
  const ids = new Set();
  for (const t of leagueTeams) {
    const maxWins = t.wins + remaining(t);
    const divLeader = [...byDiv.get(t.divisionId)].filter((x) => x.id !== t.id).sort((a, b) => b.wins - a.wins)[0];
    const wcRivals = leagueTeams.filter((x) => x.id !== t.id && !leaderIds.has(x.id)).sort((a, b) => b.wins - a.wins);
    const cut = wcRivals[WC_SLOTS - 1];
    if (leaderIds.has(t.id) || !divLeader || maxWins >= divLeader.wins || !cut || maxWins >= cut.wins) ids.add(t.id);
  }
  return ids;
}

// 指定した球団の日程をまとめて取得する（球団ごとに cachedFetch のキャッシュが効く）
async function loadSchedules(teamIds, season) {
  const results = await Promise.all(teamIds.map((id) => getTeamRegularSeasonSchedule(id, season)));
  return results.flatMap((r) => r.games);
}

// 地区5球団の日程をまとめて取得する
async function loadDivision(divisionId, season) {
  const teamIds = Object.keys(TEAMS).map(Number).filter((id) => TEAMS[id].division === divisionId);
  const results = await Promise.all(teamIds.map((id) => getTeamRegularSeasonSchedule(id, season)));
  return results.flatMap((r) => r.games);
}

// scope は地区ID（数値）か、ワイルドカード争いの 'wc103' / 'wc104'
export async function openSimSheet(divisionId = 201) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop is-full" id="sheet-backdrop">
      <div class="sheet full-sheet">
        <div class="full-sheet-bar">
          <button class="full-sheet-btn back" id="sheet-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m14 6-6 6 6 6"/></svg>元に戻る
          </button>
          <span class="full-sheet-title">順位シミュレーション</span>
        </div>
        <div class="full-sheet-body" id="sim-body"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  document.getElementById('sheet-back').onclick = () => closeSheet(root);
  const body = document.getElementById('sim-body');
  const season = currentSeasonYear();

  // 地区を切り替えたときに日程を読み直せるよう、読み込みは地区単位で行う
  const load = async (scope) => {
    body.innerHTML = '<div class="spinner"></div>';
    const league = wildcardLeagueOf(scope);
    try {
      let teams;
      let games;
      let contenderIds = null;
      if (league) {
        // ワイルドカードは「どの球団の日程が要るか」を順位表から決めるので、順番に取得する
        const { data } = await getStandings(season);
        teams = toSimTeams(data.records);
        contenderIds = wildcardContenders(teams, league);
        games = contenderIds.size ? await loadSchedules([...contenderIds], season) : [];
      } else {
        const [{ data }, divGames] = await Promise.all([getStandings(season), loadDivision(scope, season)]);
        teams = toSimTeams(data.records);
        games = divGames;
      }
      const hasData = league
        ? teams.some((t) => TEAMS[t.id].league === league)
        : teams.some((t) => t.divisionId === scope);
      if (!hasData) {
        body.innerHTML = `<div class="empty-state">順位表データがないため、シミュレーションできません。</div>`;
        return;
      }
      const digest = digestSchedules(games);
      state = {
        scope,
        divisionId: league ? null : scope,
        league,
        contenderIds,
        teams,
        h2h: digest.h2h,
        meetings: digest.meetings,
        games: digest.games,
        reload: load,
      };
      renderLoaded(body);
    } catch (e) {
      body.innerHTML = `<div class="empty-state">日程を取得できませんでした。通信状況をご確認のうえ、後ほどお試しください。</div>`;
    }
  };
  await load(divisionId);
}
