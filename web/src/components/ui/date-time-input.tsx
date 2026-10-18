/**
 * Ô nhập ngày GIỜ theo định dạng Việt Nam: `dd/mm/yyyy` + `hh:mm` (24 giờ).
 *
 * Vì sao không dùng `<input type="datetime-local">`: cùng cái bẫy với `type="date"` (xem
 * `DateInput`) — Chrome cài tiếng Anh hiện `10/18/2026 09:32 AM`, tháng trước ngày, giờ AM/PM.
 * Lỗi thật 18/10/2026: ô «Lịch hẹn khảo sát» của cơ hội hiện đúng chuỗi ấy.
 *
 * Giá trị vào/ra giữ dạng `yyyy-MM-ddTHH:mm` của `datetime-local` để chỗ gọi (`toLocalInput`,
 * `fromNvgInput`) không phải đổi. Có ngày mà chưa có giờ thì trả `''` và nhắc nhập giờ — không
 * tự điền 00:00 hay 08:00, vì lịch hẹn sai giờ còn tệ hơn lịch hẹn trống.
 */

import { useState } from 'react';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';

export interface DateTimeInputProps {
  /** `yyyy-MM-ddTHH:mm`, hoặc `''` khi trống. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Gõ `930` → `09:30`, `1415` → `14:15`; tự chèn dấu `:`. */
function maskTime(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (raw.includes(':')) {
    const [h = '', m = ''] = raw.split(':');
    const hh = h.replace(/\D/g, '').slice(0, 2);
    return `${hh}:${m.replace(/\D/g, '').slice(0, 2)}`;
  }
  if (digits.length <= 2) return digits;
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function DateTimeInput({ value, onChange, disabled }: DateTimeInputProps) {
  const [date, setDate] = useState(value.slice(0, 10));
  const [time, setTime] = useState(value.slice(11, 16));

  const timeOk = TIME.test(time);
  const emit = (d: string, t: string) => onChange(d && TIME.test(t) ? `${d}T${t}` : '');

  return (
    <div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <DateInput
            value={date}
            disabled={disabled}
            onChange={(d) => {
              setDate(d);
              emit(d, time);
            }}
          />
        </div>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="hh:mm"
          maxLength={5}
          aria-label="Giờ"
          className="w-24"
          disabled={disabled}
          value={time}
          aria-invalid={(time.length > 0 && !timeOk) || undefined}
          onChange={(e) => {
            const t = maskTime(e.target.value);
            setTime(t);
            emit(date, t);
          }}
        />
      </div>
      {date && !timeOk && (
        <span className="block text-xs text-status-overdue">
          {time ? 'Giờ chưa đúng (hh:mm, ví dụ 14:30).' : 'Nhập giờ (hh:mm, ví dụ 14:30).'}
        </span>
      )}
    </div>
  );
}
