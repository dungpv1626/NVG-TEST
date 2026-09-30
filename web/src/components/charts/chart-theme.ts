/**
 * Màu và kiểu trục chung cho mọi biểu đồ — đọc thẳng token CSS (`--color-chart-*`, index.css), nên
 * đổi màu ở một chỗ. Không dùng 6 màu trạng thái cho chuỗi biểu đồ (DESIGN_SYSTEM §2.1).
 */

import { useEffect, useState } from 'react';

export const CHART_COLORS = {
  primary: 'var(--color-chart-1)',
  pair: 'var(--color-chart-2)',
  third: 'var(--color-chart-3)',
  neutral: 'var(--color-chart-4)',
  muted: 'var(--color-chart-5)',
} as const;

export const AXIS_TICK = { fill: 'var(--color-fg-subtle)', fontSize: 12 } as const;
export const GRID_STROKE = 'var(--color-border)';

/** Tắt hoạt ảnh khi người dùng đã bật «giảm chuyển động» (DESIGN_SYSTEM §5). */
export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true,
  );
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return undefined;
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
