# Maestro de formatos: informe de factibilidad y plan

**Fecha:** 24 de agosto de 2026
**Ámbito:** `cosmos-back/src/modules/format`, `cosmos-back/templates`, y una pantalla nueva en `cosmos-front`
**Estado:** análisis. No se ha implementado nada.

**Objetivo planteado:** poder configurar desde un maestro todos los campos de los formatos, incluyendo cada libro.

---

## 1. Qué hay hoy, en números

Lo que está escrito en `format-templates.config.ts`:

| | |
|---|---|
| Campos con nombre en la hoja `GLOBAL` | 18 (`B3` a `B21`) |
| Bloques de personal | 18 (5 en Ethanol, 6 en Granel, 7 en Mercadería) |
| Columnas declaradas en esos bloques | 89 |
| Huecos de personal direccionados | 643 |
| Transformaciones de dominio | 6 funciones |

Los 18 campos de `GLOBAL`:

```
nave                  -> GLOBAL!B3      resumenCharla1        -> GLOBAL!B14
fecha                 -> GLOBAL!B4      resumenCharla2        -> GLOBAL!B15
muelle                -> GLOBAL!B5      resumenCharla3        -> GLOBAL!B16
jornada               -> GLOBAL!B6      supervisorSsoma       -> GLOBAL!B17
inicioJornada         -> GLOBAL!B7      codigoNombrada        -> GLOBAL!B18
terminoJornada        -> GLOBAL!B8      jefeCubiertaVsi       -> GLOBAL!B20
supervisorOperaciones -> GLOBAL!B9      ssomaVsi              -> GLOBAL!B21
jefeCubierta          -> GLOBAL!B10
temaCharla1           -> GLOBAL!B11
temaCharla2           -> GLOBAL!B12
temaCharla3           -> GLOBAL!B13
```

Los 18 bloques de personal:

| Plantilla | Bloque | Hoja | Filas | Columnas | Huecos | Orden |
|---|---|---|---|---|---|---|
| ETHANOL | asistencia | `PD03-R97 ASIST.` | 16 | 8 | 16 | fila |
| ETHANOL | charla | `CHARLA` | 51 | 4 | 51 | fila |
| ETHANOL | ats | `ATS ETHANOL` | 20 | 6 | 40 | columna |
| ETHANOL | pt | `SS01-F167. PTS` | 8 | 4 | 16 | columna |
| ETHANOL | ingles | `INGLÉS` | 34 | 3 | 34 | fila |
| GRANEL | asistencia | `ASISTENCIA` | 60 | 8 | 60 | fila |
| GRANEL | charla | `CHARLA` | 51 | 4 | 51 | fila |
| GRANEL | ats | `ATS GRANEL` | 20 | 6 | 40 | columna |
| GRANEL | pt | `SS01-F167. PTS` | 8 | 4 | 16 | columna |
| GRANEL | pt (3C) | `SS01-F167. PTS (3C)` | 8 | 4 | 16 | columna |
| GRANEL | ingles | `INGLÉS` | 34 | 3 | 34 | fila |
| MERCADERÍA | asistencia | `ASISTENCIA` | 72 | 8 | 72 | fila |
| MERCADERÍA | charla | `CHARLA` | 51 | 4 | 51 | fila |
| MERCADERÍA | ats | `ATS MERCADERIA` | 20 | 6 | 40 | columna |
| MERCADERÍA | ats despacho | `ATS DESPACHO` | 20 | 6 | 40 | columna |
| MERCADERÍA | pt | `SS01-F167. PTS` | 8 | 4 | 16 | columna |
| MERCADERÍA | pt (3C) | `SS01-F167. PTS (3C)` | 8 | 4 | 16 | columna |
| MERCADERÍA | ingles | `INGLÉS` | 34 | 3 | 34 | fila |

Lo que hay dentro de las plantillas, que da la proporción real:

| | Ethanol | Granel | Mercadería |
|---|---|---|---|
| Hojas | 8 | 9 | 10 |
| Celdas con texto o número | 1.058 | 1.642 | 2.011 |
| Fórmulas | 79 | 161 | 241 |
| Celdas solo con estilo | 7.005 | 10.304 | 12.554 |
| Rótulos distintos | 678 | 720 | 752 |
| Definiciones de estilo | 1.040 | 1.098 | 1.109 |
| Imágenes | 39 | 40 | 40 |

Dato favorable: **solo dos archivos consumen la configuración** (`format.service.ts` y su prueba). La superficie de acoplamiento es mínima, así que sacarla a base de datos no arrastra medio backend.

---

## 2. "Todos los campos" son cuatro capas distintas

