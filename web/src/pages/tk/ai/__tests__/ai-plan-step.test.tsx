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
const WATERMARK = 'Đề xuất AI — hình vẽ minh hoạ, không dựng từ toạ độ, không đo được trên hình';
const DISCLAIMER =
  'Tờ vẽ do mô hình ảnh dựng theo lời mô tả, KHÔNG dựng từ toạ độ — kích thước, tỷ lệ và vị trí trên hình chỉ là minh hoạ. Số đúng nằm ở bảng diện tích và ở bản đối chiếu dạng vector.';

const state = vi.hoisted(() => ({
  review: null as unknown,
  sheetImage: { url: null as string | null, stamped: false, loading: false, error: null },
  imageUsd: 0.04 as number | null,
  render: vi.fn(() => Promise.resolve({ imageArtifactId: 'x', level: 1, watermark: 'w' })),
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
  useAiSheetImage: () => state.sheetImage,
  useAiRun: () => ({ data: null }),
  useChooseAiPlan: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useInvalidateAiDesign: () => vi.fn(),
  useRenderAiSheetImage: () => ({
    mutateAsync: state.render,
    isPending: false,
    isError: false,
    error: null,
  }),
  useStartAiRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAiModels: () => ({
    data: {
      text: [textRoute()],
      image: [imageRoute()],
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

const imageRoute = () => ({
  route: 'ai_image_gemini',
  provider: 'gemini_paid',
  label: 'Gemini Image (Google)',
  model: 'gemini-image',
  maxDataClass: 2,
  enabled: true,
  unavailableReason: null,
  imageUsd: state.imageUsd,
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
    wallsDerived: false,
    levels: [
      {
        level: 1,
        name: 'Tầng 1',
        scale: 60,
        orientation: 'portrait',
        notes: [],
        rooms: 6,
        sheetImage: { available: true, drawable: true },
      },
    ],
    roomLabels: {},
    blocking: [],
    findings: [],
    rulePacks: { standards: false, experience: false },
    warnings: [],
    checkedRules: [],
    uncheckedRules: [],
    sheetImageWatermark: WATERMARK,
    sheetImageDisclaimer: DISCLAIMER,
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

describe('Tờ mặt bằng do mô hình ảnh dựng', () => {
  it('nhãn cảnh báo nằm trong TRANG, không chỉ trên pixel', () => {
    state.review = review();
    state.sheetImage = { url: 'blob:ai-stamped', stamped: true, loading: false, error: null };
    show();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('canvas không đóng dấu được thì nói thẳng là tệp tải về KHÔNG mang nhãn', () => {
    state.review = review();
    state.sheetImage = { url: 'blob:ai-raw', stamped: false, loading: false, error: null };
    show();
    expect(screen.getByText(/tải về sẽ KHÔNG mang nhãn/)).toBeInTheDocument();
    // Dòng cảnh báo chính vẫn còn — đây mới là lớp bảo vệ duy nhất lúc này.
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('KHÔNG in chip tỷ lệ lên tờ ảnh — tờ ảnh không có tỷ lệ nào', () => {
    state.review = review();
    state.sheetImage = { url: 'blob:ai-stamped', stamped: true, loading: false, error: null };
    show();
    expect(screen.queryByText(/Tỷ lệ 1:60/)).not.toBeInTheDocument();
  });

  it('nút tải trỏ vào ảnh ĐÃ đóng dấu, không phải blob gốc', () => {
    state.review = review();
    state.sheetImage = { url: 'blob:ai-stamped', stamped: true, loading: false, error: null };
    show();
    const link = screen.getByRole('link', { name: /Tải tờ AI tầng 1/ });
    expect(link).toHaveAttribute('href', 'blob:ai-stamped');
    expect(link).toHaveAttribute('download', expect.stringContaining('.png'));
  });
});

describe('Trước khi vẽ', () => {
  it('hiện GIÁ một tờ trước khi bấm', () => {
    state.review = review();
    state.imageUsd = 0.04;
    state.sheetImage = { url: null, stamped: false, loading: false, error: null };
    show();
    expect(screen.getByText(/0\.04 USD một tờ/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vẽ tờ này bằng AI' })).toBeEnabled();
  });

  it('tuyến chưa khai giá thì nói «Chưa đủ dữ liệu», KHÔNG hiện 0', () => {
    state.review = review();
    state.imageUsd = null;
    state.sheetImage = { url: null, stamped: false, loading: false, error: null };
    show();
    expect(screen.getByText(/Chưa đủ dữ liệu/)).toBeInTheDocument();
    expect(screen.queryByText(/0 USD một tờ/)).not.toBeInTheDocument();
  });

  it('tầng mô hình chưa khai mô tả thì KHÔNG có nút bấm, và nói vì sao', () => {
    state.review = review({
      levels: [
        {
          level: 1,
          name: 'Tầng 1',
          scale: 60,
          orientation: 'portrait',
          notes: [],
          rooms: 6,
          sheetImage: { available: false, drawable: false },
        },
      ],
    });
    state.imageUsd = 0.04;
    state.sheetImage = { url: null, stamped: false, loading: false, error: null };
    show();
    expect(screen.queryByRole('button', { name: 'Vẽ tờ này bằng AI' })).not.toBeInTheDocument();
    expect(screen.getByText(/chưa có mô tả tờ vẽ nên không dựng được ảnh/)).toBeInTheDocument();
  });
});
