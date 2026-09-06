// オフシーズンの「シーズンまとめ」。お気に入りチーム・選手の当該シーズン最終成績と、
// 主要タイトルの受賞者を1枚にまとめて、推しコレクション画面の先頭に差し込む。
// ワールドシリーズが終わると試合日程も順位表の更新も止まるため、オフの間もアプリに
// 見るものが残るようにするのが目的（ロードマップ フェーズE）。
import { getStandings, getPlayerDetail, getAwardRecipients } from './api.js';
import { TEAMS, teamName, teamShort, teamColor, DIVISIONS } from './teams.js';
import { loadBracket, findSeriesForTeam, seriesTeamStatus } from './bracket.js';
import { findSeasonStat, hittingStatGrid, pitchingStatGrid } from './player-sheet.js';
import { JP_NAME_ALIASES } from './player-names.js';

// 主要タイトル。/api/v1/awards の賞IDは実レスポンスで確認できていないため、
// 取れなかった賞は黙って表示しない方針（賞IDが判明したらここを直すだけで済むようにしてある）。
const MAIN_AWARDS = [
  { id: 'ALMVP', ja: 'ア・リーグ MVP' },
  { id: 'NLMVP', ja: 'ナ・リーグ MVP' },
  { id: 'ALCY', ja: 'ア・リーグ サイ・ヤング賞' },
  { id: 'NLCY', ja: 'ナ・リーグ サイ・ヤング賞' },
  { id: 'ALROY', ja: 'ア・リーグ 新人王' },
  { id: 'NLROY', ja: 'ナ・リーグ 新人王' },
];

function playerDisplayName(person) {
  const alias = person && JP_NAME_ALIASES[person.id];
  if (alias && alias[0]) return alias[0];
  return (person && (person.fullName || person.nameFirstLast)) || '選手';
}

// --- お気に入りチームのまとめ ---

function teamRecordFrom(records, teamId) {
  for (const rec of records || []) {
    for (const tr of rec.teamRecords || []) {
      if (tr.team && tr.team.id === teamId) return tr;
    }
  }
  return null;
}

// そのチームがポストシーズンをどこまで戦ったか。
function postseasonResultJa(bracket, teamId) {
  if (!bracket) return '';
  const series = findSeriesForTeam(bracket, teamId);
  if (!series) return 'ポストシーズン進出なし';
  const status = seriesTeamStatus(series, teamId);
  if (!status) return '';
  const roundJa = series.round ? series.round.ja : 'シリーズ';
  if (status.key === 'advanced') {
    return series.gameType === 'W' ? 'ワールドシリーズ制覇' : `${roundJa}を突破`;
  }
  if (status.key === 'eliminated') return `${roundJa}で敗退`;
  return `${roundJa}${status.label}`;
}

function renderTeamSummary(teamId, tr, bracket) {
  const meta = TEAMS[teamId];
  if (!meta) return '';
  const division = DIVISIONS[meta.division] || '';
  const psResult = postseasonResultJa(bracket, teamId);
  const facts = tr
    ? [
      { k: '勝敗', v: `${tr.wins}-${tr.losses}` },
      { k: '勝率', v: tr.winningPercentage ?? '-' },
      { k: '地区順位', v: tr.divisionRank ? `${tr.divisionRank}位` : '-' },
    ]
    : [];
  return `
    <div class="summary-card" data-teamid="${teamId}" role="button" tabindex="0">
      <div class="summary-card-head">
        <span class="team-dot" style="background:${teamColor(teamId)}"></span>
        <span class="summary-card-name">${teamName(teamId)}</span>
        <span class="summary-card-sub">${teamShort(teamId)}</span>
      </div>
      <div class="summary-card-meta">${division}</div>
      ${facts.length
        ? `<div class="summary-fact-row">${facts.map((f) => `<div class="summary-fact"><span class="summary-fact-key">${f.k}</span><span class="summary-fact-val">${f.v}</span></div>`).join('')}</div>`
        : '<div class="summary-card-meta">このシーズンの成績を取得できませんでした。</div>'}
      ${psResult ? `<div class="summary-ps-result">${psResult}</div>` : ''}
    </div>
  `;
}

// --- お気に入り選手のまとめ ---

