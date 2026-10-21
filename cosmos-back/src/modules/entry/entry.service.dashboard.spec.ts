import { EntryService } from './entry.service';

/**
 * Referencia independiente de los cálculos del dashboard.
 *
 * Este archivo mantiene una implementación **ingenua** de cada cálculo del
 * panel (bucles y `find`, sin los índices `Map` de producción) y compara su
 * salida con la del servicio sobre cientos de conjuntos de datos generados al
 * azar, incluyendo los casos borde que se dan en producción: empleados
 * nombrados que no existen en la base local, nombradas repetidas, entradas sin
 * fecha, ausencias, remates y todas las combinaciones de filtros del panel.
 *
 * Las referencias describen la semántica **correcta** acordada para el panel:
 *
 *  - los filtros de nombrada, navío y turno se encadenan (antes cada `if`
 *    reasignaba desde el arreglo original, así que navío + turno sólo aplicaba
 *    el turno);
 *  - `namedId` es siempre el `staff_vessel_number`, en todos los cálculos;
 *  - las filas de asistencias son una por día, empleado **y nombrada**;
 *  - se ordena antes de paginar;
 *  - la salida en vacío conserva la forma de la salida con datos.
 */

// --------------------------------------------------------------------------
// Generador determinista
// --------------------------------------------------------------------------

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const TURNS = ['07:00 - 15:00', '15:00 - 23:00', '23:00 - 07:00'];
const POSITIONS = ['LIQUIDADOR DE NAVE', 'ESTIBADOR', 'WINCHERO', 'TARJADOR', 'CAPATAZ'];
const SHIPS = ['CMA CGM VOLTAIRE', 'MSC ANNA', 'EVER GIVEN'];

interface Dataset {
  entries: any[];
  nameds: any[];
  employees: any[];
  points: any[];
  startPointId: string;
  endPointId: string;
}

function buildDataset(rng: () => number): Dataset {
  const pointCount = 8;
  const points = Array.from({ length: pointCount }, (_, i) => ({
    _id: `point-${i + 1}`,
    order: i + 1,
    name: `Punto ${i + 1}`,
    nextTolerance: Math.floor(rng() * 30),
    previousTolerance: Math.floor(rng() * 15),
  }));
  const startPointId = points[0]._id;
  const endPointId = points[points.length - 1]._id;

  const employeeCount = 3 + Math.floor(rng() * 12);
  const employees = Array.from({ length: employeeCount }, (_, i) => ({
    _id: `emp-${i}`,
    id: 1000 + i,
    firstName: `NOMBRE${i}`,
    lastName: `APELLIDO${i}`,
    document: `${40000000 + i}`,
  }));

  const dayCount = 1 + Math.floor(rng() * 5);
  const days = Array.from({ length: dayCount }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);

  const nameds: any[] = [];
  let namedId = 2800;
  for (const day of days) {
    const namedsPerDay = 1 + Math.floor(rng() * 3);
    for (let n = 0; n < namedsPerDay; n++) {
      const detailCount = 1 + Math.floor(rng() * 6);
      const listStaffDetail = Array.from({ length: detailCount }, (_, d) => {
        // Una parte del personal nombrado no existe en la base local, igual que
        // ocurre cuando aún no se ha sincronizado.
        const staffId = rng() < 0.15
          ? 9000 + Math.floor(rng() * 50)
          : employees[Math.floor(rng() * employees.length)].id;
        return {
          staff_transmission_id: namedId,
          staff_vessel_id: namedId + 30,
          staff_transmission_detail_id: 40000 + nameds.length * 100 + d,
          staff_id: staffId,
          personal_id: `${40000000 + d}`,
          last_name: `AP${d}`,
          mother_last_name: `AM${d}`,
          first_name: `NO${d}`,
          staff_role_type_id: d,
          staff_role_type_description: POSITIONS[Math.floor(rng() * POSITIONS.length)],
          order_number: d + 1,
          team_number: 1,
        };
      });
      nameds.push({
        staff_transmission_id: namedId,
        staff_vessel_id: namedId + 30,
        vessel_description: SHIPS[Math.floor(rng() * SHIPS.length)],
        voyage_number: `0DV${namedId}`,
        location_id: 'PEPAI - TPE',
        worker_date: day.split('-').reverse().join('/'),
        shift_description: TURNS[Math.floor(rng() * TURNS.length)],
        pier_description: '2-A',
        berth_description: '',
        staff_vessel_number: `08${namedId % 100}-1`,
        listStaffDetail,
      });
      namedId++;
    }
  }

  // De vez en cuando se repite una nombrada, para cubrir el caso de claves
  // duplicadas donde `find` se queda con la primera.
  if (rng() < 0.2 && nameds.length > 0) {
    nameds.push({ ...nameds[0], vessel_description: 'DUPLICADA' });
  }

  const entries: any[] = [];
  for (const named of nameds) {
    const workerDate = named.worker_date.split('/').reverse().join('-');
    for (const detail of named.listStaffDetail) {
      const employee = employees.find(e => e.id === detail.staff_id);
      if (!employee) {
        continue;
      }
      if (rng() < 0.2) {
        continue;
      }
      const marks = 1 + Math.floor(rng() * pointCount);
      for (let p = 0; p < marks; p++) {
        const isAbsence = p === 0 && rng() < 0.2;
        const hasDate = rng() > 0.05;
        entries.push({
          _id: `entry-${entries.length}`,
          employeeId: employee._id,
          pointId: points[p]._id,
          namedId: named.staff_transmission_id,
          workerDate,
          isAbsence,
          isRemate: rng() < 0.15,
          date: hasDate
            ? new Date(`${workerDate}T${String(6 + Math.floor(rng() * 12)).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}:00`)
            : null,
        });
      }
    }
  }

  return { entries, nameds, employees, points, startPointId, endPointId };
}

