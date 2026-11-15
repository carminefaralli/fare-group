#!/usr/bin/env node
// controllo-cartella-udc.mjs
//
// Controllo per la CI del repository del sito: verifica che i commit di una GitHub App dedicata ai contenuti editoriali
// restino dentro due cartelle riservate (di norma `it/approfondimenti/` e `en/insights/`). Si lancia dal workflow
// `controllo-cartella-udc.yml`.
//
// Regola: i commit dell'App possono toccare SOLO i file `.html` che sono figli diretti delle cartelle riservate:
//   - aggiungere articoli nuovi (A) e ritirarli (D, un commit che li rimuove);
//   - aggiornare l'indice della cartella (`index.html`, M): e' l'unica pagina esistente che l'App modifica; l'indice non si cancella mai;
//   - mai modificare un articolo esistente, mai rinominare o copiare, mai toccare file fuori dalle cartelle;
//   - mai sottocartelle, symlink (modo 120000), file eseguibili (100755) o file con estensione diversa da `.html`.
// Un commit e' dell'App se l'autore OPPURE il committer corrispondono all'App (nome o email, senza distinzione di maiuscole).
//
// Configurazione (variabili d'ambiente, nessun segreto):
//   UDC_APP_SLUG   nome (slug) della GitHub App, per esempio `nome-della-app`: i suoi commit hanno autore o committer
//                  `<slug>[bot]`, oppure indirizzo `<id>+<slug>[bot]@users.noreply.github.com`; il confronto e' in minuscolo;
//   UDC_CARTELLE   le cartelle riservate, separate da virgola, di norma `it/approfondimenti,en/insights`;
//   BASE, HEAD     intervallo di commit da controllare (BASE esclusa, HEAD inclusa).
// Un parametro mancante o non valido, o un intervallo non raggiungibile, e' un ERRORE (mai un passaggio silenzioso).

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NOME_INDICE = 'index.html';
const SEGMENTO_CARTELLA = /^[a-z0-9][a-z0-9_-]*$/;
const SHA = /^[0-9a-f]{7,40}$/i;

const MODO_FILE_NORMALE = '100644';
const MODO_ASSENTE = '000000';
const FILE_HTML = /^[^/]+\.html$/;

/** Il commit e' dell'App se autore O committer sono `<slug>[bot]` o hanno l'indirizzo noreply del bot (senza distinzione di maiuscole). */
export function eCommitDellApp(commit, { slugApp }) {
  const bot = `${slugApp}[bot]`.toLowerCase();
  const noreply = `${bot}@users.noreply.github.com`;
  const corrisponde = (nome, email) => {
    const n = (nome ?? '').trim().toLowerCase();
    const e = (email ?? '').trim().toLowerCase();
    return n === bot || e === noreply || (e.endsWith(`+${noreply}`) && /^\d+\+/.test(e));
  };
  return corrisponde(commit.autoreNome, commit.autoreEmail) || corrisponde(commit.committerNome, commit.committerEmail);
}

/**
 * I problemi di un commit dell'App, dati i file toccati (`stato` git: A, M, D, R, C, T; `percorso`; `modoVecchio` e `modoNuovo`
 * come in `git diff-tree --raw`, assenti = nessun controllo sul modo). Elenco vuoto = conforme.
 */
export function violazioniDelCommit(fileToccati, { cartelle }) {
  const indici = cartelle.map((c) => `${c}/${NOME_INDICE}`);
  const problemi = [];
  for (const { stato, percorso, modoVecchio, modoNuovo } of fileToccati) {
    const figlioDiretto = cartelle.some((cartella) => {
      const resto = percorso.startsWith(`${cartella}/`) ? percorso.slice(cartella.length + 1) : null;
      return resto !== null && FILE_HTML.test(resto) && resto !== '..';
    });
    const modoNonAmmesso = [modoVecchio, modoNuovo].find((m) => m !== undefined && m !== MODO_ASSENTE && m !== MODO_FILE_NORMALE);
    if (!figlioDiretto) problemi.push(`${percorso} (${stato}): non e' un file .html direttamente dentro le cartelle riservate (${cartelle.join(', ')})`);
    else if (modoNonAmmesso !== undefined) problemi.push(`${percorso} (${stato}): modo ${modoNonAmmesso} non ammesso (symlink, eseguibili e sottomoduli sono vietati)`);
    else if (stato === 'D' && indici.includes(percorso)) problemi.push(`${percorso} (D): l'indice della cartella non si cancella`);
    else if (stato === 'M' && !indici.includes(percorso)) problemi.push(`${percorso} (M): modifica di un articolo esistente (si creano e si ritirano, non si modificano)`);
    else if (!['A', 'D', 'M'].includes(stato)) problemi.push(`${percorso} (${stato}): rinomina, copia o cambio di tipo non ammessi`);
  }
  return problemi;
}

/** Interpreta l'output di `git diff-tree --raw -z`: `:modoV modoN shaV shaN STATO\0percorso[\0percorso2]\0`. */
export function interpretaDiffTree(uscita) {
  const pezzi = uscita.split('\0');
  const file = [];
  for (let i = 0; i < pezzi.length; i += 1) {
    const intestazione = pezzi[i] ?? '';
    if (!intestazione.startsWith(':')) continue;
    const [modoVecchio = '', modoNuovo = '', , , stato = ''] = intestazione.slice(1).split(' ');
    const lettera = stato.charAt(0);
    // Rinomine e copie portano due percorsi: si controllano entrambi.
    const quanti = lettera === 'R' || lettera === 'C' ? 2 : 1;
    for (let k = 1; k <= quanti; k += 1) file.push({ stato: lettera, percorso: pezzi[i + k] ?? '', modoVecchio, modoNuovo });
    i += quanti;
  }
  return file;
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
  const [autoreNome = '', autoreEmail = '', committerNome = '', committerEmail = ''] = git(['show', '-s', '--format=%an%n%ae%n%cn%n%ce', sha]).split('\n');
  // `-m` mostra anche i merge (confronto con ciascun genitore): un merge non deve nascondere file toccati.
  const file = interpretaDiffTree(git(['diff-tree', '--root', '--no-commit-id', '--raw', '-z', '-r', '-m', '-M', '-C', sha]));
  return { sha, autoreNome, autoreEmail, committerNome, committerEmail, file };
}

function configurazione(env) {
  const slugApp = (env.UDC_APP_SLUG ?? '').trim().toLowerCase();
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
    console.log('OK: nessun commit della GitHub App nell\'intervallo, nulla da controllare.');
    return 0;
  }
  let violazioni = 0;
  for (const d of commit) {
    const problemi = violazioniDelCommit(d.file, c);
    if (problemi.length > 0) {
      violazioni += problemi.length;
      console.error(`FALLITO: il commit ${d.sha.slice(0, 7)} della GitHub App esce dalle regole:`);
      for (const p of problemi) console.error(`  ${p}`);
    }
  }
  if (violazioni > 0) return 1;
  console.log(`OK: ${commit.length} commit della GitHub App, tutti dentro ${c.cartelle.join(', ')} (articoli nuovi o ritirati, indici aggiornati).`);
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
