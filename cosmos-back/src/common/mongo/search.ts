import type { FilterQuery } from 'mongoose';

/**
 * Busqueda por texto sobre campos de Mongo, sin dejar que el usuario escriba la
 * expresion regular.
 *
 * El filtro se armaba metiendo `search` tal cual dentro de `$regex`. Eso tenia
 * dos consecuencias que el test de integracion de puertos destapo:
 *
 *  - un parentesis suelto (`?search=(`) es una regex invalida y la peticion
 *    terminaba en 500;
 *  - `?search=.*` no filtra: devuelve la coleccion entera, que es justo lo que
 *    el parametro deberia impedir.
 *
 * Ademas hay un tercer problema que no se ve pero se paga: una regex construida
 * con entrada ajena es un vector de ReDoS. Un patron con anidamiento puede
 * tener a Mongo ocupado el tiempo que quiera quien lo envie.
 */

/** Neutraliza los metacaracteres para que el texto se busque literal. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filtro `$or` de coincidencia parcial e insensible a mayusculas sobre los
 * campos dados. Devuelve `{}` cuando no hay nada que buscar, para que el
 * llamante no tenga que distinguir el caso.
 */
export function buildSearchFilter<T>(
  search: string | undefined | null,
  fields: string[]
): FilterQuery<T> {
  const term = (search ?? '').trim();
  if (!term || fields.length === 0) {
    return {} as FilterQuery<T>;
  }

  const pattern = escapeRegex(term);
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: pattern, $options: 'i' },
    })),
  } as FilterQuery<T>;
}
