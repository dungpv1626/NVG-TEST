/**
 * Mốc thi công (Đợt 2 — 2A, migration 0182).
 *
 * Bộ 7 mốc NVO rút từ «Quy chuẩn Nhà Việt One» (công thức vận hành bước 08 → 14; quy tắc VI định
 * vị, VIII thi công, IX chống thấm, X điện nước, XII nghiệm thu trước khi che khuất; chuẩn 05 ba
 * lớp kiểm soát, chuẩn 06 ảnh hoá công trình). ⚠️ Đây là ĐỀ XUẤT dựng từ quy chuẩn — Trưởng phòng
 * Thi công NVO duyệt lại từng mục. Danh sách là dữ liệu: `db:seed` nạp vào `acceptance_checklists`
 * + `milestone_templates`; sửa ở đây rồi seed lại, hoặc sửa thẳng bảng — không cần migration.
 *
 * `requires_technical_check` = lớp 3 (phụ trách kỹ thuật kiểm): chuẩn 05 kể móng, kết cấu, chống
 * thấm, MEP âm, hoàn thiện; định vị thêm vì quy tắc VI đòi «kiểm tra ít nhất hai lần». Mốc 7
 * chính là lượt kiểm chất lượng trước bàn giao nên không thêm lớp nữa.
 *
 * Mục `requires_photo` = công việc sẽ bị CHE KHUẤT (chuẩn 06: ảnh trước – trong – sau).
 */

export const SITE_MILESTONE_STATUSES = ['cho_lam', 'dang_lam', 'cho_ky_thuat', 'dat'] as const;
export type SiteMilestoneStatus = (typeof SITE_MILESTONE_STATUSES)[number];

export const SITE_MILESTONE_STATUS_LABELS: Readonly<Record<SiteMilestoneStatus, string>> = {
  cho_lam: 'Chưa tới',
  dang_lam: 'Đang làm',
  cho_ky_thuat: 'Chờ phụ trách kỹ thuật',
  dat: 'Đạt',
};

export const SITE_MILESTONE_EVENT_LABELS: Readonly<Record<string, string>> = {
  bat_dau: 'Bắt đầu mốc',
  khong_dat: 'Nghiệm thu chưa đạt',
  cho_ky_thuat: 'Nghiệm thu nội bộ đạt — chờ phụ trách kỹ thuật',
  tra_lai: 'Phụ trách kỹ thuật trả lại',
  dat: 'Mốc đạt',
};

/** Nhóm trạng thái chung (CLAUDE.md 4.2) — quá hạn khi qua ngày dự kiến mà chưa đạt. */
export function milestoneDisplayStatus(
  status: SiteMilestoneStatus,
  plannedEndDate: string | null,
  today: string = new Date().toISOString().slice(0, 10),
): 'draft' | 'in_progress' | 'pending_approval' | 'completed' | 'overdue' {
  if (status === 'dat') return 'completed';
  if (plannedEndDate && plannedEndDate < today && status !== 'cho_lam') return 'overdue';
  if (status === 'cho_ky_thuat') return 'pending_approval';
  if (status === 'dang_lam') return 'in_progress';
  return 'draft';
}

export interface MilestoneChecklistItem {
  readonly key: string;
  readonly label: string;
  readonly requires_photo: boolean;
}

export interface MilestoneStepSeed {
  readonly key: string;
  readonly label: string;
  readonly requiresTechnicalCheck: boolean;
  /** Tên danh mục kiểm tra nạp vào `acceptance_checklists`. */
  readonly checklistName: string;
  readonly items: readonly MilestoneChecklistItem[];
}

export interface MilestoneSetSeed {
  readonly company: string;
  readonly name: string;
  readonly steps: readonly MilestoneStepSeed[];
}

const item = (key: string, label: string, requires_photo = false): MilestoneChecklistItem => ({
  key,
  label,
  requires_photo,
});