Cada una tiene un coste y un riesgo muy diferentes. Separarlas es la decisión de diseño más importante del informe.

### Capa A. Mapeo: dónde va cada dato

Qué celda recibe la nave, qué columna lleva el documento, qué filas admiten personal. Es exactamente lo que hoy es un objeto literal en TypeScript.

**Factible y mecánico.**

### Capa B. Semántica: qué dato y con qué transformación

No es una dirección, es una función. Ejemplos reales del código actual:

- `packNameAndDocument` rellena a 51 caracteres exactos porque la plantilla parte ese texto con `MID(B10,1,25)` y `MID(B10,52,30)`.
- `toShiftLabel` produce `"07:00 HRS."` porque una fórmula de la plantilla compara ese literal exacto.
- `toJornadaNumber` traduce el turno a 1, 2 o 3.
- `parseWorkerDate` convierte a número de serie de Excel.
- `formatTime` da `HH:mm`.
- `toEndShiftLabel` da la hora de término del turno.

**Factible, pero solo con un catálogo cerrado** de orígenes y de transformaciones. Nunca con texto libre: el primer error de dedo rompe el formato en silencio.

### Capa C. Contenido: qué dice el formato

Los rótulos, los títulos de sección, la tabla de riesgos del ATS, los requisitos de seguridad. Son unos 700 textos por plantilla y **ninguno tiene nombre**: habría que bautizarlos uno a uno para poder ofrecerlos en una pantalla.

**Factible solo por partes acotadas.**

### Capa D. Estructura: el diseño del libro

Añadir columnas, mover bloques, crear hojas. Eso es un editor de hojas de cálculo en el navegador.

**No recomendable.** Es otro producto.

---

## 3. El hallazgo que condiciona todo el diseño

Cuántas fórmulas de la propia plantilla dependen de las celdas de `GLOBAL`:

| | Ethanol | Granel | Mercadería |
|---|---|---|---|
| Fórmulas totales | 79 | 161 | 241 |
| **Fórmulas que leen de `GLOBAL`** | **46** | **58** | **64** |
| Celdas de `GLOBAL` referenciadas | 17 de 18 | 17 de 18 | 17 de 18 |

La más usada es `B7` (inicio de jornada): 11 fórmulas la leen en Granel y en Mercadería. Le siguen `B9` (supervisor de operaciones), `B3` (nave) y `B4` (fecha).

**Consecuencia:** la dirección de esas celdas no es un parámetro libre, es un contrato con el `.xlsx`.

- Un maestro puede dejar cambiar sin problema **qué dato alimenta cada celda**.
- Cambiar **en qué celda está** obliga a reescribir las 46 a 64 fórmulas que la leen. Es factible (sabemos localizarlas y reescribirlas) pero es trabajo y riesgo extra que hay que decidir si se compra.

---

## 4. Qué habría que modificar

### Backend

- Entidad `FormatTemplate` en Mongo, con versionado, sustituyendo al archivo de configuración.
- Servicio de plantillas que sirva la configuración cacheada a `format.service`.
- **Inspector de plantillas**: abre el `.xlsx` y propone la geometría (bloques de personal, cabeceras repetidas, área de impresión). El 80% de este código ya existe en los scripts con los que se hizo este análisis.
- **Validador**: contrasta la configuración contra el `.xlsx` real. ¿Existe la hoja? ¿Existe la fila? ¿La celda está combinada y estamos escribiendo en la esclava?
- **Vista previa**: genera con datos de ejemplo y devuelve qué celdas se escribieron.
- Endpoints CRUD, publicar y revertir versión.
- **Almacenamiento del `.xlsx`**: hoy las tres plantillas (9,2 MB) viajan dentro del repositorio y de la imagen de Docker (`COPY . .`, y el `.dockerignore` no las excluye). Si se pueden subir desde la pantalla, tienen que irse a S3, o a Blob Storage tras la migración a Azure de la HU-19.

### Frontend

- Módulo "Maestro de formatos": listado, editor por hoja, mapa de celdas con el catálogo de orígenes y transformaciones, vista previa y publicación.

### Efectos colaterales

- La prueba que hoy compara los huecos declarados contra los que admite cada hoja deja de ser la red de seguridad. Hay que moverla a validación en el momento de publicar.
- Cada formato emitido debe registrar **con qué versión de plantilla** se generó. Hoy se guarda `generatedFormats` en la ficha de la nombrada; falta el campo de versión.

---

## 5. Plan por fases

