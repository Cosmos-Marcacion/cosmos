import { expect, test, type Page } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * El armazon del panel: columna de modulos, logotipo y cabecera.
 *
 * Son las observaciones 1, 3 y 8 del informe de pruebas del 16 y 17 de
 * septiembre. Las tres van del mismo problema: espacio de pantalla que se
 * gasta en cosas fijas y no deja ver lo que se viene a consultar.
 */
const menu = (page: Page) => page.locator('app-menu').first();
/** El logotipo existe dos veces, uno por menú; se usa el visible. */
const logo = (page: Page) =>
  page.getByRole('button', { name: 'Ir a la pantalla principal' }).first();
/** Los números de página, por nombre accesible: el texto lleva saltos de línea. */
const numero = (page: Page, n: string) =>
  page.getByRole('navigation', { name: 'Paginación' }).getByRole('button', { name: n, exact: true });
const plegar = (page: Page) => page.getByRole('button', { name: /Ocultar el menú/i });
const desplegar = (page: Page) => page.getByRole('button', { name: /Mostrar el menú/i });

async function abrirUsuarios(page: Page) {
  await mockApi(page);
  await signIn(page, ['panel', 'usuarios', 'marcaciones']);
  await page.goto('/usuarios');
  await esperarPantalla(page.getByRole('heading', { name: 'Usuarios' }));
}

test.describe('columna de módulos', () => {
  test('se pliega a una barra de iconos y se vuelve a desplegar', async ({ page }) => {
    await abrirUsuarios(page);
    await expect(menu(page).getByText('Usuarios')).toBeVisible();
    const ancho = (await menu(page).boundingBox())!.width;

    await plegar(page).click();

    // Plegada quedan los iconos: las etiquetas se van y la columna encoge.
    await expect(menu(page).getByText('Usuarios')).toHaveCount(0);
    expect((await menu(page).boundingBox())!.width).toBeLessThan(ancho);

    await desplegar(page).click();

    await expect(menu(page).getByText('Usuarios')).toBeVisible();
  });

  test('plegada se sigue navegando por los iconos', async ({ page }) => {
    await abrirUsuarios(page);
    await plegar(page).click();

    await menu(page).locator('li[title="Marcaciones"]').click();

    await expect(page).toHaveURL(/\/marcaciones/);
  });

  test('recuerda que quedó plegada al recargar', async ({ page }) => {
    await abrirUsuarios(page);
    await plegar(page).click();

    await page.reload();
    await esperarPantalla(menu(page));

    // Quien trabaja en un portátil la pliega una vez, no en cada entrada.
    await expect(desplegar(page)).toBeVisible();
    await expect(menu(page).getByText('Usuarios')).toHaveCount(0);
  });
});

test.describe('el logotipo', () => {
  test('vuelve a la pantalla principal', async ({ page }) => {
    await abrirUsuarios(page);

    await logo(page).click();

    await expect(page).toHaveURL(/\/panel/);
  });

  test('sin el módulo de panel lleva a la primera pantalla permitida', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['marcaciones']);
    await page.goto('/marcaciones');
    await esperarPantalla(logo(page));

    await logo(page).click();

    // A `/panel` fijo el guardia lo devolvería con un aviso de error.
    await expect(page).toHaveURL(/\/marcaciones/);
    await expect(page.locator('app-notification')).toHaveCount(0);
  });
});

test.describe('títulos de módulo', () => {
  test('el título sale una sola vez, en la cabecera', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['generador']);
    await page.goto('/generador');
    await esperarPantalla(page.getByRole('combobox', { name: /empleado/i }));

    // Antes había dos: el de la cabecera y el que repetía la pantalla debajo.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Generador');
  });

  test('el alta y la edición se distinguen en la cabecera', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['usuarios']);

    await page.goto('/usuarios/agregar');
    await esperarPantalla(page.getByRole('heading', { level: 1 }));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agregar usuario');

    await page.goto('/usuarios/agregar/u1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editar usuario');
  });
});

test.describe('paginación', () => {
  test('muestra las páginas que hay, no solo la primera', async ({ page }) => {
    await abrirUsuarios(page);

    // El fallo reportado: con 57 usuarios y límite 10 salía un único «1».
    await expect(numero(page, '5')).toBeVisible();
    await expect(page.getByText('Mostrando')).toContainText('de 57 resultados');
  });

  test('el número sigue a la página en la que se está', async ({ page }) => {
    await abrirUsuarios(page);

    await numero(page, '3').click();

    await expect(page.getByText('Mostrando')).toContainText('21');
    await expect(page.getByText('Mostrando')).toContainText('30');
  });

  test('en la primera página no se puede retroceder', async ({ page }) => {
    await abrirUsuarios(page);

    // Emitía la página 0, que el servidor traduce a un `skip` negativo.
    await expect(page.getByRole('button', { name: 'Anterior' }).last()).toBeDisabled();
  });
});
