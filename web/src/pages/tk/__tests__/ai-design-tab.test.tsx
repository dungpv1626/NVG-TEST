/**
 * Tab «Thiết kế AI» — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Bốn thứ bộ này canh, và cả bốn đều là chỗ dễ đọc sai:
 *  1. **Bước chưa đủ điều kiện thì MỜ kèm lý do, không biến mất.** Ẩn đi thì người dùng không
 *     biết tính năng tồn tại (AFD 6.5).
 *  2. **Trạng thái luôn kèm CHỮ**, không chỉ màu (CGD 6.8).
 *  3. **Số quy tắc chưa đối chiếu được luôn hiện.** Danh sách cảnh báo rỗng không phải «đạt
 *     quy chuẩn» — đây là câu người đọc dễ tự kết luận sai nhất.
 *  4. **Ô chọn model gửi TÊN TUYẾN**, không phải tên mô hình.
 */

import { describe, expect, it, vi } from 'vitest';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  design: null as unknown,
  runProgram: vi.fn((_input: { projectId: string; route: string }) => Promise.resolve({})),
}));

vi.mock('@/hooks/use-ai-design', () => ({
  useAiDesignState: () => ({
    data: state.design,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useInvalidateAiDesign: () => vi.fn(),
  useAiModels: () => ({
    data: {
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
      ],
      image: [],
      defaults: { text: 'ai_text_openai', image: null },
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/lib/design-api', () => ({
  designApi: (path: string, body: unknown) => {
    if (path === '/design/ai/program') {
      return state.runProgram(body as { projectId: string; route: string });
    }
    throw new Error(`đường dẫn không mong đợi: ${path}`);
  },
}));

const { AiDesignTab } = await import('../ai/ai-design-tab');

const REF = `sha256:${'a'.repeat(64)}`;

function designState(over: Record<string, unknown> = {}) {
  return {
    briefArtifactId: REF,
    program: null,
    plans: [],
    planHeadArtifactId: null,
    facadeArtifactId: null,
    imageSetArtifactId: null,
    runs: {},
    roomLabels: { living: 'Phòng khách', kitchen: 'Bếp', wc: 'Khu vệ sinh' },
    ...over,
  };
}

const PROGRAM = {
  schema_version: '1.0.0',
  brief_ref: REF,
  spaces: [
    { id: 'living_1', type: 'living', level: 1, target_area_m2: 28 },
    { id: 'kitchen_1', type: 'kitchen', level: 1, target_area_m2: 14 },
    { id: 'wc_1', type: 'wc', level: 2, target_area_m2: 4 },
  ],
  rationale: 'Sinh hoạt chung tầng trệt.',
  assumptions: ['Ông bà ở tầng trệt.'],
  generator: {
    kind: 'ai' as const,
    provider: 'openai',
    model: 'gpt-x',
    route: 'ai_text_openai',
    prompt_version: '1.1.0',
    repaired: false,
  },
};

describe('Dải bước của tab Thiết kế AI', () => {
  it('bước chưa đủ điều kiện thì mờ kèm LÝ DO, không biến mất', async () => {
    state.design = designState();
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByText('2. Mặt bằng từng tầng')).toBeInTheDocument();
    expect(screen.getByText('Cần chương trình không gian trước.')).toBeInTheDocument();
    expect(screen.getByText('Cần chọn một phương án mặt bằng trước.')).toBeInTheDocument();
  });

  it('trạng thái từng bước luôn kèm chữ, không chỉ màu', async () => {
    state.design = designState({
      program: { artifactId: REF, payload: PROGRAM },
      runs: {
        plan: {
          id: 'r1',
          stage: 'plan',
          status: 'running',
          progress: {},
          result: null,
          error: null,
          createdAt: '',
          updatedAt: '',
        },
      },
    });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByText('Có 3')).toBeInTheDocument();
    expect(screen.getByText('Đang chạy')).toBeInTheDocument();
  });

  it('chưa xác nhận đầu bài thì nói việc cần làm, không hiện nút chạy', async () => {
    state.design = designState({ briefArtifactId: null });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByText(/Chưa có đầu bài đã xác nhận/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lập chương trình không gian' }),
    ).not.toBeInTheDocument();
  });
});

describe('Bước chương trình không gian', () => {
  it('gửi đúng TÊN TUYẾN đã chọn, không phải tên mô hình', async () => {
    state.design = designState();
    state.runProgram.mockClear();
    state.runProgram.mockResolvedValue({
      artifactId: REF,
      reused: false,
      program: PROGRAM,
      roomLabels: { living: 'Phòng khách', kitchen: 'Bếp', wc: 'Khu vệ sinh' },
      rationale: 'Sinh hoạt chung tầng trệt.',
      assumptions: [],
      notes: {},
      buildable: { widthM: 5, depthM: 18, areaM2: 90, exact: true },
      repaired: false,
      rulePacks: { standards: true, experience: false },
      warnings: [],
      checkedRules: ['min_area_wc'],
      uncheckedRules: [
        { ruleId: 'corridor_min_width', predicate: 'min_dimension', source: 'QCVN 01:2021/BXD' },
      ],
    });

    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Lập chương trình không gian' }),
    );

    // Mặc định TẮT cả hai gói (T20, 09/09/2026): không tích gì thì mô hình thiết kế tự do.
    expect(state.runProgram).toHaveBeenCalledWith({
      projectId: 'p1',
      route: 'ai_text_openai',
      rulePacks: { standards: false, experience: false },
    });
  });

  it('tích gói nào thì gửi đúng gói đó, và màn hình NÓI RA rằng không kiểm quy chuẩn', async () => {
    // Phép thử này trước 12/09/2026 canh hai ô tích và câu «Văn bản pháp quy, áp dụng toàn quốc».
    // Ý của nó — màn hình phải nói rõ cảnh báo đến từ luật hay từ thói quen — vẫn đúng, nhưng
    // T30 gỡ hẳn gói pháp quy khỏi nhánh AI, nên nay chỉ còn một gói và điều phải nói ra là
    // điều NGƯỢC LẠI: rằng hệ thống KHÔNG kiểm quy chuẩn. Im lặng đọc thành «đã kiểm và đạt».
    state.design = designState();
    state.runProgram.mockClear();
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(
      await screen.findByText(/Chưa chọn gói nào: mô hình thiết kế tự do/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Không phải luật, bỏ qua được/)).toBeInTheDocument();

    // Ô tích «Quy chuẩn quốc gia» phải KHÔNG còn: một ô tích không bật gì còn tệ hơn không có ô,
    // vì nó tạo cảm giác đã kiểm quy chuẩn.
    expect(screen.queryByRole('checkbox', { name: /Quy chuẩn quốc gia/ })).toBeNull();
    expect(screen.queryByText(/Văn bản pháp quy, áp dụng toàn quốc/)).toBeNull();
    // Và câu thay thế phải có mặt — do MÃ chèn, không tắt được từ giao diện (8.7).
    expect(screen.getAllByText(AI_DISCLAIMERS.noCodeCheck).length).toBeGreaterThan(0);

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Kinh nghiệm nghề Nhà Việt Group/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Lập chương trình không gian' }));

    expect(state.runProgram).toHaveBeenCalledWith({
      projectId: 'p1',
      route: 'ai_text_openai',
      rulePacks: { standards: false, experience: true },
    });
  });

  it('cảnh báo rỗng vẫn NÓI RA số quy tắc chưa đối chiếu được', async () => {
    state.design = designState();
    state.runProgram.mockResolvedValue({
      artifactId: REF,
      reused: false,
      program: PROGRAM,
      roomLabels: { living: 'Phòng khách', kitchen: 'Bếp', wc: 'Khu vệ sinh' },
      rationale: '',
      assumptions: [],
      notes: {},
      buildable: { widthM: 5, depthM: 18, areaM2: 90, exact: true },
      repaired: false,
      rulePacks: { standards: true, experience: false },
      warnings: [],
      checkedRules: ['min_area_wc'],
      uncheckedRules: [
        { ruleId: 'corridor_min_width', predicate: 'min_dimension', source: 'QCVN 01:2021/BXD' },
        { ruleId: 'setback_front_villa', predicate: 'setback', source: 'QCVN 01:2021/BXD' },
      ],
    });

    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Lập chương trình không gian' }),
    );

    expect(await screen.findByText(/2 quy tắc chưa đối chiếu được/)).toBeInTheDocument();
    expect(
      screen.getByText(/Danh sách cảnh báo rỗng không có nghĩa là đạt quy chuẩn/),
    ).toBeInTheDocument();
  });

  it('bảng nhóm theo tầng, tên phòng tiếng Việt, phòng khép kín không cộng vào tổng tầng', async () => {
    state.design = designState({
      program: {
        artifactId: REF,
        payload: {
          ...PROGRAM,
          spaces: [
            { id: 'master_bedroom_1', type: 'master_bedroom', level: 2, target_area_m2: 26 },
            { id: 'wc_1', type: 'wc', level: 2, target_area_m2: 5, ensuite_of: 'master_bedroom_1' },
          ],
        },
      },
      roomLabels: { master_bedroom: 'Phòng ngủ chính', wc: 'Khu vệ sinh' },
    });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByText('Tầng 2')).toBeInTheDocument();
    expect(screen.getByText('Phòng ngủ chính')).toBeInTheDocument();
    // Tổng tầng = 26, KHÔNG phải 31: vệ sinh khép kín nằm TRONG phòng ngủ nên diện tích của
    // nó đã nằm trong 26 m². Cộng thêm là đếm hai lần cùng một mét vuông.
    expect(screen.queryByText('31 m²')).not.toBeInTheDocument();
    // Hai chỗ hiện «26 m²»: ô tổng của tầng và dòng phòng ngủ chính.
    expect(screen.getAllByText('26 m²')).toHaveLength(2);
    expect(screen.getByText(/khép kín trong Phòng ngủ chính/)).toBeInTheDocument();
  });
});