function buildFilters(rng: () => number, data: Dataset): any {
  const pick = <T>(list: T[]): T | '' => (rng() < 0.5 && list.length > 0 ? list[Math.floor(rng() * list.length)] : '');
  return {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    employeeId: pick(data.employees.map(e => e._id)),
    namedId: pick(data.nameds.map(n => n.staff_vessel_number)),
    position: pick(POSITIONS),
    ship: pick(SHIPS),
    turn: pick(TURNS),
    limit: 1 + Math.floor(rng() * 10),
    page: 1 + Math.floor(rng() * 3),
    orderBy: '',
    orderDirection: '',
  };
}

// --------------------------------------------------------------------------
// Implementaciones originales (previas a la optimización)
// --------------------------------------------------------------------------

const getZeroMonth = (month: number): any => (month < 10 ? `0${month}` : month);
const getStartTime = (turn: string) => turn.split('-')[0].trim();

function originalGroupByEmployee(entries: any[], nameds: any[], totalPoints: number) {
  const newEntries: any[] = [];
  entries.forEach(entry => {
    const employeeId = entry?.employeeId?._id?.toString();
    if (employeeId) {
      const employee = newEntries.find(entryRes => entryRes.employee._id.toString() === employeeId && entryRes.named.staff_transmission_id === entry.namedId);
      const named = nameds.find(named => named.staff_transmission_id === entry.namedId);
      if (employee) {
        employee.entries.push(entry);
      } else {
        if (named) {
          const listStaffDetail = named.listStaffDetail.find(detail => detail.staff_id === entry.employeeId.id);
          if (listStaffDetail) {
            newEntries.push({ employee: entry.employeeId, named, entries: [entry], listStaffDetail, totalPoints });
          }
        }
      }
    }
  });
  return newEntries;
}

/** Filtros de nombrada, navío y turno, encadenados. */
function refFilterNameds(nameds: any[], dto: any): any[] {
  let filtered = nameds;
  if (dto.namedId) {
    filtered = filtered.filter(named => named.staff_vessel_number === dto.namedId);
  }
  if (dto.ship) {
    filtered = filtered.filter(named => named.vessel_description === dto.ship);
  }
  if (dto.turn) {
    filtered = filtered.filter(named => named.shift_description === dto.turn);
  }
  return filtered;
}

/** Personal registrado localmente que pasa los filtros de cargo y empleado. */
function refStaffDetails(named: any, dto: any, employees: any[]): any[] {
  let details = (named.listStaffDetail ?? []).filter(detail =>
    employees.some(employee => employee.id === detail.staff_id)
  );
  if (dto.position) {
    details = details.filter(detail => detail.staff_role_type_description === dto.position);
  }
  if (dto.employeeId) {
    const staffId = employees.find(employee => employee._id.toString() === dto.employeeId)?.id;
    details = details.filter(detail => detail.staff_id === staffId);
  }
  return details;
}

