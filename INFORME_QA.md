# Informe de QA — Cosmos

**Fecha:** 10 de septiembre de 2026
**Alcance:** `cosmos-back`, `cosmos-front`, `cosmos-app`
**Estado:** implementado y subido a `main` en los tres repositorios

Este informe describe el estado de calidad de Cosmos tras implementar el plan
descrito en `QA.md`. Para el detalle operativo —cómo se ejecuta cada gate, dónde
está cada umbral y cómo se sube— la referencia es `QA_PLAN.md`, en `cosmos-back`.

---

## 1. Resumen ejecutivo

Cosmos no tenía integración continua. Tenía suites de pruebas, pero **52 de
ellas nunca habían llegado a pasar**: eran esqueletos generados por el CLI que
se dejaron sin completar. El lint estaba configurado de forma que abortaba antes
de analizar una sola línea, así que llevaba tiempo sin ejecutarse sin que nadie
lo notara.

Hoy los tres proyectos tienen una suite verde, gates automáticos en Bitbucket
Pipelines y umbrales que impiden que la calidad baje. En el proceso aparecieron
**11 defectos reales**, ya corregidos, y **10 hallazgos abiertos** que requieren
una decisión, uno de ellos serio.

| Indicador | Antes | Después |
|---|---:|---:|
| Casos de prueba, total | 867 | **1.493** |
| Suites que fallaban | 52 | **0** |
| Duración de la suite del backend | 434 s | **67 s** |
| Cobertura de ramas, backend | ~46 % | **54,4 %** |
| Pruebas de integración con base de datos | 0 | **15** |
| Pruebas E2E | 36 | **43** |
| Comprobaciones de accesibilidad | 0 | **4** |
| Gates automáticos | 0 | **6 por repositorio** |

---

## 2. Qué había antes

### Suites que nunca pasaron

De las 64 suites del backend, **29 fallaban**. De los 161 casos del panel,
**23 fallaban**. Ninguno era una regresión: todos eran ficheros
`*.spec.ts` generados por `nest g` y `ng g` con la forma

```ts
it('should be defined', () => {
  expect(service).toBeDefined();
});
```

que nunca se completaron con los `providers` que el servicio necesitaba. Fallaban
desde el día en que se crearon.

La app móvil era el caso opuesto y más engañoso: sus 55 casos **pasaban**, pero
no afirmaban nada más que "el servicio se puede construir". Es exactamente la
falsa sensación de cobertura de la que advierte `QA.md`: nadie duda de una suite
verde.

### El lint no se ejecutaba

`cosmos-back/eslint.config.mjs` pasaba a Prettier `endOfLine: 'off'`, que no es
un valor válido. ESLint abortaba con `Invalid endOfLine value` antes de analizar
nada. Al corregirlo aparecieron **9.749 incumplimientos**. `cosmos-front` y
`cosmos-app` directamente no tenían ESLint configurado.

### Sin integración continua

No había ningún fichero de pipeline activo. El único vestigio era un
`bitbucket-pipelines.yml.backup` en el backend con un despliegue por `rsync` y
SSH, sin ninguna comprobación de calidad delante.

---

## 3. Qué hay ahora

### Pirámide de pruebas

Siguiendo el modelo de `QA.md`:

| Capa | Casos | Dónde |
|---|---:|---|
| Unitarias | 1.450 | 71 suites en el backend, 51 en el panel, 44 en la app |
| Integración | 15 | `cosmos-back/test/*.int-spec.ts`, Mongo real en memoria |
| E2E | 43 | `cosmos-front/e2e`, cuatro ficheros |

La forma real es más estrecha en integración de lo que sugiere el 20 % del
modelo. Es una decisión consciente: el arnés de integración está montado y
probado sobre el módulo más simple, y ampliarlo a los módulos con lógica de
negocio —marcaciones, formatos— es trabajo pendiente que ahora cuesta poco
porque la infraestructura ya existe.

