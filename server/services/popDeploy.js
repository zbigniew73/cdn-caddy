import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { getPoolConfig } from './cdnPool.js';
import { getCertInfo } from './acmeCerts.js';
import { getPopServer } from './popServers.js';

const execFileAsync = promisify(execFile);

// Zdalne wdrazanie configu Caddy na POP-y przez SSH z kluczem
// ograniczonym "command=" (wymuszone polecenie - patrz
// server/scripts/pop-agent.sh) - klucz na POP-ie umie WYLACZNIE
// uruchomic ten jeden skrypt, wiec to "czesciowa kontrola", nie pelny
// dostep roota. Skrypt trzeba raz, recznie umiescic na kazdym nowym
// POP-ie (patrz getDeployInfo()).
const SCRIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts');
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const KEY_PATH = path.join(DATA_DIR, 'pop-deploy-key');
const PUB_KEY_PATH = `${KEY_PATH}.pub`;
const SYNC_STATE_FILE = path.join(DATA_DIR, 'pop-sync-state.json');

// Sciezka, pod ktora ma lezec pop-agent.sh NA POPIE - stala, wymagana
// w authorized_keys jako wartosc "command=".
const REMOTE_AGENT_PATH = '/root/cdn-caddy-deploy/pop-agent.sh';

function fieldError(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

async function ensureDeployKey() {
  if (fs.existsSync(KEY_PATH) && fs.existsSync(PUB_KEY_PATH)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  await execFileAsync('ssh-keygen', [
    '-t', 'ed25519',
    '-f', KEY_PATH,
    '-N', '',
    '-C', 'cdn-caddy-panel'
  ]);
  fs.chmodSync(KEY_PATH, 0o600);
}

// Zwraca informacje potrzebne do JEDNORAZOWEGO, recznego wdrozenia
// dostepu na nowym POP-ie: tresc skryptu do wgrania + gotowa linia do
// wklejenia w /root/.ssh/authorized_keys.
async function getDeployInfo() {
  await ensureDeployKey();
  const publicKey = fs.readFileSync(PUB_KEY_PATH, 'utf-8').trim();
  const authorizedKeysLine = `command="${REMOTE_AGENT_PATH}",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ${publicKey}`;
  const agentScript = fs.readFileSync(path.join(SCRIPTS_DIR, 'pop-agent.sh'), 'utf-8');
  return { remoteAgentPath: REMOTE_AGENT_PATH, authorizedKeysLine, agentScript };
}

const SSH_BASE_ARGS = [
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'ConnectTimeout=10'
];

// Uruchamia jedna akcje na POPie. `command` to string, jaki "widzi"
// zdalny sshd - ale poniewaz klucz ma wymuszone "command=" w
// authorized_keys, realnie zawsze wykona sie tam pop-agent.sh, a nasze
// zadanie ladue w SSH_ORIGINAL_COMMAND po jego stronie. `stdinData`
// (jesli podane) trafia na stdin zdalnego procesu - tak przesylamy
// tresc plikow (certy, Caddyfile) bez SCP (ktore forced-command i tak
// by zablokowal).
function runRemote(ip, command, stdinData) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('ssh', [...SSH_BASE_ARGS, '-i', KEY_PATH, `root@${ip}`, command]);
    } catch (e) {
      reject(e);
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(Object.assign(new Error((stderr || stdout).trim() || `ssh zakonczyl sie kodem ${code}`), { stdout, stderr }));
      }
    });

    if (stdinData !== undefined) {
      child.stdin.write(stdinData);
    }
    child.stdin.end();
  });
}

function readSyncState() {
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSyncState(id, result) {
  const state = readSyncState();
  state[id] = result;
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}

function getLastSync(id) {
  return readSyncState()[id] || null;
}

function getAllLastSyncs() {
  return readSyncState();
}

function buildPopMainCaddyfile() {
  // Swiadomie BEZ bloku panelu (panel.24z.eu { reverse_proxy ... }) -
  // na POPach panel nie dziala, wiec ten fragment configu VPS1 tam nie
  // pasuje. Te same ustawienia logowania co na VPS1, zeby zachowac
  // spojnosc.
  return `{
	admin localhost:2019
	grace_period 20s
	log {
		output file /var/log/caddy/caddy.log {
			roll_size 10MiB
			roll_keep 5
			roll_keep_for 168h
		}
		format json
		level WARN
	}
}

import /etc/caddy/sites/*.caddy
`;
}

function buildSiteCaddyfile(domain) {
  return `${domain} {
	tls /etc/caddy/certs/${domain}.pem /etc/caddy/certs/${domain}.key
	root * /var/www/cdn
	file_server
	encode gzip zstd
}
`;
}

// Pelna synchronizacja jednego POP-a: katalogi, glowny Caddyfile (bez
// panelu), cert domeny puli, site-config CDN, walidacja obu plikow.
// Kazdy krok to osobne polaczenie SSH (prostsze niz jedna wielka sesja),
// ale wszystkie przez ten sam, wasko ograniczony klucz.
async function syncPopServer(id) {
  const server = getPopServer(id);
  if (!server) throw fieldError('Nie znaleziono serwera POP o podanym id.');

  const { domain } = getPoolConfig();
  if (!domain) throw fieldError('Najpierw ustaw domene puli (kafelek "Pula CDN").');

  const cert = getCertInfo(domain);
  if (!cert) {
    throw fieldError(`Brak wystawionego certyfikatu dla "${domain}" - wystaw go najpierw w zakladce Gcore DNS -> Certyfikaty TLS.`);
  }

  await ensureDeployKey();

  const log = [];
  const at = new Date().toISOString();
  const ip = server.ip;

  const step = async (label, command, stdinData) => {
    try {
      const out = await runRemote(ip, command, stdinData);
      log.push(`$ ${command}`, out);
    } catch (e) {
      throw Object.assign(new Error(`${label} nie powiodlo sie: ${e.message}`), { status: 502 });
    }
  };

  try {
    await step('Przygotowanie katalogow', 'env-setup');
    await step('Zapis glownego Caddyfile', 'write-file /etc/caddy/Caddyfile', buildPopMainCaddyfile());
    await step('Kopiowanie certyfikatu (pem)', `write-file /etc/caddy/certs/${domain}.pem`, fs.readFileSync(cert.certPath));
    await step('Kopiowanie klucza prywatnego', `write-file /etc/caddy/certs/${domain}.key`, fs.readFileSync(cert.keyPath));
    await step('Zapis site-configu CDN', `write-file /etc/caddy/sites/${domain}.caddy`, buildSiteCaddyfile(domain));
    await step('Walidacja glownego Caddyfile', 'validate /etc/caddy/Caddyfile');
    await step('Walidacja site-configu CDN', `validate /etc/caddy/sites/${domain}.caddy`);
  } catch (e) {
    const result = { ok: false, at, log: log.join('\n'), error: e.message };
    writeSyncState(id, result);
    throw e;
  }

  const result = { ok: true, at, log: log.join('\n'), error: null };
  writeSyncState(id, result);
  return result;
}

export { getDeployInfo, syncPopServer, getLastSync, getAllLastSyncs };
