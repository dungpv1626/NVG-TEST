/**
 * «Máy đọc phiếu và điền nháp» (anh Dũng 28/10/2026): ảnh phiếu khảo sát giấy → nháp sáu ô báo cáo và
 * ô phiếu riêng của pháp nhân.
 *
 * Hai bước, theo đúng thứ tự riêng tư:
 *  1. Dựng ảnh trang từ tệp đã lưu, TÔ TRẮNG khung thông tin khách (`paper-redact.ts`) và bày đúng ảnh sẽ
 *     gửi. Người dùng chỉnh phần che nếu còn lộ tên, số điện thoại, địa chỉ, chữ ký.
 *  2. Cú bấm «Gửi ảnh đã che cho máy đọc» mới gọi máy (không gọi từ hiệu ứng — chế độ kiểm tra của React
 *     chạy hiệu ứng hai lần, lời gọi trả phí bị nhân đôi, đo thật ở 0233). Kết quả là ĐỀ XUẤT: ô biên bản
 *     đã có nội dung không chọn sẵn; «Áp vào biên bản» chỉ điền biểu mẫu, người dùng sửa rồi tự Lưu.
 */

import { useEffect, useState } from 'react';
import { paperInitialSelection, type PaperReadItem } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { readSurveyPaper, type SurveyPaperReadResult } from '@/lib/ai-api';
import {
  loadPaperPages,
  PAPER_MAX_PAGES_CLIENT,
  redactedJpeg,
  type PaperPageDraft,
  type RedactedPage,
} from './paper-pages';

export interface PaperApplyEntry {
  key: string;
  value: string;
}

