/**
 * Chấm độ đầy đủ và soát mâu thuẫn của Đầu bài thiết kế (Lớp 1 — TK-10).
 *
 * Nguồn: `doc/design/03-data-contracts.md` mục 3.1 — "`completeness_score < ngưỡng` thì
 * Lớp 2 KHÔNG được chạy". **Ngưỡng nằm trong `design_setting.brief_completeness_min`, không
 * ở tệp này** (CLAUDE.md 8.2 nguyên tắc 4); có kiểm thử grep canh.
 *
 * ## Vì sao tính bằng quy tắc chứ không bằng mô hình ngôn ngữ
 *
 * Tài liệu ghi Lớp 1 "gọi mô hình ngôn ngữ kiểm tra đầy đủ và nhất quán". Nhưng đầu bài của
 * khách là dữ liệu **hạng 1** (`01-overview` 1.5), mà giai đoạn demo chỉ được gửi hạng 3 tới
 * gói Gemini miễn phí (quyết định T8) — nên phần chấm điểm phải chạy được mà KHÔNG ra mạng,
 * nếu không cả Lớp 2 bị chặn vì một lý do chẳng liên quan gì tới đầu bài.
 *
 * Ngoài ra "đủ trường chưa" vốn là phép đếm có trọng số; giao cho mô hình ngôn ngữ là biến
 * một phép tính tất định thành câu trả lời đổi theo từng lần gọi — mà cùng đầu vào phải ra
 * cùng artifact (mục 8.8). Phần mô hình ngôn ngữ thật sự có giá trị là **đọc đoạn chữ tự do
 * rồi điền sẵn biểu mẫu**, và việc đó nằm ở Worker.
 *
 * ## Hai hàm tách bạch, cố ý
 *
 * Thiếu trường thì **bổ sung là xong**; mâu thuẫn thì phải **chọn bỏ một bên**. Gộp cả hai
 * vào một con số sẽ cho người dùng một điểm thấp mà không biết phải làm gì.
 */

import type { DesignBriefDraft } from './brief-draft';
import {
  isAnswered,
  valueAtPath,
  visibleFields,
  type BriefFormConfig,
  type BriefFormField,
} from './brief-form';

// ---------------------------------------------------------------------------
// Độ đầy đủ
// ---------------------------------------------------------------------------

export interface BriefScore {
  /** 0..1, làm tròn ba chữ số — cùng độ chính xác với cột `numeric(4,3)` trong CSDL. */
  score: number;
  /** Đường dẫn các phần chưa có, nặng trước — đi thẳng vào `missing_fields` của artifact. */
  missingFields: string[];
  /** Kèm nhãn và nhóm, để giao diện không phải tra lại cấu hình. */
  missing: { path: string; label: string; sectionId: string; sectionTitle: string }[];
  answeredWeight: number;
  totalWeight: number;
}

/**
 * Chấm điểm trên **những trường đang hiện**, không trên toàn bộ hợp đồng.
 *
 * Đây là lý do hàm bắt buộc nhận cấu hình biểu mẫu — không phải cho tiện. Nhà phố ẩn khoảng
 * lùi và mật độ; tính chúng là thiếu thì mọi đầu bài nhà phố vĩnh viễn không đạt ngưỡng,
 * trong khi nhìn màn hình thấy đã điền đủ. Cùng một hàm `visibleFields` quyết định cả việc
 * vẽ lẫn việc chấm, nên hai bên không thể nói khác nhau.
 *
 * Trường trọng số 0 (mấy ô chữ tự do của TK-01) không tham gia — chúng không nằm trong hợp
 * đồng dữ liệu nên không có gì để "đủ" hay "thiếu".
 */
export function scoreBrief(draft: DesignBriefDraft, config: BriefFormConfig): BriefScore {
  let answeredWeight = 0;
  let totalWeight = 0;
  const missing: BriefScore['missing'] = [];
  const weights = new Map<string, number>();

  for (const { field, section } of visibleFields(config, draft)) {
    if (field.weight === 0) continue;
    totalWeight += field.weight;

    if (isAnswered(valueAtPath(draft, field.path))) {
      answeredWeight += field.weight;
    } else {
      weights.set(field.path, field.weight);
      missing.push({
        path: field.path,
        label: field.label,
        sectionId: section.id,
        sectionTitle: section.title,
      });
    }
  }

  // Nặng trước: người dùng nên bổ sung bề rộng lô trước khi bổ sung phong cách.
  missing.sort((a, b) => (weights.get(b.path) ?? 0) - (weights.get(a.path) ?? 0));

  return {
    score: totalWeight === 0 ? 0 : Math.round((answeredWeight / totalWeight) * 1000) / 1000,
    missingFields: missing.map((m) => m.path),
    missing,
    answeredWeight,
    totalWeight,
  };
}

