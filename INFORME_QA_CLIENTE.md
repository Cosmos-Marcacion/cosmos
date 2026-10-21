# Informe de QA - Cosmos CheckIn

**Fecha:** 24/09/2026
**Alcance:** panel de administracion (web), aplicacion movil de marcacion (Android) y API.
**Estado final:** todos los errores encontrados estan corregidos y las pruebas automaticas pasan en los tres componentes.

## 1. Resumen

Se revisaron todos los modulos del panel, todos los flujos de la app y los servicios de la API. Se encontraron y corrigieron **49 errores**: 13 en el panel, 22 en la app y 14 en la API. Tambien se reforzo la seguridad de la plataforma.

| Componente | Errores corregidos | Pruebas automaticas |
| --- | --- | --- |
| Panel web | 13 | 404 de 404 correctas |
| App movil | 22 | 133 de 133 correctas |
| API | 14 | 1358 de 1358 correctas |

La app se entrega en la version **1.0.5**.

## 2. Metodo

- Revision de cada pantalla contra el servicio de la API que usa: rutas, campos y validaciones.
- Casos limite en cada flujo: listas vacias, fallos de red, datos de otro dia, doble pulsacion, sesion caducada.
- Pruebas automaticas nuevas para cada correccion, ademas de las existentes.
- Compilacion de produccion del panel y de la app.
- Verificacion de las credenciales del servidor de correo de recuperacion de contrasena.

## 3. Marcacion por documento (app)

Se corrigio el caso en que, al ingresar el DNI, la pantalla quedaba vacia.

| Caso | Antes | Ahora |
| --- | --- | --- |
| DNI no registrado | Aviso "No encontramos a nadie con el documento..." | Sin cambios, funcionaba |
| Persona registrada pero fuera de la nombrada de hoy | Pantalla sin puntos y sin explicacion | Mensaje "El empleado no está nombrado para hoy" y boton para volver |
| Sin puntos de marcacion configurados | Pantalla a medio cargar | Mensaje explicativo |
| Fallo de conexion al cargar los puntos | Pantalla a medio cargar | Mensaje con boton Reintentar |
| Escaneo del DNI con la camara | No encontraba a la persona | Busca el documento; si no esta registrado lo indica y permite escanear de nuevo |
| Escaneo del codigo generado por el panel | Funcionaba | Sin cambios |

## 4. Recuperacion de contrasena (panel)

El flujo funciona de punta a punta. Se corrigio un error: si el correo se escribia con mayusculas distintas a las registradas (por ejemplo `Ana@...` frente a `ana@...`), el sistema respondia "correo no registrado" y tampoco permitia iniciar sesion. Ahora el correo no distingue mayusculas.

| Punto revisado | Resultado |
| --- | --- |
| Servidor de correo | Credenciales correctas |
| Correo no registrado | Se informa y el flujo se detiene |
| Espera entre envios | 60 segundos, con cuenta atras |
| Vigencia del codigo | 10 minutos |
| Intentos con codigo equivocado | Maximo 5; despues se anula el codigo |
| Nueva contrasena | 8 o mas caracteres, con letra y numero |
| Correo con otras mayusculas | Corregido |

## 5. Panel web

| Modulo | Error encontrado | Correccion |
| --- | --- | --- |
| Inicio de sesion | Una contrasena incorrecta mostraba "Tu sesión ha caducado"; una sesion caducada no se limpiaba | Mensaje correcto y cierre de sesion completo |
| Perfiles | Se podia borrar un perfil con usuarios asignados, que quedaban sin poder entrar; se borraba sin confirmar | La API lo impide y el panel pide confirmacion |
| Marcaciones: edicion | Editar una marcacion fallaba siempre | Corregido |
| Marcaciones: alta | Al cambiar fecha o turno se conservaban la nombrada y el empleado anteriores; doble guardado; avisos confundidos | Se limpian los datos, se evita el doble guardado y cada aviso dice lo suyo |
| Marcaciones: listado | El filtro solo aplicaba a la pagina visible, el total no cuadraba y el Excel exportaba una sola pagina; "hoy" salia como mañana despues de las 19:00 | Filtro en el servidor, Excel completo, hora de Lima |
| Panel de control | El Excel no se descargaba con mas de 100 000 filas | Limite aplicado y aviso en pantalla |
| Nombradas y formatos | Los fallos de descarga mostraban un texto tecnico; los textos listaban solo 3 tipos de nave | Se muestra el motivo real; se listan los 5 tipos (ET, GR, ME, CO, BB) |
| Impresion de formatos | Ante cualquier error pedia revisar el personal | Muestra el motivo real |
| Sincronizacion de empleados | El CSV salia con tildes y Ñ corruptas en Excel | Corregido |
| Usuarios | Correo e imagen solo se rechazaban al guardar | Se validan al escribir y al elegir la imagen |
| Puertos, puntos y usuarios | Al paginar se perdia la busqueda; paginas vacias tras borrar | Corregido |
| Detalle por trabajador | La hora guardada daba fecha invalida en Safari | Corregido |

## 6. App movil

