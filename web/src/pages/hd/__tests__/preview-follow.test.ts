/**
 * Bản xem trước chạy theo ô đang sửa: ô bên trái → khoá chỗ trống → `<mark>` trên văn bản.
 */

import { describe, expect, it } from 'vitest';
import { previewKeysOf, previewLabelOf, termPreviewKeys } from '../preview-follow';

function dom(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('preview-follow', () => {
  it('nhóm điều khoản → bảng lặp của nhóm; Giá trị → các ô giá trị', () => {
    expect(termPreviewKeys('tien_do_thanh_toan')).toBe('dot_thanh_toan');
    expect(termPreviewKeys('gia_tri').split(' ')).toContain('gia_tri_bang_chu');
  });

  it('ô điền tay / chỗ trống tự do lấy khoá từ id; ô khác từ data-preview-keys', () => {
    const root = dom(
      '<input id="free-o_12"><div data-preview-keys="dia_diem" data-preview-label="Địa điểm"><input id="x"></div>',
    );
    expect(previewKeysOf(root.querySelector('#free-o_12')!, 'thi_cong')).toEqual(['o_12']);
    const x = root.querySelector('#x')!;
    expect(previewKeysOf(x, 'thi_cong')).toEqual(['dia_diem']);
    expect(previewLabelOf(x)).toBe('Địa điểm');
    expect(previewKeysOf(root, 'thi_cong')).toEqual([]);
  });

  it('ô của đối tác kèm khoá bên A / B đúng chiều hợp đồng', () => {
    const root = dom('<input id="customer-doi_tac_dia_chi">');
    const input = root.querySelector('input')!;
    // NVG nhận thi công → NVG là bên B, khách là bên A.
    expect(previewKeysOf(input, 'thi_cong')).toEqual(['doi_tac_dia_chi', 'ben_a_dia_chi']);
    // NVG đi mua vật tư → NVG là bên A, nhà cung cấp là bên B.
    expect(previewKeysOf(input, 'mua_vat_tu')).toEqual(['doi_tac_dia_chi', 'ben_b_dia_chi']);
  });
});
