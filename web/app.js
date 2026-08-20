(function () {
  'use strict';

  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const content = document.getElementById('content');
  const tabs = document.querySelectorAll('.tab');
  const currentUserEl = document.getElementById('current-user');
  const clockEl = document.getElementById('footer-clock');

  let activeTab = 'dashboard';

  async function api(path, opts) {
    const res = await fetch('/api' + path, Object.assign({ credentials: 'same-origin' }, opts));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Blad ${res.status}`);
    return data;
  }

  function fmtBytes(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(1) + ' ' + units[i];
  }

  function fmtUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }

  function badgeForState(state) {
    if (state === 'active') return 'active';
    if (!state || state === 'unknown') return 'unknown';
    return 'inactive';
  }

  function severity(percent) {
    if (percent >= 90) return 'critical';
    if (percent >= 70) return 'warning';
    return 'good';
  }

  function meterTile(label, percent, detail) {
    const pct = Math.min(100, Math.max(0, percent || 0));
    return `
      <div class="stat-tile">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${pct}%</div>
        <div class="meter-track"><div class="meter-fill ${severity(pct)}" style="width:${pct}%"></div></div>
        ${detail ? `<div class="stat-detail">${detail}</div>` : ''}
      </div>
    `;
  }

  function valueTile(label, value, detail) {
    return `
      <div class="stat-tile">
        <div class="stat-label">${label}</div>
        <div class="stat-value" style="font-size:18px;">${value}</div>
        ${detail ? `<div class="stat-detail">${detail}</div>` : ''}
      </div>
    `;
  }

  async function renderDashboard() {
    content.innerHTML = '<p>Wczytywanie...</p>';
    let info = {};
    try {
      info = await api('/system/summary');
    } catch (e) {
      content.innerHTML = `<p class="error-msg">${e.message}</p>`;
      return;
    }

    const cpuDetail = info.cpu ? `${info.cpu.model || '-'} (${info.cpu.cores} rdzeni)` : '';
    const ramDetail = info.memory ? `${fmtBytes(info.memory.usedBytes)} / ${fmtBytes(info.memory.totalBytes)}` : '';
    const swapDetail = info.swap ? `${fmtBytes(info.swap.usedBytes)} / ${fmtBytes(info.swap.totalBytes)}` : '';
    const diskDetail = info.disk ? `${fmtBytes(info.disk.usedBytes)} / ${fmtBytes(info.disk.totalBytes)}` : '';

    content.innerHTML = `
      <div class="system-grid">
        ${meterTile('CPU', info.cpu ? info.cpu.usagePercent : 0, cpuDetail)}
        ${meterTile('RAM', info.memory ? info.memory.usedPercent : 0, ramDetail)}
        ${info.swap ? meterTile('SWAP', info.swap.usedPercent, swapDetail) : valueTile('SWAP', 'brak')}
        ${info.disk ? meterTile('DYSK', info.disk.usedPercent, diskDetail) : valueTile('DYSK', '-')}
        ${valueTile('HOST', info.hostname || '-')}
        ${valueTile('UPTIME', fmtUptime(info.uptimeSeconds || 0))}
      </div>
    `;
  }

  async function renderServices() {
    content.innerHTML = '<p>Wczytywanie...</p>';
    let services = [];
    try {
      services = await api('/system/services');
    } catch (e) {
      content.innerHTML = `<p class="error-msg">${e.message}</p>`;
      return;
    }

    content.innerHTML = `
      <div class="grid">
        ${services.map((s) => {
          const badge = s.found ? badgeForState(s.activeState) : 'unknown';
          const label = s.found ? `${s.activeState}${s.subState ? ' (' + s.subState + ')' : ''}` : 'nie znaleziono';
          return `
            <div class="card">
              <div class="label">${s.label} (${s.unit})</div>
              <div class="value"><span class="badge ${badge}">${label}</span></div>
              ${s.found && s.memoryBytes != null ? `<div style="margin-top:6px;font-size:12px;color:var(--muted);font-family:var(--mono);">RAM: ${fmtBytes(s.memoryBytes)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderModules() {
    content.innerHTML = `
      <div class="panel-block">
        <h2>Moduly</h2>
        <p class="empty-state">
          To jest sam szkielet panelu - zaden modul nie jest jeszcze zainstalowany.<br>
          Planowany pierwszy modul: CDN (tokeny klientow, katalogi <code>/var/www/cdn/&lt;token&gt;/</code>,
          upload, synchronizacja do POP-ow) - patrz <code>caddy_cdn_gcore.md</code> w repo.
        </p>
      </div>
    `;
  }

  const renderers = { dashboard: renderDashboard, services: renderServices, modules: renderModules };

  function switchTab(tab) {
    activeTab = tab;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    renderers[tab]();
  }

  tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cc-theme', next); } catch (e) {}
  });

  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('password-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

  async function doLogin() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Blad logowania');
      showApp(data.username);
    } catch (e) {
      errEl.textContent = e.message;
    }
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    location.reload();
  });

  function showApp(username) {
    loginScreen.style.display = 'none';
    app.style.display = 'flex';
    currentUserEl.textContent = username || '';
    switchTab(activeTab);
  }

  function tickClock() {
    clockEl.textContent = new Date().toLocaleString('pl-PL');
  }
  setInterval(tickClock, 1000);
  tickClock();

  (async function init() {
    try {
      const status = await fetch('/api/auth/status', { credentials: 'same-origin' }).then((r) => r.json());
      document.getElementById('app-version-login').textContent = status.version ? 'v' + status.version : '';
      document.getElementById('app-version-header').textContent = status.version ? 'v' + status.version : '';
      if (!status.authRequired || status.username) {
        showApp(status.username);
      }
    } catch (e) {
      // zostajemy na ekranie logowania
    }
  })();
})();
