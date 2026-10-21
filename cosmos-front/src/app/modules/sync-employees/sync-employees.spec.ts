import { ComponentFixture, TestBed } from '@angular/core/testing';
import SyncEmployees, { csvCell } from './sync-employees';
import { environment } from '../../../environments/environment';
import { componentProviders, httpMock } from '../../../testing/setup';
import { NotificationService } from '../../services/notification.service';

describe('SyncEmployees', () => {
  let component: SyncEmployees;
  let fixture: ComponentFixture<SyncEmployees>;
  let notificaciones: NotificationService;
  const api = environment.api;

  const resumen = (extra: Record<string, unknown> = {}) => ({
    totalProcessed: 12,
    newEmployees: 3,
    existingEmployees: 9,
    errors: [],
    ...extra,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SyncEmployees],
      providers: componentProviders(),
    }).compileComponents();

    fixture = TestBed.createComponent(SyncEmployees);
    component = fixture.componentInstance;
    notificaciones = TestBed.inject(NotificationService);
    spyOn(notificaciones, 'show');
    fixture.detectChanges();
    httpMock().expectOne(`${api}/employee/sync-runs?limit=10`).flush([]);
  });

  const ejecucion = (extra: Record<string, unknown> = {}) => ({
    _id: 'r1',
    startedAt: '2026-09-18T15:00:00.000Z',
    status: 'success',
    totalProcessed: 12,
    newEmployees: 3,
    existingEmployees: 9,
    errors: [],
    errorCount: 0,
    failureMessage: '',
    triggeredBy: 'ana@cosmos.com.pe',
    ...extra,
  });

  it('no sincroniza nada al entrar en la pantalla', () => {
    // Es una accion destructiva sobre el maestro de personal: tiene que
    // dispararla una persona, no la navegacion. Solo lee el historial.
    httpMock().expectNone(`${api}/employee/sync-from-named`);
    expect(component.isSyncing()).toBeFalse();
  });

  it('al entrar muestra la ultima ejecucion con sus cifras (CKI11)', async () => {
    component.loadRuns();
    httpMock().expectOne(`${api}/employee/sync-runs?limit=10`).flush([
      ejecucion({ status: 'partial', errors: ['DNI duplicado'], errorCount: 1 }),
      ejecucion({ _id: 'r0' }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const texto: string = fixture.nativeElement.textContent;
    expect(component.lastRun()?._id).toBe('r1');
    expect(texto).toContain('Última sincronización');
    expect(texto).toContain('Con errores');
    expect(texto).toContain('Historial (2 ejecuciones)');
  });

  it('sin ejecuciones lo dice', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Todavía no se ha registrado ninguna sincronización');
  });

  describe('sincronizacion', () => {
    const sincronizar = () => {
      void component.syncEmployees();
      return httpMock().expectOne(`${api}/employee/sync-from-named`);
    };

    // Al terminar, bien o mal, se vuelve a leer el historial.
    afterEach(() => {
      httpMock().match(`${api}/employee/sync-runs?limit=10`).forEach((r) => r.flush([]));
    });

    it('marca la pantalla como ocupada mientras corre', () => {
      const peticion = sincronizar();

      expect(component.isSyncing()).toBeTrue();
      peticion.flush(resumen());
    });

    it('muestra el resumen al terminar', () => {
      sincronizar().flush(resumen());

      expect(component.showResults()).toBeTrue();
      expect(component.syncResult()?.newEmployees).toBe(3);
      expect(component.isSyncing()).toBeFalse();
    });

    it('un resumen con errores se anuncia como error, no como exito', () => {
      sincronizar().flush(resumen({ errors: ['DNI 12345678 duplicado'] }));

      // El servidor responde 200 aunque parte del lote falle. Anunciarlo como
      // exito dejaria a quien sincroniza creyendo que el maestro esta al dia.
      expect(notificaciones.show).toHaveBeenCalledWith(
        'Sincronización completada con 1 errores',
        'error'
      );
    });

    it('un resumen limpio se anuncia como exito con las cifras', () => {
      sincronizar().flush(resumen());

      expect(notificaciones.show).toHaveBeenCalledWith(
        'Sincronización correcta: 3 empleados creados y 9 actualizados',
        'success'
      );
    });

    it('un fallo de red avisa y libera la pantalla', () => {
      sincronizar().flush({}, { status: 500, statusText: 'Server Error' });

      expect(notificaciones.show).toHaveBeenCalledWith('Error al sincronizar empleados', 'error');
      expect(component.isSyncing()).toBeFalse();
      expect(component.showResults()).toBeFalse();
    });
  });

  it('limpiar borra el resumen de la pantalla', () => {
    void component.syncEmployees();
    httpMock().expectOne(`${api}/employee/sync-from-named`).flush(resumen());
    httpMock().expectOne(`${api}/employee/sync-runs?limit=10`).flush([]);

    component.clearResults();

    expect(component.syncResult()).toBeNull();
    expect(component.showResults()).toBeFalse();
  });

  describe('descarga del CSV', () => {
    it('consulta la lista con estado', () => {
      void component.downloadEmployeesCsv();

      const peticion = httpMock().expectOne(`${api}/employee/list-with-status`);
      expect(component.isDownloadingCsv()).toBeTrue();
      peticion.flush([]);
    });

    it('un fallo avisa y libera el boton', () => {
      void component.downloadEmployeesCsv();
      httpMock()
        .expectOne(`${api}/employee/list-with-status`)
        .flush({}, { status: 500, statusText: 'Server Error' });

      expect(notificaciones.show).toHaveBeenCalledWith(
        'Error al descargar el archivo CSV',
        'error'
      );
      expect(component.isDownloadingCsv()).toBeFalse();
    });
  });
});

describe('csvCell', () => {
  it('dobla las comillas internas para no partir la fila', () => {
    expect(csvCell('ANA "LA NEGRA"')).toBe('"ANA ""LA NEGRA"""');
  });

  it('neutraliza lo que Excel leeria como formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });

  it('un valor ausente sale como celda vacia', () => {
    expect(csvCell(undefined)).toBe('""');
  });
});
