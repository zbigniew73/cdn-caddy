import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { listRecords, findZoneForDomain } from './gcoreDns.js';

// Podstawowa konfiguracja "puli CDN" (domena, pod ktora dzialaja wszystkie
// POP-y - routing po tokenie w sciezce, np. cdn.24z.eu/<token>/plik - patrz
// caddy_cdn_gcore.md) oraz lista punktow POP (wezlow Caddy, ktore realnie
// serwuja ruch). Zaden sekret tu nie zyje (w przeciwienstwie do
// server/services/gcore.js), wiec zwykly plik danych bez specjalnych
// uprawnien wystarczy.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const POOL_FILE = path.join(DATA_DIR, 'cdn-pool.json');

function fieldError(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

function readState() {
  try {
    const raw = fs.readFileSync(POOL_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return { domain: parsed.domain || '', pops: Array.isArray(parsed.pops) ? parsed.pops : [] };
  } catch {
    return { domain: '', pops: [] };
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(POOL_FILE, JSON.stringify(state, null, 2));
}

function getPoolConfig() {
  const { domain } = readState();
  return { domain };
}

function savePoolConfig(domain) {
  const trimmed = (domain || '').trim().replace(/\.$/, '');
  const state = readState();
  state.domain = trimmed;
  writeState(state);
  return getPoolConfig();
}

function listPops() {
  return readState().pops;
}

// Sprawdza realny stan DNS domeny puli (rekordy A/AAAA dla nazwy rownej
// tej domenie, w strefie Gcore, do ktorej nalezy) i oznacza kazdy POP z
// listy jako aktywny, jesli jego adres faktycznie tam odpowiada. To NA
// RAZIE tylko "czy jest w puli DNS" - pelna weryfikacja konfiguracji
// (Caddy dziala, cert zaladowany itp.) to osobny, przyszly krok.
async function getPopsWithStatus() {
  const state = readState();

  if (!state.domain) {
    return { pops: state.pops.map((p) => ({ ...p, active: false })), checked: false, dnsError: null };
  }

  let dnsIps = [];
  let dnsError = null;
  try {
    const zoneName = await findZoneForDomain(state.domain);
    if (!zoneName) {
      throw new Error(`Nie znaleziono w Gcore strefy dla domeny puli "${state.domain}".`);
    }
    const records = await listRecords(zoneName);
    dnsIps = records
      .filter((r) => r.name === state.domain && (r.type === 'A' || r.type === 'AAAA'))
      .flatMap((r) => r.values);
  } catch (e) {
    dnsError = e.message;
  }

  return {
    pops: state.pops.map((p) => ({ ...p, active: dnsIps.includes(p.host) })),
    checked: !dnsError,
    dnsError
  };
}

function addPop({ name, host }) {
  const trimmedName = (name || '').trim();
  const trimmedHost = (host || '').trim();
  if (!trimmedName) throw fieldError('Podaj nazwe (host) POP-a.');
  if (!trimmedHost) throw fieldError('Podaj adres IP POP-a.');

  const state = readState();
  const pop = {
    id: crypto.randomUUID(),
    name: trimmedName,
    host: trimmedHost,
    addedAt: new Date().toISOString()
  };
  state.pops.push(pop);
  writeState(state);
  return pop;
}

function updatePop(id, { name, host }) {
  const state = readState();
  const pop = state.pops.find((p) => p.id === id);
  if (!pop) throw fieldError('Nie znaleziono POP-a o podanym id.');

  const trimmedName = (name || '').trim();
  const trimmedHost = (host || '').trim();
  if (!trimmedName) throw fieldError('Podaj nazwe (host) POP-a.');
  if (!trimmedHost) throw fieldError('Podaj adres IP POP-a.');

  pop.name = trimmedName;
  pop.host = trimmedHost;
  writeState(state);
  return pop;
}

function deletePop(id) {
  const state = readState();
  const before = state.pops.length;
  state.pops = state.pops.filter((p) => p.id !== id);
  if (state.pops.length === before) throw fieldError('Nie znaleziono POP-a o podanym id.');
  writeState(state);
  return { ok: true };
}

export { getPoolConfig, savePoolConfig, listPops, getPopsWithStatus, addPop, updatePop, deletePop };
