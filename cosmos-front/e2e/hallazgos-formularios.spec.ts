import { expect, test } from '@playwright/test';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * Hallazgos de formularios y acceso del informe del 18/09/2026: CKI02, CKI05,
 * CKI06, CKI07, CKI09, CKI11, CKI12 (ingreso), CKI13, CKI15, CKI18 y CKI19.
 *
 * El backend esta simulado: aqui se prueba lo que ve y puede hacer la persona.
 * Las reglas del servidor tienen sus propias pruebas en cosmos-back.
 */

test.describe('alta de usuarios (CKI02, CKI09, CKI13)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['usuarios']);
    await page.goto('/usuarios/agregar');
    await esperarPantalla(page.getByLabel('Rol'));
  });

  test('el selector de rol ofrece los perfiles asignables', async ({ page }) => {
    const rol = page.getByLabel('Rol');
    await expect(rol.locator('option')).toHaveCount(3);
    await rol.selectOption({ label: 'Supervisor' });
    await expect(rol).toHaveValue('6862b2dd5b6efa7634310d31');
  });

  test('nombre numerico o con emojis y contrasena debil no dejan guardar', async ({ page }) => {
    await page.getByLabel('Nombre').fill('4322343424');
    await page.getByLabel('Correo electrónico').fill('valeria.hermoza@cosmos.com.pe');
    await page.getByLabel('Contraseña').fill('1');
    await page.getByLabel('Rol').selectOption({ label: 'Admin' });
    await page.getByLabel('Nombre').blur();

    await expect(page.getByText('Solo letras, espacios, apóstrofo, guion y punto')).toBeVisible();
    await expect(page.getByText('Mínimo 8 caracteres, con al menos una letra y un número.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'GUARDAR' })).toBeDisabled();

    await page.getByLabel('Nombre').fill('al\u{1F600}onso');
    await expect(page.getByRole('button', { name: 'GUARDAR' })).toBeDisabled();
  });

  test('con datos validos crea el usuario', async ({ page }) => {
    const api = await mockApi(page);
    await page.getByLabel('Nombre').fill('Valeria Hermoza');
    await page.getByLabel('Correo electrónico').fill('valeria.hermoza@cosmos.com.pe');
    await page.getByLabel('Contraseña').fill('Cosmos2026');
    await page.getByLabel('Rol').selectOption({ label: 'Admin' });

    await page.getByRole('button', { name: 'GUARDAR' }).click();

    await expect(page).toHaveURL(/\/usuarios$/);
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/user')).toBe(true);
  });
});

test.describe('puertos (CKI05)', () => {
  test('solo espacios no habilita GUARDAR', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['puertos']);
    await page.goto('/puertos/agregar');
    await esperarPantalla(page.getByLabel('Nombre'));

    await page.getByLabel('Nombre').fill('   ');
    await page.getByLabel('Dirección').fill('\t  ');
    await page.getByLabel('Dirección').blur();

    await expect(page.getByRole('button', { name: 'GUARDAR' })).toBeDisabled();
    await expect(page.getByText('El nombre es requerido.')).toBeVisible();
    await expect(page.getByText('La dirección es requerida')).toBeVisible();
  });
});

