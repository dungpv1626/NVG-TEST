/**
 * Danh mục kiểm tra nghiệm thu VÍ DỤ cho NVC (TC-13).
 *
 * Nội dung danh mục là quyết định nghiệp vụ của NVG — đây là ví dụ để trình diễn và để Phòng
 * Thi công sửa lại cho đúng quy trình của mình, không phải quy chuẩn. Soạn bằng tài khoản
 * Trưởng phòng Thi công, đúng quyền soạn danh mục.
 */

import { ACCOUNTS, check, companyId, signIn } from './client';
import { clean } from './names';

const CHECKLISTS = [
  {
    name: 'Nghiệm thu cốt thép trước khi đổ bê tông',
    items: [
      { key: 'duong_kinh', label: 'Đường kính, số lượng thanh đúng bản vẽ', requires_photo: true },
      {
        key: 'khoang_cach',
        label: 'Khoảng cách thanh và lớp bê tông bảo vệ',
        requires_photo: true,
      },
      { key: 'moi_noi', label: 'Mối nối, chiều dài neo đúng thiết kế', requires_photo: false },
      { key: 've_sinh', label: 'Cốt thép sạch gỉ, sạch dầu mỡ', requires_photo: false },
    ],
  },
  {
    name: 'Nghiệm thu bê tông móng',
    items: [
      { key: 'kich_thuoc', label: 'Cao độ, kích thước hình học đúng bản vẽ', requires_photo: true },
      { key: 'be_mat', label: 'Bề mặt không rỗ, không nứt', requires_photo: true },
      { key: 'mau_thi_nghiem', label: 'Đã đúc viên kiểm tra cường độ', requires_photo: false },
      { key: 'bao_duong', label: 'Bảo dưỡng ẩm đúng thời gian', requires_photo: false },
    ],
  },
  {
    name: 'Nghiệm thu lắp dựng kết cấu thép',
    items: [
      { key: 'bu_long_neo', label: 'Bu lông neo, cao độ chân cột', requires_photo: true },
      { key: 'thang_dung', label: 'Độ thẳng đứng của cột', requires_photo: true },
      {
        key: 'lien_ket',
        label: 'Mối hàn, bu lông liên kết đủ và siết đúng lực',
        requires_photo: false,
      },
      { key: 'son', label: 'Sơn chống gỉ phủ kín, không bong', requires_photo: false },
    ],
  },
];

export async function loadChecklists(): Promise<'created' | 'skipped'> {
  const truongPhong = await signIn(ACCOUNTS.truongPhongTc);
  const probe = await truongPhong.from('acceptance_checklists').select('name').limit(50);
  if (probe.error) {
    // CSDL chưa có migration 0136 (bản demo trước đợt phát hành) — bỏ qua, nạp lại sau.
    return 'skipped';
  }
  const existing = new Set((probe.data ?? []).map((r) => (r as { name: string }).name));
  const nvc = await companyId(truongPhong, 'NVC');
  let created = 0;
  for (const list of CHECKLISTS) {
    if (existing.has(list.name)) continue;
    check(
      `lập danh mục «${list.name}»`,
      await truongPhong.from('acceptance_checklists').insert({
        company_id: nvc,
        name: clean(list.name),
        items: list.items.map((i) => ({ ...i, label: clean(i.label) })),
      }),
    );
    created++;
  }
  return created > 0 ? 'created' : 'skipped';
}
