import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../../environments/environment';
import {
  IResolvedChecklistSection,
  IResolvedDocument,
  IResolvedFieldsSection,
  IResolvedFormat,
  IResolvedRowsSection,
  IResolvedHeaderSection,
  IResolvedSection,
  IResolvedSignaturesSection,
  IResolvedTableSection,
} from '../interfaces/format-document.interface';

/**
 * Origen del que cuelgan los recursos estáticos del backend.
 *
 * `environment.api` apunta al prefijo de la API (`.../api/v1`), y las imágenes
 * viven fuera de él, en `/static`. Se recorta el prefijo en vez de añadir otra
 * variable de entorno, que habría que acordarse de rellenar en cada despliegue.
 */
export function assetsOrigin(): string {
  return environment.api.replace(/\/api\/v\d+\/?$/, '');
}

/**
 * Pinta un `ResolvedFormat`, en pantalla y en papel.
 *
 * Es el tercer renderizador del motor v2, junto al de Excel y al PDF que sale
 * de él. Los tres leen la misma lista de secciones, así que ninguno puede
 * omitir un dato que otro lleve, y ninguno decide por su cuenta dónde cortan
 * las páginas: eso viene resuelto en el modelo.
 *
 * Sin PrimeNG a propósito, y no solo por la directriz del proyecto: los estilos
 * de una librería de componentes son justo lo que estropea una hoja impresa.
 * Aquí todo es HTML y CSS nativos con `@page A4`.
 *
 * El componente es de presentación pura: recibe el modelo y lo pinta. Quien lo
 * usa decide de dónde sale, y por eso sirve igual para imprimir una nombrada
 * que para previsualizar un borrador en el maestro.
 */
