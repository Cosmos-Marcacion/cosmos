# Plan: observaciones de la plataforma Check In

Origen: `Observaciones de plataforma Check In.pdf`, pruebas del 16 y 17 de
septiembre de 2026. Ocho observaciones.

Cada punto lleva el diagnóstico contra el código, no la observación repetida.
Donde lo reportado es un síntoma de algo distinto se dice cuál, porque arreglar
el síntoma en esos casos no cambia lo que el cliente ve.

---

## Resumen

| # | Observación | Dónde se arregla | Estado |
|---|---|---|---|
| 1 | Hamburguesa para ocultar la columna de módulos | `cosmos-front` layout | Hecho (`fd39a84`) |
| 2 | La paginación siempre muestra 1 | `cosmos-back` (causa) + `cosmos-front` | Hecho (`b162e40`, `fd39a84`) |
| 3 | El logotipo debe volver a la pantalla principal | `cosmos-front` layout | Hecho (`fd39a84`) |
| 4 | Usuarios en orden alfabético | `cosmos-back` consulta | Hecho (`b162e40`) |
| 5 | Generador sin orden ni búsqueda | `cosmos-front` | Hecho (`721ae0e`) |
| 6 | Formato: ver los campos con más detalle | `cosmos-front` constructor | Hecho (`f7cb349`) |
| 7 | Nombrada: la cabecera fija ocupa demasiado | `cosmos-front` | Hecho (`f7cb349`) |
| 8 | Reducir el alto de los títulos de módulo | `cosmos-front` layout + pantallas | Hecho (`fd39a84`) |

Las ocho cerradas el 17/09/2026. Lo que se encontró por el camino y no estaba
en el informe está al final, en «Hallazgos».

Dos de los ocho puntos (2 y 4) no se pueden cerrar solo en el panel: la causa
está en la API. Los seis restantes son de interfaz.

---

## 1. Plegar la columna de módulos

**Diagnóstico.** En `main-layout.component.html` conviven dos menús: el de
escritorio (`hidden lg:flex`), sin ningún control, y el de móvil
(`lg:hidden`), que sí tiene su hamburguesa. En pantalla grande la columna
ocupa unos 230 px de forma permanente y no hay manera de recuperarlos.

**Cambio.** Barra de iconos: al plegar, la columna baja a ~64 px y deja los
iconos, que siguen navegando. El nombre del módulo pasa a `title`, que ya
está puesto en cada `<li>`. El estado se guarda en `localStorage` para que no
haya que recolocarlo en cada entrada.

El menú tiene hoy nueve `<li>` escritos a mano, cada uno con su SVG en línea:
293 líneas para nueve entradas. Para el modo plegado habría que tocar los
nueve por separado. Se pasan a un arreglo de `{ clave, etiqueta, ruta, icono }`
y un solo `@for`, que es además lo que deja añadir un módulo sin copiar un
bloque de treinta líneas.

**Ficheros**

- `layouts/main-layout/main-layout.component.html` y `.ts`: botón de plegado,
  señal `menuPlegado`, persistencia.
- `layouts/main-layout/components/menu/menu.component.html` y `.ts`: menú
  dirigido por datos, con entrada `compacto`.
- `layouts/main-layout/components/menu/menu.component.scss`: anchos y
  transición.

**Pruebas.** Unitaria del menú: con `compacto` no se pintan las etiquetas y
los enlaces siguen navegando. E2E: plegar, recargar, sigue plegado.

**Riesgo.** Medio. El menú lo ve toda la plataforma y el paso a datos toca las
nueve entradas de golpe. La prueba de humo es que los nueve módulos siguen
navegando y que el resaltado del activo no se pierde.

---

## 2. La paginación siempre muestra 1

**Diagnóstico.** Son dos fallos encadenados y hay que corregir los dos; con uno
solo el cliente sigue viendo lo mismo.

*Causa raíz, en la API.* Todos los listados paginados devuelven el tamaño de la
página, no el número de coincidencias:

```ts
// cosmos-back/src/modules/user/user.service.ts:101
total: users.length,
```

Con límite 10, `total` nunca pasa de 10, así que el panel calcula
`Math.ceil(10 / 10) = 1` página. `countDocuments` no aparece en ningún sitio
del backend. Afecta a once consultas en seis módulos: usuarios (2), puntos (2),
charlas (2), marcaciones (3), puertos (1) y empleados (1).

*Segundo fallo, en el panel.* `Pagination` calcula las páginas una sola vez:

```ts
// components/pagination/pagination.ts:21
ngOnInit() {
  this.totalPages = Array.from({ length: Math.ceil(this.total / this.limit) }, ...)
  if (this.totalPages.length === 0) this.totalPages = [1]
}
```

