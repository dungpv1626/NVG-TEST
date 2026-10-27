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

/**
 * Tám mốc thi công nhà xưởng NVC — ĐỀ XUẤT của Claude Code theo câu 15 (anh Dũng 27/10/2026: «bạn đề xuất»), dựng theo
 * trình tự tổng thầu nhà xưởng khung thép thông dụng. NVC thi công theo bản vẽ / phương án của chủ đầu tư (câu 14), nên
 * mốc 1 kiểm bản vẽ thi công đã được chủ đầu tư duyệt chứ không phải thiết kế của NVC. Trưởng phòng Thi công NVC duyệt
 * lại từng mục; sửa ở đây rồi seed lại.
 *
 * Lớp 3 (phụ trách kỹ thuật kiểm): mọi mốc kết cấu và hạ tầng ngầm — bu lông neo chân cột và mối hàn khung thép sai thì
 * không sửa được sau khi lắp dựng. Mốc 8 là lượt kiểm trước bàn giao nên không thêm lớp nữa.
 */
export const NVC_MILESTONE_SET: MilestoneSetSeed = {
  company: 'NVC',
  name: 'Tám mốc thi công nhà xưởng Nhà Việt Cons',
  steps: [
    {
      key: 'chuan_bi_dinh_vi',
      label: 'Chuẩn bị, định vị, mốc cao độ',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 1 — Chuẩn bị mặt bằng, định vị (NVC)',
      items: [
        item('ban_giao_mat_bang', 'Biên bản nhận bàn giao mặt bằng từ chủ đầu tư'),
        item(
          'ban_ve_cdt',
          'Bản vẽ thi công đã được chủ đầu tư phê duyệt (theo phương án của chủ đầu tư)',
        ),
        item('bien_phap', 'Biện pháp thi công và tiến độ đã được chủ đầu tư chấp thuận'),
        item('moc_chuan', 'Hệ mốc toạ độ, cao độ chuẩn nhận từ chủ đầu tư', true),
        item('luoi_cot', 'Tim trục, lưới cột đúng bản vẽ', true),
        item('cong_truong', 'Hàng rào, lán trại, điện nước thi công, biển báo an toàn'),
        item('kiem_lan_hai', 'Đã kiểm định vị lần hai trước khi thi công cọc / móng'),
      ],
    },
    {
      key: 'coc_mong',
      label: 'Cọc, móng, giằng móng',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 2 — Cọc và móng, trước khi đổ bê tông (NVC)',
      items: [
        item('thi_nghiem_coc', 'Kết quả thí nghiệm cọc (nén tĩnh / PDA) nếu hồ sơ yêu cầu'),
        item('dau_coc', 'Cao độ đầu cọc, đập đầu cọc, thép neo vào đài', true),
        item('cot_thep_dai', 'Cốt thép đài, giằng móng: đường kính, khoảng cách đúng hồ sơ', true),
        item('bu_long_neo', 'Bu lông neo chân cột: vị trí, cao độ, dưỡng định vị', true),
        item('cop_pha', 'Cốp pha kín, chắc; lớp bê tông bảo vệ (con kê)', true),
        item('ngam_dien_nuoc', 'Ống điện, nước, tiếp địa đi ngầm qua móng (nếu có)', true),
        item('be_tong', 'Mác bê tông đúng hồ sơ, phiếu giao bê tông, lấy mẫu thí nghiệm'),
      ],
    },
    {
      key: 'nen_ha_tang',
      label: 'San nền, hạ tầng ngầm',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 3 — San nền, hạ tầng ngầm, trước khi lấp (NVC)',
      items: [
        item('do_chat', 'Lu lèn nền đạt độ chặt thiết kế (kết quả thí nghiệm K)'),
        item('thoat_nuoc', 'Cống, hố ga, thoát nước mưa ngầm', true),
        item('dien_ngam', 'Ống luồn cáp điện ngầm, hệ tiếp địa', true),
        item('cap_nuoc_pccc', 'Ống cấp nước, ống PCCC đi ngầm — thử áp lực trước khi lấp', true),
        item('lop_lot', 'Lớp đá dăm / cát đệm, màng chống ẩm dưới nền'),
      ],
    },
    {
      key: 'ket_cau_thep',
      label: 'Kết cấu thép, lắp dựng khung',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 4 — Gia công và lắp dựng kết cấu thép (NVC)',
      items: [
        item('chung_chi', 'Chứng chỉ vật liệu thép, bu lông cường độ cao, que hàn'),
        item('moi_han', 'Kiểm tra mối hàn (siêu âm / thẩm thấu nếu hồ sơ yêu cầu)'),
        item('son', 'Sơn chống gỉ, sơn chống cháy đúng độ dày'),
        item('do_thang_dung', 'Độ thẳng đứng cột, cao độ vai cột, khẩu độ kèo', true),
        item('bu_long', 'Siết bu lông liên kết đúng lực; vữa chèn chân cột', true),
        item('giang', 'Giằng cột, giằng mái, xà gồ đủ và đúng vị trí', true),
        item('an_toan_cao', 'An toàn làm việc trên cao: dây cứu sinh, lưới, cẩu lắp'),
      ],
    },
    {
      key: 'mai_bao_che',
      label: 'Mái, bao che',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 5 — Mái và bao che (NVC)',
      items: [
        item('ton_mai', 'Tôn mái đúng chủng loại, độ dày; lớp cách nhiệt', true),
        item('mang_xoi', 'Úp nóc, máng xối, ống thoát nước mái', true),
        item('vach', 'Vách tôn / tường xây bao che, diềm, chống thấm chân tường'),
        item('cua', 'Cửa cuốn, cửa đi, cửa sổ, lam / quả cầu thông gió'),
        item('thu_nuoc', 'Thử nước mái, máng xối — không dột, không đọng'),
      ],
    },
    {
      key: 'nen_xuong',
      label: 'Bê tông nền xưởng',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 6 — Bê tông nền xưởng, trước khi đổ (NVC)',
      items: [
        item('thep_nen', 'Lưới thép nền, thép tăng cường vùng chịu tải', true),
        item('khe', 'Khe co giãn, khe thi công, thanh truyền lực', true),
        item('cao_do_nen', 'Cao độ, độ phẳng nền theo hồ sơ'),
        item('tai_trong', 'Chiều dày, mác bê tông theo tải trọng sàn của chủ đầu tư'),
        item('phu_mat', 'Lớp phủ mặt sàn (hardener / epoxy) nếu hồ sơ yêu cầu'),
      ],
    },
    {
      key: 'co_dien_pccc',
      label: 'Cơ điện, PCCC',
      requiresTechnicalCheck: true,
      checklistName: 'Mốc 7 — Cơ điện và PCCC (NVC)',
      items: [
        item('dien', 'Điện động lực, chiếu sáng — đo điện trở cách điện'),
        item('chong_set', 'Chống sét, tiếp địa — đo điện trở nối đất'),
        item('cap_thoat_nuoc', 'Cấp thoát nước, thiết bị vệ sinh'),
        item('pccc', 'Hệ thống PCCC lắp đặt đúng hồ sơ đã thẩm duyệt; nghiệm thu với cơ quan PCCC'),
        item('chay_thu', 'Chạy thử đồng bộ có biên bản (điện, bơm, quạt, PCCC)'),
      ],
    },
    {
      key: 'hoan_thien_ban_giao',
      label: 'Hoàn thiện, hồ sơ bàn giao',
      requiresTechnicalCheck: false,
      checklistName: 'Mốc 8 — Hoàn thiện, hồ sơ trước bàn giao (NVC)',
      items: [
        item('ve_sinh', 'Vệ sinh công nghiệp, dọn mặt bằng', true),
        item('ton_tai', 'Danh mục tồn tại của chủ đầu tư đã khắc phục'),
        item('hoan_cong', 'Hồ sơ hoàn công, nhật ký, biên bản nghiệm thu các giai đoạn'),
        item('van_hanh', 'Hướng dẫn vận hành, bảo trì; điều kiện bảo hành'),
      ],
    },
  ],
};

export const MILESTONE_SET_SEEDS: readonly MilestoneSetSeed[] = [
  NVO_MILESTONE_SET,
  NVC_MILESTONE_SET,
];
