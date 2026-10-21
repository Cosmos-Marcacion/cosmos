/** Dominios cuyo panel y subdominios pueden llamar a la API desde el navegador. */
export const TRUSTED_DOMAINS = ['cosmos.com.pe', 'marcostorresalarcon.com'];

/**
 * Origenes exactos admitidos ademas de los dominios de confianza, separados por
 * comas en `CORS_EXTRA_ORIGINS`. Sirve para probar el panel en la direccion que
 * Azure le da por defecto (`https://<nombre>.azurestaticapps.net`) antes de que
 * el DNS apunte al dominio propio. Se compara el origen entero, sin comodines.
 */
function extraOriginsFromEnv(): string[] {
  return (process.env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().toLowerCase().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * Si un `Origin` puede llamar a la API.
 *
 * Antes se comparaba con `origin.endsWith('cosmos.com.pe')`, y eso tambien deja
 * pasar `https://evilcosmos.com.pe`, un dominio que cualquiera puede registrar.
 * Aqui se compara el nombre de host entero: el dominio o un subdominio suyo.
 *
 * Sin `Origin` (la app nativa, curl, otro servidor) se admite: CORS solo
 * protege a los navegadores, y la API pide token en cada ruta privada.
 */
export function isTrustedOrigin(
  origin: string | undefined,
  extraOrigins: readonly string[] = extraOriginsFromEnv(),
): boolean {
  if (!origin) return true;
  if (origin === 'capacitor://localhost') return true;
  if (extraOrigins.includes(origin.toLowerCase())) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

  const host = url.hostname.toLowerCase();
  if (host === 'localhost') return true;
  return TRUSTED_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
