/**
 * Ô nhập TIỀN — hiện dấu chấm phân cách hàng nghìn ngay trong lúc gõ: `1.000.000`.
 *
 * Vì sao cần: giá trị tiền của NVG thường dài 9–12 chữ số. Không nhóm phân cách thì
 * `1000000` và `10000000` nhìn gần như nhau ở cỡ chữ 14px, mà lệch một chữ số ở đây là lệch
 * MƯỜI LẦN số tiền — trên một báo giá hay một đề nghị thanh toán, đó là loại lỗi không ai bắt
 * được bằng cách đọc lại (Content Guidelines 4.3).
 *
 * Trước đây các màn hình đều ghi chú "không nhập dấu phân cách" và để người dùng tự đếm chữ số.
 *
 * Giá trị vào/ra là CHUỖI CHỮ SỐ THÔ (`'1000000'`, hoặc `'-500000'` khi cho phép số âm) — đúng
 * thứ các trang đang giữ trong state và gửi xuống cột `bigint`, nên đổi sang ô này không kéo
 * theo thay đổi nào ở tầng dữ liệu.
 */

import { groupThousands } from '@nvg/shared';
import { Input } from '@/components/ui/input';
import { countDigits, useMaskedText } from '@/components/ui/use-masked-text';
import { cn } from '@/lib/utils';

export interface MoneyInputProps {
  /** Chuỗi chữ số thô, ví dụ `'1000000'`. Chuỗi rỗng nghĩa là chưa nhập. */
  value?: string;
  /** Chuỗi chữ số thô ban đầu cho ô không điều khiển (đọc lại bằng `FormData`). */
  defaultValue?: string;
  /** Nhận lại chuỗi chữ số thô, KHÔNG kèm dấu phân cách. */
  onChange?: (rawValue: string) => void;
  /**
   * Nhận chuỗi chữ số thô khi rời ô — dùng cho màn hình lưu ngay lúc blur (Giá dự thầu).
   *
   * Không có nó thì những màn hình đó không đổi sang ô này được, và số tiền dài nhất của cả hệ
   * thống lại là chỗ duy nhất không có dấu phân cách.
   */
  onBlur?: (rawValue: string) => void;
  /**
   * Cho phép số âm. Chỉ bật ở nơi số âm có nghĩa nghiệp vụ thật — phát sinh hợp đồng giảm trừ
   * khối lượng (HD-04), ảnh hưởng chi phí của yêu cầu thay đổi (TK-06). Bật bừa thì một dấu
   * trừ gõ nhầm biến khoản thu thành khoản chi mà biểu mẫu vẫn nhận.
   */
  allowNegative?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

/** Giữ lại chữ số, và dấu trừ đứng đầu nếu được phép. */
function rawDigits(input: string, allowNegative: boolean): string {
  const negative = allowNegative && input.trimStart().startsWith('-');
  const body = input.replace(/\D/g, '');
  return negative ? `-${body}` : body;
}

/**
 * Giá trị gửi ra ngoài: giống chuỗi đang gõ, trừ trường hợp mới có mỗi dấu trừ.
 *
 * Dấu trừ phải Ở LẠI trong ô để người dùng gõ tiếp con số, nhưng không được gửi đi — `'-'` đi
 * thẳng xuống cột `bigint` thì Postgres từ chối bằng một lỗi kỹ thuật, cho một việc người dùng
 * mới chỉ gõ dở.
 */
function submittable(raw: string): string {
  return /\d/.test(raw) ? raw : '';
}

export function MoneyInput({
  value,
  defaultValue,
  onChange,
  onBlur,
  allowNegative = false,
  placeholder,
  required,
  disabled,
  autoFocus,
  name,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  className,
}: MoneyInputProps) {
  const { inputRef, text, setText, rememberCaret } = useMaskedText({
    value,
    defaultValue,
    toDisplay: groupThousands,
  });
  const raw = submittable(rawDigits(text, allowNegative));

  // Câu lỗi riêng, đưa xuống `Input` — nơi lo việc thay lời thoại tiếng Anh của trình duyệt
  // cho mọi ô nhập trong hệ thống (xem `lib/validation-message.ts`).
  const validationMessage = required && raw === '' ? 'Vui lòng nhập số tiền.' : '';

  function handleChange(el: HTMLInputElement) {
    const caret = el.selectionStart ?? el.value.length;
    const digitsBeforeCaret = countDigits(el.value.slice(0, caret));
    const nextRaw = rawDigits(el.value, allowNegative);
    const nextText = groupThousands(nextRaw);

    rememberCaret(nextText, digitsBeforeCaret);
    setText(nextText, nextRaw);
    onChange?.(submittable(nextRaw));
  }

  return (
    <>
      <Input
        ref={inputRef}
        type="text"
        // `inputMode="numeric"` chứ không `type="number"`: ô số gốc từ chối chuỗi có dấu chấm,
        // và trên điện thoại nó kèm hai nút tăng/giảm vô nghĩa với một con số hàng trăm triệu.
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        validationMessage={validationMessage}
        // Căn phải: tiền so sánh theo cột, và mắt dò hàng nghìn từ phải sang.
        className={cn('text-right tabular-nums', className)}
        onChange={(e) => handleChange(e.target)}
        onBlur={() => onBlur?.(raw)}
      />
      {/* Nộp lên chuỗi thô — cột `bigint` không nhận dấu chấm phân cách. */}
      {name && <input type="hidden" name={name} value={raw} />}
    </>
  );
}
