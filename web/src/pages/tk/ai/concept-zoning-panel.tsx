/**
 * Khối «Sơ đồ công năng từng tầng» — «Bộ ý tưởng cho khách» B1 + B2 (doc/design/KE_HOACH_BO_Y_TUONG_KHACH.md).
 *
 * Đọc `GET /design/ai/concept/:projectId/zoning`: chương trình xếp phòng đầu bài ĐÃ XÁC NHẬN thành khối theo thứ tự từ
 * mặt đường vào trong, báo «đầu bài có vừa lô không» kèm cách nới. Tất định, không gọi AI, không tốn tiền. Tờ sơ đồ
 * hiện qua `<img>` (như mọi tờ vẽ của AI Design) và tải về được dạng SVG.
 *
 * Không vừa lô thì câu báo + cách nới đứng TRÊN sơ đồ, nhưng không khoá nút nào — chỉ là thông tin cho kiến trúc sư.
 */

import { AlertTriangle, Download } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useConceptZoning, type ZoningVerdict } from '@/hooks/use-ai-design';
import { Chip, Panel } from '../tk-ui';
import { codePrefix } from './result-bundle';

const VERDICT: Record<ZoningVerdict, { text: string; tone: 'gr' | 'am' | 'rd' }> = {
  fits: { text: 'Vừa lô', tone: 'gr' },
  tight: { text: 'Khá chật', tone: 'am' },
  over: { text: 'Chưa vừa lô', tone: 'rd' },
};

/** Tên tệp tải về: mã hồ sơ + tên tờ, như tệp trong Bộ kết quả. */
export function zoningFileName(code: string | null | undefined): string {
  return `${codePrefix(code)}_so-do-cong-nang.svg`;
}

export function ConceptZoningPanel({
  projectId,
  projectCode,
}: {
  projectId: string;
  projectCode?: string | null;
}): React.ReactElement | null {
  const query = useConceptZoning(projectId);
  const svg = query.data?.svg ?? null;
  const src = useMemo(
    () => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null),
    [svg],
  );

  if (query.isLoading) {
    return (
      <Panel title="Sơ đồ công năng từng tầng">
        <Skeleton className="h-64 w-full" />
      </Panel>
    );
  }
  if (query.error) {
    return (
      <Panel title="Sơ đồ công năng từng tầng">
        <p className="text-status-overdue">{toUserMessage(query.error)}</p>
      </Panel>
    );
  }
  const zoning = query.data?.zoning;
  if (!zoning || !src) {
    return (
      <Panel title="Sơ đồ công năng từng tầng">
        <p className="text-fg-subtle">
          Chưa có đầu bài đã xác nhận. Xác nhận đầu bài ở hồ sơ thiết kế để xem các phòng xếp theo
          tầng và đầu bài có vừa lô không.
        </p>
      </Panel>
    );
  }

  const verdict = VERDICT[zoning.verdict];
  const [headline, ...notes] = zoning.messages;
  const download = () => {
    const blob = new Blob([svg!], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zoningFileName(projectCode);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title="Sơ đồ công năng từng tầng"
      aside={<Chip tone={verdict.tone}>{verdict.text}</Chip>}
    >
      <div className="space-y-3">
        <p className="text-fg-subtle">
          Các phòng đầu bài xếp thành khối theo thứ tự từ mặt đường vào trong, để xem đầu bài có vừa
          lô không. Chương trình tự dựng, không gọi AI, không tốn tiền.
        </p>
        {headline && (
          <p
            role={zoning.verdict === 'over' ? 'alert' : undefined}
            className={
              zoning.verdict === 'over'
                ? 'font-semibold text-status-overdue'
                : zoning.verdict === 'tight'
                  ? 'flex items-start gap-2'
                  : undefined
            }
          >
            {zoning.verdict === 'tight' && (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-pending" aria-hidden />
            )}
            <span>{headline}</span>
          </p>
        )}
        {zoning.suggestions.length > 0 && (
          <div>
            <p className="font-semibold">Cách nới đầu bài</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {zoning.suggestions.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto rounded-card border border-border bg-surface p-2">
          <img
            src={src}
            alt="Sơ đồ công năng từng tầng — phương án ý tưởng, chưa phải thiết kế"
            className="mx-auto block h-auto max-w-full"
          />
        </div>
        {notes.length > 0 && (
          <ul className="space-y-1 text-sm text-fg-subtle">
            {notes.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
        <div>
          <Button variant="secondary" onClick={download}>
            <Download className="size-4" aria-hidden />
            Tải sơ đồ (.svg)
          </Button>
        </div>
      </div>
    </Panel>
  );
}
