import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { FormatDocument, assetsOrigin } from './format-document';
import { IResolvedFormat } from '../interfaces/format-document.interface';

/**
 * La vista de impresión es el tercer renderizador del motor v2.
 *
 * Lo que hay que demostrar es que pinta **todo** lo que el modelo trae: si se
 * come una sección, sale una hoja que parece correcta y no lo es, que es
 * exactamente el riesgo que el informe de factibilidad marcaba como el peor de
 * este trabajo.
 */
const FORMAT: IResolvedFormat = {
  formatType: 'GRANEL',
  label: 'Granel',
  version: 3,
  engine: 'v2',
  documents: [
    {
      id: 'asistencia',
      name: 'ASISTENCIA',
      orientation: 'landscape',
      pages: 2,
      number: 'AST-2026-0042',
      sections: [
        {
          kind: 'header',
          id: 'cabecera',
          title: 'ASISTENCIA DE PERSONAL PAITA',
          documentCode: 'PD03-R97',
          documentVersion: '06',
          documentDate: '10.08.23',
          pages: 2,
          fields: [{ id: 'n', label: 'N°:', value: 'AST-2026-0042' }],
        },
        {
          kind: 'fields',
          id: 'general',
          title: 'INFORMACIÓN GENERAL',
          columns: 1,
          fields: [
            { id: 'nave', label: 'NAVE:', value: 'CMA CGM VOLTAIRE' },
            { id: 'muelle', label: 'MUELLE:', value: '2-A' },
          ],
        },
        {
          kind: 'checklist',
          id: 'jornada',
          title: 'JORNADA DE TRABAJO:',
          columns: 1,
          items: [
            { id: 'j1', label: '07:00 / 15:00 HRS.', checked: true },
            { id: 'j2', label: '15:00 / 23:00 HRS.', checked: false },
          ],
        },
        {
          kind: 'table',
          id: 'personal',
          columns: [
            { id: 'n', label: 'N°', widthMm: 10, align: 'center' },
            { id: 'nombre', label: 'APELLIDOS Y NOMBRES', widthMm: 90, align: 'left' },
          ],
          rows: [['1', 'LUIS GOMEZ'], ['2', 'ANA PEREZ']],
          // Solo la primera tiene firma registrada; la segunda firma a mano.
          signatures: [[null, 'https://s3/luis.png'], [null, null]],
          rowsPerPage: 21,
          pages: 1,
        },
        {
          kind: 'signatures',
          id: 'firmas',
          title: 'RESPONSABLE',
          columns: 2,
          slots: [
            { id: 's1', label: 'Supervisor SSOMA', name: 'MARIA DIAZ' },
            { id: 's2', label: 'Jefe de cubierta', name: 'LUIS GOMEZ' },
          ],
        },
      ],
    },
    {
      id: 'pts',
      name: 'SS01-F167. PTS',
      orientation: 'portrait',
      pages: 1,
      number: 'PTS-0137',
      sections: [
        {
          kind: 'rows',
          id: 'cuerpo',
          rows: [
            {
              id: 'r1',
              cells: [{
                id: 'c1', width: 100, kind: 'text', text: 'PERMISO DE TRABAJO SEGURO',
                checked: false, bold: true, align: 'center', fill: true, boxed: true,
              }],
            },
            {
              id: 'r2',
              minHeightMm: 8,
              cells: [
                {
                  id: 'c2', width: 40, kind: 'text', text: 'EQUIPO DE PROTECCION',
                  checked: false, bold: false, align: 'left', fill: false, boxed: true,
                },
                {
                  id: 'c3', width: 20, kind: 'image', text: 'casco',
                  images: [{ sha1: 'abc123', alt: 'Pictograma de casco', widthMm: 8, heightMm: 8 }],
                  checked: false, bold: false, align: 'center', fill: false, boxed: true,
                },
                {
                  id: 'c4', width: 40, kind: 'text', text: 'CASCO',
                  checked: false, bold: false, align: 'right', fill: false, boxed: false,
                },
              ],
            },
            {
              id: 'r3',
              cells: [
                {
                  id: 'c5', width: 50, kind: 'check', text: '',
                  checked: true, bold: false, align: 'left', fill: false, boxed: true,
                },
                {
                  id: 'c6', width: 50, kind: 'blank', text: '',
                  checked: false, bold: false, align: 'left', fill: false, boxed: false,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'ingles',
      name: 'INGLÉS',
      orientation: 'portrait',
      pages: 1,
      number: 'SSL-2026-0042',
      sections: [
        {
          kind: 'header',
          id: 'cabecera',
          title: "SHIFT'S STEVEDORES LIST",
          pages: null,
          fields: [],
        },
      ],
    },
  ],
};

describe('FormatDocument', () => {
  let fixture: ComponentFixture<FormatDocument>;
  let component: FormatDocument;

  function setUp(only: string[] = []) {
    TestBed.configureTestingModule({
      imports: [FormatDocument],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(FormatDocument);
    component = fixture.componentInstance;
    component.format = FORMAT;
    component.only = only;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const $ = (selector: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));

  it('pinta una hoja por documento', () => {
    setUp();
    expect($('.fd-sheet').length).toBe(3);
  });

  it('la hoja apaisada se marca como tal', () => {
    setUp();
    expect($('.fd-sheet')[0].classList).toContain('fd-sheet--landscape');
    expect($('.fd-sheet')[1].classList).not.toContain('fd-sheet--landscape');
  });

  it('la cabecera lleva código, versión y fecha del documento controlado', () => {
    setUp();
    expect(text()).toContain('PD03-R97');
    expect(text()).toContain('06');
    expect(text()).toContain('10.08.23');
  });

  it('cada documento imprime su propio correlativo', () => {
    setUp();
    expect(text()).toContain('AST-2026-0042');
    expect(text()).toContain('SSL-2026-0042');
  });

  it('el indicador de página sale del modelo, no escrito a mano', () => {
    setUp();
    // La hoja original dice "Página: 1 de 1" aunque haya dos.
    expect(text()).toContain('1 de 2');
  });

  it('un documento sin indicador de página no lo pinta', () => {
    setUp(['ingles']);
    expect(text()).not.toContain('1 de');
  });

  it('pinta los campos con su etiqueta y su valor', () => {
    setUp();
    expect(text()).toContain('NAVE:');
    expect(text()).toContain('CMA CGM VOLTAIRE');
  });

  it('marca solo la casilla que el modelo trae marcada', () => {
    setUp();
    const boxes = $('.fd-checklist__box');
    expect(boxes.length).toBe(2);
    expect(boxes[0].classList).toContain('fd-checklist__box--checked');
    expect(boxes[1].classList).not.toContain('fd-checklist__box--checked');
  });

  it('la tabla usa thead, para que la cabecera se repita al cortar la página', () => {
    setUp();
    expect($('.fd-table thead th').length).toBe(2);
    expect($('.fd-table tbody tr').length).toBe(2);
  });

  it('reparte el ancho de las columnas en proporción a los milímetros', () => {
    setUp();
    const headers = $('.fd-table th') as HTMLElement[];
    // 10 y 90 mm sobre 100 son el 10% y el 90%.
    expect(headers[0].style.width).toBe('10%');
    expect(headers[1].style.width).toBe('90%');
  });

  it('pinta el bloque de firmas con su nombre y su cargo', () => {
    setUp();
    expect($('.fd-signatures__slot').length).toBe(2);
    expect(text()).toContain('MARIA DIAZ');
    expect(text()).toContain('Supervisor SSOMA');
  });

  it('no pierde ninguna fila de la tabla', () => {
    setUp();
    expect(text()).toContain('LUIS GOMEZ');
    expect(text()).toContain('ANA PEREZ');
  });

  it('`only` limita los documentos que se ven y se imprimen', () => {
    setUp(['ingles']);
    expect($('.fd-sheet').length).toBe(1);
    expect(text()).toContain("SHIFT'S STEVEDORES LIST");
    expect(text()).not.toContain('ASISTENCIA DE PERSONAL PAITA');
  });

  it('sin `only` se pintan todos', () => {
    setUp([]);
    expect(component.documents.length).toBe(3);
  });

  it('reparte por igual si los anchos vienen a cero', () => {
    setUp();
    const section: any = { columns: [{ widthMm: 0 }, { widthMm: 0 }] };
    expect(component.columnWidth(section, 0)).toBe('50%');
  });

  describe('bloque de filas', () => {
    it('pinta todas las casillas del bloque', () => {
      setUp(['pts']);
      // Es lo que reproduce el ATS y el permiso de trabajo sin perder rotulos.
      expect($('.fd-cell').length).toBe(6);
      expect(text()).toContain('PERMISO DE TRABAJO SEGURO');
      expect(text()).toContain('EQUIPO DE PROTECCION');
      expect(text()).toContain('CASCO');
    });

    it('cada fila reparte sus columnas en porcentaje', () => {
      setUp(['pts']);
      // Porcentajes y no milimetros: la fila ocupa el ancho util de la pagina y
      // cada columna su parte, asi que partir una fila no descoloca el resto.
      const rows = $('.fd-row') as HTMLElement[];
      expect(rows.length).toBe(3);
      expect(rows[0].style.gridTemplateColumns).toBe('100%');
      expect(rows[1].style.gridTemplateColumns).toBe('40% 20% 40%');
    });

    it('aplica el estilo que traia cada casilla', () => {
      setUp(['pts']);
      const cells = $('.fd-cell') as HTMLElement[];
      expect(cells[0].classList).toContain('fd-cell--bold');
      expect(cells[0].classList).toContain('fd-cell--fill');
      expect(cells[0].classList).toContain('fd-cell--boxed');
      expect(cells[3].classList).not.toContain('fd-cell--boxed');
      expect(cells[3].style.textAlign).toBe('right');
    });

    it('una fila puede crecer, para que ningun campo salga cortado', () => {
      setUp(['pts']);
      // Con altura fija, un rotulo mas largo que su casilla se salia por debajo
      // y se solapaba con la fila siguiente.
      const rows = $('.fd-row') as HTMLElement[];
      expect(rows[1].style.minHeight).toBe('8mm');
      expect(rows[0].style.height).toBe('');
    });

    it('pinta la casilla de verificacion marcada', () => {
      setUp(['pts']);
      const boxes = $('.fd-check') as HTMLElement[];
      expect(boxes.length).toBe(1);
      expect(boxes[0].textContent?.trim()).toBe('X');
    });

    it('pinta las imagenes de la casilla, con su pie', () => {
      setUp(['pts']);
      // Los pictogramas son contenido normativo: si no salen, el formato omite
      // informacion.
      const images = $('.fd-imgs img') as HTMLImageElement[];
      expect(images.length).toBe(1);
      // La URL cuelga del origen de la API, no de la aplicacion: las imagenes
      // las sirve el backend fuera del prefijo /api/v1, y con una ruta relativa
      // se pedian al servidor que sirve el frontend y salian todas rotas.
      expect(images[0].getAttribute('src')).toBe(
        `${assetsOrigin()}/static/format-assets/abc123.png`
      );
      expect(images[0].getAttribute('src')).toMatch(/^https?:\/\//);
      expect(images[0].getAttribute('alt')).toBe('Pictograma de casco');
      expect($('.fd-caption')[0].textContent?.trim()).toBe('casco');
    });

    it('el origen de los recursos recorta el prefijo de la API', () => {
      expect(assetsOrigin()).not.toContain('/api/');
    });

    it('una imagen que no esta en png se reintenta en jpeg', () => {
      setUp(['pts']);
      const img = document.createElement('img');
      img.src = 'http://x/static/format-assets/abc123.png';
      component.onImageError({ target: img } as unknown as Event);
      expect(img.src).toContain('abc123.jpeg');
    });

    it('una imagen que tampoco esta en jpeg se oculta', () => {
      setUp(['pts']);
      const img = document.createElement('img');
      img.src = 'http://x/static/format-assets/abc123.jpeg';
      component.onImageError({ target: img } as unknown as Event);
      // Mejor un hueco que el icono de imagen rota sobre el documento.
      expect(img.style.visibility).toBe('hidden');
    });

    it('una firma que no carga se oculta, sin reintentar otra extension', () => {
      // El reintento png/jpeg es de la biblioteca de recursos. Una firma vive
      // en S3 con su nombre propio: cambiarle la extension pide una imagen que
      // no existe y deja una peticion fallida mas por cada firma.
      setUp(['pts']);
      const img = document.createElement('img');
      img.src = 'https://s3.amazonaws.com/bucket/1234-signature.png';
      component.onImageError({ target: img } as unknown as Event);
      expect(img.src).toContain('1234-signature.png');
      expect(img.style.visibility).toBe('hidden');
    });
  });

  describe('firmas registradas', () => {
    it('pinta en la lista de personal la firma de quien la tiene', () => {
      setUp(['asistencia']);
      const firmas = $('.fd-table .fd-signature') as HTMLImageElement[];
      expect(firmas.length).toBe(1);
      expect(firmas[0].getAttribute('src')).toBe('https://s3/luis.png');
    });

    it('quien no tiene firma deja su casilla como estaba', () => {
      // La segunda persona no tiene firma: su casilla sigue siendo el hueco de
      // siempre para firmar a mano, no una imagen rota.
      setUp(['asistencia']);
      const filas = $('.fd-table tbody tr');
      expect(filas[1].querySelector('.fd-signature')).toBeNull();
    });

    it('devuelve vacio cuando el formato no trae firmas', () => {
      // Un formato emitido antes de que existieran las firmas no lleva el
      // campo, y la vista tiene que seguir pintandose.
      setUp(['asistencia']);
      expect(component.tableSignature({ columns: [], rows: [] } as any, 0, 0)).toBe('');
    });
  });
});
