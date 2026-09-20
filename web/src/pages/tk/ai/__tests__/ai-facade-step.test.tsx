/**
 * Bước mặt đứng (T59) — dựng trong bộ nhớ, không gọi mạng.
 *
 * Canh những chỗ lỗi sẽ không trông giống lỗi:
 *  · mặt đứng dựng theo phương án mặt bằng CŨ phải nói ra — cửa trên tờ ấy là của nhà khác;
 *  · màu luôn kèm chữ (mã hex), không chỉ một ô tô màu (CGD 6.8);
 *  · tờ vẽ đi qua `<img>`, không nhúng SVG;
 *  · nút chạy gửi TÊN TUYẾN, và chưa chọn mặt bằng thì không có nút.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const PLAN_A = `sha256:${'a'.repeat(64)}`;
const PLAN_B = `sha256:${'b'.repeat(64)}`;
const FACADE = `sha256:${'f'.repeat(64)}`;

const state = vi.hoisted(() => ({
  run: null as unknown,
  start: vi.fn((_input: unknown) => Promise.resolve({ runId: 'r1' })),
  dxf: vi.fn((_input: unknown) => undefined),
}));

vi.mock('@/hooks/use-ai-design', () => ({
  // Phiếu yêu cầu (Đợt F2) ở đầu màn hình — danh mục rỗng, phiếu chưa điền; bộ này nói về phần dưới.
  useFacadeVocabulary: () => ({
    isLoading: false,
    error: null,
    data: {
      roofTypes: [],
      roofMaterials: [],
      materials: [],
      colours: [],
      railings: [],
      doorMaterials: [],
      doorTypes: [],
      glassTypes: [],
      garageDoorTypes: [],
      fenceTypes: [],
      gateTypes: [],
      elements: [],
      defaults: { groundRaiseCm: 45, parapetCm: 110, doorHeightCm: 250 },
    },
  }),
  useFacadeBrief: () => ({
    isLoading: false,
    error: null,
    data: { artifactId: null, savedAt: null, brief: null, plan: null },
  }),
  useSaveFacadeBrief: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Ảnh có vật liệu (Đợt E) — chưa vẽ; bộ này nói về phần khác (xem `ai-facade-image.test.tsx`).
  useAiFacadeImage: () => ({ url: null, loading: false, error: null }),
  useDrawAiFacadeImage: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
  }),
  useAiFacade: () => ({
    data: {
      artifactId: FACADE,
      createdAt: '',
      planRef: PLAN_A,
      style: 'hien_dai',
      legend: [
        {
          key: 'roof',
          label: 'Mái',
          value: 'Mái bằng, sàn mái bê tông chống thấm, xám nhạt',
          fromBrief: true,
        },
        {
          key: 'body',
          label: 'Thân nhà',
          value: 'Sơn nước ngoại thất, trắng kem',
          fromBrief: false,
        },
      ],
      palette: { primary_hex: '#F1EAD8', secondary_hex: '#4A4D50', accent_hex: null },
      roofType: 'Mái bằng',
      pitchDeg: null,
      gate: null,
      fenceH: null,
      openings: 5,
      balconies: 2,
      elements: ['Ô văng', 'Ô văng', 'Lam'],
      rationale: 'Mặt tiền hẹp nên dùng lam gỗ.',
      generator: { provider: 'openai', model: 'gpt-x', route: 'ai_text_openai' },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useAiFacadeSheet: () => ({
    url: 'blob:facade',
    scale: 40,
    orientation: 'portrait',
    loading: false,
    error: null,
  }),
  useDownloadAiFacadeDxf: () => ({
    mutate: state.dxf,
    isPending: false,
    isError: false,
    error: null,
  }),
  useAiRun: () => ({ data: state.run }),
  useStartAiRun: () => ({ mutateAsync: state.start, isPending: false, isError: false }),
  useInvalidateAiDesign: () => vi.fn(),
  useAiCallLog: () => ({ data: [], isLoading: false, isError: false, error: null }),
  useCancelAiRun: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    data: undefined,
  }),
  useDownloadAiCallPrompt: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
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
          imageUsd: null,
        },
      ],
      image: [],
      defaults: { text: 'ai_text_openai', image: null },
    },
    isLoading: false,
    error: null,
  }),
}));

const { AiFacadeStep } = await import('../ai-facade-step');

function designState(over: Record<string, unknown> = {}) {
  return {
    briefArtifactId: `sha256:${'c'.repeat(64)}`,
    program: null,
    plans: [{ artifactId: PLAN_A, createdAt: '' }],
    planHeadArtifactId: PLAN_A,
    facadeArtifactId: FACADE,
    facadePlanRef: PLAN_A,
    imageSetArtifactId: null,
    runs: {},
    roomLabels: {},
    ...over,
  } as Parameters<typeof AiFacadeStep>[0]['state'];
}

describe('Bước mặt đứng', () => {
  it('chưa chọn phương án mặt bằng thì nói phải làm gì, không có nút chạy', () => {
    renderWithApp(
      <AiFacadeStep
        projectId="p1"
        readOnly={false}
        state={designState({ planHeadArtifactId: null, facadeArtifactId: null })}
      />,
    );
    expect(screen.getByText(/Chưa chọn phương án mặt bằng/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dựng ý tưởng mặt đứng/ })).toBeNull();
  });

  it('bấm chạy gửi TÊN TUYẾN của model đã chọn', async () => {
    renderWithApp(
      <AiFacadeStep
        projectId="p1"
        readOnly={false}
        state={designState({ facadeArtifactId: null, facadePlanRef: null })}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Dựng ý tưởng mặt đứng' }));
    expect(state.start).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', route: 'ai_text_openai' }),
    );
  });

  it('hiện bảng vật liệu, và màu luôn kèm mã hex bằng chữ', () => {
    renderWithApp(<AiFacadeStep projectId="p1" readOnly={false} state={designState()} />);
    expect(screen.getByText('Sơn nước ngoại thất, trắng kem')).toBeInTheDocument();
    expect(screen.getByText('#F1EAD8')).toBeInTheDocument();
    expect(screen.getByText('#4A4D50')).toBeInTheDocument();
    expect(screen.getByText('5 lỗ mở · 2 ban công')).toBeInTheDocument();
    // Mảng trang trí lặp tên thì gộp thành số lượng — lượt chạy thật 19/09/2026 ra bốn «Ô văng» liền.
    expect(screen.getByText('Ô văng × 2, Lam')).toBeInTheDocument();
  });

  it('tờ mặt đứng hiện qua <img>, kèm tỷ lệ, tải được DXF', async () => {
    renderWithApp(<AiFacadeStep projectId="p1" readOnly={false} state={designState()} />);
    const img = screen.getByAltText('Tờ mặt đứng mặt tiền');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('blob:facade');
    expect(screen.getByText(/Tỷ lệ 1:40/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tải DXF mặt đứng' }));
    expect(state.dxf).toHaveBeenCalledWith({ projectId: 'p1', artifactId: FACADE });
  });

  it('mặt bằng đã đổi sau khi dựng mặt đứng: gắn nhãn «phương án cũ», không im lặng', () => {
    renderWithApp(
      <AiFacadeStep
        projectId="p1"
        readOnly={false}
        state={designState({ planHeadArtifactId: PLAN_B })}
      />,
    );
    expect(screen.getByText('Theo phương án cũ')).toBeInTheDocument();
    expect(screen.getByText('Mặt đứng đang dựng theo phương án mặt bằng cũ.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dựng lại ý tưởng mặt đứng' })).toBeInTheDocument();
  });

  it('lượt chạy hỏng vì ý tưởng không qua kiểm: liệt kê lý do nguyên văn', () => {
    state.run = {
      id: 'r1',
      stage: 'facade',
      status: 'failed',
      progress: {},
      result: { issues: ['Mảng ốp (elements[0]) đè lên lỗ mở tầng 1.'] },
      error: 'AI chưa đưa ra được ý tưởng mặt đứng dùng được sau 2 lượt.',
      createdAt: '',
      updatedAt: '',
    };
    renderWithApp(
      <AiFacadeStep
        projectId="p1"
        readOnly={false}
        state={designState({ facadeArtifactId: null, runs: { facade: state.run } })}
      />,
    );
    expect(screen.getByText('Ý tưởng chưa dùng được')).toBeInTheDocument();
    expect(screen.getByText('Mảng ốp (elements[0]) đè lên lỗ mở tầng 1.')).toBeInTheDocument();
    state.run = null;
  });
});
