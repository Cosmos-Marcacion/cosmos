# La pantalla de formatos: por qué cuesta y cómo debería funcionar

**Fecha:** 2 de septiembre de 2026
**Motivo:** la creación y edición de formatos sigue siendo complicada
**Ámbito:** `cosmos-front/src/app/modules/formats`

---

## 1. Qué falla hoy

La pantalla actual pide entender siete conceptos antes de poder cambiar una palabra:

| Concepto que hay que aprender | Dónde aparece |
|---|---|
| Sección | Lista plegable de tarjetas |
| Tipo de sección (`grid`, `fields`, `table`, `checklist`, `signatures`) | Etiqueta y desplegable |
| Origen (`nave`, `fecha`, `supervisorOperaciones`…) | Desplegable por campo |
| Transformación (`fechaCorta`, `horaInicio`…) | Otro desplegable |
| Celda con fila, columna, `colSpan` y `rowSpan` | Editor de rejilla |
| Anchos en milímetros | Cabecera de columna |
| Serie de numeración, ámbito, dígitos | Tarjeta aparte |

Y hay un problema de fondo más grave que la cantidad: **la pantalla trata el documento como una estructura de datos, no como un documento**. Se navega `formato → documento → sección → elemento`, cuatro niveles, para llegar a un texto que en la hoja está a la vista.

El síntoma medible: cambiar `NAVE:` por `BUQUE:` en el ATS son hoy seis interacciones (elegir tipo, elegir documento, desplegar la sección correcta entre varias, encontrar la casilla entre 242, editarla, guardar). En cualquier editor de documentos son dos: pulsar sobre la palabra y escribir.

---

## 2. Benchmark

Nueve plataformas, agrupadas por el modelo mental que proponen.

### 2.1 Lista de bloques (Google Forms, Typeform, Notion, WordPress Gutenberg)

El documento es una **lista vertical de bloques**. Se inserta con un `+` que aparece entre bloques, se selecciona uno y aparece su barra de herramientas encima; los ajustes finos van a una barra lateral.

- **Lo que hacen muy bien:** no hay coordenadas. Añadir es un gesto en el sitio donde quieres el resultado.
- **Por qué no basta aquí:** un ATS no es una lista lineal. Es una retícula con casillas que se responden al lado de lo que preguntan, y esa relación espacial *es* el documento.

### 2.2 Lienzo con paleta y panel (JotForm, Formstack, Zoho Creator, Power Apps)

Paleta de tipos a la izquierda, lienzo en medio, propiedades a la derecha. Se arrastra un tipo al lienzo.

- **Lo que hacen muy bien:** las tres zonas fijas. Nunca hay que buscar dónde está una opción.
- **Lo que no encaja:** están pensadas para **diseñar** un formulario desde cero. Aquí el diseño ya existe y es del cliente; no se puede tocar.

### 2.3 Campos sobre un documento fijo (DocuSign, PandaDoc, Adobe Acrobat)

Se abre un PDF que no se modifica y se **arrastran campos encima**: aquí va la firma, aquí la fecha, aquí el nombre.

- **Por qué es el modelo correcto para este problema:** los formatos de Cosmos son documentos controlados del cliente, con su código `PD03-R97` y su versión. Los 817 rótulos no se diseñan: vienen dados. Lo único que hay que decidir es **qué casilla se rellena con qué dato**, que es exactamente lo que hace DocuSign.
- **Lo que hay que añadir:** aquí sí se puede cambiar el texto de un rótulo y ocultar cosas, que en DocuSign no.

### 2.4 Lienzo libre con árbol de capas (Webflow, Framer, Retool)

Control total sobre la posición de cada elemento.

- **Por qué se descarta:** es potencia que aquí nadie necesita a cambio de una curva de aprendizaje que nadie va a pagar. Quien edita estos formatos es un administrador de operaciones, no un maquetador.

### 2.5 Resumen

| Plataforma | Modelo | Añadir | Editar texto | Enlazar un dato |
|---|---|---|---|---|
| Google Forms | Lista | `+` entre bloques | En el sitio | — |
| Notion / Gutenberg | Lista | `/` o `+` | En el sitio | — |
| JotForm | Lienzo + paleta | Arrastrar | Panel | Panel |
| PandaDoc / DocuSign | Campos sobre documento | Arrastrar sobre la página | — | **Arrastrar el dato** |
| Webflow | Lienzo libre | Arrastrar | En el sitio | Panel |
| **Cosmos (hoy)** | **Formulario sobre estructura** | **Botón en tabla** | **Campo de una tabla** | **Desplegable** |
| **Cosmos (propuesta)** | **Campos sobre documento** | **`+` en el hueco** | **En el sitio** | **Arrastrar el dato** |

---

## 3. Lo que se decide

**El documento es la pantalla.** Se ve la hoja como saldrá impresa y se edita encima. Desaparecen los cuatro niveles de navegación: quedan las cuatro pestañas de documento y la página.

Tres reglas que ordenan el resto:

