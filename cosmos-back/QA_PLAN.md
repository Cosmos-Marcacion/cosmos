# Plan de QA de Cosmos

Implementación de lo que describe `QA.md`, aplicada a los **tres repositorios**
de Cosmos. Este documento es la referencia operativa: qué gate existe, dónde
está su umbral, por qué está en ese número y qué falta.

> **Estructura.** `cosmos-back`, `cosmos-front` y `cosmos-app` son repositorios
> independientes, cada uno con su remoto en Bitbucket. No hay monorepo. Por eso
> cada uno lleva su propia copia de `tools/` y `.semgrep.yml`: así un clon
> limpio tiene todo lo que sus gates necesitan. Este documento vive en
> `cosmos-back` y vale para los tres.

---

## 1. Estado, antes y después

| | Antes | Después |
|---|---|---|
| Backend: suites | 64, **29 en rojo** | 71, **0 en rojo** |
| Backend: casos | 651 | **1056** |
| Backend: duración | 434 s | **67 s** |
| Panel: casos | 161, **23 en rojo** | **320**, 0 en rojo |
| App móvil: casos | 55 | **74** |
| Integración con Mongo | ninguna | 15 casos, Mongo real en memoria |
| E2E | 36 casos | **43** (flujos + accesibilidad + visual) |
| Accesibilidad | ninguna | axe WCAG 2.1 A/AA sobre 3 pantallas |
| Regresión visual | ninguna | 3 instantáneas |
| Lint | **roto, no ejecutaba** | trinquete en los 3 proyectos |
| Umbrales de cobertura | ninguno | trinquete en los 3 proyectos |
| Vulnerabilidades | sin gate | gate con lista de excepciones fechadas |
| Rendimiento | ninguno | k6: humo (CI) y carga (nocturno) |
| CI | **ninguno** | Bitbucket Pipelines en los 3 repos (+ GitHub listo para migrar) |

Las 29 suites del backend y las 23 del panel eran esqueletos generados por el
CLI (`should be defined`) que nunca se completaron. No fallaban por una
regresión: nunca habían llegado a pasar.

---

## 2. Herramientas, según la tabla de QA.md

| Capa (QA.md) | Herramienta elegida | Dónde |
|---|---|---|
| Unit / integración | Jest + **SWC**, `mongodb-memory-server`, Supertest | `cosmos-back` |
| Unit (front) | Karma + Jasmine, `HttpTestingController` | `cosmos-front`, `cosmos-app` |
| E2E web | **Playwright** | `cosmos-front/e2e` |
| API | Supertest sobre la app Nest real | `cosmos-back/test/*.int-spec.ts` |
| Performance | **k6** | `perf/` |
| Visual | Playwright `toHaveScreenshot` | `cosmos-front/e2e/visual.spec.ts` |
| Accesibilidad | **axe-core** vía `@axe-core/playwright` | `cosmos-front/e2e/accesibilidad.spec.ts` |
| Seguridad | **Semgrep** + gate de `npm audit` | `.semgrep.yml`, `tools/audit-gate.mjs` |
| CI/CD | **GitHub Actions** | `.github/workflows/` |

### Por qué se apartó de QA.md en dos puntos

**Testcontainers → `mongodb-memory-server`.** QA.md propone Testcontainers. Se
descartó porque exige un demonio de Docker: el mismo comando tiene que correr en
Windows, en el runner del CI y en el portátil de quien acabe de clonar. Lo que
se pierde —réplica, sharding, transacciones distribuidas— no lo usa este
backend. La suite de integración arranca en 4 s.

**Visual con Playwright, no con Applitools/Percy.** No hace falta cuenta ni
clave, las instantáneas viven en el repositorio y se revisan en el mismo diff
que el código. A cambio hay que generarlas por sistema operativo (ver §7).

---

## 3. La política de umbrales: trinquete

Todos los umbrales de este repositorio siguen la misma regla, y es la decisión
de diseño más importante del plan:

> **El umbral se fija en el valor real medido, no en el deseado. Solo sube.**

