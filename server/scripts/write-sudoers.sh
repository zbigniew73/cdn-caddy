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
# Ten szkielet (bez modulow) potrzebuje sudo TYLKO do jednej rzeczy:
# weryfikacji hasla logujacego sie usera przez PAM jako root (patrz
# server/services/auth.js -> pamAuthenticate). Kolejne moduly (np. CDN:
# zarzadzanie tokenami/katalogami klientow, sync do POP-ow) doloza tu
# wlasne, wasko przyciete Cmnd_Alias-y - NIE generyczne "systemctl *" ani
# "ALL".

set -euo pipefail

: "${INSTALL_DIR:?INSTALL_DIR nie jest ustawiony}"
: "${SVC_USER:?SVC_USER nie jest ustawiony}"

SUDOERS_TMP="$(mktemp)"
cat > "$SUDOERS_TMP" <<EOF
Cmnd_Alias CDNCADDY_PAM_CHECK = ${INSTALL_DIR}/server/scripts/pam-login-check.cjs *

${SVC_USER} ALL=(root) NOPASSWD: CDNCADDY_PAM_CHECK
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
