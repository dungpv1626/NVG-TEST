/**
 * Bước mặt bằng — tờ SVG tất định (T22), mỗi tầng một lượt gọi (T38), cổng hỏng thì không vẽ (T39),
 * ảnh nội thất vẽ từ ảnh neo (T57).
 *
 * Bộ này canh đúng những chỗ mà một lỗi sẽ KHÔNG trông giống lỗi: tờ vẽ có tỷ lệ thật, câu «AI xếp
 * phòng, chương trình dựng tường» nằm trong DOM, và một phương án chưa xếp được thì nói lý do theo
 * tầng thay vì hiện một tờ vẽ hỏng.
 *
 * ⚠️ Ba phép thử của khối T22 từng khẳng định «không còn dấu vết nào của đường sinh ảnh». Chúng đã
 * được viết lại ngày 19/09/2026, và việc đó KHÔNG phải nới lỏng T22 — xem chú thích trong khối.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const REF = `sha256:${'a'.repeat(64)}`;

const state = vi.hoisted(() => ({
  review: null as unknown,
  run: null as unknown,
  start: vi.fn((_input: unknown) => Promise.resolve({ runId: 'r1' })),
  dxf: vi.fn((_input: unknown) => Promise.resolve()),
  edit: vi.fn((_input: unknown) => Promise.resolve({ runId: 'r-edit' })),
  hide: vi.fn((_input: unknown, _options?: unknown) => undefined),
  costHistory: { runs: [], calls: [] } as unknown,
  drawSheetImage: vi.fn((_input: unknown) =>
    Promise.resolve({
      imageArtifactId: 'sha256:img',
      level: 1,
      mime: 'image/png',
      watermark: 'Ảnh minh hoạ do AI vẽ — không đo được trên hình',
      promptVersion: '8.6.0',
      usage: null,
    }),
  ),
}));

vi.mock('@/hooks/use-ai-design', () => ({
  useAiPlanReview: () => ({ data: state.review, isLoading: false, isError: false, error: null }),
  useAiPlanSheet: () => ({
    url: 'blob:vector',
    scale: 60,
    orientation: 'portrait',
    loading: false,
    error: null,
  }),
  useAiRun: () => ({ data: state.run }),
  useChooseAiPlan: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useHideAiPlan: () => ({ mutate: state.hide, isPending: false, isError: false, error: null }),
  useInvalidateAiDesign: () => vi.fn(),
  // Lịch sử chi phí cho dòng «Chi phí ước tính» (Đợt 5B) — chỉ đọc nhật ký, không gọi mô hình.
  useAiCostHistory: () => ({ data: state.costHistory, isLoading: false }),
  // Nhật ký chi phí: rỗng — phép thử ở đây không nói về tiền (xem `ai-usage.test.tsx`).
  useAiCallLog: () => ({ data: [], isLoading: false, isError: false, error: null }),
  useAiCallPrompts: () => ({ data: new Set() }),
  useCancelAiRun: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    data: undefined,
  }),
  useDownloadAiCallPrompt: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useDownloadAiPlanDxf: () => ({
    mutateAsync: state.dxf,
    isPending: false,
    isError: false,
    error: null,
  }),
  useStartAiRun: () => ({ mutateAsync: state.start, isPending: false }),
  useEditAiPlan: () => ({ mutateAsync: state.edit, isPending: false, isError: false, error: null }),
  // T57 — ảnh mặt bằng có nội thất. `useAiPlanSheetImage` trả rỗng: tầng CHƯA vẽ là trạng thái
  // mặc định, và phép thử dưới đây nói về cái nút chứ không về một tấm ảnh đã có.
  useAiPlanSheetImage: () => ({ url: null, loading: false, error: null }),
  // Khung gộp «Ảnh mặt bằng có nội thất» (07/10/2026): nguồn «bản vẽ kỹ sư tải lên».
  useUploadedDrawings: () => ({ isLoading: false, error: null, data: { items: [] } }),
  useUploadDrawing: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useDrawFromUpload: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useDesignImage: () => ({ url: null, loading: false, error: null }),
  useDrawAiPlanSheetImage: () => ({
    mutateAsync: state.drawSheetImage,
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
  }),
  useAiModels: () => ({
    data: {
      text: [textRoute()],
      // Tuyến ảnh VẪN có trong danh mục (bước 4 phối cảnh dùng), và cố ý khai ở đây: phép thử
      // «bước mặt bằng không có ô chọn ảnh» chỉ có nghĩa khi danh mục thật sự có tuyến để chọn.
      image: [imageRoute()],
      defaults: { text: 'ai_text_openai', image: 'ai_image_gemini' },
      limits: { planCallsMax: 5 },
    },
    isLoading: false,
    error: null,
  }),
}));

const imageRoute = () => ({
  route: 'ai_image_openai',
  provider: 'openai',
  label: 'GPT Image (OpenAI)',
  model: 'gpt-image-x',
  maxDataClass: 2,
  enabled: true,
  unavailableReason: null,
  imageUsd: 0.04,
});

const textRoute = () => ({
  route: 'ai_text_openai',
  provider: 'openai',
  label: 'GPT (OpenAI)',
  model: 'gpt-x',
  maxDataClass: 2,
  enabled: true,
  unavailableReason: null,
  imageUsd: null,
});

const { AiPlanStep, failedVariantsMarkdown } = await import('../ai-plan-step');
const { buildRunReport } = await import('../run-report');

function review(over: Record<string, unknown> = {}) {
  return {
    artifactId: REF,
    createdAt: '2026-09-10T00:00:00Z',
    variantId: 'AI-A',
    variantLabel: 'Lõi thang giữa nhà',
    strategy: null,
    rationale: 'Vì sao như vậy.',
    generator: { provider: 'openai', model: 'gpt-x', prompt_version: '1.4.0' },
    wallsDerived: true,
    levels: [
      {
        level: 1,
        name: 'Tầng 1',
        scale: 60,
        orientation: 'portrait',
        notes: [],
        rooms: 6,
      },
    ],
    roomLabels: {},
    blocking: [],
    findings: [],
    rulePacks: { standards: false, experience: false },
    warnings: [],
    checkedRules: [],
    uncheckedRules: [],
    score: null,
    ...over,
  };
}

/** Điểm tối thiểu để panel điểm dựng được — chi tiết từng dòng ở `ai-plan-score.test.tsx`. */
function scoreOf() {
  return {
    scoreVersion: 1,
    currentVersion: 1,
    points: 89,
    scoredWeight: 100,
    reasonedWeight: 0,
    coSoDuLieu: '2 dự án NVO, 6 mặt bằng độc lập',
    groups: [{ code: 'C', vi: 'Giao thông', weight: 30, scoredWeight: 30, points: 24 }],
    criteria: [
      {
        code: 'C1',
        group: 'C',
        vi: 'Số phòng phải đi xuyên phòng ngủ khác mới tới',
        giaiThich: null,
        value: 0,
        score: 1,
        weight: 6,
        n: 3,
        label: 'ĐO',
        notScored: null,
        why: null,
        refs: [],
      },
    ],
  };
}

