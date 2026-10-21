# Plan: formatos editables, con numeración propia y tres salidas

**Fecha:** 2 de septiembre de 2026
**Antecedente:** [INFORME_FORMATOS_V2.md](INFORME_FORMATOS_V2.md) (25/08/2026), fases 0 y 1 ya en `main`
**Decisiones tomadas:** maquetación propia aprobada; editable = la **definición**, en un maestro; numeración = **serie propia por tipo de documento**

---

## 1. Qué se construye

Tres cosas, en este orden, porque cada una necesita la anterior:

1. **Numeración.** Cada documento lleva su correlativo (`ATS-2026-0042`), con series independientes y dependencias declaradas entre documentos. Es lo que hoy no existe: sólo el permiso de trabajo tiene serie, y el N.º de ATS es el código de nombrada de Visma.
2. **Motor v2 completo.** El modelo de documento (ya existe) más los dos renderizadores que faltan: Excel por ExcelJS y JSON para la vista de impresión. El PDF sale del Excel por `soffice`, como hoy.
3. **Maestro editable.** La definición vive en Mongo, versionada, y se edita en pantalla: renombrar, ocultar, reordenar, anchos, filas de checklist, orígenes. Publicar no despliega.

Lo que **no** entra: añadir un origen de dato nuevo o un tipo de sección nuevo. Eso es código, y así queda documentado en la pantalla.

---

## 2. Numeración

### 2.1 El problema actual

| Documento | N.º que imprime hoy | De dónde sale |
|---|---|---|
| ATS | `N° ATS` | `GLOBAL!B18`, que es el **código de nombrada** de Visma |
| Permiso de trabajo (PTS) | `N° PERMISO` (`T6`) | Serie `workPermit`, correlativo global sin prefijo ni año |
| Pie del PTS (`Z63`) | `N° PERMISO` | Fórmula `=T6`. En v2 no hay fórmulas |
| Charla, Asistencia, Inspección, Inglés | ninguno | — |

Tres defectos: el ATS no tiene numeración propia (reusa un código ajeno que no controla la plataforma), el PTS numera sin prefijo ni año (el correlativo 42 de 2026 y el de 2027 son el mismo número), y la dependencia del pie es una fórmula de Excel que desaparece al generar.

### 2.2 El modelo de numeración

Una **serie** por tipo de documento, declarada en la definición:

```
serie:  { id: 'ats', prefix: 'ATS', scope: 'year', pad: 4 }
        → ATS-2026-0042
```

- `scope: 'year'` reinicia el contador cada año; `scope: 'global'` no lo reinicia nunca.
- `pad` son los dígitos del correlativo.

Y un **origen de numeración** por documento, que es donde entra la dependencia:

| Origen | Significado |
|---|---|
| `own` | Consume su propia serie |
| `inherit: <documentId>` | Usa el número que ya tiene otro documento de la misma nombrada |
| `namedCode` | El código de nombrada, para conservar el comportamiento actual del ATS si se quiere |

`inherit` es lo que sustituye a la fórmula `Z63 = T6`: el pie del permiso no consume número, hereda el de su cabecera. Y sirve igual para el caso general de que dos documentos de la misma jornada deban compartir correlativo.

### 2.3 Garantías

Las mismas tres que ya da `ensureWorkPermitNumber`, generalizadas:

1. **Atómico.** El reparto es un `$inc` sobre un documento de `counters`, con clave `serie:año`.
2. **Idempotente.** Se guarda `(staffTransmissionId, seriesId) → número`. Reemitir el formato reimprime el mismo número, que es lo que espera quien lo firmó.
3. **Único.** Índice único sobre `(seriesId, year, seq)`. Si algo se escapa de las dos anteriores, la escritura falla y se reintenta con otro número.

Y una cuarta que hoy no hace falta pero aquí sí: **sin ciclos**. `inherit` se resuelve con detección de ciclos antes de emitir; una definición con `A hereda de B` y `B hereda de A` no se puede publicar.

### 2.4 Compatibilidad

La nombrada que ya tiene `workPermitNumber` asignado conserva **ese** número: la serie `pts` lo adopta como su valor en vez de consumir uno nuevo. Sin esto, un permiso ya firmado cambiaría de número al reemitirlo.