1. **Lo que más se hace, en un gesto.** Cambiar un texto: pulsar y escribir. Enlazar un dato: arrastrarlo encima. Ocultar: pulsar y `Supr`.
2. **El vocabulario es el del documento, no el del modelo.** "Casilla", "texto", "dato", "lista de personal". Nunca `colSpan`, `grid` ni `source`.
3. **Lo raro se puede hacer, pero no estorba.** Milímetros, combinaciones y series viven detrás de "Opciones avanzadas". Están, y no se ven.

### 3.1 Las tres zonas

```
┌──────────────────────────────────────────────────────────────────────┐
│  Granel ▾   [Asistencia][Charla][PTS][ATS]      Guardar  Publicar    │
├───────────────┬──────────────────────────────────┬───────────────────┤
│ DATOS         │                                  │  CASILLA          │
│               │      ┌────────────────────────┐  │                   │
│ ⠿ Nave        │      │ ASISTENCIA DE PERSONAL │  │  Texto            │
│ ⠿ Fecha       │      ├──────┬─────────────────┤  │  ┌─────────────┐  │
│ ⠿ Muelle      │      │NAVE: │ ⠿ arrastra aquí │  │  │ NAVE:       │  │
│ ⠿ Turno       │      ├──────┼─────────────────┤  │  └─────────────┘  │
│ ⠿ Jefe de     │      │FECHA:│ Fecha           │  │                   │
│   cubierta    │      └──────┴─────────────────┘  │  [Negrita][Fondo] │
│               │                                  │  [Ocultar][Borrar]│
│ + Añadir      │      · · · + · · ·               │                   │
│               │                                  │  ▸ Avanzado       │
└───────────────┴──────────────────────────────────┴───────────────────┘
```

- **Izquierda: los datos.** Una lista de fichas arrastrables con los nombres que entiende un operador ("Nave", "Jefe de cubierta"), no los del catálogo (`vesselDescription`, `jefeCubierta`). Se arrastra una ficha sobre una casilla y esa casilla pasa a imprimir ese dato.
- **Centro: el documento.** Tal como sale impreso. Se pulsa una casilla y se edita ahí mismo. Los huecos muestran un `+` al pasar por encima.
- **Derecha: la selección.** Vacío mientras no hay nada seleccionado, para no competir con el documento.

### 3.2 Los gestos

| Quiero… | Gesto |
|---|---|
| Cambiar un rótulo | Pulsar la casilla y escribir |
| Que una casilla imprima un dato | Arrastrar la ficha del dato encima |
| Quitar el dato y dejar texto | Pulsar la × de la ficha en la casilla |
| Ocultar algo | Seleccionar y pulsar "Ocultar" |
| Añadir una casilla | Pulsar el `+` del hueco |
| Insertar una fila | `+` en el margen izquierdo, entre filas |
| Cambiar el ancho de una columna | Arrastrar su borde |
| Deshacer | `Ctrl+Z` |

### 3.3 Lo que se quita de la vista

| Antes | Ahora |
|---|---|
| Desplegable de "tipo de sección" | Se deduce; sólo aparece al añadir |
| `colSpan` / `rowSpan` numéricos | Avanzado |
| Anchos en milímetros | Arrastrar el borde; el número, en avanzado |
| Desplegable de "transformación" | Sale de la ficha del dato: "Fecha", "Fecha larga", "Hora de inicio" son fichas distintas |
| Serie, ámbito, dígitos | Una línea: "Numeración: ATS-2026-0001 ▸" |
| Tabla de celdas con fila y columna | Desaparece |

El cambio de las transformaciones es el que más simplifica: en vez de elegir un origen y luego una transformación (dos desplegables y 20 × 11 combinaciones posibles, la mayoría sin sentido), la paleta ofrece **las combinaciones que sí valen**, ya nombradas: "Fecha", "Fecha larga", "Hora de inicio", "Nombre del jefe de cubierta", "Documento del jefe de cubierta".

---

## 4. Riesgos de este rediseño

**R1. Perder potencia por simplificar.** Todo lo que hoy se puede configurar se sigue pudiendo: lo que cambia es dónde vive. Lo comprueban las pruebas del editor, que ejercen cada operación.

**R2. Arrastrar no funciona en táctil.** Toda acción de arrastre tiene su equivalente pulsando: seleccionar la casilla y elegir el dato en el panel derecho.

**R3. Deshacer.** Editar sobre el documento invita a probar. Sin deshacer, probar da miedo. Entra en el alcance.

---

## 5. Qué se construye

| Pieza | Qué es |
|---|---|
| `format-builder` | La pantalla entera: paleta, lienzo y panel |
| `format-canvas` | El documento interactivo, con las cinco clases de sección |
| `field-palette` | Las fichas de datos, ya combinadas con su transformación |
| `builder-history` | Deshacer y rehacer sobre la definición |
| `format-master` | Se queda como envoltorio: tipo, guardar, publicar, historial |

Lo que **no** cambia: el modelo de documento, el motor, la numeración y las tres salidas. Esto es una capa de edición nueva sobre lo que ya está probado.