El motivo es práctico. Este repositorio arrancó con 9.749 incumplimientos de
lint, 35 vulnerabilidades de gravedad alta y cobertura de ramas por debajo del
50 %. Poner el objetivo como umbral dejaría el CI en rojo desde el primer
commit, y **un CI que lleva semanas en rojo deja de leerse**: a partir de ahí,
la regresión de verdad pasa igual de inadvertida que sin gate.

El trinquete resuelve el conflicto: la deuda existente no bloquea, pero **no
puede crecer**. Cada vez que baja, se congela más abajo y ya no puede volver.

Aplicado a:

| Gate | Fichero de la línea base | Cómo se baja |
|---|---|---|
| Cobertura backend | `cosmos-back/test/coverage-thresholds.ts` | editar a mano tras medir |
| Cobertura panel / app | `karma.conf.js` (`coverageReporter.check`) | editar a mano tras medir |
| Lint (3 proyectos) | `lint-baseline.json` | `npm run lint:baseline` |
| Vulnerabilidades | `audit-allowlist.json` | arreglar y quitar la entrada |
| Accesibilidad | `e2e/accesibilidad.spec.ts` (`lineaBase`) | editar a mano tras arreglar |

Dos detalles que no son obvios:

- **`global` de Jest no es global.** En cuanto hay umbrales por carpeta,
  `global` mide *solo lo que no cae bajo ninguno de ellos*. La cifra global real
  de la base (74,2 / 54,4 / 75,3 / 76,1) no es la que aparece en `global`.
  Confundirlas produce un gate que no mide lo que su autor cree.
- **Las excepciones de vulnerabilidades caducan.** Cada entrada de
  `audit-allowlist.json` lleva motivo y `revisarAntesDe`. Pasada la fecha vuelve
  a bloquear. Una excepción sin caducidad es un agujero permanente que nadie
  vuelve a mirar.

### Números vigentes (medidos el 09/09/2026)

**Backend** — objetivo declarado: 90 / 85 / 90 / 90.

| Carpeta | stmt | branch | func | line |
|---|---|---|---|---|
| `src/common/` | 90 | 61 | 92 | 94 |
| `src/modules/auth/` | 87 | 51 | 100 | 94 |
| `src/modules/format/` | 74 | 59 | 75 | 74 |
| `src/modules/entry/` | 71 | 66 | 70 | 72 |
| `src/modules/employee/` | 72 | 64 | 65 | 73 |
| `src/modules/named/` | 50 | 32 | 39 | 51 |
| resto (`global`) | 78 | 47 | 84 | 83 |

**Panel** (`cosmos-front`): 59 / 41 / 60 / 59. Objetivo: 85 / 75 / 85 / 85.
**App** (`cosmos-app`): 24 / 4 / 19 / 24. Objetivo: 85 / 75 / 85 / 85.

`branches` es el número que importa: distingue una suite que ejercita los
caminos de error de una que solo recorre el camino feliz.

---

## 4. Cómo se ejecuta

Desde dentro de cada repositorio:

```bash
npm run qa          # todos los gates del proyecto
npm run lint:ci     # trinquete de lint
npm run audit:ci    # gate de vulnerabilidades
npm run typecheck   # tipos
npm test            # unitarias con cobertura
```

Solo en `cosmos-back`:

```bash
npm run test:int    # integración con Mongo en memoria
npm run perf:smoke  # k6, humo (necesita el backend levantado)
npm run perf:carga  # k6, carga del cambio de turno
```

Solo en `cosmos-front`:

```bash
npm run e2e         # flujos + accesibilidad + visual
npm run e2e:a11y    # solo accesibilidad
npm run e2e:visual  # solo regresión visual
npm run e2e:update-snapshots
```

---

## 5. Los gates del CI

**Bitbucket Pipelines es el CI activo**, porque es donde están los remotos. Cada
repositorio lleva su `bitbucket-pipelines.yml`:

| Repositorio | Pasos en cada PR y en `main` | A demanda |
|---|---|---|
| `cosmos-back` | Calidad ∥ Análisis estático | `nocturno`: k6 humo + carga |
| `cosmos-front` | Calidad ∥ Análisis estático → E2E y accesibilidad | `visual`: regresión de pixel |
| `cosmos-app` | Calidad ∥ Análisis estático | — |

