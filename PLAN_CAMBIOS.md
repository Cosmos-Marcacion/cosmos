# Plan de cambios Cosmos Checkin (HU-01 a HU-21)

Analisis del codigo actual, ubicacion exacta de cada cambio y plan de ejecucion en 10 dias.

---

## 1. Mapa de la plataforma

Tres repositorios independientes, sin monorepo:

| Repo | Stack | Rol | Despliegue actual |
|---|---|---|---|
| `cosmos-back` | NestJS 11 + Mongoose 8 + SWC | API `/api/v1`, integra API externa Cosmos (nombradas/usuarios), S3, face-api, WebAuthn, huella | Docker Hub `marcostor13/cosmos-back` -> SSH a `192.168.100.29`, puerto 3023 |
| `cosmos-front` | Angular 20 + Tailwind + PrimeNG + ExcelJS | Backoffice web (panel, marcaciones, capacitaciones, puertos, puntos, usuarios) | Docker Hub -> EC2 `3.19.119.133`, puerto 8002, nginx |
| `cosmos-app` | Angular 20 + Ionic + Capacitor (Android) | App de marcacion en campo (QR, DNI, rostro, huella ZKTeco) | APK v1.0 |

Datos maestros locales en Mongo: `Employee`, `Entry` (marcaciones), `Point` (puntos de marcacion), `Port`, `Talk` (charlas), `Assistant`, `Trainer`, `User`, `Role`, `Permission` (usuario-puerto), `Fingerprint`.

Dato clave: **la "jornada" (nombrada) no es una entidad local**. Viene de la API externa Cosmos (`POST api/Users/ListarNombradas`), identificada por `staff_transmission_id`, y trae `vessel_description` (nave), `shift_description` (turno), `worker_date`, `pier_description`, `voyage_number`. Todo lo que se quiera guardar contra una jornada necesita una coleccion local nueva que la referencie.

---

## 2. Inventario de formatos (esto es el corazon de los cambios 1 a 12)

Hoy existen **cinco generadores de formato distintos, duplicados y divergentes**, todos en el cliente (navegador) con ExcelJS:

| # | Formato | Archivo | Como se construye | Logo | Metadatos de version |
|---|---|---|---|---|---|
| 1 | Asistencia de personal | `cosmos-front/src/app/modules/entries/excel/excel-report.service.ts` | Celda por celda en codigo | `fetch('/images/logo.svg')` -> canvas 200x80 px | Hardcodeado: `Version: 01`, `Codigo: PD03-R97` |
| 2 | ATS | `cosmos-front/src/app/modules/entries/excel/ats-excel.service.ts` (`generateAtsReport`) | Rellena plantilla estatica `public/images/ATS.xlsx` en filas 23-36, columnas B/H y N/U | Dentro del .xlsx | Dentro del .xlsx |
| 3 | Permiso de Trabajo | mismo archivo (`generatePTReport`) | Rellena plantilla estatica `public/images/Permiso_de_trabajo.xlsx` desde la fila 97, columnas B/I | Dentro del .xlsx (2.9 MB) | Dentro del .xlsx |
| 4 | Induccion / capacitacion | `cosmos-front/src/app/modules/talks/services/talks-excel.service.ts` | Celda por celda | `fetch('/images/logo.png')` | Hardcodeado: `Fecha: 30/07/25`, `Version: 13`, `Codigo: PS02-R04` (lineas 106-113) |
| 5 | Asistencia + PT + ATS (movil) | `cosmos-app/src/app/services/home-excel.service.ts` | Celda por celda, **implementacion propia y distinta a la web** | **No tiene logo** | No tiene |
| 5b | Induccion (movil) | `cosmos-app/src/app/modules/talks/services/talks-excel.service.ts` | Duplicado del #4 | `fetch('/images/smtp.png')` -> **asset equivocado** | Hardcodeado |

Consecuencias directas sobre las HU:
- Cualquier cambio de formato (logo, N° de PT, supervisor, cabeceras) hay que aplicarlo hoy en **hasta 5 lugares**, o se centraliza primero.
- No existe ningun concepto de version de formato en base de datos: los codigos y versiones estan escritos a mano en el codigo o embebidos dentro de los .xlsx.
- Los registros generados no guardan con que version de formato se emitieron.

