#!/usr/bin/env node
/**
 * Gate de vulnerabilidades de dependencias.
 *
 * `npm audit` por si solo no sirve como gate: devuelve error en cuanto hay una
 * sola vulnerabilidad de cualquier gravedad, incluidas las que viven en una
 * herramienta de desarrollo y las que aun no tienen arreglo publicado. Un gate
 * que falla siempre se acaba desactivando, y con el se pierde la senal de la
 * que si importa.
 *
 * Aqui se aplican dos criterios:
 *
 *  1. Solo bloquean las gravedades pedidas (por defecto `high` y `critical`).
 *  2. Lo ya conocido se anota en `audit-allowlist.json` con motivo y fecha de
 *     revision. Sin motivo no entra, y la fecha caducada vuelve a bloquear: una
 *     excepcion sin caducidad es una excepcion para siempre, y ahi es donde se
 *     acumulan los agujeros que nadie vuelve a mirar.
 *
 * Uso:
 *   node tools/audit-gate.mjs <proyecto>                   comprueba
 *   node tools/audit-gate.mjs <proyecto> --severity critical
 *   node tools/audit-gate.mjs <proyecto> --seed 30         siembra la lista
 *
 * `--seed <dias>` escribe la lista con lo que hay hoy y una fecha de revision a
 * esos dias vista. Es para arrancar el gate sobre una base que ya tiene deuda,
 * no para silenciar hallazgos nuevos.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const proyecto = resolve(args[0] ?? '.');
const minima = valorDe('--severity') ?? 'high';
const diasSiembra = valorDe('--seed');

const ORDEN = ['info', 'low', 'moderate', 'high', 'critical'];
const umbral = ORDEN.indexOf(minima);
if (umbral < 0) {
  console.error(`Gravedad desconocida: ${minima}. Usa una de ${ORDEN.join(', ')}.`);
  process.exit(2);
}

const allowlistPath = join(proyecto, 'audit-allowlist.json');
const allowlist = existsSync(allowlistPath)
  ? JSON.parse(readFileSync(allowlistPath, 'utf8'))
  : {};

const informe = auditar();
const vulnerabilidades = informe.vulnerabilities ?? {};
const resumen = informe.metadata?.vulnerabilities ?? {};

console.log(
  `Auditoria de ${proyecto}: ` + ORDEN.map((s) => `${s} ${resumen[s] ?? 0}`).join(', ')
);

/** Vulnerabilidades que superan el umbral de gravedad. */
const relevantes = Object.entries(vulnerabilidades)
  .filter(([, dato]) => ORDEN.indexOf(dato.severity) >= umbral)
  .map(([nombre, dato]) => ({ nombre, ...dato }));

if (diasSiembra) {
  sembrar(relevantes, Number(diasSiembra));
  process.exit(0);
}

const hoy = new Date();
const bloqueantes = [];
const perdonadas = [];
const caducadas = [];

for (const vulnerabilidad of relevantes) {
  const excepcion = allowlist[vulnerabilidad.nombre];
  if (!excepcion) {
    bloqueantes.push(vulnerabilidad);
    continue;
  }

  const revision = new Date(excepcion.revisarAntesDe);
  if (Number.isNaN(revision.getTime())) {
    caducadas.push({ nombre: vulnerabilidad.nombre, motivo: 'fecha de revision invalida' });
    bloqueantes.push(vulnerabilidad);
  } else if (revision < hoy) {
    caducadas.push({
      nombre: vulnerabilidad.nombre,
      motivo: `la excepcion caduco el ${excepcion.revisarAntesDe}`,
    });
    bloqueantes.push(vulnerabilidad);
  } else if (ORDEN.indexOf(vulnerabilidad.severity) > ORDEN.indexOf(excepcion.severidad ?? 'info')) {
    // La misma dependencia puede empeorar: una excepcion escrita para un `high`
    // no cubre que manana sea `critical`.
    caducadas.push({
      nombre: vulnerabilidad.nombre,
      motivo: `subio de ${excepcion.severidad} a ${vulnerabilidad.severity}`,
    });
    bloqueantes.push(vulnerabilidad);
  } else {
    perdonadas.push({ ...vulnerabilidad, motivo: excepcion.motivo });
  }
}

