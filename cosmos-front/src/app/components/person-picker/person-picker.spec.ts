import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { PersonPicker } from './person-picker';
import { PersonDirectoryService } from '../../services/person-directory.service';
import { IPerson } from '../../interfaces/person.interface';

/**
 * El selector de personal, con el foco puesto en dónde se pinta la lista.
 *
 * El sitio donde más se usa es dentro de la ventana de configuración de la
 * nombrada, que tiene scroll propio y que además para la propagación de los
 * clics de dentro. Eso rompía la lista por tres sitios a la vez: el `overflow`
 * la recortaba, el `stopPropagation` impedía cerrarla pulsando fuera, y Escape
 * cerraba de paso la ventana entera.
 *
 * Aquí se comprueba la lógica de colocación y de cierre. Que el resultado se
 * vea entero y por delante del modal se comprueba en `e2e/person-picker.spec.ts`,
 * que es donde hay una ventana de verdad.
 */

const PERSONAL: IPerson[] = Array.from({ length: 8 }, (_, i) => ({
  id: `VSM-${i + 1}`,
  fullName: `GARCIA PERSONA ${i + 1}`,
  document: `4000000${i}`,
  position: '',
  active: true,
}));

/** Reproduce el contenedor problemático: scroll propio y clics frenados. */
@Component({
  standalone: true,
  imports: [PersonPicker],
  template: `
    <div class="ventana">
      <div class="relleno arriba"></div>
      <app-person-picker label="Jefe de cubierta" />
      <div class="relleno abajo"></div>
    </div>
  `,
  // El campo arranca a la vista y el relleno de abajo hace que la ventana se
  // pueda desplazar de verdad, que es lo que hace falta para comprobar que la
  // lista sigue al campo.
  // Ancho fijo y estrecho a proposito: asi el campo nunca roza el borde de la
  // pantalla y la comprobacion de que la lista se alinea con el no depende del
  // tamaño que tenga la ventana donde corran las pruebas.
  styles: `
    .ventana { width: 400px; max-height: 260px; overflow-y: auto; }
    .arriba { height: 120px; }
    .abajo { height: 400px; }
  `,
})
class Contenedor {}

