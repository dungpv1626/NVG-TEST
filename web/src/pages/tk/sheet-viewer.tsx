/**
 * Trình XEM tờ bản vẽ — chỉ đọc. Không có Konva, không có logic hình học ở đây.
 *
 * SVG do Container dựng từ cùng một `SheetModel` với tệp DXF (bất biến #5, 14-phuong-an-demo
 * 14.6(b)). Trình duyệt làm đúng hai việc: đặt tờ lên màn hình, và tô màu công năng bằng CSS
 * theo `data-group` mà mỗi đa giác phòng mang sẵn. Tắt tô màu là bản vẽ nét đen đúng như in.
 *
 * Bảng màu là năm nhóm của gói trình khách (11-design-flow 11.4b): sinh hoạt chung · phòng ngủ ·
 * phụ trợ · giao thông · ngoài trời. Nhạt, để nét tường vẫn là thứ đậm nhất trên tờ.
 */

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadFloorPlanDxf, useFloorPlanSheet } from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';

const GROUP_LABELS: Array<[string, string]> = [
  ['habitable', 'Sinh hoạt chung'],
  ['sleeping', 'Phòng ngủ'],
  ['service', 'Phụ trợ'],
  ['circulation', 'Giao thông'],
  ['outdoor', 'Ngoài trời'],
];

// Màu tô công năng. Không phải màu trạng thái (CLAUDE.md 4.3) — đây là màu MINH HOẠ trên bản
// vẽ, cùng vai với chuỗi biểu đồ, và chỉ hiện khi người dùng bật.
const GROUP_FILL: Record<string, string> = {
  habitable: '#D9F0E3',
  sleeping: '#DCE8F6',
  service: '#F3EBD3',
  circulation: '#E9EBEE',
  outdoor: '#E1F1D5',
  other: '#F4F4F4',
};

export function SheetViewer({
  projectId,
  artifactId,
  levels,
  variantLabel,
}: {
  projectId: string;
  artifactId: string | null;
  /** Danh sách tầng có trong phương án đang xem. */
  levels: number[];
  variantLabel: string;
}): React.ReactElement {
  const [level, setLevel] = useState(levels[0] ?? 1);
  const [coloured, setColoured] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const sheet = useFloorPlanSheet(projectId, artifactId, level);

  // Đổi phương án thì về tầng đầu — tầng đang chọn có thể không tồn tại ở bản kia.
  useEffect(() => {
    setLevel(levels[0] ?? 1);
  }, [artifactId, levels]);

  async function download() {
    setDownloading(null);
    try {
      await downloadFloorPlanDxf(projectId, artifactId, level);
    } catch (e) {
      setDownloading(toUserMessage(e));
    }
  }

  return (
    <section className="rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Bản vẽ — {variantLabel}</h3>
          <p className="text-fg-subtle">
            Cùng một tờ với tệp DXF: trục, kích thước, cửa, thang do hệ thống dựng, không phải sơ
            đồ.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Chọn tầng" className="flex gap-1">
            {levels.map((n) => (
              <Button
                key={n}
                variant={n === level ? 'primary' : 'secondary'}
                aria-pressed={n === level}
                onClick={() => setLevel(n)}
              >
                Tầng {n}
              </Button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={coloured}
              onChange={(e) => setColoured(e.target.checked)}
            />
            Tô màu công năng
          </label>
          <Button variant="secondary" onClick={() => void download()}>
            <Download className="size-4" />
            Tải DXF tầng {level}
          </Button>
        </div>
      </div>
      {downloading && <p className="mt-2 text-status-overdue">{downloading}</p>}

      {coloured && (
        <ul
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-fg-subtle"
          aria-label="Chú giải màu"
        >
          {GROUP_LABELS.map(([group, label]) => (
            <li key={group} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-3 rounded-sm border border-border"
                style={{ background: GROUP_FILL[group] }}
              />
              {label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 overflow-auto rounded border border-border bg-surface-sunken p-2">
        {sheet.isLoading ? (
          <div
            className="aspect-[297/420] w-full max-w-xl animate-pulse rounded bg-surface"
            aria-hidden
          />
        ) : sheet.isError ? (
          <p className="p-4 text-status-overdue">{toUserMessage(sheet.error)}</p>
        ) : (
          <div
            className="mx-auto w-full max-w-3xl [&_svg]:h-auto [&_svg]:w-full"
            data-testid="to-ban-ve"
            style={
              coloured
                ? (Object.fromEntries(
                    Object.entries(GROUP_FILL).map(([g, c]) => [`--fill-${g}`, c]),
                  ) as React.CSSProperties)
                : undefined
            }
            dangerouslySetInnerHTML={{ __html: sheet.data ?? '' }}
          />
        )}
      </div>
      <style>{`
        [data-testid="to-ban-ve"] .phong { fill: var(--fill-other, none); }
        ${Object.keys(GROUP_FILL)
          .map(
            (g) =>
              `[data-testid="to-ban-ve"] .phong[data-group="${g}"] { fill: var(--fill-${g}, none); }`,
          )
          .join('\n')}
      `}</style>
    </section>
  );
}
