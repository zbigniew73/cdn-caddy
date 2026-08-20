#!/usr/bin/env bash
#
# Zdalny "dispatcher" dla punktow POP - jedyny program, jaki wolno
# uruchomic dedykowanemu kluczowi SSH panelu. Umieszczany RECZNIE, RAZ,
# na kazdym nowym POP-ie (np. /root/cdn-caddy-deploy/pop-agent.sh), po
# czym w /root/.ssh/authorized_keys dopisuje sie linie z ograniczeniem:
#
#   command="/root/cdn-caddy-deploy/pop-agent.sh",no-port-forwarding,\
#   no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... cdn-caddy-panel
#
# Dzieki "command=" ten klucz NIE MOZE uruchomic niczego innego niz ten
# skrypt - niezaleznie od tego, jakie polecenie sprobuje wyslac laczacy
# sie (SSH_ORIGINAL_COMMAND jest wtedy tylko ARGUMENTEM dla tego
# skryptu, patrz sshd_config(5) / authorized_keys(5)). To jest "czesciowa
# kontrola" - klucz umie wylacznie te 3 akcje ponizej, nic wiecej.
#
# Akcje (pierwszy argument z SSH_ORIGINAL_COMMAND):
#   env-setup              - tworzy/naprawia katalogi Caddy (logi, /var/www/cdn)
#   write-file <sciezka>   - zapisuje stdin do pliku pod /etc/caddy/ (uprawnienia wg rozszerzenia)
#   validate <sciezka>     - fmt/adapt/validate/reload dla pliku pod /etc/caddy/
#
# NIGDY nie uruchamiaj recznie bez zrozumienia konsekwencji - dziala
# jako root.

set -euo pipefail

die() { echo "BLAD: $*" >&2; exit 1; }

# Przy "command=" w authorized_keys sshd NIE przekazuje zadania klienta
# jako argv tego skryptu - laduje ono w zmiennej SSH_ORIGINAL_COMMAND
# (patrz sshd_config(5)/authorized_keys(5)), argv jest puste. Rozbijamy
# ja na argumenty recznie. Fallback na "$@" tylko do recznych testow
# bez ograniczenia "command=".
read -r -a ARGS <<< "${SSH_ORIGINAL_COMMAND:-$*}"
ACTION="${ARGS[0]:-}"

case "$ACTION" in
  env-setup)
    getent group caddy >/dev/null 2>&1 || die "grupa systemowa 'caddy' nie istnieje - czy Caddy jest zainstalowany?"

    mkdir -p /var/log/caddy
    chown root:caddy /var/log/caddy
    chmod 775 /var/log/caddy

    mkdir -p /var/www
    chown root:caddy /var/www
    chmod 775 /var/www

    mkdir -p /var/www/cdn
    chown root:caddy /var/www/cdn
    chmod 775 /var/www/cdn

    echo "OK: katalogi gotowe (/var/log/caddy, /var/www, /var/www/cdn)."
    ;;

  write-file)
    DEST="${ARGS[1]:-}"
    [ -n "$DEST" ] || die "podaj sciezke docelowa."
    case "$DEST" in
      /etc/caddy/*) ;;
      *) die "dozwolone tylko pliki pod /etc/caddy/ (dostales: ${DEST})" ;;
    esac

    mkdir -p "$(dirname "$DEST")"
    cat > "$DEST"

    getent group caddy >/dev/null 2>&1 || die "grupa systemowa 'caddy' nie istnieje - czy Caddy jest zainstalowany?"
    chown root:caddy "$DEST"
    case "$DEST" in
      *.key) chmod 640 "$DEST" ;;
      *) chmod 644 "$DEST" ;;
    esac

    echo "OK: zapisano ${DEST}."
    ;;

  validate)
    CONFIG_FILE="${ARGS[1]:-}"
    [ -n "$CONFIG_FILE" ] || die "podaj sciezke do pliku Caddyfile."
    case "$CONFIG_FILE" in
      /etc/caddy/*) ;;
      *) die "dozwolone tylko pliki pod /etc/caddy/ (dostales: ${CONFIG_FILE})" ;;
    esac
    [ -f "$CONFIG_FILE" ] || die "plik nie istnieje: ${CONFIG_FILE}"
    command -v caddy >/dev/null 2>&1 || die "polecenie 'caddy' niedostepne w PATH."

    caddy fmt --overwrite "$CONFIG_FILE"
    caddy adapt --config "$CONFIG_FILE" --adapter caddyfile >/dev/null
    caddy validate --config "$CONFIG_FILE" --adapter caddyfile
    # reload-or-restart, bo "reload" na uslugie, ktora jeszcze nigdy nie
    # zostala uruchomiona (swiezy POP, pierwsze wdrozenie) konczy sie
    # bledem - nie ma do czego wyslac sygnalu przeladowania.
    systemctl reload-or-restart caddy

    echo "OK: ${CONFIG_FILE} zwalidowany, Caddy przeladowany/uruchomiony."
    ;;

  *)
    die "nieznana lub brakujaca akcja: '${ACTION}' (oczekiwano: env-setup | write-file | validate)"
    ;;
esac