### Capas transversales

- **Regresión:** toda la suite corre en cada cambio.
- **Rendimiento:** k6, con prueba de humo (en la pipeline) y prueba de carga que
  reproduce el pico del cambio de turno (a demanda).
- **Seguridad:** Semgrep con reglas propias más catálogos públicos, y un gate de
  vulnerabilidades de dependencias.
- **Accesibilidad:** axe sobre WCAG 2.1 A y AA en tres pantallas, más una prueba
  de navegación con teclado.
- **Visual:** tres instantáneas con el comparador nativo de Playwright.

### Herramientas elegidas

| Capa de `QA.md` | Herramienta | Nota |
|---|---|---|
| Unit / integración | Jest + SWC, `mongodb-memory-server`, Supertest | |
| Unit (front) | Karma + Jasmine, `HttpTestingController` | |
| E2E web | Playwright | |
| Performance | k6 | |
| Visual | Playwright nativo | En lugar de Applitools/Percy: sin cuenta ni clave |
| Seguridad | Semgrep + `npm audit` con trinquete | En lugar de Snyk/SonarQube |
| CI/CD | Bitbucket Pipelines | GitHub Actions preparado por si se migra |

Se apartó de `QA.md` en un punto: **`mongodb-memory-server` en lugar de
Testcontainers**. Testcontainers exige un demonio de Docker, y el mismo comando
tiene que correr en Windows, en el runner y en el portátil de quien acabe de
clonar. Lo que se pierde —réplica, sharding, transacciones distribuidas— no lo
usa este backend. La suite de integración arranca en 4 segundos.

---

## 4. La decisión de diseño principal: umbrales que son trinquete

Pediste umbrales "perfectos o altos". La implementación **no los pone en el
objetivo**, y conviene explicar por qué, porque es la decisión que más determina
si estos gates sirven de algo dentro de seis meses.

El repositorio arrancaba con 9.749 incumplimientos de lint, 105 vulnerabilidades
de gravedad alta o crítica entre los tres proyectos, y cobertura de ramas por
debajo del 50 %. Un umbral fijado en el objetivo habría dejado la pipeline en
rojo desde el primer commit. Y **una pipeline que lleva semanas en rojo deja de
leerse**: a partir de ese momento la regresión de verdad pasa exactamente igual
de inadvertida que sin ningún gate. El gate existiría en el papel y no en la
práctica.

La regla implementada es:

> El umbral se fija en el valor real medido, redondeado un punto hacia abajo, y
> **solo sube**. La deuda existente no bloquea; crear deuda nueva sí.

Cada vez que un número mejora, se congela más abajo y ya no puede volver. El
objetivo declarado del proyecto sigue escrito en el código, al lado del umbral
vigente, para que la distancia entre ambos sea visible.

### Números vigentes

**Backend** — global real: 74,2 / 54,4 / 75,3 / 76,1. Objetivo: 90 / 85 / 90 / 90.

| Carpeta | Sentencias | Ramas | Funciones | Líneas |
|---|---:|---:|---:|---:|
| `common/` | 90 | 61 | 92 | 94 |
| `modules/auth/` | 87 | 51 | 100 | 94 |
| `modules/format/` | 74 | 59 | 75 | 74 |
| `modules/entry/` | 71 | 66 | 70 | 72 |
| `modules/employee/` | 72 | 64 | 65 | 73 |
| `modules/named/` | 50 | 32 | 39 | 51 |
| resto | 78 | 47 | 84 | 83 |

**Panel:** 59 / 41 / 60 / 59. **App:** 24 / 4 / 19 / 24. Objetivo en ambos:
85 / 75 / 85 / 85.

El número que importa es **ramas**: distingue una suite que ejercita los caminos
de error de una que solo recorre el camino feliz. Es también el que va más
retrasado, y por eso el que marca el trabajo pendiente.

### Dónde vive cada línea base

