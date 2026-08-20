(function () {
  'use strict';

  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const content = document.getElementById('content');
  const tabs = document.querySelectorAll('.tab');
  const currentUserEl = document.getElementById('current-user');
  const clockEl = document.getElementById('footer-clock');

  const { t, getLang, setLang, locale, applyStaticTranslations } = window.CC_I18N;

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
    content.innerHTML = `<p>${t('loading')}</p>`;
    let info = {};
    try {
      info = await api('/system/summary');
    } catch (e) {
      content.innerHTML = `<p class="error-msg">${e.message}</p>`;
      return;
    }

    const cpuDetail = info.cpu ? `${info.cpu.model || '-'} (${info.cpu.cores} ${t('cores_suffix')})` : '';
    const ramDetail = info.memory ? `${fmtBytes(info.memory.usedBytes)} / ${fmtBytes(info.memory.totalBytes)}` : '';
    const swapDetail = info.swap ? `${fmtBytes(info.swap.usedBytes)} / ${fmtBytes(info.swap.totalBytes)}` : '';
    const diskDetail = info.disk ? `${fmtBytes(info.disk.usedBytes)} / ${fmtBytes(info.disk.totalBytes)}` : '';

    content.innerHTML = `
      <div class="system-grid">
        ${meterTile(t('cpu'), info.cpu ? info.cpu.usagePercent : 0, cpuDetail)}
        ${meterTile(t('ram'), info.memory ? info.memory.usedPercent : 0, ramDetail)}
        ${info.swap ? meterTile(t('swap'), info.swap.usedPercent, swapDetail) : valueTile(t('swap'), t('swap_none'))}
        ${info.disk ? meterTile(t('disk'), info.disk.usedPercent, diskDetail) : valueTile(t('disk'), '-')}
        ${valueTile(t('host'), info.hostname || '-')}
        ${valueTile(t('uptime'), fmtUptime(info.uptimeSeconds || 0))}
      </div>
    `;
  }

  async function renderServices() {
    content.innerHTML = `<p>${t('loading')}</p>`;
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
          const label = s.found ? `${s.activeState}${s.subState ? ' (' + s.subState + ')' : ''}` : t('not_found');
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
    try { return new Date(iso).toLocaleString(locale()); } catch { return iso; }
  }

  async function renderGcore() {
    content.innerHTML = `<p>${t('loading')}</p>`;
    let status;
    try {
      status = await api('/gcore/status');
    } catch (e) {
      content.innerHTML = `<p class="error-msg">${escapeHtml(e.message)}</p>`;
      return;
    }

    const connected = Boolean(status.configured && status.lastTest && status.lastTest.ok);
    let zonesSection = '';
    let certsSection = '';
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

      let certs = [];
      let certsError = null;
      try {
        certs = await api('/gcore/certs');
      } catch (e) {
        certsError = e.message;
      }
      certsSection = buildCertsSection(certs, certsError);

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
          <h2>${t('zones_title')}</h2>
          <p class="empty-state">${t('zones_gate_msg')}</p>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="module-grid">${buildIntegrationTile(status)}${buildStatsTile(status)}</div>
      ${zonesSection}
      ${certsSection}
      ${recordsSection}
    `;

    wireIntegrationTile();
    if (connected) { wireZonesSection(); wireCertsSection(); }
    if (connected && gcoreEditingZone) wireRecordsSection();
  }

  function buildIntegrationTile(status) {
    const lt = status.lastTest;
    const testBadge = !lt
      ? `<span class="badge unknown">${t('status_untested')}</span>`
      : lt.ok
        ? `<span class="badge active">${t('status_connected')}</span>`
        : `<span class="badge inactive">${t('status_error')}</span>`;

    return `
      <div class="panel-block">
        <h2>${t('integration_title')}</h2>
        ${status.configured ? `
          <div class="form-field">
            <label>${t('saved_key_label')}</label>
            <input type="text" value="${escapeHtml(status.maskedKey)}" disabled>
          </div>
          <p>${t('status_label')} ${testBadge} ${lt ? `<span style="font-size:11px;color:var(--muted);font-family:var(--mono);">(${fmtDateTime(lt.at)})</span>` : ''}</p>
          ${lt && !lt.ok ? `<p class="error-msg">${escapeHtml(lt.error)}</p>` : ''}
          <div class="btn-row">
            <button class="btn secondary" id="gcore-retest-btn">${t('retest_btn')}</button>
            <button class="btn danger" id="gcore-remove-btn">${t('remove_key_btn')}</button>
          </div>
        ` : `
          <div class="form-field">
            <label>${t('api_key_label')}</label>
            <input type="password" id="gcore-apikey-input" placeholder="${t('api_key_placeholder')}" autocomplete="off">
          </div>
          <div class="btn-row">
            <button class="btn" id="gcore-save-btn">${t('save_test_btn')}</button>
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
        <p class="empty-state">${t('stats_preview')}</p>
        <pre class="output">${escapeHtml(JSON.stringify(lt.client, null, 2))}</pre>
      `
      : `<p class="empty-state">${t('stats_empty')}</p>`;

    return `
      <div class="panel-block">
        <h2>${t('stats_title')}</h2>
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
        saveBtn.textContent = t('save_test_btn_loading');
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
          saveBtn.textContent = t('save_test_btn');
        }
      });
    }

    const retestBtn = document.getElementById('gcore-retest-btn');
    if (retestBtn) {
      retestBtn.addEventListener('click', async () => {
        const errEl = document.getElementById('gcore-form-error');
        errEl.textContent = '';
        retestBtn.disabled = true;
        retestBtn.textContent = t('retest_btn_loading');
        try {
          await api('/gcore/test', { method: 'POST' });
          renderGcore();
        } catch (e) {
          errEl.textContent = e.message;
          retestBtn.disabled = false;
          retestBtn.textContent = t('retest_btn');
        }
      });
    }

    const removeBtn = document.getElementById('gcore-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        if (!confirm(t('remove_key_confirm'))) return;
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
        ? `<tr><td colspan="5" class="empty-state">${t('zones_empty')}</td></tr>`
        : zones.map((z) => `
            <tr>
              <td>${escapeHtml(z.name)}</td>
              <td><span class="badge ${z.status === 'active' ? 'active' : 'inactive'}" title="${escapeHtml(z.status || '-')}">${z.status === 'active' ? 'Delegated' : 'Non Delegated'}</span></td>
              <td>${z.recordsTotal ?? '-'}</td>
              <td>${z.dnssecEnabled ? t('yes') : t('no')}</td>
              <td>
                <div class="btn-row" style="margin-bottom:0;">
                  <button class="btn secondary gcore-zone-edit-btn" data-zone="${escapeHtml(z.name)}">${t('edit_btn')}</button>
                  <button class="btn danger gcore-zone-delete-btn" data-zone="${escapeHtml(z.name)}">${t('delete_btn')}</button>
                </div>
              </td>
            </tr>
          `).join('');

    return `
      <div class="panel-block">
        <h2>${t('zones_title')}</h2>
        <div style="overflow-x:auto;">
          <table class="zones">
            <thead><tr><th>${t('th_zone')}</th><th>${t('th_status')}</th><th>${t('th_records')}</th><th>${t('th_dnssec')}</th><th>${t('th_actions')}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <h2 style="margin-top:20px;">${t('add_zone_title')}</h2>
        <div class="form-field">
          <label>${t('domain_name_label')}</label>
          <input type="text" id="gcore-zone-name-input" placeholder="przyklad.pl">
        </div>
        <div class="btn-row">
          <button class="btn" id="gcore-zone-add-btn">${t('add_zone_btn')}</button>
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
        if (!confirm(t('delete_zone_confirm', { zone }))) return;
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

  function buildCertsSection(certs, certsError) {
    const rows = certsError
      ? `<tr><td colspan="6" class="error-msg">${escapeHtml(certsError)}</td></tr>`
      : certs.length === 0
        ? `<tr><td colspan="6" class="empty-state">${t('certs_empty')}</td></tr>`
        : certs.map((c) => `
            <tr>
              <td>${escapeHtml(c.domain)}</td>
              <td><span class="badge active">${c.staging ? t('cert_env_staging') : t('cert_env_production')}</span></td>
              <td>${fmtDateTime(c.notBefore)}</td>
              <td>${fmtDateTime(c.notAfter)}</td>
              <td style="font-family:var(--mono);font-size:11px;">${escapeHtml(c.certPath)}</td>
              <td>
                <div class="btn-row" style="margin-bottom:0;">
                  <button class="btn secondary gcore-cert-renew-btn" data-domain="${escapeHtml(c.domain)}">${t('renew_btn')}</button>
                  <button class="btn danger gcore-cert-delete-btn" data-domain="${escapeHtml(c.domain)}">${t('delete_btn')}</button>
                </div>
              </td>
            </tr>
          `).join('');

    return `
      <div class="panel-block">
        <h2>${t('certs_title')}</h2>
        <p class="empty-state">${t('certs_autorenew_note')}</p>
        <div style="overflow-x:auto;">
          <table class="zones">
            <thead><tr><th>${t('th_domain')}</th><th>${t('th_environment')}</th><th>${t('th_valid_from')}</th><th>${t('th_valid_to')}</th><th>${t('th_file')}</th><th>${t('th_actions')}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <h2 style="margin-top:20px;">${t('issue_new_cert_title')}</h2>
        <p class="empty-state">${t('cert_domain_hint')}</p>
        <div class="form-grid">
          <div class="form-field">
            <label>${t('domain_label')}</label>
            <input type="text" id="gcore-cert-domain-input" placeholder="cdn.24z.eu">
          </div>
          <div class="form-field">
            <label>${t('email_label')}</label>
            <input type="text" id="gcore-cert-email-input" placeholder="admin@24z.eu">
          </div>
        </div>
        <div class="form-field">
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="gcore-cert-staging-input" checked style="width:auto;">
            ${t('staging_checkbox_label')}
          </label>
        </div>
        <div class="btn-row">
          <button class="btn" id="gcore-cert-issue-btn">${t('issue_cert_btn')}</button>
        </div>
        <p class="empty-state" id="gcore-cert-progress" style="display:none;">${t('issue_progress')}</p>
        <div class="error-msg" id="gcore-cert-form-error"></div>
      </div>
    `;
  }

  function wireCertsSection() {
    document.querySelectorAll('.gcore-cert-renew-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const domain = btn.dataset.domain;
        const errEl = document.getElementById('gcore-cert-form-error');
        errEl.textContent = '';
        btn.disabled = true;
        btn.textContent = t('renew_btn_loading');
        try {
          await api(`/gcore/certs/${encodeURIComponent(domain)}/renew`, { method: 'POST' });
          renderGcore();
        } catch (e) {
          errEl.textContent = e.message;
          btn.disabled = false;
          btn.textContent = t('renew_btn');
        }
      });
    });

    document.querySelectorAll('.gcore-cert-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const domain = btn.dataset.domain;
        if (!confirm(t('delete_cert_confirm', { domain }))) return;
        btn.disabled = true;
        try {
          await api(`/gcore/certs/${encodeURIComponent(domain)}`, { method: 'DELETE' });
          renderGcore();
        } catch (e) {
          document.getElementById('gcore-cert-form-error').textContent = e.message;
          btn.disabled = false;
        }
      });
    });

    const issueBtn = document.getElementById('gcore-cert-issue-btn');
    if (issueBtn) {
      issueBtn.addEventListener('click', async () => {
        const domain = document.getElementById('gcore-cert-domain-input').value;
        const email = document.getElementById('gcore-cert-email-input').value;
        const staging = document.getElementById('gcore-cert-staging-input').checked;
        const errEl = document.getElementById('gcore-cert-form-error');
        const progressEl = document.getElementById('gcore-cert-progress');
        errEl.textContent = '';
        issueBtn.disabled = true;
        progressEl.style.display = 'block';
        try {
          await api('/gcore/certs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, email: email || undefined, staging })
          });
          renderGcore();
        } catch (e) {
          errEl.textContent = e.message;
          issueBtn.disabled = false;
          progressEl.style.display = 'none';
        }
      });
    }
  }

  const GCORE_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'NS', 'MX', 'CAA', 'SRV'];

  function buildRecordsSection(zoneName, records, recordsError) {
    const rows = recordsError
      ? `<tr><td colspan="5" class="error-msg">${escapeHtml(recordsError)}</td></tr>`
      : records.length === 0
        ? `<tr><td colspan="5" class="empty-state">${t('records_empty')}</td></tr>`
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
                      <button class="btn" id="gcore-record-save-btn">${t('save_btn')}</button>
                      <button class="btn secondary" id="gcore-record-cancel-btn">${t('cancel_btn')}</button>
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
                    <button class="btn secondary gcore-record-edit-btn" data-name="${escapeHtml(r.name)}" data-type="${escapeHtml(r.type)}">${t('edit_btn')}</button>
                    <button class="btn danger gcore-record-delete-btn" data-name="${escapeHtml(r.name)}" data-type="${escapeHtml(r.type)}">${t('delete_btn')}</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');

    const typeOptions = GCORE_RECORD_TYPES.map((ty) => `<option value="${ty}">${ty}</option>`).join('');

    return `
      <div class="panel-block">
        <h2 style="display:flex;align-items:center;justify-content:space-between;">
          <span>${t('records_title_prefix')} ${escapeHtml(zoneName)}</span>
          <button class="secondary" id="gcore-records-close-btn">${t('close_btn')}</button>
        </h2>
        <div style="overflow-x:auto;">
          <table class="zones">
            <thead><tr><th>${t('th_name')}</th><th>${t('th_type')}</th><th>${t('th_ttl')}</th><th>${t('th_values')}</th><th>${t('th_actions')}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <h2 style="margin-top:20px;">${t('add_record_title')}</h2>
        <div class="form-grid">
          <div class="form-field">
            <label>${t('record_name_label', { zone: escapeHtml(zoneName) })}</label>
            <input type="text" id="gcore-record-add-name" placeholder="www.${escapeHtml(zoneName)}">
          </div>
          <div class="form-field">
            <label>${t('record_type_label')}</label>
            <select id="gcore-record-add-type">${typeOptions}</select>
          </div>
          <div class="form-field">
            <label>${t('record_ttl_label')}</label>
            <input type="number" id="gcore-record-add-ttl" value="300">
          </div>
        </div>
        <div class="form-field">
          <label>${t('record_value_label')}</label>
          <textarea id="gcore-record-add-values" rows="2" placeholder="np. 1.2.3.4" style="width:100%;font-family:var(--mono);font-size:12px;"></textarea>
        </div>
        <div class="btn-row">
          <button class="btn" id="gcore-record-add-btn">${t('add_record_btn')}</button>
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
        if (!confirm(t('delete_record_confirm', { name, type }))) return;
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

  async function renderCdn() {
    content.innerHTML = `<p>${t('loading')}</p>`;

    let pool = { domain: '' };
    let poolError = null;
    try {
      pool = await api('/cdn/pool');
    } catch (e) {
      poolError = e.message;
    }

    let popsData = { pops: [], checked: false, dnsError: null };
    let popsError = null;
    try {
      popsData = await api('/cdn/pops');
    } catch (e) {
      popsError = e.message;
    }

    content.innerHTML = `
      <div class="module-grid">${buildPoolTile(pool, poolError)}${buildPopsTile(popsData, popsError)}</div>
      <div class="module-grid">${buildMainPointTile(pool)}${buildPopPointTile()}</div>
      ${pool.mainPointHost ? buildCaddyConfigSection(pool) : ''}
    `;

    wirePoolTile();
    wireMainPointTile();
    wirePopPointTile();
  }

  function buildMainPointTile(pool) {
    return `
      <div class="panel-block">
        <h2>${t('main_point_tile_title')}</h2>
        <p class="empty-state">${t('main_point_hint')}</p>
        <div class="form-field">
          <label>${t('main_point_host_label')}</label>
          <input type="text" id="cdn-main-point-host-input" placeholder="phl.24z.eu" value="${escapeHtml(pool.mainPointHost || '')}">
        </div>
        <div class="btn-row">
          <button class="btn" id="cdn-main-point-save-btn">${t('save_main_point_btn')}</button>
        </div>
        <div class="error-msg" id="cdn-main-point-form-error"></div>
      </div>
    `;
  }

  function wireMainPointTile() {
    const saveBtn = document.getElementById('cdn-main-point-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const host = document.getElementById('cdn-main-point-host-input').value;
        const errEl = document.getElementById('cdn-main-point-form-error');
        errEl.textContent = '';
        saveBtn.disabled = true;
        try {
          await api('/cdn/pool/main-point', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host })
          });
          renderCdn();
        } catch (e) {
          errEl.textContent = e.message;
          saveBtn.disabled = false;
        }
      });
    }
  }

  function buildCaddyConfigSection(pool) {
    const caddyTile = `
      <div class="panel-block">
        <h2>${t('caddy_config_title')}</h2>
        <p class="empty-state">${t('caddy_config_placeholder', { host: escapeHtml(pool.mainPointHost) })}</p>
      </div>
    `;
    const infoTile = `
      <div class="panel-block">
        <h2>${t('info_tile_title')}</h2>
        <p class="empty-state">${t('info_tile_placeholder')}</p>
      </div>
    `;
    return `<div class="module-grid">${caddyTile}${infoTile}</div>`;
  }

  function buildPopPointTile() {
    return `
      <div class="panel-block">
        <h2>${t('pop_point_tile_title')}</h2>
        <p class="empty-state">${t('pop_point_hint')}</p>
        <div class="form-grid">
          <div class="form-field">
            <label>${t('ip_address_label')}</label>
            <input type="text" id="cdn-pop-point-ip-input" placeholder="203.0.113.20">
          </div>
          <div class="form-field">
            <label>${t('ttl_optional_label')}</label>
            <input type="number" id="cdn-pop-point-ttl-input" placeholder="300">
          </div>
        </div>
        <div class="form-field">
          <label>${t('countries_label')}</label>
          <input type="text" id="cdn-pop-point-countries-input" placeholder="PL,DE,CZ">
        </div>
        <div class="btn-row">
          <button class="btn" id="cdn-pop-point-save-btn">${t('add_pop_point_btn')}</button>
        </div>
        <p class="empty-state">${t('geo_verify_note')}</p>
        <div class="error-msg" id="cdn-pop-point-form-error"></div>
      </div>
    `;
  }

  function wirePopPointTile() {
    const saveBtn = document.getElementById('cdn-pop-point-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const ip = document.getElementById('cdn-pop-point-ip-input').value;
        const ttl = document.getElementById('cdn-pop-point-ttl-input').value;
        const countries = document.getElementById('cdn-pop-point-countries-input').value;
        const errEl = document.getElementById('cdn-pop-point-form-error');
        errEl.textContent = '';
        saveBtn.disabled = true;
        try {
          await api('/cdn/pool/pop-point', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, ttl, countries })
          });
          renderCdn();
        } catch (e) {
          errEl.textContent = e.message;
          saveBtn.disabled = false;
        }
      });
    }
  }

  function buildPoolTile(pool, poolError) {
    return `
      <div class="panel-block">
        <h2>${t('pool_tile_title')}</h2>
        <p class="empty-state">${t('pool_domain_hint')}</p>
        ${poolError ? `<p class="error-msg">${escapeHtml(poolError)}</p>` : ''}
        <div class="form-field">
          <label>${t('pool_domain_label')}</label>
          <input type="text" id="cdn-pool-domain-input" placeholder="cdn.24z.eu" value="${escapeHtml(pool.domain || '')}">
        </div>
        <div class="btn-row">
          <button class="btn" id="cdn-pool-save-btn">${t('save_btn')}</button>
        </div>
        <div class="error-msg" id="cdn-pool-form-error"></div>
      </div>
    `;
  }

  function wirePoolTile() {
    const saveBtn = document.getElementById('cdn-pool-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const input = document.getElementById('cdn-pool-domain-input');
        const errEl = document.getElementById('cdn-pool-form-error');
        errEl.textContent = '';
        saveBtn.disabled = true;
        try {
          await api('/cdn/pool', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: input.value })
          });
          renderCdn();
        } catch (e) {
          errEl.textContent = e.message;
          saveBtn.disabled = false;
        }
      });
    }
  }

  function buildPopsTile(popsData, popsError) {
    const pops = popsData.pops || [];
    const rows = popsError || popsData.dnsError
      ? `<tr><td colspan="4" class="error-msg">${escapeHtml(popsError || popsData.dnsError)}</td></tr>`
      : pops.length === 0
        ? `<tr><td colspan="4" class="empty-state">${t('pops_empty')}</td></tr>`
        : pops.map((p) => {
            const statusBadge = p.active
              ? `<span class="badge active">${t('pop_status_active')}</span>`
              : `<span class="badge inactive">${t('pop_status_inactive')}</span>`;
            return `
            <tr>
              <td>${escapeHtml(p.host)}</td>
              <td style="font-family:var(--mono);font-size:12px;">${escapeHtml(p.ip)}</td>
              <td>${escapeHtml(p.description || '-')}</td>
              <td>${statusBadge}</td>
            </tr>
          `;
          }).join('');

    return `
      <div class="panel-block">
        <h2>${t('pops_tile_title')}</h2>
        <p class="empty-state">${t('pops_dns_note')}</p>
        <div style="overflow-x:auto;">
          <table class="zones">
            <thead><tr><th>${t('th_pop_host')}</th><th>${t('th_pop_ip')}</th><th>${t('th_pop_description')}</th><th>${t('th_pop_status')}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  const renderers = { dashboard: renderDashboard, services: renderServices, gcore: renderGcore, cdn: renderCdn };

  function switchTab(tab) {
    activeTab = tab;
    tabs.forEach((t2) => t2.classList.toggle('active', t2.dataset.tab === tab));
    renderers[tab]();
  }

  tabs.forEach((tb) => tb.addEventListener('click', () => switchTab(tb.dataset.tab)));

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cc-theme', next); } catch (e) {}
  });

  function updateLangSwitchUI() {
    const lang = getLang();
    document.querySelectorAll('.lang-switch[data-lang]').forEach((el) => {
      el.classList.toggle('active', el.dataset.lang === lang);
    });
  }

  document.querySelectorAll('.lang-switch[data-lang]').forEach((el) => {
    el.addEventListener('click', () => {
      if (getLang() === el.dataset.lang) return;
      setLang(el.dataset.lang);
      applyStaticTranslations();
      updateLangSwitchUI();
      if (app.style.display !== 'none') {
        switchTab(activeTab);
        loadVersionBadge();
      }
    });
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
      if (!res.ok) throw new Error(data.error || t('login_error_generic'));
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
      badge.title = t('version_check_fail') + e.message;
      return;
    }

    if (info.error) {
      badge.className = 'badge unknown';
      badge.textContent = '?';
      badge.title = t('version_check_fail') + info.error;
      badge.onclick = null;
      return;
    }

    if (info.updateAvailable) {
      badge.className = 'badge inactive';
      badge.textContent = 'Update';
      badge.title = t('update_available_title', { current: info.current, latest: info.latest });
      badge.onclick = async () => {
        const ok = confirm(t('update_confirm', { current: info.current, latest: info.latest }));
        if (!ok) return;

        badge.onclick = null;
        badge.textContent = t('updating_label');
        try {
          await api('/system/self-update', { method: 'POST' });
          badge.className = 'badge pending';
          badge.textContent = t('restart_required_label');
          badge.title = t('restart_required_title');
          alert(t('update_success_alert'));
        } catch (e) {
          badge.className = 'badge inactive';
          badge.textContent = 'Update';
          alert(t('update_fail_alert', { error: e.message }));
          loadVersionBadge();
        }
      };
    } else {
      badge.className = 'badge active';
      badge.textContent = 'STABLE';
      badge.title = t('stable_title', { current: info.current });
      badge.onclick = null;
    }
  }

  function tickClock() {
    clockEl.textContent = new Date().toLocaleString(locale());
  }
  setInterval(tickClock, 1000);
  tickClock();

  applyStaticTranslations();
  updateLangSwitchUI();

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
