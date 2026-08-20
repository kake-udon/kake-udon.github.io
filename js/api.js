// MLB Stats API (statsapi.mlb.com) ラッパー
// 非公式APIのため、節度あるアクセス頻度を守る（同一データの短時間の連続取得を避ける）
import { cacheGet, cacheSet } from './db.js';

const BASE = 'https://statsapi.mlb.com/api/v1';
const FETCH_TIMEOUT_MS = 8000;
const MIN_REFETCH_INTERVAL_MS = 60 * 1000; // 同一キーへの連続アクセスを1分以上あける

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// キャッシュ優先のfetch: 成功したらキャッシュを更新、失敗したら直近のキャッシュを返す
async function cachedFetch(cacheKey, url) {
  const cached = await cacheGet(cacheKey);
  if (cached && Date.now() - cached.savedAt < MIN_REFETCH_INTERVAL_MS) {
    return { data: cached.value, fromCache: true, offline: false };
  }
  try {
    const data = await fetchWithTimeout(url);
    await cacheSet(cacheKey, data);
    return { data, fromCache: false, offline: false };
  } catch (err) {
    if (cached) {
      return { data: cached.value, fromCache: true, offline: true };
    }
    throw err;
  }
}

// --- 日本時間(JST)の日付ユーティリティ ---

// 指定Dateの JST での年月日を 'YYYY-MM-DD' で返す
export function toJstDateString(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // sv-SE ロケールは YYYY-MM-DD 形式を返す
}

