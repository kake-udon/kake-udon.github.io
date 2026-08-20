// Web Push通知：購読・解除・お気に入りチームIDの同期を行う
// 毎日18時（JST）のダイジェスト送信はGitHub Actions側（scripts/send-notifications.mjs）が担当し、
// このモジュールはブラウザ側で購読情報をSupabaseに登録・更新するところまでを受け持つ。
//
// VAPID公開鍵・Supabase URL・Supabase anonキーはいずれも「公開されて問題ない値」。
// 秘密鍵（VAPID_PRIVATE_KEY）やSupabaseのservice_roleキーは絶対にこのファイルに書かないこと。
const VAPID_PUBLIC_KEY = 'BPC6PsGbK5G6Up6eVr0DnrOH0a6ODsW38uylzdJp76OfPEGgOiKRmnkjwzi5DWUiqaetAOpPTIig4OmddVnsLNU';

const SUPABASE_URL = 'https://asqkhhfvmpbutuksnwnq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWtoaGZ2bXBidXR1a3Nud25xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNjE4NDksImV4cCI6MjEwMjczNzg0OX0.3mgyTCnIGcmO5iSN5sEpTmtpvrk6TINqV5OEmSoO5AM';

const REST_ENDPOINT = `${SUPABASE_URL}/rest/v1/push_subscriptions`;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export function isSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPermissionState() {
  return isSupported() ? Notification.permission : 'unsupported';
}

// Service Workerの準備が何らかの理由で完了しない場合に画面が固まらないよう、タイムアウトを設ける
function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function getSubscription() {
  if (!isSupported()) return null;
  try {
    const reg = await withTimeout(navigator.serviceWorker.ready, 5000, 'timeout');
    return await reg.pushManager.getSubscription();
  } catch (e) {
    return null; // Service Workerの準備が完了しない場合は「未購読」として扱う
  }
}

async function upsertSubscription(subscription, teamIds) {
  const json = subscription.toJSON();
  const body = {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    team_ids: teamIds,
    updated_at: new Date().toISOString(),
  };
  const res = await fetch(REST_ENDPOINT, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`購読情報の登録に失敗しました（${res.status}）`);
}

// 通知を有効化：許可ダイアログ→Push購読→Supabaseへの登録までを行う
export async function enableNotifications(favoriteTeamIds) {
  if (!isSupported()) throw new Error('このブラウザは通知に対応していません');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('通知が許可されませんでした');

  const reg = await withTimeout(navigator.serviceWorker.ready, 5000, 'Service Workerの準備がタイムアウトしました。ページを再読み込みしてください。');
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await upsertSubscription(subscription, Array.from(favoriteTeamIds));
  return subscription;
}

export async function disableNotifications() {
  const subscription = await getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  try {
    await fetch(`${REST_ENDPOINT}?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
      headers: supabaseHeaders(),
    });
  } catch (e) {
    // Supabase側の削除に失敗しても、ブラウザ側の購読解除自体は完了している
  }
}

// お気に入りチームが変更された際、通知が有効な場合のみSupabase側のteam_idsを更新する
export async function syncFavoriteTeams(favoriteTeamIds) {
  if (!isSupported()) return;
  const subscription = await getSubscription();
  if (!subscription) return;
  try {
    await fetch(`${REST_ENDPOINT}?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`, {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify({ team_ids: Array.from(favoriteTeamIds), updated_at: new Date().toISOString() }),
    });
  } catch (e) {
    // オフライン等で同期に失敗しても致命的ではないため無視する（次回変更時に再送される）
  }
}
