# Plan: hallazgos Cosmos CheckIn (CKI01-CKI19)

Origen: `Cosmos_CheckIn_Hallazgos.pdf`, revisión del 18/09/2026. Cada punto lleva
el diagnóstico contra el código y la corrección prevista. Rutas: back =
`cosmos-back/src/`, front = `cosmos-front/src/app/`, app = `cosmos-app/src/app/`.

## Reglas de negocio acordadas (21/09/2026)

- CKI07: una dependencia solo puede ser un punto del mismo puerto.
- CKI19: correo no registrado se informa como tal y el flujo se detiene (con límite de intentos).
- CKI13: contraseña de 8 o más caracteres con al menos una letra y un número (alta, edición y restablecimiento).
- CKI15: tolerancias enteras de 0 a 240 minutos.

---

## Resumen

| CKI | Prioridad | Causa real | Dónde | Fase |
|---|---|---|---|---|
| 01 | Alta | El detalle consulta marcaciones con `dd/mm/yyyy` contra `workerDate` ISO: nunca coincide. Hora del Excel en UTC (sin `TZ`). | back | 1 |
| 02 | Alta | `add-user` es OnPush en app zoneless y asigna `roles` en un subscribe; `findAllExceptSuper` no serializa `role`. | front + back | 1 |
| 03 | Alta | Dato en Mongo (`format_definitions` ETHANOL v12), no en código: la celda `a-1/f4/4-2` quedó ligada a `jefeCubierta`. La semilla está bien. | datos | 1 |
| 04 | Media | `last_name` de Cosmos ya trae ambos apellidos y se vuelve a concatenar `mother_last_name`, en 3 sitios. | back | 1 |
| 05 | Media | Front solo `required`; back ya tiene `@Trim`. | front | 2 |
| 06 | Media | `id="portId"` repetido en `add-point.html`. | front | 2 |
| 07 | Por definir | "Depende de" carga todos los puntos; el back no valida puerto ni ciclos. | front + back | 2 |
| 08 | Media | `table`/`list-table` sin `@empty`; gráficas del Panel se pintan vacías. | front | 3 |
| 09 | Media | Sin regla de caracteres para nombres (cliente y servidor). | front + back | 2 |
| 10 | Media | Editor de formatos sin corte bajo 1200px; tokens `$color1-60/40` y `#94a3b8` bajo contraste. | front | 3 |
| 11 | Media | No se guarda ninguna ejecución de sincronización. | back + front | 3 |
| 12 | Media | Login sin `markAllAsTouched`, sin mensaje de contraseña, toggle sin `aria-label`; Enter/Espacio en "Descargar formato" abre la tarjeta. | front | 3 |
| 13 | Alta | `POST /user` recibe `@Body() any`: el DTO nunca se aplica. Sin política de contraseña. | back + front | 1 |
| 14 | Media | `clear()` parece correcto en código; reproducir en navegador (sospecha: `[(ngModel)]` sobre `keywords.x` al cambiar la referencia en zoneless). | front | 2 |
| 15 | Media | Tolerancias sin `Min`/`IsInt`; `IsOptional` deja pasar `null` y borra la tolerancia; negativos encogen la ventana de marcación. | front + back | 2 |
| 16 | Media | La búsqueda solo se dispara con exactamente 8 caracteres; no hay botón, ni estados; el back responde 200 con `null`. | app | 2 |
| 17 | Alta | Stream de cámara huérfano: si se sale de la pantalla antes de que resuelva `getUserMedia`, la cámara queda ocupada y el siguiente intento da `NotReadableError`, que se muestra como "sin permiso". Estado de permiso cacheado sin re-lectura en `resume`. | app | 1 |
| 18 | Alta | `sendMail` (Gmail, `USER_EMAIL`/`PASSWORD_EMAIL`) falla sin try/catch → 500; el front muestra texto fijo. Causa exacta de SMTP pendiente de logs del servidor. Sin rate limit. | back + front | 1 |
| 19 | Alta | Correo desconocido sale temprano con 200 y el front pasa a "Nueva Contraseña"; el conocido falla en SMTP. | back + front | 1 |

---

## Fase 1: prioridad alta

