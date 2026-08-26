/**
 * Ô nhập ngày theo định dạng Việt Nam `dd/mm/yyyy`.
 *
 * Vì sao không dùng `<input type="date">`: trình duyệt hiển thị ô đó theo NGÔN NGỮ CỦA CHÍNH
 * TRÌNH DUYỆT, không theo `lang` của trang. Chrome cài tiếng Anh — rất phổ biến trên máy văn
 * phòng ở Việt Nam — hiện `mm/dd/yyyy`, và không có thuộc tính nào ép được. Hệ quả không phải
 * lỗi hiển thị mà là lỗi dữ liệu: gõ hạn nộp thầu 03/04 ra ngày 4 tháng 3 thay vì 3 tháng 4,
 * lệch một tháng, và không có gì trên màn hình báo là đã sai (Content Guidelines 4.3).
 *
 * HAI CÁCH NHẬP, người dùng chọn cách nào cũng được:
 *
 *  - **Gõ tay** vào ô chữ — nhanh nhất khi đã biết ngày, có bàn phím số trên điện thoại
 *    (`inputMode="numeric"`) và tự chèn dấu `/`.
 *  - **Bấm nút lịch** ở cuối ô để mở bảng lịch gốc của trình duyệt — cần khi phải nhìn thứ
 *    trong tuần, hoặc đếm lùi từ một mốc.
 *
 * Bảng lịch mở từ một ô `type="date"` giấu đi, không phải từ ô người dùng nhìn thấy: ô ẩn đó
 * chính là thứ hiện `mm/dd/yyyy`, nhưng người dùng không đọc chuỗi của nó — họ bấm vào ô ngày
 * trên lịch, nên cái bẫy định dạng ở trên không quay lại.
 *
 * Giá trị vào/ra vẫn là ISO `yyyy-mm-dd` — đúng thứ Postgres nhận — nên phần còn lại của hệ
 * thống không phải biết gì về chuyện định dạng này.
 */

import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { displayDateToIso, isoDateToDisplay, toNvgDateInput } from '@nvg/shared';
import { CalendarPopover } from '@/components/ui/calendar-popover';
import { Input } from '@/components/ui/input';
import { countDigits, useMaskedText } from '@/components/ui/use-masked-text';
import { cn } from '@/lib/utils';

