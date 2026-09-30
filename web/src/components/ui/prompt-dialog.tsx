/**
 * Hộp hỏi MỘT câu trả lời ngắn (lý do hủy, nguyên nhân trượt thầu, số hợp đồng…) — thay
 * `window.prompt`.
 *
 * Vì sao không dùng `window.prompt`: nút của hộp gốc là «OK/Cancel» theo ngôn ngữ trình duyệt,
 * không ép sang tiếng Việt được (CLAUDE.md 4.1), nhìn như hộp cảnh báo của trình duyệt chứ không
 * phải của phần mềm, và không nói được thao tác sẽ dẫn tới đâu. Ngày thì phải gõ «yyyy-mm-dd».
 *
 * Cách dùng giữ gần như cũ để thay từng chỗ không đổi luồng:
 *
 *   const prompt = usePromptDialog();
 *   const reason = await prompt.ask({ title: 'Hủy đề nghị mua?', label: 'Lý do hủy' });
 *   if (reason === null) return;           // bấm Huỷ / Esc / ra ngoài
 *   …
 *   return <>{prompt.dialog}…</>;
 *
 * Câu trả lời trả về đã cắt khoảng trắng. Trường bắt buộc (mặc định) để trống thì hộp báo ngay
 * dưới ô, không đóng — người dùng không phải bấm lại nút gốc từ đầu.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from './confirm-dialog';
import { DateInput } from './date-input';
import { Field } from './field';
import { Input } from './input';

export interface PromptOptions {
  title: string;
  /** Nhãn của ô nhập. */
  label: string;
  /** Hệ quả của thao tác, hiện trên ô nhập. */
  detail?: ReactNode;
  placeholder?: string;
  /** `false` = để trống vẫn xác nhận được (trả `''`). */
  required?: boolean;
  /** `date` = ô ngày `dd/mm/yyyy`, trả ISO `yyyy-mm-dd`. */
  type?: 'text' | 'date';
  defaultValue?: string;
  confirmLabel?: string;
  /** Việc không hoàn tác được (hủy, dừng) — nút chính màu đỏ. */
  danger?: boolean;
}

interface Pending extends PromptOptions {
  resolve: (value: string | null) => void;
}

export function usePromptDialog(): {
  ask: (options: PromptOptions) => Promise<string | null>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const ask = useCallback((options: PromptOptions) => {
    // Hộp cũ còn mở (bấm nút hai lần) thì coi như huỷ hộp cũ — không để lời hứa treo mãi.
    pendingRef.current?.resolve(null);
    return new Promise<string | null>((resolve) => {
      const next = { ...options, resolve };
      pendingRef.current = next;
      setValue(options.defaultValue ?? '');
      setError(null);
      setPending(next);
    });
  }, []);

  const close = useCallback((result: string | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(result);
  }, []);

  function confirm() {
    if (!pending) return;
    const trimmed = value.trim();
    if (pending.required !== false && trimmed === '') {
      setError(`Nhập ${pending.label.toLocaleLowerCase('vi')} trước khi xác nhận.`);
      return;
    }
    close(trimmed);
  }

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      confirmLabel={pending.confirmLabel ?? 'Xác nhận'}
      danger={pending.danger}
      focusConfirm={false}
      onCancel={() => close(null)}
      onConfirm={confirm}
    >
      {pending.detail && <div className="mb-3">{pending.detail}</div>}
      <Field
        label={pending.label}
        required={pending.required !== false}
        optional={pending.required === false}
      >
        {pending.type === 'date' ? (
          <DateInput
            value={value}
            onChange={(v) => {
              setValue(v);
              if (error) setError(null);
            }}
            autoFocus
            aria-invalid={error !== null}
          />
        ) : (
          <Input
            value={value}
            autoFocus
            placeholder={pending.placeholder}
            aria-invalid={error !== null}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirm();
              }
            }}
          />
        )}
      </Field>
      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}
    </ConfirmDialog>
  ) : null;

  return { ask, dialog };
}
