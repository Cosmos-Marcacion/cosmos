import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChanges, provideZonelessChangeDetection } from '@angular/core';
import { FormatBuilder } from './format-builder';
import { DATA_FIELDS } from './data-fields';
import { IBlockRow, IDocumentDefinition } from '../interfaces/format-document.interface';

function makeDocument(): IDocumentDefinition {
  return {
    id: 'ats',
    name: 'ATS',
    orientation: 'portrait',
    sections: [
      {
        kind: 'rows',
        id: 's1',
        title: 'SECCIÓN I: DESCRIPCIÓN DEL TRABAJO',
        rows: [
          {
            id: 'f1',
            cells: [
              { id: 'f1-a', width: 30, content: { kind: 'text', text: 'NAVE' }, bold: true },
              { id: 'f1-b', width: 70, content: { kind: 'data', source: 'nave' } },
            ],
          },
          {
            id: 'f2',
            cells: [{ id: 'f2-a', width: 100, content: { kind: 'blank' } }],
          },
        ],
      },
      { kind: 'table', id: 's2', title: 'Personal' },
    ],
  };
}

/** Todas las filas de todas las secciones `rows`. */
function allRows(document: IDocumentDefinition): IBlockRow[] {
  return document.sections.flatMap((section) => section.rows ?? []);
}

function widthsSumTo100(document: IDocumentDefinition): boolean {
  return allRows(document).every((row) => {
    const total = row.cells.reduce((sum, cell) => sum + cell.width, 0);
    return Math.abs(total - 100) <= 1;
  });
}

