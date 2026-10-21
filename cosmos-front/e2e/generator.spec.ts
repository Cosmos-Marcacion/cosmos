import { expect, test } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * Generador de códigos: elegir al empleado.
 *
 * El desplegable nativo que había antes hacía inservible la pantalla con una
 * plantilla larga: pintaba a la gente en el orden en que la devuelve la API y
 * su única búsqueda era el salto por inicial del navegador. Estas pruebas
 * fijan lo contrario: lista alfabética y búsqueda por palabras sueltas, en
 * cualquier orden, con o sin tildes y también por documento.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await signIn(page, ['generador']);
  await page.goto('/generador');
  await esperarPantalla(page.getByRole('combobox', { name: /empleado/i }));
});

const campo = (page: import('@playwright/test').Page) =>
  page.getByRole('combobox', { name: /empleado/i });

/**
 * Las opciones del selector de empleado, no cualquier `option` de la pantalla:
 * el desplegable nativo de "Tipo" que hay al lado también aporta los suyos al
 * árbol de accesibilidad y se colaban en el recuento.
 */
const opciones = (page: import('@playwright/test').Page) =>
  page.getByRole('listbox', { name: /empleado/i }).getByRole('option');

test.describe('elegir empleado', () => {
  test('la lista sale en orden alfabético, no en el de la API', async ({ page }) => {
    await campo(page).click();

    // Ávila y Ñañez delante de Torres y Vargas: con el orden de puntos de
    // código, las dos caerían al final.
    await expect(opciones(page)).toHaveText([
      /Ávila Álvaro/,
      /Ñañez Ana María/,
      /Torres Ana/,
      /Torres Beto/,
      /Vargas Zoila/,
    ]);
  });

  test('busca por apellido, no solo por la primera letra', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('torres');

    await expect(opciones(page)).toHaveCount(2);
    await expect(opciones(page).first()).toContainText('Torres Ana');
  });

  test('dos palabras filtran a una sola persona, en cualquier orden', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('torres beto');

    await expect(opciones(page)).toHaveCount(1);
    await expect(opciones(page).first()).toContainText('Torres Beto');
  });

  test('la búsqueda ignora las tildes', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('alvaro');

    await expect(opciones(page)).toHaveCount(1);
    await expect(opciones(page).first()).toContainText('Ávila Álvaro');
  });

  test('también encuentra por un trozo del documento', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('45123');

    await expect(opciones(page)).toHaveCount(1);
    await expect(opciones(page).first()).toContainText('45123456');
  });

  test('sin coincidencias lo dice en vez de quedarse en blanco', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('zzzz');

    await expect(opciones(page)).toHaveCount(0);
    await expect(page.getByText(/Nadie coincide/)).toBeVisible();
  });

  test('elegir deja el nombre en el campo y cierra la lista', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('vargas');
    await opciones(page).first().click();

    await expect(opciones(page)).toHaveCount(0);
    await expect(campo(page)).toHaveValue('Vargas Zoila');
  });

  test('se puede elegir solo con el teclado', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('torres');
    await campo(page).press('ArrowDown');
    await campo(page).press('Enter');

    await expect(campo(page)).toHaveValue('Torres Beto');
  });

  test('Escape cierra sin elegir y deja el campo como estaba', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('torres');
    await campo(page).press('Escape');

    await expect(opciones(page)).toHaveCount(0);
    await expect(campo(page)).toHaveValue('');
  });

  test('un clic fuera cierra la lista', async ({ page }) => {
    await campo(page).click();
    await expect(opciones(page).first()).toBeVisible();

    // El título vive en la cabecera del panel: la pantalla ya no lo repite.
    await page.getByRole('heading', { name: 'Generador' }).click();

    await expect(opciones(page)).toHaveCount(0);
  });

  test('con empleado y tipo se genera el código', async ({ page }) => {
    await campo(page).click();
    await campo(page).fill('ana torres');
    await opciones(page).first().click();
    await page.locator('#type').selectOption('qrcode');

    await page.getByRole('button', { name: 'Generar' }).click();

    await expect(page.getByAltText('Código generado')).toBeVisible();
  });
});
