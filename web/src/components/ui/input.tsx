import { forwardRef, useCallback, useEffect, useRef, type InputHTMLAttributes } from 'react';
import { applyVietnameseValidity, VALIDATION_MESSAGE_ATTR } from '@/lib/validation-message';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Câu lỗi riêng của màn hình, đè lên câu suy từ ràng buộc HTML.
   *
   * Dùng khi component biết rõ hơn trình duyệt vì sao giá trị chưa dùng được — ô ngày gõ dở
   * `15/1`, ô tiền bắt buộc còn trống. Chuỗi rỗng nghĩa là không có lỗi riêng.
   */
  validationMessage?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, validationMessage = '', ...props }, ref) => {
    /**
     * Thay lời thoại của trình duyệt bằng tiếng Việt, cho MỌI ô nhập trong hệ thống.
     *
     * Đặt ở đây chứ không ở từng màn hình vì có hơn 130 lượt dùng `required` rải khắp 30 tệp:
     * làm tay thì chỗ quên sẽ không ai phát hiện — chữ do trình duyệt sinh không nằm trong mã
     * nguồn, và trên máy người lập trình nó trông vẫn bình thường (xem `validation-message.ts`).
     *
     * Chạy trên `invalid` (lúc trình duyệt sắp hiện bong bóng) và `input` (để câu cũ không dính
     * lại sau khi người dùng đã sửa xong).
     */
    const internalRef = useRef<HTMLInputElement | null>(null);
    const attach = useCallback(
      (node: HTMLInputElement | null) => {
        internalRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        if (node) applyVietnameseValidity(node, validationMessage);
      },
      [ref, validationMessage],
    );

    function refresh() {
      const node = internalRef.current;
      if (node) applyVietnameseValidity(node, validationMessage);
    }

    /**
     * Chặn nộp biểu mẫu khi ô đang có lỗi riêng, kể cả biểu mẫu tắt kiểm tra của trình duyệt.
     *
     * 21 biểu mẫu trong hệ thống đặt `noValidate` để tự kiểm và hiện lỗi ngay trong màn hình
     * thay vì dùng bong bóng của trình duyệt (đúng Content Guidelines 5.5). Nhưng `noValidate`
     * tắt luôn `setCustomValidity`, nên ô ngày gõ dở `03/0` — quy ra ISO là rỗng — được nộp
     * lên và lưu thành `null`: trên màn hình ô trông như đã điền, trong CSDL thì trống, và
     * không cảnh báo nào hiện ra. Hạn nộp thầu mất theo cách đó thì hệ thống thôi nhắc hạn.
     *
     * Nghe ở giai đoạn CAPTURE để dừng trước cả `onSubmit` của React.
     */
    useEffect(() => {
      const node = internalRef.current;
      const form = node?.form;
      if (!form || !form.noValidate || !validationMessage) return;
      function blockSubmit(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        node?.focus();
        node?.reportValidity();
      }
      form.addEventListener('submit', blockSubmit, true);
      return () => form.removeEventListener('submit', blockSubmit, true);
    }, [validationMessage]);

    return (
      <input
        ref={attach}
        className={cn(
          // Viền dùng `border-strong`: viền mảnh quá thì ô nhập trông như một dòng chữ thường,
          // người dùng không nhận ra là chỗ gõ được cho tới khi thử bấm vào.
          'h-9 w-full rounded-sm border border-border-strong bg-surface',
          'px-3 text-fg placeholder:text-fg-subtle',
          'transition-[border-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)',
          'hover:border-fg-subtle',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60',
          // Viền lỗi dùng màu "Quá hạn" — cùng hệ 5 màu trạng thái, không tạo màu mới.
          'aria-[invalid=true]:border-status-overdue',
          className,
        )}
        {...props}
        {...{ [VALIDATION_MESSAGE_ATTR]: validationMessage || undefined }}
        onInvalid={(e) => {
          refresh();
          props.onInvalid?.(e);
        }}
        onInput={(e) => {
          refresh();
          props.onInput?.(e);
        }}
      />
    );
  },
);
Input.displayName = 'Input';
