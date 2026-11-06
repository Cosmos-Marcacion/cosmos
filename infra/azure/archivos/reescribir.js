// Sustituye en la base las urls de un mapa (cualquier coleccion y campo).
// Se ejecuta con mongosh contra la base "cosmos"; lo usa migrar-archivos.sh.
//
// Entrada: MAPA=<fichero> con lineas "url vieja<TAB>url nueva".
//          INVERTIR=1 para aplicarlo al reves (vuelta atras).
// Solo cambia cadenas que coinciden enteras con una url del mapa, y solo
// escribe los campos de primer nivel que contienen alguna.
const fs = require('fs');
const invertir = process.env.INVERTIR === '1';
const mapa = new Map();
for (const linea of fs.readFileSync(process.env.MAPA, 'utf8').split('\n')) {
  const [de, a] = linea.replace(/\r$/, '').split('\t');
  if (de && a) invertir ? mapa.set(a, de) : mapa.set(de, a);
}
if (mapa.size === 0) throw new Error('el mapa esta vacio');

// Los documentos de mongosh vienen de otro contexto: su prototipo no es el
// Object.prototype del script. ObjectId, Long y demas tipos BSON llevan _bsontype.
const esPlano = (v) => Object.prototype.toString.call(v) === '[object Object]' && !v._bsontype;
// Devuelve el valor con las urls cambiadas; cuenta los cambios en c.n.
// Fechas, ObjectId y demas tipos se devuelven tal cual.
function cambiar(v, c) {
  if (typeof v === 'string') {
    if (mapa.has(v)) { c.n++; return mapa.get(v); }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => cambiar(x, c));
  if (esPlano(v)) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = cambiar(v[k], c);
    return o;
  }
  return v;
}

let documentos = 0;
let urls = 0;
for (const n of db.getCollectionNames().filter((n) => !n.startsWith('system.'))) {
  const col = db.getCollection(n);
  col.find({}, { faceDescriptor: 0 }).forEach((d) => {
    const set = {};
    for (const k of Object.keys(d)) {
      if (k === '_id') continue;
      const c = { n: 0 };
      const v = cambiar(d[k], c);
      if (c.n) { set[k] = v; urls += c.n; }
    }
    if (Object.keys(set).length) {
      col.updateOne({ _id: d._id }, { $set: set });
      documentos++;
    }
  });
}
print(`documentos=${documentos} urls=${urls}`);
