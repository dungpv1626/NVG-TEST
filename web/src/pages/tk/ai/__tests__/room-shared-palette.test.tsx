/**
 * «Dùng chung vật liệu và màu với mặt đứng» (9.18.0, «Cách 3») — dòng báo ở ngăn «Vẽ ảnh phòng».
 *
 * Canh: màu luôn kèm chữ (không chỉ ô màu); nói rõ model đang chọn có kèm ảnh mặt ngoài làm mẫu hay chỉ gửi chữ.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AiRoomSharedPalette } from '@/hooks/use-ai-design';
import { SharedPaletteNote } from '../ai-room-image-step';

const PALETTE: AiRoomSharedPalette = {
  facadeArtifactId: `sha256:${'f'.repeat(64)}`,
  colours: [
    { role: 'primary', roleLabel: 'Màu chính', label: 'Trắng kem', hex: '#F1EAD8' },
    { role: 'accent', roleLabel: 'Màu nhấn', label: null, hex: '#123456' },
  ],
  materials: ['Đá granite', 'Gỗ nhựa composite'],
  reference: { kind: 'ai_image_set', viewLabel: 'Mặt tiền ban ngày' },
};

describe('Bảng vật liệu chung trên màn hình', () => {
  it('liệt kê màu bằng chữ và vật liệu; model nhận ảnh thì nói ảnh mẫu', () => {
    render(<SharedPaletteNote palette={PALETTE} withReference />);
    expect(screen.getByText('Dùng chung vật liệu và màu với mặt đứng')).toBeInTheDocument();
    expect(screen.getByText('Màu chính: Trắng kem')).toBeInTheDocument();
    expect(screen.getByText('Màu nhấn: #123456')).toBeInTheDocument();
    expect(screen.getByText('Vật liệu: Đá granite, Gỗ nhựa composite.')).toBeInTheDocument();
    expect(screen.getByText(/Kèm ảnh «Mặt tiền ban ngày» làm mẫu/)).toBeInTheDocument();
  });

  it('model chỉ nhận chữ thì nói không kèm ảnh mẫu', () => {
    render(<SharedPaletteNote palette={PALETTE} withReference={false} />);
    expect(screen.getByText(/chỉ nhận chữ/)).toBeInTheDocument();
  });
});