describe('FormatBuilder', () => {
  let fixture: ComponentFixture<FormatBuilder>;
  let builder: FormatBuilder;
  let emitted: IDocumentDefinition[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormatBuilder],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FormatBuilder);
    builder = fixture.componentInstance;
    emitted = [];
    builder.documentChange.subscribe((document) => emitted.push(document));
    load(makeDocument(), 'ETHANOL:ats');
    fixture.detectChanges();
  });

  /** Entrega el documento como lo entrega Angular: con `ngOnChanges`. */
  function load(document: IDocumentDefinition, key: string) {
    const first = builder.documentKey !== key;
    builder.document = document;
    builder.documentKey = key;
    builder.ngOnChanges({
      document: { currentValue: document, previousValue: null, firstChange: first, isFirstChange: () => first },
    } as unknown as SimpleChanges);
  }

  it('pinta las secciones de filas del documento', () => {
    expect(builder.sections.length).toBe(2);
    expect(builder.rowsOf(builder.sections[0]).length).toBe(2);
  });

  it('reparte una fila en columnas por porcentaje', () => {
    const row = builder.rowsOf(builder.sections[0])[0];
    expect(builder.rowTemplate(row)).toBe('30% 70%');
  });

  // --- paleta de datos ---------------------------------------------------------

  it('abre un solo grupo de datos a la vez', () => {
    // El panel no se desplaza —lo que se desplaza es el documento— y los
    // veinticinco datos seguidos no caben en la columna.
    expect(builder.isGroupOpen('Jornada')).toBeTrue();
    expect(builder.isGroupOpen('Responsables')).toBeFalse();

    builder.toggleGroup('Responsables');
    expect(builder.isGroupOpen('Responsables')).toBeTrue();
    expect(builder.isGroupOpen('Jornada')).toBeFalse();
  });

  it('vuelve a pulsar el grupo abierto y se cierra', () => {
    builder.toggleGroup('Jornada');
    expect(builder.groups.every((group) => !builder.isGroupOpen(group.group))).toBeTrue();
  });

  it('buscando se ven las coincidencias sin abrir su grupo', () => {
    builder.toggleGroup('Jornada');
    builder.search.set('nave');

    expect(builder.isGroupOpen('Jornada')).toBeTrue();
    expect(builder.filteredGroups().flatMap((group) => group.fields).map((f) => f.label))
      .toEqual(['Nave']);
  });

  // --- filas ------------------------------------------------------------------

  it('inserta una fila donde se pide y deja las columnas sumando 100', () => {
    builder.insertRow('s1', 1);

    const rows = builder.rowsOf(builder.sections[0]);
    expect(rows.length).toBe(3);
    expect(rows[1].cells.length).toBe(2);
    expect(widthsSumTo100(builder.model()!)).toBeTrue();
  });

  it('la fila nueva queda seleccionada, para poder escribir sin buscarla', () => {
    builder.insertRow('s1', 0);
    expect(builder.selection()?.rowId).toBe(builder.rowsOf(builder.sections[0])[0].id);
  });

  it('elimina una fila', () => {
    builder.removeRow('s1', 'f1');
    expect(builder.rowsOf(builder.sections[0]).map((row) => row.id)).toEqual(['f2']);
  });

  it('mueve una fila', () => {
    builder.moveRow('s1', 0, 1);
    expect(builder.rowsOf(builder.sections[0]).map((row) => row.id)).toEqual(['f2', 'f1']);
  });

  it('no mueve una fila fuera de la sección', () => {
    builder.moveRow('s1', 0, -1);
    expect(builder.rowsOf(builder.sections[0]).map((row) => row.id)).toEqual(['f1', 'f2']);
  });

  it('duplica una fila con identificadores nuevos', () => {
    builder.duplicateRow('s1', 'f1');

    const rows = builder.rowsOf(builder.sections[0]);
    expect(rows.length).toBe(3);
    expect(rows[1].id).not.toBe('f1');
    expect(new Set(rows[1].cells.map((cell) => cell.id)).size).toBe(2);
    expect(rows[1].cells.map((cell) => cell.id)).not.toContain('f1-a');
  });

  // --- columnas ---------------------------------------------------------------

  it('parte una casilla en dos repartiendo su ancho', () => {
    builder.splitCell('s1', 'f1', 'f1-b');

    const row = builder.rowsOf(builder.sections[0])[0];
    expect(row.cells.length).toBe(3);
    expect(row.cells[1].width).toBe(35);
    expect(row.cells[2].width).toBe(35);
    expect(widthsSumTo100(builder.model()!)).toBeTrue();
  });

  it('junta una casilla con la siguiente sumando los anchos', () => {
    builder.mergeWithNext('s1', 'f1', 'f1-a');

    const row = builder.rowsOf(builder.sections[0])[0];
    expect(row.cells.length).toBe(1);
    expect(row.cells[0].width).toBe(100);
  });

  it('no junta la última casilla de la fila', () => {
    builder.mergeWithNext('s1', 'f1', 'f1-b');
    expect(builder.rowsOf(builder.sections[0])[0].cells.length).toBe(2);
  });

  it('nunca deja una fila sin columnas', () => {
    builder.removeCell('s1', 'f2', 'f2-a');
    expect(builder.rowsOf(builder.sections[0])[1].cells.length).toBe(1);
  });

  it('al cambiar un ancho el resto de la fila lo absorbe', () => {
    builder.selectCell('s1', 'f1', 'f1-a');
    builder.setCellWidth('60');

    const row = builder.rowsOf(builder.sections[0])[0];
    expect(row.cells[0].width).toBe(60);
    expect(row.cells[1].width).toBe(40);
    expect(widthsSumTo100(builder.model()!)).toBeTrue();
  });

  // --- contenido --------------------------------------------------------------

  it('escribir en una casilla vacía la convierte en texto', () => {
    builder.selectCell('s1', 'f2', 'f2-a');
    builder.setText('OBSERVACIONES');

    expect(builder.rowsOf(builder.sections[0])[1].cells[0].content)
      .toEqual({ kind: 'text', text: 'OBSERVACIONES' });
  });

  it('soltar un dato sobre una casilla la enlaza al dato', () => {
    const field = DATA_FIELDS.find((entry) => entry.id === 'turno')!;
    builder.startDrag(field);
    builder.dropOn('s1', 'f2', 'f2-a');

    expect(builder.rowsOf(builder.sections[0])[1].cells[0].content)
      .toEqual({ kind: 'data', source: 'turno' });
    expect(builder.dragging()).toBeNull();
  });

  it('el dato con transformación se guarda con ella', () => {
    const field = DATA_FIELDS.find((entry) => entry.id === 'fecha-larga')!;
    builder.selectCell('s1', 'f2', 'f2-a');
    builder.applyField(field);

    expect(builder.rowsOf(builder.sections[0])[1].cells[0].content)
      .toEqual({ kind: 'data', source: 'fecha', transform: 'fechaLarga' });
  });

  it('enseña el nombre del dato, no su origen técnico', () => {
    const cell = builder.rowsOf(builder.sections[0])[0].cells[1];
    expect(builder.dataLabel(cell)).toBe('Nave');
  });

  it('la ficha de firma produce una casilla de firma, no de dato', () => {
    const field = DATA_FIELDS.find((entry) => entry.id === 'firma-jefe-cubierta')!;
    builder.selectCell('s1', 'f2', 'f2-a');
    builder.applyField(field);

    expect(builder.rowsOf(builder.sections[0])[1].cells[0].content)
      .toEqual({ kind: 'signature', source: 'jefeCubierta' });
  });

  it('una casilla de firma enseña que imprime la firma, no el nombre', () => {
    // Es lo que distingue las dos fichas del mismo responsable: sin separarlas,
    // el maestro decía "Jefe de cubierta" donde imprime su firma.
    const field = DATA_FIELDS.find((entry) => entry.id === 'firma-jefe-cubierta')!;
    builder.selectCell('s1', 'f2', 'f2-a');
    builder.applyField(field);

    const cell = builder.rowsOf(builder.sections[0])[1].cells[0];
    expect(builder.dataLabel(cell)).toBe('Firma del jefe de cubierta');
    expect(builder.isBound(cell)).toBeTrue();
  });

  it('un dato sin transformación no se confunde con la ficha de firma', () => {
    // `fieldFor` casaba por origen y la ficha de firma no lleva transformación,
    // así que una casilla de dato con origen `jefeCubierta` y sin transformar
    // se etiquetaba como si imprimiera una firma.
    const cell = {
      id: 'x', width: 100,
      content: { kind: 'data', source: 'jefeCubierta' },
    } as any;
    expect(builder.dataLabel(cell)).not.toContain('Firma');
  });

  it('vaciar una casilla no la borra de la fila', () => {
    builder.selectCell('s1', 'f1', 'f1-a');
    builder.clearCell();

    const row = builder.rowsOf(builder.sections[0])[0];
    expect(row.cells.length).toBe(2);
    expect(row.cells[0].content.kind).toBe('blank');
  });

  it('el recuadro se quita de una casilla que lo trae sin declarar', () => {
    builder.selectCell('s1', 'f1', 'f1-a');
    builder.toggle('boxed');
    expect(builder.rowsOf(builder.sections[0])[0].cells[0].boxed).toBeFalse();
  });

  // --- secciones ---------------------------------------------------------------

  it('la sección nueva nace con una fila', () => {
    builder.addSection(0);
    expect(builder.sections[0].kind).toBe('rows');
    expect(builder.rowsOf(builder.sections[0]).length).toBe(1);
    expect(widthsSumTo100(builder.model()!)).toBeTrue();
  });

  it('oculta y vuelve a mostrar una sección', () => {
    builder.toggleSectionVisible('s1');
    expect(builder.sections[0].visible).toBeFalse();
    builder.toggleSectionVisible('s1');
    expect(builder.sections[0].visible).toBeTrue();
  });

  it('elimina una sección', () => {
    builder.removeSection('s1');
    expect(builder.sections.map((section) => section.id)).toEqual(['s2']);
  });

  it('mueve una sección', () => {
    builder.moveSection(0, 1);
    expect(builder.sections.map((section) => section.id)).toEqual(['s2', 's1']);
  });

  // --- deshacer ----------------------------------------------------------------

  it('deshace y rehace un cambio', () => {
    builder.removeRow('s1', 'f1');
    expect(builder.rowsOf(builder.sections[0]).length).toBe(1);

    builder.undo();
    expect(builder.rowsOf(builder.sections[0]).length).toBe(2);

    builder.redo();
    expect(builder.rowsOf(builder.sections[0]).length).toBe(1);
  });

  it('no deshace nada recién cargado el documento', () => {
    expect(builder.canUndo).toBeFalse();
  });

  it('avisa de cada cambio hacia fuera', () => {
    builder.insertRow('s1', 0);
    builder.removeRow('s1', 'f1');
    expect(emitted.length).toBe(2);
    expect(emitted[1]).toBe(builder.model()!);
  });

  it('no toca el documento recibido: emite una copia', () => {
    const original = makeDocument();
    load(original, 'ETHANOL:ats');
    builder.removeRow('s1', 'f1');

    expect(original.sections[0].rows!.length).toBe(2);
  });

  /**
   * El maestro copia en profundidad la definición entera en cada cambio, así
   * que devuelve un objeto nuevo también cuando el cambio salió de aquí. Sin
   * distinguirlo, el historial se reiniciaba a cada tecla.
   */
  it('el eco del propio cambio no borra el historial', () => {
    builder.removeRow('s1', 'f1');
    load(JSON.parse(JSON.stringify(builder.model())), 'ETHANOL:ats');

    expect(builder.canUndo).toBeTrue();
    builder.undo();
    expect(builder.rowsOf(builder.sections[0]).length).toBe(2);
  });

  it('un cambio hecho fuera del constructor también se deshace', () => {
    const changed = makeDocument();
    changed.sections[0].title = 'OTRO TÍTULO';
    load(changed, 'ETHANOL:ats');

    expect(builder.sections[0].title).toBe('OTRO TÍTULO');
    builder.undo();
    expect(builder.sections[0].title).toBe('SECCIÓN I: DESCRIPCIÓN DEL TRABAJO');
  });

  it('abrir otro documento empieza de cero', () => {
    builder.removeRow('s1', 'f1');
    load(makeDocument(), 'ETHANOL:charla');

    expect(builder.canUndo).toBeFalse();
    expect(builder.selection()).toBeNull();
  });

  // --- marcas ------------------------------------------------------------------

  it('marca un texto con X sin cambiar su rótulo', () => {
    builder.selectCell('s1', 'f1', 'f1-a');
    builder.toggleMark();

    const cell = builder.rowsOf(builder.sections[0])[0].cells[0];
    expect(cell.content).toEqual({ kind: 'text', text: 'NAVE', marked: true });
    expect(builder.isMarked(cell)).toBeTrue();
    expect(builder.markedText('SI')).toBe('X SI');
    expect(builder.markedText('IZAJE DE CARGAS   (     )')).toBe('IZAJE DE CARGAS   ( X )');
  });

  it('volver a marcar quita la X', () => {
    builder.selectCell('s1', 'f1', 'f1-a');
    builder.toggleMark();
    builder.toggleMark();

    expect(builder.rowsOf(builder.sections[0])[0].cells[0].content)
      .toEqual({ kind: 'text', text: 'NAVE' });
  });

  it('corregir el rótulo de un texto marcado conserva la marca', () => {
    builder.selectCell('s1', 'f1', 'f1-a');
    builder.toggleMark();
    builder.setText('SI');

    expect(builder.rowsOf(builder.sections[0])[0].cells[0].content)
      .toEqual({ kind: 'text', text: 'SI', marked: true });
  });

  it('un recuadro vacío pasa a llevar la X dentro', () => {
    builder.selectCell('s1', 'f2', 'f2-a');
    builder.toggleMark();

    expect(builder.rowsOf(builder.sections[0])[1].cells[0].content)
      .toEqual({ kind: 'check', checked: true });
  });

  it('la tecla X marca la casilla seleccionada', () => {
    builder.selectCell('s1', 'f2', 'f2-a');
    builder.onKeydown(new KeyboardEvent('keydown', { key: 'x' }));

    expect(builder.isMarked(builder.rowsOf(builder.sections[0])[1].cells[0])).toBeTrue();
  });

  it('ni un dato ni una casilla que se marca sola se marcan a mano', () => {
    const [, dato] = builder.rowsOf(builder.sections[0])[0].cells;
    expect(builder.canMark(dato)).toBeFalse();
    expect(builder.canMark({
      id: 'j', width: 10,
      content: { kind: 'check', when: { source: 'turno', equals: '07:00' } },
    })).toBeFalse();
  });
});