function renderPlayerSummary(personId, person, fallbackName) {
  if (!person) {
    return `
      <div class="summary-card">
        <div class="summary-card-head"><span class="summary-card-name">${fallbackName || '選手'}</span></div>
        <div class="summary-card-meta">このシーズンの成績を取得できませんでした。</div>
      </div>
    `;
  }
  const hitting = findSeasonStat(person, 'hitting');
  const pitching = findSeasonStat(person, 'pitching');
  const isPitcher = person.primaryPosition && ['P', 'TWP'].includes(person.primaryPosition.abbreviation);
  const blocks = [];
  if (isPitcher && pitching) blocks.push(pitchingStatGrid(pitching));
  if (hitting) blocks.push(hittingStatGrid(hitting));
  if (!isPitcher && pitching) blocks.push(pitchingStatGrid(pitching));
  const teamId = person.currentTeam && person.currentTeam.id;
  return `
    <div class="summary-card" data-personid="${personId}" role="button" tabindex="0">
      <div class="summary-card-head">
        ${teamId && TEAMS[teamId] ? `<span class="team-dot" style="background:${teamColor(teamId)}"></span>` : ''}
        <span class="summary-card-name">${playerDisplayName(person)}</span>
        ${teamId && TEAMS[teamId] ? `<span class="summary-card-sub">${teamShort(teamId)}</span>` : ''}
      </div>
      ${blocks.length ? blocks.join('') : '<div class="summary-card-meta">このシーズンの成績データがありません。</div>'}
    </div>
  `;
}

// --- 主要タイトル（E-2） ---

function renderAwardRow(label, award) {
  const person = award && award.player;
  const teamId = award && award.team && award.team.id;
  return `
    <div class="award-row">
      <span class="award-label">${label}</span>
      <span class="award-name">${playerDisplayName(person)}</span>
      ${teamId && TEAMS[teamId] ? `<span class="award-team" style="background:${teamColor(teamId)}">${teamShort(teamId)}</span>` : ''}
    </div>
  `;
}

// 受賞者は賞ごとに1リクエスト必要なため、まとめて自動では取りに行かず、
// ボタンを押されたときだけ取得する（オフシーズンに毎回6件叩かないため）。
async function loadAwards(target, season) {
  target.innerHTML = '<div class="spinner"></div>';
  const results = await Promise.all(MAIN_AWARDS.map(async (a) => {
    try {
      const { awards } = await getAwardRecipients(a.id, season);
      return { def: a, award: (awards || [])[0] || null };
    } catch (e) {
      return { def: a, award: null };
    }
  }));
  const rows = results.filter((r) => r.award && r.award.player).map((r) => renderAwardRow(r.def.ja, r.award)).join('');
  target.innerHTML = rows || `<div class="empty-state">${season}年の受賞者情報を取得できませんでした。発表前の場合もあります。</div>`;
}

// --- 画面への差し込み ---

// container はコレクション画面のルート。favorites は db.js の getFavorites() の戻り値。
// season はまとめの対象シーズン（オフシーズンは直近の完了シーズン）。
export async function renderSeasonSummary(container, favorites, season) {
  const target = container.querySelector('#season-summary');
  if (!target) return;

  const teamFavs = favorites.filter((f) => f.type === 'team');
  const playerFavs = favorites.filter((f) => f.type === 'player');

  target.innerHTML = `
    <div class="section-title" style="margin-top:0;">${season}年シーズンのまとめ</div>
    <div id="summary-teams"><div class="spinner"></div></div>
    <div id="summary-players"></div>
    <div class="section-title" style="margin-top:18px;">主要タイトル<span class="count">${season}年</span></div>
    <div id="summary-awards">
      <button class="summary-awards-btn" id="summary-awards-btn">受賞者を見る</button>
    </div>
  `;

  const awardsBtn = target.querySelector('#summary-awards-btn');
  if (awardsBtn) {
    awardsBtn.onclick = () => loadAwards(target.querySelector('#summary-awards'), season);
  }

  // 順位表とポストシーズンの勝ち上がりは、推しチームが登録されているときだけ取りに行く
  const [standingsResult, bracket] = await Promise.all([
    teamFavs.length ? getStandings(season).catch(() => null) : Promise.resolve(null),
    teamFavs.length ? loadBracket(season, { force: true }) : Promise.resolve(null),
  ]);
  const records = standingsResult && standingsResult.data ? standingsResult.data.records : [];

  const teamsEl = target.querySelector('#summary-teams');
  if (teamsEl) {
    teamsEl.innerHTML = teamFavs.length
      ? teamFavs.map((f) => renderTeamSummary(f.id, teamRecordFrom(records, f.id), bracket)).join('')
      : '<div class="empty-state">推しチームを登録すると、シーズンの成績がここにまとまります。</div>';
  }

  const players = await Promise.all(playerFavs.map(async (f) => {
    try {
      const { person } = await getPlayerDetail(f.id, season);
      return { fav: f, person };
    } catch (e) {
      return { fav: f, person: null };
    }
  }));
  const playersEl = target.querySelector('#summary-players');
  if (playersEl) {
    playersEl.innerHTML = players.length
      ? players.map(({ fav, person }) => renderPlayerSummary(fav.id, person, fav.name)).join('')
      : '';
  }
}
