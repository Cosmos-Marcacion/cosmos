# Descarga en PDF e impresión de los formatos

Estado a 24/08/2026. **En pausa, a la espera de instalar el convertidor.**

El objetivo es que el formato de una nombrada se pueda descargar en PDF e
imprimir, y que las tres salidas (Excel, PDF y papel) sean idénticas.

## Para retomarlo

Todo el camino está implementado y probado salvo la comprobación visual. Los
botones de **Descargar PDF** e **Imprimir** están ocultos en el frontend porque
sin LibreOffice en el servidor el backend responde 503 y el operador se
encontraría dos botones que no funcionan. El Excel no está afectado.

Para encenderlo, por orden:

1. **Instalar el convertidor donde corra el backend.** En producción ya va en la
   imagen (`Dockerfile`), así que basta con desplegarla. En un Windows de
   desarrollo: `winget install TheDocumentFoundation.LibreOffice` y luego, en
   `.env`, `SOFFICE_BIN=C:\Program Files\LibreOffice\program\soffice.exe`, porque
   el instalador de Windows no lo añade al PATH. Reiniciar el backend.
2. **Comprobar que responde**: `GET /format/pdf/status` devuelve `ok: true` y la
   versión. O ejecutar `npx jest src/modules/format/pdf.integration.spec.ts`, que
   sin convertidor se salta sola y con él convierte un formato de verdad.
3. **Hacer la comparación visual** descrita más abajo, en "Lo que queda". Es lo
   que decide si hacen falta las fuentes con licencia.
4. **Encender los botones**: `pdfEnabled = true` en
   `cosmos-front/src/app/modules/entries/named-detail/named-detail.ts`.

## La idea que lo sostiene

