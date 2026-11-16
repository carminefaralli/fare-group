# Sito istituzionale: regole del repository

Sito statico in HTML, in italiano e inglese. Il repository è pubblico: ciò che è committato viene pubblicato.

## Regole operative

### Repository pubblico
- Il repository è pubblico e il deploy pubblica tutto il suo contenuto. Non inserire documenti interni, audit, bozze, piani o script di generazione.
- Non inserire nomi di risorse, host, account, credenziali, chiavi, impostazioni di sicurezza o procedure di accesso.
- Non rimuovere né modificare i file di verifica o di chiave in radice senza averne verificato l'uso.
- Non committare file di sistema del computer. Il repository ha un `.gitignore`: tienilo aggiornato.

### Modifiche alle pagine
- Modifica le pagine direttamente nell'HTML. Non generare pagine con script temporanei.
- Il sito resta statico, senza build step. Nuove dipendenze solo con decisione.
- Nella configurazione del sito non combinare riscrittura e stato 404 nella stessa route. Per il 404 usa solo lo stato.
- Il workflow di deploy usa terminazioni di riga CRLF: preservale.
- Redirect e hreflang si cambiano solo rieseguendo i controlli.

### Verifiche
- Prima di ogni deploy: `python3 tests/seo-static-check.py`.
- Dopo il deploy: `tests/smoke-post-deploy.sh` sul sito pubblicato.
- Con `pipefail` non usare `curl | head`: la chiusura anticipata della pipe dà falsi FAIL.
- I passi post-deploy che leggono il workspace vanno in un job separato.
- Lo stato del sito live si afferma solo dopo osservazione diretta. Altrimenti scrivi NON VERIFICATO.

### Contenuti
- Ogni contenuto esterno citato (video, soci, certificazioni, numeri) va verificato sulla fonte prima della pubblicazione.
- Non citare società, marchi o progetti non confermati dal CEO.
- Testi in italiano con lettere accentate vere, non apostrofo. Verifica separatamente le ancore in italiano e in inglese.
- Nei testi privacy il titolare è la società, mai una persona fisica. Modifiche a informative e privacy: conferma del CEO.

### Consenso e misurazione
- Nessuno strumento di misurazione o cookie attivo prima del consenso dell'utente.
- Ogni nuovo strumento va dichiarato nell'informativa cookie prima di essere attivato.
- Prima di un rilascio verifica che nessuna richiesta di rete parta prima del consenso.

### Pubblicazione e Git
- Push su `main` significa pubblicazione: pubblica solo dopo CI verde.
- Se push, merge, deploy o comandi cloud sono negati dal controllo permessi, non riprovare in loop: prepara il comando per il CEO.
- Se la CI segnala il limite di ambienti di anteprima, rimuovi le anteprime non necessarie prima del rilascio.
- Usa `git pull` semplice. I file non tracciati di un'altra sessione non si toccano. Una sola sessione possiede l'albero di lavoro.
- Gli agenti non eseguono operazioni git che modifichino lo stato.
- Fonte di verità: il repository remoto. Prima di lavorare su una copia locale, confronta con il remoto.

### Segreti e deleghe
- Nessuna credenziale nel repository. Le credenziali di deploy sono gestite fuori dal repository e non si stampano.
- Comandi per il CEO: non interattivi. Prova prima con `set -euo pipefail` e stdin vuoto.
- Deleghe ad agenti: solo skill ECC, mai agenti generici.
- Una modifica che contraddice una decisione in vigore si propone e si fa approvare. Non si applica.