---

## 3. Mapeo HU -> donde se toca

### HU-01 (Dia 1) Reunion de validacion con el cliente
No es codigo. Lo que hay que llevar a la reunion:
- El inventario de la seccion 2 impreso (los 5 generadores y sus divergencias).
- Los 2 .xlsx plantilla actuales (`ATS.xlsx`, `Permiso_de_trabajo.xlsx`) y los 3 formatos generados por codigo, para congelar el layout final.
- Pedir: logo en alta resolucion (PNG >= 1200 px de ancho o SVG vectorial + PNG), manual de marca si existe.
- Acordar: esquema de codigos y versiones (quien versiona, formato del codigo `PD03-R97`, si la version es por documento o global), fecha de vigencia, que pasa con documentos ya emitidos con la version anterior.
- Cerrar las preguntas abiertas de la seccion 8.
- Entregable: acta con layout aprobado por formato + reglas de versionamiento.

### HU-02 (Dia 1, cambio 10) Logo institucional
Archivos a tocar:
- Assets web: `cosmos-front/public/images/` -> `logo.svg`, `logo.png`, `logo2.png`, `favicon.png`, `favicon.ico`.
- Assets movil: `cosmos-app/public/images/` -> `logo.png`, `logo2.png`, `logo_back.png`, `cosmos.png`, `icon.png`, `favicon.ico`; ademas iconos y splash de Android (`cosmos-app/android/app/src/main/res/**`).
- UI web: `main-layout.component.html` (lineas 6 y 18), `modules/auth/auth.html` (linea 13).
- UI movil: `main-layout.component.html` (lineas 8 y 81), `components/splash/splash.component.html` (5 y 14), `modules/auth/auth.html` (13).
- Formatos #1 (`loadLogoAsBase64` + `svgToPngBase64`), #4 (linea 618), #5b (linea 601, apunta a `smtp.png` por error).
- Formato #5 (movil): **agregar logo, hoy no lo tiene**.
- Plantillas #2 y #3: reemplazar la imagen dentro de los archivos `ATS.xlsx` y `Permiso_de_trabajo.xlsx`.

Riesgo de calidad de impresion (criterio de aceptacion "conserva calidad al imprimir"): hoy el logo del formato de asistencia se rasteriza a **200x80 px** en canvas (`svgToPngBase64`, lineas 534-539). A 200 px de ancho, impreso, se ve pixelado. Hay que rasterizar a 3-4x (p. ej. 800x320) o incrustar un PNG de alta resolucion directamente.

### HU-03 (Dia 1, cambio 1) Numero de Permiso de Trabajo
Hoy **no existe** ningun campo de numero de PT en ninguna entidad. Requiere:
- Backend: entidad nueva (ver HU-12) con numero correlativo. Propuesta: `WorkPermit { number, staffTransmissionId, workerDate, turn, portId, vessel, formatVersionId, supervisorId, status, createdBy }` + generacion de correlativo atomica (contador en Mongo con `findOneAndUpdate` + `$inc`, no `count()`).
- Los `Entry` se vinculan al PT por `namedId` (= `staff_transmission_id`) + `workerDate`, no hace falta tocar `entry.entity.ts`.
- Front: mostrar el numero en la grilla de marcaciones y en la cabecera de los formatos #1, #2, #3 y #5.
- Marcado como magnitud Baja, pero **depende de HU-12** si el numero debe ser correlativo administrado por la plataforma. Si el numero lo entrega el cliente / sistema externo, si es Baja. Ver pregunta P2.

### HU-04 (Dia 1, cambio 8) Cabeceras optimizadas del reporte de PT
Ubicacion: `ats-excel.service.ts` -> `generatePTReport`. La plantilla `Permiso_de_trabajo.xlsx` se carga y se rellena desde la fila 97 sin tocar la configuracion de impresion. Fix concreto (bajo esfuerzo, mientras se siga usando XLSX):
```ts
worksheet.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: {...} };
worksheet.pageSetup.printTitlesRow = '1:96'; // filas de cabecera a repetir
```
Si en HU-09 se decide migrar a PDF via HTML, esto se resuelve nativamente con `thead` + `@page` y esta HU se absorbe alli.

