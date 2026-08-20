import { getTeamScheduleByJstMonth, getStandings, getTeamRoster, toJstDateString, formatJstTime, currentSeasonYear } from './api.js';
import { teamName, teamShort, teamColor, DIVISIONS } from './teams.js';
import { getFavorites, toggleFavorite } from './db.js';
import { openGameSheet } from './game-sheet.js';
import { openPlayerSheet, positionJa } from './player-sheet.js';
import { closeSheet, pushSheetBack } from './sheet-stack.js';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function starIcon(filled) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>`;
}

export async function openTeamSheet(teamId) {
  const root = document.getElementById('sheet-root');
  const favorites = await getFavorites();
  let isFav = favorites.some((f) => f.favKey === `team:${teamId}`);

  const todayJst = toJstDateString();
  const [todayYear, todayMonth] = todayJst.split('-').map(Number);
  let viewYear = todayYear;
  let viewMonth = todayMonth;

  root.innerHTML = `
    <div class="sheet-backdrop" id="sheet-backdrop">
      <div class="sheet">
        <div class="sheet-header">
          <h2><span class="team-dot" style="background:${teamColor(teamId)}"></span>${teamName(teamId)}</h2>
          <div class="sheet-header-actions">
            <button class="fav-toggle-btn ${isFav ? 'active' : ''}" id="sheet-fav-btn" aria-label="お気に入り登録・解除">${starIcon(isFav)}</button>
            <button class="sheet-close" id="sheet-close">×</button>
          </div>
        </div>
        <div id="team-standing-summary"></div>
        <div class="section-title" style="margin-top:18px;">試合カレンダー</div>
        <div class="calendar-nav">
          <button class="calendar-nav-btn" id="cal-prev" aria-label="前の月">‹</button>
          <div class="calendar-month-label" id="cal-month-label"></div>
          <button class="calendar-nav-btn" id="cal-next" aria-label="次の月">›</button>
        </div>
        <div id="team-sheet-body"><div class="spinner"></div></div>
        <div class="calendar-legend">vs：主催試合（ホーム）　@：敵地試合（ビジター）　勝／敗：試合結果　※時刻はすべて日本時間</div>
        <details class="collapsible" id="roster-collapsible" style="margin-top:18px;">
          <summary>
            <span class="section-title" style="margin:0;">選手一覧</span>
            <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </summary>
          <div id="roster-list" style="margin-top:10px;"><div class="spinner"></div></div>
        </details>
      </div>
    </div>
  `;

  const close = () => closeSheet(root);
  document.getElementById('sheet-close').onclick = close;
  document.getElementById('sheet-backdrop').onclick = (e) => {
    if (e.target.id === 'sheet-backdrop') close();
  };
  document.getElementById('sheet-fav-btn').onclick = async () => {
    isFav = await toggleFavorite({ type: 'team', id: teamId, name: teamName(teamId) });
    const btn = document.getElementById('sheet-fav-btn');
    if (!btn) return;
    btn.classList.toggle('active', isFav);
    btn.innerHTML = starIcon(isFav);
  };

  document.getElementById('cal-prev').onclick = () => {
    viewMonth -= 1;
    if (viewMonth < 1) { viewMonth = 12; viewYear -= 1; }
    loadCalendar(teamId, viewYear, viewMonth, todayJst);
  };
  document.getElementById('cal-next').onclick = () => {
    viewMonth += 1;
    if (viewMonth > 12) { viewMonth = 1; viewYear += 1; }
    loadCalendar(teamId, viewYear, viewMonth, todayJst);
  };

  let rosterLoaded = false;
  document.getElementById('roster-collapsible').addEventListener('toggle', function onToggle(e) {
    if (e.target.open && !rosterLoaded) {
      rosterLoaded = true;
      loadRoster(teamId);
    }
  });

  loadStandingSummary(teamId);
  loadCalendar(teamId, viewYear, viewMonth, todayJst);
}

async function loadRoster(teamId) {
  const target = document.getElementById('roster-list');
  if (!target) return;
  try {
    const favorites = await getFavorites();
    const favoritePlayerIds = new Set(favorites.filter((f) => f.type === 'player').map((f) => f.id));
    const { roster } = await getTeamRoster(teamId);
    const targetNow = document.getElementById('roster-list');
    if (!targetNow) return; // シートが既に閉じられている場合
    if (!roster.length) {
      targetNow.innerHTML = `<div class="empty-state">選手一覧を取得できませんでした。</div>`;
      return;
    }
    targetNow.innerHTML = `<div class="team-search-list">${roster.map((r) => renderRosterRow(r, favoritePlayerIds)).join('')}</div>`;
    wireRosterTaps(targetNow, teamId);
  } catch (e) {
    const targetNow = document.getElementById('roster-list');
    if (targetNow) targetNow.innerHTML = `<div class="empty-state">選手一覧を取得できませんでした。</div>`;
  }
}

function renderRosterRow(entry, favoritePlayerIds) {
  const person = entry.person;
  const isFav = favoritePlayerIds.has(person.id);
  return `
    <button class="player-search-row" data-personid="${person.id}">
      <span class="player-row-name">${person.fullName}</span>
      <span class="player-row-meta">${positionJa(entry.position)}</span>
      ${isFav ? '<span class="fav-star-mini">★</span>' : ''}
    </button>
  `;
}

function wireRosterTaps(container, teamId) {
  container.querySelectorAll('[data-personid]').forEach((el) => {
    el.onclick = () => {
      pushSheetBack(() => openTeamSheet(teamId));
      openPlayerSheet(Number(el.dataset.personid));
    };
  });
}

async function loadStandingSummary(teamId) {
  try {
    const { data } = await getStandings(currentSeasonYear());
    let found = null;
    for (const rec of data.records || []) {
      const tr = (rec.teamRecords || []).find((t) => t.team.id === teamId);
      if (tr) {
        found = { ...tr, divisionId: rec.division ? rec.division.id : null };
        break;
      }
    }
    const target = document.getElementById('team-standing-summary');
    if (target) target.innerHTML = renderStandingSummary(found);
  } catch (e) {
    const target = document.getElementById('team-standing-summary');
    if (target) target.innerHTML = '';
  }
}

function renderStandingSummary(standing) {
  if (!standing) return '';
  const divName = standing.divisionId && DIVISIONS[standing.divisionId] ? DIVISIONS[standing.divisionId] : '';
  return `
    <div class="standing-summary-card">
      <div class="standing-summary-row">
        <span>${divName}</span>
        <span class="standing-rank">${standing.divisionRank}位</span>
      </div>
      <div class="standing-summary-stats">
        <div><span class="stat-num">${standing.wins}</span><span class="stat-label">勝</span></div>
        <div><span class="stat-num">${standing.losses}</span><span class="stat-label">敗</span></div>
        <div><span class="stat-num">${standing.winningPercentage ?? '-'}</span><span class="stat-label">勝率</span></div>
        <div><span class="stat-num">${standing.gamesBack === '-' || !standing.gamesBack ? '-' : standing.gamesBack}</span><span class="stat-label">差</span></div>
      </div>
    </div>
  `;
}

async function loadCalendar(teamId, year, month, todayJst) {
  const labelEl = document.getElementById('cal-month-label');
  if (labelEl) labelEl.textContent = `${year}年${month}月`;

  const body = document.getElementById('team-sheet-body');
  if (body) body.innerHTML = `<div class="spinner"></div>`;

  try {
    const { byDate } = await getTeamScheduleByJstMonth(teamId, year, month);
    const target = document.getElementById('team-sheet-body');
    if (!target) return; // シートが既に閉じられている場合
    target.innerHTML = renderMonthGrid(year, month, byDate, teamId, todayJst);
    wireCalendarTaps(target, teamId);
  } catch (e) {
    const target = document.getElementById('team-sheet-body');
    if (target) target.innerHTML = `<div class="empty-state">試合カレンダーを取得できませんでした。</div>`;
  }
}

function renderMonthGrid(year, month, byDate, teamId, todayJst) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const weekdayHeader = WEEKDAY_LABELS.map((w) => `<div class="calendar-weekday">${w}</div>`).join('');

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(`<div class="calendar-cell empty"></div>`);
      continue;
    }
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const games = byDate[dateStr] || [];
    const isToday = dateStr === todayJst;
    cells.push(renderDayCell(dayNum, dateStr, games, teamId, isToday));
  }

  return `
    <div class="calendar-grid">
      ${weekdayHeader}
      ${cells.join('')}
    </div>
  `;
}

function renderDayCell(dayNum, dateStr, games, teamId, isToday) {
  const chips = games.map((g) => renderGameChip(g, teamId)).join('');
  return `
    <div class="calendar-cell ${isToday ? 'today' : ''} ${games.length ? 'has-game' : ''}">
      <span class="calendar-day-num">${dayNum}</span>
      ${chips}
    </div>
  `;
}

function renderGameChip(game, teamId) {
  const isHome = game.teams.home.team.id === teamId;
  const opponent = isHome ? game.teams.away : game.teams.home;
  const self = isHome ? game.teams.home : game.teams.away;
  const isFinal = game.status.abstractGameState === 'Final';
  const started = game.status.abstractGameState !== 'Preview';

  let label = formatJstTime(game.gameDate);
  let cls = 'scheduled';
  if (isFinal) {
    const selfScore = self.score ?? 0;
    const oppScore = opponent.score ?? 0;
    label = selfScore > oppScore ? '勝' : selfScore < oppScore ? '敗' : '分';
    cls = selfScore > oppScore ? 'win' : selfScore < oppScore ? 'loss' : 'draw';
  } else if (started) {
    label = '試合中';
    cls = 'live';
  }

  return `
    <button class="calendar-game-chip ${cls}" data-gamepk="${game.gamePk}" title="${isHome ? 'vs' : '@'} ${teamName(opponent.team.id)}">
      <span class="calendar-chip-opp">
        ${isHome ? 'vs' : '@'}
        <span class="calendar-chip-dot" style="background:${teamColor(opponent.team.id)}"></span>
        ${teamShort(opponent.team.id)}
      </span>
      <span class="calendar-chip-result">${label}</span>
    </button>
  `;
}

function wireCalendarTaps(container, teamId) {
  container.querySelectorAll('.calendar-game-chip').forEach((chip) => {
    chip.onclick = (e) => {
      e.stopPropagation();
      pushSheetBack(() => openTeamSheet(teamId));
      openGameSheet(Number(chip.dataset.gamepk));
    };
  });
}
