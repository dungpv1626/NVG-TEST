/**
 * Thanh ngang có nhãn và số — cho số chụp tại một thời điểm (tuổi nợ, lãi/lỗ từng công trình).
 *
 * Dựng bằng HTML thay vì thư viện biểu đồ: nhãn dài tiếng Việt xuống dòng được, đọc được bằng
 * trình đọc màn hình như một danh sách, và giá trị âm (lỗ) vẫn có chữ đi kèm.
 */

import type { ReactNode } from 'react';
import { CHART_COLORS } from './chart-theme';

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: bigint;
  /** Chữ hiện bên phải thanh — luôn có, màu không phải cách duy nhất truyền đạt. */
  text: string;
  color?: string;
}

export function BarList({ items }: { items: readonly BarListItem[] }) {
  const max = items.reduce(
    (m, i) => ((i.value < 0n ? -i.value : i.value) > m ? (i.value < 0n ? -i.value : i.value) : m),
    0n,
  );
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const abs = item.value < 0n ? -item.value : item.value;
        const pct = max === 0n ? 0 : Number((abs * 1000n) / max) / 10;
        return (
          <li key={item.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-fg">{item.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{item.text}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-sunken">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${Math.max(pct, abs > 0n ? 2 : 0)}%`,
                  background: item.color ?? CHART_COLORS.primary,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
