/**
 * Bước mặt bằng — tờ vẽ do MÔ HÌNH ẢNH dựng (T21, 10/09/2026).
 *
 * Bộ này canh đúng những chỗ mà một lỗi sẽ KHÔNG trông giống lỗi:
 *
 *  1. **Nhãn cảnh báo phải nằm trong DOM**, không chỉ trên pixel. Canvas đóng dấu hỏng được —
 *     trong jsdom nó hỏng thật — và một tấm ảnh AI không nhãn trông y hệt một tấm có nhãn.
 *  2. **Chip tỷ lệ không được hiện trên tờ ảnh.** Tờ ảnh không dựng từ toạ độ nên không có tỷ
 *     lệ nào; in «1:60» lên nó là kiểu nói dối một kiến trúc sư sẽ tin.
 *  3. **Giá hiện TRƯỚC khi bấm**, và tuyến chưa khai giá thì nói «Chưa đủ dữ liệu», không hiện
 *     `0` — hiện 0 đọc như miễn phí (CLAUDE.md 5.2).
 *  4. **Tầng mô hình chưa khai mô tả thì không có nút bấm**, kèm lý do (AFD 6.5).
 *  5. **Nút tải trỏ vào chuỗi ĐÃ đóng dấu**, không phải blob gốc.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithApp } from '@/test/render';

const REF = `sha256:${'a'.repeat(64)}`;

const state = vi.hoisted(() => ({
  review: null as unknown,
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
  useAiRun: () => ({ data: null }),
  useChooseAiPlan: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useInvalidateAiDesign: () => vi.fn(),
  useStartAiRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAiModels: () => ({
    data: {
      text: [textRoute()],
      // Bước mặt bằng KHÔNG còn dùng tuyến ảnh nào sau T22 — tờ vẽ là SVG tất định.
      image: [],
      defaults: { text: 'ai_text_openai', image: 'ai_image_gemini' },
    },
    isLoading: false,
    error: null,
  }),
}));

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
    ...over,
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

  it('KHÔNG còn bộ chọn nguồn, KHÔNG còn nút vẽ bằng AI, KHÔNG còn giá một tờ', () => {
    // Ba thứ này cùng thuộc đường sinh ảnh. Để lại bất kỳ cái nào thì người dùng bấm vào một
    // tuyến đã gỡ và nhận lỗi — đúng thứ AFD 6.5 cấm.
    state.review = review();
    show();
    expect(screen.queryByRole('button', { name: /Vẽ tờ này bằng AI/ })).toBeNull();
    expect(screen.queryByText(/Tờ AI/)).toBeNull();
    expect(screen.queryByText(/USD một tờ/)).toBeNull();
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
