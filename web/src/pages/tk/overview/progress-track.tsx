/**
 * Dải tiến trình bảy bước (bản mẫu §5.5a). Logic suy trạng thái nằm ở `steps.ts` — xem chú
 * thích ở đó về việc vì sao dải này KHÔNG phải cỗ máy trạng thái thứ hai.
 */

import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Panel } from '../tk-ui';
import type { DesignStep } from './steps';

const BAR: Record<DesignStep['state'], string> = {
  done: 'bg-tk-btn',
  run: 'bg-tk-pu-solid',
  todo: 'bg-tk-line2',
};

/** Trạng thái nói bằng CHỮ cho trình đọc màn hình, không chỉ bằng màu thanh (CGD 6.8). */
const SAY: Record<DesignStep['state'], string> = {
  done: 'đã xong',
  run: 'đang làm',
  todo: 'chưa mở',
};

export function ProgressTrack({
  steps,
  basePath,
}: {
  steps: DesignStep[];
  /** Đường dẫn hồ sơ, để mỗi bước dẫn thẳng tới màn hình con của nó. */
  basePath: string;
}): React.ReactElement {
  const running = steps.findIndex((s) => s.state === 'run');
  const position =
    running === -1 ? `${steps.length} trên ${steps.length}` : `${running + 1} trên ${steps.length}`;

  return (
    <Panel
      title="Tiến trình thiết kế"
      aside={<span className="text-xs text-tk-t3">bước {position}</span>}
    >
      <ol
        aria-label="Bảy bước của quy trình thiết kế"
        className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7"
      >
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              to={`${basePath}?tab=${step.tab}`}
              className="group block rounded-sm focus-visible:outline-2"
            >
              <span aria-hidden className={cn('block h-1 rounded-full', BAR[step.state])} />
              <span
                className={cn(
                  'mt-2 block text-xs',
                  step.state === 'todo' && 'text-tk-t3',
                  step.state === 'run' && 'font-semibold',
                  step.state !== 'todo' && 'text-tk-tx',
                  'group-hover:underline',
                )}
              >
                {step.label}
              </span>
              <span className="mt-0.5 block text-xs text-tk-t3">
                {step.note || SAY[step.state]}
                {/* Màu thanh không phải cách duy nhất biết bước nào đang chạy: chữ trạng thái
                    luôn có, chỉ ẩn khỏi mắt khi ô đã có con số riêng. */}
                {step.note && <span className="sr-only"> · {SAY[step.state]}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
