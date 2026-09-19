/**
 * Trình xem tờ bản vẽ — chỉ đọc, dựng trong bộ nhớ.
 *
 * Ba thứ canh: SVG của Container được đặt lên màn hình nguyên vẹn; đổi tầng gọi đúng tầng;
 * tắt "tô màu công năng" thì không còn biến màu nào (bản vẽ nét đen như in).
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  calls: [] as Array<[string, string | null, number]>,
}));

vi.mock('@/hooks/use-design-projects', () => ({
  useFloorPlanSheet: (projectId: string, artifactId: string | null, level: number) => {
    state.calls.push([projectId, artifactId, level]);
    return {
      data: `<svg viewBox="0 0 10 10"><polygon class="phong" data-group="sleeping" points="0,0 1,0 1,1"/><text>TẦNG ${level}</text></svg>`,
      isLoading: false,
      isError: false,
      error: null,
    };
  },
  downloadFloorPlanDxf: vi.fn(() => Promise.resolve()),
}));

const { SheetViewer } = await import('../sheet-viewer');

describe('Trình xem tờ bản vẽ', () => {
  it('đặt SVG của Container lên màn hình và đổi tầng đúng', async () => {
    state.calls.length = 0;
    renderWithApp(
      <SheetViewer
        projectId="p"
        artifactId="sha256:a"
        levels={[1, 2, 3]}
        variantLabel="Phương án A"
      />,
    );
    expect(screen.getByText('TẦNG 1')).toBeInTheDocument();
    expect(screen.getByTestId('to-ban-ve').querySelector('.phong')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Tầng 3' }));
    expect(screen.getByText('TẦNG 3')).toBeInTheDocument();
    expect(state.calls.at(-1)).toEqual(['p', 'sha256:a', 3]);
  });

  it('tắt tô màu thì không còn biến màu nào trên tờ', async () => {
    renderWithApp(
      <SheetViewer projectId="p" artifactId={null} levels={[1]} variantLabel="Phương án A" />,
    );
    const box = screen.getByTestId('to-ban-ve');
    expect(box.getAttribute('style')).toContain('--fill-sleeping');
    expect(screen.getByText('Phòng ngủ')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Tô màu công năng' }));
    expect(screen.getByTestId('to-ban-ve').getAttribute('style') ?? '').not.toContain('--fill');
    expect(screen.queryByText('Phòng ngủ')).not.toBeInTheDocument();
  });
});
