import { APP_VERSION } from '../version.js';

// Sprawdzanie dostepnosci nowszej wersji - porownuje wersje z package.json
// na galezi "main" na GitHubie z wersja aktualnie uruchomiona. Sam nic nie
// aktualizuje (swiadomie, jak reszta tego projektu) - tylko informuje, ze
// jest nowsza wersja do recznego pobrania (git pull + restart uslugi).
//
// Celowo GitHub API (contents), NIE raw.githubusercontent.com - to
// drugie jest za Fastly z cache do 5 min NA WEZEL BRZEGOWY (rozny serwer
// moze dostac inna, stara odpowiedz przez dobrych kilka minut po pushu,
// i to nie da sie ominac przez query-string ani naglowki Cache-Control -
// sprawdzone empirycznie). API "contents" ma max-age=60 i faktycznie tyle
// trwa.
const REMOTE_PACKAGE_JSON = 'https://api.github.com/repos/zbigniew73/cdn-caddy/contents/package.json?ref=main';

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
    const res = await fetch(REMOTE_PACKAGE_JSON, {
      headers: { 'User-Agent': 'cdn-caddy-dashboard', Accept: 'application/vnd.github.raw' }
    });
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
