# Formatos v2: generar en vez de rellenar

**Fecha:** 25 de agosto de 2026
**Ámbito:** `cosmos-back/src/modules/format`, un motor nuevo en paralelo, y una pantalla nueva en `cosmos-front`
**Estado:** análisis de factibilidad. No se ha implementado nada.
**Antecedente:** [INFORME_MAESTRO_FORMATOS.md](INFORME_MAESTRO_FORMATOS.md), del 24/08/2026

---

## 1. Veredicto

Es factible, y además resuelve el problema que dejó abierto el informe anterior. Pero no es el mismo proyecto: aquel eran 11 a 16 días para configurar dónde va cada dato dentro del `.xlsx` del cliente; esto es **26 a 40 días** porque deja de usarse el `.xlsx` del cliente como soporte y se pasa a emitir un documento propio.

Tres cosas hay que decir antes del plan:

1. **Lo que se gana es real.** Al no haber un `.xlsx` que respetar, la capa que el informe anterior descartó por inviable (mover columnas, añadir secciones, rediseñar) pasa a ser barata. Y desaparece el riesgo R1 completo: ya no hay 46 a 64 fórmulas de plantilla que se rompan al mover una celda.
2. **Lo que cuesta también es real, y está en un sitio poco intuitivo.** No está en el motor: está en transcribir los 817 rótulos y volver a maquetar seis documentos, con revisión del cliente de por medio.
3. **Hay un riesgo que no es técnico y que puede matar el proyecto entero.** Los formatos llevan códigos de documento controlado (`PD03-R97`, `SS01-F167`). Son formatos registrados en el sistema de calidad del cliente. Rediseñarlos significa emitir un documento que ya no es el aprobado. Antes de escribir una línea hay que confirmar con SSOMA o calidad del cliente que aceptan un formato con otra maquetación, o el trabajo se entrega y no se puede usar. Está desarrollado en la sección 9.

Recomendación: **sí, pero con la sección 9 respondida por escrito antes de la fase 1**, y ejecutando en el orden del plan de la sección 10, que deja el motor funcionando antes de tocar la pantalla de configuración.

---

## 2. Qué cambia respecto al informe anterior

El informe del 24/08 separaba el problema en cuatro capas y concluía que la capa D no se podía hacer.

| Capa | Con el motor actual (rellenar) | Con el motor nuevo (generar) |
|---|---|---|
| A. Mapeo (dónde va cada dato) | Factible. Coordenadas contra el `.xlsx` | **Desaparece.** No hay coordenadas, hay campos con nombre |
| B. Semántica (qué dato, con qué transformación) | Factible con catálogo cerrado | Igual de factible, y sin el corsé de los anchos fijos |
| C. Contenido (los 817 rótulos) | Factible por partes; hay que bautizarlos uno a uno | **Obligatorio y completo.** Es la mayor partida de trabajo |
| D. Estructura (añadir columnas, mover bloques) | No recomendable. Es otro producto | **Factible y barato.** Es editar el modelo |

La capa C deja de ser opcional. Hoy los rótulos viven dentro del `.xlsx` y viajan gratis; si generamos el documento, hay que tenerlos todos en el modelo o el formato sale incompleto. Ese es el intercambio central de esta propuesta: **se paga la capa C entera para que la capa D salga casi gratis.**

Y dos riesgos del informe anterior se apagan solos:

- **R1** (mover una celda de `GLOBAL` rompe entre 46 y 64 fórmulas): no aplica. Las fórmulas se sustituyen por cálculo en TypeScript.
- **R5** (quien edite necesita entender coordenadas de hoja): no aplica. El maestro edita campos con nombre, no celdas.

---

## 3. Inventario medido: qué hay que volver a construir

Todos los números salen de abrir los tres `.xlsx` de `cosmos-back/templates` y contar sobre su XML.

### 3.1 Documentos, no plantillas

Las tres plantillas no son tres documentos distintos: son seis documentos con variantes. Medido por solapamiento de rótulos entre hojas:

| Documento | Variantes | Rótulos por hoja | Solapamiento entre variantes |
|---|---|---|---|
| Asistencia | 3 (Ethanol, Granel, Mercadería) | 35 / 62 / 82 | 49% a 64% |
| Charla | 1 | 48 a 52 | 94% |
| ATS | 4 (Ethanol, Granel, Mercadería, Despacho) | 203 a 225 | 72% a 82% |
| Permiso de trabajo (PTS) | 1, en dos instancias por libro | 214 | **100%, idéntico** |
| Vessel Inspection | 2 | 90 / 103 | 71% |
| Inglés | 1 | 17 | 100% |
| GENERAL | hoja de listas, no se imprime | 59 a 65 | - |

