/**
 * Máy đọc phiếu khảo sát giấy (28/10/2026).
 *
 * Canh hai điều:
 *  - Che thông tin khách TRƯỚC khi gửi: vạch đen dưới khung thông tin khách được tìm ra, mọi điểm ảnh phía
 *    trên thành trắng đặc, phần dưới giữ nguyên. Bỏ bước che thì phép thử «phần đã che» đỏ.
 *  - Kết quả máy đọc không đè ô biên bản đã có chữ: chỉ ô trống được chọn sẵn; «Áp» gửi đúng ô đã chọn.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { paperInitialSelection, type PaperReadItem } from '@nvg/shared';
import { defaultRedaction, findCutBar, FALLBACK_TOP_FRACTION, redactRows } from '../paper-redact';
import { applyPaperEntries, paperCurrentValues } from '../survey-paper-apply';
import { PaperReadResult } from '../survey-paper-read-panel';
import type { SurveyPaperReadResult } from '@/lib/ai-api';

/** Trang giả 200 × 300: nền xám nhạt «chữ» ở mọi dòng, vạch đen dày ở dòng 90–99. */
function page(withBar = true) {
  const width = 200;
  const height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Một «nét chữ» tối ngắn ở mỗi dòng (không đủ để thành vạch), còn lại nền giấy.
      const ink = x % 37 === 0;
      const bar = withBar && y >= 90 && y < 100 && x > 4 && x < 196;
      const v = bar || ink ? 20 : 235;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('che thông tin khách trên ảnh phiếu', () => {
  it('tìm vạch đen dưới khung thông tin khách', () => {
    const bar = findCutBar(page());
    expect(bar).not.toBeNull();
    expect(bar!).toBeGreaterThan(100 / 300);
    expect(bar!).toBeLessThan(110 / 300);
    expect(findCutBar(page(false))).toBeNull();
  });

  it('trong vùng che trắng đặc, ngoài vùng giữ nguyên', () => {
    const img = page();
    const before = img.data.slice();
    const plan = defaultRedaction(img, 0);
    expect(plan.barFound).toBe(true);
    redactRows(img, plan.top, plan.bottom);
    const cut = Math.round(plan.top * img.height);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x += 7) {
        const i = (y * img.width + x) * 4;
        if (y < cut) {
          expect([img.data[i], img.data[i + 1], img.data[i + 2]]).toEqual([255, 255, 255]);
        } else {
          expect(img.data[i]).toBe(before[i]);
        }
      }
    }
    // Có thật phần «chữ» bị xoá phía trên (bỏ bước che thì phép thử này đỏ).
    expect(before[(10 * img.width + 37) * 4]).toBe(20);
    expect(img.data[(10 * img.width + 37) * 4]).toBe(255);
  });

  it('không thấy vạch: trang đầu che cố định, trang sau không che; che dưới khi được yêu cầu', () => {
    expect(defaultRedaction(page(false), 0)).toEqual({
      top: FALLBACK_TOP_FRACTION,
      bottom: 0,
      barFound: false,
    });
    expect(defaultRedaction(page(false), 1).top).toBe(0);
    const img = page(false);
    redactRows(img, 0, 0.1);
    const last = ((img.height - 1) * img.width + 37) * 4;
    expect(img.data[last]).toBe(255);
    expect(img.data[(10 * img.width + 37) * 4]).toBe(20);
  });
});

const items: PaperReadItem[] = [
  {
    key: 'needs',
    label: 'Nhu cầu của khách',
    group: 'report',
    value: 'Xưởng 1.500 m²',
    confidence: 'ro',
  },
  {
    key: 'budget_note',
    label: 'Ngân sách',
    group: 'report',
    value: 'Khoảng 6 tỷ',
    confidence: 'khong_ro',
  },
  { key: 'site.crane', label: 'Cầu trục', group: 'site', value: '5 tấn', confidence: 'ro' },
];

describe('kết quả máy đọc không đè ô đã có', () => {
  const form = {
    needs: 'Đã ghi tay: nhà xưởng',
    decisionMaker: '',
    budgetNote: '',
    scheduleNote: '',
    commercialTerms: '',
    notes: '',
    siteDetails: { crane: '' },
  };

  it('chỉ ô trống được chọn sẵn', () => {
    const sel = paperInitialSelection(items, paperCurrentValues(form));
    expect([...sel].sort()).toEqual(['budget_note', 'site.crane']);
  });

  it('khối kết quả: ô đã có chữ không chọn sẵn, «Áp» gửi đúng ô đã chọn', async () => {
    const onApply = vi.fn(() => null);
    const result: SurveyPaperReadResult = { accepted: items, rejected: [], fake: false };
    render(
      <PaperReadResult
        request={Promise.resolve(result)}
        current={paperCurrentValues(form)}
        onApply={onApply}
      />,
    );
    const needs = await screen.findByRole('checkbox', { name: /Nhu cầu của khách/ });
    expect(needs).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ngân sách/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Cầu trục/ })).toBeChecked();
    expect(screen.getByText(/Biên bản đã có nội dung ở ô này/)).toBeInTheDocument();
    expect(screen.getByText('Không rõ — kiểm lại')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Áp 2 ô vào biên bản' }));
    expect(onApply).toHaveBeenCalledWith([
      { key: 'budget_note', value: 'Khoảng 6 tỷ' },
      { key: 'site.crane', value: '5 tấn' },
    ]);
  });

  it('áp vào biểu mẫu: đặt đúng trường, ô phiếu riêng vào siteDetails, khoá lạ bỏ qua', () => {
    const next = applyPaperEntries(form, [
      { key: 'budget_note', value: 'Khoảng 6 tỷ' },
      { key: 'site.crane', value: '5 tấn' },
      { key: 'toString', value: 'x' },
    ]);
    expect(next.budgetNote).toBe('Khoảng 6 tỷ');
    expect(next.siteDetails.crane).toBe('5 tấn');
    expect(next.needs).toBe('Đã ghi tay: nhà xưởng');
    expect(form.siteDetails.crane).toBe('');
  });
});
