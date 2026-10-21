// Solo los tipos: `import type` desaparece al compilar, asi que ExcelJS no
// entra en el bundle de la pantalla de capacitaciones. La libreria pesa ~950 kB
// y hasta ahora viajaba con la ruta entera aunque el usuario no exportase nada.
// El unico uso real (`new Workbook()`) se resuelve con un import dinamico.
import type * as ExcelJS from 'exceljs';
import { inject, Injectable } from '@angular/core';
import { FileSaverService } from '../../../services/file-saver.service';
import {
  ITalkResponse,
  IAssistantResponse,
  IEmployeeDirect,
} from '../interfaces/talk.interface';
import { environment } from '../../../../environments/environment';

export interface ITrainingReportData {
  talk: ITalkResponse;
  employees: IEmployeeDirect[] | IAssistantResponse[];
}

/**
 * Constructor de `Workbook` cargado bajo demanda.
 *
 * El navegador recibe `dist/exceljs.min.js`, un UMD: al importarlo de forma
 * dinamica el bundler no ve exportaciones con nombre y todo queda bajo
 * `default`. Desestructurar `{ Workbook }` daba `undefined` y la exportacion
 * fallaba siempre con "Workbook is not a constructor" (el error se tragaba y el
 * boton de descarga parecia no hacer nada).
 */
export async function loadWorkbook(): Promise<typeof ExcelJS.Workbook> {
  const mod: any = await import('exceljs');
  const Workbook = mod.Workbook ?? mod.default?.Workbook;
  if (typeof Workbook !== 'function') {
    throw new Error('No se pudo cargar ExcelJS');
  }
  return Workbook;
}

@Injectable({
  providedIn: 'root',
})
export class TalksExcelService {
  private readonly fileSaver = inject(FileSaverService);

