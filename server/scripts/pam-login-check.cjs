#!/usr/bin/env node
'use strict';
//
// Weryfikuje haslo dowolnego uzytkownika systemowego przez PAM (service
// "login"), URUCHOMIONY JAKO ROOT (wylacznie przez sudo -n, patrz
// write-sudoers.sh) - bo unix_chkpwd (pomocnik wywolywany przez
// pam_unix.so przy sprawdzaniu hasla) pozwala zweryfikowac CUDZE haslo
// TYLKO procesowi dzialajacemu jako root; zwykly, nieuprzywilejowany
// proces (jak nasza usluga, dziala jako SVC_USER) moze przez PAM
// sprawdzic wylacznie WLASNE haslo (self-check).
//
// Haslo NA STDIN (jedna linia), NIGDY jako argument wywolania - argv
// procesu jest widoczne dla innych lokalnych userow przez ps/proc.
//
// Uzycie: pam-login-check.cjs <username>   (haslo na stdin)
// Kod wyjscia: 0 = haslo poprawne, 1 = niepoprawne haslo / nieznany user
// / blad wejscia.

const pam = require('authenticate-pam');

const username = process.argv[2] || '';
if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) {
  process.stderr.write('BLAD: nieprawidlowa nazwa uzytkownika\n');
  process.exit(1);
}

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const password = input.replace(/\r?\n$/, '');
  pam.authenticate(username, password, (err) => {
    process.exit(err ? 1 : 0);
  }, { serviceName: process.env.PAM_SERVICE || 'login' });
});
