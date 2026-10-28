/**
 * Phiếu mặt đứng lọc lựa chọn theo phong cách (T175) — dựng trong bộ nhớ, không gọi mạng.
 *
 * Canh ba lời hứa:
 *  · có phong cách thì ô chọn chỉ liệt kê mã hợp phong cách của bộ đặc trưng;
 *  · «Hiện mọi lựa chọn» mở lại toàn bộ danh mục, và mã ngoài phong cách vẫn chọn được — kèm câu
 *    «không hợp phong cách đã chọn», KHÔNG chặn (phong cách là thẩm mỹ, không phải luật — T52);
 *  · chưa chọn phong cách, hoặc Worker cũ chưa phát bộ đặc trưng: phiếu hiện mọi lựa chọn như trước.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyFacadeBrief, type AiFacadeBrief } from '@nvg/shared/design';
import { useState } from 'react';
import { renderWithApp } from '@/test/render';
import type { FacadeVocabularyView } from '@/hooks/use-ai-design';

vi.mock('@/hooks/use-ai-design', () => ({
  useFacadeVocabulary: () => ({ isLoading: true, error: null, data: undefined }),
  useFacadeBrief: () => ({ isLoading: true, error: null, data: undefined }),
  useSaveFacadeBrief: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const { FacadeBriefFields } = await import('../ai-facade-brief-form');

const option = (code: string, label: string) => ({ code, label });

const VOCAB: FacadeVocabularyView = {
  roofTypes: [option('flat', 'Mái bằng'), option('thai', 'Mái Thái'), option('hip', 'Mái tứ giác')],
  roofMaterials: [option('ngoi_mau', 'Ngói màu xi măng'), option('ton_song', 'Tôn sóng')],
  materials: [option('son_nuoc', 'Sơn nước ngoại thất'), option('tam_alu', 'Tấm ốp nhôm alu')],
  colours: [
    { code: 'trang', label: 'Trắng', hex: '#F5F5F2' },
    { code: 'xanh_ngoc', label: 'Xanh ngọc', hex: '#5E9C8F' },
  ],
  railings: [option('con_tien', 'Lan can con tiện')],
  doorMaterials: [option('nhom_kinh_he', 'Nhôm kính hệ (Xingfa…)')],
  doorTypes: [option('hai_canh', '2 cánh mở quay')],
  glassTypes: [option('trong', 'Kính trong')],
  garageDoorTypes: [option('cuon', 'Cửa cuốn')],
  fenceTypes: [option('xay_dac', 'Xây đặc')],
  gateTypes: [option('swing', 'Cổng mở quay')],
  elements: [option('canopy', 'Ô văng')],
  defaults: { groundRaiseCm: 45, parapetCm: 110, doorHeightCm: 250, railingHCm: 110 },
  styles: [
    {
      code: 'mai_thai',
      label: 'Mái Thái',
      description: 'Mái dốc lớn bốn mái lợp ngói.',
      status: 'de_xuat',
      must: ['Mái Thái dốc lớn', 'Mái lợp ngói'],
      prefer: [],
      avoid: ['Mái bằng'],
      allowed: {
        roof_types: ['thai', 'hip'],
        roof_materials: ['ngoi_mau'],
        materials: ['son_nuoc'],
        colours: ['trang'],
      },
    },
  ],
};

function Harness({
  style,
  vocab = VOCAB,
  initial,
}: {
  style: AiFacadeBrief['style'];
  vocab?: FacadeVocabularyView;
  initial?: AiFacadeBrief;
}) {
  const [draft, setDraft] = useState<AiFacadeBrief>(initial ?? { ...emptyFacadeBrief(), style });
  return (
    <FacadeBriefFields
      draft={draft}
      onChange={setDraft}
      vocab={vocab}
      plan={null}
      withStyle={false}
      briefStyle={style}
    />
  );
}

const optionsOf = (name: string) =>
  Array.from(
    (screen.getByRole('combobox', { name }) as HTMLSelectElement).options,
    (o) => o.textContent,
  );

describe('Phiếu mặt đứng — lọc theo phong cách (T175)', () => {
  it('phong cách Mái Thái: ô chọn chỉ liệt kê mã hợp phong cách, kèm khung mô tả', () => {
    renderWithApp(<Harness style="mai_thai" />);
    expect(screen.getByText('Phong cách Mái Thái')).toBeInTheDocument();
    expect(screen.getByText(/chờ kiến trúc sư NVO duyệt/)).toBeInTheDocument();
    expect(optionsOf('Loại mái')).toEqual(['Để AI đề xuất', 'Mái Thái', 'Mái tứ giác']);
    expect(optionsOf('Vật liệu mái')).toEqual(['Để AI đề xuất', 'Ngói màu xi măng']);
    expect(optionsOf('Màu mái')).toEqual(['Để AI đề xuất', 'Trắng — #F5F5F2']);
    // Nhóm bộ đặc trưng không khai (lan can) thì không lọc.
    expect(optionsOf('Kiểu lan can')).toEqual(['Để AI đề xuất', 'Lan can con tiện']);
  });

  it('«Hiện mọi lựa chọn»: chọn được mã ngoài phong cách, có câu cảnh báo, không chặn', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness style="mai_thai" />);
    await user.click(screen.getByRole('checkbox', { name: /Hiện mọi lựa chọn/ }));
    expect(optionsOf('Loại mái')).toEqual(['Để AI đề xuất', 'Mái bằng', 'Mái Thái', 'Mái tứ giác']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Loại mái' }), 'flat');
    expect(screen.getByRole('combobox', { name: 'Loại mái' })).toHaveValue('flat');
    expect(screen.getByText('Không hợp phong cách Mái Thái đã chọn.')).toBeInTheDocument();
    // Tắt lại bộ lọc: mã đang chọn vẫn hiện (không giấu giá trị đã có), cảnh báo vẫn còn.
    await user.click(screen.getByRole('checkbox', { name: /Hiện mọi lựa chọn/ }));
    expect(optionsOf('Loại mái')).toEqual(['Để AI đề xuất', 'Mái bằng', 'Mái Thái', 'Mái tứ giác']);
    expect(screen.getByText('Không hợp phong cách Mái Thái đã chọn.')).toBeInTheDocument();
  });

  it('chưa chọn phong cách, hoặc Worker chưa phát bộ đặc trưng: hiện mọi lựa chọn như trước', () => {
    const { unmount } = renderWithApp(<Harness style={null} />);
    expect(screen.queryByText(/Phong cách /)).not.toBeInTheDocument();
    expect(optionsOf('Loại mái')).toHaveLength(4);
    unmount();
    const { styles: _drop, ...old } = VOCAB;
    renderWithApp(<Harness style="mai_thai" vocab={old} />);
    expect(optionsOf('Loại mái')).toHaveLength(4);
    expect(screen.queryByRole('checkbox', { name: /Hiện mọi lựa chọn/ })).not.toBeInTheDocument();
  });
});
