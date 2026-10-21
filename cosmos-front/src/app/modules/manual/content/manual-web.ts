import { ManualArticle } from '../manual.types';

/**
 * Temas del panel web (cosmos-front).
 *
 * Los rótulos entre `**` son los de la pantalla, letra por letra: quien lee
 * tiene que poder buscarlos con la vista. Si cambia un botón, cambia aquí.
 */
export const WEB_ARTICLES: ManualArticle[] = [
  // --- acceso ----------------------------------------------------------------
  {
    id: 'web-ingreso',
    area: 'web',
    title: 'Ingresar y recuperar la contraseña',
    summary: 'Cómo entrar al panel, qué hacer si olvidaste la contraseña y qué reglas debe cumplir.',
    audience: ['Todos'],
    where: '/login',
    keywords: ['login', 'acceso', 'clave', 'olvide', 'codigo', 'restablecer', 'sesion'],
    blocks: [
      { t: 'p', text: 'El panel se abre en el navegador con tu correo y tu contraseña. Si no tienes usuario, pídeselo a un administrador de Cosmos: nadie puede crearse uno solo.' },
      {
        t: 'steps', id: 'web-ingreso-entrar', title: 'Entrar al panel',
        items: [
          'Escribe tu **Correo** y tu **Contraseña**. El icono del ojo muestra lo que escribiste para revisarlo.',
          'Pulsa **Ingresar** o la tecla Enter. Mientras comprueba verás **Cargando...**.',
          'Entras en la primera pantalla a la que tiene acceso tu perfil (normalmente **Panel**).',
        ],
      },
      {
        t: 'steps', id: 'web-ingreso-recuperar', title: 'Recuperar la contraseña',
        items: [
          'En la pantalla de ingreso pulsa **¿Olvidaste tu contraseña?**.',
          'Escribe tu **Correo** y pulsa **Enviar Código**. Te llega un correo con un código de 6 dígitos.',
          'Escribe el **Código de 6 dígitos**, la **Nueva Contraseña** y repítela en **Confirmar Contraseña**.',
          'Pulsa **Cambiar Contraseña**. Vuelves a la pantalla de ingreso: entra ya con la nueva.',
        ],
      },
      { t: 'note', tone: 'info', text: 'Si el código no llega, revisa la carpeta de correo no deseado. **Reenviar código** se activa pasados 60 segundos; **Usar otro correo** te deja cambiar la dirección.' },
      { t: 'h', text: 'Reglas de la contraseña' },
      { t: 'list', items: ['Entre 8 y 72 caracteres.', 'Al menos una letra y al menos un número.', 'La ayuda debajo del campo se pone en rojo mientras no se cumple.'] },
      { t: 'h', text: 'Mensajes que puedes ver' },
      {
        t: 'table', head: ['Mensaje', 'Qué significa'],
        rows: [
          ['Correo o contraseña incorrectos...', 'Alguno de los dos datos está mal escrito. Revísalos o recupera la contraseña.'],
          ['No tienes permisos para acceder a este sistema', 'Tu perfil no tiene ninguna pantalla del panel, o es el perfil **User** de las cuentas de la app, que no entra al panel web. Pide a un administrador que revise tu perfil.'],
          ['No se pudo conectar con el servidor...', 'No hay conexión con la plataforma. Revisa tu internet y vuelve a intentarlo.'],
          ['Tu sesión ha caducado. Entra otra vez para continuar.', 'Pasó demasiado tiempo desde que entraste. Vuelve a ingresar; lo guardado no se pierde.'],
          ['Tu perfil no tiene acceso a esta pantalla.', 'Abriste una dirección de un módulo que tu perfil no tiene. Te lleva a la primera pantalla permitida.'],
        ],
      },
      { t: 'related', ids: ['web-perfiles', 'web-usuarios', 'inicio-pantalla'] },
    ],
  },

  // --- panel -----------------------------------------------------------------
  {
    id: 'web-panel',
    area: 'web',
    title: 'Panel de indicadores',
    summary: 'Asistencia, faltas, capacitaciones y nombradas de un rango de fechas, con gráficos y reportes en Excel.',
    audience: ['Administración', 'Jefatura de operaciones'],
    where: '/panel',
    keywords: ['dashboard', 'graficos', 'reporte', 'excel', 'indicadores', 'asistencias', 'tardanzas'],
    blocks: [
      { t: 'p', text: 'Al entrar, el panel ya muestra el día de hoy. Cambia los filtros y pulsa **Buscar** para ver otro periodo: los datos no se actualizan solos al tocar un filtro.' },
      {
        t: 'ui', title: 'Filtros',
        items: [
          { label: 'Nombrada, Navío, Empleado, Cargo', desc: 'Campos con autocompletado: al escribir se despliegan las opciones. Si borras el texto, ese filtro deja de aplicarse.' },
          { label: 'Turno', desc: '**Todos**, **07:00 - 15:00**, **15:00 - 23:00** o **23:00 - 07:00**.' },
          { label: 'Fecha Inicio y Fecha Fin', desc: 'Por defecto, hoy. Si el inicio es posterior al fin, se marcan en rojo y **Buscar** se desactiva.' },
          { label: 'Buscar', desc: 'Consulta con los filtros. También se lanza con Enter en cualquier filtro.' },
          { label: 'Limpiar', desc: 'Quita todos los filtros, vuelve las fechas a hoy y consulta de nuevo.' },
        ],
      },
      { t: 'h', text: 'Qué muestra' },
      {
        t: 'table', head: ['Elemento', 'Contenido'],
        rows: [
          ['Nombradas', 'Ejecutadas y programadas en el periodo.'],
          ['Asistencias de personal', 'Personas que marcaron.'],
          ['Faltas de personal', 'Personas con falta registrada.'],
          ['Capacitaciones', 'Charlas registradas.'],
          ['Gráfico Asistencias', 'Barras por **Día**, **Semana**, **Mes** o **Año** (botones sobre el gráfico).'],
          ['Gráfico Marcaciones', 'Asistencias a tiempo, Tolerancias, Tardanzas, Faltas, Por completar jornada y Por completar remate, con cantidad y porcentaje.'],
          ['Top Posiciones y Turnos', 'Asistencias por cargo y por turno.'],
          ['Detalle de Nombradas', 'Tabla con Fecha, Navío, Turno, Muelle, Número, Personal Nombrado y Asistentes.'],
          ['Asistencias', 'Tabla por persona. La píldora de **Marcaciones** (por ejemplo 1/2: marcaciones sobre el total de puntos) abre sus marcaciones.'],
        ],
      },
      {
        t: 'steps', id: 'web-panel-reporte', title: 'Descargar el reporte de asistencias',
        items: [
          'Ajusta los filtros y el rango de fechas.',
          'Pulsa **Buscar** y espera a que se llenen las tablas.',
          'En la tabla **Asistencias** (o **Detalle de Nombradas**) pulsa **Excel**.',
          'Se descarga el resultado completo, no solo la página que ves (hasta 100 000 filas), con los filtros y los totales en la cabecera.',
        ],
      },
      { t: 'note', tone: 'tip', text: 'En la tabla, la píldora azul intenso indica recorrido completo; azul claro, que falta algún punto; rojo **Falta**, una inasistencia. La insignia **S** indica que ya marcó la salida.' },
      { t: 'related', ids: ['web-marcaciones-trabajador', 'ref-reglas'] },
    ],
  },

  // --- marcaciones ---------------------------------------------------------
  {
    id: 'web-tablero',
    area: 'web',
    title: 'Marcaciones: tablero de nombradas',
    summary: 'Todas las nombradas de un día, su avance de marcación y si están listas para emitir el formato.',
    audience: ['Supervisión', 'Administración'],
    where: '/marcaciones',
    keywords: ['nombradas', 'naves', 'jornada', 'turno', 'tablero', 'formato'],
    blocks: [
      { t: 'p', text: 'Una **nombrada** es la cuadrilla asignada a una nave en una fecha y un turno. Cosmos las envía solas; aquí se revisan y se completan.' },
      {
        t: 'ui', title: 'Arriba',
        items: [
          { label: '◀ y ▶', desc: 'Día anterior y día siguiente.' },
          { label: 'Día de trabajo', desc: 'Elige una fecha concreta.' },
          { label: 'Hoy', desc: 'Vuelve al día de hoy.' },
          { label: 'Turno', desc: 'Muestra todos los turnos o solo uno.' },
          { label: 'Buscar', desc: 'Filtra al momento por nave, número de nombrada o viaje.' },
          { label: 'Resumen', desc: 'Cuántas nombradas hay, cuántas están listas y cuántas tienen marcación.' },
        ],
      },
      {
        t: 'ui', title: 'Cada tarjeta',
        items: [
          { label: 'Nombre de la nave', desc: 'Abre el detalle de la nombrada.' },
          { label: 'Lista / Falta configurar', desc: 'Si ya tiene todo lo que pide el formato o si le falta algo.' },
          { label: 'Marcación de ingreso', desc: 'Cuántos del personal ya marcaron, con barra de avance.' },
          { label: 'Tipo de nave', desc: 'Decide qué formato se emite. Si dice **sin formato**, esa nave no puede emitirlo.' },
          { label: 'Jefe de cubierta y Capacitación', desc: 'Lo asignado o **Sin asignar** / **Sin registrar**.' },
          { label: 'Descargar formato', desc: 'Genera el Excel oficial sin entrar al detalle.' },
        ],
      },
      { t: 'note', tone: 'info', text: 'Al volver desde el detalle, el tablero conserva el día que estabas viendo.' },
      { t: 'related', ids: ['web-nombrada', 'web-emitir-formato', 'ref-reglas'] },
    ],
  },
  {
    id: 'web-nombrada',
    area: 'web',
    title: 'Detalle de una nombrada',
    summary: 'Personal y recorrido de marcaciones, responsables, capacitación y formatos emitidos de una nombrada.',
    audience: ['Supervisión', 'Administración'],
    where: '/marcaciones/nombrada/…',
    keywords: ['responsables', 'jefe de cubierta', 'ssoma', 'supervisor', 'capacitacion', 'charla', 'aprobadores', 'vsi', 'notas', 'personal'],
    blocks: [
      { t: 'p', text: 'Se abre pulsando el nombre de la nave en el tablero. La cabecera muestra los datos de la jornada (nombrada, permiso de trabajo, tipo de nave, fecha, turno, muelle, amarradero, viaje y terminal) y los botones de emisión.' },
      { t: 'h', text: 'Resumen de la jornada' },
      { t: 'p', text: 'Indicadores de personal nombrado, con marcación, recorrido completo, sin marcar, sin registrar (sin ficha en la plataforma) y temas de charla. Si falta algo para emitir, un aviso lo enumera: tipo de nave con formato, jefe de cubierta, supervisor de operaciones, supervisor SSOMA, tipo de capacitación o tema de la charla.' },
      { t: 'h', text: 'Configuración de la jornada' },
      { t: 'p', text: 'Cinco tarjetas. Cada una dice **Listo**, **Falta** (obligatoria) o **Pendiente** (opcional). Al pulsarla se abre una ventana que se cierra con **Hecho**, la **×**, pulsando fuera o con Escape; cerrar no descarta nada.' },
      {
        t: 'table', head: ['Tarjeta', 'Qué se completa', '¿Obligatoria?'],
        rows: [
          ['Formato', 'Solo se consulta: lo decide el tipo de nave que envía Cosmos (ET, GR, ME, CO o BB).', 'Sí'],
          ['Responsables de la jornada', '**Jefe de cubierta**, **Supervisor de operaciones** y **Supervisor SSOMA**, buscados en el maestro de personal.', 'Sí'],
          ['Capacitación', 'Tipo, lugar, horas, Programa Anual, hasta tres temas con su resumen, entrenador y responsable del registro.', 'Sí'],
          ['Aprobadores de la inspección', 'Quienes firman la hoja VSI: aprobador jefe de cubierta y aprobador SSOMA.', 'No'],
          ['Notas internas', 'Observaciones que no salen en el formato.', 'No'],
        ],
      },
      {
        t: 'steps', id: 'web-nombrada-preparar', title: 'Dejar una nombrada lista para emitir',
        items: [
          'Abre **Responsables de la jornada**, busca por nombre o documento y asigna a los tres responsables. Pulsa **Hecho**.',
          'Abre **Capacitación**: elige el **Tipo de capacitación**, el **Lugar** y las horas. El **N.º de horas** se calcula solo (puedes corregirlo).',
          'Escribe al menos un **Tema de la charla** con su **Resumen de lo expuesto** y asigna **Entrenador** y **Responsable del registro**. Pulsa **Hecho**.',
          'Si corresponde, completa **Aprobadores de la inspección** y **Notas internas**.',
          'Pulsa **Guardar cambios**. Verás **Nombrada guardada** y la insignia cambia a **Lista para emitir**.',
        ],
      },
      { t: 'h', text: 'Personal y asistencia' },
      {
        t: 'ui',
        items: [
          { label: 'Buscador', desc: 'Por nombre, documento o cargo.' },
          { label: 'Pestañas', desc: '**Todos**, **Con marcación**, **Sin marcación**, **Recorrido completo** y **Sin registrar**, con el contador de cada una.' },
          { label: 'Recorrido', desc: 'Un punto por cada punto de marcación: relleno si marcó. Al pasar el ratón se ve el punto y la hora.' },
          { label: 'Ingreso y Salida', desc: 'Hora de la primera y de la última marcación.' },
          { label: 'Estado', desc: '**Completo**, **En curso**, **Sin marcar**, **Falta** o **Sin registrar**.' },
          { label: 'Nombre del trabajador', desc: 'Abre sus marcaciones para corregirlas. Si no tiene ficha, no se puede abrir.' },
          { label: 'Ver listado por trabajador', desc: 'Abre el listado de marcaciones con la fecha y el turno ya puestos.' },
        ],
      },
      { t: 'note', tone: 'warn', text: 'Mientras haya cambios sin guardar verás la barra **Tienes cambios sin guardar en esta nombrada.** **Descartar** recarga la nombrada sin preguntar: lo no guardado se pierde.' },
      { t: 'related', ids: ['web-emitir-formato', 'web-marcaciones-trabajador', 'ref-glosario'] },
    ],
  },
  {
    id: 'web-emitir-formato',
    area: 'web',
    title: 'Emitir e imprimir el formato',
    summary: 'Descargar el formato oficial en Excel o PDF, imprimirlo en A4 y consultar lo ya emitido.',
    audience: ['Supervisión', 'Administración'],
    where: '/marcaciones/nombrada/…',
    keywords: ['pts', 'ats', 'permiso de trabajo', 'pdf', 'imprimir', 'excel', 'asistencia', 'charla', 'paginas'],
    blocks: [
      { t: 'p', text: 'El formato reúne en un archivo las hojas oficiales de la jornada: asistencia, charla, ATS, permiso de trabajo (PTS) y demás, con el personal, los responsables y las firmas registradas.' },
      {
        t: 'steps', id: 'web-emitir', title: 'Emitir el formato',
        items: [
          'Comprueba que la nombrada diga **Lista para emitir**. Si no, completa lo que indica el aviso.',
          'Guarda los cambios pendientes: con cambios sin guardar no se emite (**Guarda los cambios antes de emitir el formato**).',
          'Pulsa **Descargar Excel** (o **Descargar PDF**, si está disponible). El PDF es el mismo Excel convertido.',
          'Revisa el aviso: indica cuántas personas y páginas lleva y el número de permiso asignado.',
          'Consulta la tabla **Formatos emitidos**: cada descarga queda registrada con fecha, autor y personal incluido.',
        ],
      },
      {
        t: 'table', head: ['Tipo de nave', 'Formato', 'Hojas'],
        rows: [
          ['ET (Etanol)', 'Ethanol', 'Asistencia, Charla, ATS Ethanol, PTS, Inglés'],
          ['GR (Granel)', 'Granel', 'Asistencia, Charla, ATS Granel, PTS, PTS (3C), Inglés'],
          ['ME (Mercadería)', 'Mercadería general', 'Asistencia, Charla, ATS Mercadería, ATS Despacho, PTS, PTS (3C), Inglés'],
          ['CO (Container)', 'Containero', 'Plantilla ancha de asistencia'],
          ['BB (Big bags)', 'Big bag', 'Plantilla ancha de asistencia'],
          ['Otro o vacío', 'Sin formato', 'No se puede emitir'],
        ],
      },
      {
        t: 'list', items: [
          'El **número de permiso de trabajo (PTS)** se asigna la primera vez que se emite y ya no cambia. El **N.º de ATS** es el número de la nombrada.',
          'Si el personal no cabe en una hoja, se añaden páginas: no se omite a nadie. El aviso lo anticipa antes de emitir.',
          'Cada persona con firma registrada en la app sale con su firma impresa; sin firma, la casilla queda en blanco para firmar a mano.',
        ],
      },
      { t: 'h', text: 'Imprimir sin descargar' },
      { t: 'p', text: '**Imprimir** abre la vista de impresión en hojas A4, sin menú ni cabecera. Arriba puedes mostrar u ocultar cada documento y pulsar **Imprimir** para abrir el diálogo del navegador. Nada de esa barra sale en el papel.' },
      { t: 'note', tone: 'tip', text: 'Para un formato rápido sin abrir el detalle, usa **Descargar formato** en la tarjeta del tablero.' },
      { t: 'related', ids: ['web-nombrada', 'web-maestro', 'app-firma'] },
    ],
  },
  {
    id: 'web-marcaciones-trabajador',
    area: 'web',
    title: 'Marcaciones por trabajador',
    summary: 'Listado de todo el personal de un día con sus marcaciones, filtrable por nave, cargo y turno.',
    audience: ['Supervisión', 'Administración'],
    where: '/marcaciones/listado',
    keywords: ['listado', 'personal', 'remate', 'falta', 'filtro'],
    blocks: [
      { t: 'p', text: 'No está en el menú: se abre desde **Ver listado por trabajador** en el detalle de una nombrada, que ya trae la fecha y el turno.' },
      {
        t: 'ui',
        items: [
          { label: 'Día de trabajo', desc: 'Al cambiarlo se vuelve a consultar.' },
          { label: 'Buscar, Navío, Cargo, Turno', desc: 'Filtros sobre el personal del día.' },
          { label: 'Agregar', desc: 'Registra una marcación a mano.' },
          { label: 'Marcaciones', desc: 'La píldora (por ejemplo 1/2: marcaciones sobre el total de puntos) abre las marcaciones de esa persona para corregirlas.' },
          { label: 'Remate', desc: '**Si** o **No**.' },
          { label: 'DESCARGAR FORMATOS POR NOMBRADA', desc: 'Lleva al tablero, que es donde se emiten los formatos.' },
        ],
      },
      { t: 'related', ids: ['web-agregar-marcacion', 'web-corregir-marcacion'] },
    ],
  },
  {
    id: 'web-agregar-marcacion',
    area: 'web',
    title: 'Registrar una marcación a mano',
    summary: 'Crear una marcación cuando la persona no pudo marcar con la app.',
    audience: ['Supervisión', 'Administración'],
    where: '/marcaciones/agregar',
    keywords: ['manual', 'olvido', 'motivo', 'accidente', 'enfermedad', 'permiso'],
    blocks: [
      { t: 'p', text: 'El formulario se va abriendo paso a paso: cada campo depende del anterior.' },
      {
        t: 'steps', id: 'web-agregar-marcacion', title: 'Agregar la marcación',
        items: [
          'En **Marcaciones por trabajador** pulsa **Agregar**.',
          'Elige la **Fecha de trabajo**. Si ese día no hay nombradas, lo dice y no se puede seguir.',
          'Elige el **Turno** y la **Hora** de la marcación.',
          'Elige la **Nombrada** (se ve como id, número y nave) y el **Empleado** de esa nombrada.',
          'Elige el **Punto de marcación** y, si hace falta, un **Motivo**: Accidente, Enfermedad, Permiso u Otros.',
          'Pulsa **GUARDAR**. Verás **Marcación creada correctamente**.',
        ],
      },
      { t: 'note', tone: 'info', text: 'Al cambiar la fecha se borran el turno, la nombrada y el empleado elegidos, para no mezclar datos de otro día.' },
      { t: 'related', ids: ['web-corregir-marcacion', 'app-punto'] },
    ],
  },
  {
    id: 'web-corregir-marcacion',
    area: 'web',
    title: 'Corregir o eliminar una marcación',
    summary: 'Ver las marcaciones de una persona, cambiar el punto, la fecha, la hora o el motivo, registrar un punto que falta o eliminar una marcación equivocada.',
    audience: ['Supervisión', 'Administración'],
    where: '/marcaciones/ver/…',
    keywords: ['editar hora', 'editar marcación', 'corregir', 'falta salida', 'borrar', 'error', 'detalle de empleado'],
    blocks: [
      { t: 'p', text: 'Se abre pulsando la píldora de **Marcaciones** en el Panel o en el listado por trabajador, o el nombre de la persona en el detalle de la nombrada. Arriba se ve el trabajador, su DNI, la jornada, el turno y la nave.' },
      {
        t: 'ui',
        items: [
          { label: 'Tabla', desc: 'Punto, Fecha, Hora y Motivo (**Normal** si no tiene), en orden de hora.' },
          { label: 'Editar', desc: 'La fila se vuelve editable: elige el punto, la fecha, la hora o el motivo y pulsa **Guardar**, o **Cancelar** para dejarla como estaba.' },
          { label: 'Eliminar', desc: 'Pide confirmación antes de borrar.' },
          { label: 'Puntos sin marcar', desc: 'Lista los puntos que le faltan al trabajador en esa jornada. **Registrar …** abre una fila nueva con ese punto; escribe la hora y pulsa **Guardar**.' },
          { label: 'Agregar marcación', desc: 'Abre una fila nueva para registrar cualquier punto en esta jornada.' },
          { label: 'Regresar', desc: 'Vuelve a la pantalla desde la que entraste.' },
        ],
      },
      { t: 'note', tone: 'info', text: 'En el turno de noche la salida suele ser del día siguiente: cambia la **Fecha** de la fila además de la hora.' },
      { t: 'note', tone: 'warn', text: 'Eliminar una marcación no se puede deshacer. Si solo está mal la hora o el punto, usa **Editar**.' },
      { t: 'related', ids: ['web-agregar-marcacion'] },
    ],
  },

  // --- administración ---------------------------------------------------------
  {
    id: 'web-usuarios',
    area: 'web',
    title: 'Usuarios',
    summary: 'Quién puede entrar al panel y a la app, con qué correo y con qué perfil.',
    audience: ['Administración'],
    where: '/usuarios',
    keywords: ['alta', 'crear usuario', 'rol', 'acceso', 'eliminar usuario', 'contraseña'],
    blocks: [
      {
        t: 'steps', id: 'web-usuario-crear', title: 'Crear un usuario',
        items: [
          'En **Usuarios** pulsa **Agregar**.',
          'Si quieres, sube una **Imagen de usuario** (JPG, PNG o GIF, hasta 5 MB).',
          'Escribe el **Nombre** completo (desde 3 letras) y el **Correo electrónico**.',
          'Escribe una **Contraseña** de 8 caracteres o más con al menos una letra y un número.',
          'Elige el **Rol** (el perfil) y pulsa **GUARDAR**.',
          'Comunica a la persona su correo y su contraseña; podrá cambiarla con **¿Olvidaste tu contraseña?**.',
        ],
      },
      {
        t: 'list', items: [
          'Para editar pulsa el lápiz: se cambian nombre, rol e imagen. El correo no se puede cambiar y la contraseña no se edita aquí.',
          'Para eliminar pulsa la papelera y confirma. No puedes eliminar tu propio usuario.',
          'El buscador filtra por nombre o correo mientras escribes.',
          '**Excel** descarga la página visible del listado.',
        ],
      },
      { t: 'note', tone: 'info', text: 'Los usuarios con perfil **Super** solo los ve otro usuario **Super**.' },
      { t: 'related', ids: ['web-perfiles', 'web-ingreso'] },
    ],
  },
  {
    id: 'web-perfiles',
    area: 'web',
    title: 'Perfiles y permisos',
    summary: 'Qué pantallas puede abrir cada perfil.',
    audience: ['Administración'],
    where: '/perfiles',
    keywords: ['rol', 'permisos', 'modulos', 'acceso', 'seguridad'],
    blocks: [
      { t: 'p', text: 'Un perfil es una lista de pantallas. Quien lo tiene ve en el menú solo esas pantallas y no puede abrir las demás aunque escriba su dirección.' },
      {
        t: 'table', head: ['Pantalla', 'Permite'],
        rows: [
          ['Panel', 'Indicadores de asistencia por nave, turno y fecha.'],
          ['Marcaciones', 'Nombradas, personal, capacitación del turno, emisión e impresión de formatos, marcaciones manuales.'],
          ['Usuarios', 'Altas y bajas de quien entra a la plataforma, y su perfil.'],
          ['Perfiles', 'Qué puede abrir cada perfil. Quien tenga esto puede darse cualquier otro permiso.'],
          ['Puertos', 'Maestro de puertos y terminales.'],
          ['Puntos de marcación', 'Los puntos donde el personal marca y sus tolerancias.'],
          ['Formatos', 'El maestro de formatos: qué lleva cada documento y cómo se numera.'],
          ['Generador', 'Códigos QR y de barras para el personal.'],
          ['Sincronizar empleados', 'Traer el maestro de personal desde Visma.'],
        ],
      },
      {
        t: 'steps', id: 'web-perfil-crear', title: 'Crear un perfil',
        items: [
          'Pulsa **Nuevo perfil**.',
          'Escribe el **Nombre** y, en **Para qué sirve**, una línea que lo explique.',
          'Marca las **Pantallas a las que entra** (o usa **Todas** / **Ninguna**).',
          'Deja marcada **El perfil se puede asignar a usuarios** para que aparezca al crear usuarios.',
          'Pulsa **Guardar perfil**.',
        ],
      },
      { t: 'note', tone: 'warn', text: 'Si te quitas a ti mismo el acceso a **Perfiles** y nadie más lo tiene, no podrás deshacerlo desde la plataforma. Los cambios de un perfil se aplican cuando la persona vuelve a ingresar.' },
      { t: 'note', tone: 'info', text: 'Un perfil con usuarios asignados no se puede eliminar. Tu propio perfil no muestra el botón **Eliminar**.' },
      { t: 'note', tone: 'info', text: 'Para entrar al panel web un perfil necesita al menos una pantalla. **Admin** y **Super** entran siempre; **User** es el perfil de las cuentas de la app y no entra al panel aunque tenga pantallas.' },
      { t: 'related', ids: ['web-usuarios'] },
    ],
  },
  {
    id: 'web-puertos',
    area: 'web',
    title: 'Puertos',
    summary: 'El maestro de puertos y terminales donde se opera.',
    audience: ['Administración'],
    where: '/puertos',
    keywords: ['terminal', 'sede', 'direccion'],
    blocks: [
      {
        t: 'steps', id: 'web-puerto-crear', title: 'Agregar un puerto',
        items: [
          'En **Puertos** pulsa **Agregar**.',
          'Escribe el **Nombre** (letras, números, espacios y . , - / ( ) #; hasta 100 caracteres) y la **Dirección**.',
          'Pulsa **GUARDAR**.',
        ],
      },
      { t: 'p', text: 'El lápiz edita y la papelera elimina (con confirmación). **Excel** descarga el listado.' },
      { t: 'related', ids: ['web-puntos'] },
    ],
  },
  {
    id: 'web-puntos',
    area: 'web',
    title: 'Puntos de marcación',
    summary: 'Los lugares donde el personal marca (ingreso, salida, etc.), su orden y sus tolerancias.',
    audience: ['Administración'],
    where: '/puntos',
    keywords: ['tolerancia', 'depende de', 'ingreso', 'salida', 'orden', 'tardanza'],
    blocks: [
      { t: 'p', text: 'Los puntos son los botones que ve el trabajador al marcar en la app. Cada puerto tiene los suyos.' },
      {
        t: 'ui', title: 'Campos del punto',
        items: [
          { label: 'Puerto', desc: 'A qué puerto pertenece. Obligatorio.' },
          { label: 'Nombre', desc: 'Lo que verá el trabajador en el botón.' },
          { label: 'Depende de', desc: 'Un punto del mismo puerto que debe marcarse antes. Opcional.' },
          { label: 'Tolerancia anterior y siguiente (minutos)', desc: 'Margen antes y después de la hora prevista. Número entero de 0 a 240.' },
        ],
      },
      {
        t: 'steps', id: 'web-punto-crear', title: 'Agregar un punto',
        items: [
          'En **Puntos de marcación** elige el **Puerto** y pulsa **Agregar**.',
          'Escribe el **Nombre** y, si corresponde, elige de qué punto **Depende de**.',
          'Indica las tolerancias en minutos y pulsa **GUARDAR**.',
        ],
      },
      { t: 'note', tone: 'info', text: 'Si no hay puertos, primero crea uno en **Puertos**.' },
      { t: 'related', ids: ['web-puertos', 'app-punto'] },
    ],
  },

  // --- formatos ----------------------------------------------------------------
  {
    id: 'web-maestro',
    area: 'web',
    title: 'Maestro de formatos',
    summary: 'Editar qué lleva cada documento de un formato, guardarlo como borrador y publicarlo como versión.',
    audience: ['Administración'],
    where: '/formatos/maestro',
    keywords: ['plantilla', 'borrador', 'publicar', 'version', 'documento', 'editor', 'ats', 'pts'],
    blocks: [
      { t: 'p', text: 'Cada tipo de formato (Granel, Ethanol, Mercadería general, etc.) tiene sus documentos en pestañas. Lo **publicado** es lo que se usa al emitir; lo que editas es un **borrador** hasta que lo publicas.' },
      {
        t: 'ui', title: 'Barra superior',
        items: [
          { label: 'Tipo de formato', desc: 'Desplegable con la versión publicada y la marca **borrador** si hay uno guardado.' },
          { label: 'Pestañas', desc: 'Un documento por pestaña.' },
          { label: 'Guardar', desc: 'Guarda el borrador. No publica nada.' },
          { label: 'Publicar', desc: 'Convierte el borrador en una versión nueva. Se desactiva si hay problemas por corregir.' },
          { label: 'Historial', desc: 'Versiones publicadas y qué cambió en cada una.' },
          { label: 'Ajustes', desc: 'Numeración del documento, añadir bloque, descartar el borrador y restaurar de fábrica.' },
        ],
      },
      {
        t: 'steps', id: 'web-maestro-publicar', title: 'Cambiar un documento y publicarlo',
        items: [
          'Elige el tipo de formato y la pestaña del documento.',
          'Haz los cambios en el editor (ver **Editor del documento**).',
          'Pulsa **Guardar**. Verás **Borrador guardado.**',
          'Si aparece la lista de problemas, pulsa cada uno para ir al sitio y corregirlo; luego vuelve a guardar.',
          'Opcional: en **Historial**, despliega **Borrador sin publicar** para revisar qué cambió.',
          'Pulsa **Publicar**. Verás **Publicada la versión N.** Desde ese momento los formatos emitidos usan esa versión.',
        ],
      },
      { t: 'note', tone: 'warn', text: 'Si sales de la pantalla o cambias de tipo con cambios sin guardar, se te pregunta antes. **Descartar el borrador** y **Restaurar de fábrica** no se pueden deshacer desde el borrador, aunque las versiones publicadas siguen en el historial.' },
      { t: 'h', text: 'Numeración de un documento' },
      {
        t: 'table', head: ['Opción', 'Resultado'],
        rows: [
          ['Sin número', 'El documento no lleva número.'],
          ['Serie propia', 'Prefijo y alcance **Anual** (reinicia cada año) o **Global**. Ejemplo: ATS-2026-0001.'],
          ['Heredar de otro documento', 'Usa el mismo número que el documento elegido.'],
          ['Código de nombrada', 'Usa el código de la nombrada.'],
        ],
      },
      { t: 'p', text: 'La vista previa **Quedará como...** muestra cómo saldrá. Guarda y publica para aplicarlo.' },
      { t: 'related', ids: ['web-editor', 'web-historial', 'web-emitir-formato'] },
    ],
  },
  {
    id: 'web-editor',
    area: 'web',
    title: 'Editor del documento',
    summary: 'Cómo cambiar casillas, filas y secciones, y enlazar datos de la jornada.',
    audience: ['Administración'],
    where: '/formatos/maestro',
    keywords: ['casilla', 'fila', 'seccion', 'dato', 'arrastrar', 'zoom', 'deshacer', 'columna', 'negrita'],
    blocks: [
      { t: 'p', text: 'El editor tiene tres zonas: **Datos** a la izquierda, la hoja en el centro y **Detalles** a la derecha. Los paneles laterales se pliegan con su botón; en pantallas estrechas se pliegan solos.' },
      {
        t: 'ui', title: 'En la hoja',
        items: [
          { label: '+ Sección', desc: 'Añade una sección con una fila. Cada sección se puede subir, bajar, ocultar o eliminar.' },
          { label: '+ Fila', desc: 'Añade una fila con dos casillas al 50 %. En cada fila: subir, bajar, **⧉** duplicar y **×** eliminar.' },
          { label: '+ de una casilla', desc: 'La parte en dos mitades.' },
          { label: 'Deshacer / Rehacer', desc: 'Hasta 50 pasos. También Ctrl+Z y Ctrl+Mayús+Z.' },
          { label: 'Ajustar al ancho y Zoom', desc: 'Encajan la hoja en la pantalla o la amplían.' },
        ],
      },
      {
        t: 'ui', title: 'Al seleccionar una casilla (panel Detalles)',
        items: [
          { label: 'Texto', desc: 'Lo que dice la casilla. Se bloquea si imprime un dato.' },
          { label: 'Imprime', desc: '**Texto fijo** o un dato de la jornada (nave, fecha, jefe de cubierta, firma, tema de la charla...).' },
          { label: 'Tipo de casilla', desc: '**Texto**, **Casilla para marcar** o **En blanco** (para rellenar a mano).' },
          { label: 'Marca', desc: '**Marcar con X** deja la casilla marcada en todos los formatos que se emitan. Un texto conserva su rótulo (**SI** sale como **X SI**, **(   )** como **( X )**); un recuadro vacío lleva la X dentro.' },
          { label: 'Ancho', desc: 'De 5 % a 95 %. El resto de la fila se ajusta para sumar siempre 100 %.' },
          { label: 'Negrita, Fondo, Recuadro, Alineación', desc: 'Aspecto de la casilla.' },
          { label: 'Partir en dos, Unir con la siguiente, Eliminar la columna', desc: 'Cambian la estructura de la fila.' },
        ],
      },
      {
        t: 'steps', id: 'web-editor-dato', title: 'Poner un dato de la jornada en una casilla',
        items: [
          'En el panel **Datos**, busca el dato (por ejemplo, **Nave** o **Firma del jefe de cubierta**).',
          'Arrástralo sobre la casilla, o selecciona la casilla y pulsa el dato.',
          'Comprueba en **Detalles** que la casilla dice qué imprime. La **×** lo quita y vuelve a texto fijo.',
          'Guarda el borrador.',
        ],
      },
      {
        t: 'steps', id: 'web-editor-marca', title: 'Dejar una casilla marcada (SI, NA o una X en un recuadro)',
        items: [
          'Pulsa la casilla en el documento: por ejemplo, el **SI** de una pregunta del permiso de trabajo o un recuadro vacío del ATS.',
          'En **Detalles**, pulsa **Marcar con X** (o la tecla **X**). La casilla se ve en negrita con su X.',
          'Para quitarla, pulsa **Quitar la X**. Las casillas que se marcan solas según la jornada no se pueden marcar a mano.',
          'Guarda el borrador y publica: la marca sale en el Excel, el PDF y la impresión.',
        ],
      },
      { t: 'note', tone: 'tip', text: 'Supr vacía la casilla seleccionada y Escape quita la selección. Los atajos de deshacer no actúan sobre el documento mientras escribes en un campo.' },
      { t: 'related', ids: ['web-maestro', 'ref-atajos'] },
    ],
  },
  {
    id: 'web-historial',
    area: 'web',
    title: 'Historial y versiones del formato',
    summary: 'Qué cambió en cada publicación y cómo volver a una versión anterior.',
    audience: ['Administración'],
    where: '/formatos/maestro',
    keywords: ['version anterior', 'comparar', 'cambios', 'recuperar', 'restaurar'],
    blocks: [
      { t: 'p', text: '**Historial** abre un panel con cada publicación: autor, fecha y un resumen como "1 añadido · 3 modificados". Al desplegar una entrada ves cada cambio marcado como Añadido, Eliminado, Movido o Modificado.' },
      {
        t: 'list', items: [
          '**Buscar en los cambios** filtra la lista.',
          '**Comparar con** elige contra qué versión se compara.',
          'La primera entrada, **Borrador sin publicar**, muestra lo que todavía no está publicado.',
        ],
      },
      {
        t: 'steps', id: 'web-historial-volver', title: 'Volver a una versión anterior',
        items: [
          'Abre **Historial** y, en la versión que quieres, pulsa **Cargar**. Si hay un borrador, confirma que se reemplaza.',
          'Revisa el borrador cargado en el editor.',
          'Pulsa **Publicar**: se crea una versión nueva igual a la antigua. Las demás siguen en el historial.',
        ],
      },
      { t: 'note', tone: 'info', text: 'Si alguien dejó un borrador que se quedó atrás respecto a lo publicado, el maestro te avisa y te deja **Cargar el borrador** o **Descartarlo**.' },
      { t: 'related', ids: ['web-maestro'] },
    ],
  },

  // --- herramientas --------------------------------------------------------------
  {
    id: 'web-generador',
    area: 'web',
    title: 'Generador de códigos',
    summary: 'Crear el código QR o el código de barras de un empleado para marcar escaneándolo.',
    audience: ['Administración'],
    where: '/generador',
    keywords: ['qr', 'code 128', 'codigo de barras', 'credencial', 'carne', 'fotocheck'],
    blocks: [
      {
        t: 'steps', id: 'web-generador', title: 'Generar un código',
        items: [
          'En **Empleado**, busca por nombre, apellido o documento (en cualquier orden, sin importar tildes).',
          'En **Tipo** elige **QR Code** o **Code 128**.',
          'Pulsa **Generar**.',
          'Usa **Descargar imagen** para imprimirlo en el carné, o **Copiar enlace** para enviarlo.',
        ],
      },
      { t: 'p', text: 'En la app, la marcación **QR / código de barras** reconoce estos códigos y también el código del DNI.' },
      { t: 'related', ids: ['app-marcar-qr'] },
    ],
  },
  {
    id: 'web-sincronizar',
    area: 'web',
    title: 'Sincronizar empleados',
    summary: 'Traer el maestro de personal desde Visma y descargar el estado de registro de cada empleado.',
    audience: ['Administración'],
    where: '/sincronizar-empleados',
    keywords: ['visma', 'personal', 'importar', 'csv', 'maestro'],
    blocks: [
      {
        t: 'steps', id: 'web-sincronizar', title: 'Sincronizar',
        items: [
          'Pulsa **Sincronizar Empleados** y espera (verás **Sincronizando...**).',
          'Lee el resultado: cuántos se crearon, cuántos se actualizaron y si hubo errores.',
          'Si hubo errores, despliega **Ver errores** para ver a quién afectaron.',
        ],
      },
      {
        t: 'list', items: [
          '**Última sincronización** muestra la fecha, el estado (En curso, Correcta, Con errores o Fallida), los contadores y quién la lanzó. **Historial** lista las anteriores.',
          '**Descargar CSV** baja un archivo con nombre, apellido, documento y estado del registro facial de cada empleado.',
        ],
      },
      { t: 'related', ids: ['app-registro'] },
    ],
  },
];