function refFormatAsistances(entries: any[], nameds: any[], employees: any[], dashboardDto: any, endPointId: string, totalPoints: number) {
  let entriesRes: any[] = [];

  // Una fila por día, empleado y nombrada.
  const keys: string[] = [];
  for (const entry of entries) {
    const key = `${entry.workerDate}|${entry.employeeId.toString()}|${entry.namedId}`;
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    const [workerDate, employeeId, namedIdRaw] = key.split('|');
    const namedId = Number(namedIdRaw);
    const named = nameds.find(n => n.staff_transmission_id === namedId);
    if (!named) {
      continue;
    }
    const employee = employees.find(e => e._id.toString() === employeeId);
    const groupEntries = entries.filter(entry =>
      entry.workerDate === workerDate &&
      entry.employeeId.toString() === employeeId &&
      entry.namedId === namedId
    );
    const issetEndPoint = entries.some(entry =>
      entry.pointId.toString() === endPointId.toString() &&
      entry.employeeId.toString() === employeeId &&
      entry.namedId === named.staff_transmission_id
    );
    entriesRes.push({
      named: `${named.staff_transmission_id} - ${named.staff_vessel_number}`,
      namedNumber: named.staff_vessel_number,
      location: `${named.location_id}`,
      muelle: `${named.pier_description}`,
      ship: `${named.vessel_description} - ${named.voyage_number}`,
      shipName: named.vessel_description,
      position: named.listStaffDetail.find(detail => detail.staff_id === employee?.id)?.staff_role_type_description || '',
      workerDate,
      employeeId,
      employee: employee ? `${employee.firstName} ${employee.lastName}` : '',
      turn: named.shift_description || '',
      markings: `${groupEntries.length} / ${totalPoints} ${issetEndPoint ? '-S' : ''}`,
      isAbsence: groupEntries.some(entry => entry.isAbsence),
    });
  }

  if (dashboardDto.turn) {
    entriesRes = entriesRes.filter(entry => entry.turn === dashboardDto.turn);
  }
  if (dashboardDto.position) {
    entriesRes = entriesRes.filter(entry => entry.position === dashboardDto.position);
  }
  if (dashboardDto.ship) {
    entriesRes = entriesRes.filter(entry => entry.shipName === dashboardDto.ship);
  }
  if (dashboardDto.namedId) {
    entriesRes = entriesRes.filter(entry => entry.namedNumber === dashboardDto.namedId);
  }
  if (dashboardDto.employeeId) {
    entriesRes = entriesRes.filter(entry => entry.employeeId === dashboardDto.employeeId);
  }

  if (dashboardDto.orderBy && dashboardDto.orderDirection) {
    const direction = dashboardDto.orderDirection === 'asc' ? 1 : -1;
    entriesRes.sort((a, b) => direction * String(a[dashboardDto.orderBy] ?? '').localeCompare(String(b[dashboardDto.orderBy] ?? '')));
  } else {
    entriesRes.sort((a, b) =>
      b.workerDate.localeCompare(a.workerDate) ||
      b.turn.localeCompare(a.turn) ||
      b.named.localeCompare(a.named) ||
      b.employee.localeCompare(a.employee)
    );
  }

  const startIndex = (dashboardDto.page - 1) * dashboardDto.limit;
  const endIndex = startIndex + dashboardDto.limit;

  return {
    data: entriesRes.slice(startIndex, endIndex),
    total: entriesRes.length,
    page: dashboardDto.page,
    limit: dashboardDto.limit,
  };
}

function refGetTotalAssistancesByNamed(entries: any[], nameds: any[]): number {
  return nameds.filter(named =>
    entries.some(entry => entry.namedId === named.staff_transmission_id && !entry.isAbsence)
  ).length;
}

function refGetTotalNames(nameds: any[], dashboardDto: any, allEmployees: any[], entries: any[]): number[] {
  let namedsFiltered = refFilterNameds(nameds, dashboardDto);
  if (dashboardDto.employeeId) {
    const staffId = allEmployees.find(e => e._id.toString() === dashboardDto.employeeId)?.id;
    namedsFiltered = namedsFiltered.filter(named =>
      (named.listStaffDetail ?? []).some(detail => detail.staff_id === staffId)
    );
  }
  if (dashboardDto.position) {
    namedsFiltered = namedsFiltered.filter(named =>
      (named.listStaffDetail ?? []).some(detail => detail.staff_role_type_description === dashboardDto.position)
    );
  }
  return [namedsFiltered.length, refGetTotalAssistancesByNamed(entries, namedsFiltered)];
}