export function SurveyPaperReadPanel({
  surveyId,
  fileUrl,
  fileName,
  mimeType,
  current,
  onApply,
  onClose,
}: {
  surveyId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  /** Nội dung hiện có của từng ô (khoá như `surveyPaperFields`) — ô có chữ thì không chọn sẵn. */
  current: Record<string, string | null | undefined>;
  /** Điền vào biểu mẫu biên bản. Trả câu lỗi nếu không áp được. */
  onApply: (entries: PaperApplyEntry[]) => string | null;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<PaperPageDraft[] | null>(null);
  const [truncatedFrom, setTruncatedFrom] = useState<number | null>(null);
  // Phiên bản phần che: ảnh xem trước chỉ được gửi khi dựng từ ĐÚNG phần che đang hiện.
  const [version, setVersion] = useState(0);
  const [previews, setPreviews] = useState<{ version: number; items: RedactedPage[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [request, setRequest] = useState<Promise<SurveyPaperReadResult> | null>(null);

  // Dựng ảnh trang là việc trên máy người dùng, không gọi máy chủ AI — chạy từ hiệu ứng được.
  useEffect(() => {
    let cancelled = false;
    loadPaperPages(fileUrl, mimeType)
      .then((res) => {
        if (cancelled) return;
        setPages(res.pages);
        setTruncatedFrom(res.truncatedFrom);
      })
      .catch(() => {
        if (!cancelled)
          setLoadError(
            'Không mở được tệp phiếu để dựng ảnh. Tải lại trang rồi thử lại, hoặc gõ tay.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [fileUrl, mimeType]);

  // Ảnh xem trước = ảnh gửi đi; dựng lại (chờ người dùng thôi kéo) mỗi khi phần che đổi.
  useEffect(() => {
    if (!pages) return;
    let cancelled = false;
    let made: RedactedPage[] = [];
    const timer = setTimeout(() => {
      void Promise.all(pages.map((p) => redactedJpeg(p))).then((out) => {
        made = out;
        if (cancelled) out.forEach((o) => URL.revokeObjectURL(o.url));
        else setPreviews({ version, items: out });
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      made.forEach((o) => URL.revokeObjectURL(o.url));
    };
  }, [pages, version]);

  const setCover = (index: number, patch: Partial<Pick<PaperPageDraft, 'top' | 'bottom'>>) => {
    setPages((all) => all && all.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    setVersion((v) => v + 1);
  };

  const shown = previews?.version === version ? previews.items : null;
  const ready = pages !== null && shown !== null && shown.length === pages.length;
  const noBar = pages !== null && !pages.some((p) => p.barFound);

  return (
    <section
      aria-label="Máy đọc phiếu khảo sát"
      className="mt-3 rounded-card border border-brand bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold">Máy đọc phiếu và điền nháp</h4>
          <p className="break-all text-fg-subtle">{fileName}</p>
        </div>
        <Button variant="subtle" size="sm" onClick={onClose}>
          Đóng
        </Button>
      </div>

      {loadError && <p className="mt-3 text-status-overdue">{loadError}</p>}

      {!loadError && !pages && (
        <div className="mt-3 space-y-2" aria-busy="true">
          <p className="text-fg-subtle">Đang dựng ảnh các trang phiếu…</p>
          <div className="h-40 w-32 animate-pulse rounded-sm bg-surface-sunken" />
        </div>
      )}

      {pages && !request && (
        <div className="mt-3 space-y-3">
          <p>
            Ảnh dưới đây là đúng thứ gửi cho máy đọc. Phần trắng là chỗ đã che — kiểm không còn tên,
            số điện thoại, địa chỉ hay chữ ký của khách; còn lộ thì kéo thanh che rộng thêm.
          </p>
          {noBar && (
            <p className="rounded-sm bg-status-pending-bg px-3 py-2 text-status-pending">
              Không thấy vạch đen dưới khung thông tin khách — có thể phiếu in theo mẫu cũ hoặc ảnh
              chụp lệch. Đã che {Math.round(pages[0]!.top * 100)} % phía trên trang đầu; kiểm kỹ cả
              phần chữ ký cuối phiếu.
            </p>
          )}
          {truncatedFrom && (
            <p className="text-fg-subtle">
              Tệp có {truncatedFrom} trang — máy chỉ đọc {PAPER_MAX_PAGES_CLIENT} trang đầu.
            </p>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pages.map((p, i) => (
              <li key={i} className="space-y-2">
                {shown?.[i] ? (
                  <img
                    src={shown[i]!.url}
                    alt={`Trang ${i + 1} đã che thông tin khách`}
                    className="w-full rounded-sm border border-border"
                  />
                ) : (
                  <div className="aspect-[1/1.41] w-full animate-pulse rounded-sm bg-surface-sunken" />
                )}
                <label className="block text-xs text-fg-subtle">
                  Trang {i + 1} — che phía trên: {Math.round(p.top * 100)} %
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={Math.round(p.top * 100)}
                    onChange={(e) => setCover(i, { top: Number(e.target.value) / 100 })}
                    className="block w-full accent-brand"
                  />
                </label>
                <label className="block text-xs text-fg-subtle">
                  Che phía dưới: {Math.round(p.bottom * 100)} %
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={Math.round(p.bottom * 100)}
                    onChange={(e) => setCover(i, { bottom: Number(e.target.value) / 100 })}
                    className="block w-full accent-brand"
                  />
                </label>
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() =>
              shown &&
              setRequest(
                readSurveyPaper(
                  surveyId,
                  shown.map((p) => p.base64),
                ),
              )
            }
          >
            Gửi ảnh đã che cho máy đọc
          </Button>
        </div>
      )}

      {request && (
        <PaperReadResult
          request={request}
          current={current}
          onApply={onApply}
          onRetry={() => setRequest(null)}
        />
      )}
    </section>
  );
}

/** Kết quả máy đọc: chọn ô nào dùng; ô biên bản đã có nội dung không chọn sẵn. */
export function PaperReadResult({
  request,
  current,
  onApply,
  onRetry,
}: {
  request: Promise<SurveyPaperReadResult>;
  current: Record<string, string | null | undefined>;
  onApply: (entries: PaperApplyEntry[]) => string | null;
  onRetry?: () => void;
}) {
  const [result, setResult] = useState<SurveyPaperReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Ô đã có nội dung lúc máy trả kết quả — chụp một lần, không tính lại khi người dùng áp.
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    request
      .then((res) => {
        if (cancelled) return;
        const initial = paperInitialSelection(res.accepted, current);
        setResult(res);
        setSelected(initial);
        setFilled(new Set(res.accepted.filter((a) => !initial.has(a.key)).map((a) => a.key)));
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Máy chưa đọc được phiếu. Gõ tay như thường.');
      });
    return () => {
      cancelled = true;
    };
    // `current` chỉ đọc lúc kết quả về — gõ tiếp không được kích lại lời gọi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (error) {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-status-overdue">{error}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Quay lại ảnh đã che
          </Button>
        )}
      </div>
    );
  }
  if (!result) {
    return (
      <div className="mt-3 space-y-2" aria-busy="true">
        <p className="text-fg-subtle">Máy đang đọc phiếu…</p>
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-sunken" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-sunken" />
      </div>
    );
  }

  const unsure = result.accepted.filter((a) => a.confidence === 'khong_ro').length;
  return (
    <div className="mt-3 space-y-3">
      <p className="text-fg-subtle">
        {result.fake ? '[Giả lập] ' : ''}Máy chỉ chép nháp — chọn ô nào dùng rồi bấm «Áp vào biên
        bản», đọc lại với phiếu giấy rồi Lưu. Ô biên bản đã có nội dung không chọn sẵn.
        {unsure > 0 && ` ${unsure} ô máy đọc không chắc — đối chiếu kỹ với phiếu.`}
      </p>
      {result.accepted.length === 0 ? (
        <p>Máy không đọc ra ô nào trên phiếu — gõ tay các ô như thường.</p>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {result.accepted.map((item: PaperReadItem) => (
            <li key={item.key} className="flex gap-3 p-3">
              <input
                type="checkbox"
                id={`paper-${item.key}`}
                className="mt-1 size-4 shrink-0 accent-brand"
                checked={selected.has(item.key)}
                onChange={() => toggle(item.key)}
              />
              <label htmlFor={`paper-${item.key}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="font-medium">{item.label}</span>
                {item.confidence === 'khong_ro' && (
                  <span className="ml-2 rounded-sm bg-status-pending-bg px-1.5 py-0.5 text-xs text-status-pending">
                    Không rõ — kiểm lại
                  </span>
                )}
                <span className="block whitespace-pre-wrap">{item.value}</span>
                {filled.has(item.key) && (
                  <span className="block text-status-pending">
                    Biên bản đã có nội dung ở ô này — chọn thì thay bằng chữ máy đọc.
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      {result.rejected.length > 0 && (
        <p className="text-xs text-fg-subtle">
          Bỏ {result.rejected.length} mục không thuộc phiếu này.
        </p>
      )}
      {applied && <p className="text-status-overdue">{applied}</p>}
      {result.accepted.length > 0 && (
        <Button
          variant="primary"
          disabled={selected.size === 0}
          onClick={() =>
            setApplied(
              onApply(
                result.accepted
                  .filter((a) => selected.has(a.key))
                  .map((a) => ({ key: a.key, value: a.value })),
              ),
            )
          }
        >
          Áp {selected.size} ô vào biên bản
        </Button>
      )}
    </div>
  );
}
