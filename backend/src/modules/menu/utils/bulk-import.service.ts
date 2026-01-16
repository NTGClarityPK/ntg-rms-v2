import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface FieldDefinition {
  name: string;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array';
  description: string;
  example?: string;
}

@Injectable()
export class BulkImportService {
  /**
   * Generate a sample Excel file for bulk import
   */
  async generateSampleExcel(params: {
    entityType: string;
    fields: FieldDefinition[];
    translateFields: string[];
    language: string;
    getTranslatedFieldNote?: (field: FieldDefinition, language: string) => string;
    getTranslatedSampleText?: (language: string) => string;
    getTranslatedLegendText?: (language: string) => string;
    getTranslatedDefaultArrayExample?: (language: string) => string;
  }): Promise<any> {
    const { fields, entityType } = params;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${entityType} Import Sample`);

    // Add header row with required field indicators
    const headerRow = worksheet.addRow(fields.map(field => field.required ? `${field.label}*` : field.label));

    // Style header row - different colors for required vs optional
    headerRow.eachCell((cell, colNumber) => {
      const field = fields[colNumber - 1];
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: field.required ? { argb: 'FFFFD700' } : { argb: 'FFE6E6FA' } // Gold for required, light gray for optional
      };
    });

    // Add legend row
    const legendText = params.getTranslatedLegendText ? params.getTranslatedLegendText(params.language) : '* Required field';
    const legendRow = worksheet.addRow([legendText]);
    legendRow.font = { italic: true, size: 10 };
    legendRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };

    // Add sample data row
    const sampleText = params.getTranslatedSampleText ? params.getTranslatedSampleText(params.language) : 'Sample';
    const sampleRow = fields.map(field => {
      switch (field.type) {
        case 'boolean':
          return field.example === 'true' ? 'true' : 'false';
        case 'number':
          return field.example || '0';
        case 'date':
          return field.example || '2023-01-01';
        case 'array':
          return field.example || (params.getTranslatedDefaultArrayExample ? params.getTranslatedDefaultArrayExample(params.language) : 'Item1,Item2');
        default:
          return field.example || `${sampleText} ${field.label}`;
      }
    });
    worksheet.addRow(sampleRow);

    // Set column widths
    fields.forEach((field, index) => {
      worksheet.getColumn(index + 1).width = Math.max(field.label.length, 15);
    });

    // Add comments for fields (updated to match header labels with asterisks)
    fields.forEach((field, index) => {
      const cell = worksheet.getCell(1, index + 1);
      if (params.getTranslatedFieldNote) {
        cell.note = params.getTranslatedFieldNote(field, params.language);
      } else {
        cell.note = field.required ? `${field.description} (Required field)` : `${field.description} (Optional field)`;
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Parse Excel file and return rows as objects
   */
  async parseExcelFile(
    fileBuffer: Buffer,
    config: {
      entityType: string;
      fields: FieldDefinition[];
      translateFields: string[];
    }
  ): Promise<any[]> {
    const { fields } = config;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheet found in Excel file');
    }

    const rows: any[] = [];
    const headerMap = new Map<string, number>();

    // Read header row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const headerValue = cell.value?.toString()?.trim();
      if (headerValue) {
        headerMap.set(headerValue.toLowerCase(), colNumber);
        // Also store without asterisk for required field indicators
        if (headerValue.endsWith('*')) {
          headerMap.set(headerValue.slice(0, -1).toLowerCase(), colNumber);
        }
      }
    });

    // Process data rows
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const rowData: any = {};

      fields.forEach(field => {
        // Try multiple header matching strategies to handle translated headers and asterisks
        let colIndex = headerMap.get(field.label.toLowerCase());

        // If not found, try field name (lowercase)
        if (!colIndex) {
          colIndex = headerMap.get(field.name.toLowerCase());
        }

        if (colIndex) {
          const cell = row.getCell(colIndex);
          let value = cell.value;

          // Convert value based on field type
          switch (field.type) {
            case 'boolean':
              if (typeof value === 'boolean') {
                rowData[field.name] = value;
              } else if (typeof value === 'string') {
                rowData[field.name] = value.toLowerCase() === 'true';
              } else {
                rowData[field.name] = Boolean(value);
              }
              break;
            case 'number':
              if (typeof value === 'number') {
                rowData[field.name] = value;
              } else if (typeof value === 'string') {
                const numValue = parseFloat(value);
                rowData[field.name] = isNaN(numValue) ? 0 : numValue;
              } else {
                rowData[field.name] = 0;
              }
              break;
            case 'date':
              if (value instanceof Date) {
                rowData[field.name] = value.toISOString().split('T')[0]; // YYYY-MM-DD format
              } else if (typeof value === 'string') {
                rowData[field.name] = value;
              } else {
                rowData[field.name] = '';
              }
              break;
            case 'array':
              if (typeof value === 'string') {
                // Split comma-separated values and trim whitespace
                rowData[field.name] = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
              } else if (Array.isArray(value)) {
                rowData[field.name] = value;
              } else {
                rowData[field.name] = [];
              }
              break;
            default:
              rowData[field.name] = value?.toString() || '';
              break;
          }
        }
      });

      // Only add non-empty rows
      const hasData = fields.some(field => {
        const value = rowData[field.name];
        return value !== undefined && value !== null && value !== '';
      });

      if (hasData) {
        rows.push(rowData);
      }
    }

    return rows;
  }

  /**
   * Batch translate entities and return translation results
   */
  async batchTranslateEntities(
    entities: Array<{ [key: string]: any }>,
    entityType: string,
    fieldsToTranslate: string[],
    tenantId: string,
  ): Promise<Map<string, Map<number, any>>> {
    // This is a placeholder implementation
    // In a real implementation, this would call a translation service
    const result = new Map<string, Map<number, any>>();

    fieldsToTranslate.forEach(fieldName => {
      const fieldMap = new Map<number, any>();
      entities.forEach((entity, index) => {
        // Placeholder: return empty translation result
        fieldMap.set(index, {});
      });
      result.set(fieldName, fieldMap);
    });

    return result;
  }

  /**
   * Generate export Excel file from data
   */
  async generateExportExcel(
    params: {
      entityType: string;
      fields: FieldDefinition[];
      translateFields: string[];
    },
    data: Array<Record<string, any>>,
    language: string,
  ): Promise<any> {
    const { fields, entityType } = params;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${entityType} Export`);

    // Add header row
    const headerRow = worksheet.addRow(fields.map(field => field.label));
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    // Add data rows
    data.forEach(row => {
      const excelRow = fields.map(field => {
        const value = row[field.name];
        switch (field.type) {
          case 'boolean':
            return value ? 'true' : 'false';
          case 'number':
            return value || 0;
          case 'date':
            return value || '';
          case 'array':
            if (Array.isArray(value)) {
              return value.join(',');
            }
            return value || '';
          default:
            return value || '';
        }
      });
      worksheet.addRow(excelRow);
    });

    // Set column widths
    fields.forEach((field, index) => {
      worksheet.getColumn(index + 1).width = Math.max(field.label.length, 15);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}