**Rótulos distintos en el conjunto de las tres plantillas: 817.** De esos, 622 aparecen en las tres, 73 en dos y 122 en una sola. Es decir: el corpus real que hay que transcribir es de unos 700 textos únicos, no de 2.100.

Se transcribe con un extractor automático (leer el XML, sacar cada celda con texto y su posición), y luego se revisa a mano. La extracción no es el trabajo; la revisión sí.

### 3.2 Dos hojas que hoy nadie ha declarado

`format-templates.config.ts` declara 18 bloques de personal. No declara estas dos, porque hoy se rellenan solas por fórmula desde `GLOBAL`:

- **VESSEL INSPECTION**: 90 a 103 rótulos, área de impresión propia (`B1:M113`), 7 fórmulas, 2 logos. Se imprime.
- **GENERAL**: hoja de listas para los desplegables. No se imprime, pero contiene nombres de personal **escritos a mano dentro del `.xlsx`** (supervisores, jefes de cubierta, muelles, turnos). Es una copia estancada del maestro real. Con el motor nuevo esa hoja desaparece y los desplegables salen de Mongo, lo cual arregla de paso una inconsistencia que hoy existe.

Cualquier estimación que solo cuente los 18 bloques declarados se queda corta. Son 20.

### 3.3 Las fórmulas no son un problema

| | Ethanol | Granel | Mercadería |
|---|---|---|---|
| Fórmulas totales | 79 | 161 | 241 |
| Que leen de `GLOBAL` (son propagación, no cálculo) | 46 | 58 | 64 |
| Funciones distintas usadas | `IF`, `MID` | `IF`, `MID` | `IF`, `MID`, `COUNTIF` |

Tres funciones en total, y ninguna con lógica de negocio no trivial. Reimplementarlas en TypeScript es cuestión de horas, no de días. Esto es un dato favorable importante: la lógica del formato es superficial, todo el peso está en la maquetación.

### 3.4 Las imágenes

| | |
|---|---|
| Ficheros de imagen por plantilla | 39 a 40 |
| **Distintas en el conjunto de las tres** | **41** |
| Peso único | 2,88 MB |
| Compartidas por las tres plantillas | 38 de 41 |

Dónde están y qué son, medido por su ancla y su tamaño:

| Hoja | Imágenes | Qué son |
|---|---|---|
| SS01-F167. PTS | 34 | 28 pictogramas de EPP y riesgo de 25 a 55 px en una rejilla en las filas 14 a 16, 5 diagramas mayores de 78 a 133 px en las filas 33 a 80, y el logo de cabecera |
| CHARLA | 7 | 6 casillas de verificación de 20 a 25 px y el logo |
| VESSEL INSPECTION | 2 | Logo repetido en la cabecera de cada página |
| Asistencia | 2 | Logo de cabecera y un sello o firma al pie |
| ATS e Inglés | 1 cada una | Logo de cabecera |

Conclusión operativa: **41 imágenes, una sola biblioteca de recursos.** No es un problema, es un inventario pequeño. Además hay margen de optimización obvio: la mayor pesa 736 KB para imprimirse a unos 100 px de ancho.

Detalle a no pasar por alto: los pictogramas del PTS y las casillas de la charla **no son decoración, son contenido normativo**. Si el formato nuevo no los lleva, omite datos. Van al modelo como elementos de primera clase, no como fondo.

---

## 4. Arquitectura propuesta

### 4.1 El modelo de documento es el único original

```
                     ┌─────────────────────────┐
   Datos (Mongo,     │   FormatDataService     │  ya existe, hay que extraerlo
   Visma, marcajes) →│   (recolección pura)    │  de format.service.ts
                     └───────────┬─────────────┘
                                 │  DocumentData
                     ┌───────────▼─────────────┐
   Definición del    │   DocumentBuilder       │  aplica la definición a los datos
   formato (Mongo) → │   → DocumentModel JSON  │  y produce el documento resuelto
                     └───────────┬─────────────┘
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │ Renderer HTML  │ │ Renderer XLSX  │ │ Renderer PDF   │
     │ (front: vista  │ │ (un libro con  │ │ (soffice sobre │
     │  e impresión)  │ │  una hoja por  │ │  el XLSX, ya   │
     │                │ │  documento)    │ │  instalado)    │
     └────────────────┘ └────────────────┘ └────────────────┘
```

