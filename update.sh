#!/usr/bin/env bash
#
# Aktualizacja juz dzialajacej instalacji CDN Caddy Dashboard:
# git pull + npm install (nowe zaleznosci, np. acme-client dodany razem
# z modulem certyfikatow DNS-01) + odswiezenie sudoers + restart uslugi.
#
# Rob to zamiast recznego "git pull" - sam pull bez "npm install" konczy
# sie crashem uslugi (ERR_MODULE_NOT_FOUND), jesli commit dolozyl nowa
# zaleznosc w package.json.
#
# Uzycie: cd /opt/cdn-caddy && sudo ./update.sh

set -euo pipefail

log() { echo -e "\n==> $*"; }
die() { echo -e "\n[BLAD] $*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    echo "Nie jestes rootem - probuje podniesc uprawnienia przez sudo (moze zapytac o haslo)..."
    exec sudo -E bash "$0" "$@"
  fi
  die "Nie jestes rootem i brak polecenia sudo - zaloguj sie jako root."
fi

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "${INSTALL_DIR}/cdn-caddy.service" ]; then
  die "Nie znaleziono ${INSTALL_DIR}/cdn-caddy.service - uruchom najpierw pelny install.sh."
fi

SVC_USER="$(grep '^User=' "${INSTALL_DIR}/cdn-caddy.service" | cut -d= -f2)"
[ -n "$SVC_USER" ] || die "Nie udalo sie odczytac User= z cdn-caddy.service."

log "git pull (jako ${SVC_USER})..."
sudo -u "$SVC_USER" git -C "$INSTALL_DIR" pull || die "git pull nie powiodl sie."

log "npm install (jako ${SVC_USER}) - dociaga ewentualne nowe zaleznosci..."
sudo -u "$SVC_USER" bash -c "cd '$INSTALL_DIR' && npm install --omit=dev" || die "npm install nie powiodlo sie."

log "Odswiezam sudoers (na wypadek gdyby nowy modul dodal nowe uprawnienie)..."
INSTALL_DIR="$INSTALL_DIR" SVC_USER="$SVC_USER" "${INSTALL_DIR}/server/scripts/write-sudoers.sh"

chown -R "${SVC_USER}:${SVC_USER}" "$INSTALL_DIR"

log "Restart uslugi cdn-caddy..."
# reset-failed - bez tego systemd moze odmowic startu po wczesniejszym
# crash-loopie ("Start request repeated too quickly").
systemctl reset-failed cdn-caddy 2>/dev/null || true
systemctl restart cdn-caddy || die "Restart uslugi nie powiodl sie - sprawdz: journalctl -u cdn-caddy -n 40"

sleep 1
systemctl --no-pager status cdn-caddy | head -6

log "Gotowe."
