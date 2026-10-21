import { TestBed } from '@angular/core/testing';
import { TalksExcelService, loadWorkbook } from './talks-excel.service';
import { FileSaverService } from '../../../services/file-saver.service';
import { IEmployeeDirect, ITalkResponse } from '../interfaces/talk.interface';

function employee(index: number): IEmployeeDirect {
  return {
    _id: `e${index}`,
    id: index,
    firstName: `Nombre${index}`,
    lastName: `Apellido${index}`,
    document: `${10000000 + index}`,
    signature: '',
    isAssistant: true,
    position: 'Estibador',
    createdAt: '',
    updatedAt: '',
  } as IEmployeeDirect;
}

describe('TalksExcelService', () => {
  let saved: Blob | null;

  beforeEach(() => {
    saved = null;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FileSaverService,
          useValue: {
            save: (blob: Blob) => {
              saved = blob;
              return Promise.resolve();
            },
          },
        },
      ],
    });
  });

  it('exporta aunque el entrenador y el registrador ya no existan, con firma y cargo para todos', async () => {
    const service = TestBed.inject(TalksExcelService);
    const talk = {
      _id: 't1',
      workerDate: '2026-09-24',
      turn: '07:00 - 15:00',
      type: 'Charla',
      registerNumber: 1234,
      startTime: '08:00',
      endTime: '09:00',
      hours: 1,
      trainer: null,
      register: null,
    } as unknown as ITalkResponse;
    const employees = Array.from({ length: 8 }, (_, i) => employee(i + 1));

    await service.generateTrainingReport({ talk, employees });

    expect(saved).not.toBeNull();
    const Workbook = await loadWorkbook();
    const workbook = new Workbook();
    await workbook.xlsx.load(await saved!.arrayBuffer());
    const sheet = workbook.worksheets[0];

    // Logo, dos firmas de responsables y una por participante: antes el bucle
    // se detenia en seis y el septimo y octavo salian sin firma.
    expect(sheet.getImages().length).toBe(1 + 2 + 8);
    // El cargo es el de la nombrada, no "Operario" para todos.
    expect(sheet.getCell('E25').value).toBe('Estibador');
    expect(sheet.getCell('B32').value).toBe('Nombre8 Apellido8');
  });
});
