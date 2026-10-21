import * as fs from 'fs'
import * as path from 'path'
import { MODULE_KEYS } from './modules'

/**
 * Que ningun controlador se quede sin clasificar.
 *
 * El acceso por perfiles se aplica poniendo `@RequireModule` en cada
 * controlador. Eso funciona mientras alguien se acuerde, y de un olvido no
 * avisa nada: la ruta simplemente queda abierta, y se descubre el dia que
 * alguien la encuentra. Es exactamente lo que habia pasado con `/named`, que
 * lista el personal de cada nombrada y no pedia ni sesion.
 *
 * Esta prueba lee los controladores del codigo y exige que cada uno **declare
 * su modulo** o **este en la lista de compartidos con un motivo escrito**. Un
 * controlador nuevo falla hasta que alguien decide a cual de los dos pertenece.
 *
 * Se hace leyendo los ficheros y no levantando el modulo de Nest a proposito:
 * arrancar `AppModule` abre conexiones a Mongo, y una prueba que necesita base
 * de datos para comprobar una decision de diseno acaba desactivada.
 */

const SRC = path.join(__dirname, '..', '..')

/**
 * Controladores que **no** pertenecen a una opcion del menu, con el motivo.
 *
 * Un motivo escrito no es burocracia: es lo unico que distingue "esto va
 * abierto porque tiene que estarlo" de "esto se quedo abierto".
 */
const SHARED: Record<string, string> = {
  'app.controller.ts': 'La raiz del servicio. No devuelve datos.',
  'auth.controller.ts':
    'El login. Exigir sesion para entrar seria imposible de cumplir.',
  'employee.controller.ts':
    'El maestro de personal lo consultan la app movil, marcaciones y el ' +
    'generador. Sigue exigiendo sesion y rol; lo que no tiene es un modulo ' +
    'propio, porque no es una opcion del menu.',
  'upload.controller.ts':
    'Subida y proxy de ficheros. Subir y borrar exigen sesion; el proxy no, ' +
    'porque la app lo pide con fetch y sin token, y solo descarga de S3.',
  'presition.controller.ts':
    'El umbral de deteccion facial. Lo lee la pantalla de reconocimiento de ' +
    'la app, que se abre sin exigir sesion.',
  'models.controller.ts':
    'Sirve los modelos de face-api como ficheros estaticos.',
  'permission.controller.ts':
    'Permisos de puerto por usuario, anteriores a los perfiles. Exige sesion ' +
    'y rol de administrador.',
  'fingerprint.controller.ts':
    'Registro e identificacion por huella. Lo llama solo la app movil, desde ' +
    'pantallas que ya exigen sesion: pide sesion pero no un modulo.',
  'trainer.controller.ts':
    'Maestro de entrenadores de charlas. Lo usan el panel y la app desde el ' +
    'formulario de charlas: pide sesion pero no un modulo.',
}

/** Todos los controladores del proyecto, con su fuente. */
function controllers(): { file: string; name: string; source: string }[] {
  const found: { file: string; name: string; source: string }[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith('.controller.ts')) {
        found.push({
          file: path.relative(SRC, full).replace(/\\/g, '/'),
          name: entry.name,
          source: fs.readFileSync(full, 'utf8'),
        })
      }
    }
  }
  walk(SRC)
  return found
}

const CONTROLLERS = controllers()

/** El modulo que declara, si declara alguno. */
function moduleOf(source: string): string | null {
  return source.match(/@RequireModule\('([^']+)'\)/)?.[1] ?? null
}

/** Si exige haber entrado. Los dos guardias de sesion que usa el proyecto. */
function requiresSession(source: string): boolean {
  return /@UseGuards\([^)]*(JwtAuthGuard|AuthGuard\('jwt'\))/.test(source)
}

