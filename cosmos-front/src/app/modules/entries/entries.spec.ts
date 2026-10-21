import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import Entries from './entries';
import { environment } from '../../../environments/environment';
import { componentProviders, httpMock } from '../../../testing/setup';

/**
 * Listado de marcaciones. Casi toda su logica esta en `formatEntries`, que
 * aplana la respuesta cruzada de la API en las filas de la tabla; ahi es donde
 * se calcula el contador de marcaciones que mira quien supervisa la jornada.
 */
describe('Entries', () => {
  let component: Entries;
  let fixture: ComponentFixture<Entries>;
  let router: Router;
  const api = environment.api;

  const filaCruda = (extra: Record<string, unknown> = {}) => ({
    named: {
      staff_transmission_id: 9,
      vessel_description: 'Nave Uno',
      worker_date: '09/03/2026',
      shift_description: '07:00 - 15:00',
    },
    employee: { _id: 'e1', firstName: 'Ana Maria', lastName: 'Torres Paz', document: '12345678' },
    listStaffDetail: { staff_role_type_description: 'Estibador' },
    entries: [{ pointId: { order: 1 }, isRemate: false, isAbsence: false }],
    totalPoints: 4,
    ...extra,
  });

  const respuesta = (data: unknown[]) => ({ data, total: data.length, page: 1, limit: 10 });

  const montar = async (queryParams: Record<string, string> = {}) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Entries],
      providers: componentProviders({ queryParams }),
    }).compileComponents();

    fixture = TestBed.createComponent(Entries);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  };

  /** Atiende las dos peticiones de la carga inicial. */
  const arrancar = (filas: unknown[] = [filaCruda()]) => {
    fixture.detectChanges();
    httpMock().expectOne(`${api}/employee`).flush([]);
    httpMock().expectOne(`${api}/entry/search`).flush(respuesta(filas));
  };

  beforeEach(() => montar());

  it('carga empleados y marcaciones al entrar', () => {
    arrancar();

    expect(component.entries.length).toBe(1);
  });

  it('busca con los filtros de la pantalla en el cuerpo', () => {
    fixture.detectChanges();
    httpMock().expectOne(`${api}/employee`).flush([]);

    const peticion = httpMock().expectOne(`${api}/entry/search`);
    expect(peticion.request.body).toEqual(
      jasmine.objectContaining({ page: component.page, limit: component.limit })
    );
    peticion.flush(respuesta([]));
  });

  it('hereda fecha y turno de la vista por nombrada', async () => {
    await montar({ workerDate: '2026-03-09', turn: '23:00 - 07:00' });
    fixture.detectChanges();
    httpMock().expectOne(`${api}/employee`).flush([]);

    // Sin leer los parametros, entrar desde una nombrada abriria el listado en
    // el dia de hoy y quien la superviso no encontraria nada.
    const peticion = httpMock().expectOne(`${api}/entry/search`);
    expect(peticion.request.body).toEqual(
      jasmine.objectContaining({ workerDate: '2026-03-09', turn: '23:00 - 07:00' })
    );
    peticion.flush(respuesta([]));
  });

  describe('formatEntries', () => {
    it('compone el nombre completo y la firma con los primeros terminos', () => {
      arrancar();

      const [fila] = component.entries;
      expect(fila.employee).toBe('Ana Maria Torres Paz');
      // La firma es lo que se imprime en el formato: un nombre compuesto entero
      // no cabe en la celda.
      expect(fila.signature).toBe('ANA TORRES');
    });

    it('el contador de marcaciones es marcadas sobre el total de puntos', () => {
      arrancar();

      expect(component.entries[0].markings).toBe('1/4 ');
    });

    it('marca con -S la jornada que paso por el punto de salida', () => {
      // La salida la fija el backend (`endPointId`), sea cual sea su orden:
      // hoy son 2 puntos con ordenes 1 y 5.
      arrancar([
        filaCruda({
          entries: [{ pointId: { _id: 'p-salida', order: 5 }, isRemate: false, isAbsence: false }],
          totalPoints: 2,
          endPointId: 'p-salida',
        }),
      ]);

      // El sufijo distingue una jornada cerrada de una a medias, que es lo que
      // decide si hace falta ir a buscar a esa persona.
      expect(component.entries[0].markings).toBe('1/2 -S');
    });

    it('no marca -S por pasar por un punto intermedio', () => {
      arrancar([
        filaCruda({
          entries: [{ pointId: { _id: 'p-medio', order: 8 }, isRemate: false, isAbsence: false }],
          endPointId: 'p-salida',
        }),
      ]);

      expect(component.entries[0].markings).not.toContain('-S');
    });

    it('una jornada con cualquier ausencia se marca como ausencia', () => {
      arrancar([
        filaCruda({
          entries: [
            { pointId: { order: 1 }, isAbsence: false },
            { pointId: { order: 2 }, isAbsence: true },
          ],
        }),
      ]);

      expect(component.entries[0].isAbsence).toBeTrue();
    });

    it('sin marcaciones el contador arranca en cero', () => {
      arrancar([filaCruda({ entries: [] })]);

      expect(component.entries[0].markings).toBe('0/4 ');
      expect(component.entries[0].isAbsence).toBeFalse();
    });
  });

  it('los desplegables de nave y cargo salen sin repetidos', () => {
    arrancar([filaCruda(), filaCruda(), filaCruda({ listStaffDetail: { staff_role_type_description: 'Winchero' } })]);

    expect(component.ships).toEqual(['Nave Uno']);
    expect(component.positions.sort()).toEqual(['Estibador', 'Winchero']);
  });

  it('cambiar de pagina vuelve a buscar con la pagina y el limite nuevos', () => {
    arrancar();

    component.pageChange({ page: 3, limit: 50 });

    const peticion = httpMock().expectOne(`${api}/entry/search`);
    expect(peticion.request.body).toEqual(jasmine.objectContaining({ page: 3, limit: 50 }));
    peticion.flush(respuesta([]));
  });

  it('limpiar filtros vuelve a pedir la primera pagina sin filtros', () => {
    arrancar();
    component.selectedShip = 'Nave Uno';
    component.searchTerm = 'ana';
    component.page = 3;

    component.clearFilters();

    expect(component.selectedShip).toBe('');
    expect(component.searchTerm).toBe('');
    const peticion = httpMock().expectOne(`${api}/entry/search`);
    expect(peticion.request.body.page).toBe(1);
    expect(peticion.request.body.search).toBeUndefined();
    expect(peticion.request.body.ship).toBeUndefined();
    peticion.flush(respuesta([filaCruda()]));
    expect(component.entries.length).toBe(1);
  });

  it('nave, cargo y nombre se filtran en la API desde la primera pagina', () => {
    arrancar();
    component.page = 2;
    component.selectedShip = 'Nave Uno';
    component.selectedPosition = 'Estibador';
    component.searchTerm = '  ana ';

    component.search();

    // Filtrar en el navegador solo miraba la pagina recibida y el total no
    // cuadraba con lo que se veia.
    const peticion = httpMock().expectOne(`${api}/entry/search`);
    expect(peticion.request.body).toEqual(
      jasmine.objectContaining({ page: 1, search: 'ana', ship: 'Nave Uno', position: 'Estibador' })
    );
    peticion.flush({ ...respuesta([filaCruda()]), ships: ['Nave Dos', 'Nave Uno'], positions: ['Estibador'] });
    // Las opciones son las de la jornada entera, que manda la API.
    expect(component.ships).toEqual(['Nave Dos', 'Nave Uno']);
    expect(component.selectedShip).toBe('Nave Uno');
  });

  it('anadir y editar navegan al formulario', () => {
    arrancar();

    component.addEntry();
    expect(router.navigate).toHaveBeenCalledWith(['/marcaciones/agregar']);

    component.editEntry('x1');
    expect(router.navigate).toHaveBeenCalledWith(['/marcaciones/agregar', 'x1']);
  });

  it('el color del contador distingue jornada completa de jornada a medias', () => {
    arrancar();

    expect(component.getMarkingsClass({ completed: 4, total: 4 })).toContain('bg-blue-600');
    expect(component.getMarkingsClass({ completed: 1, total: 4 })).toContain('bg-blue-100');
  });
});