Un solo generador, tres entregas. El PDF no se compone aparte: se convierte el
mismo `.xlsx` que devuelve la descarga en Excel, ya relleno, y lo que se imprime
es ese PDF. No hay dos maquetaciones que puedan divergir, y hay un test que lo
fija (`format.service.spec.ts`, "el PDF sale del mismo libro que la descarga en
Excel"): compara byte a byte el libro que recibe el convertidor con el que se
descarga.

```
FormatService.generate()  ->  .xlsx  ->  descarga Excel
                                 |
                                 +----->  PdfService.fromXlsx()  ->  descarga PDF
                                                                     impresión
```

Renderiza LibreOffice Calc en modo consola. Ninguna librería de Node pagina
estas plantillas: llevan 3 MB de imágenes, 1500 celdas combinadas, áreas de
impresión y una escala de página distinta por hoja. Rehacerlas en HTML para
imprimir sería mantener una segunda versión de cada formato que además nunca
saldría igual, así que se descartó de entrada.

## Lo que se encontró al analizar las plantillas

Cinco obstáculos, cuatro de ellos invisibles hasta comparar página a página.

### 1. Fórmulas con el resultado guardado de la plantilla

El libro trae 161 fórmulas y 130 con el valor de la última vez que el cliente lo
grabó. De ellas cuelgan **todas** las cabeceras impresas: nave, fecha, jornada,
supervisores y N.º de ATS llegan a cada hoja por fórmula desde `GLOBAL`. Excel
las recalcula al abrir porque el libro va marcado con `fullCalcOnLoad`, pero un
convertidor a PDF no tiene por qué hacerle caso, y entonces el PDF sale con los
datos de ejemplo de la plantilla sin avisar de nada.

**Resuelto** en `xlsx-patcher.ts`, `dropCachedFormulaValues`: al serializar se
borra el resultado guardado y se deja solo la fórmula. Sin resultado en caché,
cualquier motor está obligado a calcularla. El `.xlsx` no cambia, porque Excel
iba a recalcular igualmente.

### 2. Fuentes de Office que Debian no tiene

No son marginales; se concentran en las dos hojas más cargadas.

| Hoja | Celdas afectadas |
|---|---|
| CHARLA | 350 en Arial Nova Cond Light |
| ASISTENCIA | 161 en Arial Narrow, 104 en Agency FB |
| PTS | 29 en Verdana |
| ATS | 20 en Wingdings, los glifos de casilla |

**Resuelto a medias**, y a propósito. La imagen instala las libres métricamente
compatibles (Liberation, Carlito, Caladea), que ocupan lo mismo. Agency FB y
Arial Nova Cond Light no tienen equivalente: para esas, `cosmos-back/fonts/`
está preparada para recibir los `.ttf` de una máquina con licencia de Office y
el `Dockerfile` los instala solos. Ver `cosmos-back/fonts/README.md`.

### 3. Hojas ocultas que sí se rellenan

`INGLÉS` está oculta en las tres plantillas y `SS01-F167. PTS (3C)` en GRANEL y
MERCADERÍA, pero el generador escribe personal en ambas. LibreOffice exporta
solo hojas visibles.

**Decisión tomada: no se toca la visibilidad.** Así el PDF sale idéntico a lo
que Excel imprime hoy, que es el criterio. Queda fijado en la prueba de
integración: si algún día se destapa una hoja, la cuenta de páginas cambia y hay
que decidirlo a propósito en vez de descubrirlo impreso.

### 4. Paginación que se comprimía

`ASISTENCIA` y `CHARLA` llevan `fitToPage="1"` sin declarar `fitToHeight`, que
por especificación vale 1. Mientras la hoja cabe en su página original eso es
justo lo que el cliente quiere: la lista entera en una hoja, al 31 % en granel.
Pero al añadir páginas el área de impresión pasa de 83 a 166 filas o más y ese
"una página de alto" las comprime todas en una: la segunda mitad del personal
salía ilegible. Ocurría ya al imprimir el `.xlsx` desde Excel; el PDF solo lo
habría hecho visible.

**Resuelto** en `releaseVerticalFit`, y solo cuando la hoja ha paginado de
verdad, para no alterar la salida de las nombradas que caben, que son la
mayoría. `ASISTENCIA` es de ancho automático, así que al soltar también el alto
no quedaría nada gobernando la escala: ahí se apaga el ajuste y manda el `scale`
que la plantilla trae afinado.

### 5. `INGLÉS` y `GENERAL` no declaran área de impresión

Sin efecto mientras sigan ocultas. Si alguna vez se destapa `INGLÉS`, hay que
darle una o se exportará por rango usado.

## Lo que está hecho

| | Qué | Dónde |
|---|---|---|
| Fase 1 | Independencia del recálculo | `xlsx-patcher.ts`, `dropCachedFormulaValues` |
| Fase 1 | Paginación al añadir páginas | `xlsx-patcher.ts`, `releaseVerticalFit` |
| Fase 2 | Conversión con cola y perfil por invocación | `pdf.service.ts` |
| Fase 2 | `GET /format/:id/pdf` y `GET /format/pdf/status` | `format.controller.ts` |
| Fase 2 | Historial que distingue Excel de PDF | `named-record.entity.ts`, campo `output` |
| Fase 3 | LibreOffice y fuentes en la imagen | `Dockerfile`, `fonts/` |
| Fase 4 | Botones Imprimir, Descargar PDF y Descargar Excel | `named-detail`, ocultos tras `pdfEnabled` |
| Fase 5 | Prueba de conversión real, que se salta sin convertidor | `pdf.integration.spec.ts` |

60 pruebas en verde, `nest build` sin incidencias, build de Angular limpio.

Dos cuidados del servicio de conversión que no son opcionales y conviene no
deshacer: **perfil de LibreOffice por invocación**, porque no admite dos
procesos sobre el mismo y dos descargas simultáneas se pisan; y **límite de
concurrencia** (`PDF_MAX_CONCURRENCY`, 2 por defecto), porque cada conversión
arranca un proceso de unos 200 MB.

Variables de entorno: `SOFFICE_BIN` (por defecto `soffice`), `PDF_TIMEOUT_MS`
(120000) y `PDF_MAX_CONCURRENCY` (2).

## Lo que queda: validación visual

Es lo único pendiente y no se ha podido hacer en el equipo de desarrollo: no hay
Docker instalado y Excel se niega a abrir estas plantillas por automatización
(falla igual con la plantilla original del cliente, así que no dice nada del
generador).

Hay que comparar, página a página, el PDF que produce LibreOffice contra el que
exporta Excel del mismo fichero. Se decide sobre eso si las fuentes libres bastan
o hay que meter las licenciadas.

En una máquina con Docker:

```bash
cd cosmos-back
docker build -t cosmos-back .
docker run --rm cosmos-back npx jest src/modules/format/pdf.integration.spec.ts
```

O directamente sobre el host de despliegue, si ya tiene LibreOffice:

```bash
soffice --headless --convert-to pdf --outdir /tmp muestra.xlsx
```

Hay muestras recién generadas con el código ya corregido en `C:\Marcos\_pdf_spike`:
`GRANEL_12_personas.xlsx` (una página) y `GRANEL_70_personas.xlsx` (cinco
páginas, que es el caso donde se notaba la compresión). Se pueden borrar cuando
sobren.

Qué mirar en la comparación:

1. Que las cabeceras traen los datos de la nombrada y no los de ejemplo de la
   plantilla. Es lo que verifica el punto 1.
2. Que salen las cuatro hojas visibles y ninguna de más.
3. Que en la muestra de 70 personas el personal se reparte en páginas legibles.
4. Que los anchos y saltos de CHARLA y ASISTENCIA coinciden. Aquí es donde se
   verá si hacen falta las fuentes licenciadas.
5. Que las casillas del ATS salen como casillas y no como letras sueltas
   (Wingdings).

## Decisiones que se tomaron por defecto

Todas reversibles y señaladas en el código.

| Decisión | Elección | Cómo revertirla |
|---|---|---|
| Hojas del PDF | Solo las visibles | Destapar la hoja en la plantilla y ajustar la cuenta de páginas del test de integración |
| Fuentes | Libres compatibles, con puerta abierta a las de Office | Dejar los `.ttf` en `cosmos-back/fonts/` y reconstruir |
| Paginación | Corregida en ambas salidas | `releaseVerticalFit`, una llamada en `fillBlock` |
| Entrega | Un único PDF con todas las hojas | |
