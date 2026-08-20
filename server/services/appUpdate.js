import { APP_VERSION } from '../version.js';

// Sprawdzanie dostepnosci nowszej wersji - porownuje wersje z package.json
// na galezi "main" na GitHubie z wersja aktualnie uruchomiona. Sam nic nie
// aktualizuje (swiadomie, jak reszta tego projektu) - tylko informuje, ze
// jest nowsza wersja do recznego pobrania (git pull + restart uslugi).
const REMOTE_PACKAGE_JSON = 'https://raw.githubusercontent.com/zbigniew73/cdn-caddy/main/package.json';

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na > nb ? 1 : -1;
  }
  return 0;
}

async function checkForUpdate() {
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(REMOTE_PACKAGE_JSON, { headers: { 'User-Agent': 'cdn-caddy-dashboard' } });
    if (!res.ok) throw new Error(`GitHub zwrocil HTTP ${res.status}`);
    const pkg = await res.json();
    const latest = pkg.version;
    if (!latest) throw new Error('Brak pola "version" w zdalnym package.json');

    return {
      current: APP_VERSION,
      latest,
      updateAvailable: compareVersions(latest, APP_VERSION) > 0,
      checkedAt,
      error: null
    };
  } catch (e) {
    return {
      current: APP_VERSION,
      latest: null,
      updateAvailable: false,
      checkedAt,
      error: e.message
    };
  }
}

export { checkForUpdate };
