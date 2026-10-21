import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import NamedDetail from './named-detail';
import { NamedBoardService } from '../services/named-board.service';
import { NotificationService } from '../../../services/notification.service';
import { INamedDetail } from '../interfaces/named-detail.interface';

/**
 * La configuración de la jornada vive en ventanas, no en la página.
 *
 * La ficha mezclaba dos cosas con necesidades opuestas: lo que se **mira** cada
 * día —el personal y sus marcaciones— y lo que se **rellena** una vez por turno
 * —el tipo de formato, los responsables, la capacitación, los aprobadores y las
 * notas—. Seis formularios empujaban la tabla de personal fuera de la pantalla.
 *
 * Lo que hay que demostrar del cambio no es que las ventanas se abran, sino que
 * al esconder los formularios no se ha escondido el estado: la tira de tarjetas
 * tiene que seguir diciendo qué falta sin abrir ninguna.
 */

const DETALLE: INamedDetail = {
  named: {
    staffTransmissionId: 3545,
    staffVesselId: '3545',
    workerDate: '01/09/2026',
    vesselDescription: 'CMA CGM VOLTAIRE',
    shiftDescription: '15:00 - 23:00',
    pierDescription: '2-A',
    berthDescription: '',
    voyageNumber: '26035N',
    locationId: 'PEPAI - TPE',
  },
  summary: { staffCount: 2, presentCount: 1, completeCount: 0, entryCount: 3 },
  staff: [],
  talks: [],
  formats: [],
  record: null,
  vesselType: { code: 'CO', description: 'CONTAINER', formatType: '', accepted: false, source: 'api' },
} as unknown as INamedDetail;

const ETANOL = { code: 'ET', description: 'ETANOL', formatType: 'ETHANOL', accepted: true, source: 'api' };

describe('NamedDetail · configuración de la jornada', () => {
  let fixture: ComponentFixture<NamedDetail>;
  let detail: NamedDetail;

  async function crear(
    record: Partial<Record<string, unknown>> | null = null,
    vesselType: unknown = DETALLE.vesselType
  ) {
    const boardService = {
      getDetail: () => of({ ...DETALLE, record, vesselType }),
      getPdfStatus: () => of({ ok: true, version: 'LibreOffice' }),
      getFormatTypes: () => of([{ id: 'ETHANOL', label: 'Ethanol', capacity: 20, onePageCapacity: 20 }]),
      saveRecord: () => of({}),
      downloadFormat: () => of({}),
    };

    await TestBed.configureTestingModule({
      imports: [NamedDetail],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: NamedBoardService, useValue: boardService },
        { provide: NotificationService, useValue: { success: () => { }, error: () => { } } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => '3545' }, queryParamMap: { get: () => '2026-09-01' } },
            paramMap: of({ get: () => '3545' }),
            queryParamMap: of({ get: () => '2026-09-01' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NamedDetail);
    detail = fixture.componentInstance;
    fixture.detectChanges();
    return detail;
  }

  function tarjeta(id: string) {
    return detail.setupCards().find(card => card.id === id);
  }

  it('la tira lleva los cinco bloques de configuración', async () => {
    await crear();
    expect(detail.setupCards().map(card => card.id))
      .toEqual(['formato', 'responsables', 'capacitacion', 'vsi', 'notas']);
  });

  it('sin nada configurado, lo obligatorio sale marcado como pendiente', async () => {
    await crear();

    expect(tarjeta('formato')?.pending).toBeTrue();
    expect(tarjeta('responsables')?.pending).toBeTrue();
    expect(tarjeta('capacitacion')?.pending).toBeTrue();
    // Las notas no bloquean nunca: una nombrada sin observaciones es normal.
    expect(tarjeta('notas')?.pending).toBeFalse();
  });

  it('la tarjeta dice lo que lleva puesto sin abrir la ventana', async () => {
    // Es el motivo de que la tira exista: si hubiera que abrir cinco ventanas
    // para saber quién firma, esconder los formularios habría empeorado la
    // pantalla en vez de ordenarla.
    await crear(null, ETANOL);

    detail.setPerson('jefeCubierta', { fullName: 'HIDALGO CASTILLO DARWIN', document: '74355639' } as never);

    expect(tarjeta('formato')?.summary).toBe('Ethanol · ET · ETANOL');
    expect(tarjeta('formato')?.pending).toBeFalse();
    expect(tarjeta('responsables')?.summary).toContain('HIDALGO CASTILLO DARWIN');
  });

  it('el formato sale del tipo de nave de Cosmos, no de un selector', async () => {
    await crear(null, ETANOL);
    expect(detail.formatType()).toBe('ETHANOL');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#nd-format-type')).toBeNull();
    expect(el.textContent).toContain('ET · ETANOL');
  });

  it('un tipo de nave sin formato bloquea la descarga y lo dice', async () => {
    await crear();
    expect(detail.formatType()).toBe('');
    expect(tarjeta('formato')?.summary).toBe('CO · CONTAINER · sin formato');
    expect(tarjeta('formato')?.pending).toBeTrue();
    expect(detail.missing()).toContain('tipo de nave con formato');
    const excel = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(b => b.textContent?.includes('Descargar Excel')) as HTMLButtonElement;
    expect(excel.disabled).toBeTrue();
  });

  it('los responsables siguen pendientes hasta que están los tres', async () => {
    await crear();

    detail.setPerson('jefeCubierta', { fullName: 'A', document: '1' } as never);
    detail.setPerson('supervisorOperaciones', { fullName: 'B', document: '2' } as never);
    expect(tarjeta('responsables')?.pending).toBeTrue();

    detail.setPerson('supervisorSsoma', { fullName: 'C', document: '3' } as never);
    expect(tarjeta('responsables')?.pending).toBeFalse();
  });

  it('la capacitación necesita tipo y al menos un tema', async () => {
    await crear();

    detail.setTalkType('INDUCCION');
    expect(tarjeta('capacitacion')?.pending).toBeTrue();

    detail.setTopic(0, 'topic', 'USO DE BLOQUEADOR SOLAR');
    expect(tarjeta('capacitacion')?.pending).toBeFalse();
    expect(tarjeta('capacitacion')?.summary).toContain('1 tema');
  });

  it('las notas se resumen en una línea', async () => {
    await crear();
    detail.setNotes('  Una nota    con espacios\n de sobra  ');
    expect(tarjeta('notas')?.summary).toBe('Una nota con espacios de sobra');
  });

  // --- las ventanas -----------------------------------------------------------

  it('abre y cierra un bloque', async () => {
    await crear();
    expect(detail.panel()).toBeNull();

    detail.openPanel('responsables');
    expect(detail.panel()).toBe('responsables');
    expect(detail.panelTitle()).toBe('Responsables de la jornada');

    detail.closePanel();
    expect(detail.panel()).toBeNull();
  });

  it('Escape cierra la ventana abierta', async () => {
    await crear();
    detail.openPanel('notas');

    detail.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(detail.panel()).toBeNull();
  });

  it('cerrar no descarta lo escrito: se guarda con el resto de la nombrada', async () => {
    // La ventana no tiene "Cancelar" a propósito. Lo que se escribe va al mismo
    // borrador que el resto de la pantalla y se guarda desde la barra de
    // siempre; un "Cancelar" que no deshiciera nada sería una mentira.
    await crear();

    detail.openPanel('notas');
    detail.setNotes('Grúa 3 fuera de servicio');
    detail.closePanel();

    expect(detail.draft().notes).toBe('Grúa 3 fuera de servicio');
    expect(detail.dirty()).toBeTrue();
  });
});