test.describe('puntos de marcación (CKI06, CKI07, CKI15)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['puntos']);
    await page.goto('/puntos/agregar');
    await esperarPantalla(page.getByLabel('Puerto *'));
  });

  test('cada desplegable tiene su propio nombre accesible', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: 'Puerto *' })).toHaveAttribute('id', 'portId');
    await expect(page.getByRole('combobox', { name: 'Depende de' })).toHaveAttribute('id', 'dependOnId');
  });

  test('"Depende de" solo ofrece puntos del puerto elegido', async ({ page }) => {
    const puerto = page.getByRole('combobox', { name: 'Puerto *' });
    const depende = page.getByRole('combobox', { name: 'Depende de' });

    await puerto.selectOption({ label: 'Paita' });
    await expect(depende.locator('option')).toHaveText(['Sin dependencia', 'Ingreso Puerto', 'Salida Puerto']);
    await depende.selectOption({ label: 'Ingreso Puerto' });

    await puerto.selectOption({ label: 'Callao' });
    await expect(depende.locator('option')).toHaveText(['Sin dependencia', '1er Ingreso Muelle', 'Salida Muelle']);
    // La dependencia de Paita no vale en Callao.
    await expect(depende).toHaveValue('');
  });

  test('nombre con emojis y tolerancias negativas o con letras no dejan guardar', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Puerto *' }).selectOption({ label: 'Callao' });
    await page.getByLabel('Nombre *').fill('al\u{1F600} @#$%');
    // "1e2" es lo que un campo numerico convertia en otra cosa o en vacio.
    await page.getByLabel('Tolerancia anterior (minutos)').fill('1e2');
    await page.getByLabel('Tolerancia siguiente (minutos)').fill('-21');
    await page.getByLabel('Tolerancia siguiente (minutos)').blur();

    await expect(page.getByRole('button', { name: 'GUARDAR' })).toBeDisabled();
    await expect(page.getByText('Solo letras, números, espacios')).toBeVisible();
    // El valor invalido sigue a la vista: no se borra en silencio.
    await expect(page.getByLabel('Tolerancia anterior (minutos)')).toHaveValue('1e2');
    await expect(page.getByText('Número entero de 0 a 240.').first()).toBeVisible();

    await page.getByLabel('Nombre *').fill('Garita Norte');
    await page.getByLabel('Tolerancia anterior (minutos)').fill('15');
    await page.getByLabel('Tolerancia siguiente (minutos)').fill('30');
    await expect(page.getByRole('button', { name: 'GUARDAR' })).toBeEnabled();
  });
});

test.describe('ingreso (CKI12)', () => {
  test('Ingresar con los campos vacíos explica qué falta', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    await esperarPantalla(page.getByRole('button', { name: 'Ingresar' }));

    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page.getByText('Ingresa tu correo.')).toBeVisible();
    await expect(page.getByText('Ingresa tu contraseña.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mostrar contraseña' })).toBeVisible();
  });
});

test.describe('recuperar cuenta (CKI18, CKI19)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');
    await esperarPantalla(page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }));
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
  });

  test('un correo no registrado se informa y no pasa a nueva contraseña', async ({ page }) => {
    await page.getByLabel('Correo').fill('nadie@cosmos.com.pe');
    await page.getByRole('button', { name: 'Enviar Código' }).click();

    await expect(page.getByRole('alert')).toContainText('no está registrado');
    await expect(page.getByRole('heading', { name: 'Recuperar Cuenta' })).toBeVisible();
  });

  test('un fallo del envío dice qué hacer y permite reintentar', async ({ page }) => {
    await page.getByLabel('Correo').fill('caido@cosmos.com.pe');
    await page.getByRole('button', { name: 'Enviar Código' }).click();

    await expect(page.getByRole('alert')).toContainText('Inténtalo de nuevo en unos minutos');
    await expect(page.getByRole('button', { name: 'Enviar Código' })).toBeEnabled();
  });

  test('un correo válido pasa a nueva contraseña y bloquea el reenvío', async ({ page }) => {
    await page.getByLabel('Correo').fill('alonso.pena@cosmos.com.pe');
    await page.getByRole('button', { name: 'Enviar Código' }).click();

    await expect(page.getByRole('heading', { name: 'Nueva Contraseña' })).toBeVisible();
    await expect(page.getByText('Te enviamos un código de verificación.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Reenviar código en \d+ s/ })).toBeDisabled();
  });
});

test.describe('sincronizar empleados (CKI11)', () => {
  test('muestra la última ejecución y el historial al entrar', async ({ page }) => {
    await mockApi(page);
    await signIn(page, ['sincronizar-empleados']);
    await page.goto('/sincronizar-empleados');
    await esperarPantalla(page.getByRole('heading', { name: 'Última sincronización' }));

    const panel = page.locator('section[aria-labelledby="sync-history-title"]');
    await expect(panel).toContainText('Con errores');
    await expect(panel).toContainText('120');
    await expect(panel).toContainText('Historial (2 ejecuciones)');
  });
});