// ---------------------------------------------------------------------------
// Soát mâu thuẫn
// ---------------------------------------------------------------------------

export type BriefIssueSeverity = 'canh_bao' | 'nghiem_trong';

export interface BriefIssue {
  code: string;
  severity: BriefIssueSeverity;
  /** Nêu VIỆC GÌ không khớp và CẦN LÀM GÌ (CGD 5.5). Không mã lỗi, không vết ngăn xếp. */
  message: string;
  /** Đường dẫn hai bên đang chỏi nhau — giao diện dùng để nhảy tới đúng ô. */
  paths: string[];
}

const BEDROOM_CODES = ['bedroom', 'master_bedroom'];

/**
 * Soát mâu thuẫn NỘI TẠI của đầu bài — đầu bài tự nói ngược chính nó.
 *
 * ⚠️ Ở đây KHÔNG có một ngưỡng quy chuẩn nào, và không được thêm vào: diện tích phòng tối
 * thiểu, chiều rộng thông thuỷ, chiều cao tầng, khoảng lùi bắt buộc đều thuộc rule pack
 * (`rules/`) và do Container đánh giá. Cài lại ở đây là dựng bản thực thi thứ hai sẽ lệch
 * với rule pack — CLAUDE.md 8.7 cấm, và có kiểm thử grep canh.
 *
 * Con số duy nhất có mặt (`nguoi_moi_phong_ngu`) nằm trong cấu hình, và nó là mức để hệ
 * thống biết lúc nào nên **hỏi lại người nhập**, không phải một yêu cầu pháp lý.
 *
 * Biểu mẫu trắng phải trả về mảng RỖNG: cảnh báo nổ ra khi chưa ai nhập gì là kiểu phiền
 * nhiễu khiến người dùng học cách bỏ qua mọi cảnh báo, kể cả cảnh báo thật.
 */
