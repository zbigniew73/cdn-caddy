# Plan: mini-CDN przez Gcore GeoDNS + Caddy, routing po ścieżce (token)

Notatka robocza (plan, NIE wdrożenie) z 2026-08-20 — trzeci wariant CDN,
po `bind_cdn.md` (GeoIP w BIND, porzucone — zbyt kłopotliwe) i
`caddy_cdn.md` (`client_ip_hash` w Caddy + własna domena klienta przez
CNAME + per-klient ACME/DNS-01). Ten wariant upraszcza oba poprzednie
naraz, kosztem jednej decyzji produktowej:

**Ustalone z użytkownikiem 2026-08-20: klienci NIE dostają własnej
domeny CDN.** Wszyscy klienci korzystają wyłącznie z
`cdn.24z.eu/<token>/...`. To eliminuje całą sekcję ACME/DNS-01/TSIG/
`update-policy` per klient z `caddy_cdn.md` — potrzebny jest jeden
certyfikat dla `cdn.24z.eu`, nie N certyfikatów dla N domen klientów.

## Dlaczego to prostsze niż `caddy_cdn.md`

- Geo-routing POP-a robi **Gcore** (płatny SaaS) — nie trzeba już
  symulować geo przez `client_ip_hash`/HRW w Caddy ani przez GeoIP w
  BIND. Prawdziwy geo-routing, mniej ruchomych części po naszej stronie.
- Brak per-klienta configu w Caddy — jeden generyczny blok
  (`root * /var/www/cdn`, `file_server`) obsługuje wszystkich klientów
  przez segment ścieżki. Nowy klient = nowy katalog, zero zmian w
  Caddyfile/reload.
- Brak per-klienta certyfikatu — jeden cert na `cdn.24z.eu`,
  wystawiany raz (patrz sekcja TLS niżej, bo tu jest jeden istotny
  haczyk).

## Ustalone z użytkownikiem: model danych = pełna kopia na każdym POP

Nie cache/origin-pull, nie wspólny remote storage — pliki klienta są
**fizycznie zreplikowane** na USA/BER/MAD. Najlepsza wydajność (zawsze
lokalnie), kosztem synchronizacji przy każdym uploadzie/zmianie.

```
panel CDN (upload klienta)
        │
        ▼
   katalog kanoniczny (gdzie? — patrz "Do ustalenia dalej", pkt 1)
        │
        │  rsync/push po dodaniu/zmianie pliku
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
   USA POP         BER POP        MAD POP
   /var/www/cdn/   /var/www/cdn/  /var/www/cdn/
   <token>/        <token>/       <token>/
        │              │              │
      Caddy          Caddy          Caddy
   file_server     file_server    file_server
```

## Topologia i trasa requestu

```
przeglądarka klienta końcowego
        │  GET https://cdn.24z.eu/a3b2c5d8e8f4/logo.webp
        ▼
Gcore GeoDNS: cdn.24z.eu
   (NS delegacja poddomeny cdn.24z.eu do Gcore, reszta 24z.eu
    zostaje na własnym BIND ns1/ns2 — do potwierdzenia, patrz
    "Do ustalenia dalej" pkt 2)
   USA  → IP POP USA
   Europa Środkowa → IP POP BER
   Hiszpania/południe Europy → IP POP MAD
        │
        ▼
┌───────────────────────────────┐
│  POP (Caddy)                  │
│  root * /var/www/cdn          │
│  file_server                  │
└───────────────────────────────┘
        │
        ▼
/var/www/cdn/a3b2c5d8e8f4/logo.webp
```

Brak "gatewaya" jako osobnej warstwy (w przeciwieństwie do
`caddy_cdn.md`) — Gcore GeoDNS odpowiada bezpośrednio IP wybranego
POP-a, klient łączy się z nim wprost. Brak też ryzyka pętli
gateway→edge→origin z tamtego planu, bo tu nie ma originu klienta w
ogóle — pliki są *statyczne* na dysku POP-a (nie serwujemy z serwera
klienta).

## Struktura katalogów (identyczna na każdym POP)

```
/var/www/cdn/
├── a3b2c5d8e8f4/        ← klient 1
│   ├── logo.webp
│   └── css/
├── a2b3c4d6e2f6/        ← klient 2
│   └── baner.jpg
└── ...
```

Token = losowy, długi identyfikator (np. 12+ znaków hex), generowany
przez panel przy onboardingu nowego klienta. Świadomie NIE
`/klient1/`, `/123/` — token pełni rolę zarówno ID jak i "sekretu"
utrudniającego zgadywanie cudzych zasobów (to nie jest autoryzacja,
tylko obfuskacja — jeśli klient potrzebuje prywatnych plików, to osobny
temat, nieadresowany w tym planie).

## Caddyfile (identyczny na USA/BER/MAD, jeden blok dla wszystkich klientów)

