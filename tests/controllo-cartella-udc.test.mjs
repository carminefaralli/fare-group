// Test del controllo delle cartelle riservate: costruiscono repository git di prova in una cartella temporanea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, chmodSync, rmSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'controllo-cartella-udc.mjs');
const SLUG = 'nome-della-app';
const BOT = { nome: `${SLUG}[bot]`, email: `123+${SLUG}[bot]@users.noreply.github.com` };
const UMANO = { nome: 'Mario Rossi', email: 'mario@example.org' };

function git(cwd, args, env = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Crea un repo con un commit iniziale (indici delle due cartelle + un articolo); restituisce cartella e SHA di base. */
function nuovoRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'udc-test-'));
  git(dir, ['init', '-q', '-b', 'main']);
  for (const c of ['it/approfondimenti', 'en/insights']) {
    mkdirSync(join(dir, c), { recursive: true });
    writeFileSync(join(dir, c, 'index.html'), '<p>indice</p>\n');
    writeFileSync(join(dir, c, 'vecchio.html'), '<p>vecchio</p>\n');
  }
  writeFileSync(join(dir, 'home.html'), '<p>home</p>\n');
  commit(dir, UMANO, UMANO, 'base');
  return { dir, base: git(dir, ['rev-parse', 'HEAD']) };
}

function commit(dir, autore, committer, messaggio) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', messaggio], {
    GIT_AUTHOR_NAME: autore.nome, GIT_AUTHOR_EMAIL: autore.email,
    GIT_COMMITTER_NAME: committer.nome, GIT_COMMITTER_EMAIL: committer.email,
  });
}

/** Esegue lo script sull'intervallo base..HEAD e restituisce il codice di uscita. */
function controlla(dir, base, env = {}) {
  const head = git(dir, ['rev-parse', 'HEAD']);
  const r = spawnSync('node', [SCRIPT], {
    cwd: dir, encoding: 'utf8',
    env: { PATH: process.env.PATH, UDC_APP_SLUG: SLUG, UDC_CARTELLE: 'it/approfondimenti,en/insights', BASE: base, HEAD: head, ...env },
  });
  return { codice: r.status, uscita: `${r.stdout}${r.stderr}` };
}

/** Prepara un repo, applica `modifica` e committa come `autore`/`committer`; restituisce l'esito del controllo. */
function scenario(modifica, { autore = BOT, committer = BOT, env = {} } = {}) {
  const { dir, base } = nuovoRepo();
  try {
    modifica(dir);
    commit(dir, autore, committer, 'modifica');
    return controlla(dir, base, env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('file .html nuovo dell\'App dentro la cartella: OK', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'it/approfondimenti/nuovo.html'), 'x')).codice, 0);
});

test('file .html nuovo nella cartella inglese: OK', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'en/insights/new.html'), 'x')).codice, 0);
});

test('file fuori dalle cartelle: KO', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'altro.html'), 'x')).codice, 1);
});

test('file in una sottocartella: KO', () => {
  assert.equal(scenario((d) => {
    mkdirSync(join(d, 'it/approfondimenti/sotto'));
    writeFileSync(join(d, 'it/approfondimenti/sotto/a.html'), 'x');
  }).codice, 1);
});

test('rinomina verso fuori dalla cartella: KO', () => {
  assert.equal(scenario((d) => renameSync(join(d, 'it/approfondimenti/vecchio.html'), join(d, 'fuori.html'))).codice, 1);
});

test('symlink dentro la cartella: KO', () => {
  const r = scenario((d) => symlinkSync('../../home.html', join(d, 'it/approfondimenti/link.html')));
  assert.equal(r.codice, 1);
  assert.match(r.uscita, /120000/);
});

test('file .js dentro la cartella: KO', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'it/approfondimenti/script.js'), 'x')).codice, 1);
});

test('file .html eseguibile: KO', () => {
  const r = scenario((d) => {
    const p = join(d, 'it/approfondimenti/exe.html');
    writeFileSync(p, 'x');
    chmodSync(p, 0o755);
  });
  assert.equal(r.codice, 1);
  assert.match(r.uscita, /100755/);
});

test('cancellazione di index.html: KO', () => {
  assert.equal(scenario((d) => unlinkSync(join(d, 'it/approfondimenti/index.html'))).codice, 1);
});

test('modifica di index.html: OK', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'en/insights/index.html'), '<p>nuovo indice</p>\n')).codice, 0);
});

test('modifica di un articolo esistente: KO', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'it/approfondimenti/vecchio.html'), 'cambiato')).codice, 1);
});

test('ritiro (cancellazione) di un articolo: OK', () => {
  assert.equal(scenario((d) => unlinkSync(join(d, 'it/approfondimenti/vecchio.html'))).codice, 0);
});

test('committer = App e autore umano che tocca fuori: KO', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'altro.html'), 'x'), { autore: UMANO, committer: BOT }).codice, 1);
});

test('autore = App e committer umano che tocca fuori: KO', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'altro.html'), 'x'), { autore: BOT, committer: UMANO }).codice, 1);
});

test('slug con maiuscole nella configurazione: riconosce comunque i commit dell\'App', () => {
  const r = scenario((d) => writeFileSync(join(d, 'altro.html'), 'x'), { env: { UDC_APP_SLUG: 'Nome-Della-App' } });
  assert.equal(r.codice, 1);
});

test('autore con maiuscole nel nome del bot: riconosciuto', () => {
  const r = scenario((d) => writeFileSync(join(d, 'altro.html'), 'x'), { autore: { nome: 'NOME-DELLA-APP[BOT]', email: 'x@example.org' }, committer: UMANO });
  assert.equal(r.codice, 1);
});

test('commit non dell\'App: ignorato', () => {
  const r = scenario((d) => writeFileSync(join(d, 'altro.html'), 'x'), { autore: UMANO, committer: UMANO });
  assert.equal(r.codice, 0);
  assert.match(r.uscita, /nessun commit/);
});

test('slug assente: exit 1', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'it/approfondimenti/n.html'), 'x'), { env: { UDC_APP_SLUG: '' } }).codice, 1);
});

test('slug non valido: exit 1', () => {
  assert.equal(scenario((d) => writeFileSync(join(d, 'it/approfondimenti/n.html'), 'x'), { env: { UDC_APP_SLUG: 'a b;c' } }).codice, 1);
});

test('BASE irraggiungibile: exit 1', () => {
  const { dir } = nuovoRepo();
  try {
    assert.equal(controlla(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef').codice, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
