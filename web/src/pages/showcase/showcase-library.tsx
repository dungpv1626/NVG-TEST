/**
 * Thư viện công trình mẫu (Đợt 1 — 1H).
 *
 * Kinh doanh / Ban Giám đốc lọc mẫu GIỐNG NHU CẦU KHÁCH (loại hình, số tầng, mặt tiền, diện tích
 * đất, phong cách — lọc thường, không AI), tích chọn vài mẫu rồi «Gửi khách» → link xem trực tuyến
 * có thời hạn. Mở từ đầu mối / cơ hội («Gửi mẫu») thì bộ lọc đặt sẵn theo loại công trình và link
 * gắn vào khách đó, kèm một dòng nhật ký chăm sóc.
 *
 * Cả công ty xem; Phòng Thiết kế và Giám đốc thêm / sửa mẫu. Không hiện giá (chủ dự án chốt).
 */

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Plus, Send } from 'lucide-react';
import {
  SHOWCASE_KINDS,
  SHOWCASE_KIND_LABELS,
  formatDate,
  formatDateTime,
  type ShowcaseKind,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  shareUrl,
  useRevokeShare,
  useShowcaseItems,
  useShowcaseShares,
  useShowcaseUrls,
  type ShowcaseItem,
} from '@/hooks/use-showcase';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CoverImage, placeLine, specLine } from './showcase-shared';
import { ShareDialog } from './share-dialog';

const SELECT_CLASS = 'h-9 rounded-sm border border-border-strong bg-surface px-2';

/** Phòng Thiết kế, TGĐ, Ban Giám đốc — gương `auth_edits_showcase` (0179). */
export function useCanEditShowcase(): boolean {
  const { profile } = useAuth();
  return Boolean(profile?.assignments.some((a) => ['TKE', 'TGD', 'BGD'].includes(a.roleCode)));
}

function coverPath(item: ShowcaseItem): string | undefined {
  const cover = item.media.find((m) => m.id === item.cover_media_id) ?? item.media[0];
  return cover?.storage_path;
}