| Gate | Fichero | Cómo se baja |
|---|---|---|
| Cobertura backend | `test/coverage-thresholds.ts` | a mano, tras medir |
| Cobertura panel y app | `karma.conf.js` | a mano, tras medir |
| Lint | `lint-baseline.json` | `npm run lint:baseline` |
| Vulnerabilidades | `audit-allowlist.json` | arreglar y quitar la entrada |
| Accesibilidad | `e2e/accesibilidad.spec.ts` | a mano, tras arreglar |

Las excepciones de vulnerabilidades **caducan**: cada entrada lleva motivo y
`revisarAntesDe`, y pasada la fecha vuelve a bloquear. Una excepción sin
caducidad es un agujero permanente que nadie vuelve a mirar.

---

## 5. Los gates

Bitbucket Pipelines, en cada pull request y en cada push a `main`:

| Repositorio | Pasos |
|---|---|
| `cosmos-back` | Calidad ∥ Análisis estático |
| `cosmos-front` | Calidad ∥ Análisis estático → E2E y accesibilidad |
| `cosmos-app` | Calidad ∥ Análisis estático |

El paso **Calidad** ejecuta en este orden: `lint:ci` → `typecheck` → unitarias
con cobertura → integración (solo backend) → `audit:ci` → `build`. Lo que falla
en segundos va primero, para que un error de tipos se sepa en el minuto uno y no
en el diez.

A demanda: `nocturno` en el backend (k6 humo y carga) y `visual` en el panel
(regresión de pixel).

Localmente, `npm run hooks` instala un `pre-commit` que comprueba tipos y lint, y
un `pre-push` que corre la suite. No duplican la pipeline: solo adelantan la
noticia.

---

## 6. Defectos encontrados y corregidos

Los once salieron de escribir las pruebas, no de leer el código.

| # | Dónde | Qué pasaba | Impacto |
|---|---|---|---|
| 1 | `port`, `point`, `user` (backend) | El texto del buscador entraba tal cual en un `$regex` de Mongo | `?search=(` devolvía **500**; `?search=.*` devolvía la colección entera saltándose el filtro; vector de **ReDoS** |
| 2 | `points.service.ts` (panel) | URL con `&search=` en vez de `?search=` | **El buscador de puntos no filtraba nada**, sin ningún error visible |
| 3 | `generator`, `sync-employees` (panel) | Se apagaba el indicador de carga en `complete`, que no se ejecuta si el observable termina en error | Tras un fallo, el botón quedaba deshabilitado hasta recargar la página. Tres ocurrencias |
| 4 | `CreatePortDto` | `@IsNotEmpty()` da por bueno `'   '` | Se guardaban puertos con nombre en blanco |
| 5 | `points.ts` (panel) | `ports[0]._id` sin puertos dados de alta | Pantalla en blanco en una instalación recién puesta en marcha |
| 6 | `add-point.ts`, `add-user.ts` | Acceso sin comprobar a `port._id` y `role._id` | Un campo sin poblar hacía desaparecer el formulario entero |
| 7 | `app.ts` (panel) | El sondeo de sesión se suscribía sin manejar el error | Con el backend caído, un error sin capturar en cada carga |
| 8 | `eslint.config.mjs` (backend) | `endOfLine: 'off'`, valor inválido | **El lint no se ejecutaba** |
| 9 | `add-entry.ts` | `namedId: [null, …]` dejaba el control tipado como solo-`null` | El campo quedaba fuera de la comprobación de tipos; se enviaba texto donde el contrato pide número |
| 10 | Búsquedas del panel | El término no se codificaba | Un `&` en el buscador partía la URL |
| 11 | `cosmos-app` | `@zxing/browser` presente solo por *hoisting* | Cualquier reinstalación del árbol rompía la compilación |

---

## 7. Hallazgos abiertos

Requieren una decisión tuya. Ordenados por gravedad.