export interface DateInputProps {
  /** ISO `yyyy-mm-dd`, hoặc `''` khi để trống. Có giá trị này là ô hoạt động ở chế độ điều khiển. */
  value?: string;
  /** ISO `yyyy-mm-dd` cho ô không điều khiển (đọc lại bằng `FormData` hoặc `onBlur`). */
  defaultValue?: string;
  /** Nhận ISO `yyyy-mm-dd`, hoặc `''` khi ô trống/chưa gõ xong. */
  onChange?: (isoValue: string) => void;
  /** Nhận ISO `yyyy-mm-dd` khi rời ô — dùng cho các bảng lưu ngay lúc blur. */
  onBlur?: (isoValue: string) => void;
  /** Đặt tên để `FormData` đọc được. Giá trị nộp lên luôn là ISO, không phải chuỗi hiển thị. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  /** Cận dưới/cận trên dạng ISO `yyyy-mm-dd`. */
  min?: string;
  max?: string;
  'aria-invalid'?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Tách chữ số từ chuỗi người dùng đang gõ, coi dấu `/` họ tự gõ là DẤU KẾT THÚC MỘT ĐOẠN.
 *
 * Người Việt gõ ngày rất hay bỏ số 0: `1/1/2026`. Chỉ nhặt chữ số thì chuỗi đó thành `112026`
 * → `11/20/26`, một ngày khác hẳn, và màn hình báo "chưa đúng định dạng" cho một thứ người
 * dùng gõ hoàn toàn đúng thói quen. Ô `<input type="date">` cũ nhận được kiểu gõ này.
 *
 * Cũng nhờ vậy mà sửa từng đoạn hoạt động tự nhiên: bôi đen `08` trong `26/08/2026` rồi gõ `9`
 * cho ra `26/09/2026` — đúng ý — thay vì `26/92/026`.
 *
 * `deleting` = true thì KHÔNG bù: xoá một chữ số rồi thấy nó tự mọc lại là một cái bẫy không
 * lối thoát, người dùng không còn cách nào xoá đoạn đó nữa.
 */
function digitsOf(raw: string, deleting: boolean): string {
  if (deleting) return raw.replace(/\D/g, '');
  const parts = raw.split('/');
  return parts
    .map((part, index) => {
      const digits = part.replace(/\D/g, '');
      // Đoạn có dấu `/` đứng sau là đoạn người dùng đã gõ xong. Chỉ ngày và tháng mới bù.
      const finished = index < parts.length - 1;
      return finished && index < 2 && digits.length === 1 ? `0${digits}` : digits;
    })
    .join('');
}

/** Chèn `/` sau ngày và sau tháng. Cắt ở 8 chữ số. */
function maskAsDisplayDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateInput({
  value,
  defaultValue,
  onChange,
  onBlur,
  name,
  required,
  disabled,
  min,
  max,
  'aria-invalid': ariaInvalid,
  autoFocus,
  className,
}: DateInputProps) {
  const { inputRef, text, setText, rememberCaret } = useMaskedText({
    value,
    defaultValue,
    toDisplay: isoDateToDisplay,
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const hasCalendar = !disabled;

  const iso = displayDateToIso(text);
  const incomplete = text.length > 0 && iso === null;
  const outOfRange =
    iso !== null && ((min !== undefined && iso < min) || (max !== undefined && iso > max));

  const rangeMessage =
    max !== undefined && iso !== null && iso > max
      ? `Ngày không được sau ${isoDateToDisplay(max)}.`
      : `Ngày không được trước ${isoDateToDisplay(min ?? '')}.`;

  /**
   * Câu lỗi riêng của ô ngày, đưa xuống `Input` để nó đặt vào chỗ trình duyệt sẽ đọc.
   *
   * Không tự gọi `setCustomValidity` ở đây: `Input` đã lo việc đó cho MỌI ô nhập, và hai nơi
   * cùng ghi thì cái nào chạy sau xoá cái kia (xem `lib/validation-message.ts`).
   */
  const validationMessage = (() => {
    if (required && text.length === 0) return 'Vui lòng nhập ngày (dd/mm/yyyy).';
    if (incomplete) return 'Ngày chưa đúng định dạng (dd/mm/yyyy).';
    if (outOfRange) return rangeMessage;
    return '';
  })();

  function handleChange(el: HTMLInputElement, inputType: string) {
    // Người dùng ĐANG XOÁ thì không bù số 0 (xem `digitsOf`): xoá một chữ số rồi thấy nó mọc
    // lại là một cái bẫy không lối thoát.
    const deleting = inputType.startsWith('delete');
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const digitsBeforeCaret = digitsOf(raw.slice(0, caret), deleting).length;
    const masked = maskAsDisplayDate(digitsOf(raw, deleting));

    rememberCaret(masked, digitsBeforeCaret);
    setText(masked, displayDateToIso(masked) ?? '');
    commitIso(displayDateToIso(masked) ?? '');
  }

  /** Ghi nhận một giá trị ISO đã hợp lệ — dùng chung cho cả gõ tay lẫn chọn trên lịch. */
  function commitIso(nextIso: string) {
    onChange?.(nextIso);
  }

  /**
   * Rời ô — chỗ các màn hình lưu-ngay-khi-rời-ô (Bộ môn thiết kế, Ngày giao cam kết) ghi xuống.
   *
   * KHÔNG báo gì khi ô đang chứa chuỗi gõ dở. Chuỗi dở quy ra ISO là rỗng, mà rỗng ở những màn
   * hình đó nghĩa là `null` — nên chỉ cần gõ sửa nửa chừng rồi bấm ra chỗ khác là ngày đã lưu
   * bị xoá sạch, lệnh ghi chạy thành công và không có lời cảnh báo nào. Giữ nguyên giá trị cũ
   * và để dòng báo đỏ dưới ô nhắc người dùng gõ nốt.
   *
   * Ô TRỐNG HẲN thì vẫn báo: đó là người dùng cố ý bỏ ngày, không phải gõ dở.
   */
  function handleBlur() {
    if (incomplete) return;
    onBlur?.(iso ?? '');
  }

  return (
    <>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/yyyy"
          // 10 ký tự là đúng độ dài `dd/mm/yyyy`; chặn ở đây để không gõ thừa rồi mới báo sai.
          maxLength={10}
          value={text}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          // Chừa chỗ cho nút lịch để chữ không chui xuống dưới biểu tượng.
          className={cn(hasCalendar && 'pr-10', className)}
          aria-invalid={ariaInvalid || incomplete || outOfRange || undefined}
          validationMessage={validationMessage}
          onChange={(e) => handleChange(e.target, (e.nativeEvent as InputEvent).inputType ?? '')}
          onBlur={handleBlur}
        />

        {hasCalendar && (
          <>
            <button
              type="button"
              onClick={() => setCalendarOpen((open) => !open)}
              disabled={disabled}
              // Nút nằm TRONG `<label>` của `Field`. Thẻ `<button>` là nội dung tương tác nên
              // trình duyệt không chuyển tiếp cú bấm sang ô nhập — bấm lịch không kéo theo
              // việc nhảy con trỏ vào ô gõ tay.
              aria-label="Chọn ngày trên lịch"
              aria-expanded={calendarOpen}
              className={cn(
                // Vùng bấm 40×40 theo mức tối thiểu cho ngón tay (Content Guidelines 6.8). Ô
                // nhập chỉ cao 36px nên nút nhô ra 2px mỗi phía — không đẩy bố cục vì nó nằm
                // ở lớp tuyệt đối, và phần nhô ra là vùng bấm trong suốt chứ không phải hình.
                'group absolute top-1/2 right-0 flex size-10 -translate-y-1/2',
                'items-center justify-center focus-visible:outline-none',
                'disabled:pointer-events-none disabled:opacity-60',
              )}
            >
              {/* Hình vẽ giữ kích thước nhỏ để không lấn chữ; chỉ vùng bấm mới rộng ra. */}
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-sm',
                  'text-fg-subtle transition-colors duration-(--motion-fast)',
                  'group-hover:bg-surface-hover group-hover:text-fg',
                  'group-focus-visible:ring-2 group-focus-visible:ring-brand',
                )}
              >
                <CalendarDays className="size-4" aria-hidden />
              </span>
            </button>

            {calendarOpen && (
              <CalendarPopover
                selected={iso ?? ''}
                min={min}
                max={max}
                today={toNvgDateInput(new Date())}
                onSelect={(picked) => {
                  setText(isoDateToDisplay(picked), picked);
                  commitIso(picked);
                  // Chọn xong trên lịch là một lần sửa ĐÃ HOÀN TẤT, nên phải báo luôn cho đường
                  // `onBlur` — ô chữ không hề nhận focus khi bấm nút lịch, nên sẽ không có sự
                  // kiện rời ô nào tự phát sinh, và màn hình lưu-khi-rời-ô sẽ không ghi gì.
                  onBlur?.(picked);
                }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </>
        )}
      </div>

      {/* Ô này nộp lên ISO — thứ Postgres nhận — chứ không phải chuỗi người dùng nhìn thấy. */}
      {name && <input type="hidden" name={name} value={iso ?? ''} />}
      {incomplete && (
        <span className="block text-xs text-status-overdue">
          Ngày chưa đúng định dạng (dd/mm/yyyy).
        </span>
      )}
      {outOfRange && <span className="block text-xs text-status-overdue">{rangeMessage}</span>}
    </>
  );
}