El paso **Calidad** ejecuta, en este orden: `lint:ci` → `typecheck` → unitarias
con cobertura → (integración, solo en el backend) → `audit:ci` → `build`. Lo que
falla en segundos va primero, para que un error de tipos se sepa en el minuto
uno y no en el diez.

También hay un `.github/workflows/qa.yml` equivalente en cada repositorio, **hoy
inactivo**: se mantiene al día por si los repositorios se mueven a GitHub. Está
marcado como tal en su cabecera para que nadie lo confunda con el que corre.

En GitHub, el job `gate` es el único que habría que exigir en la protección de
rama: si mañana se añade un job, entra en `needs` y la regla no se toca. En
Bitbucket el equivalente es exigir que la pipeline pase antes de permitir el
merge.

---

## 6. Hallazgos

Todo lo de esta sección salió de escribir las pruebas. Está ordenado por
gravedad.

### Corregidos

| # | Dónde | Qué pasaba |
|---|---|---|
| 1 | `port`, `point`, `user` (backend) | Texto del buscador entraba tal cual en `$regex`. `?search=(` devolvía **500**; `?search=.*` devolvía la colección entera saltándose el filtro; un patrón anidado es un vector de **ReDoS**. Ahora pasa por `buildSearchFilter()`, que escapa. |
| 2 | `points.service.ts` (panel) | La URL se construía con `&search=` en vez de `?search=`. El término se pegaba al número de página, el backend nunca veía el parámetro y **el buscador de puntos no filtraba nada**, sin ningún error visible. |
| 3 | `generator`, `sync-employees` (panel) | `complete` para apagar el indicador de carga. Un observable que termina en error **nunca completa**: tras un fallo el botón quedaba deshabilitado para siempre y había que recargar la página. Tres ocurrencias. Ahora `finalize`. |
| 4 | `CreatePortDto` | `@IsNotEmpty()` da por bueno `'   '`. Se guardaban puertos con nombre en blanco. Añadido `@Trim()`. |
| 5 | `points.ts` (panel) | `ports[0]._id` sin puertos dados de alta → `TypeError` y pantalla en blanco. Es el estado normal de una instalación recién puesta en marcha. |
| 6 | `add-point.ts`, `add-user.ts` | `point.port._id` / `user.role._id` sin comprobación: un campo sin poblar hacía desaparecer el formulario entero. |
| 7 | `app.ts` (panel) | El sondeo de sesión se suscribía sin manejar el error: con el backend caído, un `HttpErrorResponse` sin capturar en cada carga. |
| 8 | `eslint.config.mjs` (backend) | `prettier/prettier` con `endOfLine: 'off'`, que no es un valor válido: **ESLint abortaba antes de analizar nada**. El lint llevaba tiempo sin ejecutarse. |
| 9 | `add-entry.ts` | `namedId: [null, ...]` dejaba el control tipado como solo-`null`, fuera de la comprobación de tipos; y se enviaba texto donde el contrato pide número. |
| 10 | Búsquedas del panel | El término no se codificaba: un `&` en el buscador partía la URL. |
| 11 | `cosmos-app` | `@zxing/browser` era una dependencia par presente solo por *hoisting*: no figuraba en `package.json` y cualquier reinstalación del árbol podía dejarla fuera y romper la compilación. Ahora es explícita. |

### Abiertos — requieren una decisión