### HU-05 (Dia 1, cambio 11) Nave en el reporte de horas
Ubicacion: `excel-report.service.ts`, `populateSheetContent`, **linea 226**:
```ts
worksheet.getCell('B4').value = data.length > 0 ? data[0].ship || '' : '';  // NAVE
worksheet.getCell('F4').value = data.length > 0 ? data[0].turn || '' : '';  // JORNADA
```
Toma la nave **del primer registro de la lista**. Si el dia+turno tiene mas de una nave (lo normal en el terminal), la cabecera queda con una nave y el detalle con varias. Ademas `entries.sendReport()` (`entries.ts`, linea 188) solo filtra por nave si el usuario selecciono una en el combo, que no es obligatorio.
Fix propuesto: agrupar por nave y emitir una hoja (o un bloque con salto de pagina) por nave, o exigir la seleccion de nave igual que hoy se exige el turno. Ver pregunta P3.

### HU-06 (Dia 2, cambio 3) Supervisor en el formato de induccion
- Backend: `talk.entity.ts` + `create-talk.dto.ts` + `update-talk.dto.ts` -> agregar `supervisorId` (ref, misma mecanica que `trainerId` / `registerId`, que hoy apuntan a `Trainer`).
- Front web: `modules/talks/add-talk/add-talk.component.ts|html` (selector), `talks.component.ts` (columna), `talk.interface.ts`.
- App movil: `modules/talks/add-talk/*` y `talk.interface.ts` (duplicados).
- Formato #4 y #5b: renderizar el supervisor cerca de `A19` ("Nombre del capacitador") o del bloque `RESPONSABLE DEL REGISTRO` (`A21`), segun lo que apruebe el cliente en HU-01.
- Pregunta P4: de que catalogo sale el supervisor (`Trainer`, `Employee` o `User`).

### HU-07 (Dia 2, cambio 2) Supervisor responsable por jornada
La jornada es externa y de solo lectura, asi que hay que crear la vinculacion local:
- Backend: modulo nuevo `shift-supervisor` -> `{ staffTransmissionId, workerDate, turn, portId, supervisorId, assignedBy, createdAt }`, indice unico por `(staffTransmissionId, workerDate)`.
- Endpoints: asignar, reasignar, consultar por rango de fechas; cruce en `named.service.getNamesGrouped()` y en `entry.service.search()` para que salga en la grilla.
- Front: pantalla o accion de asignacion. Hoy **no existe una pantalla de jornadas**; lo mas cercano es la tabla de nombradas del panel (`entry.service.getChart4Data`, que ya devuelve una fila por nombrada con nave, muelle, fecha, turno y dotacion). Propuesta: agregar columna "Supervisor" editable en esa tabla, y ruta nueva `/jornadas` si el cliente quiere pantalla propia.
- Reportes: mostrar supervisor en formatos #1, #3 y #5.

### HU-08 (Dia 2, cambio 9) Columna de nombre y opcion de ocultarla en la impresion
Requiere aclaracion (pregunta P5). Los dos candidatos reales:
- (a) Exportacion del maestro de puntos de marcacion: `modules/points/points.ts` -> `getExcelConfig()` + `services/excel.service.ts`. Ya incluye la columna "Nombre", faltaria solo el toggle.
- (b) Los formatos de asistencia / PT, donde cada punto de marcacion es una columna y se quiere imprimir la planilla **sin la columna de nombres** (p. ej. para firma manual). Esto encaja mejor con la magnitud Media y con el resto del lote.
Segun la respuesta, se toca `excel.service.ts` (generico) o los generadores #1/#3/#5.

### HU-09 (Dia 3, cambio 12) Descarga en PDF
Hoy **no hay ninguna libreria PDF** en ninguno de los tres repos; todo es XLSX generado en el navegador. Tres caminos:

