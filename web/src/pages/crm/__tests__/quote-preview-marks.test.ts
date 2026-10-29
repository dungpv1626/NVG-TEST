import { describe, expect, it } from 'vitest';
import { buildQuoteDocumentData, TEMPLATE_BLANK } from '@nvg/shared';
import { decorateQuotePreview, markQuoteData } from '../quote-preview-marks';

const data = buildQuoteDocumentData({
  quote: {
    code: 'NVC-BG-1',
    version: 1,
    status: 'completed',
    created_at: '2026-10-29T03:00:00Z',
    valid_until: null,
    notes: 'Phạm vi phần thô',
    total_value: 110_000_000,
    discount_amount: null,
    vat_rate: 10,
    vat_included: false,
    line_items_based: true,
  },
  items: [
    {
      position: 1,
      description: 'Đào móng',
      unit: 'm3',
      quantity: 100,
      unit_price: 1_000_000,
      amount: 100_000_000,
    },
  ],
  company: null,
  customer: null,
  opportunityName: null,
  preparedBy: null,
});

/** Dựng lại chữ như docx-preview: mỗi giá trị một nút chữ trong `<p>`. */
function render(values: Record<string, unknown>, keys: string[]): HTMLElement {
  const root = document.createElement('div');
  for (const k of keys) {
    const p = document.createElement('p');
    p.textContent = `${k}: ${String(values[k])}`;
    root.append(p);
  }
  return root;
}

describe('bản xem trước báo giá sửa tại chỗ', () => {
  it('câu chữ bấm sửa được, số tiền khoá; ô trống in dải chấm bấm được', () => {
    const marked = markQuoteData(data, true);
    const root = render(marked, ['dieu_kien', 'thoi_gian_thuc_hien', 'tong_cong']);
    decorateQuotePreview(root);
    const editable = root.querySelectorAll('mark[data-quote-key]');
    expect([...editable].map((m) => (m as HTMLElement).dataset.quoteKey)).toEqual([
      'dieu_kien',
      'thoi_gian_thuc_hien',
    ]);
    expect(editable[1]!.textContent).toBe(TEMPLATE_BLANK);
    const locked = root.querySelector('mark[data-locked]')!;
    expect(locked.textContent).toBe('110.000.000 đồng');
    // Không còn dấu ẩn nào trong chữ.
    expect(/[-]/.test(root.textContent ?? '')).toBe(false);
  });
  it('người không có quyền sửa: câu chữ in thường, số tiền vẫn khoá; ô bảng khoá', () => {
    const marked = markQuoteData(data, false);
    expect(marked.dieu_kien).toBe('Phạm vi phần thô');
    const row = (marked.hang_muc as unknown as Record<string, string>[])[0]!;
    expect(row.noi_dung).toBe('Đào móng');
    expect(row.thanh_tien).not.toBe('100.000.000');
    const root = render(row, ['thanh_tien']);
    decorateQuotePreview(root);
    expect(root.querySelector('mark[data-locked]')!.textContent).toBe('100.000.000');
  });
});