if (perdonadas.length > 0) {
  console.log(`\n${perdonadas.length} excepcion(es) vigente(s):`);
  for (const p of perdonadas.slice(0, 8)) {
    console.log(`  ${p.nombre} (${p.severity}): ${p.motivo}`);
  }
  if (perdonadas.length > 8) console.log(`  ... y ${perdonadas.length - 8} mas`);
}

if (caducadas.length > 0) {
  console.error('\nExcepciones que hay que revisar:');
  for (const c of caducadas) console.error(`  ${c.nombre}: ${c.motivo}`);
}

if (bloqueantes.length > 0) {
  console.error(`\n${bloqueantes.length} vulnerabilidad(es) de gravedad ${minima} o superior:`);
  for (const v of bloqueantes) {
    console.error(`  ${v.nombre} (${v.severity})${v.fixAvailable ? ' — hay arreglo publicado' : ''}`);
  }
  console.error('\nArreglalas (npm audit fix), o anotalas en audit-allowlist.json');
  console.error('con motivo y fecha de revision.');
  process.exit(1);
}

console.log('\nSin vulnerabilidades bloqueantes.');

// ---------------------------------------------------------------- utilidades

function valorDe(bandera) {
  const i = args.indexOf(bandera);
  return i > -1 ? args[i + 1] : undefined;
}

/** Ruta al `npm-cli.js` que esta ejecutando esta corrida. */
function npmCli() {
  const desdeEntorno = process.env['npm_execpath'];
  if (desdeEntorno && desdeEntorno.endsWith('.js')) {
    return desdeEntorno;
  }
  // Cuando el script no se lanza a traves de npm, se busca junto al binario de
  // node, que es donde lo deja tanto el instalador oficial como nvm.
  const candidato = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(candidato)) return candidato;
  const candidatoUnix = join(
    dirname(dirname(process.execPath)),
    'lib',
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js'
  );
  if (existsSync(candidatoUnix)) return candidatoUnix;
  console.error('No se encontro npm-cli.js. Ejecuta este script mediante npm run.');
  process.exit(2);
}

function auditar() {
  let salida;
  try {
    // Se invoca el cli de npm con el propio node y no `npm.cmd`: en Windows
    // `execFileSync` no puede lanzar un `.cmd` sin shell, y usar shell con
    // argumentos sueltos provoca el aviso DEP0190 en cada corrida del CI.
    salida = execFileSync(process.execPath, [npmCli(), 'audit', '--json'], {
      cwd: proyecto,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (error) {
    // `npm audit` sale con codigo distinto de cero en cuanto encuentra algo,
    // que es lo normal: el informe viene igual por stdout.
    salida = error.stdout;
    if (!salida) {
      console.error('npm audit no produjo informe:');
      console.error(error.stderr?.toString?.() ?? error.message);
      process.exit(2);
    }
  }
  return JSON.parse(salida);
}

function sembrar(vulnerabilidades, dias) {
  const revisarAntesDe = new Date(Date.now() + dias * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const nueva = {};
  for (const v of vulnerabilidades.sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    const anterior = allowlist[v.nombre];
    nueva[v.nombre] = {
      severidad: v.severity,
      motivo:
        anterior?.motivo ??
        (v.fixAvailable
          ? 'Deuda heredada con arreglo publicado; pendiente de actualizar la dependencia.'
          : 'Deuda heredada sin arreglo publicado en el momento de sembrar la lista.'),
      revisarAntesDe: anterior?.revisarAntesDe ?? revisarAntesDe,
    };
  }

  writeFileSync(allowlistPath, JSON.stringify(nueva, null, 2) + '\n');
  console.log(
    `\nLista sembrada con ${Object.keys(nueva).length} entrada(s), a revisar antes del ${revisarAntesDe}.`
  );
  console.log(`  ${allowlistPath}`);
}
