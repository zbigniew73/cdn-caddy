import { renewExpiringCertificates } from './acmeCerts.js';

// Automatyczne odnawianie certyfikatow - wbudowane w proces panelu (bez
// osobnego cron/systemd timer), dziala tylko dopoki usluga cdn-caddy
// dziala. Raz dziennie sprawdza wszystkie wystawione certy i odnawia te,
// ktorym zostalo mniej niz RENEW_THRESHOLD_DAYS do wygasniecia.
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60 * 1000;
const RENEW_THRESHOLD_DAYS = 30;

async function runCheck() {
  let results;
  try {
    results = await renewExpiringCertificates(RENEW_THRESHOLD_DAYS);
  } catch (e) {
    console.error(`[auto-renew] Blad sprawdzania certyfikatow: ${e.message}`);
    return;
  }

  for (const r of results) {
    if (r.ok) {
      console.log(`[auto-renew] Odnowiono certyfikat: ${r.domain}`);
    } else {
      console.error(`[auto-renew] Nie udalo sie odnowic ${r.domain}: ${r.error}`);
    }
  }
}

function startAutoRenewScheduler() {
  setTimeout(runCheck, FIRST_CHECK_DELAY_MS);
  setInterval(runCheck, CHECK_INTERVAL_MS);
}

export { startAutoRenewScheduler };
