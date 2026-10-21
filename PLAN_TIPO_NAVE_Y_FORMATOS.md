# Plan: tipo de nave desde la API y salida de formatos (23/09/2026)

## Decisiones
- El tipo de formato ya no se elige en el panel: sale de `code_type_vessel` de `api/Users/ListarNombradas`.
- Solo se aceptan tres códigos: `ET` (Ethanol), `GR` (Granel) y `ME` (Mercadería general). `CO`, `BB`, `VA`, los vacíos y cualquier otro se rechazan: la nombrada muestra el tipo que trae y no puede emitir formatos.
- Valores reales vistos en la API (ene 2025 a sep 2026): CO CONTAINER, GR GRANEL, ET ETANOL, ME MERCADERIA, BB BIG BAGS, VA VARILLAS y vacíos. El código llega como texto de dos letras.
- Reinicio: las definiciones vuelven a la versión de fábrica; se borran versiones, borradores y "Formatos emitidos". La numeración correlativa se conserva.
- Se borran los usuarios de prueba con emojis (CKI09).

## Back
1. `IListStaff` y el espejo `nameds`: `code_type_vessel` y `description_type_vessel` (`codeTypeVessel`, `descriptionTypeVessel`).
2. `vessel-type.ts`: tabla código a formato y `formatTypeForVessel()`. Una nombrada ya guardada sin el campo usa el `formatType` que se eligió antes, hasta que la sincronización la actualice.
3. Tablero, detalle y generación usan el tipo derivado. Un tipo rechazado se responde con 422 y el motivo, en los dos motores.
4. `formatType` sale del DTO de `named_records`: ya no se escribe desde el panel.

## Front
5. En el detalle de la nombrada, el selector se sustituye por el tipo que trae la API y el formato que le corresponde, o por el aviso de que ese tipo no se acepta.
6. PDF: los botones se muestran cuando `GET /format/pdf/status` dice que hay convertidor, en lugar de depender de un valor fijo.
7. Impresión: la vista de impresión sale del layout principal (sin menú ni cabecera), cada hoja en A4 con su orientación (`@page` con nombre para la asistencia apaisada).

## Formatos
8. Todas las hojas en A4: Excel v2 (`paperSize 9`), PDF (sale de ese Excel) e impresión HTML.
9. Excel: un libro `.xlsx` con una hoja por documento, generado por el motor v2.
10. Verificación contra los Excel originales: regenerar las definiciones y comprobar que salen idénticas; specs de orden (`label-coverage`, `rows-structure`, `data-coverage`).

## Estado al 23/09/2026
- Hecho y en `main` en los tres repositorios: back `4c40987` (desplegado en Coolify), front `ee1b14c`, app `9237688`.
- Back 1130/1130 unitarios e integración 15/15; front 389/389 unitarios y e2e 100/100; `ng build` correcto.
- Hallazgo al verificar contra los Excel: la tabla de personal usaba columnas escritas a mano (a la asistencia le faltaban FIRMA INGRESO, FIRMA TIEMPO DE REFRIGERIO, FIRMA SALIDA y HORAS EXTRAS, y encima llevaba repetida la cabecera original de 12 columnas; la charla ponía el puesto antes que el nombre). Ahora las columnas se leen de la fila de cabecera de cada hoja.
- ATS y PTS imprimen una persona por fila en lugar de dos. El orden de lectura (01..20 y luego 21..40) es el mismo.
- Pendiente: los puntos 11 y 12. El script es `db-ops.js`, con los modos `list-emoji`, `delete-emoji`, `formats-status` y `reset-formats`.

## Operativo (con script, contra la base de producción)
11. `restoreFactory` de los tres formatos, borrado de `format_definition_versions` y de los borradores, vaciado de `named_records.generatedFormats`.
12. Borrado de los usuarios con emojis en el nombre.
13. Commit y push a `main` en los tres repositorios.
