/**
 * Trang KHÁCH xem bộ mẫu công trình — không cần đăng nhập (Đợt 1 — 1H).
 *
 * Dữ liệu đến từ Worker `GET /public/showcase/:token` — chỉ các mẫu trong link, ảnh bằng đường dẫn
 * ký ngắn hạn, không giá, không tên chủ nhà, chỉ khu vực. Link hết hạn hoặc bị thu hồi thì nói
 * thẳng và chỉ người gửi để xin link mới. Giao diện tối giản cho điện thoại: khách mở từ Zalo.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { formatDate, type ShowcaseKind } from '@nvg/shared';
import { BrandLogo } from '@/components/layout/brand-logo';
import { cn } from '@/lib/utils';
import { CoverImage, placeLine, specLine } from './showcase-shared';

const BASE = (import.meta.env.VITE_DESIGN_API_URL ?? '').replace(/\/+$/, '');

interface PublicMedia {
  id: string;
  kind: string;
  caption: string | null;
  url: string | null;
}

interface PublicItem {
  id: string;
  sample_code: string | null;
  title: string;
  kind: ShowcaseKind;
  style: string | null;
  floors: number | null;
  bedrooms: number | null;
  land_area: number | null;
  frontage: number | null;
  depth: number | null;
  building_area: number | null;
  span: number | null;
  location_area: string | null;
  completed_year: number | null;
  description: string | null;
  cover_media_id: string | null;
  media: PublicMedia[];
}

interface PublicPayload {
  status: 'ok' | 'expired' | 'not_found' | 'error';
  title?: string | null;
  note?: string | null;
  expires_at?: string;
  sender_name?: string | null;
  sender_phone?: string | null;
  company_name?: string | null;
  items?: PublicItem[];
}

export function PublicShowcasePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${BASE}/public/showcase/${token}`)
      .then((r) => r.json() as Promise<PublicPayload>)
      .catch(() => ({ status: 'error' }) as PublicPayload)
      .then((d) => {
        if (!cancelled) setData(d);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-surface-sunken">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <BrandLogo variant="compact" className="w-28" />
          {data?.company_name && (
            <span className="text-sm text-fg-subtle">{data.company_name}</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!data ? (
          <p className="text-fg-subtle">Đang mở bộ mẫu…</p>
        ) : data.status !== 'ok' ? (
          <div className="rounded-card bg-surface p-6 text-center">
            <p className="text-lg font-semibold">
              {data.status === 'expired'
                ? 'Link xem mẫu đã hết hạn'
                : data.status === 'error'
                  ? 'Chưa mở được bộ mẫu'
                  : 'Không tìm thấy bộ mẫu'}
            </p>
            <p className="mt-2 text-fg-subtle">
              {data.status === 'error'
                ? 'Kiểm tra kết nối mạng rồi tải lại trang.'
                : 'Liên hệ nhân viên Nhà Việt đã gửi link để nhận link mới.'}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold">{data.title || 'Mẫu công trình Nhà Việt'}</h1>
            {data.note && <p className="mt-2 whitespace-pre-wrap">{data.note}</p>}
            <p className="mt-2 text-sm text-fg-subtle">
              {data.sender_name && <>Gửi bởi {data.sender_name}</>}
              {data.expires_at && <> · xem được tới {formatDate(data.expires_at)}</>}
            </p>
            {data.sender_phone && (
              <a
                href={`tel:${data.sender_phone.replace(/\s/g, '')}`}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-sm bg-brand px-4 font-semibold text-fg-inverse"
              >
                <Phone className="size-4" aria-hidden />
                Gọi {data.sender_name ?? 'nhân viên tư vấn'}
              </a>
            )}
            <ol className="mt-6 space-y-8">
              {(data.items ?? []).map((item) => (
                <PublicItemCard key={item.id} item={item} />
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}

function PublicItemCard({ item }: { item: PublicItem }) {
  const first = item.media.find((m) => m.id === item.cover_media_id) ?? item.media[0];
  const [active, setActive] = useState<string | undefined>(first?.id);
  const shown = item.media.find((m) => m.id === active) ?? first;
  return (
    <li className="overflow-hidden rounded-card bg-surface">
      <CoverImage
        src={shown?.url ?? undefined}
        alt={shown?.caption ?? item.title}
        className="aspect-[4/3] w-full bg-surface-sunken object-contain"
      />
      {item.media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-2">
          {item.media.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActive(m.id)}
              className={cn(
                'shrink-0 overflow-hidden rounded-sm border-2',
                m.id === shown?.id ? 'border-brand' : 'border-transparent',
              )}
              aria-label={m.caption ?? 'Ảnh khác'}
            >
              <CoverImage src={m.url ?? undefined} alt={m.caption ?? ''} className="h-14 w-20" />
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold">{item.title}</h2>
          {item.sample_code && (
            <span className="font-mono text-xs text-fg-subtle">{item.sample_code}</span>
          )}
        </div>
        <p className="text-sm text-fg-subtle">{specLine(item)}</p>
        {placeLine(item) && <p className="text-sm text-fg-subtle">{placeLine(item)}</p>}
        {shown?.caption && <p className="text-sm">{shown.caption}</p>}
        {item.description && <p className="whitespace-pre-wrap pt-2">{item.description}</p>}
      </div>
    </li>
  );
}
