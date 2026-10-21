import * as ExcelJS from 'exceljs';
import { Injectable } from '@angular/core';
import { ExcelDownloadConfig } from '../components/excel-download/excel-download.component';

@Injectable({
  providedIn: 'root',
})
export class ExcelService {
  constructor() { }

  async downloadExcel(config: ExcelDownloadConfig): Promise<void> {
    // Normalizar config para evitar errores por undefined/null
    config = {
      ...config,
      filters: config?.filters ?? {},
      headers: Array.isArray(config?.headers) ? config.headers : [],
      data: Array.isArray(config?.data) ? config.data : [],
    };
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte');

    this.configureDimensions(worksheet, config);
    this.populateSheetContent(worksheet, config);
    this.applyExcelStyles(worksheet, config);

    // Generar y descargar el archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = this.generateFileName(config);
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private configureDimensions(
    worksheet: ExcelJS.Worksheet,
    config: ExcelDownloadConfig
  ) {
    // Calcular el número total de columnas necesarias
    const filterColumns = Object.keys(config.filters || {}).length * 2; // Cada filtro ocupa 2 columnas
    const dataColumns = (config.headers || []).length;
    const totalColumns = Math.max(filterColumns, dataColumns);

    // Configurar anchos de columnas
    worksheet.columns = Array.from({ length: totalColumns }, (_, index) => ({
      key: String.fromCharCode(65 + index),
      width: 20,
    }));

    // Configurar alturas de filas dinámicamente
    let currentRow = 1;

    // Fila 1: Título
    worksheet.getRow(currentRow).height = 25;
    currentRow++;

    // Fila de filtros (siempre que haya filtros definidos)
    if (Object.keys(config.filters || {}).length > 0) {
      worksheet.getRow(currentRow).height = 20;
      currentRow++;
    }

    // Fila de espacio
    worksheet.getRow(currentRow).height = 20;
    currentRow++;

    // Fila de encabezados
    worksheet.getRow(currentRow).height = 25;
  }

  private populateSheetContent(
    worksheet: ExcelJS.Worksheet,
    config: ExcelDownloadConfig
  ) {
    // Fila 1: Título
    worksheet.getCell('A1').value = config.title;
    worksheet.mergeCells(
      `A1:${this.getColumnLetter((config.headers || []).length - 1)}1`
    );

    // Configuración especial para el reporte de asistencias
    if (config.title === 'Reporte de Asistencias') {
      this.populateAttendanceReport(worksheet, config);
    } else {
      // Configuración estándar para otros reportes
      let currentRow = 2;
      const allFilters = Object.entries(config.filters || {});

      if (allFilters.length > 0) {
        allFilters.forEach(([key, value], index) => {
          const startCol = index * 2; // Cada filtro ocupa 2 columnas
          const colLetter1 = this.getColumnLetter(startCol);
          const colLetter2 = this.getColumnLetter(startCol + 1);

          const displayValue =
            value && value !== '' && value !== null && value !== undefined
              ? `${key}: ${value}`
              : `${key}: -`;

          worksheet.getCell(`${colLetter1}${currentRow}`).value = displayValue;
          worksheet.mergeCells(
            `${colLetter1}${currentRow}:${colLetter2}${currentRow}`
          );
        });
        currentRow++;
      }

      // Fila después de filtros: Espacio en blanco
      currentRow++;

      // Fila de encabezados
      (config.headers || []).forEach((header, index) => {
        const colLetter = this.getColumnLetter(index);
        worksheet.getCell(`${colLetter}${currentRow}`).value = header.header;
      });

      // Datos (desde la siguiente fila)
      (config.data || []).forEach((item, dataIndex) => {
        const rowIndex = currentRow + 1 + dataIndex;
        (config.headers || []).forEach((header, headerIndex) => {
          const colLetter = this.getColumnLetter(headerIndex);
          const value = item[header.value] || '';
          worksheet.getCell(`${colLetter}${rowIndex}`).value = value;
        });
      });
    }
  }

  private populateAttendanceReport(
    worksheet: ExcelJS.Worksheet,
    config: ExcelDownloadConfig
  ) {
    let currentRow = 2;
    const allFilters = Object.entries(config.filters || {});

    if (allFilters.length > 0) {
      // Primera fila: Período
      const periodo = allFilters.find(([key]) => key === 'Período');
      if (periodo) {
        worksheet.getCell('A2').value = `${periodo[0]}: ${periodo[1]}`;
        worksheet.mergeCells('A2:D2');
        currentRow++;
      }

      // Segunda fila: Primeros dos totales
      const totales = allFilters.filter(([key]) => key !== 'Período');
      if (totales.length >= 2) {
        worksheet.getCell('A3').value = `${totales[0][0]}: ${totales[0][1]}`;
        worksheet.mergeCells('A3:B3');
        worksheet.getCell('C3').value = `${totales[1][0]}: ${totales[1][1]}`;
        worksheet.mergeCells('C3:D3');
        currentRow++;
      }

      // Tercera fila: Siguientes dos totales
      if (totales.length >= 4) {
        worksheet.getCell('A4').value = `${totales[2][0]}: ${totales[2][1]}`;
        worksheet.mergeCells('A4:B4');
        worksheet.getCell('C4').value = `${totales[3][0]}: ${totales[3][1]}`;
        worksheet.mergeCells('C4:D4');
        currentRow++;
      }

      // Cuarta fila: Últimos dos totales
      if (totales.length >= 6) {
        worksheet.getCell('A5').value = `${totales[4][0]}: ${totales[4][1]}`;
        worksheet.mergeCells('A5:B5');
        worksheet.getCell('C5').value = `${totales[5][0]}: ${totales[5][1]}`;
        worksheet.mergeCells('C5:D5');
        currentRow++;
      }
    }

    // Fila después de filtros: Espacio en blanco
    currentRow++;

    // Fila de encabezados
    (config.headers || []).forEach((header, index) => {
      const colLetter = this.getColumnLetter(index);
      worksheet.getCell(`${colLetter}${currentRow}`).value = header.header;
    });

    // Datos (desde la siguiente fila)
    (config.data || []).forEach((item, dataIndex) => {
      const rowIndex = currentRow + 1 + dataIndex;
      (config.headers || []).forEach((header, headerIndex) => {
        const colLetter = this.getColumnLetter(headerIndex);
        const value = item[header.value] || '';
        worksheet.getCell(`${colLetter}${rowIndex}`).value = value;
      });
    });
  }

  private applyExcelStyles(
    worksheet: ExcelJS.Worksheet,
    config: ExcelDownloadConfig
  ) {
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

    let currentRow = 1;

    // Estilo para título
    worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
    worksheet.getCell(`A${currentRow}`).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell(`A${currentRow}`).border = thickBorder;
    worksheet.getCell(`A${currentRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' },
    };
    currentRow++;

    // Configuración especial para el reporte de asistencias
    if (config.title === 'Reporte de Asistencias') {
      this.applyAttendanceReportStyles(worksheet, config, currentRow);
    } else {
      // Estilos estándar para otros reportes
      const allFilters = Object.entries(config.filters || {});

      if (allFilters.length > 0) {
        allFilters.forEach(([key, value], index) => {
          const startCol = index * 2;
          const colLetter1 = this.getColumnLetter(startCol);
          const colLetter2 = this.getColumnLetter(startCol + 1);

          worksheet.getCell(`${colLetter1}${currentRow}`).font = {
            size: 11,
            italic: true,
          };
          worksheet.getCell(`${colLetter1}${currentRow}`).alignment = {
            horizontal: 'left',
            vertical: 'middle',
          };
          worksheet.getCell(`${colLetter1}${currentRow}`).border = thinBorder;
        });
        currentRow++;
      }

      // Fila de espacio (sin estilos)
      currentRow++;

      // Estilos para encabezados
      const headerRow = worksheet.getRow(currentRow);
      headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thickBorder;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F0F0' },
        };
      });

      // Estilos para datos
      for (let row = currentRow + 1; row <= worksheet.rowCount; row++) {
        const dataRow = worksheet.getRow(row);
        dataRow.eachCell((cell, colNumber) => {
          cell.border = thinBorder;
          cell.font = { size: 11 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        });
      }
    }
  }

  private applyAttendanceReportStyles(
    worksheet: ExcelJS.Worksheet,
    config: ExcelDownloadConfig,
    startRow: number
  ) {
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

    let currentRow = startRow;

    // Estilos para período (fila 2)
    worksheet.getCell('A2').font = { bold: true, size: 12 };
    worksheet.getCell('A2').alignment = {
      horizontal: 'left',
      vertical: 'middle',
    };
    worksheet.getCell('A2').border = thinBorder;
    currentRow++;

    // Estilos para totales (filas 3-5)
    for (let row = 3; row <= 5; row++) {
      worksheet.getCell(`A${row}`).font = { size: 11 };
      worksheet.getCell(`A${row}`).alignment = {
        horizontal: 'left',
        vertical: 'middle',
      };
      worksheet.getCell(`A${row}`).border = thinBorder;

      worksheet.getCell(`C${row}`).font = { size: 11 };
      worksheet.getCell(`C${row}`).alignment = {
        horizontal: 'left',
        vertical: 'middle',
      };
      worksheet.getCell(`C${row}`).border = thinBorder;
    }

    // Fila de espacio (sin estilos)
    currentRow = 6;

    // Estilos para encabezados (fila 7)
    const headerRow = worksheet.getRow(currentRow);
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thickBorder;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' },
      };
    });

    // Estilos para datos (desde fila 8)
    for (let row = currentRow + 1; row <= worksheet.rowCount; row++) {
      const dataRow = worksheet.getRow(row);
      dataRow.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        cell.font = { size: 11 };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      });
    }
  }

  private generateFileName(config: ExcelDownloadConfig): string {
    const date = new Date().toISOString().split('T')[0];
    const baseName =
      config.fileName || config.title.replace(/[^a-zA-Z0-9]/g, '_');
    return `${baseName}_${date}.xlsx`;
  }

  private getColumnLetter(index: number): string {
    let result = '';
    while (index >= 0) {
      result = String.fromCharCode(65 + (index % 26)) + result;
      index = Math.floor(index / 26) - 1;
    }
    return result;
  }
}
