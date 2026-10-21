import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmployeePicker } from './employee-picker';
import { IEmployeeResponse } from '../../interfaces/employee.interface';
import { componentProviders } from '../../../testing/setup';

/**
 * El desplegable nativo al que sustituye este componente solo sabia saltar por
 * la primera letra y pintaba las opciones en el orden en que llegaban de la
 * API. Las pruebas cubren justo eso: el orden y la busqueda por palabras.
 */
describe('EmployeePicker', () => {
  let fixture: ComponentFixture<EmployeePicker>;
  let component: EmployeePicker;

  const empleado = (partial: Partial<IEmployeeResponse>): IEmployeeResponse =>
    ({
      _id: partial._id ?? '',
      firstName: partial.firstName ?? '',
      lastName: partial.lastName ?? '',
      document: partial.document ?? '',
    }) as IEmployeeResponse;

  // Llegan desordenados a proposito, como vienen de la base de datos.
  const empleados = [
    empleado({ _id: 'e1', firstName: 'Zoila', lastName: 'Vargas', document: '70000001' }),
    empleado({ _id: 'e2', firstName: 'Ana María', lastName: 'Ñañez', document: '70000002' }),
    empleado({ _id: 'e3', firstName: 'Álvaro', lastName: 'Ávila', document: '70000003' }),
    empleado({ _id: 'e4', firstName: 'Beto', lastName: 'Torres', document: '45123456' }),
    empleado({ _id: 'e5', firstName: 'Ana', lastName: 'Torres', document: '45999999' }),
  ];

  const ids = (lista: IEmployeeResponse[]) => lista.map(e => e._id);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeePicker],
      providers: componentProviders(),
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeePicker);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('employees', empleados);
    fixture.detectChanges();
  });

  describe('orden', () => {
    it('ordena por apellido y luego por nombre', () => {
      // Ávila antes que Ñañez y Ñañez antes que Torres: con el orden de puntos
      // de codigo saldrian al final, detras de Vargas.
      expect(ids(component.sorted())).toEqual(['e3', 'e2', 'e5', 'e4', 'e1']);
    });
  });

  describe('busqueda', () => {
    it('sin texto ofrece la lista completa, ordenada', () => {
      expect(ids(component.results())).toEqual(['e3', 'e2', 'e5', 'e4', 'e1']);
    });

    it('busca por apellido, no solo por la primera letra del nombre', () => {
      component.query.set('torres');

      expect(ids(component.results())).toEqual(['e5', 'e4']);
    });

    it('cada palabra cuenta por separado y el orden da igual', () => {
      component.query.set('torres ana');

      expect(ids(component.results())).toEqual(['e5']);
    });

    it('ignora tildes y mayusculas por ambos lados', () => {
      component.query.set('ALVARO');

      expect(ids(component.results())).toEqual(['e3']);
    });

    it('busca tambien por documento, con coincidencia parcial', () => {
      component.query.set('45123');

      expect(ids(component.results())).toEqual(['e4']);
    });

    it('nombre y documento juntos filtran a una sola persona', () => {
      component.query.set('ana 45999');

      expect(ids(component.results())).toEqual(['e5']);
    });

    it('sin coincidencias avisa en vez de quedarse en blanco', () => {
      component.openList();
      component.query.set('nadie');

      expect(component.results()).toEqual([]);
      expect(component.showEmpty()).toBeTrue();
    });
  });

  describe('seleccion', () => {
    it('emite el id elegido y cierra', () => {
      const emitidos: string[] = [];
      component.valueChange.subscribe(id => emitidos.push(id));
      component.openList();

      component.select(empleados[3]);

      expect(emitidos).toEqual(['e4']);
      expect(component.open()).toBeFalse();
    });

    it('al cerrar descarta lo tecleado', () => {
      component.openList();
      component.query.set('torres');

      component.close();

      expect(component.query()).toBe('');
    });

    it('limpiar emite vacio', () => {
      const emitidos: string[] = [];
      component.valueChange.subscribe(id => emitidos.push(id));

      component.clear();

      expect(emitidos).toEqual(['']);
    });

    it('muestra apellido y nombre del elegido', () => {
      fixture.componentRef.setInput('value', 'e5');
      fixture.detectChanges();

      expect(component.displayName(component.selected())).toBe('Torres Ana');
    });
  });

  describe('teclado', () => {
    const pulsar = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      component.onKeydown(event);
      return event;
    };

    it('la flecha abajo abre la lista', () => {
      pulsar('ArrowDown');

      expect(component.open()).toBeTrue();
    });

    it('la flecha arriba desde el primero da la vuelta al ultimo', () => {
      component.openList();
      component.activeIndex.set(0);

      pulsar('ArrowUp');

      expect(component.activeIndex()).toBe(component.results().length - 1);
    });

    it('Enter elige la opcion activa', () => {
      const emitidos: string[] = [];
      component.valueChange.subscribe(id => emitidos.push(id));
      component.openList();
      component.activeIndex.set(0);

      pulsar('Enter');

      expect(emitidos).toEqual(['e3']);
    });

    it('Escape cierra sin elegir y frena la propagacion', () => {
      const emitidos: string[] = [];
      component.valueChange.subscribe(id => emitidos.push(id));
      component.openList();

      const event = pulsar('Escape');

      expect(component.open()).toBeFalse();
      expect(emitidos).toEqual([]);
      expect(event.defaultPrevented).toBeTrue();
    });
  });
});
