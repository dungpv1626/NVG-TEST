/**
 * Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2) — dựng trong bộ nhớ, không gọi mạng.
 *
 * Canh những lời hứa của phiếu:
 *  · mọi ô chọn có «Để AI đề xuất» làm mặc định — để trống là một lựa chọn, không phải thiếu sót;
 *  · bề rộng cửa CHỈ ĐỌC, lấy từ mặt bằng (Haan chốt 19/09/2026);
 *  · màu kèm tên và mã hex bằng chữ (CGD 6.8);
 *  · lưu gửi đúng MÃ danh mục; nháp đang gõ không mất khi màn hình dựng lại (CLAUDE.md 5.4).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiFacadeBrief } from '@nvg/shared/design';
import { renderWithApp } from '@/test/render';

const PLAN = `sha256:${'a'.repeat(64)}`;

const state = vi.hoisted(() => ({
  saved: null as unknown,
  save: vi.fn((_input: unknown) => Promise.resolve({ artifactId: 'sha256:x' })),
}));

const option = (code: string, label: string) => ({ code, label });

vi.mock('@/hooks/use-ai-design', () => ({
  useFacadeVocabulary: () => ({
    isLoading: false,
    error: null,
    data: {
      roofTypes: [option('flat', 'Mái bằng'), option('japanese', 'Mái Nhật')],
      roofMaterials: [option('ngoi_phang', 'Ngói phẳng')],
      materials: [option('son_nuoc', 'Sơn nước ngoại thất')],
      colours: [
        { code: 'ghi_bac', label: 'Ghi bạc', hex: '#A7ABAE' },
        { code: 'den', label: 'Đen', hex: '#1F2022' },
      ],
      railings: [option('kinh_cuong_luc', 'Lan can kính cường lực')],
      doorMaterials: [option('nhom_kinh_he', 'Nhôm kính hệ (Xingfa…)')],
      doorTypes: [option('bon_canh', '4 cánh (2 cố định, 2 mở)')],
      glassTypes: [option('trong', 'Kính trong')],
      garageDoorTypes: [option('cuon', 'Cửa cuốn')],
      fenceTypes: [option('xay_dac', 'Xây đặc')],
      gateTypes: [option('sliding', 'Cổng trượt')],
      elements: [option('canopy', 'Ô văng'), option('planter', 'Bồn cây')],
      defaults: { groundRaiseCm: 45, parapetCm: 110, doorHeightCm: 250 },
    },
  }),
  useFacadeBrief: () => ({ isLoading: false, error: null, data: state.saved }),
  useSaveFacadeBrief: () => ({ mutateAsync: state.save, isPending: false }),
}));

const { FacadeBriefForm, useFacadeBriefController } = await import('../ai-facade-brief-form');

function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const controller = useFacadeBriefController('p1');
  return <FacadeBriefForm controller={controller} readOnly={readOnly} />;
}

function savedState(over: Record<string, unknown> = {}) {
  return {
    artifactId: null,
    savedAt: null,
    brief: null,
    plan: {
      artifactId: PLAN,
      mainDoorW: 165,
      sideDoorWs: [180],
      garageW: 200,
      frontYard: true,
      balconies: 1,
    },
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  state.save.mockClear();
  state.saved = savedState();
});

describe('Phiếu yêu cầu mặt đứng', () => {
  it('mọi ô chọn mặc định «Để AI đề xuất»; phiếu chưa điền nói rõ', async () => {
    renderWithApp(<Harness />);
    expect(await screen.findByText('Chưa điền')).toBeInTheDocument();
    const roof = screen.getByRole('combobox', { name: 'Loại mái' });
    expect(roof).toHaveValue('');
    expect(within(roof).getByRole('option', { name: 'Để AI đề xuất' })).toBeInTheDocument();
    // Ô số: gợi ý giá trị mặc định khi để trống.
    expect(
      screen.getByRole('textbox', { name: 'Cốt sàn tầng 1 cao hơn vỉa hè (cm)' }),
    ).toHaveAttribute('placeholder', 'Để AI đề xuất (mặc định 45)');
  });

  it('bề rộng cửa chỉ đọc, lấy từ mặt bằng, nhắc sửa ở bước 1', () => {
    renderWithApp(<Harness />);
    expect(screen.getByText('1.650 mm. Muốn đổi, sửa ở bước 1.')).toBeInTheDocument();
    expect(screen.getByText('2.000 mm — theo mặt bằng')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Bề rộng/ })).toBeNull();
  });

  it('màu có tên kèm mã hex trong danh sách chọn', () => {
    renderWithApp(<Harness />);
    const colour = screen.getByRole('combobox', { name: 'Màu chính' });
    expect(within(colour).getByRole('option', { name: 'Ghi bạc — #A7ABAE' })).toBeInTheDocument();
  });

  it('chọn rồi lưu: gửi đúng MÃ danh mục, không gửi nhãn', async () => {
    renderWithApp(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Loại mái' }), 'japanese');
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Chiều cao (cm)' })[0]!, '280');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Bồn cây' }));
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Lưu yêu cầu' }));
    const sent = (state.save.mock.calls[0]![0] as { brief: AiFacadeBrief }).brief;
    expect(sent.roof.type).toBe('japanese');
    expect(sent.main_door.h_cm).toBe(280);
    expect(sent.decorations).toEqual(['planter']);
  });

  it('nháp đang gõ còn nguyên khi màn hình dựng lại (rời bước rồi quay lại)', async () => {
    const first = renderWithApp(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Loại mái' }), 'flat');
    first.unmount();

    renderWithApp(<Harness />);
    expect(await screen.findByRole('combobox', { name: 'Loại mái' })).toHaveValue('flat');
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument();
  });

  it('nhà sát ranh mặt tiền: không có nhóm cổng và tường rào, nói lý do', () => {
    state.saved = savedState({
      plan: { ...savedState().plan, frontYard: false, balconies: 0 },
    });
    renderWithApp(<Harness />);
    expect(screen.getByText(/không có sân trước/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Kiểu cổng' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Kiểu lan can' })).toBeNull();
  });

  it('ô ghi chú nhắc không ghi danh tính khách — nội dung đi tới nhà cung cấp mô hình', () => {
    renderWithApp(<Harness />);
    expect(screen.getByText(/không ghi tên khách, số điện thoại, địa chỉ/)).toBeInTheDocument();
  });
});
