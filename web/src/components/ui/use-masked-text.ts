/**
 * Phần chung của các ô nhập có ĐỊNH DẠNG LẠI CHỮ NGƯỜI DÙNG ĐANG GÕ — ô ngày `dd/mm/yyyy` và ô
 * tiền `1.000.000`.
 *
 * Cả hai đều gặp đúng bốn vấn đề, và cả bốn đều là loại mất dữ liệu im lặng nếu làm thiếu:
 *
 *  1. **Con trỏ.** Mỗi phím gõ là một lần dựng lại cả chuỗi, nên trình duyệt đánh mất vị trí
 *     con trỏ và đẩy nó về cuối — sửa một chữ số ở giữa là phải xoá hết gõ lại.
 *  2. **Giá trị đặt lại từ bên ngoài** ở chế độ điều khiển.
 *  3. **`defaultValue` đến muộn** ở chế độ không điều khiển. Ô gốc của trình duyệt làm việc này
 *     miễn phí; ô giữ chữ trong state React thì không, và màn hình nạp dữ liệu bất đồng bộ sẽ
 *     khoá cứng ô ở chuỗi rỗng của lượt vẽ đầu.
 *  4. **`form.reset()`.** Vài màn hình gọi nó sau khi lưu để soạn tiếp bản ghi kế tiếp; ô gốc
 *     tự trở về mặc định, ô này thì không — và phiếu sau lặng lẽ mang số liệu của phiếu trước.
 *
 * Gom về một chỗ vì viết lần thứ hai là chắc chắn quên một trong bốn.
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface MaskedTextOptions {
  /** Giá trị THÔ ở chế độ điều khiển. `undefined` nghĩa là ô không điều khiển. */
  value?: string;
  /** Giá trị THÔ ban đầu ở chế độ không điều khiển. */
  defaultValue?: string;
  /** Đổi giá trị thô thành chuỗi hiển thị cho người dùng. */
  toDisplay: (raw: string) => string;
}

export interface MaskedTextField {
  inputRef: RefObject<HTMLInputElement>;
  /** Chuỗi đang hiển thị trong ô. */
  text: string;
  /** Đặt chuỗi hiển thị, kèm giá trị thô tương ứng để so khi giá trị đổi từ bên ngoài. */
  setText: (nextText: string, nextRaw: string) => void;
  controlled: boolean;
  /**
   * Ghi nhớ vị trí con trỏ sẽ đặt lại sau lượt vẽ, tính theo SỐ CHỮ SỐ đứng trước con trỏ chứ
   * không theo chỉ số ký tự — số dấu phân cách thay đổi theo độ dài chuỗi.
   */
  rememberCaret: (nextText: string, digitsBeforeCaret: number) => void;
}

/** Vị trí ký tự nằm ngay sau chữ số thứ `n`. `n <= 0` thì đứng trước mọi chữ số. */
function caretAfterDigits(text: string, n: number): number {
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const isDigit = text[i]! >= '0' && text[i]! <= '9';
    if (n <= 0 && isDigit) return i;
    if (isDigit) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return text.length;
}

/** Số chữ số trong một chuỗi. */
export function countDigits(text: string): number {
  return text.replace(/\D/g, '').length;
}

export function useMaskedText({
  value,
  defaultValue,
  toDisplay,
}: MaskedTextOptions): MaskedTextField {
  const controlled = value !== undefined;
  // `null!` để kiểu khớp `ref` của React 18 (`RefObject<T>`, không nhận `T | null`); giá trị
  // thật vẫn là `null` cho tới khi ô được gắn vào DOM, và mọi chỗ đọc đều kiểm trước.
  const inputRef = useRef<HTMLInputElement>(null!);
  const [text, setTextState] = useState(() => toDisplay(value ?? defaultValue ?? ''));

  // So sánh qua giá trị THÔ chứ không qua chuỗi hiển thị: đang gõ dở mà so chuỗi hiển thị thì
  // mỗi phím gõ vào lại bị ghi đè ngược.
  const lastRaw = useRef(value ?? defaultValue ?? '');
  function setText(nextText: string, nextRaw: string) {
    lastRaw.current = nextRaw;
    setTextState(nextText);
  }

  useEffect(() => {
    if (!controlled || value === lastRaw.current) return;
    lastRaw.current = value ?? '';
    setTextState(toDisplay(value ?? ''));
    // `toDisplay` được khai lại mỗi lượt vẽ ở nơi gọi; đưa vào phụ thuộc sẽ chạy lại mỗi lượt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, value]);

  const lastDefault = useRef(defaultValue);
  useEffect(() => {
    if (controlled || defaultValue === lastDefault.current) return;
    lastDefault.current = defaultValue;
    lastRaw.current = defaultValue ?? '';
    setTextState(toDisplay(defaultValue ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, defaultValue]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    function handleReset() {
      const raw = (controlled ? value : defaultValue) ?? '';
      lastRaw.current = raw;
      setTextState(toDisplay(raw));
    }
    form.addEventListener('reset', handleReset);
    return () => form.removeEventListener('reset', handleReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, value, defaultValue]);

  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || pendingCaret.current === null) return;
    el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  function rememberCaret(nextText: string, digitsBeforeCaret: number) {
    pendingCaret.current = caretAfterDigits(nextText, digitsBeforeCaret);
  }

  return { inputRef, text, setText, controlled, rememberCaret };
}