`total` es una entrada que llega después, cuando responde la API. En
`ngOnInit` todavía vale 0, así que entra por la rama del `[1]` y ahí se queda:
ningún cambio posterior de `total` lo recalcula.

De paso, el texto de resumen dice «Mostrando {{ page }} a {{ limit }} de
{{ total }}»: con la página 2 y límite 10 se lee «Mostrando 2 a 10 de 57», que
no es el rango. Y las flechas de escritorio no se deshabilitan, así que en la
página 1 «Anterior» emite página 0.

**Cambio.**

- API: `countDocuments(query)` junto a la consulta paginada, en paralelo con
  `Promise.all` para no encadenar dos viajes. Los once sitios.
- Panel: `totalPages` pasa a `computed()` sobre `total` y `limit`, de modo que
  se recalcula cuando llega la respuesta. El componente pasa a entradas de
  señal.
- Panel: el resumen imprime el rango real y las flechas se deshabilitan en los
  extremos.

**Ficheros**

- `cosmos-back/src/modules/{user,point,talk,entry,port,employee}/*.service.ts`
- `cosmos-front/src/app/components/pagination/pagination.ts` y `.html`

**Pruebas.** En la API, una prueba por servicio: con 25 documentos y límite 10,
`total` es 25 y `data` trae 10. En el panel, unitaria de `Pagination`: con
`total` a 0 y luego a 57 aparecen 6 páginas; y la página activa se resalta.
E2E sobre usuarios: la paginación muestra más de una página y el número sigue
al usuario.

**Riesgo.** Bajo en el panel. En la API hay que revisar que el filtro de la
cuenta sea el mismo que el de la consulta, incluido el `roleId: { $ne: ... }`
de `findAllExceptSuper`; contar con un filtro distinto al que lista da un total
que no cuadra con lo que se ve.

---

## 3. El logotipo vuelve a la pantalla principal

**Diagnóstico.** El logo es un `<img>` suelto, sin enlace, en los dos menús.

**Cambio.** Envolverlo en un `<button>` que navegue. No a `/panel` fijo: esa
ruta tiene `moduleGuard('panel')` y a un perfil sin ese módulo el guardia le
saca un aviso de error y lo desvía, que es peor que no hacer nada. Se usa
`firstAllowedPath(permissions)`, que ya existe en
`constants/platform-modules.constant.ts` y es lo que usa el propio guardia.

En el menú móvil, además, cierra el menú al navegar.

**Ficheros**

- `layouts/main-layout/main-layout.component.html` y `.ts`

**Pruebas.** Unitaria: pulsar el logo navega a la primera ruta permitida; con
un perfil sin `panel`, a la suya. E2E: desde Usuarios, pulsar el logo lleva al
panel.

**Riesgo.** Bajo.

---

## 4. Usuarios en orden alfabético

**Diagnóstico.** `findByPagination` y `findAllExceptSuper` no llevan `.sort()`.
Mongo devuelve lo que encuentra, que es orden de inserción.

El orden tiene que ir en la consulta, no en el panel: la lista se pagina en
servidor y ordenar los diez registros de la página daría diez nombres
ordenados entre sí, pero la página 2 podría empezar por la A otra vez. Sería
un orden falso, más confuso que ninguno.

**Cambio.** `.sort({ name: 1 })` con
`.collation({ locale: 'es', strength: 1 })`. La collation es lo que hace que
«Ávila» vaya antes que «Bermúdez» y no detrás de «Zamora», y que las
mayúsculas no partan la lista en dos bloques. Sin ella, Mongo ordena por bytes.

Se aplica el mismo criterio a los otros listados que el cliente lee de un
tirón: puertos por nombre, puntos por nombre.

**Ficheros**

- `cosmos-back/src/modules/user/user.service.ts`
- `cosmos-back/src/modules/{port,point}/*.service.ts`

**Pruebas.** Integración: insertar «Zamora», «Ávila», «bermúdez» y comprobar
que salen en ese orden alfabético.

**Riesgo.** Bajo. La collation exige que el índice, si se añade uno para este
orden, se declare con la misma collation; sin índice Mongo ordena en memoria,
que con el volumen de usuarios de esta plataforma no es problema.

---

## 5. Generador: orden y búsqueda

Cerrado el 17/09/2026 en el commit `721ae0e` de `cosmos-front`.

El `<select>` nativo se sustituyó por un combobox propio
(`components/employee-picker`): orden alfabético por apellido y nombre con
`Intl.Collator('es')`, filtro por palabras sueltas sobre nombre, apellido y
documento en cualquier orden y sin tildes, y teclado completo. Cubierto por
11 pruebas e2e y 16 unitarias.

