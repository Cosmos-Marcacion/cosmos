import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PersonPicker } from './person-picker';
import { PersonDirectoryService } from '../../services/person-directory.service';

describe('PersonPicker', () => {
  it('tras un fallo de red vuelve a buscar en la siguiente tecla', fakeAsync(() => {
    const search = jasmine
      .createSpy('search')
      .and.returnValues(
        throwError(() => new Error('sin red')),
        of([{ id: 'p1', fullName: 'DIAZ ANA', document: '1', position: '' }])
      );
    TestBed.configureTestingModule({
      imports: [PersonPicker],
      providers: [{ provide: PersonDirectoryService, useValue: { search, toRef: (p: unknown) => p } }],
    });
    const fixture = TestBed.createComponent(PersonPicker);
    const picker = fixture.componentInstance;
    fixture.detectChanges();

    picker.onInput({ target: { value: 'di' } } as unknown as Event);
    tick(300);
    expect(picker.results()).toEqual([]);
    expect(picker.loading()).toBe(false);

    // Antes el error cerraba la tuberia y esta busqueda no llegaba a salir.
    picker.onInput({ target: { value: 'dia' } } as unknown as Event);
    tick(300);

    expect(search).toHaveBeenCalledTimes(2);
    expect(picker.results().length).toBe(1);
  }));
});