Por qué así y no con HTML como original: si el HTML fuera el maestro, el Excel saldría de convertir HTML a celdas, que es exactamente el tipo de conversión que produce libros sucios e ineditables. Con el modelo como maestro, cada renderizador emite lo idiomático de su medio y **ninguno puede omitir un dato que el otro sí lleve**, porque los dos leen la misma lista de secciones.

### 4.2 El modelo, en concreto

Un documento es una lista de secciones. Cinco tipos de sección cubren los seis documentos medidos:

- `header`: logo, código de documento, versión, título, y la rejilla de campos de cabecera (nave, fecha, muelle, turno).
- `fields`: rejilla de etiqueta y valor de N columnas. Es lo que hoy son las 18 celdas de `GLOBAL` propagadas.
- `table`: columnas declaradas, filas de datos, y política de paginación. Es la lista de personal, la matriz de riesgos del ATS, el checklist de inspección.
- `checklist`: filas con etiqueta, pictograma opcional y casilla. Es la sección de EPP del PTS y las casillas de la charla.
- `signatures`: bloque de firmas al pie.

Cada campo del modelo lleva: `id` estable, `label`, `source` (de dónde sale el dato: un catálogo cerrado de orígenes), `transform` (catálogo cerrado: `horaHHmm`, `fechaLarga`, `numeroJornada`, `etiquetaTurno`, ...), `visible`, `orden` y `ancho`. Eso es lo que hace que en el maestro se pueda **agregar, quitar y editar** un campo sin tocar código.

Nada de texto libre en `source` ni en `transform`. El informe anterior ya avisó por qué: el primer error de dedo rompe el formato en silencio.

### 4.3 La rejilla compartida: por qué esta vez sí se parecen

Aquí está la ventaja concreta de generar en vez de rellenar, y conviene decirla con precisión.

Se define **una rejilla A4 única** (por ejemplo 24 columnas de ancho fijo en milímetros, con altura de fila también en milímetros) que usan los dos renderizadores: el HTML la aplica como `grid-template-columns` en milímetros, y el XLSX la aplica como anchos de columna convertidos a la unidad de Excel. Misma rejilla, mismos márgenes, misma tipografía (las fuentes ya se copian a la imagen en el `Dockerfile`).

El resultado: el Excel y la impresión salen con la misma retícula, no solo con los mismos datos.

**Lo que no se puede prometer:** identidad pixel a pixel entre los tres. Una hoja de cálculo y una página HTML son medios distintos, y el PDF sale de uno de los dos. Con la ruta recomendada (PDF por LibreOffice sobre el XLSX) el **PDF y el Excel son idénticos por construcción**, igual que hoy, y la vista de impresión del navegador es la que puede desviarse en algún punto de corte. La alternativa, PDF por Chromium sobre el HTML, invierte cuál es el par idéntico y añade unos 300 MB a la imagen de Docker.

Recomiendo la primera: reutiliza el `soffice` que ya está instalado y en producción, no toca el `Dockerfile`, y mantiene la garantía que hoy da valor (que lo que se imprime es lo que se descarga).

### 4.4 Los tres modos de salida

| Salida | Cómo | Endpoint |
|---|---|---|
| Excel, un libro con todos los formatos | Renderer XLSX sobre el modelo, una hoja por documento | `GET /format/v2/:id` (mismo contrato que hoy) |
| PDF | `soffice` sobre ese mismo libro, como hoy | `GET /format/v2/:id/pdf` |
| Vista de impresión nativa | El front pide el modelo en JSON y lo pinta con CSS `@media print` y `@page A4`. Luego `window.print()` | `GET /format/v2/:id/document` |

La vista de impresión no es una pantalla más: es también **la vista previa del maestro**, y eso es lo que hace que configurar sea barato de verificar. Se edita un campo y se ve el documento entero al instante, sin generar ni descargar nada.

---

## 5. Convivencia: el conmutador del `.env`

Requisito explícito: lo actual no se pierde y se conmuta por variable de entorno.

```env
# legacy = rellenar la plantilla .xlsx del cliente (comportamiento actual, por defecto)
# v2     = generar el documento desde el modelo
FORMAT_ENGINE=legacy

# Permite forzar el motor por petición con ?engine=v2, solo para pruebas y solo a admin.
FORMAT_ENGINE_ALLOW_OVERRIDE=false
```

Cómo se implementa sin ensuciar lo que ya funciona:

