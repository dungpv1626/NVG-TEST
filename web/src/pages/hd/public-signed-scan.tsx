/**
 * Trang KHÁCH xem bản hợp đồng đã ký — không cần đăng nhập (0189).
 *
 * Dữ liệu từ Worker `GET /public/signed/:token`: chỉ tên, số, ngày ký và đường dẫn ký 1 giờ tới tệp
 * — không giá trị, không điều khoản. Link hết hạn / bị thu hồi thì nói thẳng, chỉ người gửi để xin
 * link mới. Khách thường mở từ Zalo trên điện thoại, mà trình duyệt điện thoại không hiện PDF trong
 * khung — nên các trang PDF được vẽ thành ảnh ngay trên trang (pdf.js, nạp khi cần), kèm nút mở /
 * tải tệp gốc.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { formatDate } from '@nvg/shared';
import { BrandLogo } from '@/components/layout/brand-logo';

const BASE = (import.meta.env.VITE_DESIGN_API_URL ?? '').replace(/\/+$/, '');

interface Payload {
  status: 'ok' | 'expired' | 'not_found' | 'error';
  title?: string;
  contract_number?: string | null;
  signed_date?: string | null;
  company_name?: string | null;
  expires_at?: string;
  url?: string | null;
}

/** Đuôi tệp lấy từ phần đường dẫn của link ký (trước dấu `?`). */
function isImage(url: string) {
  return /\.(jpe?g|png|webp|heic)$/i.test(new URL(url).pathname);
}

function downloadUrl(url: string, name: string) {
  const u = new URL(url);
  u.searchParams.set('download', name);
  return u.toString();
}

/** Vẽ từng trang PDF thành ảnh — xem được trên mọi điện thoại, không cần trình xem PDF. */
function PdfPages({ url }: { url: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const task = pdfjs.getDocument({ data });
        const pdf = await task.promise;
        const out: string[] = [];
        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 1400 / Math.max(base.width, base.height) });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          await page.render({ canvas, viewport, background: '#ffffff' }).promise;
          out.push(canvas.toDataURL('image/jpeg', 0.85));
          if (!cancelled) setPages([...out]);
        }
        void task.destroy();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return (
      <p className="mt-4 text-fg-subtle">
        Không hiện được bản xem trước — bấm «Mở bản hợp đồng» hoặc «Tải về» để xem.
      </p>
    );
  }
  if (!pages) return <p className="mt-4 text-fg-subtle">Đang hiện các trang…</p>;
  return (
    <ol className="mt-4 space-y-3">
      {pages.map((src, i) => (
        <li key={i}>
          <img
            src={src}
            alt={`Trang ${i + 1}`}
            className="w-full rounded-lg border border-border bg-surface shadow-card"
          />
        </li>
      ))}
    </ol>
  );
}

export function PublicSignedScanPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${BASE}/public/signed/${token}`)
      .then((r) => r.json() as Promise<Payload>)
      .catch(() => ({ status: 'error' }) as Payload)
      .then((d) => {
        if (!cancelled) setData(d);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const name = `Hop-dong-${(data?.contract_number ?? 'da-ky').replace(/[^\w-]+/g, '-')}.pdf`;

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
          <p className="text-fg-subtle">Đang mở bản hợp đồng…</p>
        ) : data.status !== 'ok' || !data.url ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-lg font-semibold">
              {data.status === 'expired'
                ? 'Link xem hợp đồng đã hết hạn'
                : data.status === 'error'
                  ? 'Chưa mở được bản hợp đồng'
                  : 'Không tìm thấy bản hợp đồng'}
            </p>
            <p className="mt-2 text-fg-subtle">
              {data.status === 'error'
                ? 'Kiểm tra kết nối mạng rồi tải lại trang.'
                : 'Liên hệ nhân viên Nhà Việt đã gửi link để nhận link mới.'}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold">{data.title}</h1>
            <p className="mt-1 text-fg-subtle">
              {data.contract_number && <>Số {data.contract_number}</>}
              {data.signed_date && <> · ký ngày {formatDate(data.signed_date)}</>}
              {data.expires_at && <> · xem được tới {formatDate(data.expires_at)}</>}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-sm bg-brand px-4 font-semibold text-fg-inverse"
              >
                <FileText className="size-4" aria-hidden />
                Mở bản hợp đồng
              </a>
              <a
                href={downloadUrl(data.url, name)}
                className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-border bg-surface px-4 font-medium"
              >
                <Download className="size-4" aria-hidden />
                Tải về
              </a>
            </div>
            {isImage(data.url) ? (
              <img
                src={data.url}
                alt="Bản hợp đồng đã ký"
                className="mt-4 w-full rounded-lg border border-border bg-surface"
              />
            ) : (
              <PdfPages url={data.url} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
