import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';

/**
 * Mongo real, en memoria, por fichero de test.
 *
 * Se eligio `mongodb-memory-server` sobre Testcontainers porque no necesita un
 * demonio de Docker: el mismo comando corre en Windows, en el runner de CI y en
 * el portatil de quien acabe de clonar el repo. Lo que se pierde —replica sets,
 * sharding, transacciones distribuidas— no lo usa este backend.
 *
 * El servidor se comparte por fichero y las colecciones se vacian entre casos.
 * Compartirlo es lo que hace que la suite tarde segundos y no minutos; vaciarlas
 * es lo que impide que un test dependa de lo que dejo el anterior, que es la
 * forma mas comun de suite verde que no prueba nada.
 *
 * El vaciado va contra la conexion que crea `MongooseModule.forRoot`, no contra
 * `mongoose.connection`. Esa distincion no es cosmetica: Nest abre su propia
 * conexion, la global se queda sin usar, y limpiar la global es una limpieza que
 * no limpia nada. Los documentos se acumulaban entre tests y la paginacion
 * empezaba a devolver resultados de casos anteriores.
 */

let server: MongoMemoryServer | undefined;
const conexiones = new Set<Connection>();

/**
 * Registra la conexion de una aplicacion de prueba para que se vacie entre
 * casos. La llama `createTestApp`; no hace falta invocarla a mano.
 */
export function registrarConexion(connection: Connection): void {
  conexiones.add(connection);
}

async function vaciar(): Promise<void> {
  await Promise.all(
    [...conexiones].map(async (connection) => {
      const db = connection.db;
      if (connection.readyState !== 1 || !db) return;
      const colecciones = await db.listCollections().toArray();
      await Promise.all(colecciones.map((c) => db.collection(c.name).deleteMany({})));
    })
  );
}

export interface MongoHandle {
  /** URI del servidor en memoria. */
  uri(): string;
  /** Vacia todas las colecciones sin tirar la conexion. */
  clear(): Promise<void>;
}

export function withMongo(): MongoHandle {
  let uri = '';

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    uri = server.getUri();
    process.env.MONGO_URI = uri;
  });

  afterEach(vaciar);

  afterAll(async () => {
    conexiones.clear();
    await server?.stop();
    server = undefined;
    delete process.env.MONGO_URI;
  });

  return { uri: () => uri, clear: vaciar };
}
