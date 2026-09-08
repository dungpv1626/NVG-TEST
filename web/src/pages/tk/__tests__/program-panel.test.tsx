/**
 * Tab Chương trình không gian — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Bốn thứ bộ này canh:
 *  1. **Tên phòng hiện bằng tiếng Việt**, lấy từ bảng nhãn máy chủ gửi kèm. Mã máy
 *     (`altar_room`) lọt ra màn hình là lỗi ngôn ngữ, và nó không gây lỗi nào khác để lộ ra.
 *  2. **Bản không khớp bản đã chốt phải NÓI RA.** Sửa đầu bài xong quay lại mà màn hình im
 *     lặng thì kiến trúc sư xem một đằng, bộ giải chạy một nẻo.
 *  3. **Cảnh báo hiện đủ**, không rút gọn thành một con số.
 *  4. **Trạng thái nghiệp vụ bày như trạng thái rỗng có hướng dẫn**, không phải hộp lỗi đỏ
 *     kèm mã kỹ thuật.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  view: null as unknown,
  error: null as Error | null,
  generate: vi.fn(() => Promise.resolve({})),
  generateAi: vi.fn((_input: { projectId: string; route: string }) =>
    Promise.resolve({
      artifactId: `sha256:${'d'.repeat(64)}`,
      reused: false,
      program: { spaces: [], floor_allocation: [] },
      roomLabels: {},
      warnings: [],
      unresolvedNeeds: [],
      aiSuggestion: null,
      generator: { kind: 'ai', provider: 'openai', model: 'gpt-x' },
      rationale: 'Bếp mở thông phòng ăn.',
      assumptions: ['Không có người giúp việc ở lại.'],
      notes: {},
      comparison: [
        { key: 'living_1', type: 'living', floor: 1, solver_m2: 22, ai_m2: 28 },
        { key: 'study_1', type: 'study', floor: 2, solver_m2: null, ai_m2: 9 },
      ],
      repaired: true,
    }),
  ),
  models: {
    text: [
      {
        route: 'ai_text_openai',
        provider: 'openai',
        label: 'GPT (OpenAI)',
        model: 'gpt-x',
        maxDataClass: 2,
        enabled: true,
        unavailableReason: null,
      },
      {
        route: 'ai_text_anthropic',
        provider: 'anthropic',
        label: 'Claude (Anthropic)',
        model: 'claude-x',
        maxDataClass: 2,
        enabled: false,
        unavailableReason: 'Chưa cấu hình khoá API của nhà cung cấp này.',
      },
    ],
    image: [],
    defaults: { text: 'ai_text_openai', image: null },
  },
}));

vi.mock('@/hooks/use-design-projects', () => ({
  useSpaceProgram: () => ({
    data: state.error ? undefined : state.view,
    isLoading: false,
    isError: Boolean(state.error),
    error: state.error,
    refetch: vi.fn(),
  }),
  useGenerateSpaceProgram: () => ({
    mutateAsync: state.generate,
    isPending: false,
    isError: false,
    error: null,
  }),
  useGenerateSpaceProgramAi: () => ({
    mutateAsync: state.generateAi,
    isPending: false,
    isError: false,
    error: null,
  }),
  useAiModels: () => ({ data: state.models, isLoading: false, error: null }),
}));

const { ProgramPanel } = await import('../program-panel');

function view(over: Record<string, unknown> = {}) {
  return {
    program: {
      spaces: [
        {
          id: 'living_1',
          type: 'living',
          floor: 1,
          min_area_m2: 14,
          target_area_m2: 22,
          max_area_m2: 40,
          priority: 1,
          needs_daylight: true,
          needs_facade: true,
          needs_ventilation: true,
        },
        {
          id: 'altar_room_1',
          type: 'altar_room',
          floor: 2,
          min_area_m2: 8,
          target_area_m2: 12,
          max_area_m2: 20,
          priority: 2,
          needs_daylight: true,
          needs_facade: false,
          needs_ventilation: true,
        },
      ],
      floor_allocation: [
        { floor: 1, usable_area_m2: 90, allocated_area_m2: 22 },
        { floor: 2, usable_area_m2: 90, allocated_area_m2: 12 },
      ],
      priors_applied: false,
    },
    roomLabels: { living: 'Phòng khách', altar_room: 'Phòng thờ' },
    warnings: [],
    unresolvedNeeds: [],
    briefArtifactId: `sha256:${'a'.repeat(64)}`,
    headArtifactId: null,
    matchesHead: false,
    ...over,
  };
}

describe('Tab Chương trình không gian', () => {
  it('tên phòng hiện bằng tiếng Việt, không phải mã máy', async () => {
    state.error = null;
    state.view = view();
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findByText('Phòng khách')).toBeInTheDocument();
    expect(screen.getByText('Phòng thờ')).toBeInTheDocument();
    expect(screen.queryByText('altar_room')).not.toBeInTheDocument();
  });

  it('nhóm theo tầng và nói rõ sàn còn bao nhiêu', async () => {
    state.error = null;
    state.view = view();
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findByText('Tầng 1')).toBeInTheDocument();
    expect(screen.getByText('Tầng 2')).toBeInTheDocument();
    expect(screen.getByText(/Sàn 90 m² · đã bố trí 22 m²/)).toBeInTheDocument();
  });

  it('bản đã chốt còn hiệu lực thì khoá nút chốt lại', async () => {
    state.error = null;
    state.view = view({ matchesHead: true, headArtifactId: `sha256:${'b'.repeat(64)}` });
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findByText(/Đã chốt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chốt chương trình/ })).toBeDisabled();
  });

  it('đầu bài đổi sau lần chốt thì NÓI RA và mở lại nút chốt', async () => {
    state.error = null;
    state.view = view({ matchesHead: false, headArtifactId: `sha256:${'b'.repeat(64)}` });
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findByText(/Đầu bài đã đổi từ lần chốt trước/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Chốt chương trình/ });
    expect(button).toBeEnabled();

    await userEvent.click(button);
    expect(state.generate).toHaveBeenCalledWith({ projectId: 'p1' });
  });

  it('cảnh báo hiện đủ từng dòng', async () => {
    state.error = null;
    state.view = view({
      warnings: ['Tầng 1: nhu cầu vượt sàn có được khoảng 12.0 m².'],
      unresolvedNeeds: ['ưu tiên đón nắng buổi sáng'],
    });
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findByText(/nhu cầu vượt sàn/)).toBeInTheDocument();
    expect(screen.getByText('ưu tiên đón nắng buổi sáng')).toBeInTheDocument();
  });

  it('chưa xác nhận đầu bài thì hướng dẫn việc cần làm, không hiện lỗi kỹ thuật', async () => {
    state.error = new Error('Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước.');
    state.view = null;
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findByText(/Hoàn tất và xác nhận đầu bài trước/)).toBeInTheDocument();
  });

  it('chỉ xem thì không có nút chốt', async () => {
    state.error = null;
    state.view = view();
    renderWithApp(<ProgramPanel projectId="p1" readOnly />);

    expect(await screen.findByText('Phòng khách')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chốt chương trình/ })).not.toBeInTheDocument();
  });
});

describe('Nhánh AI trên tab Chương trình không gian', () => {
  it('chọn «AI» thì nút đổi chữ và gửi đúng TÊN TUYẾN đã chọn, không phải tên mô hình', async () => {
    state.error = null;
    state.view = view();
    state.generateAi.mockClear();
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    await userEvent.click(await screen.findByRole('button', { name: 'AI' }));
    const select = screen.getByLabelText('Model');
    expect((select as HTMLSelectElement).value).toBe('ai_text_openai');

    // Dòng ghi chú về dữ liệu gửi đi luôn có mặt khi chọn AI.
    expect(screen.getByText(/đã lược tên, số điện thoại, địa chỉ/)).toBeInTheDocument();

    const run = screen.getByRole('button', { name: 'Lập bằng AI rồi chốt' });
    await userEvent.click(run);
    expect(state.generateAi).toHaveBeenCalledWith({ projectId: 'p1', route: 'ai_text_openai' });

    // Báo cáo lượt AI: nguồn, lý do, giả định là câu hỏi cho khách, và bảng so với bộ giải.
    expect(await screen.findByText(/Chương trình do AI lập — openai · gpt-x/)).toBeInTheDocument();
    expect(screen.getByText(/đã yêu cầu sửa một lần/)).toBeInTheDocument();
    expect(screen.getByText('Bếp mở thông phòng ăn.')).toBeInTheDocument();
    expect(screen.getByText('Không có người giúp việc ở lại.')).toBeInTheDocument();
    expect(screen.getByText(/So với bộ giải nội bộ \(2 chỗ khác\)/)).toBeInTheDocument();
  });

  it('model thiếu khoá vẫn hiện nhưng MỜ kèm lý do, không biến mất', async () => {
    state.error = null;
    state.view = view();
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'AI' }));

    const option = screen.getByRole('option', {
      name: /Claude \(Anthropic\) — Chưa cấu hình khoá API/,
    });
    expect(option).toBeDisabled();
  });

  it('bản đã chốt do AI lập thì nói rõ nguồn và KHÔNG báo «đầu bài đã đổi» oan', async () => {
    // Hai nhánh không cho ra cùng mã băm nên `matchesHead` luôn false khi bản chốt là AI —
    // đọc thành «đầu bài đã đổi» là báo sai.
    state.error = null;
    const briefRef = `sha256:${'a'.repeat(64)}`;
    const base = view({ matchesHead: false, headArtifactId: `sha256:${'c'.repeat(64)}` }) as {
      program: { spaces: unknown[]; floor_allocation: unknown[] };
    };
    state.view = {
      ...base,
      head: {
        artifactId: `sha256:${'c'.repeat(64)}`,
        generator: {
          kind: 'ai',
          provider: 'openai',
          model: 'gpt-x',
          rationale: 'Ưu tiên phòng khách thông bếp.',
        },
        program: {
          brief_ref: briefRef,
          spaces: [
            {
              id: 'living_1',
              type: 'living',
              floor: 1,
              min_area_m2: 14,
              target_area_m2: 31,
              max_area_m2: 40,
            },
          ],
          floor_allocation: [{ floor: 1, usable_area_m2: 90, allocated_area_m2: 31 }],
        },
      },
    };
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findByText(/Đã chốt bản do AI lập/)).toBeInTheDocument();
    expect(screen.queryByText(/Đầu bài đã đổi/)).not.toBeInTheDocument();
    expect(screen.getByText(/Bản đã chốt do AI lập — openai · gpt-x/)).toBeInTheDocument();
    expect(screen.getByText('Ưu tiên phòng khách thông bếp.')).toBeInTheDocument();
    // Bảng mặc định hiện bản AI (31 m²), không phải bản bộ giải (22 m²).
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.queryByText('22')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Bộ giải nội bộ (đối chiếu)' }));
    expect(screen.getByText('22')).toBeInTheDocument();
  });
});