| # | Gravedad | Dónde | Qué |
|---|---|---|---|
| **A** | **Alta** | `cosmos-back` y los dos front | **35 / 32 / 38 vulnerabilidades de gravedad alta o crítica** en dependencias. Incluye `axios` con SSRF y contaminación de prototipo, `@nestjs/core` con inyección, `adm-zip` con travesía de rutas. **`npm audit fix` publica arreglo para casi todas.** Sembradas en `audit-allowlist.json` con revisión antes del **2026-10-10** para que el gate arranque en verde; pasada esa fecha vuelven a bloquear. **Es el hallazgo más serio del ejercicio.** |
| **B** | Media | `upload.controller.ts` | `GET /upload/proxy?url=…` **no exige autenticación y no restringe el destino**: hace de proxy hacia la red interna del servidor. Es un SSRF de manual. Fijado con un test que documenta el comportamiento actual. Acotarlo a los hosts del bucket rompería a quien proxee otros orígenes, por eso no se cambió sin consultar. |
| **C** | Media | `employee.controller.ts` | Dos rutas inalcanzables: `@Get('models')` está declarada después de `@Get(':id')` y `@Patch(':employeeId')` después de `@Patch(':id')`. Ambas son de un segmento, así que gana la primera y la segunda **es código muerto documentado en Swagger**. Marcadas con `it.failing`: pasan mientras el defecto exista y se ponen en rojo al arreglarlo. |
| **D** | Media | `cosmos-app` | Cobertura de ramas del **4 %**. Las suites existentes recorren el camino feliz y poco más. Es la parte más floja de los tres proyectos. |
| **E** | Baja | `fingerprint-storage.service.ts` (app) | Llama a `/fingerprint/store`, `/fingerprint/verify`, `GET /fingerprint/:id`, `DELETE /fingerprint/:id`. **Ninguna de esas rutas existe** en el backend (son `save`, `identity`, `GET /fingerprint`, `DELETE /fingerprint/by-employee-id/:id`). El servicio se inyecta pero no se usa: es código muerto con URLs equivocadas. |
| **F** | Baja | `cosmos-front` | `@angular/animations@20.0.5` exige `@angular/common@20.0.5` y el árbol fija 20.0.3. Obliga a `--legacy-peer-deps` en cada instalación, también en CI. Se arregla alineando las versiones. |
| **G** | Baja | Global | 9.749 incumplimientos de lint en el backend (7.392 de formato), 125 en el panel, 96 en la app. En el panel y la app, **82 y 25 son de accesibilidad en plantillas** (`click-events-have-key-events`, `label-has-associated-control`), lo que corrobora lo que encuentra axe. |
| **H** | Baja | Backend | Ciclo de importación `employee ↔ named ↔ entry ↔ point ↔ talk ↔ assistant`. En producción lo resuelve `forwardRef`; en las pruebas obliga a romperlo con `jest.mock` por fichero, y forzó compilar seis servicios con `ts-jest` en vez de SWC (ver §7). |
| **I** | Informativo | `ValidationPipe` global | Con `enableImplicitConversion: true`, `@IsString()` por sí solo **no rechaza un número ni un objeto**: los convierte antes de validar. Un DTO que necesite rechazar de verdad necesita un validador de formato (`@Length`, `@Matches`). |
| **J** | Informativo | `PortsService` (panel) | Los parámetros se llaman `(page, limit)` pero la ruta del backend es `:limit/:page`, así que quien llama debe pasar el límite primero. El comportamiento es correcto; el nombre miente. Fijado con un test. |

---

## 7. Decisiones técnicas que conviene conocer

### ts-jest → SWC, con seis excepciones

La suite del backend tardaba 434 s porque `ts-jest` ejecutaba el type-checker
completo en cada corrida. Con SWC —el mismo compilador que ya usa `nest build`—
baja a 67 s. El chequeo de tipos no se pierde: es un gate propio
(`npm run typecheck`).

Seis servicios siguen compilándose con `ts-jest`, y no es una preferencia. Es la
única diferencia que importa entre los dos emisores:

- `tsc` publica cada clase con una **asignación** (`exports.X = X`). Un `require`
  reentrante ve `undefined` y sigue.
- SWC la publica con un **getter** que devuelve la variable `let`. Leerlo
  mientras la clase está en su zona muerta temporal lanza
  `Cannot access 'X' before initialization` — incluso detrás del `typeof` que
  SWC emite como guarda, porque `typeof obj.prop` **también invoca al getter**.

En producción no salta porque el único punto de entrada es `main.ts` y ese orden
de carga resulta seguro. Cada fichero de test es un punto de entrada distinto.
La regla está en `cosmos-back/test/jest.shared.ts` (`CYCLIC_SERVICES`). Se puede
retirar en cuanto se rompa el ciclo (hallazgo **H**).

### Las instantáneas visuales son por sistema operativo

Las que hay en el repositorio se generaron en Windows (`-win32`). El CI corre en
Linux y necesita las suyas. Por eso **la regresión visual está fuera del gate
diario** y vive en el nocturno.

Para activarla, una vez:

```bash
docker run --rm -v "$PWD/cosmos-front:/w" -w /w \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  sh -c "npm ci --legacy-peer-deps && npx playwright test --grep @visual --update-snapshots"
```