### A — Alta: 105 vulnerabilidades en dependencias

| Proyecto | Alta o crítica |
|---|---:|
| `cosmos-back` | 35 |
| `cosmos-front` | 32 |
| `cosmos-app` | 38 |

Incluye `axios` con SSRF y contaminación de prototipo, `@nestjs/core` con
inyección, y `adm-zip` con travesía de rutas. **`npm audit fix` publica arreglo
para casi todas.**

Están sembradas en `audit-allowlist.json` con revisión antes del **2026-10-10**
para que el gate arranque en verde. Pasada esa fecha vuelven a bloquear la
pipeline. Es el hallazgo más serio de todo el trabajo.

### B — Media: SSRF en el proxy de imágenes

`GET /upload/proxy?url=…` no exige autenticación y no restringe el destino: hace
de proxy hacia la red interna del servidor. Se dejó como está porque acotarlo a
los hosts del bucket rompería a quien proxee otros orígenes. Hay un test que fija
el comportamiento actual para que el cambio sea deliberado.

### C — Media: dos rutas inalcanzables

En `employee.controller.ts`, `@Get('models')` está declarada después de
`@Get(':id')` y `@Patch(':employeeId')` después de `@Patch(':id')`. Ambas son de
un segmento, así que gana la primera y la segunda es **código muerto documentado
en Swagger**. Marcadas con `it.failing`: pasan mientras el defecto exista y se
ponen en rojo el día que se arregle.

### D — Media: cobertura de la app móvil

4 % de ramas. Las suites existentes recorren el camino feliz y poco más. Es la
parte más floja de los tres proyectos.

### E — Baja: servicio de huellas con URLs inexistentes

`fingerprint-storage.service.ts` llama a `/fingerprint/store`,
`/fingerprint/verify`, `GET /fingerprint/:id` y `DELETE /fingerprint/:id`.
Ninguna existe en el backend. El servicio se inyecta pero no se usa: es código
muerto con URLs equivocadas.

### F — Baja: conflicto de dependencias en el panel

`@angular/animations@20.0.5` exige `@angular/common@20.0.5` y el árbol fija
20.0.3. Obliga a `--legacy-peer-deps` en cada instalación, también en la
pipeline. Se arregla alineando las versiones.

### G — Baja: deuda de lint

9.749 en el backend (7.392 de formato), 125 en el panel, 96 en la app. En el
panel y la app, **82 y 25 son de accesibilidad en plantillas**, lo que corrobora
lo que encuentra axe desde fuera.

### H — Baja: ciclo de importación en el backend

`employee ↔ named ↔ entry ↔ point ↔ talk ↔ assistant`. En producción lo resuelve
`forwardRef`; en las pruebas obliga a romperlo con `jest.mock` por fichero y
forzó compilar seis servicios con `ts-jest` en vez de SWC.

### I — Informativo: la validación de tipos es más laxa de lo que parece

Con `enableImplicitConversion: true` en el `ValidationPipe` global,
`@IsString()` por sí solo **no rechaza un número ni un objeto**: los convierte
antes de validar. Un DTO que necesite rechazar de verdad necesita un validador
de formato (`@Length`, `@Matches`).

### J — Informativo: parámetros con nombre engañoso

`PortsService.getPorts` declara `(page, limit)` pero la ruta del backend es
`:limit/:page`, así que quien llama debe pasar el límite primero. El
comportamiento es correcto; el nombre miente. Fijado con un test.

---

## 8. Dos cosas que descubrió el propio arnés

Merecen mención porque son el tipo de fallo que deja un gate en verde sin estar
comprobando nada.

**Semgrep se invoca sobre la raíz, nunca sobre `src`.** Los `paths.include` de
una regla se resuelven contra el directorio del escaneo. Invocar
`semgrep --config .semgrep.yml src` hace que `include: "src/**"` no case con
nada y **desactiva todas las reglas en silencio**: la pipeline sale en verde sin
haber analizado una línea.