export const NVO_MILESTONE_SET: MilestoneSetSeed = {
  company: 'NVO',
  name: 'Bảy mốc thi công nhà ở Nhà Việt One',
  steps: [
    {
      key: 'dinh_vi',
      label: 'Định vị – mốc – cao độ',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 1 — Định vị, mốc, cao độ (NVO)',
      items: [
        item(
          'phap_ly',
          'Đã kiểm pháp lý: quyền sử dụng đất, chỉ giới, giấy phép xây dựng nếu thuộc diện',
        ),
        item('ho_so', 'Đã có hồ sơ kỹ thuật đủ để thi công: kiến trúc, kết cấu, điện, nước'),
        item('ranh_gioi', 'Mốc ranh giới khu đất', true),
        item('tim_truc', 'Tim trục công trình', true),
        item('kich_thuoc', 'Kích thước công trình đúng bản vẽ'),
        item('cao_do', 'Cao độ ±0.000, cốt nền, cốt đường, cốt sân', true),
        item('cot_mong', 'Cốt móng'),
        item('kiem_lan_hai', 'Đã kiểm lần hai trước khi đào móng'),
      ],
    },
    {
      key: 'mong',
      label: 'Thi công phần móng',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 2 — Phần móng, trước khi đổ bê tông (NVO)',
      items: [
        item('tim_mong', 'Tim móng, kích thước, cao độ đáy móng'),
        item('cot_thep', 'Cốt thép: đường kính, khoảng cách đúng hồ sơ', true),
        item('lop_bao_ve', 'Lớp bê tông bảo vệ (con kê)', true),
        item('thep_cho', 'Thép chờ cột', true),
        item('cop_pha', 'Cốp pha kín, chắc', true),
        item('xuyen_mong', 'Ống điện nước xuyên móng (nếu có)', true),
        item('dieu_kien_do', 'Điều kiện đổ bê tông: mác bê tông đúng hồ sơ, thời tiết, nhân lực'),
        item('an_toan_ho_mong', 'An toàn hố móng'),
      ],
    },
    {
      key: 'ket_cau',
      label: 'Thi công kết cấu',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 3 — Kết cấu cột, dầm, sàn, thang (NVO)',
      items: [
        item('tiet_dien', 'Tiết diện cột, dầm, sàn đúng hồ sơ — không tự ý đổi'),
        item('thep_dam_san', 'Cốt thép dầm, sàn, cầu thang', true),
        item('cop_pha_chong', 'Cốp pha, cây chống', true),
        item('ong_cho_san', 'Ống điện nước chờ trong sàn, dầm', true),
        item('mac_be_tong', 'Mác bê tông đúng hồ sơ'),
        item('khong_duc_pha', 'Không đục phá, cắt cấu kiện chịu lực'),
        item('an_toan_cao', 'An toàn giàn giáo, làm việc trên cao'),
      ],
    },
    {
      key: 'xay_trat_mep',
      label: 'Xây – trát – điện nước âm',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 4 — Xây, trát, điện nước âm, trước khi trát / đóng trần (NVO)',
      items: [
        item('tuong_xay', 'Tường xây đúng vị trí, kích thước, cửa đúng cao độ'),
        item('dien_am', 'Ống điện âm tường, sàn', true),
        item('nuoc_am', 'Ống cấp thoát nước âm', true),
        item('thu_ap', 'Thử áp lực đường ống nước', true),
        item('khong_cat_dam', 'Không cắt dầm, cột để đi ống'),
        item('du_diem', 'Đủ ổ cắm, đường mạng, đường điều hoà, thoát nước theo hồ sơ'),
        item('tran_mep', 'Trần: đã kiểm MEP trước khi đóng trần', true),
      ],
    },
    {
      key: 'chong_tham',
      label: 'Chống thấm',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 5 — Chống thấm, trước khi cán / lát (NVO)',
      items: [
        item('wc', 'Chống thấm WC', true),
        item('ban_cong_san_thuong', 'Ban công, sân thượng, mái', true),
        item('co_ong', 'Xử lý cổ ống, góc, khe tiếp giáp', true),
        item('chieu_cao_lop', 'Chiều cao chống thấm, số lớp đúng quy trình'),
        item('vat_lieu', 'Vật liệu chống thấm đúng chủng loại đã duyệt'),
        item('bao_duong', 'Đủ thời gian bảo dưỡng'),
        item('test_nuoc', 'Ngâm thử nước — không thấm', true),
      ],
    },
    {
      key: 'hoan_thien',
      label: 'Hoàn thiện',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 6 — Hoàn thiện (NVO)',
      items: [
        item('vat_lieu_ht', 'Vật liệu hoàn thiện đúng chủng loại, hãng đã duyệt', true),
        item('lat_op', 'Lát, ốp: phẳng, đều mạch, không bộp', true),
        item('son_ba', 'Sơn bả', true),
        item('cua', 'Cửa: lắp đặt, đóng mở, phụ kiện'),
        item('thiet_bi', 'Thiết bị vệ sinh, bếp lắp đặt đúng vị trí'),
        item('dien_chieu_sang', 'Điện chiếu sáng, ổ cắm thử hoạt động'),
        item('thay_doi', 'Mọi thay đổi so với thiết kế đã được xác nhận trước khi làm'),
      ],
    },
    {
      key: 'kiem_tra_cl',
      label: 'Kiểm tra chất lượng trước bàn giao',
      requiresTechnicalCheck: false,
      checklistName: 'Mốc 7 — Kiểm tra chất lượng trước bàn giao (NVO)',
      items: [
        item('ton_tai', 'Mọi tồn tại của các mốc trước đã khắc phục'),
        item('thu_dien_nuoc', 'Thử điện, nước toàn nhà'),
        item('kiem_tham', 'Kiểm thấm sau mưa / sau thử nước'),
        item('ve_sinh', 'Vệ sinh công trình'),
        item('anh_tong_the', 'Ảnh tổng thể công trình', true),
        item('ho_so_ban_giao', 'Hồ sơ bàn giao: danh mục thiết bị, thông tin bảo hành'),
      ],
    },
  ],
};

export const MILESTONE_SET_SEEDS: readonly MilestoneSetSeed[] = [NVO_MILESTONE_SET];
