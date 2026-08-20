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

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtDateTime(iso) {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleString('pl-PL'); } catch { return iso; }
  }

  async function renderGcore() {
    content.innerHTML = '<p>Wczytywanie...</p>';
    let status;
    try {
      status = await api('/gcore/status');
    } catch (e) {
      content.innerHTML = `<p class="error-msg">${escapeHtml(e.message)}</p>`;
      return;
    }
    renderGcoreTiles(status);
  }

  function renderGcoreTiles(status) {
    const lt = status.lastTest;
    const testBadge = !lt
      ? '<span class="badge unknown">nie testowano</span>'
      : lt.ok
        ? '<span class="badge active">polaczono</span>'
        : '<span class="badge inactive">blad</span>';

    const integrationTile = `
      <div class="panel-block">
        <h2>Integracja API</h2>
        ${status.configured ? `
          <div class="form-field">
            <label>Zapisany klucz</label>
            <input type="text" value="${escapeHtml(status.maskedKey)}" disabled>
          </div>
          <p>Status: ${testBadge} ${lt ? `<span style="font-size:11px;color:var(--muted);font-family:var(--mono);">(${fmtDateTime(lt.at)})</span>` : ''}</p>
          ${lt && !lt.ok ? `<p class="error-msg">${escapeHtml(lt.error)}</p>` : ''}
          <div class="btn-row">
            <button class="btn secondary" id="gcore-retest-btn">Testuj polaczenie ponownie</button>
            <button class="btn danger" id="gcore-remove-btn">Usun klucz</button>
          </div>
        ` : `
          <div class="form-field">
            <label>Klucz API Gcore (Customer Portal &rarr; API tokens)</label>
            <input type="password" id="gcore-apikey-input" placeholder="wklej klucz API" autocomplete="off">
          </div>
          <div class="btn-row">
            <button class="btn" id="gcore-save-btn">Zapisz i przetestuj</button>
          </div>
        `}
        <div class="error-msg" id="gcore-form-error"></div>
      </div>
    `;

    const statsBody = (lt && lt.ok && lt.client)
      ? `
        <p class="empty-state">
          Podglad odpowiedzi Gcore <code>/iam/clients/me</code> - pelne statystyki DNS
          (liczba stref, rekordow itp.) doloza sie z modulem Managed DNS.
        </p>
        <pre class="output">${escapeHtml(JSON.stringify(lt.client, null, 2))}</pre>
      `
      : `<p class="empty-state">Dostepne po poprawnej integracji (kafelek obok).</p>`;

    const statsTile = `
      <div class="panel-block">
        <h2>Statystyki i informacje o koncie</h2>
        ${statsBody}
      </div>
    `;

    content.innerHTML = `<div class="module-grid">${integrationTile}${statsTile}</div>`;

    const saveBtn = document.getElementById('gcore-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const input = document.getElementById('gcore-apikey-input');
        const errEl = document.getElementById('gcore-form-error');
        errEl.textContent = '';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Zapisuje i testuje...';
        try {
          const newStatus = await api('/gcore/apikey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: input.value })
          });
          renderGcoreTiles(newStatus);
        } catch (e) {
          errEl.textContent = e.message;
          saveBtn.disabled = false;
          saveBtn.textContent = 'Zapisz i przetestuj';
        }
      });
    }

    const retestBtn = document.getElementById('gcore-retest-btn');
    if (retestBtn) {
      retestBtn.addEventListener('click', async () => {
        const errEl = document.getElementById('gcore-form-error');
        errEl.textContent = '';
        retestBtn.disabled = true;
        retestBtn.textContent = 'Testowanie...';
        try {
          const newStatus = await api('/gcore/test', { method: 'POST' });
          renderGcoreTiles(newStatus);
        } catch (e) {
          errEl.textContent = e.message;
          retestBtn.disabled = false;
          retestBtn.textContent = 'Testuj polaczenie ponownie';
        }
      });
    }

    const removeBtn = document.getElementById('gcore-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        if (!confirm('Usunac zapisany klucz API Gcore?')) return;
        removeBtn.disabled = true;
        try {
          const newStatus = await api('/gcore/apikey', { method: 'DELETE' });
          renderGcoreTiles(newStatus);
        } catch (e) {
          document.getElementById('gcore-form-error').textContent = e.message;
          removeBtn.disabled = false;
        }
      });
    }
  }

  const renderers = { dashboard: renderDashboard, services: renderServices, gcore: renderGcore };

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
