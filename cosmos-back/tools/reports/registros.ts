/**
 * Informe de usuarios del panel y de empleados con sus registros biometricos.
 *
 * Solo lee: no escribe nada en la base. Saca un Markdown con
 *   - los usuarios del panel (nombre, correo, perfil), sin contrasenas;
 *   - los empleados, indicando si tienen huella, rostro y firma registrados.
 *
 * Uso:
 *   npm run report:registros                 -> reports/registros-AAAA-MM-DD.md
 *   npm run report:registros -- salida.md    -> en la ruta indicada
 *
 * Lee MONGO_URI y DNSNODE_DNS_SERVERS del .env, igual que la API.
 *
 * Que cuenta como registrado:
 *   - Huella: hay una plantilla en la coleccion `fingerprints` para el
 *     empleado. La ficha tambien lleva `issetFinger`; si los dos no coinciden
 *     se dice, porque la marcacion por huella usa la plantilla y el panel el
 *     indicador, y una ficha a medias falla en uno de los dos sitios.
 *   - Rostro: `faceDescriptor` con datos (el reconocimiento compara 128 valores).
 *   - Firma: `signature` con la URL de la imagen que se imprime en los formatos.
 */
import 'dotenv/config';
import * as dns from 'dns';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import mongoose, { Types } from 'mongoose';

interface UserRow {
  _id: Types.ObjectId;
  name?: string;
  email?: string;
  roleId?: Types.ObjectId;
  createdAt?: Date;
}

interface RoleRow {
  _id: Types.ObjectId;
  name?: string;
  active?: boolean;
}

interface EmployeeRow {
  _id: Types.ObjectId;
  id?: number;
  vismaId?: string;
  firstName?: string;
  lastName?: string;
  document?: string;
  status?: string;
  signature?: string;
  faceDescriptor?: number[];
  issetFinger?: boolean;
  fingerprintId?: Types.ObjectId | null;
}

type Huella = 'Sí' | 'No' | 'Sí (sin indicador en la ficha)' | 'No (indicador sin plantilla)';

const hoy = new Date().toISOString().slice(0, 10);

/** El texto de una celda no puede romper la tabla. */
function celda(valor: unknown): string {
  const texto = valor === undefined || valor === null || valor === '' ? '-' : String(valor);
  return texto.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
}

function fecha(valor?: Date): string {
  return valor ? new Date(valor).toISOString().slice(0, 10) : '-';
}

function huellaDe(e: EmployeeRow, conPlantilla: Set<string>): Huella {
  const plantilla = conPlantilla.has(String(e._id));
  const indicador = Boolean(e.issetFinger);
  if (plantilla && indicador) return 'Sí';
  if (plantilla) return 'Sí (sin indicador en la ficha)';
  if (indicador) return 'No (indicador sin plantilla)';
  return 'No';
}

