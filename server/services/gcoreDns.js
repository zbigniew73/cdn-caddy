import { getApiKey } from './gcore.js';

// Klient Gcore Managed DNS API. Sciezki/metody zweryfikowane wprost w
// oficjalnym Go SDK Gcore (github.com/G-Core/gcore-dns-sdk-go/client.go) -
// dokumentacja HTML na docs.gcore.com czesto 404-uje / jest niepelna, SDK
// jest pewniejszym zrodlem prawdy o realnych endpointach.
const API_BASE = 'https://api.gcore.com/dns';

const SUPPORTED_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'NS', 'MX', 'CAA', 'SRV'];

function fieldError(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

async function gcoreRequest(method, path, body) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw Object.assign(new Error('Klucz API Gcore nie jest skonfigurowany (zakladka "Integracja API").'), { status: 400 });
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `APIKey ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    const msg = data?.error || data?.detail || `Gcore API zwrocilo HTTP ${res.status}`;
    throw Object.assign(new Error(msg), {
      status: res.status >= 400 && res.status < 500 ? 400 : 502,
      httpStatus: res.status
    });
  }
  return data;
}

// Surowy rrset (z zachowanym "meta"/"filters", w przeciwienstwie do
// listRecords()) - null jesli nie istnieje. Uzywane przez modul puli CDN
// do budowania GeoDNS (glowny/domyslny punkt + punkty POP per kraj).
async function getRawRRSet(zoneName, name, type) {
  try {
    return await gcoreRequest('GET', `/v2/zones/${encodeURIComponent(zoneName)}/${encodeURIComponent(name)}/${type}`);
  } catch (e) {
    if (e.httpStatus === 404) return null;
    throw e;
  }
}

// Dodaje/aktualizuje punkt POP z geo-targetowaniem (meta.countries) -
// identyfikowany po adresie IP (jesli juz istnieje wpis z tym IP,
// podmienia mu liste krajow zamiast dublowac). Dopina tez filtr "geodns"
// na poziomie calego rrsetu - bez niego Gcore zwracalby po prostu
// wszystkie wlaczone rekordy naraz, a nie realny wybor wg kraju
// zapytania (patrz RRSet.Filters / NewGeoDNSFilter w oficjalnym SDK).
async function setGeoResourceRecord(zoneName, name, type, ip, countries, ttl) {
  const existing = await getRawRRSet(zoneName, name, type);
  const kept = existing ? existing.resource_records.filter((r) => !(Array.isArray(r.content) && r.content[0] === ip)) : [];
  const resourceRecords = [...kept, { content: [ip], enabled: true, meta: { countries } }];
  const body = {
    ttl: parseInt(ttl, 10) || (existing ? existing.ttl : 300),
    resource_records: resourceRecords,
    filters: [{ type: 'geodns', limit: 1, strict: false }]
  };
  await gcoreRequest(existing ? 'PUT' : 'POST', `/v2/zones/${encodeURIComponent(zoneName)}/${encodeURIComponent(name)}/${type}`, body);
  return { ok: true };
}

async function listZones() {
  const data = await gcoreRequest('GET', '/v2/zones?limit=1000');
  return (data?.zones || []).map((z) => ({
    name: z.name,
    status: z.status,
    dnssecEnabled: Boolean(z.dnssec_enabled),
    recordsTotal: z.rrsets_amount?.total ?? null
  }));
}

// Znajduje strefe zarzadzana w Gcore, do ktorej nalezy dana domena -
// domena moze byc sama strefa (apex) albo jej poddomena (np.
// "cdn.24z.eu" nalezy do strefy "24z.eu", nie jest wlasna strefa).
// Uzywane przez modul certyfikatow DNS-01, zeby wiedziec, w ktorej
// strefie utworzyc tymczasowy rekord TXT.
async function findZoneForDomain(domain) {
  const zones = await listZones();
  const candidates = zones
    .map((z) => z.name)
    .filter((name) => domain === name || domain.endsWith(`.${name}`));

  if (candidates.length === 0) return null;

  // Najdluzsza nazwa = najbardziej szczegolowe dopasowanie.
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

async function createZone(name) {
  const trimmed = (name || '').trim().replace(/\.$/, '');
  if (!trimmed) throw fieldError('Podaj nazwe strefy.');
  const res = await gcoreRequest('POST', '/v2/zones', { name: trimmed });
  return { ok: true, id: res?.id };
}

async function deleteZone(name) {
  await gcoreRequest('DELETE', `/v2/zones/${encodeURIComponent(name)}`);
  return { ok: true };
}

// --- rrsets (rekordy) ---

// Parsowanie wartosci wpisanej w panelu na tablice "content" zgodnie z
// formatem, jakiego oczekuje Gcore API dla danego typu rekordu (ta sama
// logika co ToRecordType/ToContent w oficjalnym Go SDK).
function valueToContent(type, value) {
  const parts = value.trim().split(/\s+/);
  switch (type) {
    case 'MX':
      if (parts.length !== 2) throw fieldError('Format MX: "priorytet target", np. "10 mail.example.com."');
      return [parseInt(parts[0], 10), parts[1]];
    case 'CAA':
      if (parts.length < 3) throw fieldError('Format CAA: "flaga tag wartosc", np. "0 issue letsencrypt.org"');
      return [parseInt(parts[0], 10), parts[1], parts.slice(2).join(' ')];
    case 'SRV':
      if (parts.length !== 4) throw fieldError('Format SRV: "priorytet waga port target"');
      return [parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10), parts[3]];
    default:
      return [value.trim()];
  }
}

function contentToValue(content) {
  if (!Array.isArray(content)) return String(content ?? '');
  return content.map((c) => (Array.isArray(c) ? c.join(',') : c)).join(' ');
}

// meta.notes w API Gcore to tablica stringow (patrz NewResourceMetaNotes
// w oficjalnym SDK - variadic string) - sklejamy do jednego opisu.
function notesToText(notes) {
  if (!notes) return '';
  if (Array.isArray(notes)) return notes.join(' ');
  return String(notes);
}

async function listRecords(zoneName) {
  const data = await gcoreRequest('GET', `/v2/zones/${encodeURIComponent(zoneName)}/rrsets?all=true`);
  return (data?.rrsets || []).map((rr) => ({
    name: rr.name,
    type: rr.type,
    ttl: rr.ttl,
    values: (rr.resource_records || []).map((r) => contentToValue(r.content)),
    // resourceRecords - jak values, ale z zachowanym "enabled"/"notes" per
    // wpis (Gcore pozwala wylaczyc pojedynczy adres bez usuwania rekordu -
    // przydatne np. do wylaczania POP-a z puli bez kasowania DNS; notes to
    // opis wpisywany recznie w Gcore, np. nazwa POP-a).
    resourceRecords: (rr.resource_records || []).map((r) => ({
      value: contentToValue(r.content),
      enabled: r.enabled !== false,
      notes: notesToText(r.meta?.notes)
    }))
  }));
}

function buildResourceRecords(type, values) {
  const list = (values || []).map((v) => v.trim()).filter(Boolean);
  if (list.length === 0) throw fieldError('Podaj przynajmniej jedna wartosc rekordu.');
  return list.map((v) => ({ content: valueToContent(type, v), enabled: true }));
}

async function createRecord(zoneName, { name, type, ttl, values }) {
  if (!SUPPORTED_TYPES.includes(type)) throw fieldError('Nieobslugiwany typ rekordu: ' + type);
  const trimmedName = (name || '').trim().replace(/\.$/, '');
  if (!trimmedName) throw fieldError('Podaj nazwe rekordu.');

  const body = { ttl: parseInt(ttl, 10) || 300, resource_records: buildResourceRecords(type, values) };
  await gcoreRequest('POST', `/v2/zones/${encodeURIComponent(zoneName)}/${encodeURIComponent(trimmedName)}/${type}`, body);
  return { ok: true };
}

async function updateRecord(zoneName, name, type, { ttl, values }) {
  if (!SUPPORTED_TYPES.includes(type)) throw fieldError('Nieobslugiwany typ rekordu: ' + type);
  const body = { ttl: parseInt(ttl, 10) || 300, resource_records: buildResourceRecords(type, values) };
  await gcoreRequest('PUT', `/v2/zones/${encodeURIComponent(zoneName)}/${encodeURIComponent(name)}/${type}`, body);
  return { ok: true };
}

async function deleteRecord(zoneName, name, type) {
  await gcoreRequest('DELETE', `/v2/zones/${encodeURIComponent(zoneName)}/${encodeURIComponent(name)}/${type}`);
  return { ok: true };
}

export {
  SUPPORTED_TYPES, listZones, createZone, deleteZone, listRecords, createRecord, updateRecord, deleteRecord,
  findZoneForDomain, setGeoResourceRecord
};