| Opcion | Como | Pro | Contra |
|---|---|---|---|
| A. HTML -> PDF en backend (Puppeteer/Playwright) | Plantillas HTML+CSS en NestJS, endpoint `/report/:code/pdf` | Fidelidad y control total, resuelve HU-04 (cabeceras repetidas con `thead`) y HU-08 (ocultar columna con CSS `@media print`), encaja con el maestro de formatos de HU-12..16 | Hay que reconstruir los formatos como HTML; +250-350 MB en la imagen Docker (Chromium) |
| B. XLSX -> PDF en backend (LibreOffice headless) | `soffice --convert-to pdf` sobre el buffer que ya se genera | Esfuerzo minimo, conserva los formatos actuales tal cual | Paginacion y cabeceras dependen del `pageSetup` del XLSX; dependencia pesada y lenta; tipografias a instalar en la imagen |
| C. PDF en el navegador (pdfmake / jsPDF) | Cliente | Sin cambios de infra | Se duplica la logica de formato por tercera vez; peor fidelidad; no reutilizable desde la app movil |

**Recomendacion: A**, condicionada a que el cliente apruebe los layouts en HU-01, porque HU-12 a HU-16 exigen igualmente convertir los formatos en datos versionables. B es el plan B si HU-01 se retrasa o si el cliente exige que el PDF sea identico pixel a pixel al XLSX actual.

### HU-10 y HU-11 (Dias 3 y 4, cambio 13) Performance
Hallazgos concretos, ordenados por impacto estimado:

1. **La API externa se llama en cada request y se re-autentica cada vez.** `named.service.getToken()` pide token en cada metodo publico (documentado en `API_COSMOS_USUARIOS_NOMBRADAS.md`, seccion 2). `entry.service.search()`, `dashboard()`, `checkin()` y `getEntriesByEmployeeId()` llaman a `getNameds()` sin cache. Fix: cachear el token con TTL y cachear nombradas por rango de fechas (in-memory con TTL o Redis). Es el mayor ahorro y el mas barato.
2. **`entry.service.search()` (linea 122) pagina en memoria.** Trae *todas* las marcaciones del dia con `.populate('pointId').populate('employeeId')`, agrupa en JS y recien ahi hace `slice()`. Ademas devuelve `total: entries.length` (marcaciones) cuando la grilla pagina por empleado agrupado (`groupedEntries.length`) -> **el paginador muestra un total incorrecto**. Fix: aggregation pipeline con `$lookup` + `$facet`, filtro de turno en base de datos.
3. **`dashboard()` (linea 1002)** carga todas las marcaciones del rango + `employeeService.findAll()` (todos los empleados) + charlas, y calcula 5 series en JS. `getChart4Data` hace `entries.filter(... entries.find(...))`, que es O(n^2).
4. **Los reportes piden `limit: 10000`** desde el front (`entries.ts`, lineas 181-185, 209-213, 234-238) y luego generan el XLSX en el navegador. En dias grandes esto congela la pestana.
5. **Indices**: `Entry` ya tiene 4 indices utiles. Falta revisar `Talk`, `Assistant` (`talkId`), `Fingerprint` (`employeeId`) y `Employee.id`.
6. **Front**: PrimeNG cargado para la tabla (el CLAUDE.md del proyecto pide retirarlo), sin `trackBy` en varios `@for`, bundle sin analizar.

Plan de las dos HU: Dia 3 = medir linea base (tiempos por endpoint y por pantalla, con datos reales) + atacar 1, 2 y 5. Dia 4 = 3, 4, 6 y verificacion contra la linea base. **Sin linea base medida el criterio de aceptacion de HU-11 no es verificable**, asi que la medicion es el primer entregable del Dia 3.

### HU-12 y HU-13 (Dias 4 y 5, cambio 4) Maestro de Permisos de Trabajo con versionamiento
Modulo nuevo en backend. **Ojo con el nombre**: ya existe `modules/permission`, que es permisos de usuario sobre puertos, nada que ver. El modulo nuevo debe llamarse `work-permit`.

Modelo propuesto (sirve tambien para HU-14, HU-15 y HU-16):
```
FormatDefinition   { code: 'PT'|'ATS'|'IND'|'ASIS', name, active }
FormatVersion      { formatId, version, documentCode ('PD03-R97'), effectiveDate,
                     status: draft|published|archived, definition (JSON con secciones,
                     campos y layout), templateUrl (S3/Blob, opcional), logoUrl,
                     createdBy, publishedAt }
FormatSection      { versionId, key, order, title, items[] }   // para ATS
WorkPermit         { number, formatVersionId, staffTransmissionId, workerDate, turn,
                     portId, vessel, supervisorId, status, createdBy }
```
Regla clave: **todo documento emitido guarda `formatVersionId`**, para poder reimprimirlo con la version con la que se emitio (criterio "cada registro queda vinculado a su version").

