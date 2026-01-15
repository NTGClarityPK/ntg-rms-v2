import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { TranslationService } from '../../translations/services/translation.service';

export interface FieldDefinition {
  name: string;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'uuid';
  description?: string;
  example?: string;
}

export interface ReferenceData {
  name: string; // Sheet name
  headers: string[]; // Column headers
  rows: Array<Array<string | number>>; // Data rows
}

export interface EntityImportConfig {
  entityType: string;
  fields: FieldDefinition[];
  translateFields?: string[]; // Fields that need translation (e.g., ['name', 'description'])
  referenceSheets?: ReferenceData[]; // Optional reference sheets (e.g., roles, branches)
}

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(private translationService: TranslationService) {}

  /**
   * Generate sample Excel file for bulk import
   */
  async generateSampleExcel(config: EntityImportConfig): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Import Data');

    // Add header row with field labels (capitalized, user-friendly)
    // The parser does case-insensitive matching, so it will match both 'Name' and 'name'
    const headers = config.fields.map(f => f.label);
    worksheet.addRow(headers);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add instructions row
    const instructionsRow = worksheet.addRow([]);
    instructionsRow.getCell(1).value = 'Instructions:';
    instructionsRow.getCell(1).font = { bold: true };
    
    let instructionCol = 1;
    for (const field of config.fields) {
      const instruction = `${field.label}${field.required ? ' (Required)' : ' (Optional)'}: ${field.description || field.type}`;
      instructionsRow.getCell(instructionCol).value = instruction;
      instructionCol++;
    }

    // Add example row
    const exampleRow = worksheet.addRow([]);
    exampleRow.getCell(1).value = 'Example:';
    exampleRow.getCell(1).font = { bold: true };
    
    let exampleCol = 1;
    for (const field of config.fields) {
      if (field.example !== undefined) {
        exampleRow.getCell(exampleCol).value = field.example;
      } else {
        // Generate example based on type
        switch (field.type) {
          case 'string':
            exampleRow.getCell(exampleCol).value = field.name === 'name' ? 'Sample Name' : 'Sample Text';
            break;
          case 'number':
            exampleRow.getCell(exampleCol).value = 0;
            break;
          case 'boolean':
            exampleRow.getCell(exampleCol).value = true;
            break;
          case 'date':
            exampleRow.getCell(exampleCol).value = '2024-01-01';
            break;
          case 'array':
            exampleRow.getCell(exampleCol).value = 'item1,item2';
            break;
          case 'uuid':
            exampleRow.getCell(exampleCol).value = '00000000-0000-0000-0000-000000000000';
            break;
        }
      }
      exampleCol++;
    }

    // Add empty row for spacing
    worksheet.addRow([]);

    // Set column widths
    config.fields.forEach((field, index) => {
      worksheet.getColumn(index + 1).width = Math.max(15, field.label.length + 5);
    });

    // Add reference sheets if provided
    if (config.referenceSheets && config.referenceSheets.length > 0) {
      for (const refSheet of config.referenceSheets) {
        const refWorksheet = workbook.addWorksheet(refSheet.name);
        
        // Add headers
        const refHeaderRow = refWorksheet.addRow(refSheet.headers);
        refHeaderRow.font = { bold: true };
        refHeaderRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' },
        };

        // Add data rows
        for (const row of refSheet.rows) {
          refWorksheet.addRow(row);
        }

        // Set column widths
        refSheet.headers.forEach((header, index) => {
          refWorksheet.getColumn(index + 1).width = Math.max(15, String(header).length + 5);
        });
      }
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Parse Excel file and return rows as objects
   * Note: This method does not validate required fields per row - that should be done in the service method
   * to allow processing all rows and collecting errors per row.
   */
  async parseExcelFile(
    fileBuffer: Buffer,
    config: EntityImportConfig,
  ): Promise<Array<Record<string, any>>> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('Excel file must contain at least one worksheet');
    }

    const rows: Array<Record<string, any>> = [];
    const fieldNames = config.fields.map(f => f.name);
    const fieldLabels = config.fields.map(f => f.label);

    // Find header row (skip instruction rows)
    let headerRowIndex = -1;
    for (let i = 1; i <= Math.min(10, worksheet.rowCount); i++) {
      const row = worksheet.getRow(i);
      const firstCell = row.getCell(1).value;
      
      // Check if this row contains field names or labels (case-insensitive)
      const rowValues = row.values as any[];
      const matchesFields = fieldNames.every((fieldName, index) => {
        const fieldLabel = fieldLabels[index];
        return rowValues.some(val => {
          if (!val || typeof val !== 'string') return false;
          const valLower = val.toLowerCase().trim();
          return valLower === fieldName.toLowerCase() || valLower === fieldLabel.toLowerCase();
        });
      });

      if (matchesFields && rowValues.length >= fieldNames.length) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new BadRequestException('Could not find header row in Excel file. Please ensure the first row contains field names.');
    }

    // Read header row to map columns
    const headerRow = worksheet.getRow(headerRowIndex);
    const columnMap: Map<number, string> = new Map();
    
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const cellValue = cell.value?.toString().toLowerCase().trim();
      // Match against both name and label (case-insensitive) for compatibility
      const field = config.fields.find(f => 
        f.name.toLowerCase() === cellValue || f.label.toLowerCase() === cellValue
      );
      if (field) {
        columnMap.set(colNumber, field.name);
      }
    });

    // Validate all required fields are present
    const foundFields = Array.from(columnMap.values());
    const missingRequiredFields = config.fields
      .filter(f => f.required && !foundFields.includes(f.name))
      .map(f => f.label);
    
    if (missingRequiredFields.length > 0) {
      throw new BadRequestException(
        `Missing required columns: ${missingRequiredFields.join(', ')}`
      );
    }

    // Parse data rows (skip header and instruction rows)
    for (let i = headerRowIndex + 1; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const rowData: Record<string, any> = {};
      let hasData = false;

      // First pass: collect all cell values and check if row has any data
      columnMap.forEach((fieldName, colNumber) => {
        const cell = row.getCell(colNumber);
        const cellValue = cell.value;
        
        if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
          hasData = true;
        }
      });

      // Skip completely empty rows
      if (!hasData) {
        continue;
      }

      // Second pass: parse values (skip required field validation here - let service handle it)
      columnMap.forEach((fieldName, colNumber) => {
        const cell = row.getCell(colNumber);
        // ExcelJS can store values in cell.value or cell.text
        // Prefer cell.text if available (it's the displayed text), otherwise use cell.value
        let cellValue = cell.text !== null && cell.text !== undefined && cell.text !== '' 
          ? cell.text 
          : cell.value;
        const field = config.fields.find(f => f.name === fieldName);

        if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
          try {
            rowData[fieldName] = this.parseCellValue(cellValue, field);
          } catch (error) {
            // Store parsing error in rowData for service to handle
            if (!rowData._errors) {
              rowData._errors = [];
            }
            rowData._errors.push(`Column ${field.label}: ${error.message}`);
          }
        }
        // Note: Required field validation is now done in the service method
        // to allow processing all rows and collecting errors per row
      });

      // Add row if it has at least one data field
      rows.push(rowData);
    }

    if (rows.length === 0) {
      throw new BadRequestException('No valid data rows found in Excel file');
    }

    return rows;
  }

  /**
   * Extract text value from ExcelJS cell value (handles RichText, Formula, etc.)
   */
  private extractCellText(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Handle ExcelJS RichText object
    if (value && typeof value === 'object' && value.richText) {
      return value.richText.map((rt: any) => rt.text || '').join('');
    }

    // Handle ExcelJS Formula object
    if (value && typeof value === 'object' && value.formula) {
      return String(value.result || value.formula);
    }

    // Handle ExcelJS SharedString object
    if (value && typeof value === 'object' && value.text !== undefined) {
      return String(value.text);
    }

    // Handle plain objects - try to get text property or stringify
    if (typeof value === 'object' && !(value instanceof Date)) {
      // If it's an object with a text property, use that
      if (value.text !== undefined) {
        return String(value.text);
      }
      // Otherwise, try to stringify safely
      if (value.toString && typeof value.toString === 'function' && value.toString() !== '[object Object]') {
        return String(value.toString());
      }
      // Last resort: return empty string for objects we can't parse
      return '';
    }

    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Handle primitives
    return String(value);
  }

  /**
   * Parse cell value based on field type
   */
  private parseCellValue(value: any, field: FieldDefinition): any {
    if (value === null || value === undefined || value === '') {
      return field.required ? undefined : null;
    }

    switch (field.type) {
      case 'string':
        const textValue = this.extractCellText(value);
        return textValue.trim();
      
      case 'number':
        const textForNumber = this.extractCellText(value);
        const num = typeof value === 'number' ? value : parseFloat(textForNumber);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${textForNumber}`);
        }
        return num;
      
      case 'boolean':
        if (typeof value === 'boolean') return value;
        const textForBoolean = this.extractCellText(value);
        const str = textForBoolean.toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes';
      
      case 'date':
        if (value instanceof Date) return value.toISOString().split('T')[0];
        const textForDate = this.extractCellText(value);
        const dateStr = textForDate.trim();
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date: ${textForDate}`);
        }
        return date.toISOString().split('T')[0];
      
      case 'array':
        if (Array.isArray(value)) return value;
        const textForArray = this.extractCellText(value);
        const arrStr = textForArray.trim();
        return arrStr ? arrStr.split(',').map(item => item.trim()).filter(Boolean) : [];
      
      case 'uuid':
        const textForUuid = this.extractCellText(value);
        const uuidStr = textForUuid.trim();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuidStr)) {
          throw new Error(`Invalid UUID format: ${textForUuid}`);
        }
        return uuidStr;
      
      default:
        const textForDefault = this.extractCellText(value);
        return textForDefault.trim();
    }
  }

  /**
   * Batch translate fields for multiple entities
   * Translates ALL fields from ALL entities in a SINGLE API call
   * Returns translations organized by field name and entity index
   * Note: This only returns the translation results. The actual storage happens
   * when createBatchTranslations is called for each entity after creation.
   */
  async batchTranslateEntities(
    entities: Array<Record<string, any>>,
    entityType: string,
    translateFields: string[],
    tenantId: string,
  ): Promise<Map<string, Map<number, any>>> {
    const results = new Map<string, Map<number, any>>(); // fieldName -> entityIndex -> translations

    if (!translateFields || translateFields.length === 0) {
      return results;
    }

    // Collect ALL texts from ALL entities and ALL fields into a single array
    // Format: [{ text, fieldName, entityIndex, fieldIndex }]
    const allTexts: Array<{ text: string; fieldName: string; entityIndex: number; fieldIndex: number }> = [];
    const fieldIndexMap = new Map<string, number>(); // Track field order

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      
      for (const fieldName of translateFields) {
        const text = entity[fieldName];
        if (text && typeof text === 'string' && text.trim()) {
          if (!fieldIndexMap.has(fieldName)) {
            fieldIndexMap.set(fieldName, fieldIndexMap.size);
          }
          allTexts.push({
            text: text.trim(),
            fieldName,
            entityIndex: i,
            fieldIndex: fieldIndexMap.get(fieldName)!,
          });
        }
      }
    }

    if (allTexts.length === 0) {
      return results;
    }

    // Access geminiService through the translationService
    const geminiService = (this.translationService as any).geminiService;
    
    if (!geminiService) {
      this.logger.warn('Gemini service not available, skipping translations');
      return results;
    }

    // Get tenant languages for target languages
    let targetLanguages: string[] = [];
    try {
      const tenantLanguages = await (this.translationService as any).translationRepository.getTenantLanguages(tenantId);
      targetLanguages = tenantLanguages.map((l: any) => l.code).filter((lang: string) => lang !== 'en');
    } catch (error) {
      this.logger.warn(`Failed to get tenant languages: ${error.message}`);
      // Use default supported languages
      targetLanguages = ['ar', 'ku', 'fr'];
    }

    if (targetLanguages.length === 0) {
      this.logger.warn('No target languages configured, skipping translations');
      return results;
    }

    // Translate ALL texts in ONE API call
    try {
      // Prepare texts for batch translation - use actual fieldName for proper mapping
      const textsForTranslation = allTexts.map((item) => ({
        text: item.text,
        fieldName: item.fieldName, // Use actual field name for proper result mapping
      }));

      // Single API call for ALL texts (names, descriptions, etc.) from ALL entities
      const batchResults = await geminiService.translateBatch(
        textsForTranslation,
        targetLanguages,
        undefined, // Auto-detect source language
      );

      // Map results back to entities organized by field name and entity index
      for (let i = 0; i < allTexts.length; i++) {
        const item = allTexts[i];
        const translationResult = batchResults[i]?.translations || {};

        // Initialize field map if needed
        if (!results.has(item.fieldName)) {
          results.set(item.fieldName, new Map());
        }

        // Store translations for this entity's field
        results.get(item.fieldName)!.set(item.entityIndex, translationResult);
      }

      const totalFields = Array.from(results.values()).reduce((sum, map) => sum + map.size, 0);
      this.logger.log(`Batch translated ${allTexts.length} texts (${translateFields.join(', ')}) from ${entities.length} entities in ONE API call`);
    } catch (error) {
      this.logger.error(`Failed to batch translate: ${error.message}`);
      // Return empty results on failure
    }

    return results;
  }
}

