// ⑨ 推しコレクション：お気に入りチーム・選手を1画面にまとめる。
// index.html に <section id="view-collection" class="view"></section> と
// ナビボタン（data-route="collection"）を追加し、app.js のルートから呼び出す。
import { getFavorites, toggleFavorite } from './db.js';
import { TEAMS, teamName, teamColor, teamShort } from './teams.js';
import { openTeamSheet } from './team-sheet.js';
import { openPlayerSheet } from './player-sheet.js';

function myTeamCard(fav) {
  const t = TEAMS[fav.id];
  if (!t) return '';
  return `
    <div class="foil-frame my-team-frame">
      <div class="my-team-card" data-teamid="${fav.id}">
        <span class="my-team-badge" style="background:${teamColor(fav.id)}">${teamShort(fav.id)}</span>
        <span class="my-team-text">
          <span class="my-team-eyebrow">MY TEAM</span>
          <span class="my-team-name">${teamName(fav.id)}</span>
        </span>
      </div>
    </div>
  `;
}

function playerCard(fav) {
  return `
    <div class="fav-player-card" data-personid="${fav.id}">
      <span class="fav-card-slot" aria-hidden="true"></span>
      <span class="fav-player-text">
        <span class="fav-player-name">${fav.name || '選手'}</span>
        <span class="fav-player-meta">通知オン</span>
      </span>
      <button class="fav-remove-btn" data-remove-personid="${fav.id}" aria-label="${fav.name || '選手'}を推しから外す">×</button>
    </div>
  `;
}

function render(container, favorites) {
  const teams = favorites.filter((f) => f.type === 'team');
  const players = favorites.filter((f) => f.type === 'player');

  container.innerHTML = `
    <div class="section-title">推しチーム<span class="count">${teams.length}</span></div>
    ${teams.length ? teams.map(myTeamCard).join('') : '<div class="empty-state">順位表の球団マップからチームを選ぶと、ここに表示されます。</div>'}

    <div class="section-title" style="margin-top:22px;">推し選手<span class="count">${players.length}</span></div>
    ${players.length
      ? `<div class="fav-player-grid">${players.map(playerCard).join('')}</div>`
      : '<div class="empty-state">選手検索から★を付けると、ここに集まります。</div>'}
  `;

  container.querySelectorAll('[data-teamid]').forEach((el) => {
    el.onclick = () => openTeamSheet(Number(el.dataset.teamid));
  });
  container.querySelectorAll('[data-personid]').forEach((el) => {
    el.onclick = () => openPlayerSheet(Number(el.dataset.personid));
  });
  container.querySelectorAll('[data-remove-personid]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.removePersonid);
      const name = (favorites.find((f) => f.type === 'player' && f.id === id) || {}).name;
      await toggleFavorite({ type: 'player', id, name });
      renderCollection(container);
    };
  });
}

export async function renderCollection(container) {
  container.innerHTML = `<div class="spinner"></div>`;
  try {
    const favorites = await getFavorites();
    render(container, favorites);
  } catch (e) {
    container.innerHTML = `<div class="empty-state">コレクションを読み込めませんでした。</div>`;
  }
}