Front: modulo nuevo `/permisos-trabajo` (lista de versiones, editor, publicar/archivar, historial y diff basico), entrada en el menu, guard por rol Admin/Super.

### HU-14 (Dia 5, cambio 5) Maestro de ATS - Requisitos de Seguridad General
Hoy esa seccion vive **dentro del archivo `ATS.xlsx`** y no es editable desde la plataforma; el codigo solo escribe nombres y DNI en las filas 23-36. Hay que extraer esa seccion del xlsx y modelarla como `FormatSection` con items ordenables, version y fecha de vigencia, y renderizarla al generar el ATS.

### HU-15 (Dia 6, cambio 6) Maestro de ATS versionado por descripcion de tarea
Extension de HU-14: el ATS pasa a tener versiones ligadas a la "Descripcion de la Tarea". Modelo: `AtsTask { name, active }` + `FormatVersion.taskId`. Al generar un ATS se elige la tarea, y el sistema toma la version publicada vigente de esa tarea. Es la HU mas pesada del lote junto con HU-12.

### HU-16 (Dia 6, cambio 7) Versionamiento del formato de induccion
Reemplazar los literales de `talks-excel.service.ts` (lineas 106-113: `Fecha: 30/07/25`, `Version: 13`, `Codigo: PS02-R04`) por datos que vengan del maestro, y guardar `formatVersionId` en cada `Talk`. Se aplica en web y en la copia del movil (o se elimina la copia, ver seccion 5).

### HU-17 (Dia 7, cambio 15) Registro de salida de turno
Zona a revisar: `entry.service.ts` -> `checkin()` (linea 261) y `verifyRange()` (linea 178).
Hipotesis ordenadas por probabilidad:
1. **Zona horaria del contenedor.** `verifyRange()` usa `new Date()` y `set()` de date-fns, que trabajan en la zona local del proceso. El `docker-compose.yml` no define `TZ` y la imagen `node:20-bookworm-slim` corre en UTC salvo que el `.env_cosmos` del servidor la fije. `date-fns-tz` esta instalado pero solo se usa en `createManual()` (lineas 74-75, `America/Lima`). Un desfase de 5 horas afecta sobre todo al ultimo punto del turno, que es justo la salida.
2. **Turno nocturno.** En `verifyRange()`, la unica correccion de dia es `if (range === '23:00 - 07:00') finalDate = addDays(finalDate, 1)`. La salida del turno 23:00-07:00 ocurre al dia siguiente, y ademas `workerDate` se guarda con la fecha de la nombrada, no con la fecha real de la marcacion.
3. **Tolerancias.** Se aplica `startPoint.previousTolerance` y `endPoint.nextTolerance` globales al rango completo, no la tolerancia propia de cada punto.
Accion: pedir al cliente los casos reportados (empleado, fecha, turno, hora real) antes del Dia 7; reproducir; corregir; agregar pruebas de los 3 turnos incluyendo cruce de medianoche.

