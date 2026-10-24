/**
 * Chọn ảnh công trình cho MẪU NHÁP (Đợt 2 — 2G, migration 0194).
 *
 * Mẫu nháp do máy lập khi công trình bàn giao. Ảnh gợi ý là ảnh nghiệm thu các mốc và ảnh nhật ký
 * của chính công trình đó, mới nhất trước — Thiết kế tích ảnh đẹp, bấm «Đưa vào mẫu»: ảnh được
 * CHÉP sang kho thư viện (mẫu không trỏ vào kho công trình). Ảnh có thể lộ người, biển số, giấy tờ
 * — Thiết kế xem từng ảnh trước khi chọn; máy không tự đưa ảnh nào vào mẫu.
 */

import { useState } from 'react';
import { Check, ImageDown } from 'lucide-react';
import { formatDate } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { toUserMessage } from '@/hooks/use-error-message';
import { useDraftPhotoCandidates, useImportSitePhotos } from '@/hooks/use-showcase';
import { cn } from '@/lib/utils';

export function DraftSitePhotos({ itemId, mediaCount }: { itemId: string; mediaCount: number }) {
  const { data, isLoading, error } = useDraftPhotoCandidates(itemId, true);
  const importPhotos = useImportSitePhotos();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const candidates = data?.candidates ?? [];

  function toggle(path: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function addPicked() {
    setMessage(null);
    setFailure(null);
    const picks = candidates
      .filter((c) => picked.has(c.path) && data?.urls[c.path])
      .map((c) => ({ url: data!.urls[c.path]!, source: c.source }));
    try {
      const n = await importPhotos.mutateAsync({ itemId, picks, start: mediaCount });
      setPicked(new Set());
      setMessage(`Đã đưa ${n} ảnh vào mẫu. Chọn ảnh bìa rồi xác nhận đưa vào kho.`);
    } catch (e) {
      setFailure(toUserMessage(e, 'create'));
    }
  }

  return (
    <section className="space-y-3 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Ảnh từ công trình</h2>
        <Button
          variant="secondary"
          disabled={picked.size === 0 || importPhotos.isPending}
          onClick={() => void addPicked()}
        >
          <ImageDown />
          {importPhotos.isPending ? 'Đang chép ảnh…' : `Đưa vào mẫu (${picked.size})`}
        </Button>
      </div>
      <p className="text-sm text-fg-subtle">
        Ảnh nghiệm thu các mốc và ảnh nhật ký, mới nhất trước. Xem kỹ từng ảnh — không chọn ảnh lộ
        mặt người, biển số xe, giấy tờ hay tên chủ nhà.
      </p>
      {isLoading && <p className="text-fg-subtle">Đang tải ảnh công trình…</p>}
      {error && <p className="text-status-overdue">{toUserMessage(error)}</p>}
      {!isLoading && !error && candidates.length === 0 && (
        <p className="text-fg-subtle">
          Công trình chưa có ảnh nghiệm thu hay ảnh nhật ký nào. Thêm ảnh bằng nút «Thêm ảnh».
        </p>
      )}
      {candidates.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {candidates.map((c) => {
            const on = picked.has(c.path);
            return (
              <li key={c.path}>
                <button
                  type="button"
                  onClick={() => toggle(c.path)}
                  aria-pressed={on}
                  className={cn(
                    'relative block w-full overflow-hidden rounded-sm border-2',
                    on ? 'border-brand' : 'border-transparent',
                  )}
                >
                  {data?.urls[c.path] ? (
                    <img
                      src={data.urls[c.path]}
                      alt={c.source}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full bg-surface-sunken" />
                  )}
                  {on && (
                    <span className="absolute right-1 top-1 rounded-full bg-brand p-0.5 text-fg-inverse">
                      <Check className="size-4" aria-hidden />
                    </span>
                  )}
                </button>
                <p className="mt-1 line-clamp-2 text-xs text-fg-subtle">
                  {c.source}
                  {c.taken_on && ` · ${formatDate(c.taken_on)}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {message && (
        <p role="status" className="text-status-completed">
          {message}
        </p>
      )}
      {failure && (
        <p role="alert" className="text-status-overdue">
          {failure}
        </p>
      )}
    </section>
  );
}
