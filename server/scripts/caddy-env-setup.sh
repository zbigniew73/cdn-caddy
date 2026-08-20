#!/usr/bin/env bash
#
# Tworzy/naprawia katalogi wymagane przez Caddy na tej maszynie ("glowny
# punkt" - patrz kafelek "Dodaj/Ustaw glowny punkt" w panelu):
#   - /var/log/caddy - logi (Caddyfile: log { output file ... })
#   - /var/www       - katalog nadrzedny stron
#   - /var/www/cdn   - pliki klientow CDN (pull-zone cache per klient)
#
# Idempotentny - bezpieczny do wielokrotnego uruchamiania. Wywolywany
# przez sudo z panelu (patrz server/services/caddyConfig.js), root:caddy
# / 775, zeby usluga Caddy (dziala jako user "caddy") mogla tam zapisywac.
#
# Uzycie: sudo caddy-env-setup.sh

set -euo pipefail

log() { echo "==> $*"; }
die() { echo "BLAD: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "uruchom jako root (sudo)."

getent group caddy >/dev/null 2>&1 || die "grupa systemowa 'caddy' nie istnieje - czy Caddy jest zainstalowany?"

log "Katalog logow /var/log/caddy..."
mkdir -p /var/log/caddy
chown root:caddy /var/log/caddy
chmod 775 /var/log/caddy

log "Katalog /var/www..."
mkdir -p /var/www
chown root:caddy /var/www
chmod 775 /var/www

log "Katalog /var/www/cdn (pliki klientow CDN)..."
mkdir -p /var/www/cdn
chown root:caddy /var/www/cdn
chmod 775 /var/www/cdn

log "Gotowe."