- `FormatService` actual **no se toca en su lógica de relleno**. Se le extrae la recolección de datos a `FormatDataService`, que es un movimiento de código con los 510 renglones de `format.service.spec.ts` como red de seguridad.
- El motor nuevo vive en `src/modules/format/engines/v2/`, sin importar nada de `xlsx-patcher.ts` ni de `format-templates.config.ts`.
- Un `FormatEngineResolver` de unas 30 líneas lee la variable y devuelve el motor. El controlador no cambia de forma: los endpoints de hoy siguen respondiendo lo mismo, con los mismos cabeceros `X-Format-*`.
- Los endpoints nuevos (`/document`, y la descarga por libro suelto si se decide) solo existen para v2 y devuelven 404 con `FORMAT_ENGINE=legacy`.

Con `FORMAT_ENGINE=legacy` el sistema queda **byte a byte como hoy**. Eso es verificable en CI: una prueba que genera con `legacy` y compara el zip resultante contra un fichero de referencia.

### Aislamiento respecto a los demás módulos

El módulo `format` importa hoy de `named`, `employee`, `entry` y `point`, y **nadie importa de `format`** salvo su propio controlador. Comprobado en el código. El motor nuevo consume exactamente los mismos servicios a través de `FormatDataService`, así que no añade ni una dependencia nueva hacia otro módulo.

El único punto de contacto fuera del módulo es `namedRecordService.addGeneratedFormat`, donde se anota el formato emitido. Ahí hay que añadir dos campos opcionales (`engine` y `definitionVersion`) para poder saber con qué se generó cada documento. Campos opcionales en un subdocumento existente: no rompe lectura de registros antiguos.

---

## 6. El maestro editable, ahora que es barato

Con el modelo de documento, "agregar, quitar o editar cada campo" se descompone así:

| Operación | Coste | Cuándo estaría |
|---|---|---|
| Renombrar la etiqueta de un campo | Trivial | Fase 5 |
| Ocultar o mostrar un campo | Trivial | Fase 5 |
| Reordenar campos dentro de una sección | Trivial | Fase 5 |
| Cambiar el ancho de una columna | Trivial | Fase 5 |
| Cambiar qué dato alimenta un campo | Barato, con catálogo cerrado de orígenes | Fase 5 |
| Añadir un campo nuevo a una sección existente | Barato si el dato ya está en el catálogo de orígenes | Fase 5 |
| Añadir una fila a un checklist o a la matriz de riesgos | Barato | Fase 5 |
| Añadir una **sección** nueva a un documento | Medio | Fase 5 |
| Añadir un **origen de dato** que hoy no se recolecta | Requiere tocar `FormatDataService`. Es código | No es maestro |
| Añadir un tipo de sección nuevo | Requiere tocar los tres renderizadores. Es código | No es maestro |

Las dos últimas filas son la frontera honesta del maestro. Todo lo demás se edita en pantalla y se publica sin desplegar.

Versionado: cada definición publicada guarda versión, y cada formato emitido anota con qué versión salió. Sin eso, un formato de hace tres meses deja de ser reproducible, que era el R3 del informe anterior y sigue vigente aquí.

---

## 7. Qué hay que construir, por pieza

### Backend

| Pieza | Qué es | Nueva o tocada |
|---|---|---|
| `FormatDataService` | Recolección de nombrada, personal, marcajes y responsables. Sale de `format.service.ts` | Extraída |
| `FormatEngineResolver` | Lee `FORMAT_ENGINE` y elige motor | Nueva, ~30 líneas |
| `FormatDefinition` (Mongo) | La definición del documento, versionada | Nueva |
| `DocumentBuilder` | Definición + datos = modelo resuelto | Nueva |
| `XlsxRenderer` | Modelo a libro, con imágenes y rejilla compartida | Nueva |
| Biblioteca de recursos | Las 41 imágenes extraídas, servidas desde S3 (ya configurado) o estáticas | Nueva |
| Endpoints v2 | `/document`, y descarga por libro si se decide | Nuevos |
| `FormatService` (legacy) | Relleno sobre plantilla | **Sin cambios de lógica** |
| `xlsx-patcher.ts` | Escritura sobre el zip | **Sin cambios** |
| `pdf.service.ts` | Conversión por `soffice` | **Sin cambios**, lo reutiliza v2 |