  async generateTrainingReport(data: ITrainingReportData) {
    // Se descarga la libreria la primera vez que alguien exporta, no al abrir
    // la pantalla. El navegador cachea el chunk, asi que la segunda exportacion
    // es inmediata.
    const Workbook = await loadWorkbook();
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Registro de Capacitación');

    this.configureDimensions(worksheet);
    this.populateSheetContent(worksheet, data);
    this.applyExcelStyles(worksheet, data);
    await this.addMockImages(worksheet, data);

    // Generar y descargar el archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await this.fileSaver.save(
      blob,
      `registro_capacitacion_${data.talk.registerNumber}.xlsx`
    );
  }

  private configureDimensions(worksheet: ExcelJS.Worksheet) {
    // Configurar anchos de columnas
    worksheet.columns = [
      { key: 'A', width: 8 }, // N°
      { key: 'B', width: 25 }, // Nombres y Apellidos
      { key: 'C', width: 20 }, // Puesto/Área
      { key: 'D', width: 12 }, // DNI
      { key: 'E', width: 15 }, // Firma
      { key: 'F', width: 15 }, // Columna adicional
      { key: 'G', width: 15 }, // Columna adicional
      { key: 'H', width: 15 }, // Columna adicional
      { key: 'I', width: 15 }, // Columna adicional
      { key: 'J', width: 15 }, // Columna adicional
      { key: 'K', width: 15 }, // Columna adicional
      { key: 'L', width: 15 }, // Columna adicional
    ];

    // Configurar alturas de filas
    worksheet.getRow(1).height = 30; // Logo y título
    worksheet.getRow(2).height = 20; // Metadatos
    worksheet.getRow(3).height = 20; // Espacio
    worksheet.getRow(4).height = 20; // Encabezados tabla empresa (una sola fila)
    worksheet.getRow(5).height = 25; // Datos empresa (primera fila fusionada)
    worksheet.getRow(6).height = 25; // Datos empresa (segunda fila fusionada)
    worksheet.getRow(7).height = 20; // Tipo actividad
    worksheet.getRow(8).height = 20; // Checkboxes actividad
    worksheet.getRow(9).height = 20; // Tema
    worksheet.getRow(10).height = 20; // Tema
    worksheet.getRow(11).height = 20; // Resumen
    worksheet.getRow(12).height = 20; // Resumen
    worksheet.getRow(13).height = 20; // Programa anual
    worksheet.getRow(14).height = 20; // Programa anual
    worksheet.getRow(15).height = 20; // Datos ubicación
    worksheet.getRow(16).height = 20; // Checkboxes ubicación
    worksheet.getRow(17).height = 20; // Sucursal
    worksheet.getRow(18).height = 20; // Fecha y tiempo
    worksheet.getRow(19).height = 20; // Capacitador
    worksheet.getRow(20).height = 60; // Firma capacitador
    worksheet.getRow(21).height = 25; // Responsable
    worksheet.getRow(22).height = 20; // Datos responsable
    worksheet.getRow(23).height = 60; // Firma responsable
    worksheet.getRow(24).height = 25; // Encabezados tabla participantes
    // Filas de participantes (25-30)
    for (let i = 25; i <= 30; i++) {
      worksheet.getRow(i).height = 55;
    }
  }

  private populateSheetContent(
    worksheet: ExcelJS.Worksheet,
    data: ITrainingReportData
  ) {
    const talk = data.talk;
    const employees = data.employees;
    const today = new Date();
    const formattedDate = today.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });

    // Fila 1: Logo y título principal
    worksheet.getCell('A1').value = '';
    worksheet.getCell('A2').value = '';
    worksheet.mergeCells('A1:C2'); // Logo area
    worksheet.getCell('D1').value =
      'REGISTRO DE INDUCCION, CAPACITACION, ENTRENAMIENTO Y SIMULACROS DE EMERGENCIA';
    worksheet.mergeCells('D1:K1');

    // Fila 2: Metadatos
    worksheet.getCell('D2').value = 'Fecha: 30/07/25';
    worksheet.mergeCells('D2:E2');
    worksheet.getCell('F2').value = 'Versión: 13';
    worksheet.mergeCells('F2:G2');
    worksheet.getCell('H2').value = 'Página: 1 de 1';
    worksheet.mergeCells('H2:I2');
    worksheet.getCell('J2').value = 'Código: PS02-R04';
    worksheet.mergeCells('J2:K2');

    // Fila 3: Espacio en blanco

    // Fila 4: Encabezados de tabla de empresa
    worksheet.getCell('A4').value = 'Razón Soci';
    worksheet.mergeCells('A4:B4'); // Se extiende para coincidir con A5:B6
    worksheet.getCell('C4').value = 'RUC';
    worksheet.mergeCells('C4:D4'); // Se extiende para coincidir con C5:D6
    worksheet.getCell('E4').value = 'Domicilio';
    worksheet.mergeCells('E4:G4'); // Se extiende para coincidir con E5:G6
    worksheet.getCell('H4').value = 'Actividad Económica';
    worksheet.mergeCells('H4:I4'); // Se extiende para coincidir con H5:I6
    worksheet.getCell('J4').value = 'N° Trabajadores';
    worksheet.mergeCells('J4:K4'); // Se extiende para coincidir con J5:K6

    // Fila 5-6: Datos de empresa (desalineados como en el ejemplo)
    worksheet.getCell('A5').value = 'Cosmos Agencia Marítima SAC';
    worksheet.mergeCells('A5:B6'); // Se extiende debajo de Razón Soci
    worksheet.getCell('C5').value = '20100010136';
    worksheet.mergeCells('C5:D6'); // Se extiende debajo de RUC
    worksheet.getCell('E5').value =
      'Calle LOS CONSTRUCTORES Mz A Lot 13 - PAITA';
    worksheet.mergeCells('E5:G6'); // Se extiende debajo de Domicilio
    worksheet.getCell('H5').value = 'Servicios Marítimos';
    worksheet.mergeCells('H5:I6'); // Se extiende debajo de Actividad Económica
    worksheet.getCell('J5').value = '191';
    worksheet.mergeCells('J5:K6'); // Se extiende debajo de N° Trabajadores

    // Fila 7: Tipo de actividad
    worksheet.getCell('A7').value = `Inducción: ${this.getActivityTypeValue(talk.type, 'induction') === 'Si' ? 'Si' : 'No'
      }`;
    worksheet.mergeCells('A7:B7');
    worksheet.getCell('C7').value = `Capacitación: ${this.getActivityTypeValue(talk.type, 'training') === 'Si' ? 'Si' : 'No'
      }`;
    worksheet.mergeCells('C7:D7');
    worksheet.getCell('E7').value = `Entrenamiento: ${this.getActivityTypeValue(talk.type, 'coaching') === 'Si' ? 'Si' : 'No'
      }`;
    worksheet.mergeCells('E7:F7');
    worksheet.getCell('G7').value = `Simulacro de Emergencia: ${this.getActivityTypeValue(talk.type, 'emergency') === 'Si' ? 'Si' : 'No'
      }`;
    worksheet.mergeCells('G7:H7');
    worksheet.getCell('I7').value = `Otros: TOOLBOX SEGURIDAD: ${this.getActivityTypeValue(talk.type, 'toolbox') === 'Si' ? 'Si' : 'No'
      }`;
    worksheet.mergeCells('I7:K7');

    // Fila 8: Eliminada (ya no necesaria)

    // Fila 9-10: Tema (fusionado verticalmente)
    worksheet.getCell('A9').value = 'Tema:';
    worksheet.getCell('B9').value = talk.topic;
    worksheet.mergeCells('B9:K10');

    // Fila 11-12: Resumen (fusionado verticalmente)
    worksheet.getCell('A11').value = 'Resumen del tema expuesto:';
    worksheet.getCell('B11').value = talk.summary;
    worksheet.mergeCells('B11:K12');

    // Fila 13-14: Programa anual
    worksheet.getCell(
      'A13'
    ).value = `Pertenece a Programa Anual de Capacitación? ${talk.isAnnual ? 'SI' : 'NO'
    }`;
    worksheet.mergeCells('A13:E13');
    worksheet.getCell('F13').value = 'Área capacitada:';
    worksheet.mergeCells('F13:G13');
    worksheet.getCell('F14').value = '(según programa)';
    worksheet.mergeCells('F14:G14');
    worksheet.getCell('H13').value = '';
    worksheet.mergeCells('H13:K14');

    // Fila 15: Datos
    worksheet.getCell('A15').value = 'Datos';
    worksheet.mergeCells('A15:K15');

    // Fila 16: Checkboxes de ubicación
    worksheet.getCell('A16').value = `Embarcación: ${this.getLocationTypeValue(talk.place, 'vessel') === 'Si' ? 'SI' : 'NO'
      }`;
    worksheet.mergeCells('A16:B16');
    worksheet.getCell('C16').value = `Terminal: ${this.getLocationTypeValue(talk.place, 'terminal') === 'Si' ? 'SI' : 'NO'
      }`;
    worksheet.mergeCells('C16:D16');
    worksheet.getCell('E16').value = `Oficina: ${this.getLocationTypeValue(talk.place, 'office') === 'Si' ? 'SI' : 'NO'
      }`;
    worksheet.mergeCells('E16:F16');
    worksheet.getCell('G16').value = `Otros: ${this.getLocationTypeValue(talk.place, 'others') === 'Si' ? 'SI' : 'NO'
      }`;
    worksheet.mergeCells('G16:H16');
    worksheet.getCell('I16').value = '';
    worksheet.mergeCells('I16:K16');

    // Fila 17: Sucursal y fecha
    worksheet.getCell('A17').value = `Sucursal: ${talk.branch}`;
    worksheet.mergeCells('A17:D17');
    worksheet.getCell('E17').value = `Fecha: ${new Date(
      talk.workerDate
    ).toLocaleDateString('es-ES')}`;
    worksheet.mergeCells('E17:G17');

    // Fila 18: Horarios
    worksheet.getCell('A18').value = `Hora inicio: ${talk.startTime}`;
    worksheet.mergeCells('A18:C18');
    worksheet.getCell('D18').value = `Hora término: ${talk.endTime}`;
    worksheet.mergeCells('D18:F18');
    worksheet.getCell('G18').value = `N° Horas: ${talk.hours}`;
    worksheet.mergeCells('G18:I18');
    worksheet.getCell('J18').value = `N° Registro: ${talk.registerNumber}`;
    worksheet.mergeCells('J18:K18');

    // Fila 19: Capacitador
    worksheet.getCell(
      'A19'
    ).value = `Nombre del capacitador o entrenador: ${talk.trainer?.firstName ?? ''} ${talk.trainer?.lastName ?? ''}`;
    worksheet.mergeCells('A19:I19');
    worksheet.getCell('J19').value = 'Firma:';
    worksheet.mergeCells('J19:K19');
    worksheet.mergeCells('J20:K20');

    // Fila 20: Espacio en blanco

    // Fila 21: Responsable
    worksheet.getCell('A21').value = 'RESPONSABLE DEL REGISTRO:';
    worksheet.mergeCells('A21:K21');

    // Fila 22: Información del responsable
    // Entrenador y registrador pueden venir a null si se borraron del maestro;
    // antes eso rompia la exportacion entera sin ningun aviso.
    worksheet.getCell('A22').value = `Nombre: ${talk.register?.firstName ?? ''} ${talk.register?.lastName ?? ''}`;
    worksheet.mergeCells('A22:D22');
    worksheet.getCell('E22').value = `Fecha: ${formattedDate}`;
    worksheet.mergeCells('E22:G22');
    worksheet.getCell('H22').value = `Cargo: ${talk.register?.position ?? ''}`;
    worksheet.mergeCells('H22:I22');
    worksheet.getCell('J22').value = 'Firma:';
    worksheet.mergeCells('J22:K22');
    worksheet.mergeCells('J23:K23');

    // Fila 23: Firma responsable (imagen)

    // Fila 24: Encabezados de tabla de participantes
    worksheet.getCell('A24').value = 'N°';
    worksheet.getCell('B24').value = 'Nombres y Apellidos';
    worksheet.mergeCells('B24:D24');
    worksheet.getCell('E24').value = 'Puesto/Área';
    worksheet.mergeCells('E24:G24');
    worksheet.getCell('H24').value = 'DNI';
    worksheet.mergeCells('H24:I24');
    worksheet.getCell('J24').value = 'Firma';
    worksheet.mergeCells('J24:K24');

    // Datos de participantes (filas 25-30)
    employees.forEach((employee, index) => {
      const rowIndex = 25 + index;
      worksheet.getCell(`A${rowIndex}`).value = index + 1;

      let firstName = '';
      let lastName = '';
      let document = '';
      let position = '';

      if (this.isAssistantResponse(employee)) {
        firstName = employee.employee?.firstName || '';
        lastName = employee.employee?.lastName || '';
        document = employee.employee?.document || '';
      } else if (this.isEmployeeDirect(employee)) {
        firstName = employee.firstName || '';
        lastName = employee.lastName || '';
        document = employee.document || '';
        position = employee.position || '';
      }

      worksheet.getCell(`B${rowIndex}`).value = `${firstName} ${lastName}`;
      worksheet.mergeCells(`B${rowIndex}:D${rowIndex}`);
      // El cargo sale de la nombrada; antes se escribia "Operario" a todos.
      worksheet.getCell(`E${rowIndex}`).value = position || 'Operario';
      worksheet.mergeCells(`E${rowIndex}:G${rowIndex}`);
      worksheet.getCell(`H${rowIndex}`).value = document;
      worksheet.mergeCells(`H${rowIndex}:I${rowIndex}`);
      // Firma fusionada
      worksheet.mergeCells(`J${rowIndex}:K${rowIndex}`);
    });

    // Completar filas vacías si hay menos de 6 participantes
    for (let i = employees.length; i < 6; i++) {
      const rowIndex = 25 + i;
      worksheet.getCell(`A${rowIndex}`).value = i + 1;
      // Celdas fusionadas para filas vacías
      worksheet.mergeCells(`B${rowIndex}:D${rowIndex}`);
      worksheet.mergeCells(`E${rowIndex}:G${rowIndex}`);
      worksheet.mergeCells(`H${rowIndex}:I${rowIndex}`);
      // Firma fusionada para filas vacías también
      worksheet.mergeCells(`J${rowIndex}:K${rowIndex}`);
    }
  }

  private getActivityTypeValue(type: string, activityType: string): string {
    const activityTypes = {
      induction: 'induction',
      training: 'training',
      coaching: 'coaching',
      emergency: 'emergency',
      toolbox: 'toolbox',
    };

    const currentType =
      activityTypes[type as keyof typeof activityTypes] || 'induction';
    return currentType === activityType ? 'Si' : 'No';
  }

  private getLocationTypeValue(place: string, type: string): string {
    const locationTypes = {
      vessel: 'vessel',
      terminal: 'terminal',
      office: 'office',
      others: 'others',
    };

    const currentPlace =
      locationTypes[place as keyof typeof locationTypes] || 'terminal';
    return currentPlace === type ? 'Si' : 'No';
  }

  private applyExcelStyles(worksheet: ExcelJS.Worksheet, data: ITrainingReportData) {
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    const thickBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thick', color: { argb: 'FF000000' } },
      bottom: { style: 'thick', color: { argb: 'FF000000' } },
      left: { style: 'thick', color: { argb: 'FF000000' } },
      right: { style: 'thick', color: { argb: 'FF000000' } },
    };

    // Estilo para título principal
    worksheet.getCell('D1').font = { bold: true, size: 14 };
    worksheet.getCell('D1').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('D1').border = thickBorder;

    // Estilos para logo
    worksheet.getCell('A1').font = {
      bold: true,
      size: 16,
      color: { argb: 'FF4472C4' },
    };
    worksheet.getCell('A1').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('A1').border = thickBorder;
    worksheet.getCell('A2').font = {
      bold: true,
      size: 16,
      color: { argb: 'FF4472C4' },
    };
    worksheet.getCell('A2').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell('A2').border = thickBorder;

    // Estilos para metadatos (fila 2)
    const metadataCells = ['D2', 'E2', 'F2', 'G2', 'H2', 'I2', 'J2', 'K2'];
    metadataCells.forEach((cellRef) => {
      const cell = worksheet.getCell(cellRef);
      cell.font = { size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // Estilos para tabla de empresa (filas 4-6)
    for (let row = 4; row <= 6; row++) {
      for (let col = 1; col <= 11; col++) {
        // Cambiado de 12 a 11 para excluir columna L
        const cell = worksheet.getCell(row, col);
        cell.border = thinBorder;
        cell.font = { size: 11 };

        if (row === 4) {
          cell.font.bold = true;
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }, // Gris claro
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
    }

    // Estilos para tipo de actividad (fila 7)
    for (let col = 1; col <= 11; col++) {
      const cell = worksheet.getCell(7, col);
      cell.border = thinBorder;
      cell.font = { size: 11 };
      cell.font.bold = true;
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    }

    // Estilos para tema y resumen (filas 9-12)
    for (let row = 9; row <= 12; row++) {
      for (let col = 1; col <= 11; col++) {
        const cell = worksheet.getCell(row, col);
        cell.border = thinBorder;
        cell.font = { size: 11 };

        if (col === 1) {
          cell.font.bold = true;
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
    }

    // Estilos para programa anual (filas 13-14)
    for (let row = 13; row <= 14; row++) {
      for (let col = 1; col <= 11; col++) {
        const cell = worksheet.getCell(row, col);
        cell.border = thinBorder;
        cell.font = { size: 11 };

        if (col === 1) {
          cell.font.bold = true;
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }
    }

    // Estilos para datos de ubicación (filas 15-16)
    for (let row = 15; row <= 16; row++) {
      for (let col = 1; col <= 9; col++) {
        const cell = worksheet.getCell(row, col);
        cell.border = thinBorder;
        cell.font = { size: 11 };

        if (row === 15) {
          cell.font.bold = true;
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }, // Gris claro
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }
    }

    // Estilos para detalles del talk (filas 17-19)
    for (let row = 17; row <= 19; row++) {
      for (let col = 1; col <= 11; col++) {
        const cell = worksheet.getCell(row, col);
        cell.border = thinBorder;
        cell.font = { size: 11 };

        if (col === 1) {
          cell.font.bold = true;
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
    }

    // Estilos para responsable (filas 21-23)
    for (let row = 21; row <= 23; row++) {
      for (let col = 1; col <= 11; col++) {
        const cell = worksheet.getCell(row, col);
        cell.border = thinBorder;
        cell.font = { size: 11 };

        if (row === 21) {
          cell.font.bold = true;
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }, // Gris claro
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (col === 1) {
          cell.font.bold = true;
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
    }

    // Estilos para encabezados de tabla (fila 24)
    for (let col = 1; col <= 11; col++) {
      const cell = worksheet.getCell(24, col);
      cell.font = { bold: true, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thickBorder;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' }, // Gris claro
      };
    }

    // Estilos para datos de participantes (filas 25-30)
    for (let row = 25; row <= 25 + data.employees.length - 1; row++) {
      for (let col = 1; col <= 11; col++) {
        const cell = worksheet.getCell(row, col);
        cell.border = thinBorder;
        cell.font = { size: 11 };

        if (col === 1) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font.bold = true;
        } else if (col >= 10) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { size: 11, italic: true, color: { argb: 'FF808080' } };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
    }
  }

  private async addMockImages(
    worksheet: ExcelJS.Worksheet,
    data: ITrainingReportData
  ) {
    const logoBase64 = await this.loadLogoAsBase64();
    const logoId = worksheet.workbook.addImage({
      base64: logoBase64,
      extension: 'png',
    });
    worksheet.addImage(logoId, 'A1:C2');

    // Firma del capacitador (fila 20)
    const trainerBase64 = await this.resolveSignature(data.talk.trainer?.signature);
    const trainerSigId = worksheet.workbook.addImage({ base64: trainerBase64, extension: 'png' });
    worksheet.addImage(trainerSigId, 'J20:K20');

    // Firma del responsable del registro (fila 23)
    const registerBase64 = await this.resolveSignature(data.talk.register?.signature);
    const registerSigId = worksheet.workbook.addImage({ base64: registerBase64, extension: 'png' });
    worksheet.addImage(registerSigId, 'J23:K23');

    // Firmas de participantes: una por fila, con un minimo de seis filas. Antes
    // el bucle paraba en seis y del septimo asistente en adelante la fila salia
    // sin firma.
    const signatureRows = Math.max(6, data.employees.length);
    for (let i = 0; i < signatureRows; i++) {
      const rowIndex = 25 + i;
      const employee = data.employees[i];
      let sigUrl: string | undefined;

      if (employee) {
        if (this.isAssistantResponse(employee)) {
          sigUrl = employee.employee.signature;
        } else if (this.isEmployeeDirect(employee)) {
          sigUrl = employee.signature;
        }
      }

      const sigBase64 = await this.resolveSignature(sigUrl);
      const sigId = worksheet.workbook.addImage({ base64: sigBase64, extension: 'png' });
      worksheet.addImage(sigId, `J${rowIndex}:K${rowIndex}`);
    }
  }

  private async resolveSignature(url: string | undefined | null): Promise<string> {
    if (url) {
      try {
        return await this.loadSignatureAsBase64(url);
      } catch {
        // fall through to mock
      }
    }
    return this.createMockSignatureImage();
  }

  private async loadLogoAsBase64(): Promise<string> {
    try {
      // Cargar la imagen desde la URL pública
      const response = await fetch('/images/smtp.png');
      const blob = await response.blob();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('No se pudo cargar el logo real, usando mock:', error);
      return this.createMockLogoImage();
    }
  }

  private async loadSignatureAsBase64(signature: string): Promise<string> {
    const proxyUrl = `${environment.api}/upload/proxy?url=${encodeURIComponent(signature)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private createMockLogoImage(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (ctx) {
      canvas.width = 150;
      canvas.height = 60;

      // Fondo blanco
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 150, 60);

      // Texto CHECKIN
      ctx.fillStyle = '#003d53';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CHECKIN', 75, 25);

      // Texto COSMOS
      ctx.fillStyle = '#003d53';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('COSMOS', 75, 45);
    }

    return canvas.toDataURL('image/png').split(',')[1];
  }

  private createMockSignatureImage(): string {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, 100, 50);
      ctx.strokeStyle = '#ccc';
      ctx.strokeRect(0, 0, 100, 50);
      ctx.fillStyle = '#999';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Firma', 50, 30);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }

  private isAssistantResponse(
    employee: IEmployeeDirect | IAssistantResponse
  ): employee is IAssistantResponse {
    return 'employee' in employee && 'talk' in employee;
  }

  private isEmployeeDirect(
    employee: IEmployeeDirect | IAssistantResponse
  ): employee is IEmployeeDirect {
    return 'firstName' in employee && 'lastName' in employee;
  }
}