describe('cobertura del control de acceso', () => {
  it('hay controladores que revisar', () => {
    // Sin esto, un fallo en la busqueda de ficheros haria que todas las
    // comprobaciones de abajo pasaran sin comprobar nada.
    expect(CONTROLLERS.length).toBeGreaterThan(15)
  })

  it('cada controlador declara su modulo o esta clasificado como compartido', () => {
    const sinClasificar = CONTROLLERS.filter(
      controller => !moduleOf(controller.source) && !SHARED[controller.name]
    ).map(controller => controller.file)

    expect(sinClasificar).toEqual([])
  })

  it('el modulo que declara existe en el catalogo', () => {
    const invalidos = CONTROLLERS.map(controller => ({
      file: controller.file,
      key: moduleOf(controller.source),
    }))
      .filter(
        entry =>
          entry.key !== null && !MODULE_KEYS.includes(entry.key as string)
      )
      .map(entry => `${entry.file}: ${entry.key}`)

    expect(invalidos).toEqual([])
  })

  it('un controlador con modulo tambien exige haber entrado', () => {
    // El permiso se lee del token. Sin guardia de sesion no hay token, asi que
    // `@RequireModule` seria decorativo: el guardia veria un usuario vacio.
    const sinSesion = CONTROLLERS.filter(
      controller =>
        moduleOf(controller.source) && !requiresSession(controller.source)
    ).map(controller => controller.file)

    expect(sinSesion).toEqual([])
  })

  it('un controlador con modulo registra el guardia que lo aplica', () => {
    // Declarar el modulo sin anadir `ModuleGuard` a `@UseGuards` deja el
    // permiso escrito y sin efecto, que es peor que no escribirlo: parece
    // protegido en la revision del codigo.
    const sinGuardia = CONTROLLERS.filter(
      controller =>
        moduleOf(controller.source) && !/ModuleGuard/.test(controller.source)
    ).map(controller => controller.file)

    expect(sinGuardia).toEqual([])
  })

  it('lo de la app movil sigue alcanzable con el perfil de siempre', () => {
    // La app llama a `/auth/login`, `/employee/loggued`, `/format`,
    // `/named/nameds/grouped`, `/presition` y `/upload/proxy`. Los dos que
    // ahora piden modulo piden `marcaciones`, que es lo que la migracion da al
    // perfil `User`. Si alguien cambiara ese modulo, la app dejaria de marcar.
    const named = CONTROLLERS.find(c => c.name === 'named.controller.ts')
    const format = CONTROLLERS.find(c => c.name === 'format.controller.ts')

    expect(moduleOf(named?.source ?? '')).toBe('marcaciones')
    expect(moduleOf(format?.source ?? '')).toBe('marcaciones')
  })

  it('los compartidos que manejan datos exigen sesion', () => {
    // Huellas, entrenadores, permisos y personal no llevan modulo, pero si
    // sesion. Huellas y entrenadores estuvieron abiertos: `GET /fingerprint`
    // entregaba las plantillas biometricas a quien lo pidiera.
    const conSesion = [
      'fingerprint.controller.ts',
      'trainer.controller.ts',
      'permission.controller.ts',
      'employee.controller.ts',
      'upload.controller.ts',
    ]
    const abiertos = CONTROLLERS.filter(controller =>
      conSesion.includes(controller.name)
    )
      .filter(controller => !requiresSession(controller.source))
      .map(controller => controller.file)

    expect(abiertos).toEqual([])
  })

  it('cada motivo de la lista de compartidos dice algo', () => {
    const vacios = Object.entries(SHARED)
      .filter(([, reason]) => reason.trim().length < 20)
      .map(([file]) => file)

    expect(vacios).toEqual([])
  })

  it('la lista de compartidos no nombra controladores que ya no existen', () => {
    const nombres = new Set(CONTROLLERS.map(controller => controller.name))
    const sobran = Object.keys(SHARED).filter(name => !nombres.has(name))
    expect(sobran).toEqual([])
  })
})
