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
}: {
  opportunityId: string;
  classification: string | null;
  projectType: string | null;
  canEdit: boolean;
  /** Đang là việc của bước hiện tại — viền nhấn để mắt tìm thấy ngay. */
  highlight: boolean;
}) {
  const classify = useClassifyOpportunity();
  const [value, setValue] = useState(classification ?? '');
  const [type, setType] = useState(projectType ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setValue(classification ?? ''), [classification]);
  useEffect(() => setType(projectType ?? ''), [projectType]);

  const dirty = value !== (classification ?? '') || type !== (projectType ?? '');
  // Loại công trình cũ nhập tự do có thể không nằm trong danh mục — vẫn giữ làm một lựa chọn.
  const typeOptions: string[] = [...OPPORTUNITY_PROJECT_TYPES];
  if (projectType && !typeOptions.includes(projectType)) typeOptions.unshift(projectType);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await classify.mutateAsync({
        opportunityId,
        classification: value || null,
        projectType: type || null,
      });
      setSaved(true);
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
          Việc của bước này: chọn mức phân loại và loại công trình. Khách M1 — Lưu trữ đứng lại ở
          bước Xác minh để chăm sóc sau.
        </p>
      )}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field
          label="Phân loại"
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
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant={highlight ? 'primary' : 'secondary'}
            disabled={!dirty || classify.isPending}
            onClick={() => void save()}
          >
            Lưu phân loại
          </Button>
          {saved && !dirty && <span className="text-sm text-fg-subtle">Đã lưu.</span>}
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
