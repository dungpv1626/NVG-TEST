/**
 * Bảng thống kê — dựng trong bộ nhớ. Canh: mã cửa và kích thước mm hiện đúng, tên phòng là
 * tiếng Việt từ bảng nhãn máy chủ, tổng sàn cộng đúng, nhãn cảnh báo hiện, nút tải XLSX gọi đúng.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({ download: vi.fn(() => Promise.resolve()) }));

vi.mock('@/hooks/use-design-projects', () => ({
  useFloorPlanSchedules: () => ({
    data: {
      schedules: {
        doors: [{ code: 'D1', w_m: 1.65, h_m: 2.5, count: 1, material: 'nhôm kính trong' }],
        windows: [{ code: 'W1', w_m: 1.2, h_m: 1.6, count: 3, material: 'nhôm kính trong' }],
        areas: [
          { level: 1, room_type: 'living', area_m2: 20 },
          { level: 1, room_type: 'kitchen', area_m2: 6.1 },
          { level: 2, room_type: 'bedroom', area_m2: 14.5 },
        ],
        materials: [],
        disclaimer: 'Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng',
      },
      roomLabels: { living: 'Phòng khách', kitchen: 'Bếp', bedroom: 'Phòng ngủ' },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  downloadFloorPlanXlsx: state.download,
}));

const { SchedulesPanel } = await import('../schedules-panel');

describe('Bảng thống kê', () => {
  it('hiện cửa theo mm, phòng bằng tiếng Việt, tổng sàn và nhãn cảnh báo', async () => {
    renderWithApp(
      <SchedulesPanel projectId="p" artifactId="sha256:a" variantLabel="Phương án A" />,
    );
    expect(screen.getByText('D1')).toBeInTheDocument();
    expect(screen.getByText('1650 × 2500')).toBeInTheDocument();
    expect(screen.getByText(/Phòng khách 20/)).toBeInTheDocument();
    expect(screen.queryByText(/living/)).not.toBeInTheDocument();
    expect(screen.getByText('40,6 m²')).toBeInTheDocument();
    expect(screen.getByText(/Khối lượng sơ bộ/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Tải XLSX/ }));
    expect(state.download).toHaveBeenCalledWith('p', 'sha256:a');
  });
});
