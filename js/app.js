import { renderHome } from './home.js';
import { renderStandings } from './standings.js';
import { renderPlayerSearch } from './player-search.js';
import { renderCollection } from './collection.js';
import { renderAlerts } from './alerts.js';
import { renderRules } from './rules.js';
import { clearSheetStack } from './sheet-stack.js';

const TITLES = { home: 'ホーム', standings: '順位表', 'player-search': '選手検索', collection: '推しコレクション', alerts: 'お知らせ', rules: 'ルール解説' };

// 現在表示中の画面。hashchange を受けたときに「もう表示済みの画面か」を判定して、
// navigate() 自身による hash の書き換えで再描画が走るのを防ぐ。
let currentRoute = null;

// URLのハッシュから画面名を取り出す。知らない値は home に倒す。
function routeFromHash() {
  const route = (location.hash || '#home').replace('#', '');
  return TITLES[route] ? route : 'home';
}

async function navigate(route) {
  currentRoute = route;
  // 画面を切り替えるときは開いているシートを閉じ、シートの戻り先も破棄する
  const sheetRoot = document.getElementById('sheet-root');
  if (sheetRoot) sheetRoot.innerHTML = '';
  clearSheetStack();

  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.route === route));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));

  document.getElementById('header-title').textContent = TITLES[route] || '';
  document.getElementById('offline-indicator').innerHTML = '';

  if (route === 'home') {
    const el = document.getElementById('view-home');
    el.classList.add('active');
    await renderHome(el);
  } else if (route === 'standings') {
    const el = document.getElementById('view-standings');
    el.classList.add('active');
    await renderStandings(el);
  } else if (route === 'player-search') {
    const el = document.getElementById('view-player-search');
    el.classList.add('active');
    await renderPlayerSearch(el);
  } else if (route === 'collection') {
    const el = document.getElementById('view-collection');
    el.classList.add('active');
    await renderCollection(el);
  } else if (route === 'alerts') {
    const el = document.getElementById('view-alerts');
    el.classList.add('active');
    await renderAlerts(el);
  } else if (route === 'rules') {
    const el = document.getElementById('view-rules');
    el.classList.add('active');
    await renderRules(el);
  }
  // すでに同じハッシュなら書き換えない（端末の戻る操作で来たときに履歴を増やさないため）
  if (location.hash !== `#${route}`) location.hash = route;
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });
}

// 端末の「戻る」「進む」に追従する。
// navigate() が location.hash を書き換えて履歴を積むため、これを監視していないと
// 戻ってもURLだけ変わって画面が残り、続けて戻るとアプリごと閉じてしまう。
// navigate() 自身の書き換えでも hashchange は飛ぶので、currentRoute と同じなら何もしない。
function initHistory() {
  window.addEventListener('hashchange', () => {
    const route = routeFromHash();
    if (route === currentRoute) return;
    navigate(route);
  });
}

function updateClock() {
  const clockEl = document.getElementById('jst-clock');
  if (!clockEl) return;
  const now = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date());
  clockEl.textContent = `${now}（日本時間）`;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('Service Worker registration failed:', err);
      });
    });
  }
}

function init() {
  initNav();
  initHistory();
  updateClock();
  setInterval(updateClock, 30 * 1000);
  registerServiceWorker();

  // 初回だけはハッシュを「積む」のではなく「置き換える」。
  // そうしないと、ハッシュ無しで開いた直後に戻る操作をしたとき、画面が変わらない
  // 空の履歴エントリを1つ踏むことになる（replaceState では hashchange は飛ばない）。
  if (!location.hash) history.replaceState(null, '', `#${routeFromHash()}`);
  navigate(routeFromHash());
}

init();
