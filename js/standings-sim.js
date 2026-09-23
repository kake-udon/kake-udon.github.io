// standings-sim.js
// MLB Watch: 順位シミュレーション用ロジック（UI非依存・純粋関数）
//
// データ形式
//   teams: [{ id, name, wins, losses, divisionId }]
//   h2h:   { [teamId]: { [opponentId]: 勝利数 } }  … 今季の直接対決成績
//   picks: [{ gamePk, homeId, awayId, winnerId }] … winnerId=null は未選択

export const SEASON_GAMES = 162;
export const DIVISION_SERIES_GAMES = 13; // 同地区チームとの対戦数

export const pct = t => (t.wins + t.losses === 0 ? 0 : t.wins / (t.wins + t.losses));
export const remaining = t => SEASON_GAMES - t.wins - t.losses;

const h2hWins = (h2h, a, b) => h2h?.[a]?.[b] ?? 0;

/**
 * 仮の試合結果を順位表と直接対決成績に反映する（元データは変更しない）
 */
export function applyPicks(teams, h2h, picks) {
  const map = new Map(teams.map(t => [t.id, { ...t }]));
  const newH2h = structuredClone(h2h ?? {});

  for (const g of picks) {
    if (g.winnerId == null) continue;
    const loserId = g.winnerId === g.homeId ? g.awayId : g.homeId;
    if (map.has(g.winnerId)) map.get(g.winnerId).wins++;
    if (map.has(loserId)) map.get(loserId).losses++;

    // 直接対決だった場合はタイブレーカー用の成績も更新
    newH2h[g.winnerId] ??= {};
    newH2h[g.winnerId][loserId] = (newH2h[g.winnerId][loserId] ?? 0) + 1;
  }
  return { teams: [...map.values()], h2h: newH2h };
}

/**
 * a が b に対してタイブレーカーを「確定」させているか
 * （対戦の過半数を勝っていれば、残り対戦の結果に関係なく確定）
 */
export function hasTiebreaker(h2h, a, b, seriesGames = DIVISION_SERIES_GAMES) {
  return h2hWins(h2h, a, b) > seriesGames / 2;
}

/**
 * team から見た rival に対するマジックナンバー
 * 0 なら rival に対して確定
 * seriesGames は2球団の今季の対戦数（同地区13。別地区とのワイルドカード争いでは6〜7）
 */
export function magicNumber(team, rival, h2h, seriesGames = DIVISION_SERIES_GAMES) {
  const tb = hasTiebreaker(h2h, team.id, rival.id, seriesGames) ? 1 : 0;
  return Math.max(SEASON_GAMES + 1 - team.wins - rival.losses - tb, 0);
}

/** 地区内で脱落済みか */
export function isEliminated(team, divisionTeams, h2h) {
  return divisionTeams.some(r => r.id !== team.id && magicNumber(r, team, h2h) === 0);
}

/**
 * 地区優勝マジック
 * 戻り値: 数値（0 = 優勝決定） / null（脱落済み）
 */
export function divisionMagic(team, divisionTeams, h2h) {
  if (isEliminated(team, divisionTeams, h2h)) return null;
  const rivals = divisionTeams.filter(r => r.id !== team.id);
  return Math.max(0, ...rivals.map(r => magicNumber(team, r, h2h)));
}

/**
 * 地区順位（勝率 → 直接対決の順。3チーム以上の同率は簡易処理）
 */
export function sortDivision(divisionTeams, h2h) {
  return [...divisionTeams].sort((a, b) => {
    const diff = pct(b) - pct(a);
    if (Math.abs(diff) > 1e-9) return diff;
    return h2hWins(h2h, b.id, a.id) - h2hWins(h2h, a.id, b.id);
  });
}

/** 勝率の表示（.588 の形。0勝0敗は .000） */
export function formatPct(t) {
  return pct(t).toFixed(3).replace(/^0/, '');
}

/**
 * ワイルドカード争い（1リーグぶん）
 *   leagueTeams: リーグ15球団（applyPicks 済み）
 *   meetings:    { [a]: { [b]: 今季の対戦数 } } … 別地区どうしのタイブレーカー判定に使う
 * 戻り値:
 *   divisionWinners: 各地区の首位（勝率順）。{ team, magic }（magic は地区優勝マジック）
 *   wildcard:        地区首位以外の並び（勝率 → 直接対決）。{ team, rank, status, value }
 *     status: 'clinched'（WC確保）| 'magic'（M value）| 'alive'（E value）| 'eliminated'（敗退）
 * 地区首位が入れ替わると別の球団がWC争いに加わるため、判定はあくまで目安。
 */
export function wildcardRace(leagueTeams, h2h, meetings = {}, slots = 3) {
  const seriesOf = (a, b) => meetings?.[a]?.[b] ?? DIVISION_SERIES_GAMES;
  const byDivision = new Map();
  for (const t of leagueTeams) {
    if (!byDivision.has(t.divisionId)) byDivision.set(t.divisionId, []);
    byDivision.get(t.divisionId).push(t);
  }
  const winners = [];
  for (const teams of byDivision.values()) {
    const [top] = sortDivision(teams, h2h);
    winners.push({ team: top, magic: divisionMagic(top, teams, h2h) });
  }
  winners.sort((a, b) => pct(b.team) - pct(a.team));
  const winnerIds = new Set(winners.map((w) => w.team.id));

  const others = sortDivision(leagueTeams.filter((t) => !winnerIds.has(t.id)), h2h);
  const wildcard = others.map((t, i) => {
    const divTeams = byDivision.get(t.divisionId) || [];
    const divAlive = divisionMagic(t, divTeams, h2h) !== null;
    if (i < slots) {
      // 圏内：圏外の先頭（WC4位）に対するマジック
      const firstOut = others[slots];
      const m = firstOut ? magicNumber(t, firstOut, h2h, seriesOf(t.id, firstOut.id)) : 0;
      return { team: t, rank: i + 1, status: m === 0 ? 'clinched' : 'magic', value: m };
    }
    // 圏外：当落線（WC3位）が t を上回るまでの数。地区優勝の目が残っていれば敗退にはしない
    const cutline = others[slots - 1];
    const e = magicNumber(cutline, t, h2h, seriesOf(cutline.id, t.id));
    if (e === 0 && !divAlive) return { team: t, rank: i + 1, status: 'eliminated', value: 0 };
    return { team: t, rank: i + 1, status: 'alive', value: e, divisionAlive: divAlive };
  });
  return { divisionWinners: winners, wildcard };
}

/** 首位とのゲーム差 */
export function gamesBehind(leader, team) {
  return ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2;
}

/*
使用例（今回のア・リーグ中地区のケース）

const teams = [
  { id: 114, name: 'Guardians',  wins: 82, losses: 75, divisionId: 202 },
  { id: 145, name: 'White Sox',  wins: 81, losses: 76, divisionId: 202 },
];
const h2h = { 145: { 114: 7 }, 114: { 145: 6 } };
const picks = [
  { gamePk: 1, homeId: 111, awayId: 114, winnerId: 111 }, // CLE 負け
  { gamePk: 2, homeId: 118, awayId: 145, winnerId: 145 }, // CWS 勝ち
];

const sim = applyPicks(teams, h2h, picks);
const [cle, cws] = sim.teams;
divisionMagic(cws, sim.teams, sim.h2h); // → 4
divisionMagic(cle, sim.teams, sim.h2h); // → 5
*/
