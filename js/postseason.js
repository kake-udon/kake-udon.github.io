// ポストシーズン表現：順位表の行区分、マジックナンバー／敗退マジックの算出、
// ワイルドカード争いカード。
// 追加のAPI呼び出しは不要で、既存 getStandings() のレスポンス（teamRecords）だけで算出する。
import { TEAMS, teamName, teamColor, teamShort } from './teams.js';

export const TOTAL_GAMES = 162;

// wildCardGamesBack は「-」＝WC首位、「+2.0」＝圏内で余裕あり、「1.5」＝圏外で追う側。
function wcgbValue(tr) {
  const raw = tr.wildCardGamesBack;
  if (raw === '-' || raw === undefined || raw === null) return 0;
  const n = parseFloat(String(raw).replace('+', ''));
  return Number.isNaN(n) ? null : (String(raw).startsWith('+') ? n : -n);
}

// 行に付けるクラス。card-shop-theme.css が左端の色帯として描画する。
//   ps-division … 地区首位（金）
//   ps-wildcard … WC圏内（緑）
//   ps-bubble   … 当落線上（2.0ゲーム差以内、赤）
//   ''          … 圏外
export function psClass(tr) {
  if (!tr) return '';
  if (tr.divisionLeader === true) return 'ps-division';
  const v = wcgbValue(tr);
  if (v === null) return '';
  if (v >= 0) return 'ps-wildcard';
  return v > -2.5 ? 'ps-bubble' : '';
}

export function psLabel(tr) {
  const cls = psClass(tr);
  if (cls === 'ps-division') return '地区首位';
  if (cls === 'ps-wildcard') return `WC${tr.wildCardRank || ''}`;
  if (cls === 'ps-bubble') return '当落';
  return '';
}

// --- 残り試合数・マジックナンバー・敗退マジック ---
// MLB Stats API に magicNumber / eliminationNumber などが入っていればそれを使い、
// 入っていなければ勝敗と残り試合から自前で計算する（フィールドの有無を実レスポンスで
// 確認できていないため、どちらでも動く形にしてある）。

// 残り試合数。gamesPlayed が無い場合は勝敗数の合計から求める。
// 引き分け・中止の振替などで実際の残り試合とはずれることがあるため、あくまで目安。
export function gamesRemaining(tr) {
  if (!tr) return null;
  const played = Number(tr.gamesPlayed);
  const n = Number.isFinite(played) && played > 0 ? played : Number(tr.wins) + Number(tr.losses);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, TOTAL_GAMES - n);
}

