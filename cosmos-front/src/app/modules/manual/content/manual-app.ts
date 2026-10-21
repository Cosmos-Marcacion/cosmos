import { ManualArticle } from '../manual.types';

/**
 * Temas de la app móvil "Cosmos Check-In" (cosmos-app, Android).
 *
 * Se escribe para quien la usa en el muelle: frases cortas y los rótulos tal
 * como salen en el teléfono.
 */
export const APP_ARTICLES: ManualArticle[] = [
  {
    id: 'app-empezar',
    area: 'app',
    title: 'Instalar la app y entrar',
    summary: 'Qué necesita el teléfono, cómo se inicia sesión y cómo se mueve uno por la app.',
    audience: ['Supervisión', 'Equipo del muelle'],
    keywords: ['apk', 'android', 'instalar', 'login', 'sesion', 'check-in', 'pestañas', 'menu'],
    blocks: [
      {
        t: 'list', items: [
          'Teléfono o tableta Android 6.0 o superior, con cámara y conexión a internet.',
          'Para marcar o registrar huella: lector de huella **ZKTeco SLK20r** conectado por USB (cable OTG).',
          'Se instala desde el archivo APK que entrega el administrador. La versión actual es la **1.0.7**.',
        ],
      },
      {
        t: 'steps', id: 'app-entrar', title: 'Iniciar sesión',
        items: [
          'Abre **Cosmos Check-In**.',
          'Escribe el **Correo electrónico** y la **Contraseña** del usuario del equipo y pulsa **Ingresar**.',
          'La primera vez, acepta el permiso de cámara (lo necesita el reconocimiento facial).',
        ],
      },
      { t: 'note', tone: 'warn', text: 'La marcación también exige una sesión iniciada: el equipo del muelle debe quedar con un usuario dentro para que el personal marque. Todo funciona con conexión; sin internet verás **No hay conexion con el servidor**.' },
      { t: 'h', text: 'Cómo se navega' },
      {
        t: 'table', head: ['Pestaña (abajo)', 'Para qué'],
        rows: [
          ['Inicio', 'Nombradas del día y avance de cada persona.'],
          ['Registro', 'Dar de alta a un trabajador y registrar su huella, rostro y firma.'],
          ['Marcación', 'Que el personal marque ingreso o salida.'],
          ['Charlas', 'Registrar capacitaciones y sus asistentes.'],
        ],
      },
      { t: 'p', text: 'El avatar de arriba a la derecha abre **Tu cuenta**, con el usuario conectado y el botón **Cerrar sesión**. El botón Atrás de Android vuelve a la pantalla anterior.' },
      { t: 'related', ids: ['app-inicio', 'app-registro', 'app-marcar'] },
    ],
  },
  {
    id: 'app-inicio',
    area: 'app',
    title: 'Inicio: nombradas del día',
    summary: 'Ver las nombradas de una fecha por turno, el avance de marcación de cada persona y descargar el formato.',
    audience: ['Supervisión'],
    keywords: ['nombradas', 'turno', 'fecha', 'formato', 'personal', 'avance'],
    blocks: [
      {
        t: 'ui',
        items: [
          { label: 'Fecha de trabajo', desc: 'Flechas para el día anterior y el siguiente; al tocar la fecha se elige otra.' },
          { label: 'Turno', desc: 'Cada turno se despliega. El turno en curso se abre solo. El contador indica cuántas nombradas tienen marcas.' },
          { label: 'Tarjeta de nombrada', desc: 'Nave, viaje, muelle y cuántos del personal están presentes. **S-n** indica cuántos completaron el recorrido.' },
          { label: 'Formato', desc: 'Descarga el Excel oficial y abre el menú de compartir del teléfono para guardarlo o enviarlo.' },
          { label: 'Fila de una persona', desc: 'Último punto marcado con su hora y un contador como 1/2 (marcaciones sobre el total de puntos; ámbar si es **Falta**). Al tocarla se abre su detalle.' },
        ],
      },
      { t: 'p', text: 'Si no hay nombradas para la fecha, verás **No hay información disponible** con los botones **Ir a hoy** y **Seleccionar otra fecha**.' },
      { t: 'related', ids: ['app-detalle-empleado', 'web-emitir-formato'] },
    ],
  },
  {
    id: 'app-detalle-empleado',
    area: 'app',
    title: 'Detalle del trabajador: marcar por él, remate y faltas',
    summary: 'Desde Inicio, ver los puntos marcados de una persona, marcar en su nombre, hacer el remate o registrar una falta.',
    audience: ['Supervisión'],
    keywords: ['remate', 'falta', 'inasistencia', 'marcar por', 'siguiente nombrada'],
    blocks: [
      {
        t: 'ui',
        items: [
          { label: 'Marcación', desc: 'Abre la elección de punto para esa persona y, al terminar, vuelve a este detalle.' },
          { label: 'Realizar remate', desc: 'Cierra la salida en esta nombrada y registra la entrada en la siguiente. Solo hoy, con el primer punto marcado y el último sin marcar.' },
          { label: 'Registrar falta', desc: 'Solo hoy y si la persona no tiene ninguna marcación.' },
          { label: 'Cancelar falta', desc: 'Quita una falta registrada.' },
          { label: 'Lista de puntos', desc: 'En color, con hora y tic, los ya marcados.' },
        ],
      },
      { t: 'note', tone: 'info', text: 'Si al hacer el remate no existe la siguiente nombrada, verás que la salida se registró pero no la entrada. Revísalo en el panel web.' },
      { t: 'related', ids: ['app-inicio', 'app-punto'] },
    ],
  },
  {
    id: 'app-registro',
    area: 'app',
    title: 'Registrar a un trabajador',
    summary: 'Buscar a la persona en Cosmos y en Visma, crear su ficha y registrar huella, rostro y firma.',
    audience: ['Supervisión'],
    keywords: ['alta', 'ficha', 'visma', 'buscar', 'dni', 'biometria', 'nuevo trabajador'],
    blocks: [
      { t: 'p', text: 'Una persona solo puede marcar con huella o rostro si antes se registró aquí. La firma registrada es la que sale impresa en los formatos.' },
      {
        t: 'steps', id: 'app-registro', title: 'Registro completo',
        items: [
          'En la pestaña **Registro**, escribe apellido, nombre o documento en **Nombre, apellido o documento**.',
          'Toca a la persona en los resultados. Con 3 caracteres o más también se busca en Visma.',
          'Si quieres, toca la foto para cambiarla. Pulsa **Guardar**.',
          'En **Registros biométricos**, toca **Registro de huella** y sigue la pantalla.',
          'Toca **Registro facial** y sigue la pantalla.',
          'Toca **Registro de firma** y pide a la persona que firme.',
          'Cada registro terminado queda con un tic en su fila.',
        ],
      },
      {
        t: 'ui', title: 'Ayudas del buscador',
        items: [
          { label: 'Sin huella, Sin firma, Solo activos', desc: 'Filtros que se combinan. **Quitar filtros** los limpia.' },
          { label: 'Orden', desc: 'Apellido A-Z, Apellido Z-A o Documento.' },
          { label: 'Chips de cada resultado', desc: '**Huella**, **Firma**, **Sin registros**, **Visma** (solo existe allí) e **Inactivo**.' },
        ],
      },
      { t: 'note', tone: 'tip', text: 'Para rehacer un registro (por ejemplo, una firma mal hecha), toca la papelera de su fila, confirma y vuelve a registrarlo. El borrado no se puede deshacer.' },
      { t: 'related', ids: ['app-huella-registro', 'app-rostro-registro', 'app-firma'] },
    ],
  },
  {
    id: 'app-huella-registro',
    area: 'app',
    title: 'Registrar la huella',
    summary: 'Capturar la huella de un trabajador con el lector ZKTeco SLK20r.',
    audience: ['Supervisión'],
    keywords: ['huella', 'dactilar', 'lector', 'zkteco', 'usb', 'otg', 'sensor'],
    blocks: [
      {
        t: 'steps', id: 'app-huella-registro', title: 'Registrar',
        items: [
          'Conecta el lector al teléfono. Si Android pide permiso para el dispositivo USB, acéptalo.',
          'Comprueba que arriba diga **Conectado** (verde).',
          'Pulsa **Registrar Huella**. Verás **Esperando huella...**.',
          'El trabajador apoya el dedo y lo mantiene; el sensor toma dos lecturas del mismo dedo.',
          'Al terminar verás **Huella registrada correctamente** y la app vuelve a la ficha.',
        ],
      },
      { t: 'note', tone: 'tip', text: 'Si las dos lecturas no coinciden, el registro empieza otra vez: que apoye el mismo dedo, centrado y sin moverlo.' },
      { t: 'related', ids: ['app-marcar-huella', 'problemas'] },
    ],
  },
  {
    id: 'app-rostro-registro',
    area: 'app',
    title: 'Registrar el rostro',
    summary: 'Guardar el rostro de un trabajador para que pueda marcar con reconocimiento facial.',
    audience: ['Supervisión'],
    keywords: ['cara', 'facial', 'camara', 'trasera', 'delantera', 'selfie', 'luz'],
    blocks: [
      { t: 'p', text: 'La cámara se abre en la **trasera**, para que el supervisor enfoque al trabajador. El botón redondo sobre la imagen cambia a la **delantera** (y vuelve), por si la persona se registra sola.' },
      {
        t: 'steps', id: 'app-rostro-registro', title: 'Registrar',
        items: [
          'Encuadra la cara dentro del óvalo, de frente y con buena luz. Que no salga nadie más.',
          'Sigue los indicadores de arriba: **Distancia correcta** y **Precisión óptima** o **buena**.',
          'Cuando el óvalo se pone verde, quédate quieto: se guarda solo en un segundo y medio.',
          'Verás **Rostro registrado con éxito.** y la app vuelve a la ficha.',
        ],
      },
      {
        t: 'table', head: ['Mensaje', 'Qué hacer'],
        rows: [
          ['Muy lejos / Acérquese más a la cámara', 'Acerca el teléfono o a la persona.'],
          ['Muy cerca / Aléjese un poco', 'Aleja el teléfono.'],
          ['Se detectó más de un rostro', 'Que solo salga una cara en la imagen.'],
          ['Mejore la iluminación y mantenga el rostro estable', 'Busca luz de frente, sin contraluz, y no te muevas.'],
          ['No se detectó ningún rostro', 'Tras unos 50 segundos sin cara, la app vuelve a la ficha. Inténtalo de nuevo.'],
        ],
      },
      { t: 'related', ids: ['app-marcar-rostro', 'app-camara'] },
    ],
  },
  {
    id: 'app-firma',
    area: 'app',
    title: 'Registrar la firma',
    summary: 'Que el trabajador firme en la pantalla; esa firma se imprime en los formatos.',
    audience: ['Supervisión', 'Trabajador'],
    keywords: ['firma', 'rubrica', 'formato'],
    blocks: [
      {
        t: 'steps', id: 'app-firma', title: 'Firmar',
        items: [
          'En la ficha del trabajador, toca **Registro de firma**.',
          'La persona firma con el dedo en el recuadro blanco.',
          'Si no quedó bien, toca **Limpiar** y vuelve a firmar.',
          'Toca **Guardar Firma**. Verás **Firma guardada correctamente**.',
        ],
      },
      { t: 'note', tone: 'info', text: 'La firma sale en la lista de personal del formato y, para los responsables, en las casillas FIRMA del permiso de trabajo y del ATS. Sin firma registrada, la casilla queda en blanco para firmar a mano.' },
      { t: 'related', ids: ['web-emitir-formato'] },
    ],
  },
  {
    id: 'app-marcar',
    area: 'app',
    title: 'Marcar asistencia',
    summary: 'Las cuatro formas de marcar y lo que pasa después.',
    audience: ['Trabajador', 'Supervisión'],
    keywords: ['marcar', 'ingreso', 'salida', 'asistencia', 'metodo'],
    blocks: [
      { t: 'p', text: 'En la pestaña **Marcación** elige cómo identificarte. Después eliges el punto (ingreso, salida, etc.) y aparece **Marcación registrada**.' },
      {
        t: 'table', head: ['Método', 'Cuándo usarlo', 'Necesita'],
        rows: [
          ['Huella digital', 'Lo más rápido si hay lector.', 'Lector SLK20r y huella registrada.'],
          ['Reconocimiento facial', 'Sin lector, con buena luz.', 'Rostro registrado.'],
          ['QR / código de barras', 'Con carné con código o con el DNI.', 'Código generado en el panel o DNI con código.'],
          ['Ingresar documento', 'Si todo lo demás falla.', 'El número de documento.'],
        ],
      },
      { t: 'related', ids: ['app-marcar-huella', 'app-marcar-rostro', 'app-marcar-qr', 'app-marcar-documento', 'app-punto'] },
    ],
  },
  {
    id: 'app-marcar-huella',
    area: 'app',
    title: 'Marcar con huella',
    summary: 'Identificarse apoyando el dedo en el lector.',
    audience: ['Trabajador'],
    keywords: ['huella', 'lector', 'dedo', 'inicializar'],
    blocks: [
      {
        t: 'steps', id: 'app-marcar-huella', title: 'Marcar',
        items: [
          'En **Marcación**, toca **Huella digital**.',
          'Espera a que diga **Conectado** y aparezca **Huellas cargadas**.',
          'Apoya el dedo en el sensor cuando veas **Coloque su dedo en el sensor.**',
          'Si te reconoce, pasas a elegir el punto.',
        ],
      },
      { t: 'note', tone: 'warn', text: 'Si no te reconoce, verás **No te hemos reconocido. Vuelve a intentarlo o usa otro método.** y la app vuelve a **Marcación**. Si el lector se desconecta, pulsa **Inicializar**.' },
      { t: 'related', ids: ['app-punto', 'app-huella-registro'] },
    ],
  },
  {
    id: 'app-marcar-rostro',
    area: 'app',
    title: 'Marcar con reconocimiento facial',
    summary: 'Identificarse mirando a la cámara; se marca solo.',
    audience: ['Trabajador'],
    keywords: ['cara', 'facial', 'camara', 'trasera', 'delantera', 'ovalo'],
    blocks: [
      { t: 'p', text: 'La cámara ocupa toda la pantalla y se abre en la **trasera**. El botón redondo de arriba a la derecha cambia a la **delantera** para marcarse solo, y vuelve a la trasera.' },
      {
        t: 'steps', id: 'app-marcar-rostro', title: 'Marcar',
        items: [
          'En **Marcación**, toca **Reconocimiento facial**.',
          'Pon la cara dentro del óvalo, con luz de frente. Sigue la frase de abajo (**Acércate un poco**, **Hay poca luz...**).',
          'Cuando diga **No te muevas...**, quédate quieto mientras el aro verde se completa.',
          'Tras **¡Listo!** y **Te estoy reconociendo...**, verás **Rostro reconocido** y pasas a elegir el punto.',
        ],
      },
      { t: 'note', tone: 'tip', text: 'Si dice **No te he reconocido. Prueba otra vez**, vuelve a buscar sola; no hay límite de intentos. Si nunca te reconoce, pide al supervisor que rehaga tu registro facial.' },
      { t: 'related', ids: ['app-punto', 'app-camara', 'app-rostro-registro'] },
    ],
  },
  {
    id: 'app-marcar-qr',
    area: 'app',
    title: 'Marcar con QR, código de barras o DNI',
    summary: 'Identificarse escaneando el carné o el DNI.',
    audience: ['Trabajador'],
    keywords: ['qr', 'codigo de barras', 'dni', 'escanear', 'carne', 'pdf417'],
    blocks: [
      {
        t: 'steps', id: 'app-marcar-qr', title: 'Marcar',
        items: [
          'En **Marcación**, toca **QR / código de barras**.',
          'Acerca el código a la cámara: el QR del carné generado en el panel o el código del DNI.',
          'Si encuentra a la persona, pasas a elegir el punto.',
        ],
      },
      {
        t: 'table', head: ['Mensaje', 'Qué hacer'],
        rows: [
          ['No encontramos a nadie con el documento...', 'Esa persona no está registrada. Pide al supervisor que la registre o marca con el documento a mano.'],
          ['El código leído no tiene un número de documento.', 'Acerca más el carné o el DNI y vuelve a intentarlo (**Escanear de nuevo**).'],
          ['No se pudo consultar el documento.', 'Revisa la conexión.'],
        ],
      },
      { t: 'related', ids: ['app-marcar-documento', 'web-generador'] },
    ],
  },
  {
    id: 'app-marcar-documento',
    area: 'app',
    title: 'Marcar escribiendo el documento',
    summary: 'Identificarse con el número de DNI o carné de extranjería.',
    audience: ['Trabajador'],
    keywords: ['dni', 'documento', 'carne de extranjeria', 'manual', 'numero'],
    blocks: [
      {
        t: 'steps', id: 'app-marcar-documento', title: 'Marcar',
        items: [
          'En **Marcación**, toca **Ingresar documento**.',
          'Escribe el número: DNI de 8 dígitos o carné de extranjería de hasta 12.',
          'Toca **Buscar**. Si te encuentra, pasas a elegir el punto.',
        ],
      },
      { t: 'related', ids: ['app-punto'] },
    ],
  },
  {
    id: 'app-punto',
    area: 'app',
    title: 'Elegir el punto de marcación',
    summary: 'El último paso de cualquier marcación: tocar el punto que corresponde.',
    audience: ['Trabajador', 'Supervisión'],
    keywords: ['punto', 'ingreso', 'salida', 'registrada', 'nombrada', 'falta'],
    blocks: [
      { t: 'p', text: 'Arriba ves tu nombrada, el turno y tu foto. Debajo, **Selecciona el punto de registro** con un botón por punto.' },
      {
        t: 'list', items: [
          'Los puntos ya marcados salen en verde con su hora y no se pueden volver a tocar.',
          'Si el último punto ya está marcado, todos quedan bloqueados: la jornada está completa.',
          'Al tocar un punto aparece **Marcación registrada** con un sonido; a los 2 segundos la app vuelve a **Marcación** lista para el siguiente.',
        ],
      },
      {
        t: 'table', head: ['Mensaje', 'Qué significa'],
        rows: [
          ['Se ha registrado como falta...', 'Tienes una falta hoy. Habla con el administrador.'],
          ['No hay una nombrada para hoy con este empleado.', 'No figuras en ninguna nombrada de hoy. Avisa a tu supervisor.'],
          ['No hay puntos de marcación configurados.', 'Falta configurar los puntos del puerto en el panel.'],
          ['No se pudieron cargar los puntos de marcación.', 'Problema de conexión. Toca **Reintentar**.'],
        ],
      },
      { t: 'related', ids: ['web-puntos', 'app-marcar'] },
    ],
  },
  {
    id: 'app-charlas',
    area: 'app',
    title: 'Charlas y capacitaciones',
    summary: 'Registrar una charla desde el muelle, marcar a sus asistentes y descargar su registro.',
    audience: ['Supervisión'],
    keywords: ['capacitacion', 'charla', 'induccion', 'toolbox', 'asistentes', 'entrenador'],
    blocks: [
      {
        t: 'steps', id: 'app-charla-crear', title: 'Registrar una charla',
        items: [
          'En la pestaña **Charlas**, toca **+ Agregar**.',
          'Elige la **Fecha de Trabajo**. El resto aparece solo si ese día hay nombradas.',
          'Elige **Turno**, **Tipo**, **Lugar** y escribe **Tema** y **Área**. Sucursal y número de registro se rellenan solos.',
          'Indica **Hora Inicio** y **Hora Fin** (las horas se calculan solas).',
          'Busca al **Entrenador** y al **Registrador** por nombre o documento.',
          'Escribe el **Resumen del tema expuesto**, marca si pertenece al Programa Anual y toca **Guardar**.',
        ],
      },
      {
        t: 'steps', id: 'app-charla-asistentes', title: 'Marcar asistentes',
        items: [
          'En la lista de charlas, toca el icono **Asistentes** de la charla.',
          'Marca a cada persona que asistió, o usa **Seleccionar todos**.',
          'Para alguien que no está en la lista del turno, búscalo en **Buscar empleado**.',
        ],
      },
      { t: 'p', text: 'En la lista, **Filtros** busca por fechas, turno, tipo o número de registro. **Descargar** genera el Excel de la charla con sus asistentes.' },
      { t: 'note', tone: 'info', text: 'La capacitación que sale en el formato oficial se completa en el panel web, en el detalle de la nombrada. Las charlas de la app aparecen allí como **Otras charlas registradas**.' },
      { t: 'related', ids: ['web-nombrada'] },
    ],
  },
  {
    id: 'app-camara',
    area: 'app',
    title: 'Cámara y permisos',
    summary: 'Qué hacer si la cámara no se abre y cómo dar el permiso.',
    audience: ['Supervisión', 'Trabajador'],
    keywords: ['permiso', 'camara', 'ajustes', 'ocupada', 'denegado', 'negro'],
    blocks: [
      {
        t: 'table', head: ['Mensaje', 'Qué hacer'],
        rows: [
          ['La app no tiene permiso para usar la cámara.', 'Ve a **Ajustes > Aplicaciones > Cosmos Check-In > Permisos > Cámara** y elige Permitir. Vuelve a la app.'],
          ['La cámara está en uso.', 'Cierra otras apps que usen la cámara y toca **Reintentar**.'],
          ['No se encontró una cámara disponible.', 'El equipo no tiene cámara o está averiada.'],
          ['No se pudo encender la cámara.', 'Vuelve a intentarlo; si sigue, cierra y abre la app.'],
        ],
      },
      { t: 'p', text: 'En la marcación facial, si una cámara falla, el aviso ofrece **Usar la cámara delantera** (o trasera) para probar con la otra.' },
      { t: 'related', ids: ['app-marcar-rostro', 'problemas'] },
    ],
  },
];