Sobre `XlsxRenderer` y una decisión que ahorra días: el informe anterior descartó ExcelJS, con razón, porque **reescribir** el `.xlsx` del cliente con ExcelJS revienta y pierde elementos. Pero **crear un libro nuevo desde cero** con ExcelJS no tiene ninguno de esos problemas: no hay ida y vuelta, no hay validación `F16:XFD16` que codificar, no hay 1.500 combinaciones ajenas que preservar. ExcelJS soporta imágenes, combinaciones, anchos, áreas de impresión y escalas, que es todo lo que necesita el renderizador. Escribir a mano el XML de `drawing`, `styles` y `sheet` sería reinventar una librería madura por un motivo que aquí no aplica. Recomiendo ExcelJS **solo dentro del motor v2**; `xlsx-patcher` se queda intacto para el motor legacy.

### Frontend

| Pieza | Qué es |
|---|---|
| Vista de impresión | Componente que pinta el modelo con CSS `@media print` y `@page A4`. Es también la vista previa del maestro |
| Maestro de formatos | Listado de definiciones, editor por documento y sección, catálogo de orígenes, publicar y revertir |
| Botones en la ficha de nombrada | Se añade "Imprimir en pantalla" junto a los tres que ya hay. El resto no cambia |

Ambas piezas en HTML y CSS nativos, sin PrimeNG, según la directriz del proyecto. La vista de impresión además no puede llevar PrimeNG: los estilos de una librería de componentes son justo lo que estropea una hoja impresa.

---

## 8. Lo que hay que decidir antes de empezar

Cinco preguntas. Las tres primeras cambian el plan, las dos últimas cambian el alcance.

1. **¿El cliente acepta un formato con otra maquetación?** Ver sección 9. Es bloqueante.
2. **"Descargar en excel todos los formatos en libros":** ¿un libro por nombrada con una hoja por documento, que es lo que hace hoy? ¿O además poder bajar un documento suelto? ¿O un ZIP con varias nombradas de golpe? Asumo lo primero más lo segundo salvo que se diga otra cosa.
3. **¿La vista de impresión debe salir idéntica al PDF, o basta con que lleve los mismos datos y la misma retícula?** Si tiene que ser idéntica, hay que meter Chromium en la imagen y el PDF pasa a salir del HTML. Ver 4.3.
4. **¿Quién edita el maestro?** Administrador de Cosmos o cliente final. Si es el cliente, la pantalla de la fase 5 crece.
5. **¿Se migran los formatos ya emitidos?** Mi recomendación es no: quedan con su motor anotado y se siguen pudiendo reemitir en legacy.

---

## 9. Riesgos

**R1. Documento controlado. Es el riesgo grave.**
`PD03-R97` y `SS01-F167` son códigos de formato del sistema de calidad. Un formato de asistencia, un ATS y un permiso de trabajo son registros que se auditan y que la autoridad portuaria o el cliente pueden exigir en su versión aprobada. Emitir el mismo contenido con otra maquetación puede significar que el registro no valga.
*Mitigación:* confirmación por escrito de SSOMA o calidad del cliente antes de la fase 1. Si la respuesta es que no, el proyecto se reduce al maestro del informe anterior sobre el `.xlsx` oficial, que sigue siendo la opción segura. Si es que sí, conviene que sea el cliente quien registre el formato nuevo con su propio código y versión, y que ese código salga impreso en la cabecera desde el modelo.

**R2. Omitir un dato al transcribir.**
817 rótulos, seis documentos, cuatro variantes de ATS. Un rótulo que se pierda no da error: sale un formato que parece correcto y no lo es.
*Mitigación:* prueba automática de cobertura. Extraer todos los textos del `.xlsx` original, extraer todos los textos del documento generado y fallar la compilación si el segundo no cubre al primero. Es una prueba de una tarde y es la única red de seguridad real que existe aquí.

**R3. El PDF y la impresión del navegador no cortan las páginas igual.**
*Mitigación:* la decisión 3 de la sección 8, y en cualquier caso declarar la paginación en el modelo (`filas por página` por tabla) en vez de dejarla al motor de cada medio.

**R4. Deriva entre los dos motores.**
Con dos motores vivos, un cambio en la recolección de datos puede arreglar uno y romper el otro.
*Mitigación:* la recolección es una sola (`FormatDataService`) y tiene sus propias pruebas. Lo que se bifurca es solo el renderizado.

**R5. La estimación de la fase 4 depende del cliente, no de nosotros.**
Re-maquetar seis documentos son ciclos de revisión. Seis a diez días es la horquilla si hay un interlocutor que responde en el día. Si la revisión tarda una semana por vuelta, el calendario se va al doble sin que cambie el trabajo.
*Mitigación:* que la fase 4 empiece con un solo documento (Inglés, 17 rótulos) para calibrar el ciclo de revisión antes de comprometer el resto.