function refGetTotalAssistances(entries: any[], dashboardDto: any, nameds: any[], employees: any[], startPointId: string, endPointId: string): number[] {
  const namedsFiltered = refFilterNameds(nameds, dashboardDto);
  if (namedsFiltered.length === 0) {
    return [0, 0, 0];
  }
  const startEntries = entries.filter(entry => entry.pointId.toString() === startPointId.toString());

  let assistances = 0;
  let registered = 0;
  let noAssistances = 0;

  for (const named of namedsFiltered) {
    const details = refStaffDetails(named, dashboardDto, employees);
    for (const detail of details) {
      const employee = employees.find(e => e.id === detail.staff_id);
      const own = startEntries.filter(entry =>
        entry.employeeId.toString() === employee?._id.toString() &&
        entry.namedId === named.staff_transmission_id
      );
      for (const entry of own) {
        if (entry.isAbsence) {
          noAssistances++;
        } else {
          assistances++;
        }
      }
    }
    registered += details.length;
  }
  return [assistances, registered, noAssistances];
}

function refGetChart2Data(entries: any[], dashboardDto: any, nameds: any[], employees: any[], startPointId: string, endPointId: string, points: any[]): number[] {
  const namedsFiltered = refFilterNameds(nameds, dashboardDto);
  if (namedsFiltered.length === 0) {
    return [0, 0, 0, 0, 0, 0];
  }

  let assistances = 0;
  let tolerances = 0;
  let timeOuts = 0;
  let failures = 0;
  let incompletedEntries = 0;
  let incompletedRemates = 0;

  const startPoint = points.find(p => p._id.toString() === startPointId.toString());

  for (const named of namedsFiltered) {
    for (const detail of refStaffDetails(named, dashboardDto, employees)) {
      const employee = employees.find(e => e.id === detail.staff_id);
      const own = entries.filter(entry =>
        entry.pointId.toString() === startPointId.toString() &&
        entry.employeeId.toString() === employee?._id.toString() &&
        entry.namedId === named.staff_transmission_id
      );
      const endEntry = entries.find(entry =>
        entry.pointId.toString() === endPointId.toString() &&
        entry.employeeId.toString() === employee?._id.toString() &&
        entry.namedId === named.staff_transmission_id
      );
      const isRemate = endEntry && endEntry.isRemate;

      own.forEach((entry, index) => {
        const nextEntry = own[index + 1];
        if (isRemate && (!nextEntry || !nextEntry.isRemate)) {
          incompletedRemates += 1;
        }
        if (!endEntry && !entry.isAbsence) {
          incompletedEntries += 1;
        }
        if (!startPoint) {
          return;
        }
        const entryDate = new Date(entry.workerDate + ' ' + getStartTime(named.shift_description) + ':00').getTime();
        if (!entry?.date) {
          return;
        }
        if (entry.isAbsence) {
          failures += 1;
          return;
        }
        if (new Date(entry.date).getTime() <= entryDate) {
          assistances += 1;
        } else if ((new Date(entry.date).getTime() - entryDate) / (1000 * 60) <= (startPoint.nextTolerance || 0)) {
          tolerances += 1;
        } else {
          timeOuts += 1;
        }
      });
    }
  }
  return [assistances, tolerances, timeOuts, failures, incompletedEntries, incompletedRemates];
}

function refGetChart3Data(entries: any[], dashboardDto: any, nameds: any[], employees: any[], startPointId: string, endPointId: string): any[] {
  const namedsFiltered = refFilterNameds(nameds, dashboardDto);
  if (namedsFiltered.length === 0) {
    return [];
  }
  const response: any[] = [];
  for (const named of namedsFiltered) {
    for (const detail of refStaffDetails(named, dashboardDto, employees)) {
      const employee = employees.find(e => e.id === detail.staff_id);
      const count = entries.filter(entry =>
        entry.pointId.toString() === startPointId.toString() &&
        entry.employeeId.toString() === employee?._id.toString() &&
        entry.namedId === named.staff_transmission_id &&
        !entry.isAbsence
      ).length;
      if (!detail.staff_role_type_description || count === 0) {
        continue;
      }
      const existing = response.find(row => row.position === detail.staff_role_type_description);
      if (existing) {
        existing.assistances += count;
      } else {
        response.push({ position: detail.staff_role_type_description, assistances: count });
      }
    }
  }
  response.sort((a, b) => b.assistances - a.assistances || a.position.localeCompare(b.position));
  return response;
}