---

## 3. Piezas

### Backend

| Pieza | Qué es | Estado |
|---|---|---|
| `common/numbering/document-number.entity.ts` | `(staffTransmissionId, seriesId) → número`, con índice único | Nueva |
| `common/numbering/document-number.service.ts` | Reparto atómico, idempotente, por serie y año | Nueva |
| `format/v2/numbering.ts` | Series declaradas, resolución de `inherit`, detección de ciclos | Nueva |
| `format/v2/document-model.ts` | Añade `numbering` al documento y `numeroDocumento` a los orígenes | Tocada |
| `format/v2/document.builder.ts` | Resuelve los números y los inyecta en los campos | Tocada |
| `format/v2/a4-grid.ts` | La rejilla A4 compartida por los dos renderizadores | Nueva |
| `format/v2/xlsx.renderer.ts` | Modelo a libro ExcelJS: rejilla, imágenes, área de impresión | Nueva |
| `format/v2/format-v2.engine.ts` | Implementa `FormatEngine`: Excel, PDF y documento JSON | Nueva |
| `format/definitions/format-definition.entity.ts` | La definición en Mongo, versionada | Nueva |
| `format/definitions/format-definition.service.ts` | Borrador, publicar, revertir, historial, siembra desde código | Nueva |
| `format/definitions/format-definition.validator.ts` | Valida contra los catálogos cerrados antes de publicar | Nueva |
| `format/definitions/format-definition.controller.ts` | API del maestro | Nueva |
| `format/format.controller.ts` | Añade `GET /format/:id/document` | Tocada |

### Frontend

| Pieza | Qué es |
|---|---|
| `modules/formats/format-print/` | Pinta el `ResolvedFormat` con `@page A4`, e imprime. Es también la vista previa del maestro |
| `modules/formats/format-master/` | Listado, editor por documento y sección, catálogos, publicar y revertir |
| `named-detail` | Botón "Ver e imprimir" junto a los tres que ya hay |

HTML y CSS nativos, sin PrimeNG. La vista de impresión no puede llevarlo: los estilos de una librería de componentes son justo lo que estropea una hoja impresa.

---

## 4. Pruebas

| Prueba | Qué protege |
|---|---|
| Numeración: idempotencia, concurrencia, corte de año, `inherit`, ciclos, compatibilidad con `workPermitNumber` | Que un permiso firmado no cambie de número |
| Cobertura de rótulos: los textos del `.xlsx` original ⊆ los del documento generado | Que no se pierda un dato al transcribir (R2 del informe) |
| Validación de definiciones: orígenes y transformaciones fuera de catálogo, `inherit` a un documento inexistente, ciclos | Que el maestro no pueda publicar algo que rompa la emisión |
| Renderizador: el libro abre, la rejilla coincide con la declarada, las páginas son las que dice el modelo | Que el Excel no salga corrupto |
| Conmutación: `FORMAT_ENGINE=legacy` sigue byte a byte igual | Que lo que hay en producción no se mueva |

---

## 5. Estado

Todo lo del apartado 3 está implementado y con pruebas.

| Paso | Estado | Pruebas |
|---|---|---|
| Numeración: entidad, servicio, series, dependencias | hecho | 38 |
| `numeroDocumento` en el modelo y en el constructor | hecho | cubierto por las de arriba |
| Rejilla A4 y renderizador XLSX | hecho | 18 |
| Motor v2 y endpoint `/document` | hecho | regresión del legacy intacta |
| Definiciones en Mongo, validación, versionado y API del maestro | hecho | 26 |
| Vista de impresión | hecho | 15 |
| Pantalla del maestro | hecho | 27 |
| Cobertura de rótulos | hecho | 9 |

**Backend:** 198 pruebas en 15 suites, incluidas la regresión y la integridad de paquete del motor legacy, que siguen pasando sin cambios.
**Frontend:** 89 pruebas en verde. Los 23 fallos restantes son specs generados por el CLI, ajenos a este trabajo.