| Fase | Trabajo | Entregable verificable | Estimación |
|---|---|---|---|
| 0 | Acordar alcance: capas A+B, y qué trozo de C | Acta con el catálogo de campos | ½ día |
| 1 | Configuración de TypeScript a Mongo, sin pantalla | Los formatos se emiten igual, leyendo de base de datos | 2 a 3 días |
| 2 | Inspector, validador y vista previa | Subir un `.xlsx` y ver la geometría propuesta y los errores | 3 a 4 días |
| 3 | Pantalla del maestro | Editar el mapeo y publicar sin desplegar | 4 a 6 días |
| 4 | Versionado, almacenamiento externo y trazabilidad | Historial, revertir, y saber con qué versión se emitió cada formato | 2 a 3 días |
| 5 (opcional) | Maestro de contenido acotado: ATS e inducción | Editar los requisitos de seguridad y los textos versionados | 3 a 5 días |

**11 a 16 días** para las fases 0 a 4. Con la fase 5, **14 a 21**.

### Relación con el plan existente

Esto **generaliza las HU-12 a HU-16 de `PLAN_CAMBIOS.md`** (maestro de PT con versionamiento, maestro de ATS, versionamiento de inducción), que suman unos 3 días en el cronograma actual.

O se hace el maestro genérico y esas HU se resuelven dentro, o se hacen las HU sueltas y el maestro se queda sin sitio. Es una decisión, no dos.

---

## 6. Cómo afecta al proceso actual

| | Hoy | Con maestro |
|---|---|---|
| Cambiar dónde va un dato | Editar TypeScript, PR, desplegar | Editar en pantalla y publicar |
| Reemplazar una plantilla | Copiar el `.xlsx` a `templates/` y desplegar | Subirla, revisar la geometría propuesta, publicar |
| Quién puede hacerlo | Desarrollador | Administrador de la plataforma |
| Red de seguridad | Prueba automática en CI | Validación y vista previa antes de publicar |
| Si algo sale mal | Revertir el commit | Revertir a la versión anterior |
| Peso del despliegue | 9,2 MB de plantillas en la imagen | Plantillas fuera, en almacenamiento |

Lo que **no cambia**: la generación sigue siendo relleno sobre la plantilla oficial, con 90 de 97 partes del zip idénticas byte a byte. El maestro no toca el motor de generación, solo de dónde saca las coordenadas.

---

## 7. Riesgos

- **R1. Mover una celda de `GLOBAL` rompe entre 46 y 64 fórmulas** de la plantilla. *Mitigación:* que el maestro no permita mover direcciones en la primera versión, o que reescriba las referencias y lo avise.
- **R2. Una configuración mal guardada produce un documento incorrecto en silencio**, que es peor que un error visible. *Mitigación:* vista previa obligatoria antes de publicar.
- **R3. Sin versionado, un formato emitido hace tres meses deja de ser reproducible.** *Mitigación:* la fase 4 no es opcional.
- **R4. Expectativa.** Si se espera poder rediseñar el formato (mover columnas, añadir secciones), el maestro no hace eso. *Mitigación:* cerrarlo en la fase 0.
- **R5. Quien edite necesita entender coordenadas de hoja.** Sin el inspector de la fase 2 el maestro es inutilizable para alguien que no sea desarrollador, lo que anula su razón de ser.

---

## 8. Recomendación

Hacer **las capas A y B completas, con inspector y vista previa** (fases 0 a 4). La capa C, solo acotada a lo que el plan ya pedía (ATS e inducción). La capa D, no.

## 9. Preguntas abiertas

Tres preguntas que cambian el alcance y hay que responder en la fase 0:

1. **¿Quién va a editar esto?** ¿Un administrador de Cosmos o el cliente final? Si es el cliente, la fase 2 crece bastante.
2. **¿Se espera cambiar el diseño del formato, o solo qué dato va en cada sitio?** Es la diferencia entre 11 días y otro producto.
3. **¿Cada cuánto cambian de verdad las plantillas?** Si es una o dos veces al año, quizá salga más a cuenta el proceso actual con unas HU-12 a HU-16 acotadas. Si es cada mes, el maestro se paga solo.

---

## Anexo. Cómo se obtuvieron los números

Todas las cifras salen de abrir los `.xlsx` de `cosmos-back/templates` y contar sobre su XML, y de leer `format-templates.config.ts`. No hay estimaciones a ojo en la sección 1, la 3 ni la 6.

- Celdas, fórmulas, rótulos, estilos e imágenes: recuento sobre las partes del zip de cada plantilla.
- Fórmulas que leen de `GLOBAL`: búsqueda de referencias `GLOBAL!$?[A-Z]+$?[0-9]+` dentro de cada `<f>`.
- Partes idénticas byte a byte: comparación del zip de la plantilla contra el zip emitido.
- Consumidores de la configuración: búsqueda de importaciones de `format-templates.config` en `cosmos-back/src`.
