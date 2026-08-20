import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { getPoolConfig } from './cdnPool.js';
import { getCertInfo } from './acmeCerts.js';

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts');

// "Glowny punkt" = ta sama maszyna, na ktorej dziala panel (patrz kafelek
// "Dodaj/Ustaw glowny punkt") - operacje ponizej dzialaja lokalnie przez
// sudo, BEZ SSH do zdalnych POP-ow (to bedzie osobny, kolejny krok).
const MAIN_CADDYFILE = '/etc/caddy/Caddyfile';
const EXEC_OPTS = { timeout: 30000, maxBuffer: 5 * 1024 * 1024 };

// Wyniki ostatnich sprawdzen zapisane na dysku (jak lastTest w
// gcore.js), zeby przetrwaly odswiezenie strony - nie tylko stan w
// pamieci przegladarki.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const MAIN_STATE_FILE = path.join(DATA_DIR, 'caddy-main-check.json');
const SITE_STATE_FILE = path.join(DATA_DIR, 'caddy-site-check.json');

function fieldError(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getLastMainCheck() {
  return readJson(MAIN_STATE_FILE);
}

function getLastSiteCheck() {
  return readJson(SITE_STATE_FILE);
}

function runError(step, e) {
  const detail = (e.stderr || e.stdout || e.message || '').toString().trim();
  return Object.assign(new Error(`${step} nie powiodlo sie: ${detail}`), { status: 502 });
}

async function runSudoScript(step, scriptName, args = []) {
  try {
    const { stdout, stderr } = await execFileAsync(
      'sudo', ['-n', path.join(SCRIPTS_DIR, scriptName), ...args], EXEC_OPTS
    );
    return [stdout, stderr].filter(Boolean).join('\n').trim();
  } catch (e) {
    throw runError(step, e);
  }
}

// Punkt 1: katalogi srodowiska Caddy (logi, /var/www, /var/www/cdn) +
// format/adapt/validate/reload glownego /etc/caddy/Caddyfile. Dokladnie
// ta sama, obowiazkowa sekwencja co przy recznym wdrazaniu configu.
async function checkAndSetupMain() {
  const log = [];
  const at = new Date().toISOString();

  try {
    log.push('$ caddy-env-setup.sh', await runSudoScript('Przygotowanie katalogow', 'caddy-env-setup.sh'));
    log.push('$ caddy-validate.sh ' + MAIN_CADDYFILE, await runSudoScript('Walidacja glownego Caddyfile', 'caddy-validate.sh', [MAIN_CADDYFILE]));
  } catch (e) {
    const result = { ok: false, at, log: log.join('\n'), error: e.message };
    writeJson(MAIN_STATE_FILE, result);
    throw e;
  }

  const result = { ok: true, at, log: log.join('\n'), error: null };
  writeJson(MAIN_STATE_FILE, result);
  return result;
}

// Punkt 2: wdraza podstawowy site-config CDN dla domeny puli (patrz
// kafelek "Pula CDN") - kopiuje juz wystawiony cert (zakladka
// Certyfikaty TLS) do /etc/caddy/certs/, zapisuje
// /etc/caddy/sites/<domena>.caddy, po czym waliduje/przeladowuje tak
// samo jak krok 1.
async function deploySite() {
  const { domain } = getPoolConfig();
  if (!domain) throw fieldError('Najpierw ustaw domene puli (kafelek "Pula CDN").');

  const cert = getCertInfo(domain);
  if (!cert) {
    throw fieldError(`Brak wystawionego certyfikatu dla "${domain}" - wystaw go najpierw w zakladce Gcore DNS -> Certyfikaty TLS.`);
  }

  const log = [];
  const at = new Date().toISOString();
  const siteFile = `/etc/caddy/sites/${domain}.caddy`;

  try {
    log.push(
      `$ caddy-deploy-site.sh ${domain}`,
      await runSudoScript('Wdrazanie plikow site-configu', 'caddy-deploy-site.sh', [domain, cert.certPath, cert.keyPath])
    );
    log.push(
      `$ caddy-validate.sh ${siteFile}`,
      await runSudoScript('Walidacja site-configu CDN', 'caddy-validate.sh', [siteFile])
    );
  } catch (e) {
    const result = { ok: false, at, log: log.join('\n'), error: e.message, domain };
    writeJson(SITE_STATE_FILE, result);
    throw e;
  }

  const result = { ok: true, at, log: log.join('\n'), error: null, domain };
  writeJson(SITE_STATE_FILE, result);
  return result;
}

export { checkAndSetupMain, getLastMainCheck, deploySite, getLastSiteCheck };
