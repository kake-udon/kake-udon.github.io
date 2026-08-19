import { getStandings, currentSeasonYear } from './api.js';
import { DIVISIONS, teamColor, teamName } from './teams.js';
import { openTeamSheet } from './team-sheet.js';

let activeLeague = 103; // 103 = ア・リーグ, 104 = ナ・リーグ
let cachedRecords = null;

const DIVISION_ORDER_BY_LEAGUE = {
  103: [200, 201, 202],
  104: [203, 204, 205],
};

function clinchTag(team) {
  if (team.clinched) return `<span class="clinch-tag">確定</span>`;
  return '';
}

function renderDivisionTable(records) {
  const sorted = [...records].sort((a, b) => a.divisionRank - b.divisionRank);
  const rows = sorted.map((r, i) => `
    <tr data-teamid="${r.team.id}">
      <td>
        <div class="team-cell">
          <span class="rank-num">${i + 1}</span>
          <span class="team-dot" style="background:${teamColor(r.team.id)}"></span>
          ${teamName(r.team.id)}
          ${clinchTag(r)}
        </div>
      </td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.winningPercentage ?? '-'}</td>
      <td>${r.gamesBack === '-' || !r.gamesBack ? '-' : r.gamesBack}</td>
    </tr>
  `).join('');

  return `
    <table class="standings-table">
      <thead>
        <tr><th>チーム</th><th>勝</th><th>敗</th><th>勝率</th><th>差</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderLeague(records) {
  const divisionIds = DIVISION_ORDER_BY_LEAGUE[activeLeague];
  return divisionIds.map((divId) => {
    const rec = records.find((r) => r.division && r.division.id === divId);
    if (!rec) return '';
    return `
      <div class="division-block">
        <div class="division-header">${DIVISIONS[divId]}</div>
        ${renderDivisionTable(rec.teamRecords)}
      </div>
    `;
  }).join('');
}

function wireInteractions(container) {
  container.querySelectorAll('.league-tab').forEach((tab) => {
    tab.onclick = () => {
      activeLeague = Number(tab.dataset.league);
      renderBody(container);
    };
  });
  container.querySelectorAll('tr[data-teamid]').forEach((row) => {
    row.onclick = () => openTeamSheet(Number(row.dataset.teamid));
  });
}

function renderBody(container) {
  const body = container.querySelector('#standings-body');
  const tabs = container.querySelectorAll('.league-tab');
  tabs.forEach((t) => t.classList.toggle('active', Number(t.dataset.league) === activeLeague));

  if (!cachedRecords) {
    body.innerHTML = `<div class="spinner"></div>`;
    return;
  }
  const leagueRecords = cachedRecords.filter((r) => r.league && r.league.id === activeLeague);
  if (!leagueRecords.length) {
    body.innerHTML = `<div class="empty-state">現在、順位表データがありません。シーズン開幕前後は表示できない場合があります。</div>`;
    return;
  }
  body.innerHTML = renderLeague(leagueRecords);
  wireInteractions(container);
}

export async function renderStandings(container) {
  container.innerHTML = `
    <div class="league-tabs">
      <button class="league-tab ${activeLeague === 103 ? 'active' : ''}" data-league="103">ア・リーグ</button>
      <button class="league-tab ${activeLeague === 104 ? 'active' : ''}" data-league="104">ナ・リーグ</button>
    </div>
    <div id="standings-body"><div class="spinner"></div></div>
  `;
  wireInteractions(container);

  try {
    const { data, offline } = await getStandings(currentSeasonYear());
    cachedRecords = data.records || [];
    const offlineEl = document.getElementById('offline-indicator');
    if (offlineEl) offlineEl.innerHTML = offline ? `<span class="offline-badge">オフライン・前回取得したデータを表示中</span>` : '';
    renderBody(container);
  } catch (e) {
    container.querySelector('#standings-body').innerHTML = `<div class="empty-state">順位表を取得できませんでした。通信状況をご確認のうえ、後ほどお試しください。</div>`;
  }
}
