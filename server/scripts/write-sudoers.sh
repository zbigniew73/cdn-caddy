#!/usr/bin/env bash
#
# Generuje i instaluje /etc/sudoers.d/cdn-caddy. Jedyne miejsce, gdzie
# istnieje tresc tego pliku - wywolywane zarowno przez install.sh (podczas
# pelnej instalacji) jak i przez refresh-sudoers.sh (szybka aktualizacja
# samych uprawnien sudo na juz dzialajacej instalacji, bez reinstalacji
# calego panelu). Musi byc uruchomione jako root.
#
# Wymagane zmienne srodowiskowe: INSTALL_DIR, SVC_USER.
#
# Uprawnienia sudo dla panelu, celowo waskie (konkretne skrypty/komendy,
# NIE generyczne "systemctl *" ani "ALL"):
#  - weryfikacja hasla logujacego sie usera przez PAM jako root (patrz
#    server/services/auth.js -> pamAuthenticate),
#  - katalogi srodowiska Caddy (logi, /var/www/cdn) - patrz
#    caddy-env-setup.sh,
#  - format/adapt/validate/reload konkretnego pliku Caddyfile pod
#    /etc/caddy/ - patrz caddy-validate.sh (uzywane przez modul
#    "Konfiguracja Caddy" w zakladce Caddy CDN),
#  - kopiowanie wystawionego certu do /etc/caddy/certs/ + zapis
#    site-configu CDN w /etc/caddy/sites/ - patrz caddy-deploy-site.sh.
# Kolejne moduly doloza tu wlasne, rownie wasko przyciete Cmnd_Alias-y.

set -euo pipefail

: "${INSTALL_DIR:?INSTALL_DIR nie jest ustawiony}"
: "${SVC_USER:?SVC_USER nie jest ustawiony}"

SUDOERS_TMP="$(mktemp)"
cat > "$SUDOERS_TMP" <<EOF
Cmnd_Alias CDNCADDY_PAM_CHECK = ${INSTALL_DIR}/server/scripts/pam-login-check.cjs *
Cmnd_Alias CDNCADDY_CADDY_ENV_SETUP = ${INSTALL_DIR}/server/scripts/caddy-env-setup.sh
Cmnd_Alias CDNCADDY_CADDY_VALIDATE = ${INSTALL_DIR}/server/scripts/caddy-validate.sh *
Cmnd_Alias CDNCADDY_CADDY_DEPLOY_SITE = ${INSTALL_DIR}/server/scripts/caddy-deploy-site.sh *

${SVC_USER} ALL=(root) NOPASSWD: CDNCADDY_PAM_CHECK, CDNCADDY_CADDY_ENV_SETUP, CDNCADDY_CADDY_VALIDATE, CDNCADDY_CADDY_DEPLOY_SITE
EOF

if visudo -c -f "$SUDOERS_TMP" >/dev/null 2>&1; then
  install -m 440 -o root -g root "$SUDOERS_TMP" /etc/sudoers.d/cdn-caddy
  rm -f "$SUDOERS_TMP"
  echo "OK: sudoers zaktualizowany: /etc/sudoers.d/cdn-caddy"
else
  ERR="$(visudo -c -f "$SUDOERS_TMP" 2>&1 || true)"
  rm -f "$SUDOERS_TMP"
  echo "BLAD: nowa konfiguracja sudoers nie przeszla walidacji (visudo -c): ${ERR}" >&2
  exit 1
fi
