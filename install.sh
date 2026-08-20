#!/usr/bin/env bash
#
# Skrypt instalacyjny CDN Caddy Dashboard - SZKIELET panelu (bez modulow)
# na czysty serwer AlmaLinux/Rocky. Wzorowany na instalatorze
# dns-dashboard, ale w przeciwienstwie do niego NIE zaklada zadnej
# wczesniej dzialajacej uslugi (tam wymagany byl juz dzialajacy BIND9) -
# ten panel na tym etapie zarzadza tylko soba i (opcjonalnie) pokazuje
# status Caddy, jesli akurat jest zainstalowany. Kolejne moduly (np. CDN:
# tokeny/katalogi/sync klientow, patrz caddy_cdn_gcore.md) doloza wlasne
# wymagania/kroki instalacyjne pozniej - ten skrypt ma zostac malym,
# ogolnym fundamentem.

set -euo pipefail

APP_VERSION="0.1.0"
REPO_URL="${REPO_URL:-https://github.com/zbigniew73/cdn-caddy.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/cdn-caddy}"
SVC_USER_DEFAULT="cdnadmin"

log() { echo -e "\n==> $*"; }
die() { echo -e "\n[BLAD] $*" >&2; exit 1; }

prompt() {
  local __var="$1" __msg="$2" __default="$3" __input=""
  if [ -t 0 ]; then
    read -rp "$__msg [$__default]: " __input
  else
    read -rp "$__msg [$__default]: " __input < /dev/tty || __input=""
  fi
  printf -v "$__var" '%s' "${__input:-$__default}"
}

echo "CDN Caddy Dashboard v${APP_VERSION} - instalator (szkielet)"

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    echo "Nie jestes rootem - probuje podniesc uprawnienia przez sudo (moze zapytac o haslo)..."
    exec sudo -E bash "$0" "$@"
  fi
  die "Nie jestes rootem i brak polecenia sudo - zaloguj sie jako root."
fi

# --- OS ---
if [ ! -f /etc/os-release ]; then
  die "Brak /etc/os-release - nie da sie wykryc dystrybucji."
fi
. /etc/os-release
OS_ID="$ID"
OS_VERSION_MAJOR="${VERSION_ID%%.*}"
case "$OS_ID" in
  almalinux|rocky) ;;
  *) die "Wykryto '${OS_ID:-nieznany}' - wspierane sa tylko: almalinux, rocky." ;;
esac
case "$OS_VERSION_MAJOR" in
  9|10) ;;
  *) die "Wykryto ${OS_ID} ${VERSION_ID:-?} - wspierane wersje glowne: 9, 10." ;;
esac
log "System: ${OS_ID} ${VERSION_ID} - OK."

# --- pakiety podstawowe + toolchain do node-gyp (authenticate-pam) ---
log "Instaluje pakiety podstawowe (git, pam-devel, Development Tools, python3)..."
dnf install -y git pam-devel python3 || die "dnf install (pakiety podstawowe) nie powiodlo sie."
dnf groupinstall -y "Development Tools" || die "dnf groupinstall 'Development Tools' nie powiodlo sie."

# --- Node.js 24 LTS ---
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
else
  NODE_MAJOR=0
fi
if [ "$NODE_MAJOR" -lt 24 ]; then
  log "Instaluje Node.js 24 LTS (NodeSource)..."
  curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - || die "Nie udalo sie dodac repo NodeSource."
  dnf install -y nodejs || die "Instalacja nodejs nie powiodla sie."
else
  log "Node.js juz w wersji ${NODE_MAJOR} - pomijam instalacje."
fi
command -v node >/dev/null 2>&1 || die "Node.js nadal niedostepny po probie instalacji."
log "Node.js: $(node -v)"

# --- firewalld ---
if ! command -v firewall-cmd >/dev/null 2>&1; then
  log "firewalld nie znaleziony - instaluje..."
  dnf install -y firewalld || die "Instalacja firewalld nie powiodla sie."
fi
if ! systemctl is-active --quiet firewalld; then
  log "firewalld nieaktywny - wlaczam..."
  systemctl enable --now firewalld
fi

# --- info: Caddy (opcjonalny na tym etapie) ---
if command -v caddy >/dev/null 2>&1; then
  log "Caddy znaleziony: $(caddy version 2>&1 | head -n1) - zakladka 'Uslugi' bedzie pokazywac jego status."
else
  log "Caddy NIE znaleziony na tym serwerze - to OK dla samego szkieletu panelu." \
      "Zakladka 'Uslugi' pokaze go jako 'nie znaleziono', dopoki go nie zainstalujesz."
fi

# --- konto systemowe panelu ---
prompt SVC_USER "Konto systemowe, na ktorym ma dzialac panel (grupa wheel, logowanie jak SSH)" "$SVC_USER_DEFAULT"
if id "$SVC_USER" >/dev/null 2>&1; then
  log "Uzytkownik '${SVC_USER}' juz istnieje."
  usermod -aG wheel "$SVC_USER"
