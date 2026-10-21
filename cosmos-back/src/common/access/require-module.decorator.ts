import { SetMetadata } from '@nestjs/common'

export const REQUIRE_MODULE = 'requireModule'

/**
 * El modulo al que pertenece un endpoint.
 *
 * Se declara una vez por controlador, no por metodo: un modulo es una opcion
 * del menu, y quien puede abrirla puede usarla. Repartir el permiso por
 * metodos daria una matriz que nadie configura bien y que no se corresponde con
 * nada que el usuario vea.
 *
 * La excepcion son las consultas que otra pantalla necesita para funcionar.
 * Marcaciones y la app movil leen los puntos y el maestro de Visma para
 * marcar, registrar a un trabajador o elegir al jefe de cubierta; exigirles
 * `puntos` o `sincronizar-empleados` dejaba sin marcar a todo perfil que no
 * administrara esas pantallas. Para eso, un metodo puede declarar varios
 * modulos y basta con tener uno.
 */
export const RequireModule = (...moduleKeys: [string, ...string[]]) =>
  SetMetadata(
    REQUIRE_MODULE,
    moduleKeys.length === 1 ? moduleKeys[0] : moduleKeys
  )