@Component({
  selector: 'app-format-document',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './format-document.html',
  styleUrl: './format-document.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormatDocument {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // El zoom de impresión se recalcula cada vez que cambia el tamaño de las
    // hojas: al pintarse, al cargar una imagen o al filtrar documentos. Y justo
    // antes de imprimir, por si acaso.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const refit = () => this.fitToPages();
      const observer = new ResizeObserver(refit);
      observer.observe(this.host.nativeElement);
      window.addEventListener('beforeprint', refit);
      refit();
      destroyRef.onDestroy(() => {
        observer.disconnect();
        window.removeEventListener('beforeprint', refit);
      });
    });
  }

  @Input({ required: true }) format!: IResolvedFormat;
  /** Documentos a pintar. Vacío significa todos. */
  @Input() only: string[] = [];

  get documents(): IResolvedDocument[] {
    const all = this.format?.documents ?? [];
    return this.only.length > 0
      ? all.filter((document) => this.only.includes(document.id))
      : all;
  }

  // Angular no estrecha el tipo de una unión discriminada dentro de la
  // plantilla, así que el estrechamiento se hace aquí y la plantilla recibe ya
  // el tipo concreto.
  asHeader = (section: IResolvedSection) => section as IResolvedHeaderSection;
  asFields = (section: IResolvedSection) => section as IResolvedFieldsSection;
  asChecklist = (section: IResolvedSection) => section as IResolvedChecklistSection;
  asTable = (section: IResolvedSection) => section as IResolvedTableSection;
  asRows = (section: IResolvedSection) => section as IResolvedRowsSection;
  asSignatures = (section: IResolvedSection) => section as IResolvedSignaturesSection;

  /**
   * URL de una imagen de la biblioteca.
   *
   * Se construye contra el **origen de la API**, no como ruta relativa. Las
   * sirve el backend bajo `/static/format-assets`, fuera del prefijo
   * `/api/v1`; una ruta relativa la pediría al servidor que sirve la
   * aplicación, que en desarrollo es otro puerto y en producción otro dominio,
   * y las imágenes salían todas rotas.
   *
   * La extensión no se conoce aquí, así que se prueban las dos que traen las
   * plantillas: `.png` primero y `.jpeg` si aquella falla (ver `onImageError`).
   */
  imageUrl(sha1: string): string {
    return `${assetsOrigin()}/static/format-assets/${sha1}.png`;
  }

  /**
   * Una imagen que no está en `.png` se reintenta en `.jpeg`.
   *
   * Es preferible a guardar la extensión en el modelo: son dos formatos y el
   * navegador resuelve el caso con un solo reintento. Si tampoco existe, se
   * oculta en vez de dejar el icono de imagen rota sobre el documento.
   */
  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    // El reintento es solo para la biblioteca, que guarda cada imagen en el
    // formato en que venía en la plantilla. Una firma vive en S3 con su nombre
    // propio: cambiarle la extensión pide una imagen que no existe.
    if (img.src.includes('/static/format-assets/') && img.src.endsWith('.png')) {
      img.src = img.src.replace(/\.png$/, '.jpeg');
      return;
    }
    img.style.visibility = 'hidden';
  }

  /**
   * La firma que va en una casilla de la tabla, o cadena vacía.
   *
   * `signatures` viaja en paralelo a `rows` y puede no venir en un formato
   * emitido antes de que existieran las firmas, así que se comprueba.
   */
  tableSignature(table: IResolvedTableSection, row: number, column: number): string {
    return table.signatures?.[row]?.[column] ?? '';
  }

  /**
   * Reparto de una seccion de campos: pares etiqueta/valor.
   *
   * Cada par ocupa dos columnas de la retícula, la de la etiqueta con un ancho
   * fijo cómodo de leer y la del valor con lo que sobre. Se repite tantas veces
   * como columnas declare la sección.
   */
  gridColumns(columns: number): string {
    return `repeat(${Math.max(1, columns)}, minmax(28mm, auto) minmax(0, 1fr))`;
  }

  /** Igual, pero la primera columna de cada par es la casilla de marcar. */
  checklistColumns(columns: number): string {
    return `repeat(${Math.max(1, columns)}, 6mm minmax(0, 1fr))`;
  }

  /**
   * Ancho de una columna de la tabla de personal.
   *
   * Las medidas del modelo son milímetros; se pasan a porcentaje del ancho
   * total para que la tabla ocupe la caja de la página tanto en vertical como
   * en apaisado, en vez de quedarse corta en una de las dos.
   */
  columnWidth(table: IResolvedTableSection, index: number): string {
    const total = table.columns.reduce((sum, column) => sum + column.widthMm, 0);
    // Sin medidas se reparte por igual: una columna sin ancho declarado es un
    // defecto del modelo, y dejarla en `auto` hundia la tabla entera.
    if (total <= 0) {
      return `${100 / table.columns.length}%`;
    }
    return `${(table.columns[index].widthMm / total) * 100}%`;
  }

  /**
   * Reparto de una fila en columnas.
   *
   * Los anchos son porcentajes que suman 100, no medidas absolutas: la fila
   * ocupa el ancho útil de la página y cada columna su parte. Es lo que permite
   * partir una fila sin recolocar nada.
   */
  rowTemplate(row: { cells: { width: number }[] }): string {
    return row.cells.map((cell) => `${cell.width}%`).join(' ');
  }

  print() {
    this.fitToPages();
    window.print();
  }

  /**
   * Escala de impresión de cada hoja, como el "Ajustar a" de Excel.
   *
   * Cada documento se imprime en las mismas hojas A4 que la plantilla original
   * (`data-print-pages`: asistencia y charla en una, ATS y permiso en dos). Si
   * el contenido no cabe, se reduce con `zoom`, que a diferencia de `transform`
   * sí reparte el contenido entre páginas. En pantalla no se aplica: solo se
   * deja calculado en `--fd-print-zoom` para `@media print`.
   *
   * Se mide en pantalla, donde la hoja tiene ya el ancho útil de la de papel
   * (A4 menos los márgenes), así que la altura medida es la que tendrá impresa.
   */
  fitToPages() {
    const mm = 96 / 25.4;
    const margin = 8 * mm * 2;
    const sheets = this.host.nativeElement.querySelectorAll<HTMLElement>('.fd-sheet');
    sheets.forEach((sheet) => {
      const content = sheet.querySelector<HTMLElement>('.fd-sheet__content');
      if (!content) return;
      const landscape = sheet.classList.contains('fd-sheet--landscape');
      const pageHeight = (landscape ? 210 : 297) * mm - margin;
      const pages = Math.max(1, Number(sheet.dataset['printPages']) || 1);
      const height = content.scrollHeight;
      // Un 3 % de holgura: las filas no se parten entre páginas y ese salto
      // deja un hueco al pie de cada una.
      const zoom = height > 0 ? Math.min(1, (pages * pageHeight * 0.97) / height) : 1;
      sheet.style.setProperty('--fd-print-zoom', zoom.toFixed(4));
    });
  }
}
