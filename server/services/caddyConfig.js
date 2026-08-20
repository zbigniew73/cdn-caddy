import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts');

// "Glowny punkt" = ta sama maszyna, na ktorej dziala panel (patrz kafelek
// "Dodaj/Ustaw glowny punkt") - operacje ponizej dzialaja lokalnie przez
// sudo, BEZ SSH do zdalnych POP-ow (to bedzie osobny, kolejny krok).
const MAIN_CADDYFILE = '/etc/caddy/Caddyfile';
const EXEC_OPTS = { timeout: 30000, maxBuffer: 5 * 1024 * 1024 };

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

  log.push('$ caddy-env-setup.sh', await runSudoScript('Przygotowanie katalogow', 'caddy-env-setup.sh'));
  log.push('$ caddy-validate.sh ' + MAIN_CADDYFILE, await runSudoScript('Walidacja glownego Caddyfile', 'caddy-validate.sh', [MAIN_CADDYFILE]));

  return { ok: true, log: log.join('\n') };
}

export { checkAndSetupMain };
