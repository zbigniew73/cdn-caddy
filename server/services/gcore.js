import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Klucz API Gcore trzymany OSOBNO od .env - to sekret wpisywany z panelu w
// czasie dzialania (kafelek "Integracja"), nie ustawienie z instalacji.
// Plik danych, nie .env: chmod 600, wlasciciel = SVC_USER (ten sam user co
// caly INSTALL_DIR, wiec zapis nie wymaga sudo).
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'gcore.json');

const API_BASE = 'https://api.gcore.com';
const CLIENT_INFO_PATH = '/iam/clients/me';

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  fs.chmodSync(CONFIG_FILE, 0o600);
}

function maskKey(key) {
  if (!key) return null;
  const tail = key.length > 4 ? key.slice(-4) : key;
  return '********' + tail;
}

async function callClientInfo(apiKey) {
  const res = await fetch(`${API_BASE}${CLIENT_INFO_PATH}`, {
    headers: { Authorization: `APIKey ${apiKey}` }
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.error || body?.detail || `Gcore API zwrocilo blad HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

async function saveAndTestApiKey(apiKey) {
  const trimmed = (apiKey || '').trim();
  if (trimmed.length < 10) {
    throw new Error('Klucz API wyglada na zbyt krotki/pusty.');
  }

  const cfg = { apiKey: trimmed, lastTest: null };
  let client = null;
  let testError = null;
  try {
    client = await callClientInfo(trimmed);
  } catch (e) {
    testError = e.message;
  }

  cfg.lastTest = {
    ok: !testError,
    at: new Date().toISOString(),
    error: testError,
    client: testError ? null : client
  };
  writeConfig(cfg);

  return getStatus();
}

async function retestApiKey() {
  const cfg = readConfig();
  if (!cfg.apiKey) {
    throw new Error('Klucz API nie jest jeszcze zapisany.');
  }
  return saveAndTestApiKey(cfg.apiKey);
}

function removeApiKey() {
  try {
    fs.unlinkSync(CONFIG_FILE);
  } catch {
    // juz nie istnieje - i tak jest to, co chcielismy
  }
}

function getStatus() {
  const cfg = readConfig();
  return {
    configured: Boolean(cfg.apiKey),
    maskedKey: maskKey(cfg.apiKey),
    lastTest: cfg.lastTest || null
  };
}

export { getStatus, saveAndTestApiKey, retestApiKey, removeApiKey };
