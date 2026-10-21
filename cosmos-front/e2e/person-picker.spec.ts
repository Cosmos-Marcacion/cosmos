import { expect, test, type Page } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * El selector de personal dentro de la ventana de configuración de la nombrada.
 *
 * Es el sitio difícil: la ventana tiene su propio scroll (`overflow-y: auto`) y
 * para la propagación de los clics de dentro para que no la cierren. Las dos
 * cosas rompían la lista de resultados, cada una por su lado:
 *
 *  - el `overflow` recortaba la lista por el borde inferior de la ventana, y en
 *    el tercer selector se perdía más de la mitad;
 *  - el `stopPropagation` impedía que el selector se enterase de los clics
 *    fuera, así que la lista no se cerraba salvo eligiendo a alguien;
 *  - y Escape, que no se frenaba, cerraba de golpe la lista y la ventana.
 *
 * Cada prueba de aquí falla con la implementación anterior.
 */

const VENTANA = { width: 1280, height: 720 };

async function abrirResponsables(page: Page) {
  await signIn(page);
  await mockApi(page);
  await page.setViewportSize(VENTANA);
  await page.goto('/marcaciones/nombrada/3541?date=2026-09-10');
  const abrir = page.getByRole('button', { name: /Responsables de la jornada/i });
  await esperarPantalla(abrir);
  await abrir.click();
  await expect(page.getByRole('dialog', { name: 'Responsables de la jornada' })).toBeVisible();
}

/** El selector de un campo, por su etiqueta. */
function selector(page: Page, etiqueta: string) {
  return page.locator('app-person-picker').filter({ hasText: etiqueta }).first();
}