**CKI01**
- `named.service.ts` `getNamedDetail`: pasar `formatDateToApi(named.worker_date)` a `getEntriesByEmployeeIds` (igual que el board).
- Unificar el cruce empleado: el board suma todas las fichas de un `staff_id`; detalle y Excel solo la primera. Usar el mismo criterio en los tres (todas las fichas del `staff_id`).
- `format-data.service.ts` `formatTime`: formatear en `America/Lima` con `date-fns-tz` en vez de `getHours()` del proceso. Además `TZ=America/Lima` en Dockerfile como red de seguridad.
- `entry.service.ts` `createManual`: `fromZonedTime` en vez de `toZonedTime`.
- Panel `chart2`: construir el inicio del turno en hora de Lima.
- Tests: spec de `getNamedDetail` con fecha `dd/mm/yyyy` que devuelva la marcación; spec de `formatTime` con TZ UTC.

**CKI02**
- `add-user.ts`: `roles` como `signal`. Endpoint `GET /role/assignable` protegido por el módulo `usuarios` (no `perfiles`).
- `user.service.ts` `findAllExceptSuper`: mapear `role: roleId?.name`; proteger `findByPagination` contra `roleId` nulo.
- Estado de carga y error recuperable en el select. Mostrar el rol en edición.

**CKI03**
- Corregir el dato: re-ligar la celda a "Nave" en el Maestro y publicar v13 (o `revert/:version` a la última versión sana). No se toca producción desde aquí; queda como paso operativo con verificación de vista previa y archivo.
- Test de regresión: ninguna celda cuyo rótulo vecino sea "NAVE" puede tener `source` distinto de `nave` en las semillas.

**CKI04**
- Función única `composeLastName(last, mother)` que no añade el materno si `last_name` ya termina en él (comparación normalizada, sin quitar tildes/ñ del resultado). Usarla en `employee.service.ts:270`, `named.service.ts:427/436` y `format-data.service.ts:236-239`.
- Tests: "TORRES ROMERO"+"ROMERO", "ESPINOZA"+"RETO", apellidos compuestos ("DE LA CRUZ"), materno vacío.

**CKI13 + CKI09**
- `user.controller.ts`: tipar `@Body() CreateUserDto`.
- DTOs create/update: `@Trim`, nombre `MinLength(3)`, `Matches` letras Unicode + espacios, apóstrofo y guion, al menos una letra; contraseña según política acordada.
- Front: mismos validadores (carpeta `shared/validators`), mensajes por campo, requisitos visibles antes de guardar.
- Datos de prueba con emojis: listar y proponer limpieza; no se borra nada en producción sin confirmación.

**CKI17**
- `face-mark.ts` y `face.ts`: flag `destroyed`; si `getUserMedia` resuelve tras `ngOnDestroy`, parar las pistas. Guarda contra doble apertura con una promesa en curso.
- Mapear `error.name`: `NotAllowedError` → sin permiso (con acceso a Ajustes), `NotReadableError` → cámara en uso, `NotFoundError` → sin cámara. Registrar el error.
- `camera-permissions.service.ts`: re-leer permiso en `App.addListener('resume')`; una sola llamada a `checkPermissions`; `prompt-with-rationale` con botón "Permitir".

**CKI18 + CKI19**
- Back: try/catch en el envío; log técnico con el código de nodemailer; si falla el envío, borrar el código creado y devolver 503 con mensaje accionable.
- Rate limit en `send-code` y `reset` (por email e IP), y límite de intentos por código. Código con `crypto.randomInt`. Comparar `expireAt` en la consulta.
- Política de correo no registrado según decisión (ver preguntas). La pantalla "Nueva Contraseña" no debe afirmar "Hemos enviado un código" si no se sabe.
- Front: mostrar `err.error.message`; reintento con cuenta atrás.
- Operativo: revisar logs del servidor para la causa SMTP (App Password de Gmail / red / DNS).

## Fase 2: validaciones y flujos

- **CKI05**: validador `noWhitespace` en front; mostrar error del back.
- **CKI06**: `id="dependOnId"` y su `label for`.
- **CKI07**: según regla. Si mismo puerto: cargar con `getPointsByPort` al cambiar el puerto, limpiar la selección incompatible, excluir el propio punto; el back valida mismo puerto, no auto-dependencia, no ciclos. Corregir `new Types.ObjectId(undefined)` en `update`.
- **CKI14**: reproducir en navegador; corregir y añadir e2e que compruebe el DOM.
- **CKI15**: nombre con la regla de CKI09; tolerancias enteras en rango acordado, `inputmode="numeric"`, bloquear letras/`e`; front no envía si inválido; back `IsInt`, `Min`, `Max`, sin `null`.
- **CKI16**: botón "Buscar" visible y Enter; `inputmode="numeric"`, `maxlength`; admitir 8-12 caracteres (CE); estados cargando / no encontrado / error; back responde 404 si no existe.