function refGetChart5Data(entries: any[], dashboardDto: any, nameds: any[], employees: any[], startPointId: string, endPointId: string) {
  const namedsFiltered = refFilterNameds(nameds, dashboardDto);
  if (namedsFiltered.length === 0) {
    return { labels: [], values: [] };
  }
  const turnCounts = new Map<string, number>();
  for (const named of namedsFiltered) {
    let turnAssistances = 0;
    for (const detail of refStaffDetails(named, dashboardDto, employees)) {
      const employee = employees.find(e => e.id === detail.staff_id);
      if (!employee) continue;
      turnAssistances += entries.filter(entry =>
        entry.pointId.toString() === startPointId.toString() &&
        entry.employeeId.toString() === employee._id.toString() &&
        entry.namedId === named.staff_transmission_id &&
        !entry.isAbsence
      ).length;
    }
    const turnKey = named.shift_description || 'Sin turno';
    turnCounts.set(turnKey, (turnCounts.get(turnKey) || 0) + turnAssistances);
  }
  const labels = Array.from(turnCounts.keys()).sort((a, b) => a.localeCompare(b));
  return { labels, values: labels.map(label => turnCounts.get(label) as number) };
}

function refGetChart1Data(entries: any[], dashboardDto: any, nameds: any[], employees: any[], startPointId: string, endPointId: string) {
  const emptySeries = () => ({ labels: [] as string[], data: [] as number[] });
  const namedsFiltered = refFilterNameds(nameds, dashboardDto);
  if (namedsFiltered.length === 0) {
    return { daily: emptySeries(), weekly: emptySeries(), monthly: emptySeries(), yearly: emptySeries() };
  }

  const filteredEntries: any[] = [];
  for (const named of namedsFiltered) {
    for (const detail of refStaffDetails(named, dashboardDto, employees)) {
      const employee = employees.find(e => e.id === detail.staff_id);
      if (!employee) continue;
      filteredEntries.push(...entries.filter(entry =>
        entry.pointId.toString() === startPointId.toString() &&
        !entry.isAbsence &&
        entry.employeeId.toString() === employee._id.toString() &&
        entry.namedId === named.staff_transmission_id
      ));
    }
  }

  const dayCounts = new Map<string, number>();
  const weekCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const yearCounts = new Map<string, number>();

  const getISOWeekKey = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  filteredEntries.forEach(entry => {
    const createdAt = entry.date ? new Date(entry.date) : null;
    if (!createdAt || isNaN(createdAt.getTime())) return;
    const dayKey = `${createdAt.getFullYear()}-${getZeroMonth(createdAt.getMonth() + 1)}-${getZeroMonth(createdAt.getDate())}`;
    const monthKey = `${createdAt.getFullYear()}-${getZeroMonth(createdAt.getMonth() + 1)}`;
    dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
    weekCounts.set(getISOWeekKey(createdAt), (weekCounts.get(getISOWeekKey(createdAt)) || 0) + 1);
    monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
    yearCounts.set(`${createdAt.getFullYear()}`, (yearCounts.get(`${createdAt.getFullYear()}`) || 0) + 1);
  });

  const toSeries = (map: Map<string, number>) => {
    const rows = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return { labels: rows.map(([label]) => label), data: rows.map(([, count]) => count) };
  };

  return {
    daily: toSeries(dayCounts),
    weekly: toSeries(weekCounts),
    monthly: toSeries(monthCounts),
    yearly: toSeries(yearCounts),
  };
}