### HU-18 (Dia 7, cambio 16) Eliminacion controlada de huellas
Estado actual: `fingerprint.controller.ts` expone `DELETE /fingerprint/by-employee-id/:id` **sin ningun guard**, sin roles y sin traza. Ademas es un borrado fisico.
Cambios:
- Backend: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` en `FingerprintController`; borrado logico (`deletedAt`, `deletedBy`, `reason`) o coleccion de bitacora `FingerprintAudit`; limpiar tambien `Employee.fingerprintId` e `issetFinger`.
- Front/app: pedir motivo y confirmacion; pantalla de bitacora.
- Nota transversal detectada: `PointController` tiene `@Roles(...)` **sin `@UseGuards`** (linea 12), asi que el decorador no se aplica; los controladores `entry`, `talk`, `named`, `assistant`, `port` y `fingerprint` no tienen guard alguno. Conviene aprovechar esta HU para cerrar el hueco, o levantarlo como riesgo aparte.

### HU-19 (Dia 8, cambio 14) Migracion a Azure
Inventario de lo que hay que mover:
- Computo: 2 contenedores Docker (`cosmos-back` 3023, `cosmos-front` 8002 con nginx) hoy en EC2 `3.19.119.133` y en `192.168.100.29`. Destino sugerido: Azure Container Apps o App Service for Containers; registro de imagenes Docker Hub -> Azure Container Registry.
- Base de datos: `MONGO_URI`. Hay que confirmar si hoy es Atlas, Mongo autoadministrado o local, para decidir entre Cosmos DB for MongoDB (ojo: compatibilidad parcial de operadores de agregacion) o Mongo en VM/Atlas sobre Azure. **Esta decision condiciona el trabajo de HU-10/11**, porque los pipelines de agregacion nuevos deben ser compatibles con el destino.
- Almacenamiento: `upload.service.ts` usa AWS S3 (`@aws-sdk/client-s3`) para firmas e imagenes, y devuelve URLs `https://s3.<region>.amazonaws.com/...` guardadas en base de datos. Migrar a Azure Blob Storage implica cambiar el servicio **y migrar las URLs ya persistidas** (`Employee.signature`, `Employee.image`, `User.image`).
- Configuracion: `.env` con `MONGO_URI`, `URL_COSMOS`, `USER_COSMOS`, `PASSWORD_COSMOS`, credenciales AWS, `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`, SMTP, `DNSNODE_DNS_SERVERS` -> Azure Key Vault + App Configuration. `WEBAUTHN_RP_ID` depende del dominio: **si cambia el hostname, las credenciales WebAuthn ya registradas dejan de validar**.
- Red y DNS: `apicheckin.cosmos.com.pe` y el dominio del front; `main.ts` fija servidores DNS custom (`dns.setServers`) para alcanzar la API externa Cosmos, hay que verificar que esa ruta exista desde Azure.
- CORS: `main.ts` permite `*.cosmos.com.pe` y `*.marcostorresalarcon.com`; revisar antes del cutover.
- App movil: `environment.prod.ts` apunta a `https://apicheckin.cosmos.com.pe/api/v1`. Si el dominio se conserva, no hay que regenerar el APK; si cambia, si.

Un dia para todo esto es agresivo. Ver riesgo R1.

### HU-20 (Dia 9) QA post-migracion
Checklist minimo: login y roles; marcacion en los 3 turnos incluyendo cruce de medianoche (HU-17); huella (ZKTeco desde el APK contra el backend en Azure); rostro (modelos face-api servidos desde `/static`); sincronizacion de empleados desde la API externa; generacion de los 5 formatos con logo, numero de PT, supervisor y version correctos; descarga PDF; panel con tiempos medidos contra la linea base del Dia 3; carga de firmas al nuevo storage; correos.

### HU-21 (Dia 10) Estabilizacion y go-live
Despliegue, monitoreo, ventana de rollback definida, cierre de observaciones.

---

## 4. Orden de dependencias real

```
HU-01 (reunion)
  |-> HU-02 logo ------------------------------> formatos #1..#5
  |-> criterios de versionamiento --> HU-12 --> HU-13
                                        |------> HU-14 --> HU-15
                                        |------> HU-16
                                        |------> HU-03 (si el numero de PT es correlativo propio)
HU-07 supervisor por jornada -----------------> HU-06 (si comparten catalogo de supervisores)
HU-09 PDF (opcion A) --------- absorbe -------> HU-04 y HU-08
HU-10 medicion de linea base -----------------> HU-11 verificacion
HU-19 Azure ---------------------------------> HU-20 QA --> HU-21 go-live
```

Notas sobre la secuencia propuesta en el cronograma:
- HU-03 esta el Dia 1 con magnitud Baja, pero el maestro de PT que lo sostiene (HU-12) esta el Dia 4. Si el numero es correlativo generado por la plataforma, HU-03 debe moverse despues de HU-12, o entregarse el Dia 1 como campo simple y re-trabajarse despues.
- HU-04 y HU-08 conviene hacerlas despues de decidir el motor de PDF (HU-09), o se hacen dos veces.
- HU-02 toca los 5 generadores; si primero se centralizan los formatos (seccion 5), se toca uno solo.