Documentos con definición escrita y cobertura verificada contra el `.xlsx`: **asistencia, charla e inglés**. Faltan ATS, permiso de trabajo e inspección de nave, que son transcripción con revisión del cliente, no código.

### Conmutación

```env
FORMAT_ENGINE=legacy   # por defecto: rellena la plantilla del cliente
FORMAT_ENGINE=v2       # genera el documento desde el modelo
```

---

## 6. Frontera honesta

- Los seis documentos y sus diez variantes son **817 rótulos** que hay que transcribir y revisar con el cliente. El extractor de la fase 0 (`npm run format:inspect`) ya los tiene inventariados con su posición; convertirlos en definiciones revisadas es trabajo de transcripción con ciclos de revisión, no de código. Este plan entrega el motor, la numeración, el maestro y las tres salidas funcionando con las definiciones que existan; ir añadiendo documentos es después usar el maestro.
- Identidad píxel a píxel entre las tres salidas no se promete. El PDF sale del Excel, así que **PDF y Excel son idénticos por construcción**; la vista de impresión del navegador comparte la retícula y los cortes de página declarados en el modelo, pero puede desviarse en el renderizado fino.


---

## 7. Segunda vuelta: cuatro documentos, contenido completo y edición total

### 7.1 Alcance: cuatro documentos por tipo

| # | Documento | Hoja en ETHANOL | en GRANEL | en MERCADERÍA |
|---|---|---|---|---|
| 1 | Asistencia | `PD03-R97 ASIST.` | `ASISTENCIA` | `ASISTENCIA` |
| 2 | Charla | `CHARLA` | `CHARLA` | `CHARLA` |
| 3 | PTS | `SS01-F167. PTS` | `SS01-F167. PTS` | `SS01-F167. PTS` |
| 4 | ATS | `ATS ETHANOL` | `ATS GRANEL` | `ATS MERCADERIA` |

El `id` es común a las tres plantillas (`asistencia`, `charla`, `pts`, `ats`): es lo que guarda la numeración y lo que referencia el maestro. Si dependiera del nombre de la hoja, el ATS de granel y el de ethanol serían series distintas sin motivo.

**Hojas descartadas**, cada una con su motivo en el código y comprobado por prueba: `GLOBAL`, `GENERAL`, `VESSEL INSPECTION`, `INGLÉS`, `SS01-F167. PTS (3C)` y `ATS DESPACHO`. Ninguna puede desaparecer en silencio: la prueba falla si una hoja de la plantilla no está emitida ni declarada como descartada.

### 7.2 Los dos defectos de visualización

| Defecto | Causa | Arreglo |
|---|---|---|
| Las imágenes no aparecían | La URL era relativa (`/static/...`) y la pedía el servidor que sirve el frontend, no el backend | Se construye contra el origen de la API, recortando el prefijo `/api/v1` |
| Campos cortados | Alturas de fila fijas: un rótulo más largo que su celda se salía y se solapaba | `minmax(Xmm, auto)` en HTML; en Excel la altura se deja automática con `wrapText` |

El Excel **sí** llevaba las imágenes desde el principio (35 de 35 en el permiso de trabajo); el fallo era solo de la vista en pantalla.

### 7.3 Edición completa

| Operación | Secciones | Campos | Columnas | Elementos de lista | Firmas | Celdas preimpresas |
|---|---|---|---|---|---|---|
| Añadir | sí, por tipo | sí | sí | sí | sí | sí |
| Eliminar | sí | sí | sí | sí | sí | sí |
| Ocultar | sí | sí | — | — | — | sí |
| Reordenar | sí | sí | sí | sí | — | — |
| Editar | título | etiqueta, origen, transformación, literal | etiqueta, origen, ancho | etiqueta | etiqueta, origen | texto |
| Duplicar | sí | — | — | — | — | — |

Una sección nueva nace con el elemento mínimo que exige el validador: una sección vacía no se puede publicar, y dejar al usuario delante de algo que no puede guardar sin adivinar qué le falta es peor que crearlo por él.

Las celdas del bloque preimpreso se filtran por texto: un ATS tiene 242 y un permiso 323, y sin filtro la pantalla no se puede usar.
