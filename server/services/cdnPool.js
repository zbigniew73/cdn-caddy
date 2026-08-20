import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

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

function addPop({ name, host, region }) {
  const trimmedName = (name || '').trim();
  const trimmedHost = (host || '').trim();
  if (!trimmedName) throw fieldError('Podaj nazwe POP-a.');
  if (!trimmedHost) throw fieldError('Podaj adres (IP lub host) POP-a.');

  const state = readState();
  const pop = {
    id: crypto.randomUUID(),
    name: trimmedName,
    host: trimmedHost,
    region: (region || '').trim(),
    addedAt: new Date().toISOString()
  };
  state.pops.push(pop);
  writeState(state);
  return pop;
}

function updatePop(id, { name, host, region }) {
  const state = readState();
  const pop = state.pops.find((p) => p.id === id);
  if (!pop) throw fieldError('Nie znaleziono POP-a o podanym id.');

  const trimmedName = (name || '').trim();
  const trimmedHost = (host || '').trim();
  if (!trimmedName) throw fieldError('Podaj nazwe POP-a.');
  if (!trimmedHost) throw fieldError('Podaj adres (IP lub host) POP-a.');

  pop.name = trimmedName;
  pop.host = trimmedHost;
  pop.region = (region || '').trim();
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

export { getPoolConfig, savePoolConfig, listPops, addPop, updatePop, deletePop };