---

## 5. Decision transversal recomendada: centralizar la generacion de formatos

Antes de tocar formato por formato en 5 lugares, mover la generacion al backend:

`POST /report/:code` con `{ formatVersionId?, workerDate, turn, staffTransmissionId, options: { hideNameColumn } }` -> devuelve XLSX o PDF.

Ganancias: HU-02, HU-03, HU-04, HU-05, HU-06, HU-08 y HU-09 pasan a tocarse **una vez** en lugar de hasta cinco; HU-12 a HU-16 quedan aplicables tanto a la web como al APK sin republicar el APK; se elimina la generacion pesada en el navegador (HU-10); desaparece la divergencia entre el PT de la web y el PT del movil.

Costo: 1 a 1.5 dias de refactor, que hoy no estan en el cronograma. Sin este paso, cada HU de formato paga el peaje de la duplicacion y el riesgo de que web y movil se sigan separando. **Recomiendo negociarlo en HU-01 como parte del alcance del Dia 2.**

---

## 6. Plan de ejecucion (10 dias)

| Dia | Trabajo | Entregable verificable |
|---|---|---|
| 1 | HU-01 reunion y acta. HU-02 logo en assets y UI (web + movil + Android). HU-04 `pageSetup` + `printTitlesRow` en PT. HU-05 nave por grupo en el reporte de horas. HU-03 campo de numero de PT (si es dato externo) | Acta firmada; build con logo nuevo; PT impreso con cabecera repetida; reporte de horas con nave correcta en dia multinave |
| 2 | (Recomendado) refactor de generacion de formatos al backend. HU-06 supervisor en induccion (entidad, DTO, formularios web y movil, render). HU-07 supervisor por jornada (coleccion, endpoints, columna en el panel). HU-08 columna de nombre + toggle de impresion | Induccion con supervisor; jornada con supervisor asignable y visible en reportes |
| 3 | HU-10: medicion de linea base por endpoint y pantalla. Cache de token y de nombradas. `search()` a pipeline de agregacion y correccion del `total`. Indices faltantes. HU-09: endpoint PDF y primer formato convertido | Tabla de tiempos antes/despues; boton de descarga PDF funcionando en 1 formato |
| 4 | HU-11: dashboard, O(n^2), reportes sin `limit: 10000`, bundle. Verificacion contra linea base. HU-12: modelo de formatos y versiones, correlativo de PT, endpoints | Informe de performance con mejoras medidas; API del maestro de PT operativa |
| 5 | HU-13: front del maestro de PT (lista, editor, publicar, historial) y cierre. HU-14: extraccion de Requisitos de Seguridad General del `ATS.xlsx` al maestro | Maestro de PT usable de punta a punta; seccion de ATS editable con version y vigencia |
| 6 | HU-15: versionamiento de ATS por Descripcion de la Tarea. HU-16: versionamiento del formato de induccion | ATS generado tomando la version vigente de la tarea; induccion con version desde el maestro |
| 7 | HU-17: reproduccion y correccion de la salida de turno (+ pruebas de los 3 turnos). HU-18: guards, roles, borrado controlado y bitacora de huellas (y cierre del hueco de guards detectado) | Casos reportados corregidos; baja de huella solo con perfil autorizado y con traza |
| 8 | HU-19: suscripcion, ACR, Container Apps, base de datos, Blob Storage y migracion de URLs, Key Vault, DNS, ensayo de cutover | Ambiente Azure levantado y replicado; ensayo de cutover documentado |
| 9 | HU-20: cutover + QA integral contra el checklist; correccion de observaciones | Checklist post-migracion cerrado |
| 10 | HU-21: estabilizacion, go-live, monitoreo | Produccion estable, sin incidencias criticas abiertas |

---

## 7. Riesgos

