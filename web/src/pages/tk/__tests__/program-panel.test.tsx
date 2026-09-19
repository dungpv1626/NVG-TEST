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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  view: null as unknown,
  error: null as Error | null,
  generate: vi.fn(() => Promise.resolve({})),
  ask: vi.fn((_input: { projectId: string; route: string }) =>
    Promise.resolve({
      aiIntent: {
        route: 'ai_text_gemini_free',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        emphasis: [{ space_type: 'living', level: 'generous' }],
        add_spaces: [],
        rationale: 'Gia đình ba thế hệ sinh hoạt chung nhiều.',
      },
      notes: [],
      usage: {
        route: 'ai_text_gemini_free',
        purpose: 'program_intent',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        inputTokens: 1500,
        outputTokens: 250,
        imageCount: 0,
        latencyMs: 3200,
        status: 'ok',
        billed: false,
        costUsd: 0,
        listCostUsd: 0.00107,
      },
    }),
  ),
  askData: null as unknown,
  previewIntent: undefined as unknown,
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
  // Xem trước KHÔNG gọi mô hình: trả lại đúng bảng hiện tại, chỉ ghi nhận đề xuất được gửi lên.
  useSpaceProgramPreview: (_projectId: string, intent: unknown) => {
    state.previewIntent = intent;
    return {
      data: intent === undefined ? undefined : state.view,
      isLoading: false,
      isError: false,
      error: null,
    };
  },
  useAskProgramIntent: () => ({
    mutateAsync: async (input: { projectId: string; route: string }) => {
      const out = await state.ask(input);
      state.askData = out;
      return out;
    },
    data: state.askData,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/hooks/use-ai-design', () => ({
  useAiModels: () => ({
    data: {
      text: [
        {
          route: 'ai_text_openai',
          provider: 'openai',
          label: 'GPT-5 (OpenAI)',
          model: 'gpt-5',
          maxDataClass: 2,
          enabled: true,
          unavailableReason: null,
          imageUsd: null,
          inputPer1mUsd: 1.25,
          outputPer1mUsd: 10,
          billed: true,
        },
        {
          route: 'ai_text_gemini_free',
          provider: 'gemini',
          label: 'Gemini 2.5 Flash (gói miễn phí)',
          model: 'gemini-2.5-flash',
          maxDataClass: 3,
          enabled: true,
          unavailableReason: null,
          imageUsd: null,
          inputPer1mUsd: 0.3,
          outputPer1mUsd: 2.5,
          billed: false,
        },
      ],
      image: [],
      defaults: { text: 'ai_text_openai', image: null },
      freeProviders: ['gemini'],
    },
    isLoading: false,
    error: null,
  }),
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
          min_source: 'brief',
          target_source: 'program',
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
        { floor: 1, usable_area_m2: 90, buildable_area_m2: 90, allocated_area_m2: 22 },
        { floor: 2, usable_area_m2: 90, buildable_area_m2: 90, allocated_area_m2: 12 },
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
  // Chỗ sửa diện tích lưu nháp trong trình duyệt, và jsdom dùng chung bộ nhớ cho cả tệp.
  beforeEach(() => {
    window.localStorage.clear();
    state.generate.mockClear();
    state.ask.mockClear();
    state.askData = null;
    state.previewIntent = undefined;
  });

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
    expect(state.generate).toHaveBeenCalledWith({ projectId: 'p1', edits: [], aiIntent: null });
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

  it('ghi rõ ai quyết từng con số — không còn cột «Mong muốn» không ai mong muốn', async () => {
    state.error = null;
    state.view = view();
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findAllByRole('columnheader', { name: 'Đề xuất' })).not.toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Mong muốn' })).toBeNull();
    expect(screen.getByText('khách khai')).toBeInTheDocument();
    expect(screen.getByText('chương trình chia')).toBeInTheDocument();
  });

  it('sửa xuống dưới tối thiểu thì báo ngay cạnh ô và khoá nút chốt', async () => {
    state.error = null;
    state.view = view({ matchesHead: true, headArtifactId: `sha256:${'b'.repeat(64)}` });
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    const input = await screen.findByRole('textbox', { name: /Diện tích đề xuất — Phòng khách/ });
    await userEvent.clear(input);
    await userEvent.type(input, '10');
    expect(
      screen.getByText(/nhỏ hơn tối thiểu 14 m² — mức của khách khai ở đầu bài/),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /Chốt chương trình/ })).toBeDisabled();
  });

  it('sửa hợp lệ thì mở lại nút chốt và gửi đúng chỗ sửa', async () => {
    state.error = null;
    state.view = view({ matchesHead: true, headArtifactId: `sha256:${'b'.repeat(64)}` });
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    const input = await screen.findByRole('textbox', { name: /Diện tích đề xuất — Phòng khách/ });
    await userEvent.clear(input);
    await userEvent.type(input, '30,5');
    expect(screen.getByText(/Có 1 chỗ sửa diện tích chưa chốt/)).toBeInTheDocument();
    expect(screen.getByText(/kiến trúc sư sửa · đề xuất 22/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Chốt chương trình/ }));
    expect(state.generate).toHaveBeenCalledWith({
      projectId: 'p1',
      edits: [{ space_id: 'living_1', target_area_m2: 30.5 }],
      aiIntent: null,
    });
  });

  it('bản chốt có chỗ sửa thì mở ra đúng những chỗ ấy, và trả về số đề xuất được', async () => {
    state.error = null;
    state.view = view({
      matchesHead: true,
      headArtifactId: `sha256:${'b'.repeat(64)}`,
      headEdits: [{ space_id: 'living_1', target_area_m2: 25 }],
    });
    renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    const input = await screen.findByRole('textbox', { name: /Diện tích đề xuất — Phòng khách/ });
    expect(input).toHaveValue('25');
    expect(screen.getByText(/Đã chốt/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /Trả về số chương trình đề xuất — Phòng khách/ }),
    );
    expect(input).toHaveValue('22');
    expect(screen.getByText(/Đã bỏ các chỗ sửa của bản đang chốt/)).toBeInTheDocument();
  });

  it('mở màn hình KHÔNG gọi AI; bấm «Hỏi AI» mới gọi, chọn sẵn model miễn phí, hiện token và chi phí', async () => {
    state.error = null;
    state.view = view({ matchesHead: true, headArtifactId: `sha256:${'b'.repeat(64)}` });
    const { rerender } = renderWithApp(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(await screen.findByText(/Chưa dùng đề xuất AI/)).toBeInTheDocument();
    expect(state.ask).not.toHaveBeenCalled();
    // Bước này gửi bản tóm tắt ẩn danh (hạng 3): model gói miễn phí dùng được và được chọn sẵn.
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('ai_text_gemini_free');
    expect(screen.getByText(/Gói miễn phí — không phát sinh tiền/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hỏi AI' }));
    expect(state.ask).toHaveBeenCalledWith({ projectId: 'p1', route: 'ai_text_gemini_free' });
    rerender(<ProgramPanel projectId="p1" readOnly={false} />);

    expect(
      await screen.findByText('Gia đình ba thế hệ sinh hoạt chung nhiều.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/chưa chốt — bấm «Chốt chương trình không gian» để dùng/),
    ).toBeInTheDocument();
    const usage = screen.getByTestId('ai-usage');
    expect(usage).toHaveTextContent('1.500 token vào · 250 token ra');
    expect(usage).toHaveTextContent('0 USD (gói miễn phí) — theo giá trả phí ≈ 0,0011 USD');

    // Đề xuất chưa chốt mở lại nút chốt, và chốt gửi kèm đúng đề xuất ấy.
    await userEvent.click(screen.getByRole('button', { name: /Chốt chương trình/ }));
    expect(state.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        aiIntent: expect.objectContaining({ model: 'gemini-2.5-flash' }),
      }),
    );
  });

  it('phòng ngủ ghi rõ của ai, tiện ích trong phòng gộp vào tên', async () => {
    state.error = null;
    const base = view();
    state.view = {
      ...base,
      program: {
        ...base.program,
        spaces: [
          ...base.program.spaces,
          {
            id: 'bedroom_1',
            type: 'bedroom',
            floor: 1,
            min_area_m2: 13.5,
            target_area_m2: 16,
            max_area_m2: 25,
            min_source: 'practice',
            target_source: 'program',
            occupant: 'Ông bà · 2 người',
            includes: ['closet', 'study'],
          },
        ],
      },
      roomLabels: { ...base.roomLabels, bedroom: 'Phòng ngủ' },
    };
    renderWithApp(<ProgramPanel projectId="p1" readOnly />);

    const cell = (await screen.findByText('Ông bà · 2 người')).closest('td')!;
    // Nhãn tiện ích lấy từ ô nhu cầu của biểu mẫu đầu bài: «Góc làm việc», không phải «Phòng làm việc».
    expect(cell).toHaveTextContent('Phòng ngủ (có tủ đồ, góc làm việc)');
  });

  it('giải thích con số sàn mỗi tầng từng bước, ở đầu màn hình', async () => {
    state.error = null;
    state.view = view({
      plateExplanation: {
        site: { widthM: 15, depthM: 20, areaM2: 300 },
        rect: { widthM: 15, depthM: 20 },
        setbacks: { front: 3, back: 2, left: 0, right: 0 },
        yards: { front: 3, back: 0, left: 2, right: 0 },
        afterSetbacks: { widthM: 13, depthM: 15, areaM2: 195 },
        maxDensity: 0.6,
        densityDeclared: 0.8,
        densityRule: { value: 0.6, source: 'tỉnh X' },
        byDensityM2: 180,
        buildableM2: 180,
        floors: 2,
        roomDemandM2: 330,
        circulationRatio: 0.12,
        evenShareM2: 187.5,
        heaviest: { floor: 1, plateM2: 210 },
        plateM2: 180,
        limitedBy: 'buildable',
      },
    });
    renderWithApp(<ProgramPanel projectId="p1" readOnly />);

    const box = (await screen.findByText('Vì sao sàn mỗi tầng là 180 m²')).closest('section')!;
    expect(box).toHaveTextContent('Đất 15 m × 20 m, diện tích 300 m²');
    expect(box).toHaveTextContent(
      'trước 3 m · sau 2 m · trái 2 m (sân) · phải 0 m → còn 13 m × 15 m = 195 m²',
    );
    // Nói đủ hai nguồn và nguồn nào thắng — người vừa gõ 80% ở Đầu bài phải hiểu vì sao ra 60%.
    expect(box).toHaveTextContent(
      'Mật độ xây dựng tối đa: đầu bài khai 80%, gói quy tắc (tỉnh X) 60% — lấy mức chặt hơn: 60% × 300 m² = 180 m²',
    );
    expect(box).toHaveTextContent('Số đầu bài khai (80%) cao hơn gói quy tắc nên không được dùng');
    expect(box).toHaveTextContent('tầng 1 cần nhiều nhất: 210 m²');
    expect(box).toHaveTextContent('lớn hơn sàn xây được, nên sàn dừng ở trần xây được');
    // Không có chỗ sửa nào thì không được nói «chỗ sửa đang nới sàn».
    expect(box).not.toHaveTextContent('Chỗ sửa diện tích');
  });

  it('chỉ xem thì không có nút chốt', async () => {
    state.error = null;
    state.view = view();
    renderWithApp(<ProgramPanel projectId="p1" readOnly />);

    expect(await screen.findByText('Phòng khách')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chốt chương trình/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

// Ba bài kiểm nhánh AI trên tab này đã GỠ ngày 09/09/2026: nhánh AI chuyển thành một dòng
// riêng với tab «Thiết kế AI», hợp đồng riêng và endpoint riêng (T15–T18). Chỗ kiểm tương
// ứng nằm ở `ai-design-tab.test.tsx` và `workers/src/design/__tests__/ai-program.test.ts`.
