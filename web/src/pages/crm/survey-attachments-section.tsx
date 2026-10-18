/**
 * Ảnh / video hiện trạng, ảnh phiếu khảo sát giấy, tài liệu khách gửi — trong thẻ biên bản
 * khảo sát Kinh doanh (0180, chủ dự án 18/10/2026).
 *
 * Nút «Chụp ảnh» mở thẳng máy ảnh trên điện thoại (`capture`), luôn hiện cạnh nút tải tệp
 * (AFD 4.8: nút chụp ảnh không ẩn sau menu). Báo cáo đã gửi duyệt thì khoá thêm / xoá — Ban Giám
 * đốc duyệt đúng bộ ảnh đang thấy (CSDL cũng chặn, `rls_survey_writable`).
 */

import { useRef, useState } from 'react';
import { Camera, FileText, FileUp, ScrollText, Trash2 } from 'lucide-react';
import {
  SURVEY_ATTACHMENT_KINDS,
  SURVEY_ATTACHMENT_KIND_LABELS,
  type SurveyAttachmentKind,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  isPreviewableImage,
  SURVEY_ATTACHMENT_ACCEPT,
  useDeleteSurveyAttachment,
  useSurveyAttachments,
  useUpdateSurveyAttachment,
  useUploadSurveyAttachments,
  type SurveyAttachment,
} from '@/hooks/use-survey-attachments';

function sizeLabel(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function SurveyAttachmentsSection({
  surveyId,
  canEdit,
}: {
  surveyId: string;
  canEdit: boolean;
}) {
  const { data: items = [], isLoading } = useSurveyAttachments(surveyId);
  const upload = useUploadSurveyAttachments();
  const update = useUpdateSurveyAttachment();
  const remove = useDeleteSurveyAttachment();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const paperRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SurveyAttachment | null>(null);

  if (isLoading) return null;
  if (!canEdit && items.length === 0) return null;

  async function onFiles(input: HTMLInputElement, kind?: SurveyAttachmentKind) {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    setError(null);
    setMessage(null);
    try {
      const { uploaded, skipped } = await upload.mutateAsync({ surveyId, files, kind });
      setMessage(
        `Đã tải lên ${uploaded} tệp.` +
          (skipped.length ? ` Bỏ qua vì quá 50 MB: ${skipped.join(', ')}.` : ''),
      );
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  const images = items.filter((a) => a.url && isPreviewableImage(a.mime_type));
  const files = items.filter((a) => !images.includes(a));

  return (
    <section className="mt-4 border-t border-border pt-3" aria-label="Ảnh và tài liệu">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Ảnh và tài liệu{items.length > 0 && ` (${items.length})`}</h4>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={upload.isPending}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera />
              Chụp ảnh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp />
              {upload.isPending ? 'Đang tải lên…' : 'Tải tệp lên'}
            </Button>
            <Button
              variant="subtle"
              size="sm"
              disabled={upload.isPending}
              onClick={() => paperRef.current?.click()}
            >
              <ScrollText />
              Tải phiếu giấy
            </Button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void onFiles(e.target, 'anh')}
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={SURVEY_ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(e) => void onFiles(e.target)}
            />
            <input
              ref={paperRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf"
              className="hidden"
              onChange={(e) => void onFiles(e.target, 'phieu')}
            />
          </div>
        )}
      </div>

      {canEdit && items.length === 0 && (
        <p className="mt-1 text-sm text-fg-subtle">
          Chụp ảnh hiện trạng, tải tài liệu khách gửi (PDF, Word, Excel, bản vẽ), hoặc ảnh phiếu
          khảo sát giấy đã điền tay.
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-status-completed">
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}

      {images.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((a) => (
            <li key={a.id} className="space-y-1">
              <a href={a.url!} target="_blank" rel="noreferrer" className="block">
                <img
                  src={a.url!}
                  alt={a.caption ?? a.file_name}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-sm border border-border object-cover"
                />
              </a>
              <ItemMeta
                item={a}
                canEdit={canEdit}
                onKind={(kind) => update.mutate({ id: a.id, kind })}
                onCaption={(caption) => update.mutate({ id: a.id, caption })}
                onDelete={() => setDeleting(a)}
              />
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start gap-2 rounded-sm border border-border p-2"
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-medium text-brand hover:underline"
                  >
                    {a.file_name}
                  </a>
                ) : (
                  <span className="break-all font-medium">{a.file_name}</span>
                )}
                <span className="ml-2 text-xs text-fg-subtle">{sizeLabel(a.size_bytes)}</span>
                <ItemMeta
                  item={a}
                  canEdit={canEdit}
                  onKind={(kind) => update.mutate({ id: a.id, kind })}
                  onCaption={(caption) => update.mutate({ id: a.id, caption })}
                  onDelete={() => setDeleting(a)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title="Gỡ tệp này?"
          confirmLabel="Gỡ tệp"
          danger
          pending={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            void remove
              .mutateAsync(deleting)
              .then(() => setDeleting(null))
              .catch((e: unknown) => {
                setDeleting(null);
                setError(toUserMessage(e, 'delete'));
              })
          }
        >
          «{deleting.file_name}» bị xoá khỏi biên bản và khỏi kho tệp, không lấy lại được.
        </ConfirmDialog>
      )}
    </section>
  );
}

function ItemMeta({
  item,
  canEdit,
  onKind,
  onCaption,
  onDelete,
}: {
  item: SurveyAttachment;
  canEdit: boolean;
  onKind: (kind: SurveyAttachmentKind) => void;
  onCaption: (caption: string | null) => void;
  onDelete: () => void;
}) {
  if (!canEdit) {
    return (
      <p className="text-xs text-fg-subtle">
        {SURVEY_ATTACHMENT_KIND_LABELS[item.kind]}
        {item.caption && ` — ${item.caption}`}
      </p>
    );
  }
  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-1">
        <select
          value={item.kind}
          onChange={(e) => onKind(e.target.value as SurveyAttachmentKind)}
          aria-label="Loại tệp"
          className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-surface px-1 text-xs"
        >
          {SURVEY_ATTACHMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {SURVEY_ATTACHMENT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Gỡ ${item.file_name}`}
          className="flex size-8 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-hover hover:text-status-overdue"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      <input
        defaultValue={item.caption ?? ''}
        placeholder="Chú thích"
        aria-label="Chú thích"
        className="h-8 w-full rounded-sm border border-border bg-surface px-2 text-xs"
        onBlur={(e) => {
          const next = e.target.value.trim() || null;
          if (next !== item.caption) onCaption(next);
        }}
      />
    </div>
  );
}