| Flujo | Error encontrado | Correccion |
| --- | --- | --- |
| Marcacion por DNI y por escaner | Ver seccion 3 | Corregido |
| Charlas: alta | Crear una charla siempre daba error | Corregido |
| Charlas: edicion | Se perdia el turno guardado; se podian guardar datos de otro dia | Corregido |
| Charlas: listado | "Ver más" no cargaba mas charlas; la fecha por defecto era la de mañana despues de las 19:00 | Corregido |
| Charlas: exportacion a Excel | No generaba el archivo; fallaba si el entrenador estaba borrado; sin firma desde el septimo asistente; cargo fijo "Operario" | Corregido; el cargo sale de la nombrada |
| Asistentes | Desmarcar podia quitar al asistente de otra charla; "Seleccionar todos" duplicaba asistentes | Corregido |
| Detalle de empleado y formularios de charla | La pantalla quedaba vacia hasta tocarla | Corregido |
| Registro de huella | No confirmaba ni volvia a la ficha; tras un fallo el boton quedaba bloqueado | Corregido |
| Registro facial | Se enviaba dos o tres veces | Corregido |
| Marcacion facial | Decia "Marcación registrada" antes de marcar; dos personas con el mismo nombre se confundian | Mensaje correcto; identificacion por ficha |
| Firma | El trazo quedaba desplazado del dedo; se podia guardar en blanco o dos veces | Corregido |
| Buscadores | Dejaban de funcionar tras un fallo de red | Corregido |
| Registro de empleado | Doble toque en Guardar creaba dos altas | Corregido |
| Descarga de formatos | Errores con texto tecnico | Mensaje claro |
| Sesion | Tras caducar se podia volver con "atras"; una sesion guardada dañada dejaba la app en blanco | Corregido |

## 7. API

| Area | Error encontrado | Correccion |
| --- | --- | --- |
| Acceso de la app | La app recibia "sin permiso" al cargar puntos de marcacion y el personal de Visma | Esas consultas admiten el permiso de marcaciones |
| Subida de archivos | Subir y borrar archivos no exigia sesion; el visor de archivos descargaba cualquier direccion | Exige sesion; el visor solo descarga del almacenamiento de la plataforma |
| Huellas | El listado no exigia sesion; los errores mostraban mensajes internos | Exige sesion; mensajes genericos |
| Entrenadores | Alta, edicion y borrado sin sesion | Exige sesion |
| Permisos | Cualquier usuario con sesion podia modificarlos; el alta nunca funcionaba | Solo administradores; alta corregida |
| Nombradas | Una ruta devolvia la credencial del sistema externo a cualquier perfil; habia una ruta de datos de prueba activa; datos sin validar | Credencial solo para super administrador; ruta de prueba retirada; validacion |
| Asistentes | Se podian duplicar; el borrado afectaba a otra charla | Sin duplicados; borrado limitado a la charla |
| Usuarios | Algunas respuestas incluian la contraseña cifrada; la consulta por id nunca encontraba al usuario; editar o borrar uno inexistente respondia "correcto" | Corregido |
| Correo | Login y recuperacion distinguian mayusculas | Ya no las distinguen |
| Empleados | El alta y la edicion aceptaban cualquier campo | Solo los campos previstos, con formato valido |
| Empleados | La ruta del estado de huella y el listado de modelos no se podian alcanzar | Rutas corregidas |
| Marcacion facial | Dos personas con el mismo nombre se confundian | Identificacion por ficha |
| Identificadores | Un identificador o numero mal formado provocaba error del servidor | Responde "dato no valido" o "no encontrado" |
| Generador de codigos | Decia "El empleado se encuentra registrado" cuando no existia | Mensaje corregido |

## 8. Seguridad

Se reforzo la plataforma de forma preventiva:

- **Validacion de datos:** el alta y la edicion de empleados, y el registro de usuarios, solo aceptan los campos previstos y con formato valido (nombres con letras, documento alfanumerico).
- **Politica de seguridad de contenido (CSP)** en el panel: el navegador solo permite comunicarse con la API, el almacenamiento de archivos y Google Fonts. Se verifico con el panel compilado.
- **CORS:** solo se admiten los dominios de Cosmos y sus subdominios.
- **Rutas internas:** el listado de modelos exige sesion de administrador y ninguna ruta de archivos permite salir de su carpeta.
- **Consultas:** los identificadores mal formados responden "no encontrado" en lugar de error del servidor.

## 9. Pruebas automaticas

| Componente | Comprobacion de tipos | Pruebas | Compilacion de produccion |
| --- | --- | --- | --- |
| Panel web | Correcta | 404 de 404 | Correcta |
| App movil | Correcta | 133 de 133 | Correcta |
| API | Correcta | 1358 de 1358 | - |

## 10. Pendiente de verificar en campo

Estas funciones dependen de hardware y se revisaron con pruebas simuladas. Conviene una prueba en el equipo real tras instalar la version 1.0.5:

- Lector de huella (ZKTeco SLK20R).
- Camara: reconocimiento facial y escaneo de DNI.
