import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

// Katalog instalacji liczony wzgledem polozenia tego pliku (nie
// process.cwd()) - dziala niezaleznie od tego, skad faktycznie odpalono
// usluge. "git pull"/"npm install" dzialaja jako user, ktorym stoi ten
// proces (SVC_USER, wlasciciel INSTALL_DIR) - BEZ sudo, bo to zwykle
// operacje na wlasnych plikach. Restart samej uslugi systemd zostaje
// swiadomie poza panelem (wymaga roota, ktorego panel celowo nie ma).
const INSTALL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const EXEC_OPTS = { cwd: INSTALL_DIR, timeout: 180000, maxBuffer: 10 * 1024 * 1024 };

function runError(step, e) {
  const detail = (e.stderr || e.stdout || e.message || '').toString().trim();
  return Object.assign(new Error(`${step} nie powiodlo sie: ${detail}`), { status: 502 });
}

async function pullAndInstall() {
  const log = [];

  // "npm install" potrafi lekko przepisac package-lock.json (inna wersja
  // npm niz ta, ktora go wygenerowala) - taka lokalna, niezamierzona
  // zmiana blokowalaby "git pull". To tylko metadane odtwarzalne z
  // package.json, bezpiecznie je odrzucic przed kazdym pullem.
  await execFileAsync('git', ['checkout', '--', 'package-lock.json', 'package.json'], EXEC_OPTS).catch(() => {});

  let pull;
  try {
    pull = await execFileAsync('git', ['pull'], EXEC_OPTS);
  } catch (e) {
    throw runError('git pull', e);
  }
  log.push('$ git pull', pull.stdout.trim(), pull.stderr.trim());

  // npm ci zamiast npm install - instaluje dokladnie wg
  // package-lock.json i nigdy go nie modyfikuje (w przeciwienstwie do
  // npm install), wiec kolejny pull sie nie zablokuje.
  let install;
  try {
    install = await execFileAsync('npm', ['ci', '--omit=dev'], EXEC_OPTS);
  } catch (e) {
    throw runError('npm ci', e);
  }
  log.push('$ npm ci --omit=dev', install.stdout.trim(), install.stderr.trim());

  return { ok: true, log: log.filter(Boolean).join('\n') };
}

export { pullAndInstall };
