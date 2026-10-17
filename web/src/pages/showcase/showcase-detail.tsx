/**
 * Chi tiết mẫu công trình (Đợt 1 — 1H): ảnh, thông số, và — với Phòng Thiết kế / Giám đốc — thêm
 * ảnh, chọn ảnh bìa, gỡ ảnh, sửa, xoá. Xoá: Giám đốc xoá ngay; Thiết kế gửi đề nghị, chờ Giám đốc
 * đồng ý ở Hộp thư Phê duyệt (chủ dự án chốt).
 */

import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImagePlus, Pencil, Send, Star, Trash2 } from 'lucide-react';
import {
  SHOWCASE_MEDIA_KINDS,
  SHOWCASE_MEDIA_KIND_LABELS,
  formatDateTime,
  type ShowcaseMediaKind,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useDeleteShowcaseMedia,
  useRequestShowcaseDeletion,
  useSetShowcaseCover,
  useShowcaseItem,
  useShowcaseUrls,
  useUploadShowcaseMedia,
} from '@/hooks/use-showcase';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CoverImage, placeLine, specLine } from './showcase-shared';
import { useCanEditShowcase } from './showcase-library';

export function ShowcaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: item, isLoading, error } = useShowcaseItem(id);
  const canEdit = useCanEditShowcase();
  const isDirector = Boolean(
    profile?.assignments.some((a) => a.roleCode === 'TGD' || a.roleCode === 'BGD'),
  );
  const urls = useShowcaseUrls((item?.media ?? []).map((m) => m.storage_path));
  const upload = useUploadShowcaseMedia();
  const removeMedia = useDeleteShowcaseMedia();
  const setCover = useSetShowcaseCover();
  const requestDelete = useRequestShowcaseDeletion();
  const prompt = usePromptDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mediaKind, setMediaKind] = useState<ShowcaseMediaKind>('anh_thuc_te');
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={2} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!item) {
    return (
      <RecordNotFound
        entity="mẫu công trình"
        listPath="/mau-cong-trinh"
        listLabel="Quay lại thư viện mẫu"
      />
    );
  }

  const shown =
    item.media.find((m) => m.id === active) ??
    item.media.find((m) => m.id === item.cover_media_id) ??
    item.media[0];

  async function run(action: () => Promise<unknown>, done?: string) {
    setActionError(null);
    setMessage(null);
    try {
      await action();
      if (done) setMessage(done);
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  async function onDelete() {
    const reason = await prompt.ask({
      title: isDirector ? 'Xoá mẫu này?' : 'Đề nghị xoá mẫu?',
      label: 'Lý do xoá',
      detail: isDirector
        ? 'Mẫu rời thư viện; các link đã gửi không còn hiện mẫu này.'
        : 'Đề nghị gửi tới Giám đốc. Giám đốc đồng ý thì mẫu mới rời thư viện.',
      confirmLabel: isDirector ? 'Xoá mẫu' : 'Gửi đề nghị',
      danger: true,
    });
    if (!reason) return;
    await run(async () => {
      const res = await requestDelete.mutateAsync({ itemId: item!.id, reason });
      if (res === 'deleted') void navigate('/mau-cong-trinh', { replace: true });
    }, 'Đã gửi đề nghị xoá tới Giám đốc.');
  }

  return (
    <>
      {prompt.dialog}
      <PageHeader
        title={item.title}
        description={specLine(item)}
        breadcrumbs={[{ label: 'Mẫu công trình', to: '/mau-cong-trinh' }, { label: item.title }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" asChild>
              <Link to={`/mau-cong-trinh?chon=${item.id}`}>
                <Send />
                Gửi khách
              </Link>
            </Button>
            {canEdit && (
              <>
                <Button variant="secondary" asChild>
                  <Link to={`/mau-cong-trinh/${item.id}/sua`}>
                    <Pencil />
                    Sửa
                  </Link>
                </Button>
                {!item.deletion_requested_at && (
                  <Button variant="secondary" onClick={() => void onDelete()}>
                    <Trash2 />
                    {isDirector ? 'Xoá' : 'Đề nghị xoá'}
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      {item.deletion_requested_at && (
        <p className="mb-3 rounded-sm bg-status-pending-bg px-3 py-2 text-status-pending">
          Đang chờ Giám đốc đồng ý xoá (đề nghị {formatDateTime(item.deletion_requested_at)}):{' '}
          {item.deletion_reason}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}
      {message && (
        <p role="status" className="mb-3 text-status-completed">
          {message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <CoverImage
            src={shown ? urls.data?.[shown.storage_path] : undefined}
            alt={shown?.caption ?? item.title}
            className="aspect-[4/3] w-full rounded-lg border border-border object-contain"
          />
          {item.media.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {item.media.map((m) => (
                <li key={m.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setActive(m.id)}
                    className={cn(
                      'block overflow-hidden rounded-sm border-2',
                      m.id === shown?.id ? 'border-brand' : 'border-transparent',
                    )}
                    aria-label={`${SHOWCASE_MEDIA_KIND_LABELS[m.kind]} ${m.caption ?? ''}`}
                  >
                    <CoverImage
                      src={urls.data?.[m.storage_path]}
                      alt={m.caption ?? ''}
                      className="h-16 w-24"
                    />
                  </button>
                  {m.id === item.cover_media_id && (
                    <Star
                      className="absolute right-1 top-1 size-4 fill-brand-accent text-brand-accent"
                      aria-label="Ảnh bìa"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={mediaKind}
                onChange={(e) => setMediaKind(e.target.value as ShowcaseMediaKind)}
                className="h-9 rounded-sm border border-border-strong bg-surface px-2"
                aria-label="Loại ảnh"
              >
                {SHOWCASE_MEDIA_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SHOWCASE_MEDIA_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                disabled={upload.isPending}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus />
                {upload.isPending ? 'Đang tải ảnh…' : 'Thêm ảnh'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = '';
                  if (files.length) {
                    void run(
                      () =>
                        upload.mutateAsync({
                          itemId: item.id,
                          files,
                          kind: mediaKind,
                          start: item.media.length,
                        }),
                      `Đã thêm ${files.length} ảnh.`,
                    );
                  }
                }}
              />
              {shown && shown.id !== item.cover_media_id && (
                <Button
                  variant="subtle"
                  onClick={() =>
                    void run(() => setCover.mutateAsync({ itemId: item.id, mediaId: shown.id }))
                  }
                >
                  <Star />
                  Làm ảnh bìa
                </Button>
              )}
              {shown && (
                <Button
                  variant="subtle"
                  onClick={() => void run(() => removeMedia.mutateAsync(shown))}
                >
                  <Trash2 />
                  Gỡ ảnh này
                </Button>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <dl className="space-y-2">
            {item.sample_code && <Row label="Mã mẫu" value={item.sample_code} />}
            <Row label="Thông số" value={specLine(item)} />
            {placeLine(item) && <Row label="Khu vực" value={placeLine(item)!} />}
            {item.company && <Row label="Pháp nhân" value={item.company.short_name} />}
          </dl>
          {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