export function checkBriefConsistency(
  draft: DesignBriefDraft,
  config: BriefFormConfig,
): BriefIssue[] {
  const found: BriefIssue[] = [];
  const site = draft.site;
  const spaces = draft.required_spaces ?? [];
  const people = (draft.family ?? []).reduce((sum, m) => sum + (m.count ?? 0), 0);

  // --- Khoảng lùi cộng lại đã nuốt hết lô đất -------------------------------
  const setback = site?.setback_required_m;
  if (setback && typeof site?.depth_m === 'number') {
    if ((setback.front ?? 0) + (setback.back ?? 0) >= site.depth_m) {
      found.push({
        code: 'khoang_lui_vuot_chieu_sau',
        severity: 'nghiem_trong',
        message:
          'Khoảng lùi trước và sau cộng lại đã bằng hoặc vượt chiều sâu lô đất — không còn dải nào để đặt công trình. Kiểm tra lại số đo hoặc khoảng lùi theo quy hoạch.',
        paths: ['site.depth_m', 'site.setback_required_m'],
      });
    }
  }
  if (setback && typeof site?.width_m === 'number') {
    if ((setback.left ?? 0) + (setback.right ?? 0) >= site.width_m) {
      found.push({
        code: 'khoang_lui_vuot_be_rong',
        severity: 'nghiem_trong',
        message:
          'Khoảng lùi hai bên cộng lại đã bằng hoặc vượt bề rộng lô đất — không còn dải nào để đặt công trình. Kiểm tra lại số đo hoặc khoảng lùi theo quy hoạch.',
        paths: ['site.width_m', 'site.setback_required_m'],
      });
    }
  }

  // --- Loại hình và khoảng lùi nói ngược nhau -------------------------------
  // Theo mô hình của engine, nhà phố là trường hợp một cánh nhà với khoảng lùi hai bên bằng
  // không (04-layer3-floorplan). Đây là ràng buộc của MÔ HÌNH, không phải của quy chuẩn.
  if (draft.building_type === 'nha_pho' && setback) {
    if ((setback.left ?? 0) > 0 || (setback.right ?? 0) > 0) {
      found.push({
        code: 'nha_pho_co_khoang_lui_ben',
        severity: 'canh_bao',
        message:
          'Nhà phố đang khai có khoảng lùi hai bên. Nếu lô đất thật sự lùi khỏi ranh hai bên thì chọn loại hình Biệt thự.',
        paths: ['building_type', 'site.setback_required_m'],
      });
    }
  }

  // --- Không có lối vào -----------------------------------------------------
  if (site?.access_sides && site.access_sides.length === 0) {
    found.push({
      code: 'khong_co_mat_tiep_can',
      severity: 'nghiem_trong',
      message: 'Chưa có mặt nào tiếp cận được đường hoặc hẻm. Chọn ít nhất một mặt tiếp cận.',
      paths: ['site.access_sides'],
    });
  }

  // --- Người ở và phòng ngủ nói ngược nhau ----------------------------------
  const hasBedroom = spaces.some((s) => BEDROOM_CODES.includes(s));

  if (people > 0 && spaces.length > 0 && !hasBedroom) {
    found.push({
      code: 'thieu_phong_ngu',
      severity: 'nghiem_trong',
      message: `Đầu bài khai ${people} người ở nhưng danh sách không gian bắt buộc không có phòng ngủ nào.`,
      paths: ['family', 'required_spaces'],
    });
  }

  if (people === 0 && hasBedroom) {
    found.push({
      code: 'chua_khai_nguoi_o',
      severity: 'canh_bao',
      message:
        'Đã khai phòng ngủ nhưng chưa cho biết gia đình gồm những ai. Thiếu thông tin này thì không suy được số phòng và diện tích ở bước sau.',
      paths: ['family', 'required_spaces'],
    });
  }

  // Nhu cầu riêng của một nhóm thành viên mà danh sách không gian bắt buộc không có.
  //
  // ⚠️ Chỗ này TỪNG là phép so "số người trên số phòng ngủ", và nó sai về bản chất:
  // `required_spaces` là một TẬP HỢP (`uniqueItems`), không mang số lượng, nên số loại phòng
  // ngủ tối đa luôn là hai. Mọi gia đình trên bốn người đều dính cảnh báo — tức là gần như
  // mọi đầu bài biệt thự. Một cảnh báo luôn nổ là một cảnh báo bị bỏ qua, kể cả lúc nó đúng.
  //
  // Phép kiểm dưới đây trả lời được bằng đúng dữ liệu đang có, và không cần ngưỡng nào.
  const missingNeeds = [
    ...new Set(
      (draft.family ?? [])
        .flatMap((member) => member.needs ?? [])
        .filter((need) => !spaces.includes(need)),
    ),
  ];
  if (spaces.length > 0 && missingNeeds.length > 0) {
    const labels = missingNeeds.map((need) => needLabel(config, need) ?? need).join(', ');
    found.push({
      code: 'nhu_cau_thieu_khong_gian',
      severity: 'canh_bao',
      message: `Có thành viên cần ${labels} nhưng danh sách không gian bắt buộc chưa có. Bổ sung vào danh sách hoặc bỏ nhu cầu đó.`,
      paths: ['family', 'required_spaces'],
    });
  }

  // --- Ưu tiên tầng không tồn tại -------------------------------------------
  if (draft.floors === 1 && (draft.family ?? []).some((m) => m.floor_pref === 'top')) {
    found.push({
      code: 'uu_tien_tang_khong_ton_tai',
      severity: 'canh_bao',
      message:
        'Công trình một tầng nhưng có thành viên khai ưu tiên tầng trên cùng. Bỏ ưu tiên đó hoặc tăng số tầng.',
      paths: ['floors', 'family'],
    });
  }

  // --- Ngân sách đảo ngược --------------------------------------------------
  const budget = draft.budget_range_vnd;
  if (budget && budget.length === 2 && budget[0]! > budget[1]!) {
    found.push({
      code: 'ngan_sach_dao_nguoc',
      severity: 'nghiem_trong',
      message: 'Ngân sách cận dưới đang lớn hơn cận trên. Đổi lại hai giá trị.',
      paths: ['budget_range_vnd'],
    });
  }

  return found;
}

/** Nhãn tiếng Việt của một mã không gian, lấy từ chính danh sách lựa chọn của biểu mẫu. */
function needLabel(config: BriefFormConfig, code: string): string | undefined {
  const spaces = fieldByPath(config, 'required_spaces');
  return spaces?.options?.find((option) => option.value === code)?.label;
}

/** Nhãn của một trường theo cấu hình — dùng khi dựng thông báo ngoài giao diện. */
export function fieldByPath(config: BriefFormConfig, path: string): BriefFormField | undefined {
  for (const section of config.sections) {
    const field = section.fields.find((f) => f.path === path);
    if (field) return field;
  }
  return undefined;
}
