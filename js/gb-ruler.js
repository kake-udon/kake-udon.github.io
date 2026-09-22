// 「ゲーム差ものさし」：地区内のゲーム差を1本の横軸の上に並べて、
// 差の大きさを目で見て掴めるようにする表示モード。
// 追加のAPI呼び出しは不要で、順位表（getStandings）の teamRecords だけで組み立てる。
import { teamColor, teamShort, teamName } from './teams.js';
import { psClass } from './postseason.js';

// gamesBack は首位が '-'、それ以外は '7.0' のような文字列。数値（ゲーム差）に直す。
export function gamesBackValue(tr) {
  const raw = tr && tr.gamesBack;
  if (raw === '-' || raw === undefined || raw === null || raw === '') return 0;
  const n = parseFloat(String(raw));
  return Number.isNaN(n) ? 0 : n;
}

// 横軸は25ゲーム差で固定する（最下位のゲーム差で軸が伸び縮みすると地区間で比べにくいため）。
// これを超えるチームはものさしに載せず「表示なし」とする。
const RULER_MAX = 25;
const TICK_STEP = 5;

function ticksFor(max) {
  const ticks = [];
  for (let v = 0; v <= max; v += TICK_STEP) ticks.push(v);
  return ticks;
}

// 1地区分のものさし。records は同一地区の teamRecord 配列。
// showNote は軸の読み方の補足を添えるか（順位表では最初の地区にだけ付ける）。
export function renderGbRuler(divisionLabel, records, showNote = false) {
  if (!records || !records.length) return '';
  const rows = [...records].sort((a, b) => (a.divisionRank || 99) - (b.divisionRank || 99));
  const max = RULER_MAX;
  const inRange = rows.filter((tr) => gamesBackValue(tr) <= max);
  const outOfRange = rows.filter((tr) => gamesBackValue(tr) > max);

  const marks = inRange.map((tr) => {
    const gb = gamesBackValue(tr);
    const ratio = max ? gb / max : 0;
    const label = gb === 0 ? '首位' : `-${gb.toFixed(1)}`;
    return `
      <div class="gb-row ${psClass(tr)}" data-teamid="${tr.team.id}" role="button" tabindex="0" aria-label="${teamName(tr.team.id)} ゲーム差 ${label}">
        <div class="gb-track">
          <div class="gb-mark" style="--x:${ratio.toFixed(4)}">
            <span class="gb-pennant" style="background:${teamColor(tr.team.id)}">${teamShort(tr.team.id)}</span>
            <span class="gb-value">${label}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const ticks = ticksFor(max).map((v) => {
    const ratio = max ? v / max : 0;
    return `<span class="gb-tick" style="--x:${ratio.toFixed(4)}"><i></i><em>${v}</em></span>`;
  }).join('');

  return `
    <div class="gb-ruler-card">
      <div class="gb-ruler-head">ゲーム差ものさし<span class="gb-ruler-sub">${divisionLabel}</span></div>
      <div class="gb-ruler-body">
        ${marks}
        <div class="gb-axis-line"></div>
        <div class="gb-axis-ticks">${ticks}</div>
      </div>
      ${outOfRange.length ? `<div class="gb-ruler-note">表示なし（${max}ゲーム差超）：${outOfRange.map((tr) => teamShort(tr.team.id)).join('・')}</div>` : ''}
      ${showNote ? '<div class="gb-ruler-note">左端が首位。右へ離れるほど首位とのゲーム差が大きい。目盛りの単位はゲーム差。</div>' : ''}
    </div>
  `;
}
