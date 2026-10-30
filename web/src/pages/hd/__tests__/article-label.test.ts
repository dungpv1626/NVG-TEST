import { describe, expect, it } from 'vitest';
import { articleLabel } from '../document-inputs';

// Tên Điều lấy từ câu văn của mẫu — chạy thử NVC 30/10/2026: «PHỤ LỤC HỢP ĐỒNG SỐ {so_phu_luc} – …»
// hiện nguyên cú pháp mẫu ở khối «Nội dung riêng của văn bản».
describe('articleLabel', () => {
  it('thay chỗ trống của mẫu bằng dấu ba chấm', () => {
    expect(
      articleLabel('PHỤ LỤC HỢP ĐỒNG SỐ {so_phu_luc} – ĐIỀU CHỈNH KHỐI LƯỢNG, PHÁT SINH'),
    ).toBe('PHỤ LỤC HỢP ĐỒNG SỐ … – ĐIỀU CHỈNH KHỐI LƯỢNG, PHÁT SINH');
  });
  it('giữ nguyên tên Điều không có chỗ trống', () => {
    expect(articleLabel('Điều 3. Giá trị hợp đồng sau điều chỉnh')).toBe(
      'Điều 3. Giá trị hợp đồng sau điều chỉnh',
    );
  });
});
