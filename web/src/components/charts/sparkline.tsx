/** Đường xu hướng nhỏ trong ô chỉ số — không trục, không gợi ý; chỉ để thấy hướng đi. */

import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, usePrefersReducedMotion } from './chart-theme';

export function Sparkline({
  values,
  color = CHART_COLORS.primary,
}: {
  values: readonly number[];
  color?: string;
}) {
  const reduced = usePrefersReducedMotion();
  if (values.length < 2) return null;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-24" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={!reduced}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