function porcentaje(parte: number, total: number): string {
  return total ? `${((parte / total) * 100).toFixed(1)} %` : '0 %';
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Falta MONGO_URI en el .env');
  if (process.env.DNSNODE_DNS_SERVERS) {
    dns.setServers(process.env.DNSNODE_DNS_SERVERS.split(',').map((s) => s.trim()));
  }

  const salida = resolve(process.argv[2] ?? `reports/registros-${hoy}.md`);
  await mongoose.connect(uri, { readPreference: 'secondaryPreferred' });
  const db = mongoose.connection.db!;

  try {
    const [users, roles, employees, huellas] = await Promise.all([
      db.collection<UserRow>('users')
        .find({}, { projection: { name: 1, email: 1, roleId: 1, createdAt: 1 } })
        .toArray(),
      db.collection<RoleRow>('roles').find({}, { projection: { name: 1, active: 1 } }).toArray(),
      db.collection<EmployeeRow>('employees')
        .find(
          {},
          {
            projection: {
              id: 1, vismaId: 1, firstName: 1, lastName: 1, document: 1, status: 1,
              signature: 1, issetFinger: 1, fingerprintId: 1,
              // Solo hace falta saber si hay datos, no los 128 valores.
              faceDescriptor: { $slice: 1 },
            },
          },
        )
        .toArray(),
      db.collection('fingerprints').distinct('employeeId'),
    ]);

    const perfil = new Map(roles.map((r) => [String(r._id), r]));
    const conPlantilla = new Set(huellas.map(String));

    const filasUsuarios = [...users]
      .sort((a, b) => celda(a.name).localeCompare(celda(b.name), 'es'))
      .map((u) => {
        const r = u.roleId ? perfil.get(String(u.roleId)) : undefined;
        const nombrePerfil = r ? `${celda(r.name)}${r.active === false ? ' (inactivo)' : ''}` : 'Sin perfil';
        return `| ${celda(u.name)} | ${celda(u.email)} | ${nombrePerfil} | ${fecha(u.createdAt)} |`;
      });

    const empleados = [...employees]
      .sort((a, b) =>
        `${celda(a.lastName)} ${celda(a.firstName)}`.localeCompare(`${celda(b.lastName)} ${celda(b.firstName)}`, 'es'),
      )
      .map((e) => ({
        e,
        huella: huellaDe(e, conPlantilla),
        rostro: Array.isArray(e.faceDescriptor) && e.faceDescriptor.length > 0,
        firma: typeof e.signature === 'string' && e.signature.trim() !== '',
      }));

    const total = empleados.length;
    const conHuella = empleados.filter((x) => x.huella.startsWith('Sí')).length;
    const conRostro = empleados.filter((x) => x.rostro).length;
    const conFirma = empleados.filter((x) => x.firma).length;
    const completos = empleados.filter((x) => x.huella.startsWith('Sí') && x.rostro && x.firma).length;
    const sinNada = empleados.filter((x) => !x.huella.startsWith('Sí') && !x.rostro && !x.firma).length;
    const incoherentes = empleados.filter((x) => x.huella.includes('(')).length;
    const si = (v: boolean) => (v ? 'Sí' : 'No');

    const md = [
      `# Usuarios y empleados de Cosmos`,
      '',
      `Generado el ${hoy} con \`npm run report:registros\` (solo lectura).`,
      '',
      `## Resumen`,
      '',
      `| Concepto | Cantidad |`,
      `| --- | ---: |`,
      `| Usuarios del panel | ${users.length} |`,
      `| Empleados | ${total} |`,
      `| Con huella | ${conHuella} (${porcentaje(conHuella, total)}) |`,
      `| Con registro facial | ${conRostro} (${porcentaje(conRostro, total)}) |`,
      `| Con firma | ${conFirma} (${porcentaje(conFirma, total)}) |`,
      `| Con los tres registros | ${completos} (${porcentaje(completos, total)}) |`,
      `| Sin ningún registro | ${sinNada} (${porcentaje(sinNada, total)}) |`,
      `| Huella con ficha incoherente | ${incoherentes} |`,
      '',
      `## Usuarios del panel (${users.length})`,
      '',
      `| Nombre | Correo | Perfil | Alta |`,
      `| --- | --- | --- | --- |`,
      ...filasUsuarios,
      '',
      `## Empleados (${total})`,
      '',
      `Huella: *Sí* es plantilla guardada y ficha marcada. *Sí (sin indicador en la ficha)* es que hay plantilla`,
      `y la persona puede marcar con huella, pero la ficha no lo refleja: son huellas registradas antes del`,
      `05/06/2026, cuando el registro todavía no marcaba la ficha, y la app las muestra como "sin huella" en la`,
      `lista de registro. *No (indicador sin plantilla)* es lo contrario: la ficha dice que sí pero no hay plantilla`,
      `con la que comparar, así que esa persona no puede marcar con huella.`,
      '',
      `| # | Documento | Apellidos | Nombres | Estado | Huella | Rostro | Firma | Origen |`,
      `| ---: | --- | --- | --- | --- | --- | --- | --- | --- |`,
      ...empleados.map(({ e, huella, rostro, firma }, i) => {
        const origen = e.id ? `Cosmos ${e.id}` : e.vismaId ? 'Visma' : '-';
        const estado = e.status === 'active' ? 'Activo' : celda(e.status);
        return `| ${i + 1} | ${celda(e.document)} | ${celda(e.lastName)} | ${celda(e.firstName)} | ${estado} | ${huella} | ${si(rostro)} | ${si(firma)} | ${origen} |`;
      }),
      '',
    ].join('\n');

    mkdirSync(dirname(salida), { recursive: true });
    writeFileSync(salida, md, 'utf8');
    console.log(`Informe escrito en ${salida}`);
    console.log(
      `Usuarios: ${users.length}. Empleados: ${total} (huella ${conHuella}, rostro ${conRostro}, firma ${conFirma}, completos ${completos}).`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('No se pudo generar el informe:', error instanceof Error ? error.message : error);
  process.exit(1);
});
