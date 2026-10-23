/**
 * Tab «AI Design» — dựng thật trong bộ nhớ, không gọi mạng.
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
  liveRun: null as unknown,
  facadeUploads: 0,
  cancel: vi.fn(() => Promise.resolve({ stopped: true })),
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
  useAiCostHistory: () => ({ data: { runs: [], calls: [] }, isLoading: false }),
  useUploadedDrawings: (_projectId: string, drawing: string) => ({
    data: {
      items:
        drawing === 'facade'
          ? Array.from({ length: state.facadeUploads }, (_, i) => ({ uploadId: `u${i}` }))
          : [],
    },
  }),
  // Nhật ký chi phí: rỗng — phép thử ở đây không nói về tiền (xem `ai-usage.test.tsx`).
  useAiCallLog: () => ({ data: [], isLoading: false, isError: false, error: null }),
  useAiCallPrompts: () => ({ data: new Set() }),
  useDownloadAiCallPrompt: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  // Theo dõi trực tiếp: dòng lượt chạy giả, lượt 1 bị bác rồi lượt 2 đang viết.
  useAiRun: () => ({ data: state.liveRun }),
  useCancelAiRun: () => ({
    mutateAsync: state.cancel,
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
  }),
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

// Bước mặt bằng có bộ kiểm riêng (`ai/__tests__/ai-plan-step.test.tsx`, kể cả câu «chưa có đầu
// bài»); ở đây chỉ canh DẢI BƯỚC, nên thay bằng một khối rỗng.
vi.mock('../ai/ai-plan-step', () => ({ AiPlanStep: () => <div>Bước mặt bằng</div> }));
vi.mock('../ai/ai-upload-panel', () => ({ AiUploadPanel: () => null }));
// Mặt đứng / phối cảnh / bộ kết quả có bộ kiểm riêng; ở đây chỉ canh dải bước và phần «Mặt ngoài».
vi.mock('../ai/ai-facade-step', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai/ai-facade-step')>()),
  AiFacadeStep: () => <div>Phần mặt đứng</div>,
}));
vi.mock('../ai/ai-perspective-step', () => ({
  AiPerspectiveStep: () => <div>Phần phối cảnh</div>,
}));
vi.mock('../ai/ai-result-bundle', () => ({
  AiResultBundle: ({ projectCode }: { projectCode?: string | null }) => (
    <div>Gói tải về của {projectCode}</div>
  ),
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

describe('Dải bước của tab AI Design', () => {
  it('bước chưa đủ điều kiện thì mờ kèm LÝ DO, không biến mất', async () => {
    state.design = designState();
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByRole('button', { name: /^Mặt bằng/ })).toBeInTheDocument();
    // Mặt bằng đọc đầu bài + khảo sát, không chờ chương trình không gian (T45, 15/09/2026).
    expect(screen.queryByText('Cần chương trình không gian trước.')).toBeNull();
    // Chọn phương án làm nền nay ở NGAY bước Mặt đứng — chỉ chặn khi chưa xếp phương án nào.
    expect(screen.getByText('Cần xếp mặt bằng trước.')).toBeInTheDocument();
  });

  it('chưa xác nhận đầu bài thì bước mặt bằng chờ đầu bài', async () => {
    state.design = designState({ briefArtifactId: null });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByRole('button', { name: /^Mặt bằng/ })).toBeInTheDocument();
    expect(screen.getAllByText('Cần xác nhận đầu bài trước.').length).toBeGreaterThan(0);
  });

  it('không còn bước «Chương trình không gian» (gỡ 19/09/2026)', async () => {
    state.design = designState();
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByRole('button', { name: /^Mặt ngoài/ })).toBeInTheDocument();
    expect(screen.queryByText(/Chương trình không gian/)).toBeNull();
  });

  it('có đầu vào thì đủ BỐN bước theo thứ tự (Đợt 5B)', async () => {
    state.design = designState();
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} inputs={<div>Khối đầu bài</div>} />);
    const nav = await screen.findByRole('navigation', { name: 'Các bước AI Design' });
    const labels = Array.from(nav.querySelectorAll('li button')).map(
      (b) => b.textContent?.match(/^\d?(Đầu vào|Mặt bằng|Mặt ngoài|Bộ kết quả)/)?.[1],
    );
    expect(labels).toEqual(['Đầu vào', 'Mặt bằng', 'Mặt ngoài', 'Bộ kết quả']);
    // Chưa có phương án: bộ kết quả chưa đủ điều kiện, kèm lý do.
    expect(screen.getByText('Cần ít nhất một phương án mặt bằng.')).toBeInTheDocument();
  });

  it('bước mở lúc vào là ket-qua (từ ?buoc=) thì mở thẳng bộ kết quả, gói mang mã hồ sơ', async () => {
    state.design = designState({ plans: [{ artifactId: REF, createdAt: '' }] });
    renderWithApp(
      <AiDesignTab
        projectId="p1"
        projectCode="NVO-TK-2026-0001"
        readOnly
        initialStep="ket-qua"
        inputs={<div>Khối đầu bài</div>}
      />,
    );
    expect(await screen.findByText('Gói tải về của NVO-TK-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Sẵn sàng tải')).toBeInTheDocument();
  });

  it('bước «Mặt ngoài» gồm cả mặt đứng lẫn phối cảnh', async () => {
    state.design = designState({ plans: [{ artifactId: REF, createdAt: '' }] });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Mặt ngoài/ }));
    expect(screen.getByText('Phần mặt đứng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Phối cảnh' }));
    expect(screen.getByText('Phần phối cảnh')).toBeInTheDocument();
    // Chưa có mặt đứng, chưa tải bản vẽ lên: phối cảnh nói vì sao chưa dựng được.
    expect(screen.getByText(/Cần ý tưởng mặt đứng/)).toBeInTheDocument();
  });

  it('trạng thái từng bước luôn kèm chữ, không chỉ màu', async () => {
    state.design = designState({
      plans: [
        { artifactId: REF, createdAt: '' },
        { artifactId: `sha256:${'b'.repeat(64)}`, createdAt: '' },
        { artifactId: `sha256:${'c'.repeat(64)}`, createdAt: '' },
      ],
      planHeadArtifactId: REF,
      runs: {
        facade: {
          id: 'r1',
          stage: 'facade',
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

  it('lượt xếp gần nhất hỏng, chưa có phương án: bước ghi «Hỏng», không «Chưa chạy» (23/10/2026)', async () => {
    const run = (status: string) => ({
      id: 'r1',
      stage: 'plan',
      status,
      progress: {},
      result: null,
      error: null,
      createdAt: '',
      updatedAt: '',
    });
    state.design = designState({ runs: { plan: run('failed') } });
    const view = renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);
    expect(await screen.findByText('Hỏng')).toBeInTheDocument();
    expect(screen.queryByText('Chưa chạy')).toBeNull();
    view.unmount();

    state.design = designState({ runs: { plan: run('running') } });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);
    expect(await screen.findByText('Đang chạy')).toBeInTheDocument();
    expect(screen.queryByText('Chưa chạy')).toBeNull();
  });

  it('đã có phương án thì lượt hỏng sau không xoá «Có n»', async () => {
    state.design = designState({
      plans: [{ artifactId: REF, createdAt: '' }],
      runs: {
        plan: {
          id: 'r1',
          stage: 'plan',
          status: 'failed',
          progress: {},
          result: null,
          error: null,
          createdAt: '',
          updatedAt: '',
        },
      },
    });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);
    expect(await screen.findByText('Có 1')).toBeInTheDocument();
    expect(screen.queryByText('Hỏng')).toBeNull();
  });
});

describe('Mặt đứng dựng theo phương án cũ (T59)', () => {
  it('dải bước nói ra, và bước Phối cảnh chờ mặt đứng khớp mặt bằng', async () => {
    state.design = designState({
      plans: [{ artifactId: REF, createdAt: '' }],
      planHeadArtifactId: `sha256:${'b'.repeat(64)}`,
      facadeArtifactId: `sha256:${'f'.repeat(64)}`,
      facadePlanRef: REF,
    });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByText('Theo phương án cũ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Mặt ngoài/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Phối cảnh' }));
    expect(screen.getByText('Mặt đứng đang dựng theo phương án mặt bằng cũ.')).toBeInTheDocument();
  });
});

describe('Phối cảnh mở được từ bản vẽ mặt đứng tải lên (T114 Đợt 4b)', () => {
  it('chưa có ý tưởng mặt đứng AI nhưng đã tải bản vẽ lên: phần phối cảnh không báo thiếu mặt đứng', async () => {
    state.design = designState({
      plans: [{ artifactId: REF, createdAt: '' }],
      planHeadArtifactId: REF,
    });
    state.facadeUploads = 1;
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Mặt ngoài/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Phối cảnh' }));
    expect(screen.getByText('Phần phối cảnh')).toBeInTheDocument();
    expect(screen.queryByText(/Cần ý tưởng mặt đứng/)).toBeNull();
    state.facadeUploads = 0;
  });
});

describe('Ô chọn gói quy tắc', () => {
  it('tích gói nào thì báo đúng gói đó; không còn ô «Quy chuẩn quốc gia»', async () => {
    // T30 gỡ gói pháp quy khỏi nhánh AI, nên điều phải nói ra là hệ thống KHÔNG kiểm quy chuẩn.
    // Im lặng đọc thành «đã kiểm và đạt».
    const { RulePackPicker } = await import('../ai/ai-rule-pack-picker');
    const onChange = vi.fn();
    renderWithApp(
      <RulePackPicker value={{ standards: false, experience: false }} onChange={onChange} />,
    );

    expect(screen.getByText(/Không phải luật, bỏ qua được/)).toBeInTheDocument();
    // Ô tích «Quy chuẩn quốc gia» phải KHÔNG còn: một ô tích không bật gì còn tệ hơn không có ô.
    expect(screen.queryByRole('checkbox', { name: /Quy chuẩn quốc gia/ })).toBeNull();
    // 07/10/2026 Haan: bỏ các đoạn chú thích (giá, chi phí, riêng tư, «ảnh AI không đo được»)
    // khỏi màn hình. Dấu in TRÊN ảnh vẫn giữ.
    expect(screen.queryByText(AI_DISCLAIMERS.noCodeCheck)).toBeNull();

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Kinh nghiệm nghề Nhà Việt Group/ }),
    );
    expect(onChange).toHaveBeenCalledWith({ standards: false, experience: true });
  });
});