function refGetChart4Data(entries: any[], dashboardDto: any, nameds: any[], employees: any[], startPointId: string, endPointId: string) {
  const page = dashboardDto.page;
  const limit = dashboardDto.limit;
  const namedsFiltered = refFilterNameds(nameds, dashboardDto);
  if (namedsFiltered.length === 0) {
    return { data: [], total: 0, page, limit };
  }

  const needsStaffFilter = !!dashboardDto.position || !!dashboardDto.employeeId;

  let rows = namedsFiltered.map(named => {
    const assistants = new Set<string>();
    entries.forEach(entry => {
      if (entry.pointId.toString() !== startPointId.toString()) return;
      if (entry.isAbsence) return;
      if (entry.namedId !== named.staff_transmission_id) return;
      assistants.add(entry.employeeId.toString());
    });
    return {
      number: `${named.staff_transmission_id} - ${named.staff_vessel_number}`,
      ship: named.vessel_description,
      location: named.location_id,
      date: named.worker_date,
      staffCount: needsStaffFilter
        ? refStaffDetails(named, dashboardDto, employees).length
        : (named.listStaffDetail ?? []).length,
      turn: named.shift_description,
      assistantsCount: assistants.size,
    };
  });

  if (needsStaffFilter) {
    rows = rows.filter(row => row.staffCount > 0);
  }

  const sortKey = (date: string) => String(date ?? '').split('/').reverse().join('-');
  rows.sort((a, b) =>
    sortKey(b.date).localeCompare(sortKey(a.date)) ||
    String(b.turn ?? '').localeCompare(String(a.turn ?? '')) ||
    a.number.localeCompare(b.number)
  );

  const startIndex = (page - 1) * limit;
  return { data: rows.slice(startIndex, startIndex + limit), total: rows.length, page, limit };
}

describe('EntryService · cálculos del dashboard', () => {
  let service: any;

  beforeEach(() => {
    const configStub = { get: (_key: string, fallback?: any) => fallback };
    service = new (EntryService as any)(
      {},            // entryModel
      {},            // namedService
      {},            // namedRecordService
      {},            // employeeService
      configStub,    // configService
      {},            // pointService
      {}             // talkService
    );
  });

  const ITERATIONS = 250;

  it('formatAsistances coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed);
      const data = buildDataset(rng);
      const filters = buildFilters(rng, data);
      const expected = refFormatAsistances(data.entries, data.nameds, data.employees, filters, data.endPointId, data.points.length);
      const actual = service.formatAsistances(data.entries, data.nameds, data.employees, filters, data.endPointId, data.points.length);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('getTotalAssistancesByNamed coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 5000);
      const data = buildDataset(rng);
      const expected = refGetTotalAssistancesByNamed(data.entries, data.nameds);
      const actual = service.getTotalAssistancesByNamed(data.entries, data.nameds);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('getTotalNames coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 9000);
      const data = buildDataset(rng);
      const filters = buildFilters(rng, data);
      const expected = refGetTotalNames(data.nameds, filters, data.employees, data.entries);
      const actual = service.getTotalNames(data.nameds, filters, data.employees, data.entries);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('getTotalAssistances coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 13000);
      const data = buildDataset(rng);
      const filters = buildFilters(rng, data);
      const expected = refGetTotalAssistances([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      const actual = service.getTotalAssistances([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('getChart1Data coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 17000);
      const data = buildDataset(rng);
      const filters = buildFilters(rng, data);
      const expected = refGetChart1Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      const actual = service.getChart1Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('getChart2Data coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 21000);
      const data = buildDataset(rng);
      const filters = buildFilters(rng, data);
      // Se alterna un caso donde el punto inicial no está en la lista de puntos.
      const points = seed % 7 === 0 ? data.points.slice(1) : data.points;
      const expected = refGetChart2Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId, points);
      const actual = service.getChart2Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId, points);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('getChart3Data coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 25000);
      const data = buildDataset(rng);
      const filters = buildFilters(rng, data);
      const expected = refGetChart3Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      const actual = service.getChart3Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('getChart4Data coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 29000);
      const data = buildDataset(rng);
      const filters = buildFilters(rng, data);
      const expected = refGetChart4Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      const actual = service.getChart4Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('getChart5Data coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 33000);
      const data = buildDataset(rng);
      const filters = buildFilters(rng, data);
      const expected = refGetChart5Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      const actual = service.getChart5Data([...data.entries], filters, [...data.nameds], data.employees, data.startPointId, data.endPointId);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });

  it('groupByEmployee coincide con la implementación de referencia', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const rng = makeRng(seed + 37000);
      const data = buildDataset(rng);
      // `search()` entrega las entradas con `employeeId` poblado por Mongoose.
      const populated = data.entries.map(entry => ({
        ...entry,
        employeeId: data.employees.find(e => e._id === entry.employeeId),
      }));
      const expected = originalGroupByEmployee(populated, data.nameds, data.points.length);
      const actual = service.groupByEmployee(populated, data.nameds, data.points.length);
      expect({ seed, actual }).toEqual({ seed, actual: expected });
    }
  });
});
