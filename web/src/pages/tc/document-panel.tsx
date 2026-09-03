/**
 * Tab Hồ sơ – Bản vẽ của Chi tiết Công trình (NEN-05, NEN-06).
 *
 * Khảo sát Chỉ huy – Giám sát công trường 02/09/2026 xếp đây là vướng mắc số MỘT: "bản vẽ và
 * chỉ đạo được gửi qua nhiều nhóm Zalo; chưa có danh mục kiểm soát phiên bản; người giao việc
 * chưa xác nhận rõ bản vẽ nào đang có hiệu lực" — và hậu quả là một phần công việc đã thi công
 * phải tháo dỡ làm lại.
 *
 * Nên màn hình này có đúng MỘT nhiệm vụ: trả lời "bản nào đang dùng được" trong một cái liếc.
 * Bản đang hiệu lực đứng riêng, có nhãn; bản cũ nằm dưới, xám, kèm chữ "không còn hiệu lực" —
 * không chỉ khác màu, vì màu không phải cách duy nhất được phép truyền đạt thông tin
 * (Content Guidelines 6.8).
 */

import { useState, type FormEvent } from 'react';
import { FileText } from 'lucide-react';
import {
  BUTTONS,
  SITE_DOCUMENT_CATEGORIES,
  SITE_DOCUMENT_CATEGORY_LABELS,
  formatDate,
  type SiteDocumentCategory,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CardGridSkeleton, EmptyState } from '@/components/ui/states';
import {
  useSiteDocuments,
  usePublishSiteDocumentVersion,
  type SiteDocumentRecord,
} from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';

const EM_DASH = '—';

export function SiteDocumentPanel({
  siteId,
  companyId,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: documents, isLoading } = useSiteDocuments(siteId);
  const publish = usePublishSiteDocumentVersion();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** `null` = đang soạn tài liệu mới; chuỗi = phát hành bản mới cho tài liệu đã có. */
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [form, setForm] = useState({
    title: '',
    category: SITE_DOCUMENT_CATEGORIES[0] as SiteDocumentCategory,
    fileName: '',
    changeReason: '',
  });

  const list = documents ?? [];
  const editing = target !== undefined;
  const existing = typeof target === 'string' ? list.find((d) => d.id === target) : undefined;

  function openNew() {
    setError(null);
    setNotice(null);
    setTarget(null);
    setForm({
      title: '',
      category: SITE_DOCUMENT_CATEGORIES[0] as SiteDocumentCategory,
      fileName: '',
      changeReason: '',
    });
  }

  function openRevision(doc: SiteDocumentRecord) {
    setError(null);
    setNotice(null);
    setTarget(doc.id);
    setForm({
      title: doc.title,
      category: doc.category as SiteDocumentCategory,
      fileName: '',
      changeReason: '',
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!existing && !form.title.trim()) {
      setError('Vui lòng nhập tên hồ sơ.');
      return;
    }
    if (!form.fileName.trim()) {
      setError('Vui lòng nhập tên tệp của bản này.');
      return;
    }
    // Từ bản thứ hai trở đi phải nêu nguyên nhân (NEN-05). Cơ sở dữ liệu cũng chặn — ở đây
    // chặn sớm để người dùng biết ngay tại ô nhập thay vì sau khi bấm lưu.
    if (existing && !form.changeReason.trim()) {
      setError('Vui lòng nêu nguyên nhân thay đổi so với bản đang hiệu lực.');
      return;
    }

    try {
      await publish.mutateAsync({
        siteId,
        companyId,
        documentId: existing?.id ?? null,
        title: form.title.trim(),
        category: form.category,
        fileName: form.fileName.trim(),
        changeReason: form.changeReason.trim() || null,
      });
      setNotice(
        existing
          ? `Đã phát hành bản mới của “${existing.title}”. Bản trước chuyển sang không còn hiệu lực.`
          : 'Đã đưa hồ sơ vào kho hồ sơ của công trình.',
      );
      setTarget(undefined);
    } catch (e) {
      setError(toUserMessage(e, existing ? 'edit' : 'create'));
    }
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle">
          Bản đang hiệu lực là bản duy nhất được dùng để thi công. Bản cũ vẫn giữ lại để tra cứu và
          đối chiếu khi nghiệm thu.
        </p>
        {!readOnly && !editing && (
          <Button variant="secondary" onClick={openNew}>
            Thêm hồ sơ
          </Button>
        )}
      </div>

      {isLoading ? (
        <CardGridSkeleton count={2} />
      ) : list.length === 0 ? (
        <EmptyState
          message={
            readOnly
              ? 'Công trình này chưa có hồ sơ nào trong kho hồ sơ.'
              : 'Chưa có hồ sơ nào của công trình. Thêm bản vẽ thi công, biện pháp thi công và tiến độ để cả công trường dùng chung một bản.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((doc) => {
            const current = doc.versions.find((v) => v.is_current_version);
            const superseded = doc.versions.filter((v) => !v.is_current_version);

            return (
              <li key={doc.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                      {doc.title}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {SITE_DOCUMENT_CATEGORY_LABELS[doc.category as SiteDocumentCategory] ??
                        doc.category}
                    </p>
                  </div>
                  {!readOnly && (
                    <Button variant="secondary" size="sm" onClick={() => openRevision(doc)}>
                      Phát hành bản mới
                    </Button>
                  )}
                </div>

                {current ? (
                  <div className="mt-3 rounded-sm bg-status-completed-bg px-3 py-2">
                    <p className="text-status-completed">
                      <strong>Đang hiệu lực — bản {current.version}</strong> · {current.file_name}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      Phát hành {current.published_at ? formatDate(current.published_at) : EM_DASH}
                      {current.publisher ? ` · ${current.publisher.full_name}` : ''}
                      {current.change_reason ? ` · ${current.change_reason}` : ''}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-fg-subtle">Chưa có bản nào được phát hành.</p>
                )}

                {superseded.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-fg-subtle">
                      {superseded.length} bản cũ — không còn hiệu lực, không dùng để thi công
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {superseded.map((v) => (
                        <li key={v.id} className="text-xs text-fg-subtle">
                          Bản {v.version} · {v.file_name} ·{' '}
                          {v.published_at ? formatDate(v.published_at) : EM_DASH}
                          {v.change_reason ? ` · ${v.change_reason}` : ''}
                          {' · '}
                          <span className="font-medium">Không còn hiệu lực</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <form
          onSubmit={submit}
          className="rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <p className="mb-3 font-medium">
            {existing ? `Phát hành bản mới — ${existing.title}` : 'Thêm hồ sơ của công trình'}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {!existing && (
              <>
                <Field label="Tên hồ sơ" required>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>

                <Field label="Loại hồ sơ">
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as SiteDocumentCategory })
                    }
                    className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
                  >
                    {SITE_DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {SITE_DOCUMENT_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            <Field label="Tên tệp" required>
              <Input
                value={form.fileName}
                onChange={(e) => setForm({ ...form, fileName: e.target.value })}
              />
            </Field>

            {existing && (
              <Field label="Nguyên nhân thay đổi" required>
                <Input
                  value={form.changeReason}
                  onChange={(e) => setForm({ ...form, changeReason: e.target.value })}
                />
              </Field>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={publish.isPending}>
              {publish.isPending ? 'Đang lưu…' : 'Phát hành'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setTarget(undefined)}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