else
  prompt CREATE_USER "Uzytkownik '${SVC_USER}' nie istnieje - utworzyc go (katalog domowy /home/${SVC_USER}, logowanie SSH, grupa wheel)?" "tak"
  case "$CREATE_USER" in
    t|T|tak|Tak|TAK|y|Y|yes|Yes|YES)
      useradd -m -G wheel -s /bin/bash "$SVC_USER" || die "Nie udalo sie utworzyc uzytkownika ${SVC_USER}."
      PASS="$(tr -dc 'A-Za-z0-9!@#%*_+=-' < /dev/urandom | head -c16)"
      echo "${SVC_USER}:${PASS}" | chpasswd || die "Nie udalo sie ustawic hasla dla ${SVC_USER}."
      umask 077
      echo "$PASS" > /root/.userdd
      chmod 600 /root/.userdd
      log "Utworzono '${SVC_USER}' - haslo zapisane w /root/.userdd (chmod 600, tylko root)."
      ;;
    *) die "Bez konta systemowego panel nie moze dzialac (PAM+wheel) - przerywam." ;;
  esac
fi

# --- klonowanie repo ---
if [ -d "${INSTALL_DIR}/.git" ]; then
  log "Repo juz jest w ${INSTALL_DIR} - aktualizuje (git pull)..."
  git -C "$INSTALL_DIR" pull
else
  log "Klonuje repo (galaz ${BRANCH}) do ${INSTALL_DIR}..."
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR" || die "git clone nie powiodl sie."
fi

# --- npm install ---
log "npm install (production)..."
(cd "$INSTALL_DIR" && npm install --omit=dev) || die "npm install nie powiodlo sie."

# --- .env ---
if [ -f "${INSTALL_DIR}/.env" ]; then
  log ".env juz istnieje - pomijam generowanie (usun plik, zeby wygenerowac od nowa)."
else
  log "Tworze .env..."
  prompt AUTH_USER "Login systemowy, ktory ma miec dostep do panelu (musi byc w grupie wheel)" "$SVC_USER"
  prompt PANEL_HOST "Adres, na ktorym ma nasluchiwac panel (LAN)" "127.0.0.1"
  prompt CADDY_UNIT "Nazwa jednostki systemd Caddy (do zakladki 'Uslugi')" "caddy.service"
  SESSION_SECRET="$(openssl rand -hex 32)"
  cat > "${INSTALL_DIR}/.env" <<EOF
EXPOSURE=local
HOST=${PANEL_HOST}
PORT=4400

AUTH_USERS=${AUTH_USER}
SESSION_SECRET=${SESSION_SECRET}
ALLOWED_ORIGIN=

CADDY_UNIT=${CADDY_UNIT}
EOF
  log ".env utworzony - SESSION_SECRET wygenerowany, AUTH_USERS=${AUTH_USER}."
  echo "     Sprawdz .env recznie przed uruchomieniem (EXPOSURE, HOST, ewentualnie ALLOWED_ORIGIN)."
fi

# --- firewall ---
DASHBOARD_PORT="$(grep '^PORT=' "${INSTALL_DIR}/.env" | cut -d= -f2)"
log "Otwieram w firewalld: ssh, port dashboardu (${DASHBOARD_PORT}/tcp)..."
firewall-cmd --permanent --add-service=ssh >/dev/null 2>&1 || true
firewall-cmd --permanent --add-port="${DASHBOARD_PORT}/tcp" >/dev/null 2>&1 || true
firewall-cmd --reload >/dev/null 2>&1 || true

# --- systemd unit (nie kopiowany automatycznie do /etc/systemd/system) ---
log "Przygotowuje jednostke systemd (cdn-caddy.service)..."
sed "s/^User=.*/User=${SVC_USER}/" "${INSTALL_DIR}/cdn-caddy.service.example" > "${INSTALL_DIR}/cdn-caddy.service"
log "cdn-caddy.service gotowy (User=${SVC_USER}). NIE skopiowany do /etc/systemd/system - patrz ponizej."

# --- sudoers ---
log "Konfiguruje sudoers NOPASSWD dla '${SVC_USER}' (na razie tylko weryfikacja hasla PAM przy logowaniu)..."
INSTALL_DIR="$INSTALL_DIR" SVC_USER="$SVC_USER" "${INSTALL_DIR}/server/scripts/write-sudoers.sh"

chown -R "${SVC_USER}:${SVC_USER}" "$INSTALL_DIR"

log "Gotowe. Zainstalowano w: ${INSTALL_DIR}"
cat <<EOF

Nastepne kroki (recznie, swiadomie - skrypt niczego tu sam nie wlacza):

  1. Sprawdz ${INSTALL_DIR}/.env (AUTH_USERS, EXPOSURE/HOST).
  2. Test recznie:
       sudo -u ${SVC_USER} bash -c 'cd ${INSTALL_DIR} && node server/index.js'
  3. Autostart jako usluga systemd (gdy jestes gotow/gotowa):
       sudo cp ${INSTALL_DIR}/cdn-caddy.service /etc/systemd/system/
       sudo systemctl daemon-reload
       sudo systemctl enable --now cdn-caddy

Firewall (ssh, port dashboardu ${DASHBOARD_PORT}/tcp) juz otwarty automatycznie.

Kolejne aktualizacje (po "git pull" recznie brakuje np. nowych zaleznosci
npm i usluga sie wywala) - uzywaj ${INSTALL_DIR}/update.sh zamiast samego
"git pull":
       cd ${INSTALL_DIR} && sudo ./update.sh
EOF
