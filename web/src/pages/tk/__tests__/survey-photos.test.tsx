/**
 * Ảnh hiện trạng trên biên bản khảo sát — dựng trong bộ nhớ, không gọi mạng.
 *
 * Ba thứ canh: nút thêm ảnh nằm ngay trên biên bản và nhận nhiều tệp; chọn tệp gửi đúng
 * dự án/biên bản; chế độ chỉ xem không có nút thêm lẫn nút xoá.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  upload: vi.fn(() => Promise.resolve(1)),
  remove: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/hooks/use-survey-photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-survey-photos')>()),
  useUploadSurveyPhotos: () => ({ mutateAsync: state.upload, isPending: false }),
  useRemoveSurveyPhoto: () => ({ mutateAsync: state.remove, isPending: false }),
}));

const { SurveyPhotos } = await import('../survey-photos');

const photo = {
  id: 'p1',
  design_survey_id: 's1',
  storage_path: 'prj/s1/a.jpg',
  file_name: 'mat-tien.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 1000,
  caption: 'Mặt tiền',
  created_at: '2026-09-06T00:00:00Z',
  url: 'https://example.test/a.jpg',
};

describe('Ảnh hiện trạng khảo sát', () => {
  it('chọn nhiều tệp gửi đúng dự án và biên bản', async () => {
    state.upload.mockClear();
    renderWithApp(
      <SurveyPhotos projectId="prj" companyId="c" surveyId="s1" photos={[]} readOnly={false} />,
    );
    expect(screen.getByRole('button', { name: /Thêm ảnh hiện trạng/ })).toBeInTheDocument();

    const input = screen.getByTestId('them-anh-s1') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const a = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const b = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, [a, b]);
    expect(state.upload).toHaveBeenCalledWith({
      projectId: 'prj',
      companyId: 'c',
      surveyId: 's1',
      files: [a, b],
    });
  });

  it('hiện ảnh kèm chú thích; chỉ xem thì không có nút thêm hay xoá', () => {
    renderWithApp(
      <SurveyPhotos projectId="prj" companyId="c" surveyId="s1" photos={[photo]} readOnly />,
    );
    expect(screen.getByRole('img', { name: 'Mặt tiền' })).toBeInTheDocument();
    expect(screen.getByText('Ảnh hiện trạng (1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm ảnh/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xoá ảnh/ })).not.toBeInTheDocument();
  });

  it('xoá gửi đúng mã ảnh', async () => {
    state.remove.mockClear();
    renderWithApp(
      <SurveyPhotos
        projectId="prj"
        companyId="c"
        surveyId="s1"
        photos={[photo]}
        readOnly={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Xoá ảnh mat-tien.jpg' }));
    expect(state.remove).toHaveBeenCalledWith({ projectId: 'prj', photoId: 'p1' });
  });
});