// APIが返すマジックナンバー系の値を数値に直す。"E"（敗退）は0、"-"や空は未提供として null。
function apiRaceNumber(value) {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  if (String(value).toUpperCase() === 'E') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// leader が chaser を必ず上回るために必要な「leaderの勝ち＋chaserの負け」の合計数。
// 162試合制では M = 163 - (leaderの勝ち) - (chaserの負け)。0なら決着済み。
export function magicNumberOver(leader, chaser) {
  if (!leader || !chaser) return null;
  const w = Number(leader.wins);
  const l = Number(chaser.losses);
  if (!Number.isFinite(w) || !Number.isFinite(l)) return null;
  return Math.max(0, TOTAL_GAMES + 1 - w - l);
}

// ワイルドカード争いの並び順（順位 → 勝ち数）。争いカードと当落線の算出で共通に使う。
function byWildcardOrder(a, b) {
  const ra = Number(a.wildCardRank || 99);
  const rb = Number(b.wildCardRank || 99);
  if (ra !== rb) return ra - rb;
  return (b.wins || 0) - (a.wins || 0);
}

// 地区・リーグごとのインデックスと、各リーグのワイルドカード当落線を先に作っておく。
// 1行ぶんの判定のたびに全records を走査しないための下ごしらえ。
export function buildRaceContext(records) {
  const byDivision = new Map(); // divisionId -> teamRecord[]
  const byLeague = new Map();   // leagueId -> teamRecord[]（地区首位を含む）
  (records || []).forEach((rec) => {
    (rec.teamRecords || []).forEach((tr) => {
      const meta = TEAMS[tr.team && tr.team.id];
      if (!meta) return;
      if (!byDivision.has(meta.division)) byDivision.set(meta.division, []);
      byDivision.get(meta.division).push(tr);
      if (!byLeague.has(meta.league)) byLeague.set(meta.league, []);
      byLeague.get(meta.league).push(tr);
    });
  });

  // WC枠は各リーグ3つ。当落線＝WC3位、その次（追う側の先頭）＝WC4位。
  const wcCutline = new Map();
  const wcFirstOut = new Map();
  for (const [leagueId, list] of byLeague) {
    const contenders = list.filter((tr) => tr.divisionLeader !== true).sort(byWildcardOrder);
    wcCutline.set(leagueId, contenders[2] || null);
    wcFirstOut.set(leagueId, contenders[3] || null);
  }
  return { byDivision, byLeague, wcCutline, wcFirstOut };
}

function divisionOf(tr) {
  const meta = TEAMS[tr.team && tr.team.id];
  return meta ? meta.division : null;
}

function leagueOf(tr) {
  const meta = TEAMS[tr.team && tr.team.id];
  return meta ? meta.league : null;
}

// 地区優勝のマジックナンバー（首位が対象）。相手は同地区の2位。
function divisionMagic(ctx, tr) {
  const api = apiRaceNumber(tr.magicNumber);
  if (api !== null) return api;
  const list = ctx.byDivision.get(divisionOf(tr)) || [];
  const rivals = list
    .filter((x) => x !== tr)
    .sort((a, b) => Number(a.divisionRank || 99) - Number(b.divisionRank || 99));
  return magicNumberOver(tr, rivals[0]);
}

// 同じチームの記録かどうか（自分自身を比較相手にしてしまわないための判定）
function isSameTeam(a, b) {
  if (!a || !b) return false;
  return a === b || (a.team && b.team && a.team.id === b.team.id);
}

// ワイルドカード枠を確保するマジックナンバー（WC圏内のチームが対象）。相手はWC4位。
// 対象チーム自身がWC4位のときは「圏内」ではないので数字を出さない。
function wildcardMagic(ctx, tr) {
  const api = apiRaceNumber(tr.wildCardMagicNumber);
  if (api !== null) return api;
  const rival = ctx.wcFirstOut.get(leagueOf(tr));
  if (isSameTeam(rival, tr)) return null;
  return magicNumberOver(tr, rival);
}

// ポストシーズン進出の可能性が消えるまでの数（＝敗退マジック）。
// 地区優勝の目とワイルドカードの目のどちらかが残っていれば可能性は残るため、
// 2つの敗退マジックのうち大きい方を採る（あくまで目安の計算）。
function eliminationNumber(ctx, tr) {
  const list = ctx.byDivision.get(divisionOf(tr)) || [];
  const leader = list.find((x) => x.divisionLeader === true);
  const apiDiv = apiRaceNumber(tr.eliminationNumber);
  const apiWc = apiRaceNumber(tr.wildCardEliminationNumber);
  const cutline = ctx.wcCutline.get(leagueOf(tr));
  const div = apiDiv !== null ? apiDiv : (isSameTeam(leader, tr) ? null : magicNumberOver(leader, tr));
  const wc = apiWc !== null ? apiWc : (isSameTeam(cutline, tr) ? null : magicNumberOver(cutline, tr));
  const values = [div, wc].filter((v) => v !== null && v !== undefined);
  if (!values.length) return null;
  return Math.max(...values);
}

// clinchIndicator の種別。APIが返さない場合は clinched フラグから種別を推定する。
const CLINCH_LABELS = { z: 'リーグ最高勝率', y: '地区優勝', w: 'WC確保', x: 'PS進出', e: '敗退' };

function clinchInfo(tr) {
  const ind = String(tr.clinchIndicator || '').toLowerCase();
  if (CLINCH_LABELS[ind]) return { kind: ind, label: CLINCH_LABELS[ind] };
  if (tr.clinched === true) {
    return tr.divisionLeader === true
      ? { kind: 'y', label: '地区優勝' }
      : { kind: 'x', label: 'PS進出' };
  }
  return null;
}

// 順位表の1行に出す「あと何勝で決まるか／もう届かないか」。
// 表示（バッジのHTML）は standings.js 側に持たせ、ここでは判定結果だけを返す。
//   kind: 'clinched' | 'eliminated' | 'magic' | 'elimination' | null
//   scope: マジックナンバーの対象（'division' | 'wildcard'）
export function raceInfo(ctx, tr) {
  const remaining = gamesRemaining(tr);
  const base = { remaining, kind: null, value: null, scope: null, clinch: null };
  if (!ctx || !tr) return base;

  const clinch = clinchInfo(tr);
  if (clinch) {
    return { ...base, kind: clinch.kind === 'e' ? 'eliminated' : 'clinched', clinch };
  }

  if (tr.divisionLeader === true) {
    const n = divisionMagic(ctx, tr);
    if (n === 0) return { ...base, kind: 'clinched', clinch: { kind: 'y', label: '地区優勝' } };
    if (n === null) return base;
    return { ...base, kind: 'magic', value: n, scope: 'division' };
  }

  if (psClass(tr) === 'ps-wildcard') {
    const n = wildcardMagic(ctx, tr);
    if (n === 0) return { ...base, kind: 'clinched', clinch: { kind: 'w', label: 'WC確保' } };
    if (n === null) return base;
    return { ...base, kind: 'magic', value: n, scope: 'wildcard' };
  }

  const e = eliminationNumber(ctx, tr);
  if (e === 0) return { ...base, kind: 'eliminated', clinch: { kind: 'e', label: '敗退' } };
  if (e === null) return base;
  return { ...base, kind: 'elimination', value: e };
}

export function isEliminated(ctx, tr) {
  return raceInfo(ctx, tr).kind === 'eliminated';
}

// リーグ（103=ア / 104=ナ）ごとのワイルドカード争い。
// records は getStandings() の data.records（地区ごとの配列）。
// 地区首位が確定してWC争いから抜けるチームが出ても行数が足りるよう「圏内3＋圏外4」を既定にし、
// 敗退が確定したチームは争いの下に落とす（並びのなかに紛れて見えなくならないようにする）。
export function wildcardRace(records, leagueId, ctx = null, limit = 7) {
  const rows = [];
  (records || []).forEach((rec) => {
    (rec.teamRecords || []).forEach((tr) => {
      const meta = TEAMS[tr.team.id];
      if (!meta || meta.league !== leagueId) return;
      if (tr.divisionLeader === true) return; // 地区首位はWC争いから除外
      rows.push(tr);
    });
  });
  rows.sort(byWildcardOrder);
  if (!ctx) return rows.slice(0, limit);
  const alive = rows.filter((tr) => !isEliminated(ctx, tr));
  const done = rows.filter((tr) => isEliminated(ctx, tr));
  return [...alive, ...done].slice(0, limit);
}

export function renderWildcardCard(records, leagueId, leagueLabel, ctx = null) {
  const rows = wildcardRace(records, leagueId, ctx);
  if (!rows.length) {
    return `<div class="empty-state">ワイルドカードの順位を取得できませんでした。</div>`;
  }
  const html = rows.map((tr, i) => {
    const inRace = i < 3;
    const out = ctx ? isEliminated(ctx, tr) : false;
    const gb = tr.wildCardGamesBack === '-' ? '—' : (tr.wildCardGamesBack || '—');
    return `
      <div class="wc-row ${inRace ? 'in' : 'out'} ${i === 2 ? 'cutline' : ''} ${out ? 'is-eliminated' : ''}" data-teamid="${tr.team.id}">
        <span class="wc-slot">${inRace ? 'WC' + (i + 1) : i + 1}</span>
        <span class="team-dot" style="background:${teamColor(tr.team.id)}"></span>
        <span class="wc-abbr">${teamShort(tr.team.id)}</span>
        <span class="wc-name">${teamName(tr.team.id)}${out ? '<span class="wc-out-tag">敗退</span>' : ''}</span>
        <span class="wc-wl">${tr.wins}-${tr.losses}</span>
        <span class="wc-gb">${gb}</span>
      </div>
      ${i === 2 ? '<div class="wc-cutline-label">ここまでポストシーズン進出</div>' : ''}
    `;
  }).join('');

  return `
    <div class="wc-card">
      <div class="section-title" style="margin-top:0;">ワイルドカード争い<span class="count">${leagueLabel}</span></div>
      ${html}
      <div class="wc-legend">
        <span><i class="lg-division"></i>地区首位</span>
        <span><i class="lg-wildcard"></i>WC圏内</span>
        <span><i class="lg-bubble"></i>当落線上</span>
      </div>
    </div>
  `;
}
