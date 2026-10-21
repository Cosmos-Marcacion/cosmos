/**
 * Modelo del manual de uso.
 *
 * El contenido es un dato, no una plantilla: cada tema es una lista de bloques
 * tipados que la pantalla sabe pintar. Así el buscador recorre el mismo texto
 * que se ve, y añadir un tema no obliga a tocar el HTML.
 *
 * El texto admite una sola marca: `**así**` sale en negrita. Se usa para los
 * rótulos de botones y campos tal como aparecen en pantalla.
 */

/** Dónde vive lo que se explica. */
export type ManualArea = 'inicio' | 'web' | 'app' | 'problemas' | 'referencia';

export type ManualBlock =
  | { t: 'p'; text: string }
  /** Subtítulo dentro de un tema. */
  | { t: 'h'; text: string }
  | { t: 'list'; items: string[] }
  /**
   * Pasos que se pueden ir marcando. `id` debe ser único en todo el manual:
   * con él se recuerda el avance en el navegador.
   */
  | { t: 'steps'; id: string; title: string; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'note'; tone: 'info' | 'tip' | 'warn'; text: string }
  /** Cada elemento de la pantalla con lo que hace. */
  | { t: 'ui'; title?: string; items: { label: string; desc: string }[] }
  | { t: 'faq'; items: { q: string; a: string }[] }
  /** El asistente de resolución de problemas (ver `manual-problems.ts`). */
  | { t: 'troubleshooter' }
  /** El glosario completo, con su filtro. */
  | { t: 'glossary' }
  /** Enlaces a otros temas. */
  | { t: 'related'; ids: string[] };

export interface ManualArticle {
  id: string;
  area: ManualArea;
  title: string;
  /** Una línea: para qué sirve lo que se explica. */
  summary: string;
  /** Quién lo usa, en palabras de la operación. */
  audience?: string[];
  /** Ruta de la pantalla en la plataforma o en la app, si la tiene. */
  where?: string;
  /** Palabras que alguien buscaría y que no salen en el texto. */
  keywords?: string[];
  blocks: ManualBlock[];
}

export interface ManualProblem {
  id: string;
  area: 'web' | 'app';
  /** Lo que la persona ve o lo que le pasa, como lo diría. */
  symptom: string;
  cause: string;
  fix: string[];
  /** Tema del manual que lo explica a fondo. */
  articleId?: string;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
}

/** Un perfil de uso y las tareas que más hace, para la portada. */
export interface ManualRole {
  id: string;
  label: string;
  description: string;
  tasks: { label: string; articleId: string }[];
}
