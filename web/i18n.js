(function () {
  'use strict';

  var DICT = {
    pl: {
      login_placeholder: 'login',
      password_placeholder: 'haslo',
      login_btn: 'Zaloguj',
      login_error_generic: 'Blad logowania',

      theme_btn: 'Motyw',
      logout_btn: 'Wyloguj',

      nav_main: 'Glowne',
      tab_dashboard: 'Dashboard',
      tab_services: 'Uslugi',
      tab_gcore: 'Gcore DNS',
      tab_cdn: 'Caddy CDN',

      loading: 'Wczytywanie...',
      cpu: 'CPU',
      ram: 'RAM',
      swap: 'SWAP',
      swap_none: 'brak',
      disk: 'DYSK',
      host: 'HOST',
      uptime: 'UPTIME',
      cores_suffix: 'rdzeni',

      not_found: 'nie znaleziono',

      integration_title: 'Integracja API',
      status_untested: 'nie testowano',
      status_connected: 'polaczono',
      status_error: 'blad',
      saved_key_label: 'Zapisany klucz',
      status_label: 'Status:',
      retest_btn: 'Testuj polaczenie ponownie',
      retest_btn_loading: 'Testowanie...',
      remove_key_btn: 'Usun klucz',
      remove_key_confirm: 'Usunac zapisany klucz API Gcore?',
      api_key_label: 'Klucz API Gcore (Customer Portal &rarr; API tokens)',
      api_key_placeholder: 'wklej klucz API',
      save_test_btn: 'Zapisz i przetestuj',
      save_test_btn_loading: 'Zapisuje i testuje...',

      stats_title: 'Statystyki i informacje o koncie',
      stats_preview: 'Podglad odpowiedzi Gcore <code>/iam/clients/me</code>.',
      stats_empty: 'Dostepne po poprawnej integracji (kafelek obok).',

      zones_title: 'Zarzadzanie strefami DNS',
      zones_gate_msg: 'Najpierw skonfiguruj i przetestuj integracje API (kafelek "Integracja API" wyzej).',
      zones_empty: 'Brak stref.',
      th_zone: 'Strefa',
      th_status: 'Status',
      th_records: 'Rekordy',
      th_dnssec: 'DNSSEC',
      th_actions: 'Akcje',
      yes: 'tak',
      no: 'nie',
      add_zone_title: 'Dodaj nowa strefe do DNS',
      domain_name_label: 'Nazwa domeny',
      add_zone_btn: 'Dodaj strefe',
      delete_zone_confirm: 'Usunac strefe "{zone}" wraz ze wszystkimi rekordami?',

      certs_title: 'Certyfikaty TLS (DNS-01)',
      certs_autorenew_note: 'Odnawiane automatycznie, gdy zostanie mniej niz 30 dni do wygasniecia (sprawdzane raz dziennie, dopoki usluga panelu dziala) - przycisk "Odnow" jest tylko na wypadek, gdybys nie chcial czekac.',
      certs_empty: 'Brak wystawionych certyfikatow.',
      th_domain: 'Domena',
      th_environment: 'Srodowisko',
      th_valid_from: 'Wazny od',
      th_valid_to: 'Wazny do',
      th_file: 'Plik',
      cert_env_staging: 'Aktywny',
      cert_env_production: 'Produkcja',
      renew_btn: 'Odnow',
      renew_btn_loading: 'Odnawiam...',
      delete_cert_confirm: 'Usunac zapisany certyfikat dla "{domain}" z dysku panelu?',
      issue_new_cert_title: 'Wystaw nowy certyfikat',
      cert_domain_hint: 'Domena moze byc strefa (np. 24z.eu) albo jej poddomena (np. cdn.24z.eu) - wlasciwa strefa do wpisu TXT znajdowana jest automatycznie z listy powyzej.',
      domain_label: 'Domena',
      email_label: 'Kontakt e-mail (opcjonalnie)',
      staging_checkbox_label: "Let's Encrypt staging (testowy, wyzsze limity, przegladarki NIE ufaja temu certowi) - odznacz dla prawdziwego certyfikatu produkcyjnego",
      issue_cert_btn: 'Wystaw certyfikat',
      issue_progress: 'Wystawianie w toku (walidacja DNS-01) - moze to potrwac do 1-2 minut, nie zamykaj tej karty...',

      records_title_prefix: 'Rekordy strefy:',
      close_btn: 'Zamknij',
      th_name: 'Nazwa',
      th_type: 'Typ',
      th_ttl: 'TTL',
      th_values: 'Wartosci',
      records_empty: 'Brak rekordow.',
      save_btn: 'Zapisz',
      cancel_btn: 'Anuluj',
      edit_btn: 'Edytuj',
      delete_btn: 'Usun',
      add_record_title: 'Dodaj nowy rekord',
      record_name_label: 'Nazwa (pelna, np. www.{zone})',
      record_type_label: 'Typ',
      record_ttl_label: 'TTL',
      record_value_label: 'Wartosc (jedna na linie; MX: "priorytet target", CAA: "flaga tag wartosc", SRV: "priorytet waga port target")',
      add_record_btn: 'Dodaj rekord',
      delete_record_confirm: 'Usunac rekord {name} ({type})?',

      version_check_fail: 'Nie udalo sie sprawdzic wersji: ',
      update_available_title: 'Dostepna aktualizacja: v{current} -> v{latest} (kliknij, zeby pobrac)',
      update_confirm: 'Dostepna nowsza wersja: v{latest} (masz v{current}).\n\nPobrac teraz? (git pull + npm install na serwerze)\n\nUWAGA: ten przycisk NIE odswieza uprawnien sudo. Jesli aktualizacja dodala nowa funkcje wymagajaca sudo, przycisk moze nie wystarczyc - w razie bledow typu "sudo: a password is required" uruchom recznie przez SSH: sudo ./update.sh (on i tak zrobi restart uslugi).\n\nJesli mimo to klikasz ten przycisk: po zakonczeniu trzeba jeszcze recznie zrestartowac usluge:\n  sudo systemctl restart cdn-caddy',
      updating_label: 'Aktualizuje...',
      restart_required_label: 'Restart wymagany',
      restart_required_title: 'Pliki zaktualizowane - uruchom: sudo systemctl restart cdn-caddy',
      update_success_alert: 'Zaktualizowano pliki na dysku.\n\nTeraz zrestartuj usluge:\n  sudo systemctl restart cdn-caddy',
      update_fail_alert: 'Aktualizacja nie powiodla sie:\n\n{error}',
      stable_title: 'Masz najnowsza wersje (v{current})',

      pool_tile_title: 'Pula CDN',
      pool_domain_label: 'Domena puli CDN',
      pool_domain_hint: 'Domena, pod ktora dzialaja wszystkie POP-y (routing po tokenie w sciezce, np. cdn.24z.eu/&lt;token&gt;/plik).',
      pops_tile_title: 'Lista punktow POP',
      pops_empty: 'Brak rekordow A/AAAA dla domeny puli (albo domena puli nie jest jeszcze ustawiona).',
      pops_dns_note: 'Lista pobierana automatycznie z rekordow DNS (A/AAAA) domeny puli w Gcore - zaden recznie dodawany wpis. "Aktywny" = rekord jest wlaczony (enabled) w Gcore. Pelna weryfikacja konfiguracji (czy Caddy tam faktycznie dziala, czy jest zaladowany cert) to kolejny, osobny krok.',
      th_pop_host: 'Host',
      th_pop_ip: 'Adres IP',
      th_pop_description: 'Opis',
      th_pop_status: 'STATUS GCORE',
      th_pop_status_cdn: 'STATUS CDN',
      pop_status_active: 'Aktywny',
      pop_status_inactive: 'Nie Aktywny',
      pop_status_cdn_placeholder: 'Nie sprawdzono',

      main_point_tile_title: 'Dodaj/Ustaw glowny punkt',
      main_point_hint: 'Hostname glownego serwera zarzadzajacego (panel, issuer certow, DNS master) - NIE rekord DNS ani fallback. Po zapisaniu odblokuje sie sekcja "Konfiguracja Caddy".',
      main_point_host_label: 'Hostname glownego punktu',
      save_main_point_btn: 'Zapisz glowny punkt',
      caddy_config_title: 'Konfiguracja Caddy',
      caddy_config_placeholder: 'Kolejne kroki dochodza ponizej, numerowane.',
      caddy_step1_title: 'Krok 1: sprawdz/ustaw konfiguracje glowna',
      caddy_step1_hint: 'Tworzy/naprawia katalogi (/var/log/caddy, /var/www, /var/www/cdn), a nastepnie formatuje, adaptuje, waliduje i przeladowuje glowny /etc/caddy/Caddyfile na tej maszynie ({host}).',
      caddy_step1_btn: 'Sprawdz/ustaw konfiguracje glowna',
      caddy_step1_running: 'Sprawdzanie...',
      info_tile_title: 'Info',
      info_tile_placeholder: 'Do zbudowania w kolejnym kroku.',
      pop_point_tile_title: 'Dodaj/Ustaw punkt POP',
      pop_point_hint: 'Punkt z geo-targetowaniem (GeoDNS) - podany adres IP bedzie odpowiadal tylko zapytaniom z wybranych krajow. Ten sam adres IP uzyty ponownie podmienia liste krajow.',
      ip_address_label: 'Adres IP',
      ttl_optional_label: 'TTL (opcjonalnie, domyslnie 300)',
      countries_label: 'Kraje (ISO 3166-1 alpha-2, po przecinku, np. PL,DE,CZ)',
      add_pop_point_btn: 'Dodaj/zapisz punkt POP',
      geo_verify_note: 'Rzeczywiste dzialanie geo-routingu sprawdz niezaleznie (np. serwisem sprawdzajacym DNS z roznych krajow) - panel tylko wysyla konfiguracje do Gcore.'
    },
    en: {
      login_placeholder: 'username',
      password_placeholder: 'password',
      login_btn: 'Log in',
      login_error_generic: 'Login failed',

      theme_btn: 'Theme',
      logout_btn: 'Log out',

      nav_main: 'Main',
      tab_dashboard: 'Dashboard',
      tab_services: 'Services',
      tab_gcore: 'Gcore DNS',
      tab_cdn: 'Caddy CDN',

      loading: 'Loading...',
      cpu: 'CPU',
      ram: 'RAM',
      swap: 'SWAP',
      swap_none: 'none',
      disk: 'DISK',
      host: 'HOST',
      uptime: 'UPTIME',
      cores_suffix: 'cores',

      not_found: 'not found',

      integration_title: 'API Integration',
      status_untested: 'not tested',
      status_connected: 'connected',
      status_error: 'error',
      saved_key_label: 'Saved key',
      status_label: 'Status:',
      retest_btn: 'Test connection again',
      retest_btn_loading: 'Testing...',
      remove_key_btn: 'Remove key',
      remove_key_confirm: 'Remove the saved Gcore API key?',
      api_key_label: 'Gcore API key (Customer Portal &rarr; API tokens)',
      api_key_placeholder: 'paste API key',
      save_test_btn: 'Save and test',
      save_test_btn_loading: 'Saving and testing...',

      stats_title: 'Account statistics and info',
      stats_preview: 'Preview of the Gcore <code>/iam/clients/me</code> response.',
      stats_empty: 'Available once integration succeeds (tile next to this one).',

      zones_title: 'DNS zone management',
      zones_gate_msg: 'First configure and test the API integration ("API Integration" tile above).',
      zones_empty: 'No zones.',
      th_zone: 'Zone',
      th_status: 'Status',
      th_records: 'Records',
      th_dnssec: 'DNSSEC',
      th_actions: 'Actions',
      yes: 'yes',
      no: 'no',
      add_zone_title: 'Add new zone to DNS',
      domain_name_label: 'Domain name',
      add_zone_btn: 'Add zone',
      delete_zone_confirm: 'Delete zone "{zone}" along with all its records?',

      certs_title: 'TLS Certificates (DNS-01)',
      certs_autorenew_note: 'Renewed automatically once fewer than 30 days remain before expiry (checked once a day, as long as the panel service is running) - the "Renew" button is only there in case you do not want to wait.',
      certs_empty: 'No certificates issued yet.',
      th_domain: 'Domain',
      th_environment: 'Environment',
      th_valid_from: 'Valid from',
      th_valid_to: 'Valid to',
      th_file: 'File',
      cert_env_staging: 'Active',
      cert_env_production: 'Production',
      renew_btn: 'Renew',
      renew_btn_loading: 'Renewing...',
      delete_cert_confirm: 'Delete the saved certificate for "{domain}" from the panel disk?',
      issue_new_cert_title: 'Issue new certificate',
      cert_domain_hint: 'The domain can be a zone itself (e.g. 24z.eu) or its subdomain (e.g. cdn.24z.eu) - the right zone for the TXT record is found automatically from the list above.',
      domain_label: 'Domain',
      email_label: 'Contact email (optional)',
      staging_checkbox_label: "Let's Encrypt staging (test mode, higher limits, browsers do NOT trust this cert) - uncheck for a real production certificate",
      issue_cert_btn: 'Issue certificate',
      issue_progress: 'Issuance in progress (DNS-01 validation) - this can take up to 1-2 minutes, do not close this tab...',

      records_title_prefix: 'Zone records:',
      close_btn: 'Close',
      th_name: 'Name',
      th_type: 'Type',
      th_ttl: 'TTL',
      th_values: 'Values',
      records_empty: 'No records.',
      save_btn: 'Save',
      cancel_btn: 'Cancel',
      edit_btn: 'Edit',
      delete_btn: 'Delete',
      add_record_title: 'Add new record',
      record_name_label: 'Name (full, e.g. www.{zone})',
      record_type_label: 'Type',
      record_ttl_label: 'TTL',
      record_value_label: 'Value (one per line; MX: "priority target", CAA: "flag tag value", SRV: "priority weight port target")',
      add_record_btn: 'Add record',
      delete_record_confirm: 'Delete record {name} ({type})?',

      version_check_fail: 'Failed to check version: ',
      update_available_title: 'Update available: v{current} -> v{latest} (click to download)',
      update_confirm: 'Newer version available: v{latest} (you have v{current}).\n\nDownload now? (git pull + npm install on the server)\n\nNOTE: this button does NOT refresh sudo permissions. If the update added a new feature requiring sudo, this button may not be enough - if you see errors like "sudo: a password is required", run this manually via SSH instead: sudo ./update.sh (it also restarts the service).\n\nIf you still click this button: afterwards you need to manually restart the service:\n  sudo systemctl restart cdn-caddy',
      updating_label: 'Updating...',
      restart_required_label: 'Restart required',
      restart_required_title: 'Files updated - run: sudo systemctl restart cdn-caddy',
      update_success_alert: 'Files updated on disk.\n\nNow restart the service:\n  sudo systemctl restart cdn-caddy',
      update_fail_alert: 'Update failed:\n\n{error}',
      stable_title: 'You have the latest version (v{current})',

      pool_tile_title: 'CDN Pool',
      pool_domain_label: 'CDN pool domain',
      pool_domain_hint: 'The domain all POPs serve under (path-based token routing, e.g. cdn.24z.eu/&lt;token&gt;/file).',
      pops_tile_title: 'POP list',
      pops_empty: 'No A/AAAA records for the pool domain (or the pool domain is not set yet).',
      pops_dns_note: 'List fetched automatically from the DNS (A/AAAA) records of the pool domain in Gcore - no manually added entries. "Active" = the record is enabled in Gcore. Full configuration verification (whether Caddy is actually running there, whether a certificate is loaded) is a future, separate step.',
      th_pop_host: 'Host',
      th_pop_ip: 'IP address',
      th_pop_description: 'Description',
      th_pop_status: 'STATUS GCORE',
      th_pop_status_cdn: 'STATUS CDN',
      pop_status_active: 'Active',
      pop_status_inactive: 'Not Active',
      pop_status_cdn_placeholder: 'Not checked',

      main_point_tile_title: 'Add/Set main point',
      main_point_hint: 'Hostname of the main management server (panel, certificate issuer, DNS master) - NOT a DNS record or fallback. Saving it unlocks the "Caddy Configuration" section below.',
      main_point_host_label: 'Main point hostname',
      save_main_point_btn: 'Save main point',
      caddy_config_title: 'Caddy Configuration',
      caddy_config_placeholder: 'Further steps are added below, numbered.',
      caddy_step1_title: 'Step 1: check/set the main configuration',
      caddy_step1_hint: 'Creates/fixes directories (/var/log/caddy, /var/www, /var/www/cdn), then formats, adapts, validates and reloads the main /etc/caddy/Caddyfile on this machine ({host}).',
      caddy_step1_btn: 'Check/set the main configuration',
      caddy_step1_running: 'Checking...',
      info_tile_title: 'Info',
      info_tile_placeholder: 'To be built in the next step.',
      pop_point_tile_title: 'Add/Set POP point',
      pop_point_hint: 'A geo-targeted (GeoDNS) point - the given IP will only answer queries from the selected countries. Reusing the same IP address replaces its country list.',
      ip_address_label: 'IP address',
      ttl_optional_label: 'TTL (optional, default 300)',
      countries_label: 'Countries (ISO 3166-1 alpha-2, comma-separated, e.g. PL,DE,CZ)',
      add_pop_point_btn: 'Add/save POP point',
      geo_verify_note: 'Verify the actual geo-routing behavior independently (e.g. with an online DNS checker from different countries) - the panel only sends the configuration to Gcore.'
    }
  };

  function getLang() {
    try {
      var saved = localStorage.getItem('cc-lang');
      return saved === 'en' ? 'en' : 'pl';
    } catch (e) {
      return 'pl';
    }
  }

  function setLang(lang) {
    try { localStorage.setItem('cc-lang', lang === 'en' ? 'en' : 'pl'); } catch (e) {}
  }

  function locale() {
    return getLang() === 'en' ? 'en-US' : 'pl-PL';
  }

  function t(key, params) {
    var lang = getLang();
    var str = (DICT[lang] && DICT[lang][key] !== undefined) ? DICT[lang][key] : (DICT.pl[key] !== undefined ? DICT.pl[key] : key);
    if (params) {
      Object.keys(params).forEach(function (k) {
        str = str.split('{' + k + '}').join(params[k]);
      });
    }
    return str;
  }

  function applyStaticTranslations() {
    document.documentElement.setAttribute('lang', getLang());
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
  }

  window.CC_I18N = { t: t, getLang: getLang, setLang: setLang, locale: locale, applyStaticTranslations: applyStaticTranslations };
})();
