// 選手詳細シート：ベースボールカード風の全画面表示。
// カードをタップすると裏返り、表＝プロフィール／裏＝通算成績が入れ替わる。
// カードの下に当該シーズンの主要成績・月別成績・直近5試合を並べる。
import { getPlayerDetail, getPlayerSplits, getPlayerPostseasonStats, currentSeasonYear } from './api.js';
import { TEAMS, teamShort } from './teams.js';
import { japaneseName } from './player-names.js';
import { getFavorites, toggleFavorite } from './db.js';
import { closeSheet } from './sheet-stack.js';

const POSITION_JA = {
  'Pitcher': '投手',
  'Catcher': '捕手',
  'First Base': '一塁手',
  'Second Base': '二塁手',
  'Third Base': '三塁手',
  'Shortstop': '遊撃手',
  'Outfielder': '外野手',
  'Left Field': '左翼手',
  'Center Field': '中堅手',
  'Right Field': '右翼手',
  'Designated Hitter': '指名打者',
  'Two-Way Player': '二刀流',
};
const SIDE_JA = { L: '左', R: '右', S: '両' };
const MONTH_LABELS = { 3: '3月', 4: '4月', 5: '5月', 6: '6月', 7: '7月', 8: '8月', 9: '9月', 10: '10月' };

function starIcon(filled) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>`;
}

// MLB Stats APIの身長表記（例："6' 2\""）をcmに変換
function heightToCm(heightStr) {
  if (!heightStr) return null;
  const m = String(heightStr).match(/(\d+)'\s*(\d+)"/);
  if (!m) return null;
  const totalInches = Number(m[1]) * 12 + Number(m[2]);
  return Math.round(totalInches * 2.54);
}

// lb表記の体重をkgに変換
function weightToKg(weightLbs) {
  if (!weightLbs) return null;
  return Math.round(weightLbs * 0.453592);
}

// 出身地（市 + 州/国）を組み立てる。日本語訳データがないため原語表記のまま表示する
function formatBirthplace(person) {
  const parts = [];
  if (person.birthCity) parts.push(person.birthCity);
  if (person.birthCountry === 'USA' && person.birthStateProvince) {
    parts.push(person.birthStateProvince);
  } else if (person.birthCountry) {
    parts.push(person.birthCountry);
  }
  return parts.join(', ');
}

function formatBirthDateJa(birthDateStr) {
  if (!birthDateStr) return '';
  const [y, m, d] = birthDateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${y}年${m}月${d}日`;
}

export function positionJa(pos) {
  if (!pos) return '';
  return POSITION_JA[pos.name] || pos.abbreviation || pos.name;
}

// person.stats（hydrate=stats(...)で取得した配列）から指定グループ・種別の成績を取り出す。
// type は 'season'（当該シーズン）または 'career'（通算）。
export function findSeasonStat(person, groupName, type = 'season') {
  const group = (person.stats || []).find(
    (g) => g.group && g.group.displayName === groupName && (!g.type || g.type.displayName === type)
  );
  if (!group || !group.splits || !group.splits.length) return null;
  return group.splits[0].stat;
}

export function hittingStatGrid(stat) {
  return `
    <div class="standing-summary-stats">
      <div><span class="stat-num">${stat.avg ?? '-'}</span><span class="stat-label">打率</span></div>
      <div><span class="stat-num">${stat.homeRuns ?? '-'}</span><span class="stat-label">本塁打</span></div>
      <div><span class="stat-num">${stat.rbi ?? '-'}</span><span class="stat-label">打点</span></div>
      <div><span class="stat-num">${stat.ops ?? '-'}</span><span class="stat-label">OPS</span></div>
    </div>
  `;
}

export function pitchingStatGrid(stat) {
  return `
    <div class="standing-summary-stats">
      <div><span class="stat-num">${stat.era ?? '-'}</span><span class="stat-label">防御率</span></div>
      <div><span class="stat-num">${stat.wins ?? 0}-${stat.losses ?? 0}</span><span class="stat-label">勝敗</span></div>
      <div><span class="stat-num">${stat.strikeOuts ?? '-'}</span><span class="stat-label">奪三振</span></div>
      <div><span class="stat-num">${stat.whip ?? '-'}</span><span class="stat-label">WHIP</span></div>
    </div>
  `;
}