Queda pendiente decidir si el mismo selector sustituye al desplegable de
empleados en otras pantallas; hoy solo lo usa el generador.

---

## 6. Formato: ver los campos con más detalle

**Diagnóstico.** La rejilla del constructor es fija:

```scss
// modules/formats/builder/format-builder.scss:48
grid-template-columns: 220px minmax(0, 1fr) 260px;
```

480 px se van en los dos paneles laterales —Datos a la izquierda, Detalles a la
derecha— y ninguno se puede cerrar. En un portátil de 1366 px el documento se
queda con poco más de la mitad de la pantalla, y encima se pinta con un `zoom`
manual que arranca siempre igual, sin relación con el ancho que le queda.

**Cambio.**

- Hamburguesa en la cabecera de Datos y en la de Detalles. Al plegar, la
  columna correspondiente pasa a un carril de ~40 px con el botón de reabrir.
  La rejilla deja de ser fija y se calcula desde el estado de los dos paneles.
- Botón de «Ajustar al ancho» junto al control de zoom, que calcula la escala
  desde el ancho disponible del lienzo y el ancho de la página del documento.
  Se recalcula al plegar o desplegar un panel y al cambiar el tamaño de la
  ventana.
- El zoom y el estado de los dos paneles se guardan en `localStorage`.

Con los dos paneles cerrados el documento pasa de ~55% a ~95% del ancho útil.

**Ficheros**

- `modules/formats/builder/format-builder.html`, `.ts` y `.scss`

**Pruebas.** E2E: plegar Datos ensancha el lienzo; «Ajustar al ancho» deja el
documento sin scroll horizontal; recargar conserva el estado. Unitaria del
cálculo de escala.

**Riesgo.** Medio. El lienzo usa `zoom`, que no es lo mismo que `transform:
scale` a efectos de medir: `getBoundingClientRect` ya devuelve la medida
escalada. El cálculo del ajuste tiene que partir del ancho sin escalar o la
escala se realimenta. Hay que comprobar que arrastrar un dato sobre una casilla
sigue soltándolo donde toca con la escala cambiada.

---

## 7. Nombrada: la cabecera fija ocupa demasiado

**Diagnóstico.** `.nd-header` es `position: sticky` y acumula, en vertical:
fila de título con insignias (1.75 rem), lista de ocho datos en dos filas,
fila de acciones con cuatro a seis botones, y debajo seis tarjetas de
indicadores con cifras de 2 rem y barra de progreso. Sumado con el `padding` de
1.125 rem, la cabecera se lleva unos 260 px antes de que empiece lo que no está
fijo, que es justo la lista de personal que se consulta.

**Cambio.** Reducir sin quitar información:

- Título a 1.375 rem y la fila de datos a una sola línea con separadores,
  tipografía de 0.9375 rem.
- Indicadores en tarjetas compactas: cifra a 1.375 rem, etiqueta a 0.6875 rem,
  padding a la mitad. Las seis siguen visibles.
- Fijar solo la fila de título y acciones; los indicadores se desplazan con el
  contenido. Es lo que hace que la lista gane pantalla de verdad, porque lo
  fijo pasa de ~260 px a ~96 px.
- El aviso naranja de «falta configurar» pasa a una línea, sin caja.

**Ficheros**

- `modules/entries/named-detail/named-detail.scss` (principal)
- `modules/entries/named-detail/named-detail.html` (fila de datos)

**Pruebas.** Instantánea visual de la pantalla a 1366x768, que es donde se
reportó. Comprobar que a esa altura entra la cabecera de «Personal y
asistencia» sin desplazar.

**Riesgo.** Bajo. Es CSS. Hay que repasar el corte de móvil, que ya tiene sus
propios ajustes en la línea 852 del `scss`.

---

## 8. Reducir el alto de los títulos de módulo

**Diagnóstico.** Dos cosas suman:

- La cabecera del layout usa `p-4` con un título `text-2xl gilroy-extra-bold`:
  unos 72 px en todas las pantallas.
- Varias pantallas repiten el título dentro del contenido, con su propio
  espaciado: Generador (`px-10 py-5` más `<h1 class="text-xl">`), Detalle de
  empleado, Agregar usuario, Agregar puerto, Agregar punto, Agregar marcación.
  Son dos títulos, uno debajo del otro, diciendo lo mismo.

**Cambio.**

- Cabecera del layout a `px-6 py-3` y título a `text-xl`: de ~72 px a ~52 px.
- Retirar el título repetido de las seis pantallas y su fila contenedora. En
  las de «Agregar» el título distingue alta de edición («Agregar usuario» /
  «Editar usuario»), así que ahí no se borra: pasa al `title` de la ruta, que
  es lo que pinta la cabecera, y la ruta de edición lo resuelve por parámetro.

