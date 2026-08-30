import { format, parseISO } from 'date-fns';

/** ISO文字列 → <input type="datetime-local"> 用の値（ローカル時刻） */
export function isoToLocalInput(iso: string): string {
  try {
    return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

/** <input type="datetime-local"> の値 → ISO文字列 */
export function localInputToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy/MM/dd HH:mm');
  } catch {
    return '-';
  }
}

export function formatTime(iso: string): string {
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '-';
  }
}
