import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Pagination } from './pagination';

/**
 * El fallo que estas pruebas fijan: el numero de paginas se calculaba en
 * `ngOnInit`, cuando `total` todavia valia 0 porque la API no habia
 * respondido. Entraba por la rama del `[1]` y no se rehacia nunca, asi que la
 * paginacion mostraba siempre el numero 1.
 */
describe('Pagination', () => {
  let component: Pagination;
  let fixture: ComponentFixture<Pagination>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      imports: [Pagination],
    }).compileComponents();

    fixture = TestBed.createComponent(Pagination);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const entradas = (total: number, page = 1, limit = 10) => {
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('limit', limit);
    fixture.detectChanges();
  };

  describe('numero de paginas', () => {
    it('se rehace cuando el total llega despues de la primera pintada', () => {
      // Arranca sin datos, como en la realidad: el componente se pinta antes
      // de que responda la API.
      expect(component.totalPages()).toEqual([1]);

      entradas(57);

      expect(component.totalPages().length).toBe(6);
    });

    it('un listado vacio sigue siendo una pagina, no ninguna', () => {
      entradas(0);

      expect(component.totalPages()).toEqual([1]);
    });

    it('la ultima pagina incompleta tambien cuenta', () => {
      entradas(21, 1, 10);

      expect(component.totalPages().length).toBe(3);
    });
  });

  describe('resumen', () => {
    it('imprime el rango de la pagina, no la pagina y el limite', () => {
      entradas(57, 2, 10);

      expect(component.from()).toBe(11);
      expect(component.to()).toBe(20);
    });

    it('la ultima pagina no promete mas registros de los que hay', () => {
      entradas(57, 6, 10);

      expect(component.from()).toBe(51);
      expect(component.to()).toBe(57);
    });

    it('sin resultados el rango arranca en cero', () => {
      entradas(0);

      expect(component.from()).toBe(0);
      expect(component.to()).toBe(0);
    });
  });

  describe('cambio de pagina', () => {
    const emitidas = () => {
      const paginas: number[] = [];
      component.pageChange.subscribe(p => paginas.push(p));
      return paginas;
    };

    it('no pide la pagina 0 desde la primera', () => {
      entradas(57, 1);
      const paginas = emitidas();

      component.go(0);

      // El servidor traduce la pagina 0 a un `skip` negativo.
      expect(paginas).toEqual([]);
      expect(component.isFirst()).toBeTrue();
    });

    it('no pasa de la ultima', () => {
      entradas(57, 6);
      const paginas = emitidas();

      component.go(7);

      expect(paginas).toEqual([]);
      expect(component.isLast()).toBeTrue();
    });

    it('no repite la pagina en la que ya se esta', () => {
      entradas(57, 3);
      const paginas = emitidas();

      component.go(3);

      // Volver a pedirla dispara otra consulta identica.
      expect(paginas).toEqual([]);
    });

    it('emite la pagina pedida cuando esta dentro del rango', () => {
      entradas(57, 3);
      const paginas = emitidas();

      component.go(4);

      expect(paginas).toEqual([4]);
    });
  });

  describe('numeros visibles', () => {
    it('con pocas paginas salen todas', () => {
      entradas(35, 1);

      expect(component.visiblePages()).toEqual([1, 2, 3, 4]);
    });

    it('con muchas se centran en la actual', () => {
      entradas(200, 10, 10);

      expect(component.visiblePages()).toEqual([8, 9, 10, 11, 12]);
      expect(component.showEllipsisStart()).toBeTrue();
      expect(component.showEllipsisEnd()).toBeTrue();
    });

    it('cerca del principio no hay puntos suspensivos delante', () => {
      entradas(200, 2, 10);

      expect(component.visiblePages()).toEqual([1, 2, 3, 4, 5]);
      expect(component.showEllipsisStart()).toBeFalse();
    });

    it('cerca del final no hay puntos suspensivos detras', () => {
      entradas(200, 19, 10);

      expect(component.visiblePages()).toEqual([16, 17, 18, 19, 20]);
      expect(component.showEllipsisEnd()).toBeFalse();
    });
  });
});
