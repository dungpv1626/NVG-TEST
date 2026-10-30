/**
 * Trang KHÁCH xem «Bộ ý tưởng» ngôi nhà — không cần đăng nhập (B5, migration 0259).
 *
 * Dữ liệu từ Worker `GET /public/concept/:token`: tiêu đề trung tính (loại nhà, khổ lô, số tầng — không tên khách), danh
 * sách ảnh; byte ảnh qua `/public/concept/:token/image/:key` (Worker kiểm link mỗi lần). Không kích thước, không bản vẽ
 * kỹ thuật, không nút tải về. Câu «Phương án ý tưởng — chưa phải thiết kế» luôn hiện ở đầu trang và trên từng ảnh — là
 * CHỮ của trang, không in vào ảnh (T154). Chặn chuột phải / kéo ảnh chỉ là rào nhẹ: ảnh đã hiện trên màn hình thì người
 * xem vẫn chụp được.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { formatDate } from '@nvg/shared';
import { BrandLogo } from '@/components/layout/brand-logo';

const BASE = (import.meta.env.VITE_DESIGN_API_URL ?? '').replace(/\/+$/, '');

export const CONCEPT_CAPTION = 'Phương án ý tưởng — chưa phải thiết kế';

type Group = 'mat-dung' | 'phoi-canh' | 'phong' | 'so-do';

export interface ConceptPayload {
  status: 'ok' | 'expired' | 'not_found' | 'error';
  title?: string;
  note?: string | null;
  expires_at?: string;
  sender_name?: string | null;
  sender_phone?: string | null;
  company_name?: string | null;
  images?: Array<{ key: string; group: Group; label: string }>;
}

const GROUPS: Array<{ id: Group; title: string }> = [
  { id: 'phoi-canh', title: 'Phối cảnh' },
  { id: 'mat-dung', title: 'Mặt đứng' },
  { id: 'phong', title: 'Không gian bên trong' },
  { id: 'so-do', title: 'Bố trí công năng' },
];

const block = (e: { preventDefault: () => void }) => e.preventDefault();

function ConceptImage({ token, image }: { token: string; image: { key: string; label: string } }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="overflow-hidden rounded-card bg-surface">
      <div className="relative select-none" onContextMenu={block} onDragStart={block}>
        {failed ? (
          <div className="flex aspect-video items-center justify-center p-4 text-center text-sm text-fg-subtle">
            Chưa hiện được ảnh này — tải lại trang để thử lại.
          </div>
        ) : (
          <img
            src={`${BASE}/public/concept/${token}/image/${image.key}`}
            alt={image.label}
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
            className="pointer-events-none block h-auto w-full"
          />
        )}
        <span className="absolute bottom-2 left-2 rounded bg-shell px-2 py-1 text-xs font-medium text-shell-fg">
          {CONCEPT_CAPTION}
        </span>
      </div>
      <figcaption className="px-3 py-2 text-sm">{image.label}</figcaption>
    </figure>
  );
}

export function ConceptView({ token, data }: { token: string; data: ConceptPayload | null }) {
  if (!data) return <p className="text-fg-subtle">Đang mở phương án…</p>;
  if (data.status !== 'ok') {
    return (
      <div className="rounded-card bg-surface p-6 text-center">
        <p className="text-lg font-semibold">
          {data.status === 'expired'
            ? 'Link xem phương án đã hết hạn'
            : data.status === 'error'
              ? 'Chưa mở được phương án'
              : 'Không tìm thấy phương án'}
        </p>
        <p className="mt-2 text-fg-subtle">
          {data.status === 'error'
            ? 'Kiểm tra kết nối mạng rồi tải lại trang.'
            : 'Liên hệ nhân viên Nhà Việt đã gửi link để nhận link mới.'}
        </p>
        {data.sender_phone && (
          <a
            href={`tel:${data.sender_phone}`}
            className="mt-4 inline-flex min-h-10 items-center gap-2 font-medium text-brand"
          >
            <Phone className="size-4" aria-hidden />
            Gọi {data.sender_name ?? 'nhân viên'}: {data.sender_phone}
          </a>
        )}
      </div>
    );
  }
  const images = data.images ?? [];
  return (
    <>
      <h1 className="text-xl font-semibold">{data.title}</h1>
      {data.expires_at && (
        <p className="mt-1 text-sm text-fg-subtle">Link mở tới {formatDate(data.expires_at)}</p>
      )}
      {data.note && <p className="mt-3">{data.note}</p>}
      <p className="mt-3 text-sm text-fg-subtle">
        Đây là phương án ý tưởng để hình dung ngôi nhà. Kích thước, kết cấu, vật liệu và chi phí sẽ
        được kiến trúc sư tính toán ở bước thiết kế.
      </p>
      {images.length === 0 ? (
        <p className="mt-6 text-fg-subtle">Phương án chưa có ảnh nào để xem.</p>
      ) : (
        GROUPS.map((g) => {
          const items = images.filter((i) => i.group === g.id);
          if (!items.length) return null;
          return (
            <section key={g.id} className="mt-6">
              <h2 className="mb-3 text-base font-semibold">{g.title}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((image) => (
                  <ConceptImage key={image.key} token={token} image={image} />
                ))}
              </div>
            </section>
          );
        })
      )}
      {data.sender_phone && (
        <a
          href={`tel:${data.sender_phone}`}
          className="mt-8 inline-flex min-h-10 items-center gap-2 font-medium text-brand"
        >
          <Phone className="size-4" aria-hidden />
          Trao đổi thêm với {data.sender_name ?? 'nhân viên'}: {data.sender_phone}
        </a>
      )}
    </>
  );
}

export function PublicConceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<ConceptPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${BASE}/public/concept/${token}`)
      .then((r) => r.json() as Promise<ConceptPayload>)
      .catch(() => ({ status: 'error' }) as ConceptPayload)
      .then((d) => {
        if (!cancelled) setData(d);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-surface-sunken" onContextMenu={block}>
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <BrandLogo variant="compact" className="w-28" />
          {data?.company_name && (
            <span className="text-sm text-fg-subtle">{data.company_name}</span>
          )}
        </div>
        <p className="bg-brand-accent px-4 py-1.5 text-center text-sm font-medium text-fg">
          {CONCEPT_CAPTION}
        </p>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <ConceptView token={token} data={data} />
      </main>
    </div>
  );
}
