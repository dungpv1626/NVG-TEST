/**
 * «Phạm vi công việc» → chỗ trống của mẫu (anh Dũng 29/10/2026: ghi phạm vi xong mà văn bản không đổi).
 *
 * Mẫu NVG không có bảng dòng phạm vi — câu «… nhận thi công các hạng mục: ……» là một chỗ trống tự do. Khối này
 * nói thẳng nội dung sẽ vào câu nào và đưa vào bằng một nút; đã có chữ khác ở đó thì hỏi «thay», không tự đè.
 */

import { Button } from '@/components/ui/button';
import type { TemplateFreeField } from '@/hooks/use-contract-templates';

/** Các dòng phạm vi thành một đoạn điền vào câu của mẫu — xuống dòng trong một dòng thành «; ». */
export function scopeText(rows: readonly { description: string | null }[]): string {
  return rows
    .map((r) =>
      (r.description ?? '')
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join('; '),
    )
    .filter(Boolean)
    .join('; ');
}

export function ScopeToDocument({
  field,
  text,
  current,
  onFill,
}: {
  field: TemplateFreeField;
  text: string;
  current: string;
  onFill: (value: string) => void;
}) {
  const sentence = field.before.trim();
  const shown = sentence.length > 90 ? `…${sentence.slice(-90)}` : sentence;
  const same = current.trim() === text.trim();
  return (
    <div className="-mt-1 mb-3 rounded-field bg-pill px-3 py-2 text-sm">
      <p className="text-ink-subtle">
        Văn bản in phạm vi ở câu «{shown} ……» ({field.article}).
      </p>
      {!text ? (
        <p className="mt-1 text-ink-subtle">Thêm dòng phạm vi rồi đưa vào văn bản.</p>
      ) : same ? (
        <p className="mt-1 font-medium">Đã đưa vào văn bản.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onFill(text)}>
            {current.trim() ? 'Thay bằng các dòng ở đây' : 'Đưa vào văn bản'}
          </Button>
          {current.trim() && (
            <span className="text-ink-subtle">Câu ấy đang ghi: «{current.trim()}»</span>
          )}
        </div>
      )}
    </div>
  );
}
