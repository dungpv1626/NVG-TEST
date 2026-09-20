/**
 * Ảnh mặt đứng có vật liệu (T59 Đợt E) — dựng trong bộ nhớ, không gọi mạng.
 *
 * Canh: nút vẽ gửi TÊN TUYẾN model ảnh và đúng ý tưởng; mặt đứng theo phương án cũ thì KHÔNG cho vẽ
 * (trả tiền cho một ngôi nhà cũ); tấm đã vẽ luôn kèm nhãn bằng chữ trong trang.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { renderWithApp } from '@/test/render';

const FACADE = `sha256:${'f'.repeat(64)}`;

const state = vi.hoisted(() => ({
  url: null as string | null,
  draw: vi.fn((_input: unknown) =>
    Promise.resolve({
      imageArtifactId: 'sha256:img',
      mime: 'image/png',
      watermark: 'Ảnh minh hoạ do AI vẽ — không đo được, màu chỉ để hình dung',
      promptVersion: '8.9.0',
      usage: null,
    }),
  ),
}));

vi.mock('@/lib/watermark', () => ({
  stampWatermark: (url: string) => Promise.resolve({ url, stamped: true }),
}));

vi.mock('@/hooks/use-ai-design', () => ({
  useAiFacadeImage: () => ({ url: state.url, loading: false, error: null }),
  useDrawAiFacadeImage: () => ({
    mutateAsync: state.draw,
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
  }),
  useAiModels: () => ({
    data: {
      text: [],
      image: [
        {
          route: 'ai_image_gemini',
          provider: 'gemini_paid',
          label: 'Gemini 3.1 Flash Image (Google)',
          model: 'gemini-3.1-flash-image',
          maxDataClass: 2,
          enabled: true,
          unavailableReason: null,
          imageUsd: 0.067,
        },
      ],
      defaults: { text: null, image: 'ai_image_gemini' },
    },
    isLoading: false,
    error: null,
  }),
}));

const { FacadeImagePanel } = await import('../ai-facade-image');

beforeEach(() => {
  state.url = null;
  state.draw.mockClear();
});

describe('Ảnh mặt đứng có vật liệu', () => {
  it('chưa vẽ thì nói rõ; bấm vẽ gửi TÊN TUYẾN model ảnh và đúng ý tưởng', async () => {
    renderWithApp(
      <FacadeImagePanel projectId="p1" artifactId={FACADE} readOnly={false} stale={false} />,
    );
    expect(screen.getByText(/Chưa có ảnh mặt đứng/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Vẽ ảnh mặt đứng' }));
    expect(state.draw).toHaveBeenCalledWith({
      projectId: 'p1',
      artifactId: FACADE,
      route: 'ai_image_gemini',
    });
  });

  it('mặt đứng theo phương án cũ: không cho vẽ, nói lý do', () => {
    renderWithApp(<FacadeImagePanel projectId="p1" artifactId={FACADE} readOnly={false} stale />);
    expect(screen.getByRole('button', { name: 'Vẽ ảnh mặt đứng' })).toBeDisabled();
    expect(screen.getByText(/dựng lại ý tưởng mặt đứng trước khi vẽ ảnh/)).toBeInTheDocument();
  });

  it('tấm đã vẽ luôn kèm nhãn bằng chữ trong trang, và tải về là bản có nhãn', async () => {
    state.url = 'blob:facade-image';
    renderWithApp(
      <FacadeImagePanel projectId="p1" artifactId={FACADE} readOnly={false} stale={false} />,
    );
    expect(await screen.findByAltText('Ảnh mặt đứng có vật liệu')).toBeInTheDocument();
    expect(screen.getByText(AI_DISCLAIMERS.aiFacadeImage)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tải ảnh có nhãn' })).toHaveAttribute(
      'href',
      'blob:facade-image',
    );
    expect(screen.getByRole('button', { name: 'Vẽ lại ảnh mặt đứng' })).toBeInTheDocument();
  });
});
