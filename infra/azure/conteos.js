// Paso 20.4: conteo de documentos e indices por coleccion.
// Correr contra origen y destino y comparar las salidas con diff:
//   mongosh "<URI_ORIGEN>"  --quiet --file infra/azure/conteos.js > origen.txt
//   mongosh "<URI_DESTINO>" --quiet --file infra/azure/conteos.js > destino.txt
//   diff origen.txt destino.txt && echo "Coinciden"
const nombres = db.getCollectionNames().filter((n) => !n.startsWith('system.')).sort();
for (const n of nombres) {
  const c = db.getCollection(n);
  const indices = c.getIndexes().map((i) => i.name).sort().join(',');
  print(`${n}\t${c.countDocuments({})}\t${indices}`);
}
