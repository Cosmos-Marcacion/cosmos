/**
 * Secreto con el que se firman y verifican los tokens.
 *
 * Sale de `JWT_SECRET`. Antes estaba escrito aqui, en el repositorio, y por eso
 * hay que rotarlo: cualquiera con acceso al historial podia firmar tokens.
 *
 * Se lee con una funcion y no con una constante porque este modulo se importa
 * antes de que `ConfigModule` cargue el `.env`: una constante quedaria vacia en
 * desarrollo. En produccion no hay valor por defecto; arrancar sin secreto
 * tiene que fallar, no firmar con uno conocido.
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta JWT_SECRET: la API no arranca sin secreto en produccion.');
  }
  return 'cosmos-solo-desarrollo';
}
