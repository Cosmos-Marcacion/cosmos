import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CheckinConfirmation } from './checkin-confirmation';
import { ChekinConfirmationStateService } from '../../services/chekin-confirmation-state.service';
import { FeedbackSoundService } from '../../services/feedback-sound.service';

/**
 * La confirmación de la marcación.
 *
 * Es lo último que ve quien marca, de pie en el muelle y con prisa. Tiene que
 * resolverse de un vistazo, y por eso el color, la forma del icono y el sonido
 * dicen lo mismo tres veces: hay luz que se come el color y ruido que se come
 * el sonido, pero los tres a la vez no fallan.
 */
describe('CheckinConfirmation', () => {
  let component: CheckinConfirmation;
  let fixture: ComponentFixture<CheckinConfirmation>;
  let state: ChekinConfirmationStateService;
  let sonados: string[];

  beforeEach(async () => {
    sonados = [];

    await TestBed.configureTestingModule({
      imports: [CheckinConfirmation],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: FeedbackSoundService,
          useValue: {
            success: () => sonados.push('success'),
            error: () => sonados.push('error'),
            capture: () => sonados.push('capture'),
          },
        },
      ],
    }).compileComponents();

    state = TestBed.inject(ChekinConfirmationStateService);
    fixture = TestBed.createComponent(CheckinConfirmation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** Lo que hay pintado ahora mismo. */
  function html(): string {
    return (fixture.nativeElement as HTMLElement).innerHTML;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('mientras no hay nada que confirmar no pinta nada', () => {
    // Angular deja el ancla del `@if` en el DOM; lo que no puede haber es
    // pantalla.
    expect(fixture.nativeElement.querySelector('.cc')).toBeNull();
  });

  it('el acierto suena una vez y dibuja un tic', () => {
    state.type.next('success');
    state.visible.next(true);
    fixture.detectChanges();

    expect(sonados).toEqual(['success']);
    expect(component.title()).toBe('Marcación registrada');
    expect(html()).toContain('cc__check');
    expect(html()).not.toContain('cc__cross');
  });

  /**
   * El icono del error tiene que ser una cruz.
   *
   * La versión anterior pintaba el mismo tic que el acierto, solo que sobre
   * fondo rojo: quien no llegaba a leer el texto se iba creyendo que había
   * marcado. Es el fallo que más caro sale de esta pantalla.
   */
  it('el error dibuja una cruz, no un tic', () => {
    state.type.next('error');
    state.visible.next(true);
    fixture.detectChanges();

    expect(html()).toContain('cc__cross');
    expect(html()).not.toContain('cc__check');
    expect(component.title()).toBe('No se pudo marcar');
  });

  it('el error suena distinto del acierto', () => {
    state.type.next('error');
    state.visible.next(true);
    fixture.detectChanges();

    expect(sonados).toEqual(['error']);
  });

  it('sin mensaje propio dice qué hacer, no "Error"', () => {
    state.message.next('');
    state.type.next('error');
    state.visible.next(true);
    fixture.detectChanges();

    expect(component.detail()).toContain('supervisor');
  });

  it('respeta el mensaje que le pasen', () => {
    state.message.next('Ya marcaste el ingreso de este turno');
    state.type.next('error');
    state.visible.next(true);
    fixture.detectChanges();

    expect(component.detail()).toBe('Ya marcaste el ingreso de este turno');
  });
});
