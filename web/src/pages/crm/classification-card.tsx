/**
 * Ô «Phân loại» của cơ hội — việc của bước «Xác minh / Phân loại» (CRM-02).
 *
 * Trước 0160 trường `classification` chỉ được HIỂN THỊ, không có chỗ nhập ở đâu cả, nên bước
 * Phân loại không có việc gì để làm và bị bỏ qua (phản hồi chủ dự án sau GĐ1). Muốn rời bước
 * Xác minh phải có Phân loại M2–M4 và Loại công trình — CSDL kiểm (`stage_readiness`).
 *
 * Giải thích từng mức M1–M4 hiện ngay dưới ô chọn: đó là cách Phòng Kinh doanh tự sàng lọc
 * khách (hồ sơ khảo sát), người mới không thể đoán được.
 */

import { useEffect, useState } from 'react';
import {
  OPPORTUNITY_CLASSIFICATIONS,
  OPPORTUNITY_CLASSIFICATION_HINTS,
  OPPORTUNITY_CLASSIFICATION_LABELS,
  OPPORTUNITY_PROJECT_TYPES,
  type OpportunityClassification,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toUserMessage } from '@/hooks/use-error-message';
import { useClassifyOpportunity } from '@/hooks/use-opportunities';
import { cn } from '@/lib/utils';

export const CLASSIFICATION_ANCHOR = 'phan-loai';

const SELECT =
  'h-9 w-full rounded-sm border border-border bg-surface px-3 disabled:bg-surface-sunken';

export function ClassificationCard({
  opportunityId,
  classification,
  projectType,
  canEdit,
  highlight,
  onSaved,
}: {
  opportunityId: string;
  classification: string | null;
  projectType: string | null;
  canEdit: boolean;
  /** Đang là việc của bước hiện tại — viền nhấn để mắt tìm thấy ngay. */
  highlight: boolean;
  /**
   * Gọi sau khi lưu xong — trang cơ hội dùng để tự chuyển sang bước kế tiếp khi phân loại đã đủ,
   * người dùng không phải tự tìm nút (phản hồi chủ dự án). Trả câu báo kết quả để hiện tại chỗ.
   */
  onSaved?: (classification: string | null, projectType: string | null) => Promise<string | null>;
}) {
  const classify = useClassifyOpportunity();
  const [value, setValue] = useState(classification ?? '');
  const [type, setType] = useState(projectType ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => setValue(classification ?? ''), [classification]);
  useEffect(() => setType(projectType ?? ''), [projectType]);

  const dirty = value !== (classification ?? '') || type !== (projectType ?? '');
  // Loại công trình cũ nhập tự do có thể không nằm trong danh mục — vẫn giữ làm một lựa chọn.
  const typeOptions: string[] = [...OPPORTUNITY_PROJECT_TYPES];
  if (projectType && !typeOptions.includes(projectType)) typeOptions.unshift(projectType);

  async function save() {
    setError(null);
    setSaved(null);
    try {
      await classify.mutateAsync({
        opportunityId,
        classification: value || null,
        projectType: type || null,
      });
      setSaved((await onSaved?.(value || null, type || null)) ?? 'Đã lưu.');
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <section
      id={CLASSIFICATION_ANCHOR}
      aria-label="Phân loại cơ hội"
      className={cn(
        'scroll-mt-40 rounded-md border p-4',
        highlight ? 'border-brand bg-brand-subtle' : 'border-border bg-surface',
      )}
    >
      <h2 className="font-semibold">Phân loại</h2>
      {highlight && (
        <p className="mt-0.5 text-sm">
          Việc của bước này: chọn khách thuộc loại nào và loại công trình. Khách chưa có nhu cầu
          đứng lại ở bước Xác minh để chăm sóc sau.
        </p>
      )}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field
          label="Khách thuộc loại nào"
          hint={
            value ? OPPORTUNITY_CLASSIFICATION_HINTS[value as OpportunityClassification] : undefined
          }
        >
          <select
            value={value}
            disabled={!canEdit}
            onChange={(e) => setValue(e.target.value)}
            className={SELECT}
          >
            <option value="">Chưa phân loại</option>
            {OPPORTUNITY_CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {OPPORTUNITY_CLASSIFICATION_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Loại công trình">
          <select
            value={type}
            disabled={!canEdit}
            onChange={(e) => setType(e.target.value)}
            className={SELECT}
          >
            <option value="">Chưa xác định</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {/* Khách M1 đứng lại có chủ đích — nói rõ ngay tại đây, kể cả sau khi tải lại trang (chủ
          dự án chạy thử 20/10/2026 tưởng là lỗi vì nút «Chuyển sang Khảo sát» chỉ bị mờ). */}
      {classification === 'M1' && !dirty && (
        <p
          role="status"
          className="mt-3 rounded-sm border border-status-pending bg-status-pending-bg px-3 py-2 text-sm"
        >
          Khách đang ở mức <strong>chưa có nhu cầu — lưu để chăm sóc sau</strong> nên dừng ở bước
          Xác minh, chưa sang Khảo sát được. Máy sẽ nhắc liên hệ lại. Khi khách có nhu cầu thật, đổi
          phân loại sang «Có nhu cầu thật — cần khảo sát» và lưu — hệ thống tự chuyển sang Khảo sát.
        </p>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant={highlight ? 'primary' : 'secondary'}
            disabled={!dirty || classify.isPending}
            onClick={() => void save()}
          >
            Lưu phân loại
          </Button>
          {saved && !dirty && (
            <span role="status" className="text-sm">
              {saved}
            </span>
          )}
          {error && (
            <span role="alert" className="text-sm text-status-overdue">
              {error}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
