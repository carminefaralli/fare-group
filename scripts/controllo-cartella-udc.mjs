#!/usr/bin/env node
// controllo-cartella-udc.mjs
//
// Controllo per la CI del repository del sito fare-group.com (ADR-0076 D4). Si copia nel repository del sito
// (per esempio in `scripts/controllo-cartella-udc.mjs`) e si lancia dal workflow `controllo-cartella-udc.yml`.
//
// Regola: i commit della GitHub App dell'UDC possono toccare SOLO le due cartelle dedicate (`it/approfondimenti/` e `en/insights/`, DT-110):
//   - aggiungere articoli nuovi (A) e ritirarli (D, un commit che li rimuove);
//   - aggiornare l'indice della cartella (`index.html`, M): sono le uniche pagine esistenti che l'App modifica (una per lingua);
//   - mai modificare un articolo esistente, mai rinominare o copiare, mai toccare file fuori dalle cartelle.
// Il connettore dell'UDC rispetta gia' queste regole nel codice; questo controllo e' la seconda difesa, indipendente.
//
// Configurazione (variabili d'ambiente, nessun segreto):
//   UDC_APP_SLUG   nome (slug) della GitHub App, per esempio `fare-udc-approfondimenti`: i suoi commit hanno autore
//                  `<slug>[bot]` o indirizzo `<id>+<slug>[bot]@users.noreply.github.com`;
//   UDC_CARTELLE   le cartelle dedicate, separate da virgola, di norma `it/approfondimenti,en/insights`;
//   BASE, HEAD     intervallo di commit da controllare (BASE esclusa, HEAD inclusa).
// Un parametro mancante o non valido e' un ERRORE (mai un passaggio silenzioso).

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NOME_INDICE = 'index.html';
const SEGMENTO_CARTELLA = /^[a-z0-9][a-z0-9_-]*$/;
const SHA = /^[0-9a-f]{7,40}$/i;

/** Il commit e' dell'App se l'autore e' `<slug>[bot]` o ha l'indirizzo noreply del bot dell'App. */
export function eCommitDellApp({ autoreNome, autoreEmail }, { slugApp }) {
  const bot = `${slugApp}[bot]`;
  return autoreNome === bot || autoreEmail === `${bot}@users.noreply.github.com` || (autoreEmail.endsWith(`+${bot}@users.noreply.github.com`) && /^\d+\+/.test(autoreEmail));
}

/** I problemi di un commit dell'App, dati i file toccati (`stato` git: A, M, D, R, C, T e `percorso`). Elenco vuoto = conforme. */
export function violazioniDelCommit(fileToccati, { cartelle }) {
  const indici = cartelle.map((c) => `${c}/${NOME_INDICE}`);
  const problemi = [];
  for (const { stato, percorso } of fileToccati) {
    const dentro = cartelle.some((cartella) => {
      const prefisso = `${cartella}/`;
      return percorso.startsWith(prefisso) && !percorso.slice(prefisso.length).includes('/') && !percorso.split('/').includes('..') && percorso.length > prefisso.length;
    });
    if (!dentro) problemi.push(`${percorso} (${stato}): fuori dalle cartelle dedicate (${cartelle.join(', ')})`);
    else if (stato === 'M' && !indici.includes(percorso)) problemi.push(`${percorso} (M): modifica di un articolo esistente (si creano e si ritirano, non si modificano)`);
    else if (!['A', 'D', 'M'].includes(stato)) problemi.push(`${percorso} (${stato}): rinomina, copia o cambio di tipo non ammessi`);
  }
  return problemi;
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout;
}

function commitDell(intervallo) {
  return git(['rev-list', '--reverse', intervallo]).split('\n').filter((s) => s !== '');
}

function descrivi(sha) {
  const [autoreNome = '', autoreEmail = ''] = git(['show', '-s', '--format=%an%n%ae', sha]).split('\n');
  // Con la rilevazione delle rinomine, `R100\tvecchio\tnuovo` porta due percorsi: si controllano entrambi.
  const file = git(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-C', sha])
    .split('\n')
    .filter((r) => r !== '')
    .flatMap((r) => {
      const [stato = '', ...percorsi] = r.split('\t');
      return percorsi.map((percorso) => ({ stato: stato.charAt(0), percorso }));
    });
  return { sha, autoreNome, autoreEmail, file };
}

function configurazione(env) {
  const slugApp = (env.UDC_APP_SLUG ?? '').trim();
  const cartelle = (env.UDC_CARTELLE ?? 'it/approfondimenti,en/insights').split(',').map((c) => c.trim());
  const base = (env.BASE ?? '').trim();
  const head = (env.HEAD ?? '').trim();
  const errori = [];
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slugApp)) errori.push('UDC_APP_SLUG mancante o non valido');
  if (cartelle.length === 0 || cartelle.some((cartella) => cartella === '' || cartella.split('/').some((s) => !SEGMENTO_CARTELLA.test(s)))) errori.push('UDC_CARTELLE non valide');
  if (!SHA.test(base)) errori.push('BASE mancante o non valido');
  if (!SHA.test(head)) errori.push('HEAD mancante o non valido');
  return { slugApp, cartelle, base, head, errori };
}

function principale(env) {
  const c = configurazione(env);
  if (c.errori.length > 0) {
    console.error(`FALLITO: configurazione non valida: ${c.errori.join('; ')}.`);
    return 1;
  }
  const commit = commitDell(`${c.base}..${c.head}`).map(descrivi).filter((d) => eCommitDellApp(d, c));
  if (commit.length === 0) {
    console.log('OK: nessun commit della GitHub App dell\'UDC nell\'intervallo, nulla da controllare.');
    return 0;
  }
  let violazioni = 0;
  for (const d of commit) {
    const problemi = violazioniDelCommit(d.file, c);
    if (problemi.length > 0) {
      violazioni += problemi.length;
      console.error(`FALLITO: il commit ${d.sha.slice(0, 7)} della GitHub App dell'UDC esce dalle regole:`);
      for (const p of problemi) console.error(`  ${p}`);
    }
  }
  if (violazioni > 0) return 1;
  console.log(`OK: ${commit.length} commit della GitHub App dell'UDC, tutti dentro ${c.cartelle.join(', ')} (articoli nuovi o ritirati, indici aggiornati).`);
  return 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exit(principale(process.env));
  } catch (errore) {
    console.error(`FALLITO: ${errore instanceof Error ? errore.message : 'errore imprevisto'}.`);
    process.exit(1);
  }
}
