// 順位シミュレーションの全画面シート。
// 地区の残り試合の勝敗を1試合ずつ選ぶと、仮の順位表・ゲーム差・地区優勝マジックがその場で変わる。
// 計算は js/standings-sim.js（UI非依存の純粋関数）に任せ、ここでは
// 「APIのレスポンスを standings-sim.js のデータ形式に直す」ことと表示だけを受け持つ。
//
// データの出どころ：
//   勝敗 … getStandings（順位表画面と同じレスポンス）
//   直接対決成績・残り試合 … 地区5球団ぶんの getTeamRegularSeasonSchedule
// 選んだ勝敗はメモリ上にだけ持つ（アプリを開き直すと消える。実際の成績と混ざらないようにするため）。
import { getStandings, getTeamRegularSeasonSchedule, currentSeasonYear, toJstDateString, formatJstTime, formatJstDateLabel } from './api.js';
import { TEAMS, DIVISIONS, teamName, teamShort, teamColor } from './teams.js';
import { closeSheet, pushSheetBack } from './sheet-stack.js';
import { openTeamSheet } from './team-sheet.js';
import {
  applyPicks, divisionMagic, sortDivision, gamesBehind, remaining, hasTiebreaker,
} from './standings-sim.js';

// 地区の切り替えボタン（順位表画面と同じ ア東・ア中・ア西・ナ東・ナ中・ナ西 の順）
const DIVISION_TABS = [
  { id: 201, label: 'ア東' },
  { id: 202, label: 'ア中' },
  { id: 200, label: 'ア西' },
  { id: 204, label: 'ナ東' },
  { id: 205, label: 'ナ中' },
  { id: 203, label: 'ナ西' },
];

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
  const games = [];
  for (const entries of byPk.values()) {
    const done = entries.find(isCompleted);
    if (done) {
      const winnerId = winnerIdOf(done);
      const awayId = sideId(done, 'away');
      const homeId = sideId(done, 'home');
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
    games.push({
      gamePk: live.gamePk,
      homeId,
      awayId,
      gameDate: live.gameDate,
      isLive: live.status && live.status.abstractGameState === 'Live',
    });
  }
  games.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  return { h2h, games };
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
            ${teamName(t.id)}
            ${rankMoveTag(move)}
          </div>
        </td>
        <td>${t.wins}${addW ? `<small class="sim-add">+${addW}</small>` : ''}</td>
        <td>${t.losses}${addL ? `<small class="sim-add">+${addL}</small>` : ''}</td>
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
        <tr><th>チーム</th><th>勝</th><th>敗</th><th>差</th><th title="残り試合数（目安）">残</th><th title="地区優勝のマジックナンバー">優勝</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sim-status">残り${state.games.length}試合のうち <b>${picked}</b> 試合の勝敗を選択中</div>
    ${notes.map((n) => `<div class="sim-tie-note">${n}</div>`).join('')}
  `;
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
  const divTeamIds = new Set(state.teams.filter((t) => t.divisionId === state.divisionId).map((t) => t.id));
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
  const divTeams = state.teams.filter((t) => t.divisionId === state.divisionId);
  const pills = divTeams.map((t) => `
    <button class="filter-pill" data-sweep="${t.id}"><span class="team-dot" style="background:${teamColor(t.id)}"></span>${teamShort(t.id)} 全勝</button>
  `).join('');
  return `
    <div class="sim-actions">
      <div class="filter-pill-group">${pills}</div>
      <button class="filter-pill sim-reset" data-reset="1">この地区の選択をリセット</button>
    </div>
  `;
}

function renderDivisionTabs() {
  return `
    <div class="filter-pill-group sim-division-tabs">
      ${DIVISION_TABS.map((d) => `<button class="filter-pill ${d.id === state.divisionId ? 'active' : ''}" data-division="${d.id}">${d.label}</button>`).join('')}
    </div>
  `;
}

function divisionGames() {
  const divTeamIds = new Set(state.teams.filter((t) => t.divisionId === state.divisionId).map((t) => t.id));
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
      const divisionId = state.divisionId;
      pushSheetBack(() => openSimSheet(divisionId));
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
    btn.onclick = () => state.reload(Number(btn.dataset.division));
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
      残り試合の勝ちチームを選ぶと、順位とマジックナンバーが変わります。もう一度押すと未選択に戻ります。
    </div>
    <div class="division-block">
      <div class="division-header">${DIVISIONS[state.divisionId]}のシミュレーション結果</div>
      <div id="sim-table">${renderTable()}</div>
    </div>
    <div class="section-title" style="margin-top:18px;">残り試合<span class="count">時刻は日本時間</span></div>
    ${renderQuickActions()}
    <div id="sim-games">${renderGames()}</div>
    <div class="sim-footnote">
      順位は勝率→直接対決の順で並べた目安です（3球団以上の同率は簡易的に処理しています）。
      マジックナンバーは直接対決の勝ち越し（13試合中7勝）が確定していれば1つ減らしています。
      選んだ勝敗はこの端末のメモリ上だけに保持され、アプリを閉じると元に戻ります。
    </div>
  `;
  wireControls(body);
  wireTable(body);
  wireActions(body);
  wireGames(body);
}

// 地区5球団の日程をまとめて取得する（球団ごとに cachedFetch のキャッシュが効く）
async function loadDivision(divisionId, season) {
  const teamIds = Object.keys(TEAMS).map(Number).filter((id) => TEAMS[id].division === divisionId);
  const results = await Promise.all(teamIds.map((id) => getTeamRegularSeasonSchedule(id, season)));
  return results.flatMap((r) => r.games);
}

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
  const load = async (divId) => {
    body.innerHTML = '<div class="spinner"></div>';
    try {
      const [{ data }, games] = await Promise.all([getStandings(season), loadDivision(divId, season)]);
      const teams = toSimTeams(data.records);
      if (!teams.some((t) => t.divisionId === divId)) {
        body.innerHTML = `<div class="empty-state">順位表データがないため、シミュレーションできません。</div>`;
        return;
      }
      const digest = digestSchedules(games);
      state = { divisionId: divId, teams, h2h: digest.h2h, games: digest.games, reload: load };
      renderLoaded(body);
    } catch (e) {
      body.innerHTML = `<div class="empty-state">日程を取得できませんでした。通信状況をご確認のうえ、後ほどお試しください。</div>`;
    }
  };
  await load(divisionId);
}