// 投手が主戦場か（月別グラフ・直近5試合の指標を打者用／投手用で切り替える）
function isPitcherFirst(person, hittingStat, pitchingStat) {
  if (pitchingStat && !hittingStat) return true;
  if (!pitchingStat) return false;
  const posCode = person.primaryPosition && person.primaryPosition.abbreviation;
  return posCode === 'P';
}

// カードのレア度は当該シーズンの成績から機械的に決めた「このアプリ独自の目安」。
// 公式のレーティングではないため、ツールチップにその旨を書いておく。
function cardRarity(hittingStat, pitchingStat, pitcherFirst) {
  if (pitcherFirst && pitchingStat) {
    const era = parseFloat(pitchingStat.era);
    if (!Number.isNaN(era)) {
      if (era < 3.00) return { label: 'SSR', note: '今季 防御率3.00未満' };
      if (era < 4.00) return { label: 'SR', note: '今季 防御率4.00未満' };
    }
    return { label: 'R', note: '今季成績から判定' };
  }
  if (hittingStat) {
    const ops = parseFloat(hittingStat.ops);
    if (!Number.isNaN(ops)) {
      if (ops >= 0.900) return { label: 'SSR', note: '今季 OPS.900以上' };
      if (ops >= 0.800) return { label: 'SR', note: '今季 OPS.800以上' };
    }
  }
  return { label: 'R', note: '今季成績から判定' };
}

// カード表面の大きな英語表記（姓）。取得できなければフルネームの末尾を使う。
function cardSurname(person) {
  const last = person.lastName || (person.fullName || '').split(' ').slice(-1)[0] || '';
  return last.toUpperCase();
}

