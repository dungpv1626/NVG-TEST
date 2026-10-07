/**
 * Bước Phối cảnh — nguồn mặt đứng (T114 Đợt 4b): ý tưởng AI hoặc bản vẽ kỹ sư tải lên.
 *
 * Canh: chưa có ý tưởng AI mà có bản tải lên thì mặc định chọn bản tải lên và KHÔNG báo chặn;
 * lượt dựng gửi `uploadId` chứ không gửi mã ý tưởng; có cả hai thì mặc định ý tưởng AI (đo được).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiDesignState } from '@/hooks/use-ai-design';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  start: vi.fn((_input: unknown) => Promise.resolve({ runId: 'r1', views: [], skipped: [] })),
  uploads: [] as unknown[],
}));

const idle = { mutateAsync: vi.fn(), isPending: false, isError: false, data: undefined };

vi.mock('@/hooks/use-ai-design', () => ({
  useAiImageSet: () => ({ data: undefined, isLoading: false, error: null }),
  useAiImageSetView: () => ({ url: null, loading: false, error: null }),
  useAiRun: () => ({ data: undefined }),
  useChooseAiImageSet: () => idle,
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
