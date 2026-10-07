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

    expect(await screen.findByRole('button', { name: /^Mặt bằng từng tầng/ })).toBeInTheDocument();
    // Mặt bằng đọc đầu bài + khảo sát, không chờ chương trình không gian (T45, 15/09/2026).
    expect(screen.queryByText('Cần chương trình không gian trước.')).toBeNull();
    expect(screen.getByText('Cần chọn một phương án mặt bằng trước.')).toBeInTheDocument();
  });

  it('chưa xác nhận đầu bài thì bước mặt bằng chờ đầu bài', async () => {
    state.design = designState({ briefArtifactId: null });
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByRole('button', { name: /^Mặt bằng từng tầng/ })).toBeInTheDocument();
    expect(screen.getAllByText('Cần xác nhận đầu bài trước.').length).toBeGreaterThan(0);
  });

  it('không còn bước «Chương trình không gian» (gỡ 19/09/2026)', async () => {
    state.design = designState();
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    expect(await screen.findByRole('button', { name: /^Phối cảnh/ })).toBeInTheDocument();
    expect(screen.queryByText(/Chương trình không gian/)).toBeNull();
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
    expect(screen.getByText('Mặt đứng đang dựng theo phương án mặt bằng cũ.')).toBeInTheDocument();
  });
});

describe('Phối cảnh mở được từ bản vẽ mặt đứng tải lên (T114 Đợt 4b)', () => {
  it('chưa có ý tưởng mặt đứng AI nhưng đã tải bản vẽ lên: dải bước không báo «Chưa đủ điều kiện»', async () => {
    state.design = designState({
      plans: [{ artifactId: REF, createdAt: '' }],
      planHeadArtifactId: REF,
    });
    state.facadeUploads = 1;
    renderWithApp(<AiDesignTab projectId="p1" readOnly={false} />);

    const step = await screen.findByRole('button', { name: /^Phối cảnh/ });
    expect(step).not.toHaveTextContent('Chưa đủ điều kiện');
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
