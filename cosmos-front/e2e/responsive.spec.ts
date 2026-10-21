import { expect, test, type Page } from '@playwright/test';
import { mockApi, signIn } from './support/api';

/**
 * Ninguna pantalla se desplaza en horizontal ni deja nada fuera de la ventana.
 *
 * La auditoría del 29/09/2026 encontró la página entera desplazándose en
 * horizontal en el panel, el listado de marcaciones y el detalle de empleado:
 * la columna de contenido del layout no encogía por debajo de su tabla más
 * ancha. Se comprueba el documento y, además, que nada visible sobresalga de su
 * caja sin un contenedor que lo recoja: así también sale "Hoy" pisando el borde
 * de la tarjeta de filtros, que no provoca scroll pero se ve cortado.
 */
const MODULOS = ['panel', 'perfiles', 'usuarios', 'marcaciones', 'puertos', 'puntos', 'formatos', 'generador', 'sincronizar-empleados'];
const RUTAS = [
  '/panel',
  '/perfiles',
  '/usuarios',
  '/usuarios/agregar',
  '/marcaciones',
  '/marcaciones/nombrada/3541?date=2026-09-10',
  '/marcaciones/listado',
  '/marcaciones/agregar',
  '/marcaciones/ver/emp-1/2026-09-20/3541',
  '/puertos',
  '/puntos',
  '/formatos/maestro',
  '/generador',
  '/sincronizar-empleados',
];
const ANCHOS = [360, 768, 1024, 1280];

/** Elementos visibles que se salen por la derecha de su padre sin que nada los recoja. */
function desbordes(page: Page) {
  return page.evaluate(() => {
    // El scroll vertical de la página (`.layout-outlet`) no cuenta como algo
    // que recoja un desborde: lo que se le sale por la derecha se ve cortado.
    const recoge = (el: Element | null) => {
      for (let p = el; p && p !== document.body && !p.classList.contains('layout-outlet'); p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true;
      }
      return false;
    };
    const fuera: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'absolute' || cs.position === 'fixed') continue;
      // El menú móvil cerrado y las cabeceras de las tablas en tarjeta están
      // recortados a propósito.
      if (el.closest('.main-menu') || el.closest('thead')) continue;
      const par = el.parentElement;
      if (!par || recoge(par)) continue;
      const r = el.getBoundingClientRect();
      const p = par.getBoundingClientRect();
      if (r.width === 0 || p.width === 0) continue;
      const limite = p.right - parseFloat(getComputedStyle(par).borderRightWidth || '0');
      if (r.right > limite + 2) {
        fuera.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ')[0]} +${Math.round(r.right - limite)}px`);
      }
    }
    return {
      pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fuera: fuera.slice(0, 5),
    };
  });
}

for (const ruta of RUTAS) {
  test(`${ruta} no se desborda en horizontal`, async ({ page }) => {
    test.setTimeout(90_000);
    await mockApi(page);
    await signIn(page, MODULOS);
    for (const ancho of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: 800 });
      await page.goto(ruta);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('app-main-layout')).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => desbordes(page), { message: `${ruta} a ${ancho} px` }).toEqual({ pagina: 0, fuera: [] });
    }
  });
}

/**
 * La página no se desplaza en vertical: el único scroll es el del contenido
 * (`.layout-outlet`).
 *
 * En el panel aparecían dos barras y, al llegar al final, una franja en blanco:
 * el `caption` oculto de las tablas es `absolute` y, sin un contenedor
 * posicionado, alargaba el documento por debajo del layout.
 */
for (const ruta of ['/panel', '/marcaciones', '/usuarios']) {
  test(`${ruta} no tiene un segundo scroll vertical`, async ({ page }) => {
    await mockApi(page);
    await signIn(page, MODULOS);
    await page.setViewportSize({ width: 1600, height: 834 });
    await page.goto(ruta);
    await expect(page.locator('app-main-layout')).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight))
      .toBe(0);
  });
}
