/**
 * Ảnh từ bản vẽ của kỹ sư (T114 Đợt 4) — phần màn hình.
 *
 * Canh hai hàng rào nằm ở trình duyệt: không tải lên được khi chưa XÁC NHẬN đã bỏ khung tên (máy chủ
 * cũng chặn — đây là lớp thứ hai), và thứ gửi lên là đúng tấm đã xem trước, kèm tầng và lời xác nhận.
 * Ghi chú không có trong lượt vẽ ảnh.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  upload: vi.fn((_input: unknown) => Promise.resolve({ uploadId: 'sha256:u' })),
  draw: vi.fn((_input: unknown) => Promise.resolve({})),
  items: [] as unknown[],
}));

vi.mock('@/hooks/use-ai-design', () => ({
  useUploadedDrawings: () => ({ isLoading: false, error: null, data: { items: state.items } }),
  useUploadDrawing: () => ({ mutateAsync: state.upload, isPending: false, isError: false }),
  useDrawFromUpload: () => ({
    mutateAsync: state.draw,
    isPending: false,
    isError: false,
    data: undefined,
  }),
  useDesignImage: () => ({ url: null, loading: false, error: null }),
}));

vi.mock('@/lib/drawing-upload', () => ({
  NO_CROP: { top: 0, right: 0, bottom: 0, left: 0 },
  isPdf: () => false,
  pdfPageCount: () => Promise.resolve(1),
  normaliseDrawing: () => Promise.resolve({ base64: 'iVBORw0KGgoAAA', width: 1536, height: 1024 }),
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

vi.mock('../ai-usage', () => ({ AiUsageLine: () => null }));

const { AiUploadPanel } = await import('../ai-upload-panel');

beforeEach(() => {
  state.upload.mockClear();
  state.draw.mockClear();
  state.items = [];
});

async function chooseFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'ban-ve.png', { type: 'image/png' }));
  await screen.findByAltText('Xem trước bản vẽ sẽ tải lên');
}

describe('Tải bản vẽ của kỹ sư', () => {
  it('chưa xác nhận đã bỏ khung tên thì không tải lên được', async () => {
    renderWithApp(<AiUploadPanel projectId="p1" drawing="plan" readOnly={false} />);
    await chooseFile();
    const button = screen.getByRole('button', { name: /Tải bản vẽ lên/ });
    expect(button).toHaveProperty('disabled', true);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(button).toHaveProperty('disabled', false);
  });

  it('gửi đúng tấm đã xem trước, kèm tầng, ghi chú và lời xác nhận', async () => {
    renderWithApp(<AiUploadPanel projectId="p1" drawing="plan" readOnly={false} />);
    await chooseFile();
    await userEvent.selectOptions(screen.getByDisplayValue('Tầng 1'), '2');
    await userEvent.type(screen.getByPlaceholderText(/sau khi sửa/), 'Sửa WC');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /Tải bản vẽ lên/ }));
    expect(state.upload).toHaveBeenCalledWith({
      projectId: 'p1',
      drawing: 'plan',
      level: 2,
      note: 'Sửa WC',
      identityCleared: true,
      imageBase64: 'iVBORw0KGgoAAA',
    });
  });

  it('mặt đứng không hỏi tầng', async () => {
    renderWithApp(<AiUploadPanel projectId="p1" drawing="facade" readOnly={false} />);
    await chooseFile();
    expect(screen.queryByDisplayValue('Tầng 1')).toBeNull();
  });

  it('chỉ xem thì không có ô tải lên và không có nút vẽ', () => {
    state.items = [
      {
        uploadId: 'sha256:u1',
        createdAt: '2026-10-03T10:00:00Z',
        drawing: 'plan',
        level: 1,
        note: null,
        width: 1536,
        height: 1024,
        imageArtifactId: null,
      },
    ];
    renderWithApp(<AiUploadPanel projectId="p1" drawing="plan" readOnly />);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Vẽ ảnh/ })).toBeNull();
  });

  it('vẽ từ bản đã tải chỉ gửi mã bản vẽ và model — ghi chú không đi tới mô hình', async () => {
    state.items = [
      {
        uploadId: 'sha256:u1',
        createdAt: '2026-10-03T10:00:00Z',
        drawing: 'plan',
        level: 1,
        note: 'Ghi chú riêng',
        width: 1536,
        height: 1024,
        imageArtifactId: null,
      },
    ];
    renderWithApp(<AiUploadPanel projectId="p1" drawing="plan" readOnly={false} />);
    await userEvent.click(screen.getByRole('button', { name: /Vẽ ảnh nội thất từ bản này/ }));
    expect(state.draw).toHaveBeenCalledWith({
      projectId: 'p1',
      uploadId: 'sha256:u1',
      drawing: 'plan',
      route: 'ai_image_openai',
    });
  });
});
