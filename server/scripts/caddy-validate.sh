#!/usr/bin/env bash
#
# Formatuje, adaptuje i waliduje podany plik Caddyfile - jesli wszystko
# OK, przeladowuje usluge Caddy. Ta sama sekwencja co przy recznym
# wdrazaniu configu (fmt --overwrite -> adapt -> validate -> dopiero
# systemctl reload). Uzywane dla glownego /etc/caddy/Caddyfile (punkt 1)
# i w kolejnych krokach dla plikow per-klient w /etc/caddy/sites/*.caddy.
#
# Wywolywane przez sudo z panelu (patrz server/services/caddyConfig.js).
# Argument ograniczony do plikow pod /etc/caddy/ (obrona w glab, na
# wypadek gdyby kiedys sudoers dopuszczal dowolna sciezke w argumencie).
#
# Uzycie: sudo caddy-validate.sh <sciezka-do-pliku-caddyfile>

set -euo pipefail

log() { echo "==> $*"; }
die() { echo "BLAD: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "uruchom jako root (sudo)."

CONFIG_FILE="${1:-}"
[ -n "$CONFIG_FILE" ] || die "podaj sciezke do pliku Caddyfile."

case "$CONFIG_FILE" in
  /etc/caddy/*) ;;
  *) die "dozwolone tylko pliki pod /etc/caddy/ (dostales: ${CONFIG_FILE})" ;;
esac

[ -f "$CONFIG_FILE" ] || die "plik nie istnieje: ${CONFIG_FILE}"

command -v caddy >/dev/null 2>&1 || die "polecenie 'caddy' niedostepne w PATH roota."

log "caddy fmt --overwrite ${CONFIG_FILE}"
caddy fmt --overwrite "$CONFIG_FILE"

log "caddy adapt --config ${CONFIG_FILE} --adapter caddyfile"
caddy adapt --config "$CONFIG_FILE" --adapter caddyfile >/dev/null

log "caddy validate --config ${CONFIG_FILE} --adapter caddyfile"
caddy validate --config "$CONFIG_FILE" --adapter caddyfile

log "systemctl reload caddy"
systemctl reload caddy

log "OK: ${CONFIG_FILE} zwalidowany, Caddy przeladowany."
