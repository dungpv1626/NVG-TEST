/**
 * Chụp ảnh hiện trường — AFD 4.8: nút chụp ảnh không bao giờ nằm sau menu, và mở thẳng camera
 * sau của điện thoại. Ảnh chưa gửi bỏ được từng ảnh trước khi lưu.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderWithApp } from '@/test/render';
import { SitePhotoPicker } from '../site-photo-picker';

vi.mock('@/hooks/use-site-photos', () => ({
  CONSTRUCTION_PHOTO_ACCEPT: 'image/jpeg,image/png',
  useSignedPhotoUrls: () => ({ data: {} }),
}));

function Harness() {
  const [files, setFiles] = useState<File[]>([]);
  return <SitePhotoPicker files={files} onChange={setFiles} />;
}

describe('Chụp ảnh hiện trường', () => {
  beforeAll(() => {
    URL.createObjectURL = vi.fn(() => 'blob:anh');
    URL.revokeObjectURL = vi.fn();
  });

  it('nút chụp ảnh hiện sẵn và mở camera sau', () => {
    renderWithApp(<Harness />);
    expect(screen.getByRole('button', { name: /Chụp ảnh hiện trường/ })).toBeInTheDocument();
    expect(screen.getByTestId('chon-anh-hien-truong')).toHaveAttribute('capture', 'environment');
  });

  it('ảnh vừa chọn hiện ra và bỏ được trước khi lưu', async () => {
    renderWithApp(<Harness />);
    const input = screen.getByTestId('chon-anh-hien-truong');
    await userEvent.upload(input, [
      new File(['a'], 'mong.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'cot.jpg', { type: 'image/jpeg' }),
    ]);
    expect(screen.getAllByRole('img')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Bỏ ảnh 1' }));
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAccessibleName(/cot\.jpg/);
  });
});
