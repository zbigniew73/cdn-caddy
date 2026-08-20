import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Rejestr serwerow POP (Host + Adres IP) do przyszlego wdrazania configu
// Caddy przez SSH - CELOWO oddzielny od modulu Gcore DNS/GeoDNS
// (server/services/cdnPool.js, kafelki "Lista punktow POP" i
// "Dodaj/Ustaw punkt POP" tam zostaja bez zmian). To tylko prosta
// ewidencja: ktore maszyny mamy skonfigurowac/zsynchronizowac.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const FILE = path.join(DATA_DIR, 'pop-servers.json');

function fieldError(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return Array.isArray(raw.servers) ? raw.servers : [];
  } catch {
    return [];
  }
}

function writeState(servers) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(FILE, JSON.stringify({ servers }, null, 2));
}

function listPopServers() {
  return readState();
}

function getPopServer(id) {
  return readState().find((s) => s.id === id) || null;
}

function addPopServer({ host, ip }) {
  const trimmedHost = (host || '').trim();
  const trimmedIp = (ip || '').trim();
  if (!trimmedHost) throw fieldError('Podaj host.');
  if (!trimmedIp) throw fieldError('Podaj adres IP.');

  const servers = readState();
  const server = {
    id: crypto.randomUUID(),
    host: trimmedHost,
    ip: trimmedIp,
    addedAt: new Date().toISOString()
  };
  servers.push(server);
  writeState(servers);
  return server;
}

function deletePopServer(id) {
  const servers = readState();
  const filtered = servers.filter((s) => s.id !== id);
  if (filtered.length === servers.length) throw fieldError('Nie znaleziono serwera POP o podanym id.');
  writeState(filtered);
  return { ok: true };
}

export { listPopServers, getPopServer, addPopServer, deletePopServer };
