// GitHub Actions専用スクリプト：毎日夕方(JST)に、お気に入りチームの試合結果と次戦予定を
// Web Pushダイジェストとして送信する。Node単体で完結させるため、js/db.js（IndexedDB依存）は使わず、
// JST日付計算のみ api.js と同じロジックをここで小さく再実装している。
// クライアント側（js/*.js）はブラウザ専用のバンドラーなしES Modulesのままで、この分離を保つこと。
//
// 【送信ウィンドウについて】
// GitHub Actionsのスケジュール実行は混雑時に数時間〜半日遅延することがあり、実測でも
// 深夜〜翌朝に起動した回があった（例：2026-08-27の回が8/28 04:26 JSTに実行）。
// そこでワークフロー側は複数回起動し、このスクリプトが「JSTの送信ウィンドウ内か」を
// 判定して、ウィンドウ外に遅延した回は送信せず次の回に委ねる。これにより
//   ・深夜/翌朝に通知が届く
//   ・日付をまたいだ実行が last_notified_date を翌日で埋め、翌日夕方の回が丸ごとスキップされる
// の両方を防ぐ。手動テスト（workflow_dispatchのforce）ではウィンドウ判定を無視する。
// cronの時刻だけを信用する実装に戻さないこと。
//
// 【ポストシーズン中の送信時刻】
// ポストシーズンは試合が日本時間の朝〜昼に終わるため、夕方18〜21時のダイジェストでは
// 「半日前に終わった試合」を知らせることになる。そこで送信ウィンドウ判定の仕組みはそのままに、
// ポストシーズン期間だけウィンドウを15:00〜17:59へ前倒しする。ワークフロー側は昼過ぎと夕方の
// 両方の時間帯で起動しておき、その日にどちらを使うかはこのスクリプトが日付から決める
// （ポストシーズンの開始・終了に合わせてcronを編集する必要が無いようにするため）。
import webpush from 'web-push';
import { TEAMS, teamName, teamShort } from '../js/teams.js';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const VAPID_PUBLIC_KEY = requireEnv('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = requireEnv('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://kake-udon.github.io';
const FORCE_SEND = process.env.FORCE_SEND === 'true';

// 送信ウィンドウ（JST、開始は以上・終了は未満）。
// 既定はレギュラーシーズン18:00〜20:59／ポストシーズン15:00〜17:59。
// 環境変数を設定した場合はそちらが優先される（手元での検証・臨時の変更用）。
const ENV_WINDOW_START_HOUR = process.env.NOTIFY_WINDOW_START_HOUR;
const ENV_WINDOW_END_HOUR = process.env.NOTIFY_WINDOW_END_HOUR;
const REGULAR_WINDOW = { start: 18, end: 21 };
const POSTSEASON_WINDOW = { start: 15, end: 18 };
// ポストシーズン期間（JSTの月日で判定）。ワイルドカードシリーズの開幕前から余裕を取っている。
const POSTSEASON_START_MMDD = '09-28';
const POSTSEASON_END_MMDD = '11-20';
// Push の有効期限（秒）。配信が遅れた通知が翌朝に届くのを防ぐため、ウィンドウを過ぎたら破棄させる。
const PUSH_TTL_SECONDS = 4 * 60 * 60;

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
function jstHour(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', hour: '2-digit', hourCycle: 'h23' });
  return Number(fmt.format(date));
}
function isPostseasonPeriod(date = new Date()) {
  const md = toJstDateString(date).slice(5); // 'MM-DD'
  return md >= POSTSEASON_START_MMDD && md <= POSTSEASON_END_MMDD;
}

// その日に使う送信ウィンドウ。ポストシーズン期間だけ昼過ぎに前倒しする。
function sendWindowFor(date = new Date()) {
  const base = isPostseasonPeriod(date) ? POSTSEASON_WINDOW : REGULAR_WINDOW;
  const start = ENV_WINDOW_START_HOUR ? Number(ENV_WINDOW_START_HOUR) : base.start;
  const end = ENV_WINDOW_END_HOUR ? Number(ENV_WINDOW_END_HOUR) : base.end;
  return { start, end };
}

// 実行時刻（JST）が送信ウィンドウ内かどうか。どちらのウィンドウも同じJST日の中に収まるので、
// ウィンドウ内であれば「今日」は必ず送信対象日と一致し、last_notified_date による
// 重複ガードも日付ズレを起こさない。
function isWithinSendWindow(date = new Date()) {
  const { start, end } = sendWindowFor(date);
  const hour = jstHour(date);
  return hour >= start && hour < end;
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

// ポストシーズンの試合には「DS第3戦」のような短い前置きを付ける。
// gameType は F=ワイルドカード, D=ディビジョン, L=リーグ優勝決定, W=ワールドシリーズ。
const POSTSEASON_SHORT = { F: 'WC', D: 'DS', L: 'LCS', W: 'WS' };

function seriesPrefix(game) {
  const short = game && POSTSEASON_SHORT[game.gameType];
  if (!short) return '';
  const no = Number(game.seriesGameNumber);
  return `${short}${Number.isFinite(no) && no > 0 ? `第${no}戦` : ''} `;
}

// 1チーム分の行。本日の試合も予定もない場合は null を返し、呼び出し側で行ごと省く。
// （ポストシーズンに入ると敗退したチームは毎日「本日試合なし／次戦未定」になり、
//   そのまま送ると中身のない通知を毎日送ることになるため。送りすぎない方針。）
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
    resultPart = `${seriesPrefix(todayGame)}${wl}${selfScore}-${oppScore}（対${teamShort(opp.team.id)}）`;
  } else if (todayGame && todayGame.status.abstractGameState === 'Live') {
    resultPart = `${seriesPrefix(todayGame)}試合中`;
  } else if (todayGame) {
    resultPart = `${seriesPrefix(todayGame)}${formatJstDateTime(todayGame.gameDate)}開始予定`;
  } else {
    resultPart = '本日試合なし';
  }

  const next = upcomingGames
    .filter((g) => involvesTeam(g, teamId) && new Date(g.gameDate) > now)
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))[0];

  // 本日の試合も今後の予定もない＝伝えることが無いので、この行は出さない
  if (!todayGame && !next) return null;

  const nextPart = next
    ? `次戦${seriesPrefix(next)}${formatJstDateTime(next.gameDate)}〜（対${teamShort(opponentOf(next, teamId).team.id)}）`
    : '次戦未定';

  return `${name}: ${resultPart} / ${nextPart}`;
}

