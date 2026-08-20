(function () {
  'use strict';

  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const content = document.getElementById('content');
  const tabs = document.querySelectorAll('.tab');
  const currentUserEl = document.getElementById('current-user');
  const clockEl = document.getElementById('footer-clock');

  let activeTab = 'dashboard';
  let gcoreEditingZone = null;
  let gcoreEditingRecord = null;

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

    const connected = Boolean(status.configured && status.lastTest && status.lastTest.ok);
    let zonesSection = '';
    let recordsSection = '';

    if (connected) {
      let zones = [];
      let zonesError = null;
      try {
        zones = await api('/gcore/zones');
      } catch (e) {
        zonesError = e.message;
      }
      zonesSection = buildZonesSection(zones, zonesError);

      if (gcoreEditingZone) {
        let records = [];
        let recordsError = null;
        try {
          records = await api(`/gcore/zones/${encodeURIComponent(gcoreEditingZone)}/records`);
        } catch (e) {
          recordsError = e.message;
        }
        recordsSection = buildRecordsSection(gcoreEditingZone, records, recordsError);
      }
    } else {
      zonesSection = `
        <div class="panel-block">
          <h2>Zarzadzanie strefami DNS</h2>
          <p class="empty-state">Najpierw skonfiguruj i przetestuj integracje API (kafelek "Integracja API" wyzej).</p>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="module-grid">${buildIntegrationTile(status)}${buildStatsTile(status)}</div>
      ${zonesSection}
      ${recordsSection}
    `;

    wireIntegrationTile();
    if (connected) wireZonesSection();
    if (connected && gcoreEditingZone) wireRecordsSection();
  }

  function buildIntegrationTile(status) {
    const lt = status.lastTest;
    const testBadge = !lt
      ? '<span class="badge unknown">nie testowano</span>'
      : lt.ok
        ? '<span class="badge active">polaczono</span>'
        : '<span class="badge inactive">blad</span>';

    return `
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
  }

  function buildStatsTile(status) {
    const lt = status.lastTest;
    const statsBody = (lt && lt.ok && lt.client)
      ? `
        <p class="empty-state">Podglad odpowiedzi Gcore <code>/iam/clients/me</code>.</p>
        <pre class="output">${escapeHtml(JSON.stringify(lt.client, null, 2))}</pre>
      `
      : `<p class="empty-state">Dostepne po poprawnej integracji (kafelek obok).</p>`;

    return `
      <div class="panel-block">
        <h2>Statystyki i informacje o koncie</h2>
        ${statsBody}
      </div>
    `;
  }

  function wireIntegrationTile() {
    const saveBtn = document.getElementById('gcore-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const input = document.getElementById('gcore-apikey-input');
        const errEl = document.getElementById('gcore-form-error');
        errEl.textContent = '';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Zapisuje i testuje...';
        try {
          await api('/gcore/apikey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: input.value })
          });
          renderGcore();
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
          await api('/gcore/test', { method: 'POST' });
          renderGcore();
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
          gcoreEditingZone = null;
          gcoreEditingRecord = null;
          await api('/gcore/apikey', { method: 'DELETE' });
          renderGcore();
        } catch (e) {
          document.getElementById('gcore-form-error').textContent = e.message;
          removeBtn.disabled = false;
        }
      });
    }
  }

  function buildZonesSection(zones, zonesError) {
    const rows = zonesError
      ? `<tr><td colspan="5" class="error-msg">${escapeHtml(zonesError)}</td></tr>`
      : zones.length === 0
        ? `<tr><td colspan="5" class="empty-state">Brak stref.</td></tr>`
        : zones.map((z) => `
            <tr>
              <td>${escapeHtml(z.name)}</td>
              <td><span class="badge ${z.status === 'active' ? 'active' : 'unknown'}">${escapeHtml(z.status || '-')}</span></td>
              <td>${z.recordsTotal ?? '-'}</td>
              <td>${z.dnssecEnabled ? 'tak' : 'nie'}</td>
              <td>
                <div class="btn-row" style="margin-bottom:0;">
                  <button class="btn secondary gcore-zone-edit-btn" data-zone="${escapeHtml(z.name)}">Edytuj</button>
                  <button class="btn danger gcore-zone-delete-btn" data-zone="${escapeHtml(z.name)}">Usun</button>
                </div>
              </td>
            </tr>
          `).join('');

    return `
      <div class="panel-block">
        <h2>Zarzadzanie strefami DNS</h2>
        <div style="overflow-x:auto;">
          <table class="zones">
            <thead><tr><th>Strefa</th><th>Status</th><th>Rekordy</th><th>DNSSEC</th><th>Akcje</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <h2 style="margin-top:20px;">Dodaj nowa strefe do DNS</h2>
        <div class="form-field">
          <label>Nazwa domeny</label>
          <input type="text" id="gcore-zone-name-input" placeholder="przyklad.pl">
        </div>
        <div class="btn-row">
          <button class="btn" id="gcore-zone-add-btn">Dodaj strefe</button>
        </div>
        <div class="error-msg" id="gcore-zone-form-error"></div>
      </div>
    `;
  }

  function wireZonesSection() {
    document.querySelectorAll('.gcore-zone-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        gcoreEditingZone = btn.dataset.zone;
        gcoreEditingRecord = null;
        renderGcore();
      });
    });

    document.querySelectorAll('.gcore-zone-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const zone = btn.dataset.zone;
        if (!confirm(`Usunac strefe "${zone}" wraz ze wszystkimi rekordami?`)) return;
        btn.disabled = true;
        try {
          await api(`/gcore/zones/${encodeURIComponent(zone)}`, { method: 'DELETE' });
          if (gcoreEditingZone === zone) { gcoreEditingZone = null; gcoreEditingRecord = null; }
          renderGcore();
        } catch (e) {
          document.getElementById('gcore-zone-form-error').textContent = e.message;
          btn.disabled = false;
        }
      });
    });

    const addBtn = document.getElementById('gcore-zone-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const input = document.getElementById('gcore-zone-name-input');
        const errEl = document.getElementById('gcore-zone-form-error');
        errEl.textContent = '';
        addBtn.disabled = true;
        try {
          await api('/gcore/zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: input.value })
          });
          renderGcore();
        } catch (e) {
          errEl.textContent = e.message;
          addBtn.disabled = false;
        }
      });
    }
  }

  const GCORE_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'NS', 'MX', 'CAA', 'SRV'];

  function buildRecordsSection(zoneName, records, recordsError) {
    const rows = recordsError
      ? `<tr><td colspan="5" class="error-msg">${escapeHtml(recordsError)}</td></tr>`
      : records.length === 0
        ? `<tr><td colspan="5" class="empty-state">Brak rekordow.</td></tr>`
        : records.map((r) => {
            const isEditing = gcoreEditingRecord && gcoreEditingRecord.name === r.name && gcoreEditingRecord.type === r.type;
            if (isEditing) {
              return `
                <tr>
                  <td>${escapeHtml(r.name)}</td>
                  <td>${escapeHtml(r.type)}</td>
                  <td><input type="number" id="gcore-record-edit-ttl" value="${r.ttl}" style="width:90px;"></td>
                  <td><textarea id="gcore-record-edit-values" rows="3" style="width:100%;font-family:var(--mono);font-size:12px;">${escapeHtml(r.values.join('\n'))}</textarea></td>
                  <td>
                    <div class="btn-row" style="margin-bottom:0;">
                      <button class="btn" id="gcore-record-save-btn">Zapisz</button>
                      <button class="btn secondary" id="gcore-record-cancel-btn">Anuluj</button>
                    </div>
                  </td>
                </tr>
              `;
            }
            return `
              <tr>
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.type)}</td>
                <td>${r.ttl}</td>
                <td style="font-family:var(--mono);font-size:12px;">${r.values.map(escapeHtml).join('<br>')}</td>
                <td>
                  <div class="btn-row" style="margin-bottom:0;">
                    <button class="btn secondary gcore-record-edit-btn" data-name="${escapeHtml(r.name)}" data-type="${escapeHtml(r.type)}">Edytuj</button>
                    <button class="btn danger gcore-record-delete-btn" data-name="${escapeHtml(r.name)}" data-type="${escapeHtml(r.type)}">Usun</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');

    const typeOptions = GCORE_RECORD_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');

    return `
      <div class="panel-block">
        <h2 style="display:flex;align-items:center;justify-content:space-between;">
          <span>Rekordy strefy: ${escapeHtml(zoneName)}</span>
          <button class="secondary" id="gcore-records-close-btn">Zamknij</button>
        </h2>
        <div style="overflow-x:auto;">
          <table class="zones">
            <thead><tr><th>Nazwa</th><th>Typ</th><th>TTL</th><th>Wartosci</th><th>Akcje</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <h2 style="margin-top:20px;">Dodaj nowy rekord</h2>
        <div class="form-grid">
          <div class="form-field">
            <label>Nazwa (pelna, np. www.${escapeHtml(zoneName)})</label>
            <input type="text" id="gcore-record-add-name" placeholder="www.${escapeHtml(zoneName)}">
          </div>
          <div class="form-field">
            <label>Typ</label>
            <select id="gcore-record-add-type">${typeOptions}</select>
          </div>
          <div class="form-field">
            <label>TTL</label>
            <input type="number" id="gcore-record-add-ttl" value="300">
          </div>
        </div>
        <div class="form-field">
          <label>Wartosc (jedna na linie; MX: "priorytet target", CAA: "flaga tag wartosc", SRV: "priorytet waga port target")</label>
          <textarea id="gcore-record-add-values" rows="2" placeholder="np. 1.2.3.4" style="width:100%;font-family:var(--mono);font-size:12px;"></textarea>
        </div>
        <div class="btn-row">
          <button class="btn" id="gcore-record-add-btn">Dodaj rekord</button>
        </div>
        <div class="error-msg" id="gcore-record-form-error"></div>
      </div>
    `;
  }

  function wireRecordsSection() {
    const closeBtn = document.getElementById('gcore-records-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        gcoreEditingZone = null;
        gcoreEditingRecord = null;
        renderGcore();
      });
    }

    document.querySelectorAll('.gcore-record-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        gcoreEditingRecord = { name: btn.dataset.name, type: btn.dataset.type };
        renderGcore();
      });
    });

    const saveBtn = document.getElementById('gcore-record-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const ttl = document.getElementById('gcore-record-edit-ttl').value;
        const values = document.getElementById('gcore-record-edit-values').value.split('\n').map((v) => v.trim()).filter(Boolean);
        const errEl = document.getElementById('gcore-record-form-error');
        errEl.textContent = '';
        saveBtn.disabled = true;
        try {
          await api(`/gcore/zones/${encodeURIComponent(gcoreEditingZone)}/records/${encodeURIComponent(gcoreEditingRecord.type)}/${encodeURIComponent(gcoreEditingRecord.name)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl, values })
          });
          gcoreEditingRecord = null;
          renderGcore();
        } catch (e) {
          errEl.textContent = e.message;
          saveBtn.disabled = false;
        }
      });
    }

    const cancelBtn = document.getElementById('gcore-record-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        gcoreEditingRecord = null;
        renderGcore();
      });
    }

    document.querySelectorAll('.gcore-record-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const type = btn.dataset.type;
        if (!confirm(`Usunac rekord ${name} (${type})?`)) return;
        btn.disabled = true;
        try {
          await api(`/gcore/zones/${encodeURIComponent(gcoreEditingZone)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`, { method: 'DELETE' });
          if (gcoreEditingRecord && gcoreEditingRecord.name === name && gcoreEditingRecord.type === type) gcoreEditingRecord = null;
          renderGcore();
        } catch (e) {
          document.getElementById('gcore-record-form-error').textContent = e.message;
          btn.disabled = false;
        }
      });
    });

    const addBtn = document.getElementById('gcore-record-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const name = document.getElementById('gcore-record-add-name').value;
        const type = document.getElementById('gcore-record-add-type').value;
        const ttl = document.getElementById('gcore-record-add-ttl').value;
        const values = document.getElementById('gcore-record-add-values').value.split('\n').map((v) => v.trim()).filter(Boolean);
        const errEl = document.getElementById('gcore-record-form-error');
        errEl.textContent = '';
        addBtn.disabled = true;
        try {
          await api(`/gcore/zones/${encodeURIComponent(gcoreEditingZone)}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, ttl, values })
          });
          renderGcore();
        } catch (e) {
          errEl.textContent = e.message;
          addBtn.disabled = false;
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
    loadVersionBadge();
  }

  async function loadVersionBadge() {
    const badge = document.getElementById('version-badge');
    if (!badge) return;
    let info;
    try {
      info = await api('/system/version-check');
    } catch (e) {
      badge.className = 'badge unknown';
      badge.textContent = '?';
      badge.title = 'Nie udalo sie sprawdzic wersji: ' + e.message;
      return;
    }

    if (info.error) {
      badge.className = 'badge unknown';
      badge.textContent = '?';
      badge.title = 'Nie udalo sie sprawdzic wersji: ' + info.error;
      badge.onclick = null;
      return;
    }

    if (info.updateAvailable) {
      badge.className = 'badge inactive';
      badge.textContent = 'Update';
      badge.title = `Dostepna aktualizacja: v${info.current} -> v${info.latest} (kliknij po instrukcje)`;
      badge.onclick = () => alert(
        `Dostepna nowsza wersja: v${info.latest} (masz v${info.current})\n\n` +
        'Na serwerze:\n' +
        '  cd /opt/cdn-caddy\n' +
        '  sudo -u cdnadmin git pull\n' +
        '  sudo systemctl restart cdn-caddy'
      );
    } else {
      badge.className = 'badge active';
      badge.textContent = 'STABLE';
      badge.title = `Masz najnowsza wersje (v${info.current})`;
      badge.onclick = null;
    }
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
