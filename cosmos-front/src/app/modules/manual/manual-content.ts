import { APP_ARTICLES } from './content/manual-app';
import { GENERAL_ARTICLES, GLOSSARY, PROBLEMS } from './content/manual-general';
import { WEB_ARTICLES } from './content/manual-web';
import { ManualArea, ManualArticle, ManualBlock } from './manual.types';

export interface AreaInfo {
  id: ManualArea;
  label: string;
  description: string;
}

/** Orden del índice lateral. */
export const AREAS: AreaInfo[] = [
  { id: 'inicio', label: 'Primeros pasos', description: 'Qué es la plataforma y cómo se organiza.' },
  { id: 'web', label: 'Panel web', description: 'La plataforma en el navegador: jornada, formatos y administración.' },
  { id: 'app', label: 'App móvil', description: 'Cosmos Check-In en Android: registro, marcación y charlas.' },
  { id: 'problemas', label: 'Ayuda', description: 'Resolver problemas y preguntas frecuentes.' },
  { id: 'referencia', label: 'Consulta', description: 'Glosario, reglas y atajos.' },
];

/** Todos los temas, en el orden en que se leen. */
export const ARTICLES: ManualArticle[] = [
  ...GENERAL_ARTICLES.filter((a) => a.area === 'inicio'),
  ...WEB_ARTICLES,
  ...APP_ARTICLES,
  ...GENERAL_ARTICLES.filter((a) => a.area !== 'inicio'),
];

const BY_ID = new Map(ARTICLES.map((a) => [a.id, a]));

export function findArticle(id: string | null | undefined): ManualArticle | undefined {
  return id ? BY_ID.get(id) : undefined;
}

// --- texto --------------------------------------------------------------------

export interface TextSegment {
  text: string;
  strong: boolean;
}

/**
 * Parte un texto con `**negrita**` en tramos.
 *
 * Se pinta con nodos de texto, nunca con `innerHTML`: el contenido es nuestro,
 * pero así ni un signo raro en un rótulo se puede interpretar como HTML.
 */
export function segments(text: string): TextSegment[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, strong: i % 2 === 1 }))
    .filter((s) => s.text !== '');
}

/** El texto sin marcas, para buscar y para los extractos. */
export function plain(text: string): string {
  return text.split('**').join('');
}

/** Minúsculas y sin tildes: "Marcación" y "marcacion" son la misma búsqueda. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function blockText(block: ManualBlock): string[] {
  switch (block.t) {
    case 'p':
    case 'h':
      return [block.text];
    case 'note':
      return [block.text];
    case 'list':
      return block.items;
    case 'steps':
      return [block.title, ...block.items];
    case 'table':
      return [...block.head, ...block.rows.flat()];
    case 'ui':
      return [block.title ?? '', ...block.items.flatMap((i) => [i.label, i.desc])];
    case 'faq':
      return block.items.flatMap((i) => [i.q, i.a]);
    case 'troubleshooter':
      return PROBLEMS.flatMap((p) => [p.symptom, p.cause, ...p.fix]);
    case 'glossary':
      return GLOSSARY.flatMap((g) => [g.term, g.definition]);
    default:
      return [];
  }
}

/** Frases buscables de un tema, sin marcas. */
export function articleSentences(article: ManualArticle): string[] {
  return article.blocks.flatMap(blockText).map(plain).filter(Boolean);
}

// --- búsqueda -------------------------------------------------------------------

export interface SearchHit {
  article: ManualArticle;
  score: number;
  /** La frase donde aparece, para enseñar el contexto. */
  excerpt: string;
}

/**
 * Busca en títulos, resúmenes, palabras clave y en todo el contenido.
 *
 * Cada palabra de la consulta tiene que aparecer en algún sitio del tema; pesa
 * más en el título que en el cuerpo. Así "firma formato" encuentra el tema que
 * habla de las dos cosas y no cualquiera que diga "formato".
 */
export function searchManual(query: string, articles: ManualArticle[] = ARTICLES): SearchHit[] {
  const words = normalize(query).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];

  const hits: SearchHit[] = [];
  for (const article of articles) {
    const title = normalize(article.title);
    const summary = normalize(article.summary);
    const keywords = normalize((article.keywords ?? []).join(' '));
    const sentences = articleSentences(article);
    const body = normalize(sentences.join(' '));

    let score = 0;
    let all = true;
    for (const word of words) {
      const inTitle = title.includes(word);
      const inSummary = summary.includes(word);
      const inKeywords = keywords.includes(word);
      const inBody = body.includes(word);
      if (!inTitle && !inSummary && !inKeywords && !inBody) {
        all = false;
        break;
      }
      score += (inTitle ? 10 : 0) + (inKeywords ? 5 : 0) + (inSummary ? 4 : 0) + (inBody ? 1 : 0);
    }
    if (!all) continue;

    const excerpt =
      sentences.find((s) => words.every((w) => normalize(s).includes(w))) ??
      sentences.find((s) => normalize(s).includes(words[0])) ??
      article.summary;
    hits.push({ article, score, excerpt });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** Ids de los pasos con casilla de todo el manual, para contar el avance. */
export function stepIds(article: ManualArticle): string[] {
  return article.blocks.filter((b): b is Extract<ManualBlock, { t: 'steps' }> => b.t === 'steps').map((b) => b.id);
}
