/**
 * Bảng thống kê tự sinh — cửa, cửa sổ, diện tích (TK-17, 11-design-flow 11.6 Output 4).
 *
 * Tính lại từ mặt bằng mỗi lần mở, nên đổi phương án hay giải lại là bảng đổi theo — đúng thứ
 * khảo sát nói hiện đang phải sửa tay từng bản vẽ. Nhãn "Khối lượng sơ bộ" đến từ máy chủ
 * (hợp đồng đặt `const`), giao diện chỉ hiện, không có chỗ tắt.
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { downloadFloorPlanXlsx, useFloorPlanSchedules } from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';

export function SchedulesPanel({
  projectId,
  artifactId,
  variantLabel,
}: {
  projectId: string;
  artifactId: string | null;
  variantLabel: string;
}): React.ReactElement {
  const view = useFloorPlanSchedules(projectId, artifactId);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    try {
      await downloadFloorPlanXlsx(projectId, artifactId);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  if (view.isLoading) {
    return <div className="h-40 animate-pulse rounded bg-surface-sunken" aria-hidden />;
  }
  if (view.isError || !view.data) {
    return <p className="text-status-overdue">{toUserMessage(view.error)}</p>;
  }

  const { schedules, roomLabels } = view.data;
  const openings = [...schedules.doors, ...schedules.windows];
  const byLevel = new Map<number, typeof schedules.areas>();
  for (const row of schedules.areas) {
    byLevel.set(row.level, [...(byLevel.get(row.level) ?? []), row]);
  }
  const total = schedules.areas.reduce((s, r) => s + r.area_m2, 0);

  return (
    <section className="rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Bảng thống kê — {variantLabel}</h3>
          <p className="text-fg-subtle">{schedules.disclaimer}. Tự cập nhật khi mặt bằng đổi.</p>
        </div>
        <Button variant="secondary" onClick={() => void download()}>
          <Download className="size-4" />
          Tải XLSX
        </Button>
      </div>
      {error && <p className="mt-2 text-status-overdue">{error}</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[28rem] border-collapse">
            <caption className="bg-surface-sunken px-3 py-2 text-left font-medium">
              Thống kê cửa
            </caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 font-medium">Ký hiệu</th>
                <th className="px-3 py-2 font-medium">Loại</th>
                <th className="px-3 py-2 text-right font-medium">Rộng × cao (mm)</th>
                <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                <th className="px-3 py-2 font-medium">Vật liệu</th>
              </tr>
            </thead>
            <tbody>
              {openings.map((row) => (
                <tr key={row.code} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{row.code}</td>
                  <td className="px-3 py-2">{kindOf(row.code)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Math.round(row.w_m * 1000)} × {Math.round(row.h_m * 1000)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                  <td className="px-3 py-2 text-fg-subtle">{row.material ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[20rem] border-collapse">
            <caption className="bg-surface-sunken px-3 py-2 text-left font-medium">
              Thống kê diện tích
            </caption>
            <tbody>
              {[...byLevel.entries()].map(([level, rows]) => (
                <tr key={level} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2 font-medium">Tầng {level}</td>
                  <td className="px-3 py-2 text-fg-subtle">
                    {rows
                      .map(
                        (r) =>
                          `${roomLabels[r.room_type] ?? r.room_type} ${formatNumber(r.area_m2, 1)}`,
                      )
                      .join(' · ')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(
                      rows.reduce((s, r) => s + r.area_m2, 0),
                      1,
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-sunken">
                <td className="px-3 py-2 font-medium" colSpan={2}>
                  Tổng sàn xây dựng
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatNumber(total, 1)} m²
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function kindOf(code: string): string {
  if (code.startsWith('DW')) return 'Cửa vệ sinh';
  if (code.startsWith('D')) return 'Cửa đi';
  return 'Cửa sổ';
}
