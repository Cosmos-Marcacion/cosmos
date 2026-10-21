/**
 * Rostros registrados repetidos en varias fichas.
 *
 * Dos capturas de la misma cara nunca dan los mismos 128 valores, asi que un
 * descriptor identico (o casi) en dos fichas es un rostro copiado: solo una de
 * ellas, como mucho, tiene su cara. El 16/10/2026 aparecio uno compartido por
 * 15 fichas y el reconocimiento facial mostro a una persona con los datos de
 * otra.
 *
 * Sin argumentos solo lee: lista los grupos repetidos, guarda un respaldo de
 * esos descriptores y cuenta los pares de personas distintas que quedan por
 * debajo del umbral de reconocimiento (no se tocan, solo se informan).
 *
 * Uso:
 *   npm run maintenance:rostros                 -> informe y respaldo
 *   npm run maintenance:rostros -- --aplicar    -> ademas vacia esos rostros
 *
 * Vaciar el rostro es lo mismo que hace la app al borrarlo: la ficha queda
 * "sin rostro" y la persona lo vuelve a registrar delante de la camara.
 * Mientras tanto marca con huella o documento.
 *
 * Lee MONGO_URI y DNSNODE_DNS_SERVERS del .env, igual que la API.
 */
import 'dotenv/config';
import * as dns from 'dns';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import mongoose, { Types } from 'mongoose';
import { FACE_MATCH_THRESHOLD, faceDistance } from '../../src/modules/employee/face-matching';

interface EmployeeRow {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  document?: string;
  faceDescriptor?: number[];
}

/**
 * Por debajo de esto dos rostros son una copia, no dos capturas. Dos fotos de
 * la misma persona quedan bastante mas lejos que esto entre si.
 */
const COPY_DISTANCE = 0.05;

const nombre = (e: EmployeeRow) =>
  `${e.firstName ?? ''} ${e.lastName ?? ''}`.replace(/\s+/g, ' ').trim();

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  if (process.env.DNSNODE_DNS_SERVERS) {
    dns.setServers(process.env.DNSNODE_DNS_SERVERS.split(',').map((s) => s.trim()));
  }
  if (!process.env.MONGO_URI) {
    throw new Error('Falta MONGO_URI en el .env');
  }
  await mongoose.connect(process.env.MONGO_URI);
  const employees = mongoose.connection.db!.collection<EmployeeRow>('employees');

  const conRostro = (
    await employees
      .find(
        { 'faceDescriptor.0': { $exists: true } },
        { projection: { firstName: 1, lastName: 1, document: 1, faceDescriptor: 1 } }
      )
      .toArray()
  ).filter((e) => e.faceDescriptor?.length === 128);

  // Se agrupa por distancia casi nula y no por igualdad exacta: la misma copia
  // guardada con otra precision difiere en el ultimo decimal, y con igualdad
  // exacta una de las 15 fichas del 16/10/2026 se quedaba fuera.
  const padre = conRostro.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < conRostro.length; i++) {
    for (let j = i + 1; j < conRostro.length; j++) {
      if (faceDistance(conRostro[i].faceDescriptor!, conRostro[j].faceDescriptor!) < COPY_DISTANCE) {
        padre[raiz(j)] = raiz(i);
      }
    }
  }
  const grupos = new Map<number, EmployeeRow[]>();
  conRostro.forEach((e, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), e]));
  const repetidos = [...grupos.values()].filter((g) => g.length > 1);
  const afectadas = repetidos.flat();

  console.log(`Fichas con rostro: ${conRostro.length}`);
  console.log(`Grupos con el mismo rostro: ${repetidos.length} (${afectadas.length} fichas)`);
  repetidos.forEach((g, i) =>
    console.log(`  Grupo ${i + 1}: ${g.map(nombre).join(' | ')}`)
  );

  // Pares distintos que el reconocimiento puede confundir. Se informan: el
  // margen de `matchFace` ya rechaza los empates, pero conviene revisarlos.
  const unicos = [...grupos.values()].map((g) => g[0]);
  const cercanos: string[] = [];
  for (let i = 0; i < unicos.length; i++) {
    for (let j = i + 1; j < unicos.length; j++) {
      const d = faceDistance(unicos[i].faceDescriptor!, unicos[j].faceDescriptor!);
      if (d < FACE_MATCH_THRESHOLD) {
        cercanos.push(`  ${nombre(unicos[i])} ~ ${nombre(unicos[j])}: ${d.toFixed(3)}`);
      }
    }
  }
  console.log(`Pares de personas distintas por debajo de ${FACE_MATCH_THRESHOLD}: ${cercanos.length}`);
  cercanos.forEach((linea) => console.log(linea));

  if (afectadas.length > 0) {
    const fecha = new Date().toISOString().slice(0, 10);
    const respaldo = resolve(process.cwd(), 'reports', `rostros-duplicados-${fecha}.json`);
    mkdirSync(resolve(process.cwd(), 'reports'), { recursive: true });
    writeFileSync(
      respaldo,
      JSON.stringify(
        afectadas.map((e) => ({
          _id: String(e._id),
          nombre: nombre(e),
          document: e.document,
          faceDescriptor: e.faceDescriptor,
        })),
        null,
        1
      )
    );
    console.log(`Respaldo: ${respaldo}`);
  }

  if (aplicar && afectadas.length > 0) {
    const ids = afectadas.map((e) => e._id);
    const r = await employees.updateMany({ _id: { $in: ids } }, { $set: { faceDescriptor: [] } });
    const quedan = await employees.countDocuments({
      _id: { $in: ids },
      'faceDescriptor.0': { $exists: true },
    });
    console.log(`Rostros vaciados: ${r.modifiedCount}. Con rostro tras limpiar: ${quedan}`);
  } else if (afectadas.length > 0) {
    console.log('No se ha cambiado nada. Para vaciarlos: npm run maintenance:rostros -- --aplicar');
  }

  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exit(1);
});
