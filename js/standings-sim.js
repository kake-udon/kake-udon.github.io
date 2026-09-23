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
 */
export function magicNumber(team, rival, h2h) {
  const tb = hasTiebreaker(h2h, team.id, rival.id) ? 1 : 0;
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