describe('PersonPicker · dónde se pinta la lista', () => {
  let fixture: ComponentFixture<Contenedor>;
  let picker: PersonPicker;
  const minLength = signal(0);

  beforeEach(async () => {
    minLength.set(0);
    await TestBed.configureTestingModule({
      imports: [Contenedor],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: PersonDirectoryService,
          useValue: {
            minLength,
            search: () => of(PERSONAL),
            toRef: (p: IPerson) => ({
              id: p.id,
              fullName: p.fullName,
              document: p.document,
              position: p.position,
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Contenedor);
    fixture.detectChanges();
    picker = fixture.debugElement.query(By.directive(PersonPicker)).componentInstance;

    // Lo que hace la ventana real con sus clics: frenarlos para que no la
    // cierren. Va aqui y no en la plantilla porque un `(click)` sobre un `div`
    // sin foco es justo lo que prohibe la regla de accesibilidad del proyecto.
    fixture.nativeElement
      .querySelector('.ventana')
      .addEventListener('click', (event: Event) => event.stopPropagation());
  });

  afterEach(() => fixture.destroy());

  /** Abre la lista y espera a que el debounce de la búsqueda la rellene. */
  async function abrir() {
    picker.openList();
    await new Promise(resolve => setTimeout(resolve, 300));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function panel(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.person-picker__panel');
  }

  it('saca la lista a la capa superior, fuera del recorte del contenedor', async () => {
    await abrir();

    const lista = panel();
    expect(lista).withContext('la lista tiene que existir al abrir').not.toBeNull();
    // `popover` es lo que la libra del `overflow` del contenedor. Sin el
    // atributo volveria a recortarse, por mucho z-index que se le ponga.
    expect(lista!.getAttribute('popover')).toBe('manual');
    expect(lista!.matches(':popover-open')).toBe(true);
    expect(getComputedStyle(lista!).position).toBe('fixed');
  });

  it('la ancla al campo y le da el ancho del campo', async () => {
    await abrir();

    const campo = fixture.nativeElement.querySelector('.person-picker__field') as HTMLElement;
    const caja = campo.getBoundingClientRect();
    const lista = panel()!.getBoundingClientRect();

    expect(Math.abs(lista.left - caja.left)).toBeLessThan(2);
    expect(Math.abs(lista.width - caja.width)).toBeLessThan(2);

    // Hacia abajo o hacia arriba según el hueco que haya —la ventana donde
    // corren las pruebas no siempre tiene el mismo alto—, pero pegada al campo
    // y anunciando por qué lado, que es de lo que tira el estilo de la sombra.
    const direccion = panel()!.dataset['direccion'];
    const pegada =
      direccion === 'abajo'
        ? Math.abs(lista.top - caja.bottom) < 8
        : Math.abs(lista.bottom - caja.top) < 8;
    expect(['abajo', 'arriba']).toContain(direccion!);
    expect(pegada).withContext(`la lista dice "${direccion}" y no está ahí`).toBe(true);
  });

  it('recorta el alto de la lista a lo que queda libre en pantalla', async () => {
    await abrir();

    const alto = panel()!.style.getPropertyValue('--person-picker-alto');
    expect(alto).withContext('el alto lo fija la colocación').toMatch(/^\d+px$/);
    expect(parseInt(alto, 10)).toBeLessThanOrEqual(304);
    expect(panel()!.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight + 1);
  });

  it('un clic fuera la cierra aunque el contenedor pare la propagación', async () => {
    await abrir();
    expect(panel()).not.toBeNull();

    // Igual que en la ventana real: el clic se frena antes de llegar al
    // documento. El selector escucha en captura, así que se entera igual.
    const fuera = document.createElement('button');
    document.body.appendChild(fuera);
    fuera.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();

    expect(picker.open()).toBe(false);
    expect(panel()).toBeNull();
    fuera.remove();
  });

  it('un clic dentro de la lista no la cierra', async () => {
    await abrir();

    const opcion = fixture.nativeElement.querySelector('.person-picker__option') as HTMLElement;
    opcion.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();

    expect(picker.open()).withContext('elegir exige poder pulsar la opción').toBe(true);
  });

  it('Escape cierra la lista y no deja que el evento llegue al documento', async () => {
    await abrir();

    let llegoAlDocumento = false;
    const testigo = () => (llegoAlDocumento = true);
    document.addEventListener('keydown', testigo);

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    document.removeEventListener('keydown', testigo);

    expect(picker.open()).toBe(false);
    // La ventana que lo contiene también cierra con Escape: si el evento
    // siguiera subiendo, una sola pulsación cerraría las dos cosas.
    expect(llegoAlDocumento).withContext('el evento no debe subir al documento').toBe(false);
  });

  it('Escape con la lista cerrada sí llega al documento', () => {
    let llegoAlDocumento = false;
    const testigo = () => (llegoAlDocumento = true);
    document.addEventListener('keydown', testigo);

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.removeEventListener('keydown', testigo);

    expect(llegoAlDocumento).withContext('sin lista abierta, cierra la ventana').toBe(true);
  });

  it('se cierra si el campo se va de la vista al desplazar el contenedor', async () => {
    await abrir();
    expect(panel()).not.toBeNull();

    const ventana = fixture.nativeElement.querySelector('.ventana') as HTMLElement;
    ventana.scrollTop = ventana.scrollHeight;
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    // O sigue al campo, o se cierra: lo que no puede es quedarse flotando donde
    // estaba, ya sin campo debajo.
    const lista = panel();
    if (lista) {
      const campo = fixture.nativeElement.querySelector('.person-picker__field') as HTMLElement;
      const caja = campo.getBoundingClientRect();
      const suya = lista.getBoundingClientRect();
      const pegada =
        Math.abs(suya.top - caja.bottom) < 12 || Math.abs(suya.bottom - caja.top) < 12;
      expect(pegada).withContext('la lista sigue pegada a su campo').toBe(true);
    }
  });

  it('elegir a una persona la emite y cierra la lista', async () => {
    const emitidas: unknown[] = [];
    picker.valueChange.subscribe(v => emitidas.push(v));
    await abrir();

    picker.select(PERSONAL[2]);
    fixture.detectChanges();

    expect(emitidas).toEqual([
      { id: 'VSM-3', fullName: 'GARCIA PERSONA 3', document: '40000002', position: '' },
    ]);
    expect(picker.open()).toBe(false);
    expect(panel()).toBeNull();
  });

  it('con el mínimo de Visma no consulta ni dice que no hay nadie', async () => {
    minLength.set(3);
    await abrir();

    picker.query.set('ga');
    fixture.detectChanges();

    expect(picker.canSearch()).toBe(false);
    expect(picker.showEmpty()).withContext('«nadie coincide» sería mentira').toBe(false);
    expect(picker.showMinLength()).toBe(false); // hay resultados del maestro simulado
  });
});
