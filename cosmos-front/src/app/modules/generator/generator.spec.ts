import { ComponentFixture, TestBed } from '@angular/core/testing';
import Generator from './generator';
import { environment } from '../../../environments/environment';
import { componentProviders, httpMock } from '../../../testing/setup';
import { NotificationService } from '../../services/notification.service';

describe('Generator', () => {
  let component: Generator;
  let fixture: ComponentFixture<Generator>;
  let notificaciones: NotificationService;
  const api = environment.api;

  const empleados = [
    { _id: 'e1', firstName: 'Ana', lastName: 'Torres' },
    { _id: 'e2', firstName: 'Luis', lastName: 'Paz' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Generator],
      providers: componentProviders(),
    }).compileComponents();

    fixture = TestBed.createComponent(Generator);
    component = fixture.componentInstance;
    notificaciones = TestBed.inject(NotificationService);
    spyOn(notificaciones, 'show');
  });

  const arrancar = (respuesta: unknown = empleados) => {
    fixture.detectChanges();
    httpMock().expectOne(`${api}/employee`).flush(respuesta as never);
  };

  it('carga los empleados al entrar', () => {
    arrancar();

    expect(component.employees().length).toBe(2);
  });

  it('avisa si no puede obtener la lista de empleados', () => {
    fixture.detectChanges();
    httpMock().expectOne(`${api}/employee`).flush({}, { status: 500, statusText: 'Server Error' });

    expect(notificaciones.show).toHaveBeenCalledWith(
      'No se pudo obtener la lista de empleados',
      'error'
    );
  });

  describe('canGenerate', () => {
    it('exige empleado y tipo', () => {
      arrancar();

      expect(component.canGenerate()).toBeFalse();

      component.selectedEmployeeId.set('e1');
      expect(component.canGenerate()).toBeFalse();

      component.selectedType.set('qrcode');
      expect(component.canGenerate()).toBeTrue();
    });

    it('se apaga mientras hay una generacion en curso', () => {
      arrancar();
      component.selectedEmployeeId.set('e1');
      component.selectedType.set('qrcode');

      component.generate();

      // Impide que dos pulsaciones seguidas generen dos codigos distintos para
      // la misma persona, que es como se acaba entregando el que no toca.
      expect(component.canGenerate()).toBeFalse();
      httpMock().expectOne(`${api}/generator`).flush({ url: 'https://cdn/qr.png' });
    });
  });

  describe('generate', () => {
    const generar = () => {
      arrancar();
      component.selectedEmployeeId.set('e1');
      component.selectedType.set('qrcode');
      component.generate();
      return httpMock().expectOne(`${api}/generator`);
    };

    it('no hace nada si falta empleado o tipo', () => {
      arrancar();

      component.generate();

      httpMock().expectNone(`${api}/generator`);
    });

    it('envia el empleado y el tipo elegidos', () => {
      const peticion = generar();

      expect(peticion.request.body).toEqual({ employeeId: 'e1', type: 'qrcode' });
      peticion.flush({ url: 'https://cdn/qr.png' });
    });

    it('muestra la imagen generada', () => {
      generar().flush({ url: 'https://cdn/qr.png' });

      expect(component.imageUrl()).toBe('https://cdn/qr.png');
      expect(notificaciones.show).toHaveBeenCalledWith('Código generado correctamente', 'success');
    });

    it('un fallo avisa y no deja una imagen a medias', () => {
      generar().flush({}, { status: 500, statusText: 'Server Error' });

      expect(component.imageUrl()).toBe('');
      expect(notificaciones.show).toHaveBeenCalledWith('No se pudo generar el código', 'error');
    });

    it('el indicador de carga se apaga tras el fallo', () => {
      generar().flush({}, { status: 500, statusText: 'Server Error' });

      // Va en `complete`, que no se ejecuta cuando el observable termina en
      // error: si esto empieza a fallar, el boton se queda deshabilitado para
      // siempre y hay que recargar la pagina para reintentar.
      expect(component.loading()).toBeFalse();
    });
  });
});
