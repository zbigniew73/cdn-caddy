import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listRecords, findZoneForDomain } from './gcoreDns.js';

// Podstawowa konfiguracja "puli CDN" - domena, pod ktora dzialaja
// wszystkie POP-y (routing po tokenie w sciezce, np.
// cdn.24z.eu/<token>/plik - patrz caddy_cdn_gcore.md). Zaden sekret tu
// nie zyje (w przeciwienstwie do server/services/gcore.js), wiec zwykly
// plik danych bez specjalnych uprawnien wystarczy.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const POOL_FILE = path.join(DATA_DIR, 'cdn-pool.json');

function readState() {
  try {
    const raw = fs.readFileSync(POOL_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return { domain: parsed.domain || '' };
  } catch {
    return { domain: '' };
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(POOL_FILE, JSON.stringify(state, null, 2));
}

function getPoolConfig() {
  return readState();
}

function savePoolConfig(domain) {
  const trimmed = (domain || '').trim().replace(/\.$/, '');
  writeState({ domain: trimmed });
  return getPoolConfig();
}

// Lista punktow POP - CALKOWICIE wyprowadzona z realnych rekordow DNS
// (A/AAAA) domeny puli w Gcore, bez recznego dodawania. Kazdy wpis to
// jeden resource_record pod ta nazwa; "aktywny" = ten konkretny adres
// jest w Gcore wlaczony (enabled) - to NA RAZIE tylko "czy jest wlaczony
// w puli DNS", nie pelna weryfikacja konfiguracji (Caddy dziala, cert
// zaladowany itp.) - to osobny, przyszly krok.
async function getDiscoveredPops() {
  const { domain } = readState();

  if (!domain) {
    return { pops: [], checked: false, dnsError: null };
  }

  try {
    const zoneName = await findZoneForDomain(domain);
    if (!zoneName) {
      throw new Error(`Nie znaleziono w Gcore strefy dla domeny puli "${domain}".`);
    }
    const records = await listRecords(zoneName);
    const pops = records
      .filter((r) => r.name === domain && (r.type === 'A' || r.type === 'AAAA'))
      .flatMap((r) => r.resourceRecords.map((rr) => ({
        host: domain,
        ip: rr.value,
        active: rr.enabled
      })));

    return { pops, checked: true, dnsError: null };
  } catch (e) {
    return { pops: [], checked: false, dnsError: e.message };
  }
}

export { getPoolConfig, savePoolConfig, getDiscoveredPops };
