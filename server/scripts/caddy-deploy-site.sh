#!/usr/bin/env bash
#
# Kopiuje certyfikat (wystawiony przez modul certow panelu, DNS-01) do
# /etc/caddy/certs/ z uprawnieniami czytelnymi dla usera "caddy", i
# zapisuje/nadpisuje podstawowy site-config CDN w
# /etc/caddy/sites/<domena>.caddy - jeden katalog /var/www/cdn,
# routing po tokenie w sciezce (patrz caddy_cdn_gcore.md). Walidacja i
# przeladowanie robione OSOBNO, przez caddy-validate.sh (ta sama,
# generyczna sciezka co dla glownego Caddyfile).
#
# Wywolywane przez sudo z panelu (patrz server/services/caddyConfig.js).
#
# Uzycie: sudo caddy-deploy-site.sh <domena> <fullchain.pem> <privkey.pem>

set -euo pipefail

log() { echo "==> $*"; }
die() { echo "BLAD: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "uruchom jako root (sudo)."

DOMAIN="${1:-}"
FULLCHAIN_SRC="${2:-}"
PRIVKEY_SRC="${3:-}"

[ -n "$DOMAIN" ] || die "podaj domene."
[ -n "$FULLCHAIN_SRC" ] || die "podaj sciezke do fullchain.pem."
[ -n "$PRIVKEY_SRC" ] || die "podaj sciezke do privkey.pem."

# Waska walidacja nazwy domeny - zero znakow specjalnych, zeby nie dalo
# sie tym przemycic sciezki wychodzacej poza oczekiwany katalog.
case "$DOMAIN" in
  *[!a-zA-Z0-9.-]*) die "nieprawidlowa nazwa domeny: ${DOMAIN}" ;;
esac

[ -f "$FULLCHAIN_SRC" ] || die "brak pliku: ${FULLCHAIN_SRC}"
[ -f "$PRIVKEY_SRC" ] || die "brak pliku: ${PRIVKEY_SRC}"

getent group caddy >/dev/null 2>&1 || die "grupa systemowa 'caddy' nie istnieje - czy Caddy jest zainstalowany?"

log "Katalog /etc/caddy/certs..."
mkdir -p /etc/caddy/certs
chown root:caddy /etc/caddy/certs
chmod 750 /etc/caddy/certs

CERT_PEM="/etc/caddy/certs/${DOMAIN}.pem"
CERT_KEY="/etc/caddy/certs/${DOMAIN}.key"

log "Kopiuje certyfikat -> ${CERT_PEM}"
cp "$FULLCHAIN_SRC" "$CERT_PEM"
chown root:caddy "$CERT_PEM"
chmod 644 "$CERT_PEM"

log "Kopiuje klucz prywatny -> ${CERT_KEY}"
cp "$PRIVKEY_SRC" "$CERT_KEY"
chown root:caddy "$CERT_KEY"
chmod 640 "$CERT_KEY"

log "Katalog /etc/caddy/sites..."
mkdir -p /etc/caddy/sites
chown root:caddy /etc/caddy/sites
chmod 755 /etc/caddy/sites

SITE_FILE="/etc/caddy/sites/${DOMAIN}.caddy"
log "Zapisuje ${SITE_FILE}"
cat > "$SITE_FILE" <<EOF
${DOMAIN} {
	tls ${CERT_PEM} ${CERT_KEY}
	root * /var/www/cdn
	file_server
	encode gzip zstd
}
EOF
chown root:caddy "$SITE_FILE"
chmod 644 "$SITE_FILE"

log "Gotowe: ${SITE_FILE}"
