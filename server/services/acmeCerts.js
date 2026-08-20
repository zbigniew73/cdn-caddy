import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acme from 'acme-client';
import { createRecord, deleteRecord, findZoneForDomain } from './gcoreDns.js';

// Wystawianie certow Let's Encrypt metoda DNS-01 - jedyna sensowna dla
// cdn.24z.eu (GeoDNS Gcore odpowiada roznym IP wg lokalizacji, wiec
// HTTP-01 trafialby losowo do ktoregos POP-a). Wyzwanie DNS-01 spelniane
// jest automatycznie przez utworzenie/usuniecie rekordu TXT
// _acme-challenge.<domena> przez juz istniejacy modul Gcore DNS
// (server/services/gcoreDns.js) - zaklada to, ze domena, dla ktorej
// wystawiamy cert, jest jednoczesnie nazwa strefy zarzadzanej w Gcore.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const ACCOUNT_KEY_FILE = path.join(DATA_DIR, 'acme-account.key');
const CERTS_DIR = path.join(DATA_DIR, 'certs');

function fieldError(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

async function getAccountKey() {
  ensureDataDir();
  if (fs.existsSync(ACCOUNT_KEY_FILE)) {
    return fs.readFileSync(ACCOUNT_KEY_FILE);
  }
  const key = await acme.crypto.createPrivateKey();
  fs.writeFileSync(ACCOUNT_KEY_FILE, key, { mode: 0o600 });
  fs.chmodSync(ACCOUNT_KEY_FILE, 0o600);
  return key;
}

function domainDir(domain) {
  return path.join(CERTS_DIR, domain);
}

function getCertInfo(domain) {
  const dir = domainDir(domain);
  const certPath = path.join(dir, 'fullchain.pem');
  if (!fs.existsSync(certPath)) return null;

  const info = acme.crypto.readCertificateInfo(fs.readFileSync(certPath));
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8')); } catch { /* brak meta - stare/niekompletne dane */ }

  return {
    domain,
    staging: Boolean(meta.staging),
    email: meta.email || null,
    issuedAt: meta.issuedAt || null,
    notBefore: info.notBefore,
    notAfter: info.notAfter,
    issuer: info.issuer.commonName,
    certPath,
    keyPath: path.join(dir, 'privkey.pem')
  };
}

function listCertificates() {
  ensureDataDir();
  if (!fs.existsSync(CERTS_DIR)) return [];
  return fs.readdirSync(CERTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => getCertInfo(d.name))
    .filter(Boolean);
}

async function issueCertificate(domain, { staging = true, email } = {}) {
  const trimmed = (domain || '').trim().replace(/\.$/, '');
  if (!trimmed) throw fieldError('Podaj domene.');

  // Domena moze byc sama strefa (apex) albo jej poddomena (np.
  // "cdn.24z.eu" jest rekordem w strefie "24z.eu", nie wlasna strefa) -
  // znajdz strefe, w ktorej trzeba utworzyc tymczasowy rekord TXT.
  const zoneName = await findZoneForDomain(trimmed);
  if (!zoneName) {
    throw fieldError(
      `Nie znaleziono w Gcore strefy dla domeny "${trimmed}" - dodaj odpowiednia strefe ` +
      '(np. jej domene nadrzedna) w sekcji "Zarzadzanie strefami DNS" powyzej.'
    );
  }

  const accountKey = await getAccountKey();
  const client = new acme.Client({
    directoryUrl: staging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey
  });

  const [certKey, csr] = await acme.crypto.createCsr({ altNames: [trimmed] });

  let cert;
  try {
    cert = await client.auto({
      csr,
      email: email || undefined,
      termsOfServiceAgreed: true,
      challengePriority: ['dns-01'],
      challengeCreateFn: async (authz, challenge, keyAuthorization) => {
        if (challenge.type !== 'dns-01') {
          throw new Error('Obslugiwane jest wylacznie wyzwanie DNS-01.');
        }
        const recordName = `_acme-challenge.${authz.identifier.value}`;
        // 120s - minimalny TTL dozwolony na planie Free w Gcore (nizsze
        // wartosci odrzuca API bledem "You can not use ttl values less
        // than 120s on the Free plan").
        await createRecord(zoneName, { name: recordName, type: 'TXT', ttl: 120, values: [keyAuthorization] });
        // Krotki bufor na propagacje w sieci Gcore przed pierwsza proba
        // walidacji - biblioteka i tak ponawia z backoffem (10x, 5-30s).
        await new Promise((resolve) => setTimeout(resolve, 5000));
      },
      challengeRemoveFn: async (authz) => {
        const recordName = `_acme-challenge.${authz.identifier.value}`;
        await deleteRecord(zoneName, recordName, 'TXT').catch(() => {});
      }
    });
  } catch (e) {
    throw Object.assign(new Error(`Wystawienie certyfikatu nie powiodlo sie: ${e.message}`), { status: 502 });
  }

  ensureDataDir();
  const dir = domainDir(trimmed);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'privkey.pem'), certKey, { mode: 0o600 });
  fs.chmodSync(path.join(dir, 'privkey.pem'), 0o600);
  fs.writeFileSync(path.join(dir, 'fullchain.pem'), cert, { mode: 0o644 });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    domain: trimmed, staging: Boolean(staging), email: email || null, issuedAt: new Date().toISOString()
  }, null, 2));

  return getCertInfo(trimmed);
}

async function renewCertificate(domain) {
  const existing = getCertInfo(domain);
  if (!existing) throw fieldError('Nie znaleziono certyfikatu dla tej domeny.');
  return issueCertificate(domain, { staging: existing.staging, email: existing.email });
}

function deleteCertificate(domain) {
  fs.rmSync(domainDir(domain), { recursive: true, force: true });
}

// Odnawia wszystkie certyfikaty, ktorym zostalo mniej niz thresholdDays
// do wygasniecia (domyslnie 30 - jak certbot). Wywolywane cyklicznie
// przez scheduler w renewScheduler.js.
async function renewExpiringCertificates(thresholdDays = 30) {
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const results = [];

  for (const cert of listCertificates()) {
    const msLeft = new Date(cert.notAfter).getTime() - now;
    if (msLeft > thresholdMs) continue;

    try {
      await renewCertificate(cert.domain);
      results.push({ domain: cert.domain, ok: true });
    } catch (e) {
      results.push({ domain: cert.domain, ok: false, error: e.message });
    }
  }

  return results;
}

export { listCertificates, issueCertificate, renewCertificate, renewExpiringCertificates, deleteCertificate, getCertInfo };
