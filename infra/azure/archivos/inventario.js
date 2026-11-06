// Lista las urls de S3 guardadas en la base (cualquier coleccion y campo).
// Se ejecuta con mongosh contra la base "cosmos"; lo usa migrar-archivos.sh.
//
// Entrada: BLOB_BASE=https://<cuenta>.blob.core.windows.net/<contenedor>
// Salida, una linea por url distinta, separada por tabuladores:
//   url guardada | url para descargarla | nombre del blob | url nueva
// Las que no se pueden interpretar salen como: INVALIDA | url guardada
const base = (process.env.BLOB_BASE || '').replace(/\/+$/, '');
if (!base) throw new Error('falta BLOB_BASE');

const vistas = new Set();
// Los documentos de mongosh vienen de otro contexto: su prototipo no es el
// Object.prototype del script. ObjectId, Long y demas tipos BSON llevan _bsontype.
const esPlano = (v) => Object.prototype.toString.call(v) === '[object Object]' && !v._bsontype;
function recorrer(v) {
  if (typeof v === 'string') {
    if (v.includes('amazonaws.com')) vistas.add(v);
  } else if (Array.isArray(v)) {
    v.forEach(recorrer);
  } else if (esPlano(v)) {
    for (const k of Object.keys(v)) recorrer(v[k]);
  }
}

for (const n of db.getCollectionNames().filter((n) => !n.startsWith('system.'))) {
  // El descriptor facial son 128 numeros por empleado: no lleva urls.
  db.getCollection(n).find({}, { faceDescriptor: 0 }).forEach(recorrer);
}

const decodificar = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const codificar = (nombre) => nombre.split('/').map(encodeURIComponent).join('/');

for (const raw of [...vistas].sort()) {
  let u;
  try { u = new URL(raw.trim()); } catch { print(`INVALIDA\t${raw}`); continue; }
  const host = u.hostname.toLowerCase();
  const tramos = u.pathname.split('/').filter(Boolean).map(decodificar);
  let bucket;
  let clave;
  const virtual = host.match(/^(.+)\.s3[.-](?:[a-z0-9-]+\.)?amazonaws\.com$/);
  if (/^s3([.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host)) {
    bucket = tramos[0];                 // s3.<region>.amazonaws.com/<bucket>/<clave>
    clave = tramos.slice(1).join('/');
  } else if (virtual) {
    bucket = virtual[1];                // <bucket>.s3.<region>.amazonaws.com/<clave>
    clave = tramos.join('/');
  }
  if (u.protocol !== 'https:' || !bucket || !clave) { print(`INVALIDA\t${raw}`); continue; }
  // Con el bucket en el nombre no chocan claves iguales de buckets distintos.
  const nombre = `s3/${bucket}/${clave}`;
  print([raw, u.href, nombre, `${base}/${codificar(nombre)}`].join('\t'));
}
