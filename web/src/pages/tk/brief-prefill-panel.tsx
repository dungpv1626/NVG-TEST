/**
 * «Điền sẵn từ khảo sát» (anh Dũng 27/10/2026): máy đọc biên bản khảo sát thiết kế, lời chủ nhà đã chép chữ và
 * báo cáo khảo sát đã duyệt của Kinh doanh, đề xuất câu trả lời cho đầu bài. Mỗi câu kèm câu gốc làm căn cứ;
 * kiến trúc sư chọn câu nào dùng (PRD 2.3). Câu đã có câu trả lời KHÔNG chọn sẵn — không đè lặng lẽ. Áp xong,
 * khung «Còn thiếu» bên phải là phần còn lại phải điền.
 */

import { useEffect, useState } from 'react';
import { prefillConflicts, type DesignBriefDraft } from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import type { BriefPrefillResult } from '@/lib/ai-api';

export function BriefPrefillPanel({
  request,
  draft,
  onApply,
  onClose,
}: {
  /**
   * Lời gọi máy đã bắt đầu từ CÚ BẤM nút, không từ hiệu ứng của khối: chế độ kiểm tra của React chạy hiệu ứng
   * hai lần, và một lời gọi Gemini trả phí bị nhân đôi theo (đo thật 27/10/2026: hai dòng `ai_calls` cho một bấm).
   */
  request: Promise<BriefPrefillResult>;
  draft: DesignBriefDraft;
  onApply: (entries: { path: string; value: unknown }[]) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<BriefPrefillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Câu đã có câu trả lời lúc máy trả kết quả — chụp một lần, không tính lại khi người dùng áp.
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    request
      .then((res) => {
        if (cancelled) return;
        const taken = prefillConflicts(draft, res.accepted);
        setResult(res);
        setConflicts(taken);
        setSelected(new Set(res.accepted.filter((a) => !taken.has(a.path)).map((a) => a.path)));
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : 'Máy chưa đọc được khảo sát. Điền tay như thường.',
          );
      });
    return () => {
      cancelled = true;
    };
    // `draft` chỉ đọc lúc kết quả về (câu nào đã có trả lời) — gõ tiếp không được kích lại lời gọi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const toggle = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const sources = result
    ? [
        result.used.design_survey && 'biên bản khảo sát thiết kế',
        result.used.transcripts > 0 && `${result.used.transcripts} đoạn ghi âm đã chép chữ`,
        result.used.crm_survey && 'báo cáo khảo sát đã duyệt của Kinh doanh',
      ].filter(Boolean)
    : [];

  return (
    <section
      aria-label="Điền sẵn từ khảo sát"
      className="rounded-card border border-brand bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Điền sẵn từ khảo sát</h3>
          <p className="text-fg-subtle">
            Máy chỉ đề xuất — chọn câu nào dùng rồi bấm «Áp vào đầu bài». Câu đã có câu trả lời
            không chọn sẵn.
          </p>
        </div>
        <Button variant="subtle" onClick={onClose}>
          Đóng
        </Button>
      </div>

      {!result && !error && (
        <div className="mt-3 space-y-2" aria-busy="true">
          <p className="text-fg-subtle">Máy đang đọc khảo sát…</p>
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-sunken" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface-sunken" />
        </div>
      )}
      {error && <p className="mt-3 text-status-overdue">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          <p className="text-fg-subtle">
            {result.fake ? '[Giả lập] ' : ''}Đã đọc: {sources.join(', ') || 'không có nguồn nào'}.
            {result.used.crm_linked && !result.used.crm_survey
              ? ' Cơ hội gắn với hồ sơ chưa có báo cáo khảo sát đã duyệt, hoặc tài khoản này không xem được.'
              : ''}
          </p>
          {result.accepted.length === 0 ? (
            <p>Khảo sát chưa nói rõ câu nào của đầu bài — điền tay ở các bước bên dưới.</p>
          ) : (
            <ul className="divide-y divide-border rounded-sm border border-border">
              {result.accepted.map((item) => (
                <li key={item.path} className="flex gap-3 p-3">
                  <input
                    type="checkbox"
                    id={`prefill-${item.path}`}
                    className="mt-1 size-4 shrink-0 accent-brand"
                    checked={selected.has(item.path)}
                    onChange={() => toggle(item.path)}
                  />
                  <label htmlFor={`prefill-${item.path}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-fg-subtle"> — {item.sectionTitle}</span>
                    <span className="block">
                      Đề xuất: <strong>{item.display}</strong>
                    </span>
                    {item.quote && (
                      <span className="block text-fg-subtle italic">Căn cứ: «{item.quote}»</span>
                    )}
                    {conflicts.has(item.path) && (
                      <span className="block text-status-pending">
                        Đầu bài đã có câu trả lời cho câu này — chọn thì thay bằng đề xuất.
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {result.rejected.length > 0 && (
            <details>
              <summary className="cursor-pointer text-fg-subtle select-none">
                {result.rejected.length} đề xuất bị loại vì không khớp câu hỏi
              </summary>
              <ul className="mt-1 list-disc pl-5 text-fg-subtle">
                {result.rejected.map((r, i) => (
                  <li key={`${r.path}:${i}`}>
                    {r.path} = «{r.value}»: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={selected.size === 0}
              onClick={() =>
                onApply(
                  result.accepted
                    .filter((a) => selected.has(a.path))
                    .map((a) => ({ path: a.path, value: a.value })),
                )
              }
            >
              Áp {selected.size} câu vào đầu bài
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
