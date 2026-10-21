/**
 * Servidor estatico de la app ya construido, para las pruebas de extremo a
 * extremo.
 *
 * Antes la suite corria contra `ng serve`. Ese servidor transforma los modulos
 * segun se los piden, no de antemano, y ahi estaba la inestabilidad: la
 * primera visita a cada pantalla pagaba la transformacion entera, los diez
 * procesos de Playwright la pedian a la vez al mismo servidor —que es un solo
 * proceso— y las pruebas que llegaban primero se pasaban de su tope de tiempo.
 * El resultado era una suite que salia en rojo en cada arranque en frio, en
 * pruebas distintas cada vez. Un fallo que cambia de sitio no se investiga: se
 * deja de mirar, y con el se dejan de mirar los fallos de verdad.
 *
 * Sirviendo la construccion de desarrollo como ficheros estaticos no hay nada
 * que compilar durante las pruebas y el servidor deja de ser un cuello de
 * botella. Se pierde la recarga en caliente, que a una suite no le sirve de
 * nada.
 *
 * Uso: node e2e/support/static-server.mjs <carpeta> <puerto>
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const raiz = resolve(process.argv[2] ?? 'dist/cosmos-app/browser');
const puerto = Number(process.argv[3] ?? 4300);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resuelve la peticion dentro de la carpeta servida.
 *
 * `normalize` deja el camino sin `..`, y la comprobacion posterior descarta lo
 * que aun asi se saldria de la raiz: un servidor de pruebas tambien se ejecuta
 * en el portatil de quien lo escribe.
 */
function rutaFisica(url) {
  const camino = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const destino = resolve(join(raiz, normalize(camino)));
  return destino === raiz || destino.startsWith(raiz + sep) ? destino : null;
}

const servidor = createServer(async (peticion, respuesta) => {
  const destino = rutaFisica(peticion.url ?? '/');
  if (!destino) {
    respuesta.writeHead(403).end('Fuera de la carpeta servida');
    return;
  }

  try {
    const cuerpo = await readFile(destino);
    respuesta.writeHead(200, { 'content-type': TIPOS[extname(destino)] ?? 'application/octet-stream' });
    respuesta.end(cuerpo);
  } catch {
    // Las rutas de la aplicacion (`/formatos/maestro`, `/generador`) no son
    // ficheros: las resuelve el enrutador del navegador sobre index.html.
    try {
      const indice = await readFile(join(raiz, 'index.html'));
      respuesta.writeHead(200, { 'content-type': TIPOS['.html'] });
      respuesta.end(indice);
    } catch {
      respuesta.writeHead(404).end('No se encontro index.html: falta construir el panel');
    }
  }
});

servidor.listen(puerto, () => console.log(`[e2e] panel servido en http://localhost:${puerto}`));
