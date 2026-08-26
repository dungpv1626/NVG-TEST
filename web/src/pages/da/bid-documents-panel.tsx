/**
 * Tab Hồ sơ thầu của Chi tiết Gói thầu (DA-08).
 *
 * Checklist theo đúng chín nhóm PRD DA-08 liệt kê. Nút "Nộp thầu" là hành động chính, và
 * CSDL — không phải màn hình này — là nơi chặn khi giá chưa duyệt hoặc còn đầu mục bắt buộc
 * chưa xong; ở đây chỉ hiển thị lại lý do cho người dùng đọc.
 */

import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import {
  BID_DOCUMENT_CATEGORIES,
  BID_DOCUMENT_CATEGORY_LABELS,
  BUTTONS,
  formatDateTime,
  type BidDocumentCategory,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { useSubmitBid } from '@/hooks/use-bidding-projects';
import { useBidDocuments, useSaveBidDocument } from '@/hooks/use-estimates';
import { toUserMessage } from '@/hooks/use-error-message';

export function BidDocumentsPanel({
  projectId,
  companyId,
  readOnly,
  submittedAt,
}: {
  projectId: string;
  companyId: string;
  readOnly: boolean;
  submittedAt: string | null;
}) {
  const { data: documents } = useBidDocuments(projectId);
  const saveDocument = useSaveBidDocument();
  const submitBid = useSubmitBid();

  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ category: BidDocumentCategory; name: string; required: boolean }>(
    { category: 'phap_ly', name: '', required: true },
  );

  const missing = (documents ?? []).filter((d) => d.is_required && !d.submitted_at).length;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  async function addDocument(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Vui lòng nhập tên đầu mục hồ sơ.');
      return;
    }
    await run(async () => {
      await saveDocument.mutateAsync({
        mode: 'create',
        projectId,
        companyId,
        category: form.category,
        name: form.name.trim(),
        isRequired: form.required,
      });
      setForm({ ...form, name: '' });
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle">
          {submittedAt
            ? `Đã nộp thầu lúc ${formatDateTime(submittedAt)}. Hồ sơ chuyển sang chỉ xem.`
            : missing > 0
              ? `Còn ${missing} đầu mục bắt buộc chưa hoàn thành.`
              : 'Các đầu mục bắt buộc đã hoàn thành.'}
        </p>
        {!readOnly && !submittedAt && (
          <Button
            variant="primary"
            disabled={submitBid.isPending}
            onClick={() => void run(() => submitBid.mutateAsync({ projectId }))}
          >
            Nộp thầu
          </Button>
        )}
      </div>

      {(documents ?? []).length === 0 ? (
        <EmptyState message="Chưa có đầu mục hồ sơ nào. Thêm theo chín nhóm hồ sơ dự thầu để không bỏ sót trước hạn nộp." />
      ) : (
        <ul className="space-y-2">
          {(documents ?? []).map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{doc.name}</p>
                <p className="text-xs text-fg-subtle">
                  {BID_DOCUMENT_CATEGORY_LABELS[doc.category as BidDocumentCategory]}
                  {doc.is_required ? ' · Bắt buộc' : ' · Không bắt buộc'}
                  {doc.submitted_at && ` · Hoàn thành ${formatDateTime(doc.submitted_at)}`}
                </p>
              </div>

              {doc.submitted_at ? (
                <span className="flex items-center gap-1 text-status-completed">
                  <Check className="size-4" />
                  Đã có
                </span>
              ) : readOnly || submittedAt ? (
                <span className="text-fg-subtle">Chưa có</span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void run(() =>
                      saveDocument.mutateAsync({ mode: 'toggle', id: doc.id, submitted: true }),
                    )
                  }
                >
                  Đánh dấu đã có
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && !submittedAt && (
        <form onSubmit={addDocument} className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <p className="mb-3 font-medium">Thêm đầu mục hồ sơ</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nhóm hồ sơ">
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as BidDocumentCategory })
                }
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                {BID_DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {BID_DOCUMENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tên đầu mục" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>

            <Field label="Bắt buộc">
              <select
                value={form.required ? 'yes' : 'no'}
                onChange={(e) => setForm({ ...form, required: e.target.value === 'yes' })}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                <option value="yes">Bắt buộc — thiếu thì không nộp được</option>
                <option value="no">Không bắt buộc</option>
              </select>
            </Field>
          </div>

          <Button type="submit" variant="secondary" className="mt-3" disabled={saveDocument.isPending}>
            {saveDocument.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
        </form>
      )}
    </div>
  );
}
