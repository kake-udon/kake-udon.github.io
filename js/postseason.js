// ポストシーズン表現：順位表の行区分と、ワイルドカード争いカード。
// 追加のAPI呼び出しは不要で、既存 getStandings() のレスポンス（teamRecords）だけで算出する。
import { TEAMS, teamName, teamColor, teamShort } from './teams.js';

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

// リーグ（103=ア / 104=ナ）ごとのワイルドカード争い。
// records は getStandings() の data.records（地区ごとの配列）。
export function wildcardRace(records, leagueId) {
  const rows = [];
  (records || []).forEach((rec) => {
    (rec.teamRecords || []).forEach((tr) => {
      const meta = TEAMS[tr.team.id];
      if (!meta || meta.league !== leagueId) return;
      if (tr.divisionLeader === true) return; // 地区首位はWC争いから除外
      rows.push(tr);
    });
  });
  rows.sort((a, b) => {
    const ra = Number(a.wildCardRank || 99);
    const rb = Number(b.wildCardRank || 99);
    if (ra !== rb) return ra - rb;
    return (b.wins || 0) - (a.wins || 0);
  });
  return rows.slice(0, 6);
}

export function renderWildcardCard(records, leagueId, leagueLabel) {
  const rows = wildcardRace(records, leagueId);
  if (!rows.length) {
    return `<div class="empty-state">ワイルドカードの順位を取得できませんでした。</div>`;
  }
  const html = rows.map((tr, i) => {
    const inRace = i < 3;
    const gb = tr.wildCardGamesBack === '-' ? '—' : (tr.wildCardGamesBack || '—');
    return `
      <div class="wc-row ${inRace ? 'in' : 'out'} ${i === 2 ? 'cutline' : ''}" data-teamid="${tr.team.id}">
        <span class="wc-slot">${inRace ? 'WC' + (i + 1) : i + 1}</span>
        <span class="team-dot" style="background:${teamColor(tr.team.id)}"></span>
        <span class="wc-abbr">${teamShort(tr.team.id)}</span>
        <span class="wc-name">${teamName(tr.team.id)}</span>
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
