/**
 * Chấm danh mục kiểm tra khi nghiệm thu (TC-13) — trạng thái có CHỮ, và báo trước khi gửi mục
 * nào còn thiếu kết quả hoặc thiếu ảnh bắt buộc.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderWithApp } from '@/test/render';
import {
  AcceptanceChecklistField,
  missingAnswers,
  type ChecklistAnswers,
} from '../acceptance-checklist-field';

vi.mock('@/hooks/use-site-photos', () => ({
  CONSTRUCTION_PHOTO_ACCEPT: 'image/jpeg',
  useSignedPhotoUrls: () => ({ data: {} }),
}));

const ITEMS = [
  { key: 'thep', label: 'Đường kính thép đúng bản vẽ', requires_photo: true },
  { key: 've_sinh', label: 'Cốt thép sạch gỉ', requires_photo: false },
];

function Harness() {
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  return <AcceptanceChecklistField items={ITEMS} answers={answers} onChange={setAnswers} />;
}

describe('Danh mục kiểm tra khi nghiệm thu', () => {
  it('mỗi mục có ba lựa chọn bằng chữ, chọn được', async () => {
    renderWithApp(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Cốt thép sạch gỉ' });
    const khongDat = screen.getAllByRole('radio', { name: 'Không đạt' })[1]!;
    expect(group).toContainElement(khongDat);
    await userEvent.click(khongDat);
    expect(khongDat).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Ghi chú — Cốt thép sạch gỉ')).toBeInTheDocument();
  });

  it('mục cần ảnh có nút chụp ảnh ngay tại dòng', () => {
    renderWithApp(<Harness />);
    expect(screen.getAllByRole('button', { name: /Chụp ảnh hiện trường/ })).toHaveLength(1);
  });

  it('báo mục chưa chấm và mục thiếu ảnh bắt buộc', () => {
    expect(missingAnswers(ITEMS, {})).toEqual(ITEMS.map((i) => i.label));
    expect(
      missingAnswers(ITEMS, {
        thep: { result: 'dat', note: '', files: [] },
        ve_sinh: { result: 'dat', note: '', files: [] },
      }),
    ).toEqual(['Đường kính thép đúng bản vẽ']);
    expect(
      missingAnswers(ITEMS, {
        thep: { result: 'khong_ap_dung', note: '', files: [] },
        ve_sinh: { result: 'dat', note: '', files: [] },
      }),
    ).toEqual([]);
  });
});
