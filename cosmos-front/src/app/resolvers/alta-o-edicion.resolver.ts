import { ResolveFn } from '@angular/router';

/**
 * Titulo de una pantalla que sirve para dar de alta y para editar.
 *
 * Las pantallas de "Agregar" repetian su titulo dentro del contenido, justo
 * debajo del que ya pinta la cabecera del panel: dos titulos seguidos diciendo
 * casi lo mismo y unos 40 px de menos para lo que se venia a ver. El de dentro
 * se retira, pero no se puede perder lo que decia de mas: era lo unico que
 * distinguia dar de alta de editar.
 *
 * Asi que pasa al `title` de la ruta, que es de donde la cabecera lo toma. Va
 * como resolutor y no como texto fijo porque depende del parametro: la misma
 * pantalla es "Agregar puerto" sin `:id` y "Editar puerto" con el.
 *
 *     { path: 'puertos/agregar/:id', title: altaOEdicion('puerto'), ... }
 */
export function altaOEdicion(entidad: string): ResolveFn<string> {
  return route => (route.paramMap.get('id') ? `Editar ${entidad}` : `Agregar ${entidad}`);
}
