import { useSettings } from './use-settings';
import { useLanguageStore } from '@/lib/store/language-store';
import { DateFormatter, DateFormat, TimeFormat } from '@/lib/utils/date-formatter';

export function useDateFormat() {
  const { settings } = useSettings();
  const language = useLanguageStore((state) => state.language);

  const dateFormat: DateFormat = (settings?.general?.dateFormat as DateFormat) || 'YYYY-MM-DD';
  const timeFormat: TimeFormat = (settings?.general?.timeFormat as TimeFormat) || '24';

  const formatDate = (date: string | Date): string => {
    return DateFormatter.formatDate(date, dateFormat, language);
  };

  const formatDateTime = (date: string | Date): string => {
    return DateFormatter.formatDateTime(date, dateFormat, timeFormat, language);
  };

  const formatTime = (date: string | Date): string => {
    return DateFormatter.formatTime(date, timeFormat, language);
  };

  return {
    dateFormat,
    timeFormat,
    formatDate,
    formatDateTime,
    formatTime,
  };
}

