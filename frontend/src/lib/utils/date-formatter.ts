import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import 'dayjs/locale/ar';
import 'dayjs/locale/en';

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD-MM-YYYY' | 'MM-DD-YYYY';
export type TimeFormat = '12' | '24';

export const DATE_FORMATS: Array<{ value: DateFormat; label: string; example: string }> = [
  { value: 'YYYY-MM-DD', label: 'ISO (YYYY-MM-DD)', example: '2024-12-25' },
  { value: 'DD/MM/YYYY', label: 'European (DD/MM/YYYY)', example: '25/12/2024' },
  { value: 'MM/DD/YYYY', label: 'US (MM/DD/YYYY)', example: '12/25/2024' },
  { value: 'DD-MM-YYYY', label: 'European Dash (DD-MM-YYYY)', example: '25-12-2024' },
  { value: 'MM-DD-YYYY', label: 'US Dash (MM-DD-YYYY)', example: '12-25-2024' },
];

export const INVOICE_FORMATS: Array<{ value: string; label: string; example: string }> = [
  { value: 'ORD-{YYYYMMDD}-{####}', label: 'ORD-YYYYMMDD-####', example: 'ORD-20241225-0001' },
  { value: 'INV-{YYYY}-{MM}-{####}', label: 'INV-YYYY-MM-####', example: 'INV-2024-12-0001' },
  { value: '{YYYYMMDD}-{####}', label: 'YYYYMMDD-####', example: '20241225-0001' },
  { value: 'ORD-{####}', label: 'ORD-####', example: 'ORD-0001' },
  { value: '{####}', label: '####', example: '0001' },
];

export class DateFormatter {
  static formatDate(
    date: string | Date,
    format: DateFormat = 'YYYY-MM-DD',
    language: 'en' | 'ar' = 'en'
  ): string {
    const d = dayjs(date);
    if (language === 'ar') {
      d.locale('ar');
    } else {
      d.locale('en');
    }
    return d.format(format);
  }

  static formatDateTime(
    date: string | Date,
    dateFormat: DateFormat = 'YYYY-MM-DD',
    timeFormat: TimeFormat = '24',
    language: 'en' | 'ar' = 'en'
  ): string {
    const d = dayjs(date);
    if (language === 'ar') {
      d.locale('ar');
    } else {
      d.locale('en');
    }
    const dateStr = d.format(dateFormat);
    const timeStr = timeFormat === '12' ? d.format('hh:mm A') : d.format('HH:mm');
    return `${dateStr} ${timeStr}`;
  }

  static formatTime(
    date: string | Date,
    timeFormat: TimeFormat = '24',
    language: 'en' | 'ar' = 'en'
  ): string {
    const d = dayjs(date);
    if (language === 'ar') {
      d.locale('ar');
    } else {
      d.locale('en');
    }
    return timeFormat === '12' ? d.format('hh:mm A') : d.format('HH:mm');
  }
}

