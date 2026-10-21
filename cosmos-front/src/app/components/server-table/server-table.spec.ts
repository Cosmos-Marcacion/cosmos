import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ServerTable } from './server-table';

describe('ServerTable', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({
      imports: [ServerTable],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(ServerTable);
    fixture.componentRef.setInput('headers', [
      { header: 'Fecha', value: 'date' },
      { header: 'Marcaciones', value: 'markings' },
    ]);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('pinta las filas y el recuento de marcaciones', () => {
    const fixture = render({ data: [{ date: '2026-09-18', markings: '3 / 8 -S' }], total: 1 });
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('tbody tr').length).toBe(1);
    expect(host.textContent).toContain('3/8');
  });

  it('sin filas muestra el estado vacío en toda la fila', () => {
    const fixture = render({ data: [], emptyMessage: 'No hay nombradas.' });
    const celda: HTMLTableCellElement = fixture.nativeElement.querySelector('tbody td');
    expect(celda.colSpan).toBe(2);
    expect(celda.textContent).toContain('No hay nombradas.');
  });

  it('cambiar las filas por página vuelve a la primera', () => {
    const fixture = render({ data: [], page: 3, limit: 10, total: 100 });
    const emitted: { page: number; limit: number }[] = [];
    fixture.componentInstance.pageChangeEvent.subscribe((e) => emitted.push(e));

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.value).toBe('10');
    select.value = '50';
    select.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([{ page: 1, limit: 50 }]);
  });

  it('cambiar de página conserva el tamaño', () => {
    const fixture = render({ data: [], page: 1, limit: 20, total: 100 });
    const emitted: { page: number; limit: number }[] = [];
    fixture.componentInstance.pageChangeEvent.subscribe((e) => emitted.push(e));

    fixture.componentInstance.onPageChange(2);

    expect(emitted).toEqual([{ page: 2, limit: 20 }]);
  });
});
