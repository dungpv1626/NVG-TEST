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

const { AiPlanStep } = await import('../ai-plan-step');

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

  it('nút tải là SVG, không phải PNG', () => {
    state.review = review();
    show();
    const link = screen.getByRole('link', { name: /Tải tờ mặt bằng tầng 1/ });
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
    // Câu này mô tả đúng ẢNH NEO — tờ gửi đi là phần hình, không có khung tên (dữ liệu hạng 1).
    expect(screen.getByText(/Ảnh gửi đi không mang khung tên/)).toBeInTheDocument();
  });

  it('ô chọn model ghi rõ TÊN MÔ HÌNH, không chỉ nhãn của tuyến (19/09/2026)', () => {
    // Nhãn tuyến là chữ chung («GPT Image (OpenAI)») trong khi mỗi nhà cung cấp có nhiều mô hình
    // ảnh khác nhau về giá lẫn chất lượng, và nhật ký `design_ai_call` ghi theo TÊN MÔ HÌNH. Không
    // hiện tên ấy thì không đối chiếu được tấm ảnh trên màn hình với dòng tiền trong nhật ký.
    state.review = review();
    show();
    expect(screen.getAllByRole('option', { name: /gpt-image-x/ }).length).toBeGreaterThan(0);
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

  it('hiện giá mỗi ảnh TRƯỚC khi bấm — mỗi lần bấm là tiền thật', () => {
    state.review = review();
    show();
    expect(screen.getByText(/USD mỗi ảnh/)).toBeInTheDocument();
  });

  it('tấm ảnh KHÔNG thay tờ vector: nó ở panel riêng và nói rõ mình không đo được', () => {
    // Đây là chỗ T22 còn sống trong giao diện. Tờ vector vẫn là tờ mặc định ở trên, còn panel ảnh
    // đứng dưới và tự khai mình là ảnh trình khách.
    state.review = review();
    show();
    expect(screen.getByText('Ảnh mặt bằng có nội thất')).toBeInTheDocument();
    expect(screen.getByText(/Ảnh trình khách — không thay tờ vẽ/)).toBeInTheDocument();
    expect(
      screen.getByText(/Tờ vector ở trên vẫn là bản dùng để đo và để xuất DXF/),
    ).toBeInTheDocument();
  });

  it('nói rõ kích thước trên tờ ĐO ĐƯỢC — đó là điều đổi lại khi bỏ tờ ảnh', () => {
    state.review = review();
    show();
    expect(screen.getByText(/mọi kích thước trên đây đo được/)).toBeInTheDocument();
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

describe('Panel điểm nằm SAU danh sách lỗi chặn (T24)', () => {
  it('phương án có điểm thì panel điểm hiện, và hiện dưới lỗi chặn', () => {
    // Thứ tự là một khẳng định thật, không phải chuyện trình bày: cổng dữ liệu và điểm là hai tầng
    // kết luận khác nhau, và một phương án tự mâu thuẫn thì điểm của nó không nói gì. Đặt con số
    // lên trên danh sách lỗi làm nó đọc như lời phán cuối cùng.
    state.review = review({ score: scoreOf() });
    show();

    const gate = screen.getByRole('heading', { name: 'Lỗi bộ kiểm máy còn lại' });
    const score = screen.getByRole('heading', { name: 'Điểm chất lượng' });
    expect(gate.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('phương án đúc trước khi có thước thì panel nói «Chưa chấm», không hiện 0 điểm', () => {
    state.review = review();
    show();
    expect(screen.getByText('Chưa chấm')).toBeInTheDocument();
    expect(screen.queryByText(/^điểm trên/)).toBeNull();
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

  it('phương án chưa xếp được nêu LÝ DO THEO TẦNG, và không có tờ vẽ nào cho nó', () => {
    state.review = null;
    state.run = failedRun();
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={{ ...designState, plans: [], planHeadArtifactId: null } as never}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Phương án chưa xếp được' })).toBeInTheDocument();
    expect(screen.getByText('Tầng 2')).toBeInTheDocument();
    expect(screen.getByText(/không có cửa hay ô thông nào mở vào/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Tờ mặt bằng/ })).toBeNull();
    state.run = null;
  });

  it('tầng đã gọi lần hai: hiện lỗi của CẢ HAI lượt, cách gọi lần hai, và chỗ chương trình tự sửa', () => {
    state.review = null;
    const run = failedRun();
    run.result.failed[0]!.reasons = [
      {
        level: 1,
        firstMessages: ['Phòng "storage_1" ở tầng 1 không có cửa.'],
        retry: 'revise',
        messages: [
          'Phòng "bedroom_2" ở tầng 1 không có cửa, và không giáp phòng giao thông hay sinh hoạt chung nào để mở cửa vào (đang giáp: closet_1, storage_1, wc_2).',
        ],
        notes: ['Bỏ cửa "circulation_1–bedroom_2" ở tầng 1: hai phòng không chung bức vách nào.'],
      },
    ] as never;
    state.run = run;
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={{ ...designState, plans: [], planHeadArtifactId: null } as never}
      />,
    );
    expect(screen.getByText('Lượt đầu — 1 lỗi:')).toBeInTheDocument();
    expect(screen.getByText(/"storage_1" ở tầng 1 không có cửa/)).toBeInTheDocument();
    expect(
      screen.getByText(/Lượt cuối — AI sửa ý định \(gửi kèm ý định lượt trước\) — 1 lỗi:/),
    ).toBeInTheDocument();
    expect(screen.getByText(/đang giáp: closet_1, storage_1, wc_2/)).toBeInTheDocument();
    expect(screen.getByText('Chương trình đã tự sửa:')).toBeInTheDocument();
    expect(screen.getByText(/Bỏ cửa "circulation_1–bedroom_2"/)).toBeInTheDocument();
    state.run = null;
  });

  it('nhãn bước lấy mẫu lại theo tầng hiện đúng như Worker đặt', () => {
    state.review = null;
    state.run = failedRun();
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={{ ...designState, plans: [], planHeadArtifactId: null } as never}
      />,
    );
    expect(screen.getByText('Xếp lại tầng 2 · AI-A')).toBeInTheDocument();
    state.run = null;
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
    expect(screen.getByText(/một lượt gọi mô hình cho cả nhà/)).toBeInTheDocument();
    expect(screen.getByText(/không dùng chương trình không gian/)).toBeInTheDocument();
    expect(screen.getByText(/tối đa ba lần/)).toBeInTheDocument();
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

  it('tầng không gọi lại vì lỗi hình học: nói thẳng là không gọi lại và làm gì tiếp', () => {
    state.review = null;
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
    state.run = run;
    renderWithApp(
      <AiPlanStep
        projectId="p1"
        readOnly={false}
        state={{ ...designState, plans: [], planHeadArtifactId: null } as never}
      />,
    );
    expect(screen.getByText(/dài hơn 4 lần bề ngang/)).toBeInTheDocument();
    expect(screen.getByText(/Không gọi lại mô hình: lỗi nằm ở hình học/)).toBeInTheDocument();
    expect(screen.getByText(/Chạy lại để AI khai một ý định khác/)).toBeInTheDocument();
    expect(screen.queryByText(/Lượt đầu —/)).toBeNull();
    state.run = null;
  });
});

describe('Mặc định MỘT phương án, và mức suy nghĩ đi kèm lượt chạy (13/09/2026)', () => {
  it('bấm xếp mặt bằng ngay thì gửi 1 phương án; chọn mức suy nghĩ thì gửi kèm', async () => {
    state.review = null;
    state.run = null;
    state.start.mockClear();
    show();
    await userEvent.selectOptions(await screen.findByLabelText('Mức suy nghĩ'), 'high');
    await userEvent.click(screen.getByRole('button', { name: 'Xếp mặt bằng' }));
    expect(state.start).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ count: 1, reasoningEffort: 'high' }),
      }),
    );
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
    expect(screen.getByText(/toạ độ chương trình xếp/)).toBeInTheDocument();
    expect(screen.queryByText(/toạ độ mô hình khai/)).toBeNull();
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

describe('Ô yêu cầu sửa và ngưỡng 65 điểm (T53, 16/09/2026)', () => {
  const scored = (points: number) => ({ ...scoreOf(), points, scoredWeight: 100 });

  it('điểm từ 65 trở lên: chip «Đạt ngưỡng 65»; dưới 65: «Dưới ngưỡng 65» kèm lời khuyên sửa', () => {
    state.run = null;
    state.review = review({ score: scored(70), acceptPercent: 65, editable: true });
    const first = renderWithApp(
      <AiPlanStep projectId="p1" readOnly={false} state={designState as never} />,
    );
    expect(screen.getByText('Đạt ngưỡng 65')).toBeInTheDocument();
    first.unmount();
    state.review = review({ score: scored(60), acceptPercent: 65, editable: true });
    show();
    expect(screen.getByText('Dưới ngưỡng 65')).toBeInTheDocument();
    expect(screen.getByText(/nên sửa tiếp bằng ô dưới/)).toBeInTheDocument();
  });

  it('gõ yêu cầu rồi bấm «Sửa lại»: gửi đúng phương án đang xem, nguyên văn yêu cầu, model đang chọn', async () => {
    state.run = null;
    state.edit.mockClear();
    state.review = review({
      editable: true,
      levels: [
        {
          level: 1,
          name: 'Tầng 1',
          scale: 60,
          orientation: 'portrait',
          notes: [],
          rooms: 2,
          roomList: [
            { id: 'bedroom_1', type: 'bedroom', area_m2: 26.2 },
            { id: 'circulation_1', type: 'circulation', area_m2: 21.3 },
          ],
        },
      ],
      roomLabels: { bedroom: 'Phòng ngủ', circulation: 'Giao thông' },
    });
    show();
    // Mã phòng hiện cạnh ô để kỹ sư gọi đúng phòng — tờ vẽ không in mã.
    expect(screen.getByText(/bedroom_1 \(Phòng ngủ 26,2 m²\)/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Sửa lại' });
    expect(button).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/Nội dung cần sửa/),
      'Cửa bedroom_1 chuyển về cuối vách hành lang',
    );
    await userEvent.click(button);
    expect(state.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        artifactId: REF,
        instruction: 'Cửa bedroom_1 chuyển về cuối vách hành lang',
      }),
    );
  });

  it('phương án cũ không có cây chia: không có ô gõ, nói rõ phải xếp lại', () => {
    state.run = null;
    state.review = review({ editable: false });
    show();
    expect(screen.queryByLabelText(/Nội dung cần sửa/)).toBeNull();
    expect(screen.getByText(/không sửa trực tiếp được/)).toBeInTheDocument();
  });

  it('bản sửa: hiện nguyên văn yêu cầu đã dùng để đúc nó', () => {
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