export function ShowcaseLibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'link' ? 'link' : 'mau';
  const subject = {
    leadId: params.get('dau-moi') ?? undefined,
    opportunityId: params.get('co-hoi') ?? undefined,
    customerId: params.get('khach-hang') ?? undefined,
  };
  const forName = params.get('cho');
  const canEdit = useCanEditShowcase();

  const [kind, setKind] = useState<'' | ShowcaseKind>((params.get('loai') as ShowcaseKind) ?? '');
  const [floors, setFloors] = useState('');
  const [frontMin, setFrontMin] = useState('');
  const [frontMax, setFrontMax] = useState('');
  const [query, setQuery] = useState('');
  // «Gửi khách» từ trang chi tiết một mẫu: chọn sẵn mẫu đó.
  const [selected, setSelected] = useState<string[]>(() => {
    const pre = params.get('chon');
    return pre ? [pre] : [];
  });
  const [sharing, setSharing] = useState(false);

  const items = useShowcaseItems();
  const filtered = useMemo(() => {
    const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);
    const fMin = num(frontMin);
    const fMax = num(frontMax);
    const fl = num(floors);
    const q = query.trim().toLocaleLowerCase('vi');
    return (items.data ?? []).filter(
      (i) =>
        (!kind || i.kind === kind) &&
        (fl === null || i.floors === fl) &&
        (fMin === null || (i.frontage ?? 0) >= fMin) &&
        (fMax === null || (i.frontage !== null && i.frontage <= fMax)) &&
        (!q ||
          `${i.title} ${i.sample_code ?? ''} ${i.style ?? ''} ${i.location_area ?? ''}`
            .toLocaleLowerCase('vi')
            .includes(q)),
    );
  }, [items.data, kind, floors, frontMin, frontMax, query]);

  const paths = filtered.map(coverPath).filter((p): p is string => Boolean(p));
  const urls = useShowcaseUrls(paths);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <>
      <PageHeader
        title="Mẫu công trình"
        description="Công trình đã làm để chào khách — chọn vài mẫu giống nhu cầu rồi gửi link xem trực tuyến."
        breadcrumbs={[{ label: 'Mẫu công trình' }]}
        actions={
          canEdit ? (
            <Button variant="secondary" asChild>
              <Link to="/mau-cong-trinh/tao-moi">
                <Plus />
                Thêm mẫu
              </Link>
            </Button>
          ) : undefined
        }
      />

      <nav className="mb-4 flex gap-1 border-b border-border" aria-label="Màn hình trong thư viện">
        {[
          { id: 'mau', label: 'Thư viện mẫu' },
          { id: 'link', label: 'Link đã gửi' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params);
              if (t.id === 'mau') next.delete('tab');
              else next.set('tab', t.id);
              setParams(next, { replace: true });
            }}
            className={cn(
              '-mb-px border-b-2 px-3 py-2',
              tab === t.id
                ? 'border-brand font-semibold text-brand'
                : 'border-transparent text-fg-subtle hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'link' ? (
        <SharesTab />
      ) : (
        <>
          {forName && (
            <p className="mb-3 rounded-sm bg-brand-subtle px-3 py-2 text-brand-forest">
              Đang chọn mẫu để gửi cho <strong>{forName}</strong> — link sẽ ghi vào nhật ký chăm sóc
              của khách.
            </p>
          )}
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-subtle">Loại hình</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as '' | ShowcaseKind)}
                className={SELECT_CLASS}
              >
                <option value="">Tất cả</option>
                {SHOWCASE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SHOWCASE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-24 flex-col gap-1">
              <span className="text-xs text-fg-subtle">Số tầng</span>
              <Input
                value={floors}
                inputMode="numeric"
                onChange={(e) => setFloors(e.target.value)}
              />
            </label>
            <label className="flex w-28 flex-col gap-1">
              <span className="text-xs text-fg-subtle">Mặt tiền từ (m)</span>
              <Input
                value={frontMin}
                inputMode="decimal"
                onChange={(e) => setFrontMin(e.target.value)}
              />
            </label>
            <label className="flex w-28 flex-col gap-1">
              <span className="text-xs text-fg-subtle">đến (m)</span>
              <Input
                value={frontMax}
                inputMode="decimal"
                onChange={(e) => setFrontMax(e.target.value)}
              />
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-1">
              <span className="text-xs text-fg-subtle">Tìm</span>
              <Input
                value={query}
                placeholder="Tên, mã mẫu, phong cách, khu vực"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          {items.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-64" />
              ))}
            </div>
          ) : items.error ? (
            <ErrorState message={toUserMessage(items.error)} onRetry={() => void items.refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              message={
                (items.data ?? []).length === 0
                  ? 'Thư viện chưa có mẫu nào. Phòng Thiết kế đưa công trình đã làm vào đây để Kinh doanh chào khách.'
                  : 'Không có mẫu nào khớp bộ lọc — nới bộ lọc để xem thêm.'
              }
            />
          ) : (
            <ul className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => {
                const on = selected.includes(item.id);
                const path = coverPath(item);
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'overflow-hidden rounded-lg border bg-surface shadow-card',
                      on ? 'border-brand ring-2 ring-brand' : 'border-border',
                    )}
                  >
                    <Link to={`/mau-cong-trinh/${item.id}`} className="block">
                      <CoverImage
                        src={path ? urls.data?.[path] : undefined}
                        alt={item.title}
                        className="aspect-[4/3] w-full"
                      />
                    </Link>
                    <div className="space-y-1 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/mau-cong-trinh/${item.id}`}
                          className="font-semibold hover:underline"
                        >
                          {item.title}
                        </Link>
                        {item.sample_code && (
                          <span className="shrink-0 font-mono text-xs text-fg-subtle">
                            {item.sample_code}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-fg-subtle">{specLine(item)}</p>
                      {placeLine(item) && (
                        <p className="text-xs text-fg-subtle">{placeLine(item)}</p>
                      )}
                      {item.deletion_requested_at && (
                        <p className="text-xs text-status-pending">Đang chờ Giám đốc đồng ý xoá</p>
                      )}
                      <Button
                        size="sm"
                        variant={on ? 'primary' : 'secondary'}
                        onClick={() => toggle(item.id)}
                        className="mt-1 w-full"
                        aria-pressed={on}
                      >
                        {on ? <Check /> : null}
                        {on ? 'Đã chọn' : 'Chọn để gửi khách'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {selected.length > 0 && (
            <div className="fixed inset-x-0 bottom-16 z-20 flex justify-center px-4 lg:bottom-6">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2 shadow-overlay">
                <span>Đã chọn {selected.length} mẫu</span>
                <Button variant="subtle" size="sm" onClick={() => setSelected([])}>
                  Bỏ chọn
                </Button>
                <Button variant="primary" onClick={() => setSharing(true)}>
                  <Send />
                  Gửi khách
                </Button>
              </div>
            </div>
          )}

          {sharing && (
            <ShareDialog
              itemIds={selected}
              subject={subject}
              forName={forName}
              onClose={() => setSharing(false)}
              onCreated={() => setSelected([])}
            />
          )}
        </>
      )}
    </>
  );
}

function SharesTab() {
  const shares = useShowcaseShares();
  const revoke = useRevokeShare();
  const [copied, setCopied] = useState<string | null>(null);
  if (shares.isLoading) return <Skeleton className="h-32" />;
  if (shares.error) return <ErrorState message={toUserMessage(shares.error)} />;
  const list = shares.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState message="Chưa gửi link mẫu nào. Chọn mẫu ở tab Thư viện mẫu rồi bấm «Gửi khách»." />
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {list.map((s) => {
        const expired = new Date(s.expires_at).getTime() <= Date.now();
        const state = s.revoked_at ? 'Đã thu hồi' : expired ? 'Hết hạn' : 'Đang mở';
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title || `${s.item_ids.length} mẫu công trình`}</p>
              <p className="text-xs text-fg-subtle">
                Gửi {formatDateTime(s.created_at)} · {s.creator?.full_name ?? 'Không rõ'} · hạn{' '}
                {formatDate(s.expires_at)} · {s.item_ids.length} mẫu
              </p>
            </div>
            <span className="text-sm">
              {s.views.length > 0 ? `Khách đã mở ${s.views.length} lần` : 'Khách chưa mở'}
            </span>
            <span
              className={cn(
                'text-xs font-semibold',
                state === 'Đang mở' ? 'text-status-completed' : 'text-fg-subtle',
              )}
            >
              {state}
            </span>
            {state === 'Đang mở' && (
              <>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(shareUrl(s.token))
                      .then(() => setCopied(s.id))
                  }
                >
                  {copied === s.id ? 'Đã chép link' : 'Chép link'}
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(s.id)}
                >
                  Thu hồi
                </Button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