// 写真の代わりに置くカード面。球団ロゴ・写真は使わず、イニシャルとチームカラーだけで表す。
function cardInitials(person) {
  const parts = (person.fullName || '').split(' ').filter(Boolean);
  const first = parts[0] ? parts[0][0] : '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// カードの裏面に並べる通算成績。打者・投手それぞれの通算成績があれば両方載せる。
// 裏面はカードの高さに収める必要があるため、二刀流で両方載る場合は各5項目に絞る。
function careerRows(careerHitting, careerPitching, pitcherFirst) {
  const both = Boolean(careerHitting && careerPitching);
  const hitting = careerHitting ? [
    { k: '試合', v: careerHitting.gamesPlayed ?? '-' },
    { k: '打率', v: careerHitting.avg ?? '-' },
    { k: '本塁打', v: careerHitting.homeRuns ?? '-' },
    { k: '打点', v: careerHitting.rbi ?? '-' },
    { k: '盗塁', v: careerHitting.stolenBases ?? '-' },
    { k: 'OPS', v: careerHitting.ops ?? '-' },
  ] : [];
  const pitching = careerPitching ? [
    { k: '登板', v: careerPitching.gamesPlayed ?? '-' },
    { k: '勝敗', v: `${careerPitching.wins ?? 0}勝${careerPitching.losses ?? 0}敗` },
    { k: '防御率', v: careerPitching.era ?? '-' },
    { k: '投球回', v: careerPitching.inningsPitched ?? '-' },
    { k: '奪三振', v: careerPitching.strikeOuts ?? '-' },
    { k: 'WHIP', v: careerPitching.whip ?? '-' },
  ] : [];
  const limit = both ? 5 : 6;
  return pitcherFirst
    ? [...pitching.slice(0, limit), ...hitting.slice(0, limit)]
    : [...hitting.slice(0, limit), ...pitching.slice(0, limit)];
}

function renderCard(person, ctx) {
  const { seasonYear, hittingStat, pitchingStat, careerHitting, careerPitching, pitcherFirst } = ctx;
  const team = person.currentTeam && TEAMS[person.currentTeam.id] ? TEAMS[person.currentTeam.id] : null;
  const color = team ? team.color : '#8a765c';
  const rarity = cardRarity(hittingStat, pitchingStat, pitcherFirst);
  const jaName = japaneseName(person.id);
  const rows = careerRows(careerHitting, careerPitching, pitcherFirst);
  const backBody = rows.length
    ? rows.map((r) => `<span class="card-career-row"><span>${r.k}</span><b>${r.v}</b></span>`).join('')
    : `<span class="card-career-empty">通算成績のデータがありません。</span>`;

  return `
    <button class="baseball-card" id="player-card" aria-pressed="false" aria-label="選手カード。タップで通算成績に切り替わります">
      <span class="baseball-card-inner">
        <span class="baseball-card-face front foil-frame">
          <span class="card-paper">
            <span class="card-top">
              <span class="card-season">${seasonYear} SEASON${person.primaryNumber ? ' ・ #' + person.primaryNumber : ''}</span>
              <span class="card-rarity" title="今季の成績から自動で付けたこのアプリ独自の目安です（${rarity.note}）">${rarity.label}</span>
            </span>
            <span class="card-photo" style="--team-color:${color}">
              <span class="card-initials">${cardInitials(person)}</span>
              <span class="card-photo-note">${team ? teamShort(person.currentTeam.id) : 'FA'}</span>
            </span>
            <span class="card-name-block">
              <span class="card-surname">${cardSurname(person)}</span>
              <span class="card-fullname">${jaName ? jaName + ' ・ ' : ''}${person.fullName}</span>
              <span class="card-position">${positionJa(person.primaryPosition)}${team ? ' ・ ' + team.name : ''}</span>
            </span>
            <span class="card-flip-hint">タップで裏面（通算成績）↺</span>
          </span>
        </span>
        <span class="baseball-card-face back">
          <span class="card-paper back-paper">
            <span class="card-back-title">通算成績</span>
            <span class="card-career-list">${backBody}</span>
            <span class="card-flip-hint">タップで表面へ ↺</span>
          </span>
        </span>
      </span>
    </button>
  `;
}

// カード下の主要成績（4つの小窓）
function renderStatBulbs(hittingStat, pitchingStat, pitcherFirst) {
  const bulbs = [];
  if (pitcherFirst && pitchingStat) {
    bulbs.push({ label: '防御率', val: pitchingStat.era ?? '-' });
    bulbs.push({ label: '勝敗', val: `${pitchingStat.wins ?? 0}-${pitchingStat.losses ?? 0}` });
    bulbs.push({ label: '奪三振', val: pitchingStat.strikeOuts ?? '-' });
    bulbs.push({ label: 'WHIP', val: pitchingStat.whip ?? '-' });
  } else if (hittingStat) {
    bulbs.push({ label: '打率', val: hittingStat.avg ?? '-' });
    bulbs.push({ label: '本塁打', val: hittingStat.homeRuns ?? '-' });
    bulbs.push({ label: '打点', val: hittingStat.rbi ?? '-' });
    bulbs.push({ label: 'OPS', val: hittingStat.ops ?? '-' });
  }
  if (!bulbs.length) return '';
  return `<div class="stat-bulb-grid">${bulbs.map((b) => `
    <div class="stat-bulb"><span class="stat-bulb-label">${b.label}</span><span class="stat-bulb-val">${b.val}</span></div>
  `).join('')}</div>`;
}

// 月別成績のグラフ（打者はOPS、投手は防御率）。
// byMonth のスプリットは month（3〜10の整数）を持つ。無い場合はグラフを出さない。
function renderMonthlyChart(splits, pitcherFirst) {
  const rows = (splits || [])
    .map((sp) => {
      const month = sp.month ?? (sp.split && sp.split.code ? Number(sp.split.code) : null);
      const value = pitcherFirst ? parseFloat(sp.stat && sp.stat.era) : parseFloat(sp.stat && sp.stat.ops);
      if (!month || Number.isNaN(value)) return null;
      return { month, value };
    })
    .filter(Boolean)
    .sort((a, b) => a.month - b.month);
  if (rows.length < 2) return '';

  const max = Math.max(...rows.map((r) => r.value));
  const title = pitcherFirst ? '月別 防御率' : '月別 OPS';
  const note = pitcherFirst ? '棒が短いほど good（失点が少ない）' : '棒が長いほど good';
  const bars = rows.map((r) => {
    const ratio = max ? r.value / max : 0;
    const height = Math.max(8, Math.round(ratio * 88));
    const shown = pitcherFirst ? r.value.toFixed(2) : r.value.toFixed(3).replace(/^0/, '');
    return `
      <div class="monthly-bar-col">
        <span class="monthly-bar-val">${shown}</span>
        <span class="monthly-bar" style="height:${height}px"></span>
        <span class="monthly-bar-label">${MONTH_LABELS[r.month] || r.month + '月'}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="card-panel">
      <div class="card-panel-title">${title}<span class="card-panel-note">${note}</span></div>
      <div class="monthly-chart">${bars}</div>
    </div>
  `;
}

// 直近5試合（gameLogのスプリットは古い順に並ぶため末尾から取る）
function renderGameLog(splits, pitcherFirst) {
  const recent = (splits || []).slice(-5).reverse();
  if (!recent.length) return '';
  const rows = recent.map((sp) => {
    const date = sp.date ? `${Number(sp.date.slice(5, 7))}/${Number(sp.date.slice(8, 10))}` : '-';
    const opp = sp.opponent && sp.opponent.id ? `${sp.isHome ? 'vs' : '@'} ${teamShort(sp.opponent.id)}` : '-';
    const st = sp.stat || {};
    const line = pitcherFirst
      ? `${st.inningsPitched ?? '-'}回 ${st.earnedRuns ?? 0}自責 ${st.strikeOuts ?? 0}奪三振`
      : `${st.atBats ?? 0}打数${st.hits ?? 0}安打${st.homeRuns ? ' 本塁打' + st.homeRuns : ''}${st.rbi ? ' 打点' + st.rbi : ''}`;
    return `<div class="game-log-row"><span class="game-log-date">${date}</span><span class="game-log-opp">${opp}</span><span class="game-log-line">${line}</span></div>`;
  }).join('');
  return `
    <div class="card-panel">
      <div class="card-panel-title">直近5試合<span class="card-panel-note">新しい順・日付は現地</span></div>
      ${rows}
    </div>
  `;
}

// カード裏面に載せきらないプロフィール（身長・体重・出身地など）
function renderProfilePanel(person) {
  const items = [];
  const heightCm = heightToCm(person.height);
  if (heightCm) items.push(['身長', `${heightCm}cm`]);
  const weightKg = weightToKg(person.weight);
  if (weightKg) items.push(['体重', `${weightKg}kg`]);
  if (person.batSide) items.push(['打席', `${SIDE_JA[person.batSide.code] || '-'}打`]);
  if (person.pitchHand) items.push(['投球', `${SIDE_JA[person.pitchHand.code] || '-'}投`]);
  const birthplace = formatBirthplace(person);
  if (birthplace) items.push(['出身', birthplace]);
  if (person.birthDate) {
    const age = person.currentAge != null ? `（${person.currentAge}歳）` : '';
    items.push(['誕生日', `${formatBirthDateJa(person.birthDate)}${age}`]);
  }
  if (person.mlbDebutDate) items.push(['MLBデビュー', `${person.mlbDebutDate.slice(0, 4)}年`]);
  if (!items.length) return '';
  return `
    <div class="card-panel">
      <div class="card-panel-title">プロフィール</div>
      ${items.map(([k, v]) => `<div class="profile-row"><span>${k}</span><b>${v}</b></div>`).join('')}
    </div>
  `;
}

// 当該シーズンの成績（打撃・投手）を従来どおり表形式でも残す
function renderSeasonBlocks(hittingStat, pitchingStat, seasonYear) {
  let html = '';
  if (hittingStat) {
    html += `<div class="card-panel"><div class="card-panel-title">打撃成績<span class="card-panel-note">${seasonYear}年</span></div>${hittingStatGrid(hittingStat)}</div>`;
  }
  if (pitchingStat) {
    html += `<div class="card-panel"><div class="card-panel-title">投手成績<span class="card-panel-note">${seasonYear}年</span></div>${pitchingStatGrid(pitchingStat)}</div>`;
  }
  if (!hittingStat && !pitchingStat) {
    html += `<div class="empty-state">${seasonYear}年シーズンの成績データがありません。</div>`;
  }
  return html;
}

// --- ポストシーズン成績（別リクエストで後追い取得する補助情報） ---
// P=ポストシーズン通算 / F=ワイルドカード / D=ディビジョン / L=リーグ優勝決定 / W=ワールドシリーズ。
// APIがどの単位で返すか実レスポンスで確認できていないため、返ってきたものを並べる方針にしている
// （返ってきた値を合算するような自前計算はしない）。
const PS_GAMETYPE_ORDER = ['P', 'F', 'D', 'L', 'W'];
const PS_GAMETYPE_JA = {
  P: 'ポストシーズン通算',
  F: 'ワイルドカードシリーズ',
  D: 'ディビジョンシリーズ',
  L: 'リーグ優勝決定シリーズ',
  W: 'ワールドシリーズ',
};

// stats から指定グループのポストシーズン成績だけを取り出す。
// gameType がポストシーズンのものでない（レギュラーシーズンが混ざった・値が無い）行は捨てる。
// これにより、APIが gameType 指定を無視した場合でもレギュラーの数字を誤表示しない。
function collectPostseasonRows(stats, groupName) {
  const rows = [];
  for (const entry of stats || []) {
    if (!entry.group || entry.group.displayName !== groupName) continue;
    for (const split of entry.splits || []) {
      const gameType = split.gameType || entry.gameType;
      if (!PS_GAMETYPE_ORDER.includes(gameType)) continue;
      if (!split.stat) continue;
      rows.push({ gameType, stat: split.stat });
    }
  }
  rows.sort((a, b) => PS_GAMETYPE_ORDER.indexOf(a.gameType) - PS_GAMETYPE_ORDER.indexOf(b.gameType));
  return rows;
}

function renderPostseasonGroup(rows, seasonYear, groupName) {
  if (!rows.length) return '';
  const title = groupName === 'pitching' ? 'ポストシーズンの投手成績' : 'ポストシーズンの打撃成績';
  const blocks = rows.map((row) => `
    <div class="ps-stat-block">
      <div class="ps-stat-round">${PS_GAMETYPE_JA[row.gameType]}</div>
      ${groupName === 'pitching' ? pitchingStatGrid(row.stat) : hittingStatGrid(row.stat)}
    </div>
  `).join('');
  return `
    <div class="card-panel">
      <div class="card-panel-title">${title}<span class="card-panel-note">${seasonYear}年</span></div>
      ${blocks}
    </div>
  `;
}

// ポストシーズン成績は補助情報。取得できない・出場していない場合は何も表示しない。
async function loadPostseasonStats(personId, seasonYear, pitcherFirst) {
  try {
    const { stats } = await getPlayerPostseasonStats(personId, seasonYear);
    const hitting = collectPostseasonRows(stats, 'hitting');
    const pitching = collectPostseasonRows(stats, 'pitching');
    if (!hitting.length && !pitching.length) return;
    const target = document.getElementById('player-postseason');
    if (!target) return; // シートが既に閉じられている場合
    const parts = pitcherFirst
      ? [renderPostseasonGroup(pitching, seasonYear, 'pitching'), renderPostseasonGroup(hitting, seasonYear, 'hitting')]
      : [renderPostseasonGroup(hitting, seasonYear, 'hitting'), renderPostseasonGroup(pitching, seasonYear, 'pitching')];
    target.innerHTML = parts.join('');
  } catch (e) {
    // 取得できなくてもカード本体・シーズン成績の表示は続ける
  }
}

function wireCardFlip() {
  const card = document.getElementById('player-card');
  if (!card) return;
  card.onclick = () => {
    const flipped = card.classList.toggle('flipped');
    card.setAttribute('aria-pressed', String(flipped));
  };
}

export async function openPlayerSheet(personId) {
  const root = document.getElementById('sheet-root');
  const favorites = await getFavorites();
  let isFav = favorites.some((f) => f.favKey === `player:${personId}`);
  let playerName = '';

  root.innerHTML = `
    <div class="sheet-backdrop is-full" id="sheet-backdrop">
      <div class="sheet full-sheet">
        <div class="full-sheet-bar">
          <button class="full-sheet-btn back" id="sheet-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m14 6-6 6 6 6"/></svg>元に戻る
          </button>
          <span class="full-sheet-title" id="player-sheet-name">読み込み中…</span>
          <button class="fav-toggle-btn ${isFav ? 'active' : ''}" id="sheet-fav-btn" aria-label="お気に入り登録・解除">${starIcon(isFav)}</button>
        </div>
        <div class="full-sheet-body" id="player-sheet-body"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  // 「元に戻る」：呼び出し元のシートがあればそこへ戻り、なければ選手カードを閉じる
  document.getElementById('sheet-back').onclick = () => closeSheet(root);
  document.getElementById('sheet-fav-btn').onclick = async () => {
    isFav = await toggleFavorite({ type: 'player', id: personId, name: playerName });
    const btn = document.getElementById('sheet-fav-btn');
    if (!btn) return;
    btn.classList.toggle('active', isFav);
    btn.innerHTML = starIcon(isFav);
  };

  try {
    const seasonYear = currentSeasonYear();
    const { person } = await getPlayerDetail(personId, seasonYear);
    if (!person) throw new Error('選手情報が見つかりませんでした');
    playerName = person.fullName;

    const nameEl = document.getElementById('player-sheet-name');
    if (nameEl) nameEl.textContent = japaneseName(person.id) || person.fullName;

    const hittingStat = findSeasonStat(person, 'hitting');
    const pitchingStat = findSeasonStat(person, 'pitching');
    const careerHitting = findSeasonStat(person, 'hitting', 'career');
    const careerPitching = findSeasonStat(person, 'pitching', 'career');
    const pitcherFirst = isPitcherFirst(person, hittingStat, pitchingStat);

    const body = document.getElementById('player-sheet-body');
    if (!body) return; // シートが既に閉じられている場合
    body.innerHTML = `
      ${renderCard(person, { seasonYear, hittingStat, pitchingStat, careerHitting, careerPitching, pitcherFirst })}
      ${renderStatBulbs(hittingStat, pitchingStat, pitcherFirst)}
      <div id="player-splits"></div>
      ${renderSeasonBlocks(hittingStat, pitchingStat, seasonYear)}
      <div id="player-postseason"></div>
      ${renderProfilePanel(person)}
    `;
    wireCardFlip();
    loadSplits(personId, seasonYear, pitcherFirst);
    loadPostseasonStats(personId, seasonYear, pitcherFirst);
  } catch (e) {
    const body = document.getElementById('player-sheet-body');
    if (body) body.innerHTML = `<div class="empty-state">選手情報を取得できませんでした。</div>`;
  }
}

// 月別成績・直近5試合は別リクエストで後追い取得する（失敗してもカード本体は表示済み）
async function loadSplits(personId, seasonYear, pitcherFirst) {
  const group = pitcherFirst ? 'pitching' : 'hitting';
  try {
    const { stats } = await getPlayerSplits(personId, seasonYear);
    const pick = (typeName) => {
      const s = (stats || []).find(
        (g) => g.type && g.type.displayName === typeName && g.group && g.group.displayName === group
      );
      return s && s.splits ? s.splits : [];
    };
    const target = document.getElementById('player-splits');
    if (!target) return; // シートが既に閉じられている場合
    target.innerHTML = renderMonthlyChart(pick('byMonth'), pitcherFirst) + renderGameLog(pick('gameLog'), pitcherFirst);
  } catch (e) {
    // 月別・直近試合は補助情報のため、取得できなくても何も表示しない
  }
}
