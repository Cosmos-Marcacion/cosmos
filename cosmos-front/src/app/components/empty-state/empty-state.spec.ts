import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({
      imports: [EmptyState],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(EmptyState);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sin datos ni búsqueda dice que no hay registros', () => {
    const fixture = render({});
    expect(fixture.componentInstance.kind()).toBe('empty');
    expect(fixture.nativeElement.textContent).toContain('No hay registros que mostrar.');
  });

  it('con búsqueda distingue la falta de coincidencias', () => {
    const fixture = render({ searchTerm: '  zzz ' });
    expect(fixture.componentInstance.kind()).toBe('no-match');
    expect(fixture.nativeElement.textContent).toContain('Nada coincide con «zzz»');
  });

  it('mientras carga no dice que esté vacío', () => {
    const fixture = render({ loading: true, searchTerm: 'ana' });
    expect(fixture.componentInstance.kind()).toBe('loading');
    expect(fixture.nativeElement.textContent).toContain('Cargando');
  });

  it('un error se anuncia y ofrece reintentar si se pide', () => {
    const fixture = render({ error: 'No se pudo cargar.', retryable: true });
    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => retried++);
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No se pudo cargar.');
    host.querySelector('button')!.click();
    expect(retried).toBe(1);
  });

  it('respeta el mensaje propio de cada listado', () => {
    const fixture = render({ emptyMessage: 'No hay puntos en este puerto.' });
    expect(fixture.nativeElement.textContent).toContain('No hay puntos en este puerto.');
  });
});
