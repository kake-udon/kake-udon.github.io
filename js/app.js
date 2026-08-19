import { renderHome } from './home.js';
import { renderStandings } from './standings.js';

const TITLES = { home: '表紙', standings: '順位表' };

async function navigate(route) {
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
  }
  location.hash = route;
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
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
  updateClock();
  setInterval(updateClock, 30 * 1000);
  registerServiceWorker();

  const initialRoute = (location.hash || '#home').replace('#', '');
  navigate(TITLES[initialRoute] ? initialRoute : 'home');
}

init();