- **R1. Migracion a Azure en 1 dia (HU-19).** Con cambio de storage (S3 -> Blob), migracion de URLs ya persistidas, base de datos, DNS y WebAuthn atado al dominio, un solo dia deja sin margen el ensayo de cutover. Mitigacion: adelantar la creacion de la suscripcion, ACR y ambientes a los Dias 1-2 en paralelo (es trabajo de infra, no bloquea el desarrollo) y dejar el Dia 8 solo para replicacion y cutover.
- **R2. HU-01 tardia.** Todo el lote de formatos depende del acta del Dia 1. Si no se obtiene el logo en alta resolucion o no se cierran los criterios de versionamiento, se arrastra a HU-12..HU-16.
- **R3. Duplicacion de formatos.** Sin el refactor de la seccion 5, cada HU de formato se implementa hasta 5 veces y la app movil queda desincronizada (ademas, cualquier cambio en el APK exige republicar).
- **R4. Cosmos DB for MongoDB.** Si la base destino es Cosmos DB, algunos operadores de agregacion no estan soportados; hay que validarlo antes de reescribir las consultas de HU-10.
- **R5. Linea base de performance.** HU-11 pide "verificar mejoras frente a la linea base" y hoy no existe linea base. Se crea el Dia 3.
- **R6. Seguridad de endpoints.** Varios controladores del backend estan sin guard. Es un hallazgo fuera del alcance declarado, pero toca directamente el criterio de HU-18.
- **R7. WebAuthn y dominio.** Si el hostname cambia en la migracion, las credenciales de huella/rostro ya registradas via WebAuthn dejan de validar y hay que re-enrolar.

---

## 8. Preguntas abiertas

**P1. Versionamiento (bloquea HU-12 a HU-16).** La version es por documento o global de la empresa. Quien publica una version (rol). Que pasa con los documentos ya emitidos con una version anterior: se conservan tal cual (recomendado) o se re-renderizan con la version vigente. El codigo del documento (`PD03-R97`, `PS02-R04`) lo define el cliente o lo genera la plataforma.

**P2. Numero de Permiso de Trabajo (HU-03).** Lo genera la plataforma como correlativo, o llega desde el sistema externo Cosmos. Cual es el formato exacto (prefijo, año, ceros). Cual es el alcance de unicidad: por nave, por turno, por dia, por puerto, global. Un PT es por nombrada o puede cubrir varias.

**P3. Reporte de horas (HU-05).** Cuando el dia y turno tienen varias naves, se quiere una hoja por nave, un bloque por nave en la misma hoja, o se obliga a filtrar por nave antes de descargar.

**P4. Supervisor (HU-06 y HU-07).** De que catalogo sale: `Trainer` (que ya se usa para capacitador y responsable de registro), `Employee` (personal nombrado) o `User` (usuario de la plataforma). Es el mismo catalogo para la charla y para la jornada. Un supervisor por jornada o varios. Se puede reasignar despues de cerrada la jornada.

**P5. HU-08.** "Impresion de los puntos de marcacion" se refiere al maestro de puntos de marcacion (pantalla Puntos) o a los formatos de asistencia y PT donde cada punto es una columna. Y "columna de nombre": nombre del empleado o nombre del punto. El toggle es una preferencia por usuario, una opcion en el momento de descargar, o una configuracion del formato.

**P6. PDF (HU-09).** Que formatos deben salir en PDF: los cinco o solo PT y ATS. El PDF debe ser identico al XLSX actual, o se acepta un layout rediseñado aprobado en HU-01. Se mantiene tambien la descarga XLSX.

**P7. HU-17.** Se necesitan los casos concretos reportados (empleado, fecha, turno, hora real de salida, que se registro). Ademas: cual es la zona horaria configurada en el servidor de produccion actual.

**P8. Azure (HU-19).** "Tenant" se refiere al tenant de Entra ID / Microsoft 365 o solo a la suscripcion de Azure. Cual es el destino de la base de datos (Cosmos DB for MongoDB, Mongo en VM, Atlas en Azure). Se migra S3 a Blob Storage o se mantiene S3 en esta etapa. Se conservan los dominios `apicheckin.cosmos.com.pe` y el del front. Cual es la ventana de cutover aprobada y el criterio de rollback.

**P9. Alcance del refactor (seccion 5).** Se aprueba centralizar la generacion de formatos en el backend antes de ejecutar el lote de formatos, aceptando 1 a 1.5 dias adicionales, o se mantiene la duplicacion actual.

**P10. App movil.** Los cambios de formato deben llegar tambien al APK en este lote (implica republicar y redistribuir), o el APK queda para una siguiente entrega.
