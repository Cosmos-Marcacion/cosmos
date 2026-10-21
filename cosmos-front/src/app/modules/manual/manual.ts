import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { GLOSSARY, PROBLEMS, ROLES } from './content/manual-general';
import {
  AREAS,
  ARTICLES,
  findArticle,
  normalize,
  searchManual,
  segments,
  stepIds,
} from './manual-content';
import { ManualArea, ManualArticle } from './manual.types';

/** Clave del avance de los pasos en el navegador. */
const PROGRESS_KEY = 'cosmos-manual-progreso';

type Filtro = 'todo' | 'web' | 'app';

/**
 * Manual de uso de la plataforma y de la app.
 *
 * Es pública a propósito (va fuera del armazón y sin guardia): quien no puede
 * entrar es justo quien más la necesita, y no enseña ningún dato de la
 * operación, solo cómo se usa.
 */
@Component({
  selector: 'app-manual',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './manual.html',
  styleUrl: './manual.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Manual {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('buscador');
  private readonly contenido = viewChild<ElementRef<HTMLElement>>('contenido');

  protected readonly areas = AREAS;
  protected readonly roles = ROLES;
  protected readonly segments = segments;
  protected readonly findArticle = findArticle;
  protected readonly totalTemas = ARTICLES.length;

  // --- navegación -------------------------------------------------------------

  private readonly temaId = toSignal(this.route.paramMap.pipe(map((p) => p.get('tema'))), {
    initialValue: this.route.snapshot.paramMap.get('tema'),
  });

  protected readonly article = computed(() => findArticle(this.temaId()));
  /** La dirección pedía un tema que no existe. */
  protected readonly notFound = computed(() => !!this.temaId() && !this.article());

  protected readonly filtro = signal<Filtro>('todo');
  protected readonly menuAbierto = signal(false);

  /** Temas visibles en el índice según el filtro Panel / App. */
  protected readonly indice = computed(() => {
    const f = this.filtro();
    return AREAS.map((area) => ({
      area,
      temas: ARTICLES.filter(
        (a) => a.area === area.id && (f === 'todo' || a.area === f || (a.area !== 'web' && a.area !== 'app')),
      ),
    })).filter((g) => g.temas.length);
  });

  private readonly lineal = computed(() => this.indice().flatMap((g) => g.temas));

  protected readonly anterior = computed(() => this.vecino(-1));
  protected readonly siguiente = computed(() => this.vecino(1));

  protected readonly areaDe = (area: ManualArea) => AREAS.find((a) => a.id === area)?.label ?? '';

  // --- búsqueda ------------------------------------------------------------------

  protected readonly query = signal('');
  protected readonly resultados = computed(() => {
    const f = this.filtro();
    return searchManual(this.query()).filter(
      (h) => f === 'todo' || h.article.area === f || (h.article.area !== 'web' && h.article.area !== 'app'),
    );
  });
  protected readonly buscando = computed(() => this.query().trim().length > 1);

  // --- portada -------------------------------------------------------------------

  protected readonly rolId = signal(ROLES[0].id);
  protected readonly rol = computed(() => ROLES.find((r) => r.id === this.rolId()) ?? ROLES[0]);

  // --- avance de los pasos --------------------------------------------------------

  /** `idPasos:indice` de cada paso marcado. */
  protected readonly hechos = signal<Set<string>>(this.leerAvance());

  // --- asistente de problemas -----------------------------------------------------

  protected readonly problemaArea = signal<'web' | 'app'>('app');
  protected readonly problemaId = signal<string | null>(null);
  protected readonly problemas = computed(() => PROBLEMS.filter((p) => p.area === this.problemaArea()));
  protected readonly problema = computed(() => PROBLEMS.find((p) => p.id === this.problemaId()));

  // --- glosario -------------------------------------------------------------------

  protected readonly glosarioFiltro = signal('');
  protected readonly glosario = computed(() => {
    const q = normalize(this.glosarioFiltro().trim());
    return q ? GLOSSARY.filter((g) => normalize(`${g.term} ${g.definition}`).includes(q)) : GLOSSARY;
  });

  protected readonly copiado = signal(false);

  constructor() {
    // Título de la pestaña y vuelta arriba al cambiar de tema.
    effect(() => {
      const a = this.article();
      this.title.setTitle(a ? `${a.title} · Manual de uso` : 'Manual de uso · Cosmos');
      this.contenido()?.nativeElement.scrollTo?.({ top: 0 });
      if (typeof window !== 'undefined') window.scrollTo?.({ top: 0 });
    });
  }

  // --- acciones -------------------------------------------------------------------

  protected abrir(id: string) {
    this.query.set('');
    this.menuAbierto.set(false);
    this.problemaId.set(null);
    this.router.navigate(['/manual', id]);
  }

  protected buscar(valor: string) {
    this.query.set(valor);
  }

  protected limpiarBusqueda() {
    this.query.set('');
    this.searchInput()?.nativeElement.focus();
  }

  /** Enter en el buscador abre el primer resultado. */
  protected abrirPrimero() {
    const primero = this.resultados()[0];
    if (primero) this.abrir(primero.article.id);
  }

  protected pasoHecho(grupo: string, indice: number): boolean {
    return this.hechos().has(`${grupo}:${indice}`);
  }

  protected alternarPaso(grupo: string, indice: number) {
    const clave = `${grupo}:${indice}`;
    const nuevo = new Set(this.hechos());
    if (nuevo.has(clave)) nuevo.delete(clave);
    else nuevo.add(clave);
    this.hechos.set(nuevo);
    this.guardarAvance(nuevo);
  }

  protected cuantosHechos(grupo: string, total: number): number {
    let n = 0;
    for (let i = 0; i < total; i++) if (this.pasoHecho(grupo, i)) n++;
    return n;
  }

  protected reiniciarPasos(grupo: string, total: number) {
    const nuevo = new Set(this.hechos());
    for (let i = 0; i < total; i++) nuevo.delete(`${grupo}:${i}`);
    this.hechos.set(nuevo);
    this.guardarAvance(nuevo);
  }

  /** Si el tema tiene pasos y ya están todos hechos, para marcarlo en el índice. */
  protected temaCompleto(article: ManualArticle): boolean {
    const grupos = article.blocks.filter((b) => b.t === 'steps');
    if (!grupos.length) return false;
    return grupos.every((b) => b.t === 'steps' && this.cuantosHechos(b.id, b.items.length) === b.items.length);
  }

  protected tienePasos(article: ManualArticle): boolean {
    return stepIds(article).length > 0;
  }

  protected elegirProblemaArea(area: 'web' | 'app') {
    this.problemaArea.set(area);
    this.problemaId.set(null);
  }

  protected async copiarEnlace() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.copiado.set(false);
    }
  }

  protected imprimir() {
    window.print();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent) {
    const destino = event.target as HTMLElement | null;
    const escribiendo = !!destino && ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName);
    if ((event.key === '/' && !escribiendo) || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      this.searchInput()?.nativeElement.focus();
      return;
    }
    if (event.key === 'Escape') {
      if (this.menuAbierto()) this.menuAbierto.set(false);
      else if (this.query()) this.query.set('');
    }
  }

  // --- auxiliares -----------------------------------------------------------------

  private vecino(paso: number): ManualArticle | undefined {
    const a = this.article();
    if (!a) return undefined;
    const lista = this.lineal();
    const i = lista.findIndex((x) => x.id === a.id);
    return i < 0 ? undefined : lista[i + paso];
  }

  // El navegador puede negar el almacenamiento (modo privado, datos
  // bloqueados): el manual funciona igual, solo no recuerda el avance.
  private leerAvance(): Set<string> {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      const lista = raw ? (JSON.parse(raw) as unknown) : [];
      return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  }

  private guardarAvance(hechos: Set<string>) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify([...hechos]));
    } catch {
      /* sin almacenamiento: se pierde al recargar, nada más */
    }
  }
}