// --- Web Push送信 ---
async function sendPush(sub, payload) {
  const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload), { TTL: PUSH_TTL_SECONDS, urgency: 'high' });
    return { ok: true };
  } catch (err) {
    return { ok: false, statusCode: err.statusCode };
  }
}

async function main() {
  const now = new Date();
  if (!FORCE_SEND && !isWithinSendWindow(now)) {
    // ここに来るのは「その日のウィンドウに当たらない時間帯のcron」か、大きく遅延した回。
    // どちらも送信せず、同日の後続の回（または翌日）に委ねる。
    const { start, end } = sendWindowFor(now);
    console.log(
      `送信ウィンドウ外のためスキップします（現在 ${jstHour(now)}時JST / 本日のウィンドウ ${start}:00〜${end - 1}:59 JST`
      + `${isPostseasonPeriod(now) ? '・ポストシーズン' : ''}）`
    );
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const todayJst = toJstDateString(now);
  const subscriptions = await fetchSubscriptions();
  const targets = subscriptions.filter((s) => (FORCE_SEND || s.last_notified_date !== todayJst) && (s.team_ids || []).length > 0);

  console.log(`購読件数: ${subscriptions.length} / 送信対象: ${targets.length}${FORCE_SEND ? '（force）' : ''}`);
  if (!targets.length) return;

  const { todayGames, upcomingGames } = await fetchScheduleData();

  for (const sub of targets) {
    const lines = sub.team_ids
      .map((id) => buildTeamLine(id, todayGames, upcomingGames, now))
      .filter(Boolean);
    // 伝えることが無い購読者には送らない（お気に入りチームが全て敗退した後など）
    if (!lines.length) {
      console.log(`送信対象なし（本日の試合・予定なし）: ${sub.endpoint.slice(0, 48)}...`);
      continue;
    }
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