y subir los `-linux.png` resultantes.

### Semgrep se invoca sobre la raíz, nunca sobre `src`

Los `paths.include` de una regla se resuelven **contra el directorio del
escaneo**. Invocar `semgrep --config .semgrep.yml src` hace que
`include: "src/**"` no case con nada y **desactiva todas las reglas en
silencio**: la pipeline sale en verde sin haber analizado una línea. Los
pipelines escanean `.` con `--exclude` por eso. Se descubrió probando las reglas
contra código sintético, que es la razón por la que conviene hacerlo.

### Las reglas de Semgrep se validaron contra casos buenos y malos

Cada regla se probó con un fichero que contiene el defecto y otro que contiene
la forma correcta. La regla del `&` en la cadena de consulta marcaba como error
`?page=${p}&limit=${l}`, que es **correcto**, y hubo que exigir que no haya un
`?` antes en la misma plantilla. Una regla que se equivoca es una regla que
alguien acaba desactivando, y con ella se van las que sí acertaban.

### Cada repositorio lleva su copia de `tools/`

`lint-ratchet.mjs` y `audit-gate.mjs` están duplicados en los tres, igual que
`.semgrep.yml`. Es duplicación consciente: la alternativa —un paquete compartido
o un cuarto repositorio— obliga a instalar o clonar algo más antes de poder
ejecutar un gate, y un gate que necesita preparación previa es un gate que no se
ejecuta. Si los scripts crecen, conviene reconsiderarlo.

---

## 8. Lo que la IA no resolvió aquí

QA.md dedica una sección a esto y conviene ser concreto sobre este trabajo:

- **Qué vale la pena probar.** Los tests de este plan se concentran donde un
  fallo tiene consecuencia real —autorización, marcaciones, emisión de
  documentos— y son deliberadamente escasos en los CRUD. Esa priorización es un
  juicio de producto, no un resultado de la herramienta.
- **Oráculo de corrección.** Varios tests fijan comportamiento que
  **probablemente esté mal** (el `total` que cuenta la página y no la colección;
  el `CastError` que sale como 500; el 404 aplanado a 400 en huellas). Están
  marcados como tales. Un test que da por buena la implementación no es una
  especificación: es una foto.
- **Falsa sensación de cobertura.** Los 44 specs de la app pasaban y no
  afirmaban nada. Se reescribieron los de más valor; el resto sigue siendo
  humo, y por eso el umbral de la app está en 4 % de ramas y no maquillado.
- **Determinismo.** El agente escribió y mantuvo las pruebas; **quien las
  ejecuta en el gate es código determinista**. Ningún agente corre en CI.

---

## 9. Trabajo pendiente, por orden

1. **Actualizar dependencias vulnerables** (hallazgo **A**). `npm audit fix` en
   los tres proyectos y volver a sembrar la lista con lo que quede. Antes del
   2026-10-10, cuando las excepciones caducan.
2. **Decidir sobre el proxy de subidas** (hallazgo **B**): acotarlo a los hosts
   del bucket, exigir autenticación, o retirarlo.
3. **Arreglar las dos rutas muertas** de empleados (hallazgo **C**) y quitar el
   `.failing` de sus tests.
4. **Subir la cobertura de `cosmos-app`** (hallazgo **D**), empezando por
   `face.service`, `fingerprint.service` y `format.service`.
5. **Subir `src/modules/named/`** en el backend: `getNamedBoard`,
   `getNamedDetail` y `formatNames` concentran casi todo lo no cubierto.
6. **Generar las instantáneas visuales en Linux** (`custom: visual` de la
   pipeline del panel) y moverlas al paso de cada cambio.
7. **Romper el ciclo de importación** (hallazgo **H**) y retirar la excepción de
   `ts-jest`.
8. **Bajar la deuda de accesibilidad**: 82 incumplimientos de plantilla en el
   panel y 25 en la app, más los 7 elementos que encuentra axe.
9. **Formato**: decidir si se pasa `prettier --write` una vez sobre el backend
   (7.392 de los 9.749 errores de lint desaparecerían de golpe, a cambio de un
   diff que toca casi todos los ficheros).