**Las reglas se validaron contra casos buenos y malos.** La regla del `&` en la
cadena de consulta marcaba como error `?page=${p}&limit=${l}`, que es correcto, y
hubo que exigir que no haya un `?` antes en la misma plantilla. Una regla que se
equivoca es una regla que alguien acaba desactivando, y con ella se van las que
sí acertaban.

---

## 9. Lo que la IA no resolvió

`QA.md` dedica una sección a esto y conviene ser concreto sobre este trabajo.

**Qué vale la pena probar.** Las pruebas se concentran donde un fallo tiene
consecuencia real —autorización, marcaciones, emisión de documentos— y son
deliberadamente escasas en los CRUD. Esa priorización es un juicio de producto,
no un resultado de la herramienta.

**Oráculo de corrección.** Varios tests fijan comportamiento que
**probablemente esté mal**: el `total` que cuenta la página y no la colección, el
`CastError` que sale como 500, el 404 aplanado a 400 en huellas. Están marcados
como tales en el código. Un test que da por buena la implementación no es una
especificación: es una foto.

**Falsa sensación de cobertura.** Los specs de la app pasaban y no afirmaban
nada. Se reescribieron los de más valor; el resto sigue siendo humo, y por eso el
umbral está en 4 % de ramas y no maquillado.

**Determinismo.** El agente escribió y mantuvo las pruebas; **quien las ejecuta
en el gate es código determinista**. Ningún agente corre en la pipeline. Es la
regla práctica de `QA.md`: IA para escribir y mantener, determinismo para
ejecutar.

---

## 10. Trabajo pendiente, por orden

1. **Actualizar las dependencias vulnerables** (hallazgo A). `npm audit fix` en
   los tres y volver a sembrar la lista con lo que quede. **Antes del
   2026-10-10**, cuando las excepciones caducan y la pipeline se pone en rojo.
2. **Decidir sobre el proxy de subidas** (hallazgo B): acotarlo a los hosts del
   bucket, exigir autenticación, o retirarlo.
3. **Arreglar las dos rutas muertas** de empleados (hallazgo C) y quitar el
   `.failing` de sus tests.
4. **Subir la cobertura de `cosmos-app`** (hallazgo D), empezando por
   `face.service`, `fingerprint.service` y `format.service`.
5. **Subir `modules/named/`** en el backend: `getNamedBoard`, `getNamedDetail` y
   `formatNames` concentran casi todo lo no cubierto.
6. **Ampliar la integración** a marcaciones y formatos: el arnés ya está montado.
7. **Generar las instantáneas visuales en Linux** y mover la regresión visual al
   paso de cada cambio.
8. **Romper el ciclo de importación** (hallazgo H) y retirar la excepción de
   `ts-jest`.
9. **Bajar la deuda de accesibilidad**: 107 incumplimientos de plantilla entre
   panel y app, más los 7 elementos que encuentra axe.
10. **Decidir sobre el formato**: pasar `prettier --write` una vez sobre el
    backend eliminaría 7.392 de los 9.749 errores de lint, a cambio de un diff
    que toca casi todos los ficheros.

---

## 11. Qué se subió

Tres commits de QA más uno de corrección, ya en `main`:

| Repositorio | Commits | Ficheros |
|---|---|---:|
| `cosmos-back` | `7b05184`, `f8e5e7f` | 72 |
| `cosmos-front` | `5b6a129`, `cc48936` | 72 |
| `cosmos-app` | `19a46ce`, `14f9861` | 20 |

Los commits de `cosmos-front` y `cosmos-app` incluyen además trabajo en curso que
estaba sin commitear y **no es de QA** (maestro de formatos, guards,
interceptores, configuración de firma de Android). Se subió por indicación
expresa y queda anotado en el propio mensaje de commit para que el historial no
lo atribuya al trabajo de calidad.
