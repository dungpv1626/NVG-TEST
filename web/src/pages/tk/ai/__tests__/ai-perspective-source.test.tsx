/**
 * Bước Phối cảnh — nguồn mặt đứng (T114 Đợt 4b): ý tưởng AI hoặc bản vẽ kỹ sư tải lên.
 *
 * Canh: chưa có ý tưởng AI mà có bản tải lên thì mặc định chọn bản tải lên và KHÔNG báo chặn;
 * lượt dựng gửi `uploadId` chứ không gửi mã ý tưởng; có cả hai thì mặc định ý tưởng AI (đo được).
 *
 * Và hai ô «Dựng trên mặt bằng / mặt đứng» (10/10/2026): ô mặt đứng chỉ liệt kê bản dựng trên
 * phương án đã chọn; đổi phương án thì đặt mốc mặt bằng rồi mốc mặt đứng sang bản mới nhất của nó.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiDesignState } from '@/hooks/use-ai-design';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  start: vi.fn((_input: unknown) => Promise.resolve({ runId: 'r1', views: [], skipped: [] })),
  uploads: [] as unknown[],
  choosePlan: vi.fn((_input: unknown) => Promise.resolve({ artifactId: '' })),
  chooseFacade: vi.fn((_input: unknown) => Promise.resolve({ artifactId: '' })),
}));

const idle = { mutateAsync: vi.fn(), isPending: false, isError: false, data: undefined };

vi.mock('@/hooks/use-ai-design', () => ({
  useAiImageSet: () => ({ data: undefined, isLoading: false, error: null }),
  useAiImageSetView: () => ({ url: null, loading: false, error: null }),
  useAiRun: () => ({ data: undefined }),
  useChooseAiImageSet: () => idle,
  useChooseAiPlan: () => ({ ...idle, error: null, mutateAsync: state.choosePlan }),
  useChooseAiFacade: () => ({ ...idle, error: null, mutateAsync: state.chooseFacade }),
  useHideAiImageSet: () => idle,
  useCancelAiRun: () => idle,
  useInvalidateAiDesign: () => () => undefined,
  useRedrawPerspectiveView: () => idle,
  useStartPerspectiveRun: () => ({ ...idle, mutateAsync: state.start }),
  useUploadedDrawings: () => ({ data: { items: state.uploads }, isLoading: false, error: null }),
}));

vi.mock('../ai-model-picker', () => ({
  useAiChoice: () => ({
    choice: { route: 'ai_image_openai' },
    options: [],
    pickMode: () => undefined,
    pickRoute: () => undefined,
  }),
  AiModePicker: () => null,
}));

const { AiPerspectiveStep } = await import('../ai-perspective-step');

const UPLOAD = {
  uploadId: `sha256:${'d'.repeat(64)}`,
  createdAt: '2026-10-04T08:00:00Z',
  drawing: 'facade',
  level: null,
  note: 'Mặt tiền đã sửa',
  width: 1024,
  height: 1536,
  imageArtifactId: null,
};

function designState(over: Partial<AiDesignState> = {}): AiDesignState {
  return {
    briefArtifactId: `sha256:${'b'.repeat(64)}`,
    plans: [],
    planHeadArtifactId: null,
    facadeArtifactId: null,
    imageSetArtifactId: null,
    runs: {},
    ...over,
  } as AiDesignState;
}

beforeEach(() => {
  state.start.mockClear();
  state.choosePlan.mockClear();
  state.chooseFacade.mockClear();
  state.uploads = [];
});

describe('Nguồn mặt đứng của bộ ảnh phối cảnh', () => {
  it('chỉ có bản tải lên: mặc định bản tải lên, dựng gửi `uploadId`', async () => {
    state.uploads = [UPLOAD];
    renderWithApp(<AiPerspectiveStep projectId="p1" readOnly={false} state={designState()} />);
    expect(screen.queryByText(/Chưa có ý tưởng mặt đứng/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Dựng bộ ảnh/ }));
    expect(state.start).toHaveBeenCalledWith({
      projectId: 'p1',
      route: 'ai_image_openai',
      peopleAndVehicles: true,
      uploadId: UPLOAD.uploadId,
    });
  });

  it('có cả hai: mặc định ý tưởng AI', async () => {
    state.uploads = [UPLOAD];
    const facade = `sha256:${'f'.repeat(64)}`;
    renderWithApp(
      <AiPerspectiveStep
        projectId="p1"
        readOnly={false}
        state={designState({ facadeArtifactId: facade })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Dựng bộ ảnh/ }));
    expect(state.start).toHaveBeenCalledWith(expect.objectContaining({ artifactId: facade }));
  });

  it('không có nguồn nào thì nói rõ tải ở đâu', () => {
    renderWithApp(<AiPerspectiveStep projectId="p1" readOnly={false} state={designState()} />);
    expect(screen.getByText(/tải bản vẽ của kỹ sư/)).toBeInTheDocument();
  });
});

describe('Chọn mặt bằng và mặt đứng làm nền cho bộ ảnh (10/10/2026)', () => {
  const PLAN_1 = `sha256:${'1'.repeat(64)}`;
  const PLAN_2 = `sha256:${'2'.repeat(64)}`;
  const F_1A = `sha256:${'3'.repeat(64)}`;
  const F_2A = `sha256:${'4'.repeat(64)}`;
  const F_2B = `sha256:${'5'.repeat(64)}`;
  const twoPlans = (over: Partial<AiDesignState> = {}) =>
    designState({
      plans: [
        { artifactId: PLAN_2, createdAt: '2026-10-02T00:00:00Z' },
        { artifactId: PLAN_1, createdAt: '2026-10-01T00:00:00Z' },
      ],
      planHeadArtifactId: PLAN_1,
      facadeArtifactId: F_1A,
      facadePlanRef: PLAN_1,
      facades: [
        { artifactId: F_2B, createdAt: '2026-10-05T00:00:00Z', planRef: PLAN_2 },
        { artifactId: F_2A, createdAt: '2026-10-04T00:00:00Z', planRef: PLAN_2 },
        { artifactId: F_1A, createdAt: '2026-10-03T00:00:00Z', planRef: PLAN_1 },
      ],
      ...over,
    });

  it('ô mặt đứng chỉ có các bản dựng trên phương án đang chọn', () => {
    renderWithApp(<AiPerspectiveStep projectId="p1" readOnly={false} state={twoPlans()} />);
    const facadeSelect = screen.getByRole('combobox', { name: 'Dựng trên mặt đứng' });
    const options = within(facadeSelect).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toMatch(/^Mặt đứng 1/);
  });

  it('đổi phương án: đặt mốc mặt bằng, rồi mốc mặt đứng sang bản MỚI NHẤT của phương án ấy', async () => {
    renderWithApp(<AiPerspectiveStep projectId="p1" readOnly={false} state={twoPlans()} />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Dựng trên mặt bằng' }),
      PLAN_2,
    );
    expect(state.choosePlan).toHaveBeenCalledWith({ projectId: 'p1', artifactId: PLAN_2 });
    await vi.waitFor(() =>
      expect(state.chooseFacade).toHaveBeenCalledWith({ projectId: 'p1', artifactId: F_2B }),
    );
  });

  it('phương án chưa có mặt đứng thì nói ra và không cho dựng', () => {
    renderWithApp(
      <AiPerspectiveStep
        projectId="p1"
        readOnly={false}
        state={twoPlans({
          planHeadArtifactId: PLAN_2,
          facades: [{ artifactId: F_1A, createdAt: '2026-10-03T00:00:00Z', planRef: PLAN_1 }],
        })}
      />,
    );
    expect(screen.getByText(/Phương án 2 chưa có mặt đứng/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dựng bộ ảnh/ })).toBeNull();
  });

  it('dựng gửi đúng bản mặt đứng đã chọn', async () => {
    renderWithApp(
      <AiPerspectiveStep
        projectId="p1"
        readOnly={false}
        state={twoPlans({
          planHeadArtifactId: PLAN_2,
          facadeArtifactId: F_2A,
          facadePlanRef: PLAN_2,
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Dựng bộ ảnh/ }));
    expect(state.start).toHaveBeenCalledWith(expect.objectContaining({ artifactId: F_2A }));
  });
});