## Fase 3: estados, legibilidad, sincronización, accesibilidad

- **CKI08**: `@empty` en `table` y `list-table` con mensajes "sin registros" / "sin coincidencias" (distinguidos por si hay búsqueda); debounce en Usuarios; gráficas del Panel con estado vacío. El Panel usa `table-prime` (PrimeNG): al tocarlo se reemplaza por la tabla nativa y se retira `providePrimeNG` si queda sin uso.
- **CKI10**: subir `$color1-60/40` y `#94a3b8` a contraste AA en textos; editor de formatos con corte bajo 1024px que pliega los paneles laterales automáticamente y zoom inicial ajustado al ancho.
- **CKI11**: esquema `EmployeeSyncRun` (inicio, fin, estado, creados, actualizados, errores, usuario); `GET /employee/sync-runs`; la pantalla muestra la última ejecución y el historial.
- **CKI12**: login con `markAllAsTouched`, mensaje por campo, `aria-label`/`aria-pressed` en el toggle, `for` en labels, orientación de soporte; tarjeta de Marcaciones: `stopPropagation` en keydown del botón interior y `preventDefault` en Espacio.

## Estado al 21/09/2026

Implementado todo lo anterior sin commit. Resultados:

- cosmos-back: 77 suites y 1107 tests unitarios en verde (más 2 suites nuevas: detalle de nombrada y vínculo de NAVE), integración 15/15, `tsc` sin errores.
- cosmos-front: `ng build` correcto, 387/387 unitarios, e2e Playwright 97/97 (`e2e/hallazgos-panel.spec.ts` y `e2e/hallazgos-formularios.spec.ts` nuevos).
- cosmos-app: 99/99 unitarios, `ng build` de producción correcto.

Cambios fuera de lo previsto, detectados por las pruebas:
- La tarjeta de Marcaciones desbordaba en horizontal en móviles de 390 px (`minmax(23rem, 1fr)`); corregido.
- Los gráficos vacíos del Panel seguían visibles porque Chart.js fija `display:block` en el canvas; el `[hidden]` va ahora en un contenedor.
- La tarjeta de Marcaciones era un `role="button"` con otro botón dentro; ahora el botón es el título y cubre la tarjeta.
- Se quitó PrimeNG del front (`table-prime` reemplazado por `server-table` nativo). `package-lock.json` actualizado; `bun.lock` no.

Pendiente operativo (no se hace desde el código):
1. **CKI03**: re-ligar en el Maestro la casilla de NAVE de Ethanol (documento asistencia, sección a-1, fila f4, celda 4-2) a "Nave" y publicar, o `revert` a la última versión sana. Verificar vista previa y archivo.
2. **CKI18**: revisar el log del servidor tras el primer fallo; ahora queda una línea `No se pudo enviar el código de recuperación ... code=... responseCode=...`. Lo más probable es la App Password de Gmail (`USER_EMAIL`/`PASSWORD_EMAIL`) o el bloqueo de salida SMTP.
3. **CKI04**: los empleados ya guardados conservan el apellido duplicado hasta la próxima sincronización, que los actualiza.
4. **CKI09**: los usuarios de prueba con emojis siguen en la base; no se borraron. Decidir si se eliminan.
5. **Zona horaria**: el contenedor corría en UTC. Ahora el turno de marcación se interpreta en hora de Lima de forma explícita y el Dockerfile fija `TZ=America/Lima`. Si producción corría en UTC, la ventana de marcación cambia 5 horas (a la correcta): conviene avisar a operaciones del despliegue.
6. Límite de intentos en recuperación: vive en memoria del proceso (10 solicitudes de código y 20 cambios por IP cada 15 min, 5 intentos por código, 60 s entre envíos).

## Pruebas

- Back: specs Jest por cada corrección (`./node_modules/.bin/tsc` para tipos, no `npx tsc`).
- Front: specs Karma de validadores y componentes tocados.
- e2e Playwright (`cosmos-front/e2e`, backend simulado): alta de usuario (roles, validaciones), puertos con espacios, puntos (ids, dependencias, tolerancias), Limpiar del Panel, estados vacíos, login vacío, recuperación (conocido, desconocido, fallo de envío), detalle de nombrada con marcación.
- App: specs de `dni` y de la lógica de cámara; la verificación en dispositivo (modelo, Android, versión, estado previo de permisos) la hace el cliente.
- Regresión exigida por el documento: fechas invertidas del Panel, mensaje del Generador, validación de correo, recuperación para cuentas válidas.