**R6. Las plantillas siguen pesando 9,2 MB en la imagen.**
Mientras exista el motor legacy hay que seguir llevándolas. No es un problema nuevo, pero conviene no dar por hecho que v2 lo resuelve: solo lo resuelve el día que se apague legacy.

---

## 10. Plan por fases

| Fase | Trabajo | Entregable verificable | Estimación |
|---|---|---|---|
| 0 | Respuesta a la sección 8, en especial R1. Extractor automático de rótulos, posiciones e imágenes de los tres `.xlsx` | Inventario de 817 rótulos y 41 imágenes en JSON, revisado | 2 a 3 d |
| 1 | `FormatDataService` extraído, `FormatEngineResolver`, esquema `FormatDefinition`, `DocumentBuilder` | Con `FORMAT_ENGINE=legacy` todo sigue byte a byte igual, con prueba en CI que lo demuestra | 3 a 4 d |
| 2 | Renderer HTML y vista de impresión en el front, sobre un documento (Inglés) | Se imprime desde el navegador un formato completo | 4 a 5 d |
| 3 | Renderer XLSX con rejilla compartida e imágenes, y PDF por `soffice` | El mismo documento sale en Excel, en PDF y en pantalla con la misma retícula | 5 a 7 d |
| 4 | Re-maquetación de los seis documentos y sus diez variantes, con la prueba de cobertura de rótulos | Los tres tipos de formato completos en los tres modos de salida | 6 a 10 d |
| 5 | Maestro de formatos: pantalla, catálogo de orígenes y transformaciones, vista previa, publicar y revertir | Editar un campo y publicar sin desplegar | 6 a 9 d |
| 6 | Versionado y trazabilidad, biblioteca de imágenes a S3, documentación del conmutador, prueba de conmutación en los dos sentidos | Conmutar `FORMAT_ENGINE` en caliente y saber con qué versión salió cada formato emitido | 2 a 3 d |

**Total: 28 a 41 días.** Sin la fase 5 (maestro editable, que es separable y podría ir después), **22 a 32 días**.

Punto de corte útil: al terminar la fase 4 ya está todo lo que pide el enunciado menos la edición por pantalla, y el sistema es conmutable. La fase 5 se puede negociar por separado con el resultado de la 4 delante.

### Relación con lo ya planificado

Este plan **sustituye** al de `INFORME_MAESTRO_FORMATOS.md`, no se suma. Y absorbe igualmente las HU-12 a HU-16 de `PLAN_CAMBIOS.md` (maestro de PT, maestro de ATS, versionamiento de inducción), que dentro del modelo de documento son filas de un `checklist` y de una `table`, no desarrollos aparte.

Hay que elegir uno de los dos informes. Hacer los dos es pagar dos veces por el mismo problema.

---

## 11. Recomendación

Hacer las fases 0 a 4 (motor nuevo, conmutable, con los seis documentos completos y las tres salidas), y decidir la fase 5 al final de la 4.

Condición previa innegociable: la respuesta del cliente sobre el documento controlado. Si esa respuesta es negativa, la recomendación cambia por completo y pasa a ser el plan del informe anterior.

---

## Anexo. Cómo se obtuvieron los números

Todas las cifras de las secciones 3 y 5 salen de abrir los `.xlsx` de `cosmos-back/templates` y contar sobre su XML, y de leer el código de `cosmos-back/src/modules/format` y `cosmos-front/src/app/modules/entries`. No hay estimaciones a ojo en la sección 3.

- Rótulos distintos y solapamiento entre hojas: conjunto de cadenas de `sharedStrings.xml` referenciadas por celdas con `t="s"` en cada hoja, e índice de Jaccard entre esos conjuntos.
- Imágenes distintas: SHA-1 del contenido de cada parte `xl/media/*` de las tres plantillas.
- Anclas y tamaños de imagen: `xdr:from` y `a:ext` de cada `xdr:pic` en las partes `xl/drawings/drawing*.xml`, convertidos de EMU a píxeles.
- Fórmulas y funciones: contenido de cada `<f>` por hoja, y recuento de identificadores seguidos de paréntesis.
- Aislamiento del módulo: búsqueda de importaciones de `format.service`, `format-templates.config` y `xlsx-patcher` en `cosmos-back/src` y de llamadas a `/format` en `cosmos-front/src`.
