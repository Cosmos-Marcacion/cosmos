import { expect, type Locator } from '@playwright/test';

/**
 * Espera a que la pantalla este en pie, con mas margen que una asercion normal.
 *
 * El tope de `expect` esta en 7 s a proposito: una asercion sobre lo que hace
 * la pantalla no deberia tardar mas, y subirlo alargaria cada fallo de verdad.
 * Pero el primer pintado no es una asercion sobre nada: es la puerta de entrada
 * de la prueba, y con diez procesos arrancando a la vez su propia aplicacion,
 * pasarse de 7 s no significa que nada este roto.
 *
 * Esa diferencia se pagaba en fallos que cambiaban de sitio en cada ejecucion:
 * el volcado de la pagina que acompanaba al fallo mostraba la pantalla entera y
 * bien, porque para cuando se tomaba ya habia terminado de pintar.
 *
 * Aqui se separan las dos cosas. Si esto se agota, la pantalla no arranca; que
 * es un fallo distinto y se lee como tal.
 */
export async function esperarPantalla(locator: Locator, timeout = 30_000) {
  await expect(locator).toBeVisible({ timeout });
}
