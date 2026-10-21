/**
 * Los modulos de la plataforma: lo que un perfil puede o no puede abrir.
 *
 * Es la misma lista que las opciones del menu, y ese es el punto. Un permiso
 * que no se corresponda con algo que el usuario ve no lo sabe explicar nadie:
 * "puede entrar en Marcaciones" se entiende, "tiene entries.read" no.
 *
 * La clave **no cambia nunca**: viaja guardada en cada perfil de la base de
 * datos y en el token. La etiqueta si puede cambiar, porque solo se pinta.
 */
export interface PlatformModule {
  key: string
  label: string
  /** Para que sirve, tal como se lee en la pantalla de perfiles. */
  description: string
  /** Rutas del frontend que cubre. Sirven para filtrar el menu y las rutas. */
  routes: string[]
}

export const PLATFORM_MODULES: PlatformModule[] = [
  {
    key: 'panel',
    label: 'Panel',
    description: 'Indicadores de asistencia por nave, turno y fecha.',
    routes: ['/panel'],
  },
  {
    key: 'marcaciones',
    label: 'Marcaciones',
    description:
      'Nombradas, personal, capacitacion del turno y emision de los formatos.',
    routes: ['/marcaciones', '/formatos/imprimir'],
  },
  {
    key: 'usuarios',
    label: 'Usuarios',
    description: 'Altas y bajas de quien entra a la plataforma, y su perfil.',
    routes: ['/usuarios'],
  },
  {
    key: 'perfiles',
    label: 'Perfiles',
    description:
      'Que puede abrir cada perfil. Quien tenga esto puede darse a si mismo ' +
      'cualquier otro permiso.',
    routes: ['/perfiles'],
  },
  {
    key: 'puertos',
    label: 'Puertos',
    description: 'Maestro de puertos y terminales.',
    routes: ['/puertos'],
  },
  {
    key: 'puntos',
    label: 'Puntos de marcación',
    description: 'Los puntos donde el personal marca, y sus dispositivos.',
    routes: ['/puntos'],
  },
  {
    key: 'formatos',
    label: 'Formatos',
    description:
      'El maestro de formatos: que lleva cada documento y como se numera.',
    routes: ['/formatos/maestro'],
  },
  {
    key: 'generador',
    label: 'Generador',
    description: 'Generacion de credenciales y codigos para el personal.',
    routes: ['/generador'],
  },
  {
    key: 'sincronizar-empleados',
    label: 'Sincronizar empleados',
    description: 'Traer el maestro de personal desde Visma.',
    routes: ['/sincronizar-empleados'],
  },
]

export const MODULE_KEYS: string[] = PLATFORM_MODULES.map(module => module.key)

/** Si una clave existe. Un permiso inventado no se guarda. */
export function isModuleKey(key: string): boolean {
  return MODULE_KEYS.includes(key)
}

/**
 * Los permisos con los que arranca cada perfil de los que ya existian.
 *
 * La plataforma tenia tres roles fijos —`Super`, `Admin`, `User`— sin permisos
 * dentro. Al pasar a perfiles hay que decidir por ellos, y el criterio es no
 * quitarle a nadie lo que ya podia hacer: `Super` y `Admin` administraban todo,
 * y `User` operaba la jornada. Un perfil que ya traiga permisos no se toca.
 */
export const LEGACY_ROLE_MODULES: Record<string, string[]> = {
  Super: MODULE_KEYS,
  Admin: MODULE_KEYS,
  User: ['panel', 'marcaciones'],
}

/** Lo que recibe un perfil nuevo del que no se sabe nada. */
export const DEFAULT_MODULES: string[] = ['panel', 'marcaciones']
