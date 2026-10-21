/**
 * Los módulos de la plataforma, en el orden en que salen en el menú.
 *
 * Es el espejo de `PLATFORM_MODULES` del backend. Se repite aquí y no se pide
 * al servidor porque el menú y las rutas tienen que decidirse antes de la
 * primera petición: sin esto, al entrar se vería el menú entero durante un
 * instante y luego desaparecerían la mitad de las opciones.
 *
 * Las **claves** son el contrato, y no cambian: viajan guardadas en cada perfil
 * y dentro del token. La etiqueta solo se pinta.
 *
 * El catálogo completo, con la descripción de cada módulo, lo sirve
 * `GET /role/modules`; la pantalla de perfiles lo pide de ahí para que no haya
 * dos listas de permisos que puedan divergir.
 */
export interface IModuleOption {
  key: string;
  label: string;
  /** La ruta a la que lleva el menú. */
  path: string;
}

export const PLATFORM_MODULES: IModuleOption[] = [
  { key: 'panel', label: 'Panel', path: '/panel' },
  { key: 'marcaciones', label: 'Marcaciones', path: '/marcaciones' },
  { key: 'usuarios', label: 'Usuarios', path: '/usuarios' },
  { key: 'perfiles', label: 'Perfiles', path: '/perfiles' },
  { key: 'puertos', label: 'Puertos', path: '/puertos' },
  { key: 'puntos', label: 'Puntos de marcación', path: '/puntos' },
  { key: 'formatos', label: 'Formatos', path: '/formatos/maestro' },
  { key: 'generador', label: 'Generador', path: '/generador' },
  {
    key: 'sincronizar-empleados',
    label: 'Sincronizar empleados',
    path: '/sincronizar-empleados',
  },
];

/** La primera pantalla que el usuario puede abrir, para no dejarlo en blanco. */
export function firstAllowedPath(permissions: string[]): string {
  const first = PLATFORM_MODULES.find(module => permissions.includes(module.key));
  return first?.path ?? '/login';
}