```caddyfile
cdn.24z.eu {
    tls /etc/caddy/certs/cdn.24z.eu.pem /etc/caddy/certs/cdn.24z.eu.key
    root * /var/www/cdn
    file_server
    encode gzip zstd
}
```

Cert wskazany jawnie plikiem (nie auto-HTTPS) — patrz sekcja niżej,
dlaczego zwykłe on-demand/auto-HTTPS Caddy jest tu problematyczne.

## TLS dla `cdn.24z.eu` — jeden haczyk: HTTP-01 NIE zadziała tu wprost

Gdyby każdy POP miał własne, niezależne auto-HTTPS Caddy dla domeny
`cdn.24z.eu` (HTTP-01), to żądanie walidacyjne od CA (Let's Encrypt)
poleci przez **to samo Gcore GeoDNS**, które wybierze *jeden* POP wg
lokalizacji CA — niekoniecznie ten POP, który akurat próbuje odnowić
swój cert. Efekt: POP-y wzajemnie sobie "podkradają" walidację,
nieprzewidywalne błędy/rate limity przy odnawianiu. To ten sam problem
sygnalizowany w `projekt_pdcc.md`/`bind_cdn.md` dla puli edge CDN.

**Rozwiązanie zgodne z już przyjętym wzorcem w tym projekcie
(scentralizowany issuer + push certów):**
1. Cert dla `cdn.24z.eu` wystawiany w **jednym** miejscu (np. panel/VPS1),
   metodą DNS-01 (niezależną od tego, który POP odpowiada na ruch HTTP).
2. Gotowy cert (`cdn.24z.eu.pem`/`.key`) wypychany (rsync/scp) na
   USA/BER/MAD, Caddy tam używa go jako pliku statycznego (jak w
   Caddyfile wyżej), nie przez auto-HTTPS.
3. Odnowienie: cron/timer w miejscu issuera, po odnowieniu — push do
   POP-ów + `caddy reload` (albo API Caddy `/load`) na każdym.

DNS-01 dla `cdn.24z.eu` wymaga zapisu TXT w strefie, która faktycznie
odpowiada za `_acme-challenge.cdn.24z.eu` — **zależy od odpowiedzi na
pytanie "Do ustalenia dalej" pkt 2** (czy `cdn.24z.eu` jest
delegowana do Gcore, czy zostaje w BIND):
- Jeśli `_acme-challenge.cdn.24z.eu` zostaje w BIND (np. przez wyjątek/
  osobny rekord NS tylko dla `cdn`, a `_acme-challenge.cdn` per CNAME z
  powrotem do własnej strefy) — można użyć dokładnie tego samego
  mechanizmu TSIG/`rfc2136`/`update-policy`, który jest już opisany w
  `caddy_cdn.md` (tam per-klient, tu jednorazowo dla `cdn.24z.eu`
  samego).
- Jeśli DNS dla `cdn.24z.eu` w całości idzie przez Gcore — trzeba
  sprawdzić, czy Gcore ma API do zapisu TXT i czy istnieje moduł
  DNS providera dla Caddy/certbot/lego dla Gcore (do zweryfikowania,
  nie zakładać).

## Onboarding nowego klienta (panel CDN)

1. Panel generuje losowy token (np. 12+ znaków hex, unikalny).
2. Panel tworzy katalog `<token>/` w miejscu kanonicznym.
3. Panel udostępnia klientowi upload (FTP/API/dashboard — nieustalone).
4. Po każdym uploadzie/zmianie — sync do USA/BER/MAD (rsync-over-ssh
   najprościej; alternatywy typu Syncthing do rozważenia jeśli liczba
   POP-ów urośnie).
5. Panel zwraca klientowi finalny URL bazowy: `https://cdn.24z.eu/<token>/`.

## Do ustalenia dalej

1. Gdzie jest katalog kanoniczny (źródło prawdy) dla plików klientów —
   osobna maszyna (np. VPS1) czy jeden z POP-ów pełni tę rolę dodatkowo.
   Wpływa na kierunek rsync (push z jednego miejsca do 3, czy N-way).
2. Czy `cdn.24z.eu` jest w całości NS-delegowane do Gcore, czy tylko
   sam rekord A/AAAA jest tam "GeoDNS-owy" a reszta zostaje w BIND —
   od tego zależy dokładny mechanizm DNS-01 z sekcji TLS wyżej.
3. Mechanizm i częstotliwość synchronizacji plików do POP-ów (rsync
   wyzwalany przez panel po uploadzie, vs. cron reconciliation, vs.
   oba naraz) — do zaprojektowania razem z resztą panelu CDN w
   `dns-dashboard`.
4. Czy `caddy_cdn.md` (client_ip_hash + per-klient własna domena)
   zostaje jako opcja premium/przyszła (klient, który jednak chce
   swojej domeny), czy jest w całości zarzucony na rzecz tego planu.
5. Model danych klienta w panelu (token, nazwa, limity, przydzielony
   POP-y) — do zaprojektowania w `dns-dashboard`, jak w analogicznym
   punkcie w `caddy_cdn.md`.
