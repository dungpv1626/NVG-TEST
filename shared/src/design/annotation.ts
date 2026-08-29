/**
 * Năm câu hỏi của Bước 3 số hoá — tri thức ngầm của kiến trúc sư.
 *
 * Nguồn: doc/design/06-knowledge-base.md mục 6.1 Bước 3.
 *
 * Nguyên tắc của bước này là **10–15 phút mỗi công trình, không bắt viết luận** — nên câu
 * trả lời là LỰA CHỌN CÓ SẴN, chữ tự do chỉ dùng khi chọn "Khác".
 *
 * Mã lựa chọn (`value`) đi thẳng vào `payload.rationale` và vào văn bản đem đi nhúng, nên
 * chúng theo cùng dạng mã với loại phòng (`^[a-z][a-z0-9_]*$`). Chữ tự do KHÔNG đi ra ngoài
 * (xem `workers/src/design/kb/rationale.ts`).
 *
 * ⚠️ **Chỉ danh sách của câu 1 lấy nguyên từ tài liệu.** Tài liệu nêu năm câu hỏi nhưng chỉ
 * liệt kê lựa chọn cho câu "vì sao cầu thang đặt ở đây". Bốn danh sách còn lại là SUY LUẬN
 * từ thực tế nhà phố, đủ dùng để dựng màn hình nhưng chưa được kiến trúc sư NVG xác nhận —
 * đã ghi thành câu hỏi chờ Haan (Q-13). Sửa danh sách là sửa tệp này, không sửa màn hình.
 */

export interface AnnotationOption {
  value: string;
  label: string;
}

export interface AnnotationQuestion {
  /** Khoá trong `payload.rationale` của hợp đồng kb-record. */
  field: 'stair_position' | 'kitchen_position' | 'biggest_constraint' | 'would_change';
  question: string;
  options: AnnotationOption[];
}

/** Lựa chọn "Khác" — mở ô chữ tự do, và ô đó KHÔNG rời khỏi hệ thống. */
export const ANNOTATION_OTHER = 'khac';

export const ANNOTATION_QUESTIONS: readonly AnnotationQuestion[] = [
  {
    field: 'stair_position',
    question: 'Vì sao cầu thang đặt ở vị trí này?',
    options: [
      { value: 'be_rong_lo', label: 'Bề rộng lô đất' },
      { value: 'lay_sang_gieng_troi', label: 'Lấy sáng giếng trời' },
      { value: 'phong_thuy', label: 'Phong thuỷ' },
      { value: 'khach_yeu_cau', label: 'Khách hàng yêu cầu' },
      { value: ANNOTATION_OTHER, label: 'Khác' },
    ],
  },
  {
    field: 'kitchen_position',
    question: 'Vì sao bếp đặt ở vị trí này?',
    options: [
      { value: 'gan_san_sau', label: 'Gần sân sau, thoát mùi' },
      { value: 'lien_phong_an', label: 'Liền phòng ăn' },
      { value: 'tranh_huong_cua_chinh', label: 'Tránh nhìn thẳng cửa chính' },
      { value: 'theo_truc_ky_thuat', label: 'Theo trục kỹ thuật cấp thoát nước' },
      { value: 'khach_yeu_cau', label: 'Khách hàng yêu cầu' },
      { value: ANNOTATION_OTHER, label: 'Khác' },
    ],
  },
  {
    field: 'biggest_constraint',
    question: 'Ràng buộc lớn nhất của công trình này?',
    options: [
      { value: 'lo_hep', label: 'Lô đất hẹp' },
      { value: 'lo_meo', label: 'Lô đất méo, không vuông vắn' },
      { value: 'khoang_lui_quy_hoach', label: 'Khoảng lùi theo quy hoạch' },
      { value: 'ngan_sach', label: 'Ngân sách' },
      { value: 'nha_lien_ke_hai_ben', label: 'Nhà liền kề hai bên' },
      { value: 'huong_nang_huong_gio', label: 'Hướng nắng, hướng gió' },
      { value: ANNOTATION_OTHER, label: 'Khác' },
    ],
  },
  {
    field: 'would_change',
    question: 'Nếu làm lại sẽ đổi gì?',
    options: [
      { value: 'khong_doi_gi', label: 'Không đổi gì' },
      { value: 'doi_vi_tri_thang', label: 'Đổi vị trí cầu thang' },
      { value: 'noi_rong_bep', label: 'Nới rộng bếp' },
      { value: 'tang_dien_tich_giao_thong', label: 'Tăng diện tích giao thông' },
      { value: 'them_gieng_troi', label: 'Thêm giếng trời' },
      { value: 'giam_so_phong_ngu', label: 'Giảm số phòng ngủ' },
      { value: ANNOTATION_OTHER, label: 'Khác' },
    ],
  },
] as const;

/** Câu hỏi thứ năm ghi vào `payload.outcome`, không vào `rationale`. */
export const OUTCOME_QUESTION = {
  satisfaction: 'Khách hàng có hài lòng với phương án không?',
  issues: 'Thi công có phát sinh gì đáng ghi nhận không?',
} as const;

export interface AnnotationRationale {
  stair_position?: string | null;
  kitchen_position?: string | null;
  biggest_constraint?: string | null;
  would_change?: string | null;
}

export interface AnnotationOutcome {
  client_satisfied?: boolean | null;
  construction_issues?: string[];
}
