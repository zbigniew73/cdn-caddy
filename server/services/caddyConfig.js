import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts');

// "Glowny punkt" = ta sama maszyna, na ktorej dziala panel (patrz kafelek
// "Dodaj/Ustaw glowny punkt") - operacje ponizej dzialaja lokalnie przez
// sudo, BEZ SSH do zdalnych POP-ow (to bedzie osobny, kolejny krok).
const MAIN_CADDYFILE = '/etc/caddy/Caddyfile';
const EXEC_OPTS = { timeout: 30000, maxBuffer: 5 * 1024 * 1024 };

// Wynik ostatniego sprawdzenia zapisany na dysku (jak lastTest w
// gcore.js), zeby przetrwal odswiezenie strony - nie tylko stan w
// pamieci przegladarki.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const STATE_FILE = path.join(DATA_DIR, 'caddy-main-check.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getLastMainCheck() {
  return readState();
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
    writeState(result);
    throw e;
  }

  const result = { ok: true, at, log: log.join('\n'), error: null };
  writeState(result);
  return result;
}

export { checkAndSetupMain, getLastMainCheck };