const designState = {
  briefArtifactId: REF,
  program: { artifactId: REF, payload: {} },
  plans: [{ artifactId: REF, createdAt: '2026-09-10T00:00:00Z' }],
  planHeadArtifactId: REF,
  facadeArtifactId: null,
  imageSetArtifactId: null,
  runs: {},
  roomLabels: {},
};

function show() {
  renderWithApp(<AiPlanStep projectId="p1" readOnly={false} state={designState as never} />);
}

describe('Tờ mặt bằng — tờ SVG tất định là tờ CHÍNH (T22, 12/09/2026)', () => {
  // Đảo T21. Trước đó tờ do mô hình ảnh vẽ là bản mặc định và tờ vector tụt xuống làm «bản đối
  // chiếu kích thước»; nay đường sinh ảnh cho mặt bằng đã gỡ hẳn. Lý do: một tấm ảnh không bao
  // giờ đo được, nên giữ nó làm tờ chính thì mục tiêu «nâng cao độ chính xác» không thể đạt được
  // bằng định nghĩa.
  it('hiện tờ vẽ kèm CHIP TỶ LỆ — tờ này có tỷ lệ thật, khác tờ ảnh', () => {
    state.review = review();
    show();
    expect(screen.getByText(/Tỷ lệ 1:60/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Tờ mặt bằng Tầng 1/ })).toHaveAttribute(
      'src',
      'blob:vector',
    );
  });

  // Haan, 20/09/2026: «có thêm option xem các bản vẽ output với kích thước vừa, hiện tại đang quá
  // lớn». Trước đó tờ vẽ luôn kéo kín bề ngang panel — trên màn hình 1920 là gần 1.400 px, phải
  // cuộn dọc mới xem hết một tờ A3 ngang.
  it('cỡ xem mặc định là «Vừa»; chọn «Tràn khung» thì bỏ chặn bề ngang', async () => {
    state.review = review();
    show();
    const sheet = screen.getByRole('img', { name: /Tờ mặt bằng Tầng 1/ });
    expect(sheet.style.maxWidth).toBe('720px');

    await userEvent.click(screen.getByRole('button', { name: 'Tràn khung' }));
    expect(sheet.style.maxWidth).toBe('');

    // Trả lại mặc định: kho cỡ xem nằm ở mức mô-đun nên sống qua các phép thử sau trong tệp này.
    await userEvent.click(screen.getByRole('button', { name: 'Vừa' }));
    expect(sheet.style.maxWidth).toBe('720px');
  });

  it('nút tải là SVG, không phải PNG', () => {
    state.review = review();
    show();
    const link = screen.getByRole('link', { name: /Tải SVG tầng 1/ });
    expect(link).toHaveAttribute('href', 'blob:vector');
    expect(link).toHaveAttribute('download', expect.stringContaining('.svg'));
  });

  it('nút tải DXF xuất CẢ phương án đang xem — mọi tầng một tệp (Q-45a)', async () => {
    state.review = review();
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Tải DXF cả nhà' }));
    expect(state.dxf).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: (state.review as { artifactId: string }).artifactId }),
    );
  });

  it('có HAI ô chọn model, mỗi ô cạnh đúng việc nó ăn vào (T57)', () => {
    // Từ 13/09 tới 19/09 ở đây chỉ có MỘT ô: T22 gỡ đường sinh ảnh, nên ô chọn model ảnh còn lại
    // là ô không nối vào việc gì — Haan bắt được trên màn hình. T57 đưa ô ấy trở lại, nhưng đặt
    // trong panel «Ảnh mặt bằng có nội thất», ngay cạnh cái nút tiêu tiền của nó. Hai ô cạnh nhau
    // ở đầu bước mới là thứ bị cấm, vì khi ấy không ai biết ô nào ăn vào việc nào.
    state.review = review();
    show();
    expect(screen.getAllByLabelText(/^Model$/)).toHaveLength(2);
    // 07/10/2026 Haan: bỏ các đoạn chú thích (giá, chi phí, riêng tư, «ảnh AI không đo được»)
    // khỏi màn hình. Dấu in TRÊN ảnh vẫn giữ.
    expect(screen.queryByText(/Ảnh gửi đi không mang khung tên/)).toBeNull();
  });

  it('ô chọn model ghi rõ TÊN MÔ HÌNH, không chỉ nhãn của tuyến (19/09/2026)', () => {
    // Nhãn tuyến là chữ chung («GPT Image (OpenAI)») trong khi mỗi nhà cung cấp có nhiều mô hình
    // ảnh khác nhau về giá lẫn chất lượng, và nhật ký `design_ai_call` ghi theo TÊN MÔ HÌNH. Không
    // hiện tên ấy thì không đối chiếu được tấm ảnh trên màn hình với dòng tiền trong nhật ký.
    state.review = review();
    show();
    // Từ 07/10/2026 nút thu gọn chỉ còn tên ngắn (Haan, theo mẫu); tên model THẬT nằm ở `title`
    // của nút để vẫn đối chiếu được với nhật ký chi phí.
    expect(
      screen.getAllByRole('button', { name: /Đổi model/ }).some((b) => /gpt-image-x/.test(b.title)),
    ).toBe(true);
  });

  it('vẽ được ảnh cho TẦNG KHÁC tầng đang xem, tờ vector không rời chỗ (19/09/2026)', async () => {
    state.review = review({
      levels: [
        { level: 1, name: 'Tầng 1', scale: 60, orientation: 'portrait', notes: [], rooms: 6 },
        { level: 2, name: 'Tầng 2', scale: 60, orientation: 'portrait', notes: [], rooms: 5 },
      ],
    });
    show();
    const panel = screen
      .getByRole('heading', { name: 'Ảnh mặt bằng có nội thất' })
      .closest('section')!;
    await userEvent.click(within(panel).getByRole('button', { name: 'Tầng 2' }));
    await userEvent.click(within(panel).getByRole('button', { name: /Vẽ ảnh nội thất tầng 2/i }));
    expect(state.drawSheetImage).toHaveBeenCalledWith(expect.objectContaining({ level: 2 }));
    // Panel tờ vector vẫn ở tầng 1: đổi tầng để vẽ ảnh không được kéo người đọc rời tờ đang đọc.
    expect(screen.getByRole('img', { name: /Tờ mặt bằng Tầng 1/ })).toBeInTheDocument();
  });

  it('nút vẽ ảnh nội thất gọi đúng phương án và đúng tầng đang xem (T57)', async () => {
    state.review = review();
    show();
    await userEvent.click(screen.getByRole('button', { name: /Vẽ ảnh nội thất tầng 1/i }));
    expect(state.drawSheetImage).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        artifactId: (state.review as { artifactId: string }).artifactId,
        level: 1,
        route: 'ai_image_openai',
      }),
    );
  });

  it('không còn dòng «Giá niêm yết» dưới ô chọn model (07/10/2026)', () => {
    state.review = review();
    show();
    expect(screen.queryByText(/Giá niêm yết/)).toBeNull();
  });

  it('tấm ảnh KHÔNG thay tờ vector: nó ở panel riêng, dưới tờ vector (T22)', () => {
    state.review = review();
    show();
    const sheet = screen.getByRole('img', { name: /Tờ mặt bằng Tầng 1/ });
    const panel = screen.getByRole('heading', { name: 'Ảnh mặt bằng có nội thất' });
    expect(sheet.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('nói AI xếp phòng và chương trình dựng tường (T23) — không còn câu của lượt cứu hộ', () => {
    state.review = review();
    show();

    // Câu này phải có mặt ở CẢ tờ vẽ và màn hình: tờ vẽ đi ra ngoài (in, gửi khách) còn màn hình
    // thì không, nên một chỗ là không đủ (CLAUDE.md 8.7 — nhãn do mã chèn, không tắt được).
    expect(screen.getByText(/AI xếp phòng, chương trình dựng tường/)).toBeInTheDocument();
    // Và KHÔNG còn câu cũ của T19. Nó mô tả một lần cứu hộ («sau một lượt sửa mà tường khai vẫn
    // không bao kín phòng») — một chuyện không còn xảy ra được, vì mô hình thôi khai tường.
    expect(screen.queryByText(/sau một lượt sửa/)).not.toBeInTheDocument();
  });

  it('ghi chú của bộ vẽ vẫn hiện — chỗ chương trình tự xử lý không được im lặng', () => {
    state.review = review({
      levels: [
        {
          level: 1,
          name: 'Tầng 1',
          scale: 60,
          orientation: 'portrait',
          notes: [{ code: 'label_dropped', message: 'Bỏ nhãn phòng quá nhỏ: WC 1.' }],
          rooms: 6,
        },
      ],
    });
    show();
    expect(screen.getByText(/Bỏ nhãn phòng quá nhỏ/)).toBeInTheDocument();
  });
});

describe('Mục «Điểm chất lượng» tạm ẩn (Haan, 07/10/2026)', () => {
  it('không hiện panel điểm chi tiết, điểm tổng vẫn ở chip đầu tờ vẽ', () => {
    state.review = review({ score: scoreOf(), acceptPercent: 60 });
    show();
    expect(screen.queryByRole('heading', { name: 'Điểm chất lượng' })).toBeNull();
    expect(screen.getByText(/Điểm 89%/)).toBeInTheDocument();
  });
});

describe('Một khung «Ảnh mặt bằng có nội thất», hai nguồn (07/10/2026)', () => {
  it('có phương án: mặc định vẽ từ mặt bằng AI, chuyển được sang bản vẽ kỹ sư tải lên', async () => {
    state.run = null;
    state.review = review();
    show();
    expect(screen.getAllByRole('heading', { name: 'Ảnh mặt bằng có nội thất' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Vẽ ảnh nội thất tầng 1/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bản vẽ kỹ sư tải lên' }));
    expect(screen.getByText(/Tải mặt bằng một tầng/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vẽ ảnh nội thất tầng 1/i })).toBeNull();
  });

  it('chưa có phương án AI: khung vẫn hiện, mở sẵn nguồn bản vẽ kỹ sư', () => {
    state.run = null;
    state.review = null;
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={{ ...designState, plans: [], planHeadArtifactId: null } as never}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Ảnh mặt bằng có nội thất' })).toBeInTheDocument();
    expect(screen.getByText(/Tải mặt bằng một tầng/)).toBeInTheDocument();
  });
});

describe('Xem toàn màn hình', () => {
  it('mở hộp xem tờ vẽ, đóng bằng Esc — không dùng chế độ toàn màn hình của trình duyệt', async () => {
    state.run = null;
    state.review = review();
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Xem toàn màn hình' }));
    expect(screen.getByRole('dialog', { name: /Phương án 1 · Tầng 1/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Mỗi tầng một lượt, cổng hỏng thì không vẽ (T38, T39)', () => {
  function failedRun() {
    return {
      id: 'r1',
      stage: 'plan',
      status: 'failed',
      progress: {
        steps: [
          { id: 'plan:AI-A:L1:propose', label: 'Xếp tầng 1 · AI-A', status: 'done' },
          { id: 'plan:AI-A:L2:resample', label: 'Xếp lại tầng 2 · AI-A', status: 'done' },
        ],
      },
      result: {
        plans: [],
        failed: [
          {
            variantId: 'AI-A',
            error: 'Chưa xếp được tầng 2: Phòng "master_bedroom_1" ở tầng 2 không có cửa.',
            reasons: [
              {
                level: 2,
                messages: [
                  'Phòng "master_bedroom_1" ở tầng 2 không có cửa hay ô thông nào mở vào.',
                ],
              },
            ],
          },
        ],
      },
      error: 'Chưa xếp được tầng 2.',
      createdAt: '2026-09-13T00:00:00Z',
      updatedAt: '2026-09-13T00:05:00Z',
    };
  }

  it('chưa xếp được: thẻ tiến độ một dòng + số tiền + báo cáo; lý do CHÍNH hiện riêng, không bày danh sách bước (23/10/2026)', () => {
    state.review = null;
    state.run = failedRun();
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={{ ...designState, plans: [], planHeadArtifactId: null } as never}
      />,
    );
    const progress = within(screen.getByRole('region', { name: 'Tiến độ' }));
    expect(progress.getByText('Chưa xếp được mặt bằng')).toBeInTheDocument();
    expect(progress.getByText(/Chi phí:/)).toBeInTheDocument();
    expect(progress.getByRole('button', { name: 'Tải báo cáo (.md)' })).toBeInTheDocument();
    expect(progress.getByRole('button', { name: 'Chạy lại' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Phương án chưa xếp được' })).toBeNull();
    // Lượt chạy thật 23/10/2026: «Chưa xếp được» trơn không nói phải sửa gì. Lý do chính hiện bằng
    // chữ (T07/10 gỡ danh sách bước và lý do từng lượt — phần ấy vẫn chỉ ở báo cáo).
    const reasons = within(screen.getByRole('region', { name: 'Lý do chưa xếp được' }));
    expect(reasons.getByText('Tầng 2')).toBeInTheDocument();
    expect(reasons.getByText(/không có cửa hay ô thông nào mở vào/)).toBeInTheDocument();
    expect(screen.queryByText('Xếp lại tầng 2 · AI-A')).toBeNull();
    expect(screen.queryByRole('img', { name: /Tờ mặt bằng/ })).toBeNull();
    state.run = null;
  });

  it('báo cáo: lý do THEO TẦNG của phương án chưa xếp được', () => {
    const md = failedVariantsMarkdown(failedRun().result.failed as never);
    expect(md).toContain('## Phương án chưa xếp được');
    expect(md).toContain('#### Tầng 2');
    expect(md).toMatch(/không có cửa hay ô thông nào mở vào/);
  });

  it('báo cáo: tầng gọi lần hai có lỗi của CẢ HAI lượt, cách gọi lần hai và chỗ chương trình tự sửa', () => {
    const run = failedRun();
    run.result.failed[0]!.reasons = [
      {
        level: 1,
        firstMessages: ['Phòng "storage_1" ở tầng 1 không có cửa.'],
        retry: 'revise',
        messages: [
          'Phòng "bedroom_2" ở tầng 1 không có cửa (đang giáp: closet_1, storage_1, wc_2).',
        ],
        notes: ['Bỏ cửa "circulation_1–bedroom_2" ở tầng 1: hai phòng không chung bức vách nào.'],
      },
    ] as never;
    const md = failedVariantsMarkdown(run.result.failed as never);
    expect(md).toContain('Lượt đầu — 1 lỗi:');
    expect(md).toMatch(/"storage_1" ở tầng 1 không có cửa/);
    expect(md).toMatch(/Lượt cuối — AI sửa ý định \(gửi kèm ý định lượt trước\) — 1 lỗi:/);
    expect(md).toContain('đang giáp: closet_1, storage_1, wc_2');
    expect(md).toContain('Chương trình đã tự sửa:');
    expect(md).toContain('Bỏ cửa "circulation_1–bedroom_2"');
  });

  it('báo cáo: đủ các bước như Worker đặt, lỗi lượt chạy, lượt gọi kèm nguyên văn lời gọi', () => {
    const run = failedRun();
    const md = buildRunReport({
      title: 'Báo cáo lượt xếp mặt bằng',
      projectId: 'p1',
      run: run as never,
      calls: [
        {
          id: 'c1',
          created_at: '2026-09-13T00:01:00Z',
          route: 'r',
          provider: 'openai',
          model: 'gpt-x',
          purpose: 'plan_house',
          input_tokens: 1200,
          output_tokens: 800,
          image_count: 0,
          latency_ms: 31000,
          status: 'ok',
          error_code: null,
          cost_usd: 0.05,
        },
      ],
      prompts: new Map([['c1', 'LỜI GỌI | có ``` bên trong']]),
      totalUsd: 0.05,
      extra: failedVariantsMarkdown(run.result.failed as never),
    });
    expect(md).toContain('| 2 | Xếp lại tầng 2 · AI-A | Xong |');
    expect(md).toContain('## Lỗi của lượt chạy');
    expect(md).toContain('Chưa xếp được tầng 2.');
    expect(md).toContain('gpt-x');
    // Nguyên văn lời gọi nằm trong rào mã dài hơn mọi chuỗi ``` bên trong — không vỡ khối.
    expect(md).toContain('````\nLỜI GỌI | có ``` bên trong\n````');
    expect(md).toContain('#### Tầng 2');
    expect(md).toContain('0.050 USD');
  });

  it('chip nói tầng nào đã phải xếp lại — không dùng chữ «sửa» của lượt vá cũ', () => {
    state.review = review({
      generator: {
        provider: 'openai',
        model: 'gpt-x',
        prompt_version: '2.0.0',
        repaired: true,
        layout: 'tree',
        resampled_levels: [2],
      },
    });
    show();
    expect(screen.getByText(/đã xếp lại tầng 2/)).toBeInTheDocument();
    expect(screen.queryByText(/đã sửa một lần/)).toBeNull();
  });

  it('lời giới thiệu nói luồng một lượt cho cả nhà, đầu vào chỉ là đầu bài, và trần ba lần sửa (T45)', () => {
    state.review = review();
    show();
    expect(screen.getByText(/chỉ dựa trên đầu bài và khảo sát/)).toBeInTheDocument();
    expect(screen.getByText(/sau bốn lần/)).toBeInTheDocument();
    expect(screen.getByText(/diện tích tối\s+thiểu thì phải đạt/)).toBeInTheDocument();
  });

  it('chưa xác nhận đầu bài thì không cho chạy — không phải chờ chương trình không gian', () => {
    state.review = null;
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={{ ...designState, briefArtifactId: null, program: null } as never}
      />,
    );
    expect(screen.getByText(/Chưa có đầu bài đã xác nhận/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xếp mặt bằng' })).toBeNull();
  });

  it('báo cáo: tầng không gọi lại vì lỗi hình học nói thẳng là không gọi lại và làm gì tiếp', () => {
    const run = failedRun();
    run.result.failed[0]!.reasons = [
      {
        level: 2,
        retry: 'none',
        messages: [
          'Phòng "stair_2" ở tầng 2 chỉ chia được ô 1.29 × 5.94 m — dài hơn 4 lần bề ngang.',
        ],
      },
    ] as never;
    const md = failedVariantsMarkdown(run.result.failed as never);
    expect(md).toContain('dài hơn 4 lần bề ngang');
    expect(md).toMatch(/Không gọi lại mô hình: lỗi còn lại không nằm ở thứ AI khai/);
    expect(md).toContain('Chạy lại để AI khai một ý định khác');
    expect(md).not.toContain('Lượt đầu —');
  });
});

describe('Mặc định MỘT phương án, và mức suy nghĩ đi kèm lượt chạy (13/09/2026)', () => {
  it('bấm xếp mặt bằng ngay thì gửi 1 phương án; chọn mức suy nghĩ thì gửi kèm', async () => {
    state.review = null;
    state.run = null;
    state.start.mockClear();
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Đổi mức suy nghĩ/ }));
    await userEvent.click(screen.getByRole('radio', { name: /^Cao/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Xếp mặt bằng' }));
    // Hỏi lại trước khi tiêu tiền (23/10/2026) — chưa gọi gì cho tới khi xác nhận.
    const dialog = screen.getByRole('dialog', { name: /Xếp một phương án mặt bằng\?/ });
    expect(state.start).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xếp mặt bằng' }));
    expect(state.start).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ count: 1, reasoningEffort: 'high' }),
      }),
    );
  });

  it('hộp hỏi lại nói số lượt sửa tối đa và trần chi phí; «Chưa chạy» thì không gọi gì', async () => {
    state.review = null;
    state.run = null;
    state.start.mockClear();
    state.costHistory = {
      runs: [
        {
          id: 'r0',
          project_id: 'p9',
          status: 'failed',
          result: { plans: [], failed: [{}] },
          created_at: '2026-10-01T10:00:00Z',
          updated_at: '2026-10-01T10:05:00Z',
        },
      ],
      calls: [
        {
          project_id: 'p9',
          created_at: '2026-10-01T10:01:00Z',
          route: 'ai_text_openai',
          purpose: 'plan_house',
          status: 'ok',
          input_tokens: 4000,
          output_tokens: 12000,
          cost_usd: '0.15',
        },
        {
          project_id: 'p9',
          created_at: '2026-10-01T10:02:00Z',
          route: 'ai_text_openai',
          purpose: 'plan_house_revise',
          status: 'ok',
          input_tokens: 7000,
          output_tokens: 9000,
          cost_usd: '0.05',
        },
      ],
    };
    show();
    await userEvent.click(screen.getByRole('button', { name: /^Xếp mặt bằng/ }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/tối đa 4 lượt sửa mỗi phương án \(5 lượt gọi\)/)).toBeInTheDocument();
    // 0,1 USD mỗi lượt gọi × 5 lượt = 0,5 USD.
    expect(dialog.getByText(/Trần nếu phải dùng hết: ≈ 0,5/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Chưa chạy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.start).not.toHaveBeenCalled();
    state.costHistory = { runs: [], calls: [] };
  });
});

describe('Ý định bố cục của AI (T43, 14/09/2026)', () => {
  const intentLevel = (relaxed = 0) => ({
    level: 1,
    name: 'Tầng 1',
    scale: 60,
    orientation: 'portrait',
    notes: [],
    rooms: 3,
    intent: {
      rooms: [
        { id: 'garage_1', zone: 'front', street_facing: true },
        { id: 'living_1', zone: 'center', street_facing: false },
        { id: 'stair_1', zone: 'back_right', street_facing: false },
      ],
      relationships: [{ a: 'garage_1', b: 'living_1', kind: 'adjacent' }],
      entry_room: 'garage_1',
      garage_room: 'garage_1',
    },
    arrange: { candidates: 24, passed: 7, intent_fit: 0.88, parti: 'full|zones', relaxed },
  });
  const intentGenerator = {
    provider: 'openai',
    model: 'gpt-x',
    prompt_version: '3.0.0',
    walls_derived: true,
    layout: 'intent',
  };

  it('artifact dựng từ ý định: câu nhãn nói AI khai ý định, chương trình xếp phòng', () => {
    state.review = review({ generator: intentGenerator, levels: [intentLevel()] });
    show();
    expect(
      screen.getByText(/AI khai ý định bố cục, chương trình xếp phòng và dựng tường/),
    ).toBeInTheDocument();
  });

  it('panel ý định: vùng bằng chữ tiếng Việt, cửa chính, quan hệ, số cách xếp và độ khớp ý đồ', () => {
    state.review = review({
      generator: intentGenerator,
      levels: [intentLevel()],
      roomLabels: { garage: 'Để xe', living: 'Phòng khách', stair: 'Thang bộ' },
    });
    show();
    expect(screen.getByRole('heading', { name: 'Ý định bố cục của AI' })).toBeInTheDocument();
    expect(screen.getByText('Khớp ý đồ 88%')).toBeInTheDocument();
    expect(screen.getByText(/dựng 24 cách xếp từ ý định này, 7 cách qua/)).toBeInTheDocument();
    expect(screen.getByText(/Để xe \(garage_1\) · cửa chính · cửa xe/)).toBeInTheDocument();
    expect(screen.getByText('Sau, bên phải')).toBeInTheDocument();
    expect(
      screen.getByText(/Để xe \(garage_1\) chung vách với Phòng khách \(living_1\)/),
    ).toBeInTheDocument();
    // Mã vùng thô không lọt ra màn hình (CLAUDE.md 4.1).
    expect(screen.queryByText('back_right')).toBeNull();
    expect(screen.queryByText(/đã nới vùng/)).toBeNull();
  });

  it('bộ giải đã nới vùng thì nói ra — tờ vẽ khác lời AI không được im lặng', () => {
    state.review = review({ generator: intentGenerator, levels: [intentLevel(1)] });
    show();
    expect(screen.getByText(/đã nới vùng của một số phòng/)).toBeInTheDocument();
  });

  it('artifact dựng theo cây (trước 14/09/2026) không có panel ý định, giữ câu nhãn cũ', () => {
    state.review = review();
    show();
    expect(screen.queryByRole('heading', { name: 'Ý định bố cục của AI' })).toBeNull();
    expect(screen.getByText(/AI xếp phòng, chương trình dựng tường/)).toBeInTheDocument();
  });
});

describe('Điểm, ngưỡng và bản sửa — sau khi gỡ ô yêu cầu sửa (07/10/2026)', () => {
  const scored = (points: number) => ({ ...scoreOf(), points, scoredWeight: 100 });

  it('điểm từ 65 trở lên: «Đạt ngưỡng 65»; dưới 65: «Dưới ngưỡng 65» — ở đầu tờ vẽ', () => {
    state.run = null;
    state.review = review({ score: scored(70), acceptPercent: 65, editable: true });
    const first = renderWithApp(
      <AiPlanStep projectId="p1" readOnly={false} state={designState as never} />,
    );
    expect(screen.getByText(/Đạt ngưỡng 65/)).toBeInTheDocument();
    first.unmount();
    state.review = review({ score: scored(60), acceptPercent: 65, editable: true });
    show();
    expect(screen.getByText(/Dưới ngưỡng 65/)).toBeInTheDocument();
  });

  it('ô yêu cầu sửa đặt lại (Đợt 5B): gửi đúng phương án, tuyến và câu yêu cầu', async () => {
    state.run = null;
    state.edit.mockClear();
    state.review = review({ editable: true });
    show();
    await userEvent.type(screen.getByLabelText(/Nội dung cần sửa/), 'bỏ vách gara');
    await userEvent.click(screen.getByRole('button', { name: /^Sửa lại/ }));
    expect(state.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        artifactId: REF,
        instruction: 'bỏ vách gara',
        route: 'ai_text_openai',
      }),
    );
  });

  it('hồ sơ chỉ xem thì không có ô yêu cầu sửa', () => {
    state.run = null;
    state.review = review({ editable: true });
    renderWithApp(<AiPlanStep projectId="p1" readOnly state={designState as never} />);
    expect(screen.queryByLabelText(/Nội dung cần sửa/)).toBeNull();
  });

  it('bản sửa cũ: vẫn hiện nguyên văn yêu cầu đã dùng để đúc nó', () => {
    state.run = null;
    state.review = review({
      editable: true,
      generator: {
        provider: 'openai',
        model: 'gpt-x',
        prompt_version: '8.2.0',
        edit: { instruction: 'bỏ vách gara', base_ref: REF, ops: [] },
      },
    });
    show();
    expect(screen.getByText('bỏ vách gara')).toBeInTheDocument();
  });
});

describe('Tên phương án «Phương án N» theo thứ tự tạo (07/10/2026)', () => {
  it('đánh số cũ trước, không hiện mã AI-A', () => {
    state.run = null;
    state.review = review();
    const second = `sha256:${'b'.repeat(64)}`;
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={
          {
            ...designState,
            plans: [
              { artifactId: second, createdAt: '2026-09-11T00:00:00Z' },
              { artifactId: REF, createdAt: '2026-09-10T00:00:00Z' },
            ],
          } as never
        }
      />,
    );
    const group = screen.getByRole('group', { name: 'Phương án' });
    expect(group.textContent).toMatch(/Phương án 1.*Phương án 2/);
    expect(screen.getByRole('heading', { name: 'Phương án 1' })).toBeInTheDocument();
    expect(screen.queryByText('AI-A')).toBeNull();
  });
});

describe('Nhãn phương án cố định từ máy chủ (11/10/2026)', () => {
  it('hiện «Phương án 3.1» theo nhãn máy chủ, kèm ngày giờ tạo — xoá bản khác không đổi tên', () => {
    state.run = null;
    state.review = review();
    const second = `sha256:${'b'.repeat(64)}`;
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={
          {
            ...designState,
            plans: [
              { artifactId: second, createdAt: '2026-09-11T03:20:00Z', label: '3.1' },
              { artifactId: REF, createdAt: '2026-09-10T00:00:00Z', label: '1' },
            ],
          } as never
        }
      />,
    );
    const group = screen.getByRole('group', { name: 'Phương án' });
    expect(group.textContent).toMatch(/Phương án 1.*Phương án 3\.1/);
    expect(group.textContent).not.toMatch(/Phương án 2/);
    expect(group.textContent).toMatch(/11\/09\/2026/);
  });
});

/**
 * Xoá một phương án khỏi dải chọn (18/09/2026, Haan: «phần danh sách phương án đang bị dài»).
 *
 * Hai điều phải đúng: hộp hỏi lại là hộp TỰ DỰNG (nút tiếng Việt — `window.confirm` cho ra
 * "OK"/"Cancel" theo tiếng của trình duyệt), và bấm xoá mới gọi tuyến, bấm «Không xoá» thì không.
 */
describe('xoá phương án khỏi danh sách', () => {
  it('bấm dấu × thì HỎI LẠI, chưa gọi gì; bấm «Không xoá» thì thôi', async () => {
    state.review = review();
    state.hide.mockClear();
    show();
    await userEvent.click(screen.getByLabelText(/^Xoá .* khỏi danh sách$/));
    expect(screen.getByText(/Xoá «.*» khỏi danh sách\?/)).toBeInTheDocument();
    expect(state.hide).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Không xoá' }));
    expect(screen.queryByText(/Xoá «.*» khỏi danh sách\?/)).toBeNull();
    expect(state.hide).not.toHaveBeenCalled();
  });

  it('xác nhận thì gọi tuyến ẩn đúng phương án ấy, và nói rõ dữ liệu vẫn còn', async () => {
    state.review = review();
    state.hide.mockClear();
    show();
    await userEvent.click(screen.getByLabelText(/^Xoá .* khỏi danh sách$/));
    expect(screen.getByText(/Dữ liệu vẫn còn trong hồ sơ/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá khỏi danh sách' }));
    expect(state.hide).toHaveBeenCalledWith(
      { projectId: 'p1', artifactId: REF },
      expect.anything(),
    );
  });

  it('hộp hỏi lại là hộp THOẠI nổi, đóng được bằng Esc', async () => {
    state.review = review();
    state.hide.mockClear();
    show();
    await userEvent.click(screen.getByLabelText(/^Xoá .* khỏi danh sách$/));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent(/Xoá «.*» khỏi danh sách\?/);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.hide).not.toHaveBeenCalled();
  });

  it('chỉ xem: không có nút xoá nào', () => {
    state.review = review();
    renderWithApp(<AiPlanStep projectId="p1" readOnly state={designState as never} />);
    expect(screen.queryByLabelText(/khỏi danh sách$/)).toBeNull();
  });
});

describe('Chi phí ước tính trên nút (Đợt 5B)', () => {
  it('chưa có lượt nào bằng mô hình này: «Chưa đủ dữ liệu», nút không mang con số', () => {
    state.run = null;
    state.review = null;
    state.costHistory = { runs: [], calls: [] };
    show();
    expect(screen.getAllByTestId('cost-estimate')[0]).toHaveTextContent(/Chưa đủ dữ liệu/);
    expect(screen.getByRole('button', { name: 'Xếp mặt bằng' })).toBeInTheDocument();
  });

  it('có lượt trước: trung bình tiền thật mỗi phương án, nhân số phương án đang chọn', async () => {
    state.run = null;
    state.review = null;
    state.costHistory = {
      runs: [
        {
          id: 'r0',
          project_id: 'p9',
          status: 'done',
          result: { plans: [{}], failed: [] },
          created_at: '2026-10-01T10:00:00Z',
          updated_at: '2026-10-01T10:05:00Z',
        },
      ],
      calls: [
        {
          project_id: 'p9',
          created_at: '2026-10-01T10:01:00Z',
          route: 'ai_text_openai',
          purpose: 'plan_house',
          status: 'ok',
          input_tokens: 1000,
          output_tokens: 500,
          cost_usd: '0.1',
        },
        {
          project_id: 'p9',
          created_at: '2026-10-01T10:03:00Z',
          route: 'ai_text_cheap',
          purpose: 'plan_house_revise',
          status: 'ok',
          input_tokens: 1000,
          output_tokens: 500,
          cost_usd: 0.05,
        },
      ],
    };
    show();
    expect(
      await screen.findByRole('button', { name: /Xếp mặt bằng · ≈ 0,15 USD/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('button', { name: /Xếp mặt bằng · ≈ 0,3 USD/ })).toBeInTheDocument();
    state.costHistory = { runs: [], calls: [] };
  });
});

describe('Ba lý do trừ điểm lớn nhất (Đợt 5B)', () => {
  it('nêu ba tiêu chí mất nhiều điểm nhất, lớn trước; tiêu chí không chấm được không tính', () => {
    state.run = null;
    const crit = (
      code: string,
      vi: string,
      score: number | null,
      weight: number,
      notScored: string | null = null,
    ) => ({
      code,
      group: 'C',
      vi,
      giaiThich: null,
      value: score === null ? null : 1,
      score,
      weight,
      n: 3,
      label: 'ĐO',
      notScored,
      why: null,
      refs: code === 'C2' ? ['living_1'] : [],
    });
    state.review = review({
      roomLabels: { living: 'Phòng khách' },
      score: {
        ...scoreOf(),
        points: 70,
        criteria: [
          crit('C1', 'Tiêu chí mất ít', 0.9, 10),
          crit('C2', 'Tiêu chí mất nhiều nhất', 0.2, 10),
          crit('C3', 'Tiêu chí mất vừa', 0.5, 10),
          crit('C4', 'Tiêu chí mất nhì', 0.3, 10),
          crit('C5', 'Tiêu chí thiếu dữ liệu', null, 20, 'thieu_du_lieu'),
          crit('C6', 'Tiêu chí đạt trọn', 1, 10),
        ],
      },
    });
    show();
    const panel = screen
      .getByRole('heading', { name: 'Ba lý do trừ điểm lớn nhất' })
      .closest('section')!;
    const items = within(panel).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Tiêu chí mất nhiều nhất'),
      expect.stringContaining('Tiêu chí mất nhì'),
      expect.stringContaining('Tiêu chí mất vừa'),
    ]);
    expect(items[0]).toHaveTextContent('−8 điểm');
    expect(items[0]).toHaveTextContent('Phòng khách (living_1)');
    expect(within(panel).queryByText(/thiếu dữ liệu/)).toBeNull();
  });
});

describe('So sánh phương án cạnh nhau (Đợt 5B)', () => {
  it('hai phương án trở lên: chuyển sang «So sánh» thì mỗi phương án một cột', async () => {
    state.run = null;
    state.review = review();
    const two = {
      ...designState,
      plans: [
        { artifactId: REF, createdAt: '2026-09-10T00:00:00Z' },
        { artifactId: `sha256:${'b'.repeat(64)}`, createdAt: '2026-09-11T00:00:00Z' },
      ],
    };
    renderWithApp(<AiPlanStep projectId="p1" readOnly={false} state={two as never} />);
    await userEvent.click(screen.getByRole('button', { name: 'So sánh 2 phương án' }));
    const compare = screen.getByRole('region', { name: 'So sánh phương án' });
    expect(within(compare).getAllByRole('article')).toHaveLength(2);
    expect(within(compare).getAllByText('Ba lý do trừ điểm lớn nhất')).toHaveLength(2);
  });

  it('một phương án thì không có nút so sánh', () => {
    state.run = null;
    state.review = review();
    show();
    expect(screen.queryByRole('button', { name: /So sánh/ })).toBeNull();
  });
});

describe('Chưa có mặt bằng thì không bày khối ảnh nội thất (23/10/2026)', () => {
  it('khối ảnh nội thất gấp sau một dòng, không mở sẵn dưới «Chưa có phương án»', () => {
    state.review = null;
    state.run = null;
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={{ ...designState, plans: [], planHeadArtifactId: null } as never}
      />,
    );
    expect(screen.getByText('Chưa có phương án mặt bằng')).toBeInTheDocument();
    expect(screen.getByText(/Đã có bản vẽ mặt bằng của kỹ sư\?/)).toBeInTheDocument();
    expect(screen.getByText('Ảnh mặt bằng có nội thất')).not.toBeVisible();
  });
});
