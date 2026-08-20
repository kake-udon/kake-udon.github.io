// GitHub Actions専用スクリプト：毎日18時(JST)に、お気に入りチームの試合結果と次戦予定を
// Web Pushダイジェストとして送信する。Node単体で完結させるため、js/db.js（IndexedDB依存）は使わず、
// JST日付計算のみ api.js と同じロジックをここで小さく再実装している。
// クライアント側（js/*.js）はブラウザ専用のバンドラーなしES Modulesのままで、この分離を保つこと。
import webpush from 'web-push';
import { TEAMS, teamName, teamShort } from '../js/teams.js';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const VAPID_PUBLIC_KEY = requireEnv('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = requireEnv('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://kake-udon.github.io';
const FORCE_SEND = process.env.FORCE_SEND === 'true';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const SUPABASE_TABLE_URL = `${SUPABASE_URL}/rest/v1/push_subscriptions`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

// --- JST日付ユーティリティ（js/api.js と同じロジックをNode向けに再実装） ---
function toJstDateString(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(date);
}
function addDaysToDateString(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function jstDayRangeUtc(jstDateStr) {
  const start = new Date(`${jstDateStr}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
function formatJstDateTime(isoString) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(isoString));
}

// --- Supabase REST ---
function supabaseHeaders(extra = {}) {
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function fetchSubscriptions() {
  const res = await fetch(`${SUPABASE_TABLE_URL}?select=*`, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`Supabaseからの購読取得に失敗しました（${res.status}）`);
  return res.json();
}

async function updateLastNotified(endpoint, dateStr) {
  await fetch(`${SUPABASE_TABLE_URL}?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify({ last_notified_date: dateStr }),
  });
}

async function deleteSubscription(endpoint) {
  await fetch(`${SUPABASE_TABLE_URL}?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: 'DELETE',
    headers: supabaseHeaders(),
  });
}

// --- MLB Stats API ---
// 節度あるアクセス方針（api.jsと同様）を踏襲し、1回の実行で使う呼び出しは1件のみに抑える。
async function fetchScheduleData() {
  const todayJst = toJstDateString();
  const usStart = addDaysToDateString(todayJst, -1);
  const upcomingEnd = addDaysToDateString(todayJst, 10);
  const url = `${MLB_BASE}/schedule?sportId=1&startDate=${usStart}&endDate=${upcomingEnd}&hydrate=team,linescore,decisions`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB Stats APIエラー（${res.status}）`);
  const data = await res.json();

  const allGames = [];
  for (const block of data.dates || []) {
    for (const g of block.games || []) allGames.push(g);
  }

  const { start, end } = jstDayRangeUtc(todayJst);
  const todayGames = allGames.filter((g) => {
    const t = new Date(g.gameDate);
    return t >= start && t < end;
  });

  return { todayGames, upcomingGames: allGames };
}

function involvesTeam(game, teamId) {
  return game.teams.home.team.id === teamId || game.teams.away.team.id === teamId;
}

function opponentOf(game, teamId) {
  const isHome = game.teams.home.team.id === teamId;
  return isHome ? game.teams.away : game.teams.home;
}

function buildTeamLine(teamId, todayGames, upcomingGames, now) {
  const name = TEAMS[teamId] ? teamName(teamId) : `チーム${teamId}`;
  const todayGame = todayGames.find((g) => involvesTeam(g, teamId));

  let resultPart;
  if (todayGame && todayGame.status.abstractGameState === 'Final') {
    const isHome = todayGame.teams.home.team.id === teamId;
    const self = isHome ? todayGame.teams.home : todayGame.teams.away;
    const opp = opponentOf(todayGame, teamId);
    const selfScore = self.score ?? 0;
    const oppScore = opp.score ?? 0;
    const wl = selfScore > oppScore ? '○' : selfScore < oppScore ? '●' : '△';
    resultPart = `${wl}${selfScore}-${oppScore}（対${teamShort(opp.team.id)}）`;
  } else if (todayGame && todayGame.status.abstractGameState === 'Live') {
    resultPart = '試合中';
  } else if (todayGame) {
    resultPart = `${formatJstDateTime(todayGame.gameDate)}開始予定`;
  } else {
    resultPart = '本日試合なし';
  }

  const next = upcomingGames
    .filter((g) => involvesTeam(g, teamId) && new Date(g.gameDate) > now)
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))[0];
  const nextPart = next
    ? `次戦${formatJstDateTime(next.gameDate)}〜（対${teamShort(opponentOf(next, teamId).team.id)}）`
    : '次戦未定';

  return `${name}: ${resultPart} / ${nextPart}`;
}

// --- Web Push送信 ---
async function sendPush(sub, payload) {
  const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, statusCode: err.statusCode };
  }
}

async function main() {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const todayJst = toJstDateString();
  const subscriptions = await fetchSubscriptions();
  const targets = subscriptions.filter((s) => (FORCE_SEND || s.last_notified_date !== todayJst) && (s.team_ids || []).length > 0);

  console.log(`購読件数: ${subscriptions.length} / 送信対象: ${targets.length}${FORCE_SEND ? '（force）' : ''}`);
  if (!targets.length) return;

  const { todayGames, upcomingGames } = await fetchScheduleData();
  const now = new Date();

  for (const sub of targets) {
    const lines = sub.team_ids.map((id) => buildTeamLine(id, todayGames, upcomingGames, now));
    const payload = { title: 'MLB Watch', body: lines.join('\n'), url: './index.html' };

    const result = await sendPush(sub, payload);
    if (result.ok) {
      await updateLastNotified(sub.endpoint, todayJst);
      console.log(`送信成功: ${sub.endpoint.slice(0, 48)}...`);
    } else if (result.statusCode === 404 || result.statusCode === 410) {
      await deleteSubscription(sub.endpoint);
      console.log(`期限切れ購読を削除: ${sub.endpoint.slice(0, 48)}...`);
    } else {
      console.error(`送信失敗(${result.statusCode}): ${sub.endpoint.slice(0, 48)}...`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