Entre las dos cosas se recuperan unos 90 px en las pantallas que duplicaban.

**Ficheros**

- `layouts/main-layout/main-layout.component.html`
- `modules/generator/generator.html`
- `modules/entries/view-entries/view-entries.html`
- `modules/{users,ports,points,entries}/add-*/add-*.html`
- `app.routes.ts` para los títulos de alta y edición

**Pruebas.** E2E: la pantalla de alta de usuario dice «Agregar usuario» en la
cabecera y la de edición «Editar usuario». Instantánea visual del panel.

**Riesgo.** Bajo. `getTitle()` lee `route.snapshot.children[0].title`; para
títulos que dependen de un parámetro hay que usar un resolutor o la estrategia
de títulos del router, no el `snapshot`, que no se vuelve a leer.

---

## Orden de ejecución

Tres tandas, cada una verificable por su cuenta.

**Tanda A — API.** Observaciones 2 (causa) y 4. Es lo que hay que desplegar
primero: el arreglo de la paginación en el panel no se nota hasta que la API
devuelve el total de verdad.
Verificación: `npm run qa` en `cosmos-back`.

**Tanda B — layout.** Observaciones 1, 3, 8 y el resto del 2. Todas tocan el
mismo par de ficheros del layout, así que van juntas para no resolver el mismo
conflicto tres veces.
Verificación: `npm run qa` en `cosmos-front`.

**Tanda C — pantallas.** Observaciones 6 y 7. Independientes entre sí y del
resto.
Verificación: `npm run qa` más las instantáneas visuales.

## Verificación

La suite del panel está en verde y sirve de red: 61 e2e, 346 unitarias, tipos y
lint sin regresión. La de la API, 72 suites y 15 de integración. Cada tanda
tiene que dejarlas igual.

Las observaciones 1, 6, 7 y 8 cambian el pixel, así que las instantáneas
visuales van a salir en rojo a propósito. Se aceptan con
`npm run e2e:update-snapshots` y se revisa el diff de las imágenes como
cualquier otro cambio, una vez por tanda y no antes de mirarlas.

## Lo que este plan no cubre

- El selector de empleado del generador no se ha llevado a otras pantallas.
- `findAllExceptSuper` lleva un `ObjectId` de rol escrito en el código
  (`6862b2dd5b6efa7634310d2f`). Es deuda anterior y no la toca ninguna
  observación, pero se cruza con el punto 4 porque entra en el filtro de la
  cuenta.

---

## Hallazgos que no venían en el informe

Aparecieron al implementar y están corregidos en los mismos commits.

1. **Los once sitios eran siete.** De los listados que devolvían `.length`,
   cuatro ya eran correctos: paginan en memoria y cuentan sobre la lista
   completa antes de cortarla. Tocarlos habría roto un total que estaba bien.
   En marcaciones el fallo era otro: se contaban las marcaciones y se listaban
   trabajadores, y cada trabajador deja varias.

2. **Los puntos de marcación no se alfabetizan.** Su `order` es la secuencia
   del recorrido, no un orden de presentación. Solo se les corrigió el total.

3. **`Users.getUsers` reventaba la pantalla entera.** Hacía `user?.role.name`:
   la interrogación estaba solo en `user`, así que una sesión sin perfil
   resuelto lanzaba ahí. El error cae en `ngOnInit` y se lleva por delante la
   pasada de detección, de modo que no se quedaba en blanco esa pantalla: se
   quedaba también el menú lateral.

4. **El resumen de la paginación mentía.** Decía «Mostrando 2 a 10 de 57»
   estando en la página 2, que no es el rango. Y las flechas no se
   deshabilitaban: en la página 1, «Anterior» pedía la página 0.

5. **La suite e2e era inestable por reparto.** Con el defecto de la mitad de
   los núcleos, en un portátil de 20 son diez navegadores arrancando a la vez
   su propia copia de la aplicación: las mismas pruebas que tardan 5 s con dos
   procesos pasaban de 40 con diez y se salían del tope de 30 s. Baja al 25%.

6. **La tolerancia visual del 1% tapa cambios reales.** Sobre una captura de
   1280x720 son unos 9.000 píxeles: las dos hamburguesas y el botón nuevo del
   constructor cabían dentro, así que la prueba seguía en verde con la imagen
   vieja guardada. Se regeneró a la fuerza. La tolerancia se deja como está
   —existe por la interpolación de fuentes entre máquinas—, pero conviene
   saber que un cambio pequeño no la despierta.