test.describe('Selector de personal dentro de la ventana', () => {
  test('la lista se ve entera aunque la ventana tenga scroll', async ({ page }) => {
    await abrirResponsables(page);

    // El tercero es el que quedaba contra el borde inferior.
    const ssoma = selector(page, 'Supervisor SSOMA');
    await ssoma.getByRole('combobox').fill('garcia');

    const panel = ssoma.locator('.person-picker__panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('option')).toHaveCount(12);

    const cuerpo = page.locator('.nd-modal__body');
    const [lista, modal] = await Promise.all([panel.boundingBox(), cuerpo.boundingBox()]);

    // Antes la lista acababa por debajo del cuerpo del modal y se cortaba ahí.
    // Ahora está en la capa superior, así que puede salirse del modal sin
    // recortarse: lo que hay que exigir es que quepa entera en la pantalla, con
    // su margen. El tope de alto se aplica al panel, no solo a la lista de
    // dentro, o los bordes y el relleno lo sacan unos píxeles por abajo.
    expect(lista!.y).toBeGreaterThanOrEqual(0);
    expect(lista!.y + lista!.height).toBeLessThanOrEqual(VENTANA.height - 4);

    // Y que se vea de verdad, no que esté detrás del modal.
    const encima = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el?.closest('.person-picker__panel'));
    }, [lista!.x + lista!.width / 2, lista!.y + 10] as const);
    expect(encima, 'la lista tiene que quedar por delante del modal').toBe(true);
    expect(modal).not.toBeNull();
  });

  test('se abre hacia arriba cuando debajo no cabe', async ({ page }) => {
    await abrirResponsables(page);

    const arriba = selector(page, 'Jefe de cubierta');
    await arriba.getByRole('combobox').fill('garcia');
    await expect(arriba.locator('.person-picker__panel')).toHaveAttribute('data-direccion', 'abajo');
    await page.keyboard.press('Escape');

    // Con la ventana baja, el último campo no tiene hueco debajo.
    await page.setViewportSize({ width: 1280, height: 560 });
    const ssoma = selector(page, 'Supervisor SSOMA');
    await ssoma.getByRole('combobox').fill('garcia');

    const panel = ssoma.locator('.person-picker__panel');
    await expect(panel).toHaveAttribute('data-direccion', 'arriba');
    const caja = await panel.boundingBox();
    const campo = await ssoma.locator('.person-picker__field').boundingBox();
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(campo!.y + 1);
  });

  test('un clic en otro punto de la ventana cierra la lista', async ({ page }) => {
    await abrirResponsables(page);

    const jefe = selector(page, 'Jefe de cubierta');
    await jefe.getByRole('combobox').fill('garcia');
    await expect(jefe.locator('.person-picker__panel')).toBeVisible();

    // Dentro del modal, que es donde el `stopPropagation` dejaba sorda a la
    // lista. El título no selecciona nada: sólo es un sitio neutro donde pulsar.
    await page.getByRole('heading', { name: 'Responsables de la jornada' }).click();

    await expect(jefe.locator('.person-picker__panel')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('abrir otro selector cierra el anterior', async ({ page }) => {
    await abrirResponsables(page);

    const jefe = selector(page, 'Jefe de cubierta');
    const ssoma = selector(page, 'Supervisor SSOMA');

    // Se abre el de abajo y se pulsa el de arriba, y no al revés: una lista
    // abierta tapa los campos que tiene debajo, como cualquier desplegable, y
    // entonces el clic caería sobre la lista y no sobre el otro campo.
    await ssoma.getByRole('combobox').fill('garcia');
    await expect(ssoma.getByRole('option').first()).toBeVisible();

    await jefe.getByRole('combobox').click();
    await expect(ssoma.locator('.person-picker__panel')).toHaveCount(0);
    await expect(jefe.locator('.person-picker__panel')).toBeVisible();
  });

  test('Escape cierra la lista y deja la ventana abierta', async ({ page }) => {
    await abrirResponsables(page);

    const jefe = selector(page, 'Jefe de cubierta');
    await jefe.getByRole('combobox').fill('garcia');
    await expect(jefe.locator('.person-picker__panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(jefe.locator('.person-picker__panel')).toHaveCount(0);
    await expect(page.getByRole('dialog'), 'la primera pulsación no cierra la ventana').toBeVisible();

    // La segunda sí: ahí ya no hay lista que cerrar.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('elegir a alguien deja su ficha en el campo', async ({ page }) => {
    await abrirResponsables(page);

    const jefe = selector(page, 'Jefe de cubierta');
    await jefe.getByRole('combobox').fill('garcia');
    await jefe.getByRole('option', { name: /GARCIA PERSONA 03/ }).click();

    await expect(jefe.locator('.person-picker__panel')).toHaveCount(0);
    await expect(jefe.getByText('GARCIA PERSONA 03')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('la lista sigue al campo al desplazar la ventana', async ({ page }) => {
    await abrirResponsables(page);
    // Ventana baja a propósito: con los tres selectores dentro, el cuerpo del
    // modal desborda y se puede desplazar de verdad.
    await page.setViewportSize({ width: 1280, height: 480 });

    const jefe = selector(page, 'Jefe de cubierta');
    await jefe.getByRole('combobox').fill('garcia');
    const panel = jefe.locator('.person-picker__panel');
    await expect(panel).toBeVisible();

    const cuerpo = page.locator('.nd-modal__body');
    const desplazado = await cuerpo.evaluate((el) => {
      el.scrollBy(0, 60);
      return el.scrollTop;
    });
    expect(desplazado, 'el cuerpo del modal tiene que poder desplazarse').toBeGreaterThan(0);

    // O acompaña al campo, o se cierra si el campo se fue de la vista. Lo que
    // no puede es quedarse flotando donde estaba, ya sin su campo debajo.
    if (await panel.count()) {
      const campo = await jefe.locator('.person-picker__field').boundingBox();
      const despues = await panel.boundingBox();
      const pegado =
        Math.abs(despues!.y - (campo!.y + campo!.height)) < 12 ||
        Math.abs(despues!.y + despues!.height - campo!.y) < 12;
      expect(pegado, 'la lista tiene que seguir pegada a su campo').toBe(true);
    }
  });
});