export function addDaysToDateString(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// JST日付文字列(YYYY-MM-DD)の 00:00〜24:00 を UTC の範囲として返す
function jstDayRangeUtc(jstDateStr) {
  const start = new Date(`${jstDateStr}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function formatJstTime(isoString) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

export function formatJstDateLabel(isoString) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(isoString));
}

// --- スケジュール取得 ---

// 指定したJST日付に「日本時間で」開催される試合の一覧を返す。
// MLBの試合はアメリカの日付でグルーピングされているため、JST日付をまたぐ分を
// 前後1日分まとめて取得してから、実際のUTC開始時刻でJSTの範囲にフィルタする。
export async function getGamesForJstDate(jstDateStr) {
  const usStart = addDaysToDateString(jstDateStr, -1);
  const usEnd = jstDateStr;
  const url = `${BASE}/schedule?sportId=1&startDate=${usStart}&endDate=${usEnd}&hydrate=team,linescore,decisions`;
  const cacheKey = `schedule:${usStart}:${usEnd}`;
  const { data, fromCache, offline } = await cachedFetch(cacheKey, url);

  const { start, end } = jstDayRangeUtc(jstDateStr);
  const games = [];
  for (const dateBlock of data.dates || []) {
    for (const game of dateBlock.games || []) {
      const gameTime = new Date(game.gameDate);
      if (gameTime >= start && gameTime < end) {
        games.push(game);
      }
    }
  }
  games.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  return { games, fromCache, offline };
}

export async function getTeamSchedule(teamId, startDate, endDate) {
  const url = `${BASE}/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}&hydrate=team,linescore,decisions,probablePitcher`;
  const cacheKey = `team-schedule:${teamId}:${startDate}:${endDate}`;
  const { data, fromCache, offline } = await cachedFetch(cacheKey, url);
  const games = [];
  for (const dateBlock of data.dates || []) {
    for (const game of dateBlock.games || []) {
      games.push(game);
    }
  }
  games.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  return { games, fromCache, offline };
}

// 指定した年月（JST基準）のチーム試合を、JST日付ごとにまとめて返す（カレンダー表示用）
// MLBの試合はアメリカの日付でグルーピングされているため、月の前後1日分もまとめて取得してから
// 実際のUTC開始時刻でJST日付に振り分ける（getGamesForJstDateと同じ考え方）。
export async function getTeamScheduleByJstMonth(teamId, year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const usStart = addDaysToDateString(first, -1);
  const usEnd = addDaysToDateString(last, 1);
  const { games, fromCache, offline } = await getTeamSchedule(teamId, usStart, usEnd);

  const byDate = {};
  for (const game of games) {
    const jstDate = toJstDateString(new Date(game.gameDate));
    if (jstDate < first || jstDate > last) continue;
    (byDate[jstDate] ||= []).push(game);
  }
  return { byDate, fromCache, offline };
}

// --- 順位表取得 ---

export async function getStandings(season) {
  const url = `${BASE}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`;
  const cacheKey = `standings:${season}`;
  let result = await cachedFetch(cacheKey, url);

  // シーズン開始前・オフシーズンなど records が空の場合は standingsTypes を外して再試行
  if (result.data && Array.isArray(result.data.records) && result.data.records.length === 0 && !result.offline) {
    const fallbackUrl = `${BASE}/standings?leagueId=103,104&season=${season}`;
    try {
      const fallbackData = await fetchWithTimeout(fallbackUrl);
      if (fallbackData.records && fallbackData.records.length > 0) {
        await cacheSet(cacheKey, fallbackData);
        result = { data: fallbackData, fromCache: false, offline: false };
      }
    } catch (e) {
      // フォールバックも失敗した場合は元の結果をそのまま使う
    }
  }
  return result;
}

export function currentSeasonYear() {
  return Number(toJstDateString().slice(0, 4));
}

// --- チーム選手一覧 ---

// チームの現在の在籍選手一覧（アクティブロースター）
export async function getTeamRoster(teamId) {
  const url = `${BASE}/teams/${teamId}/roster?rosterType=active`;
  const cacheKey = `team-roster:${teamId}`;
  const { data, fromCache, offline } = await cachedFetch(cacheKey, url);
  return { roster: data.roster || [], fromCache, offline };
}

// --- 選手検索 ---

// 現役選手全員の一覧を取得（名前・所属チーム・ポジションなどの基本プロフィール）
export async function getAllPlayers(season) {
  const url = `${BASE}/sports/1/players?season=${season}`;
  const cacheKey = `players:${season}`;
  const { data, fromCache, offline } = await cachedFetch(cacheKey, url);
  return { players: data.people || [], fromCache, offline };
}

// 選手個人の詳細情報（当該シーズンの打撃・投手成績を含む）を取得
export async function getPlayerDetail(personId, season) {
  const url = `${BASE}/people/${personId}?hydrate=currentTeam,stats(group=%5Bhitting,pitching%5D,type=%5Bseason%5D,season=${season})`;
  const cacheKey = `player-detail:${personId}:${season}`;
  const { data, fromCache, offline } = await cachedFetch(cacheKey, url);
  const person = (data.people || [])[0] || null;
  return { person, fromCache, offline };
}

// --- 試合詳細（スコアボード・打席結果） ---

// 1試合分の概要（対戦カード・スコア・ステータス・予告先発）を取得
export async function getGameSummary(gamePk) {
  const url = `${BASE}/schedule?sportId=1&gamePk=${gamePk}&hydrate=team,linescore,decisions,probablePitcher,venue(location)`;
  const cacheKey = `game-summary:${gamePk}`;
  const { data, fromCache, offline } = await cachedFetch(cacheKey, url);
  let game = null;
  for (const dateBlock of data.dates || []) {
    if (dateBlock.games && dateBlock.games.length) { game = dateBlock.games[0]; break; }
  }
  return { game, fromCache, offline };
}

// イニングごとの得点・安打・失策（ラインスコア）
export async function getGameLinescore(gamePk) {
  const url = `${BASE}/game/${gamePk}/linescore`;
  const cacheKey = `linescore:${gamePk}`;
  return cachedFetch(cacheKey, url);
}

// 打席（プレー）ごとの結果一覧
export async function getGamePlayByPlay(gamePk) {
  const url = `${BASE}/game/${gamePk}/playByPlay`;
  const cacheKey = `playbyplay:${gamePk}`;
  return cachedFetch(cacheKey, url);
}

// 選手ごとの当該試合の成績（打撃・投球）を含むボックススコア
export async function getGameBoxscore(gamePk) {
  const url = `${BASE}/game/${gamePk}/boxscore`;
  const cacheKey = `boxscore:${gamePk}`;
  return cachedFetch(cacheKey, url);
}
