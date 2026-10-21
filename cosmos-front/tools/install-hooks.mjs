#!/usr/bin/env node
/**
 * Instala los hooks de git de este repositorio.
 *
 * Los gates viven en la pipeline, que es donde de verdad bloquean. Estos hooks
 * son la copia rapida: enteran del fallo en el minuto uno en vez de en el diez,
 * cuando ya se cambio de tarea y hay que volver a cargar el contexto.
 *
 * Por eso el reparto:
 *
 *  - `pre-commit` solo lo barato: tipos y lint. Tiene que costar segundos; un
 *    pre-commit que tarda un minuto se salta con `--no-verify` a la tercera vez.
 *  - `pre-push` corre la suite unitaria. Ahi si se puede esperar: se hace una
 *    vez, no en cada commit.
 *
 * Ninguno duplica la pipeline entera: la integracion, el extremo a extremo y el
 * analisis de seguridad se quedan donde tienen un entorno preparado.
 *
 *   node tools/install-hooks.mjs
 *   node tools/install-hooks.mjs --desinstalar
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, chmodSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const desinstalar = process.argv.includes('--desinstalar');

let dirGit;
try {
  dirGit = execFileSync('git', ['rev-parse', '--git-dir'], {
    cwd: raiz,
    encoding: 'utf8',
  }).trim();
} catch {
  console.error(`No hay repositorio git en ${raiz}.`);
  console.error('Los tres proyectos de Cosmos son repositorios independientes:');
  console.error('ejecuta esto dentro de cosmos-back, cosmos-front o cosmos-app.');
  process.exit(1);
}

const dirHooks = resolve(raiz, dirGit, 'hooks');
mkdirSync(dirHooks, { recursive: true });

const PRE_COMMIT = `#!/bin/sh
# Generado por tools/install-hooks.mjs. No editar a mano.
#
# Solo lo barato: tipos y lint. Si tarda mas de unos segundos deja de cumplir su
# funcion, porque la gente lo empieza a saltar.
set -e

# Si el commit no toca codigo, no hay nada que comprobar.
if ! git diff --cached --name-only --diff-filter=ACM | grep -qE '\\.(ts|html|json|mjs)$'; then
  exit 0
fi

echo "pre-commit: tipos"
npm run --silent typecheck

echo "pre-commit: lint"
npm run --silent lint:ci
`;

const PRE_PUSH = `#!/bin/sh
# Generado por tools/install-hooks.mjs. No editar a mano.
#
# La suite unitaria antes de subir. Es lo que evita el ciclo de "subir, esperar
# a la pipeline, ver que falla, arreglar, volver a subir".
#
# Se puede saltar con \`git push --no-verify\` cuando hace falta subir una rama a
# medias; la pipeline sigue siendo la que decide.
set -e

echo "pre-push: unitarias"
npm run --silent test
`;

const hooks = { 'pre-commit': PRE_COMMIT, 'pre-push': PRE_PUSH };

for (const [nombre, contenido] of Object.entries(hooks)) {
  const ruta = join(dirHooks, nombre);
  if (desinstalar) {
    if (existsSync(ruta)) {
      rmSync(ruta);
      console.log(`Quitado ${nombre}`);
    }
    continue;
  }
  writeFileSync(ruta, contenido, { mode: 0o755 });
  try {
    chmodSync(ruta, 0o755);
  } catch {
    // En Windows chmod no hace nada; git usa el hook igualmente.
  }
  console.log(`Instalado ${nombre}`);
}

if (!desinstalar) {
  console.log('\nPara saltarlos puntualmente: git commit --no-verify / git push --no-verify.');
  console.log('La pipeline sigue siendo la que bloquea; estos hooks solo adelantan la noticia.');
}
