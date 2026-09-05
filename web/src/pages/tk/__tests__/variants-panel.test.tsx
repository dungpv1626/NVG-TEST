/**
 * Tab Phương án kiến trúc — phần do engine sinh, dựng trong bộ nhớ, không gọi mạng.
 *
 * Bốn thứ bộ này canh:
 *  1. Bảng so sánh nói bằng ngôn ngữ khách: số phòng ngủ, phòng thờ tầng mấy — không lộ mã
 *     máy (`altar_room`) ra màn hình.
 *  2. Bản đang hiệu lực nói ra bằng CHỮ; bản khác có nút chọn; bấm chọn gửi đúng mã.
 *  3. Vô nghiệm hiện kèm lời giải thích và KHÔNG có nút chọn.
 *  4. Trạng thái nghiệp vụ ("chưa chốt chương trình") bày như trạng thái rỗng có hướng dẫn.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  view: null as unknown,
  error: null as Error | null,
  generate: vi.fn(() => Promise.resolve({})),
  choose: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@/hooks/use-design-projects', () => ({
  useFloorPlanVariants: () => ({
    data: state.error ? undefined : state.view,
    isLoading: false,
    isError: Boolean(state.error),
    error: state.error,
    refetch: vi.fn(),
  }),
  useGenerateFloorPlans: () => ({
    mutateAsync: state.generate,
    isPending: false,
    isError: false,
    error: null,
  }),
  useChooseFloorPlan: () => ({
    mutateAsync: state.choose,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

// Ba khối con (tờ bản vẽ, khối ba chiều, bảng thống kê) có bộ kiểm thử riêng — ở đây thay
// bằng bản rỗng để bộ này chỉ canh phần liệt kê và so sánh phương án.
vi.mock('../sheet-viewer', () => ({ SheetViewer: () => null }));
vi.mock('../massing-viewer', () => ({ MassingViewer: () => null }));
vi.mock('../schedules-panel', () => ({ SchedulesPanel: () => null }));

const { VariantsPanel } = await import('../variants-panel');

function variant(id: string, isHead: boolean) {
  return {
    variantId: id,
    label: `Bố cục ${id}`,
    intentArtifactId: `sha256:${id.repeat(64)}`,
    artifactId: `sha256:${id.toLowerCase().repeat(64)}`,
    createdAt: '2026-09-06T00:00:00Z',
    isHead,
    status: 'ok' as const,
    summary: {
      levels: [
        {
          level: 1,
          height_m: 3.6,
          area_m2: 75,
          rooms: [
            {
              id: 'living_1',
              type: 'living',
              label: 'Phòng khách',
              area_m2: 21.8,
              has_daylight: true,
            },
          ],
        },
        {
          level: 2,
          height_m: 3.9,
          area_m2: 85,
          rooms: [
            {
              id: 'altar_room_1',
              type: 'altar_room',
              label: 'Phòng thờ',
              area_m2: 16,
              has_daylight: false,
            },
          ],
        },
      ],
      total_area_m2: 160,
      bedrooms: 2,
      circulation_share: 0.112,
      altar_level: 2,
      garage_level: 1,
      constraint_status: 'pass' as const,
      violations: [],
    },
    floorPlan: {},
    infeasibility: null,
  };
}

describe('Tab Phương án kiến trúc — phần engine sinh', () => {
  it('so sánh bằng ngôn ngữ khách và nói rõ bản đang hiệu lực', () => {
    state.error = null;
    state.view = {
      programArtifactId: 'x',
      headArtifactId: 'y',
      variants: [variant('A', true), variant('B', false)],
    };
    renderWithApp(<VariantsPanel projectId="p1" readOnly={false} />);

    expect(screen.getByText('Số phòng ngủ')).toBeInTheDocument();
    expect(screen.getAllByText('Tầng 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đang hiệu lực').length).toBeGreaterThan(0);
    expect(screen.queryByText(/altar_room/)).not.toBeInTheDocument();
    // Chỉ bản B có nút chọn — bản A đã là bản hiệu lực.
    expect(screen.getAllByRole('button', { name: 'Chọn phương án này' })).toHaveLength(1);
  });

  it('bấm chọn gửi đúng mã phương án', async () => {
    state.error = null;
    state.view = {
      programArtifactId: 'x',
      headArtifactId: 'y',
      variants: [variant('A', true), variant('B', false)],
    };
    state.choose.mockClear();
    renderWithApp(<VariantsPanel projectId="p1" readOnly={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Chọn phương án này' }));
    expect(state.choose).toHaveBeenCalledWith({
      projectId: 'p1',
      artifactId: `sha256:${'b'.repeat(64)}`,
    });
  });

  it('đợt trước còn nguyên, kèm tác động so với bản hiện hành bằng tiếng Việt', () => {
    state.error = null;
    const plan = (levels: number[]) => ({
      schema_version: '1.0.0',
      intent_ref: `sha256:${'a'.repeat(64)}`,
      rule_pack_version: '1',
      site: { width_m: 5, depth_m: 18 },
      levels: levels.map((level) => ({
        level,
        rooms: [
          {
            id: `altar_room_1`,
            type: 'altar_room',
            polygon: [
              [0, 0],
              [5, 0],
              [5, 3],
              [0, 3],
            ],
            area_m2: 15,
          },
        ].filter(() => level === levels[levels.length - 1]),
      })),
      cores: [],
      constraint_report: { status: 'pass' },
    });
    const current = { ...variant('A', true), floorPlan: plan([1, 2, 3, 4, 5]) };
    const old = {
      ...variant('A', false),
      artifactId: `sha256:${'c'.repeat(64)}`,
      floorPlan: plan([1, 2, 3, 4]),
    };
    state.view = {
      programArtifactId: 'x',
      headArtifactId: current.artifactId,
      variants: [current],
      previous: [{ programArtifactId: 'p0', createdAt: '2026-09-06T01:00:00Z', variants: [old] }],
    };
    renderWithApp(<VariantsPanel projectId="p1" readOnly={false} />);
    expect(screen.getByText('Đợt trước (1)')).toBeInTheDocument();
    expect(screen.getByText('Thêm tầng 5.')).toBeInTheDocument();
    expect(screen.getByText(/chuyển từ tầng 4 sang tầng 5/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem bản vẽ A' })).toBeInTheDocument();
  });

  it('vô nghiệm hiện lời giải thích, không có nút chọn', () => {
    state.error = null;
    state.view = {
      programArtifactId: 'x',
      headArtifactId: null,
      previous: [],
      variants: [
        {
          ...variant('C', false),
          status: 'infeasible',
          summary: null,
          infeasibility: {
            message: 'Phòng khách không đủ bề rộng tối thiểu.',
            conflictRules: ['min_room_width'],
          },
        },
      ],
    };
    renderWithApp(<VariantsPanel projectId="p1" readOnly={false} />);

    expect(screen.getByText('Phòng khách không đủ bề rộng tối thiểu.')).toBeInTheDocument();
    expect(screen.getByText('Vô nghiệm')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chọn phương án này' })).not.toBeInTheDocument();
  });

  it('chưa có phương án thì mời sinh; chưa chốt chương trình thì bày như trạng thái rỗng', async () => {
    state.error = null;
    state.view = { programArtifactId: 'x', headArtifactId: null, variants: [], previous: [] };
    state.generate.mockClear();
    const first = renderWithApp(<VariantsPanel projectId="p1" readOnly={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sinh phương án' }));
    expect(state.generate).toHaveBeenCalledWith({ projectId: 'p1' });
    first.unmount();

    state.error = new Error(
      'Chưa chốt chương trình không gian. Mở tab Chương trình không gian và chốt một bản trước.',
    );
    renderWithApp(<VariantsPanel projectId="p1" readOnly={false} />);
    expect(screen.getByText(/Chưa chốt chương trình không gian/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
