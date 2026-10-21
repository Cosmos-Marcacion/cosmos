import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

/**
 * Por qué los desplegables de la ficha de nombrada marcan la opción con
 * `[selected]` y no el `<select>` con `[value]`.
 *
 * Sale de un fallo real: se elegía "Tipo de nombrada", se guardaba, y al volver
 * a entrar el desplegable aparecía otra vez en "Selecciona el tipo". Parecía
 * que no se guardaba, pero el dato estaba en la ficha: lo que no se veía era la
 * selección.
 *
 * La causa es el orden en que Angular actualiza la plantilla. En la pasada de
 * actualización las instrucciones se ejecutan en el orden del marcado, así que
 * el `[value]` del `<select>` se escribe **antes** de que el `@for` haya creado
 * las `<option>`. Asignar `select.value = 'ETHANOL'` cuando esa opción todavía
 * no existe no hace nada: el DOM deja el valor en cadena vacía. Y como después
 * la expresión no cambia, Angular no vuelve a escribirla nunca.
 *
 * En esta vista pasaba siempre, no de vez en cuando: el formulario entero vive
 * dentro de `@if (loading()) {} @else {}`, así que el `<select>` se crea en la
 * misma pasada en la que el borrador ya trae el valor guardado.
 *
 * Con `[selected]` en cada `<option>` el problema desaparece, porque la marca
 * se aplica al crear cada opción.
 */

@Component({
  standalone: true,
  template: `
    <select [value]="elegido()">
      <option value="">Selecciona el tipo</option>
      @for (o of opciones(); track o) {
        <option [value]="o">{{ o }}</option>
      }
    </select>
  `,
})
class ConValueEnElSelect {
  readonly opciones = signal<string[]>([]);
  readonly elegido = signal('');
}

@Component({
  standalone: true,
  template: `
    <select>
      <option value="" [selected]="!elegido()">Selecciona el tipo</option>
      @for (o of opciones(); track o) {
        <option [value]="o" [selected]="o === elegido()">{{ o }}</option>
      }
    </select>
  `,
})
class ConSelectedEnLaOpcion {
  readonly opciones = signal<string[]>([]);
  readonly elegido = signal('');
}

const OPCIONES = ['ETHANOL', 'GRANEL', 'MERCADERIA_GENERAL'];

describe('desplegable con opciones pintadas por @for', () => {
  // La aplicación va sin Zone.js (`provideZonelessChangeDetection` en
  // app.config.ts); el TestBed tiene que arrancar igual para que el orden de
  // actualización sea el mismo que en producción.
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('[value] en el select pierde la seleccion cuando llega junto con las opciones', () => {
    const fixture = TestBed.createComponent(ConValueEnElSelect);
    // Primera pintada con todo a la vez, que es lo que ocurre al salir de
    // `loading()`: el borrador ya trae el tipo guardado.
    fixture.componentInstance.opciones.set(OPCIONES);
    fixture.componentInstance.elegido.set('ETHANOL');
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.options.length).toBe(4);
    expect(select.value).toBe('');
  });

  it('[selected] en la opcion la conserva', () => {
    const fixture = TestBed.createComponent(ConSelectedEnLaOpcion);
    fixture.componentInstance.opciones.set(OPCIONES);
    fixture.componentInstance.elegido.set('ETHANOL');
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.value).toBe('ETHANOL');
  });

  it('[selected] sigue reflejando los cambios posteriores', () => {
    const fixture = TestBed.createComponent(ConSelectedEnLaOpcion);
    fixture.componentInstance.opciones.set(OPCIONES);
    fixture.componentInstance.elegido.set('ETHANOL');
    fixture.detectChanges();

    fixture.componentInstance.elegido.set('GRANEL');
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.value).toBe('GRANEL');
  });
});
