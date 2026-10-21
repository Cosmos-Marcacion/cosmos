#!/usr/bin/env node
/**
 * Trinquete de lint.
 *
 * El problema que resuelve: en este repositorio el lint llevaba tiempo sin
 * ejecutarse —`eslint.config.mjs` pasaba a Prettier un `endOfLine: 'off'` que no
 * es un valor valido y ESLint abortaba antes de analizar nada—, asi que al
 * arreglarlo aparecieron casi diez mil incumplimientos de golpe.
 *
 * Convertir eso en un gate de merge tal cual bloquearia todo trabajo. Bajar el
 * gate a "cero avisos nuevos, da igual lo viejo" es lo contrario: no mide nada.
 *
 * El trinquete es la via intermedia y la misma politica que ya usa la
 * cobertura: se guarda el recuento por regla en `lint-baseline.json` y el gate
 * falla si **alguna regla sube** o si aparece una regla nueva. La deuda
 * existente no bloquea, pero no puede crecer, y cada vez que baja se congela
 * mas abajo con `--update`.
 *
 *   node tools/lint-ratchet.mjs <proyecto>            comprueba
 *   node tools/lint-ratchet.mjs <proyecto> --update   baja la linea base
 *
 * `--update` nunca sube un recuento: si una regla empeoro, avisa y falla. Para
 * subirlo hace falta editar el fichero a mano, que es justo la friccion que se
 * busca.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const proyecto = resolve(process.argv[2] ?? '.');
const actualizar = process.argv.includes('--update');
const baselinePath = join(proyecto, 'lint-baseline.json');
const eslintBin = join(proyecto, 'node_modules', 'eslint', 'bin', 'eslint.js');

if (!existsSync(eslintBin)) {
  console.error(`No hay ESLint instalado en ${proyecto}. Ejecuta primero npm install.`);
  process.exit(2);
}

/** Recuento de errores por regla, tal y como los ve ESLint ahora mismo. */
function medir() {
  let salida;
  try {
    // Se invoca el bin de ESLint con el propio node y no `npx`: en Windows
    // `execFileSync` no puede lanzar un `.cmd` sin shell, y meter shell de por
    // medio obligaria a entrecomillar rutas con espacios.
    salida = execFileSync(process.execPath, [eslintBin, '.', '--format', 'json'], {
      cwd: proyecto,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // ESLint sale con codigo 1 cuando hay errores, que es el caso normal aqui.
    salida = error.stdout;
    if (!salida) {
      console.error('El lint no llego a producir informe:');
      console.error(error.stderr?.toString?.() ?? error.message);
      process.exit(2);
    }
  }

  const informe = JSON.parse(salida);
  const porRegla = {};
  for (const fichero of informe) {
    for (const mensaje of fichero.messages) {
      if (mensaje.severity !== 2) continue;
      const regla = mensaje.ruleId ?? '(sin-regla)';
      porRegla[regla] = (porRegla[regla] ?? 0) + 1;
    }
  }
  return porRegla;
}

const actual = medir();
const total = Object.values(actual).reduce((a, b) => a + b, 0);

if (!existsSync(baselinePath)) {
  writeFileSync(baselinePath, JSON.stringify(ordenar(actual), null, 2) + '\n');
  console.log(`Linea base creada con ${total} errores en ${Object.keys(actual).length} reglas.`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
const empeoradas = [];
const mejoradas = [];

for (const [regla, cuenta] of Object.entries(actual)) {
  const permitido = base[regla] ?? 0;
  if (cuenta > permitido) empeoradas.push({ regla, permitido, cuenta });
}
for (const [regla, permitido] of Object.entries(base)) {
  const cuenta = actual[regla] ?? 0;
  if (cuenta < permitido) mejoradas.push({ regla, permitido, cuenta });
}

if (empeoradas.length > 0) {
  console.error('El lint empeoro respecto a la linea base:\n');
  for (const { regla, permitido, cuenta } of empeoradas) {
    console.error(`  ${regla}: ${permitido} -> ${cuenta}  (+${cuenta - permitido})`);
  }
  console.error('\nCorrige lo nuevo. La deuda vieja no bloquea; la nueva si.');
  console.error('Si el aumento es legitimo, edita lint-baseline.json a mano y explica por que.');
  process.exit(1);
}

if (mejoradas.length > 0) {
  const ganancia = mejoradas.reduce((a, m) => a + (m.permitido - m.cuenta), 0);
  if (actualizar) {
    writeFileSync(baselinePath, JSON.stringify(ordenar(actual), null, 2) + '\n');
    console.log(`Linea base bajada: ${ganancia} errores menos. Total: ${total}.`);
  } else {
    console.log(`El lint mejoro en ${ganancia} errores. Congelalo con:`);
    console.log(`  node tools/lint-ratchet.mjs ${process.argv[2]} --update`);
  }
} else {
  console.log(`Lint sin regresiones. Deuda actual: ${total} errores.`);
}

function ordenar(objeto) {
  return Object.fromEntries(Object.entries(objeto).sort(([a], [b]) => a.localeCompare(b)));
}
