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

import { formatNumber } from '../format';
import { bedroomsFor } from './kb.generated';
import type { DesignBriefDraft } from './brief-draft';
import {
  isAnswered,
  valueAtPath,
  visibleFields,
  type BriefFormConfig,
  type BriefFormField,
} from './brief-form';
import type { DesignBrief } from './design-brief.generated';
import { siteGeometry } from './site-geometry';

// ---------------------------------------------------------------------------
// Độ đầy đủ
// ---------------------------------------------------------------------------

export interface BriefScore {
  /** 0..1, làm tròn ba chữ số — cùng độ chính xác với cột `numeric(4,3)` trong CSDL. */
  score: number;
  /** Đường dẫn các phần chưa có, nặng trước — đi thẳng vào `missing_fields` của artifact. */
  missingFields: string[];
  /** Kèm nhãn và nhóm, để giao diện không phải tra lại cấu hình. */
  missing: {
    path: string;
    label: string;
    sectionId: string;
    sectionTitle: string;
    /**
     * Trường để trống vẫn chạy tiếp được. Vẫn nằm trong danh sách này vì nó VẪN kéo điểm
     * đầy đủ xuống — nhưng màn hình phải nói ra, nếu không thì ô nhập ghi «(tùy chọn)» còn
     * danh sách bên cạnh đòi điền, hai chỗ nói ngược nhau.
     */
    optional: boolean;
  }[];
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
        optional: field.optional === true,
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
 * Mã mà Lớp 2 TỰ SUY, nên không bao giờ là một "nhu cầu riêng" hợp lệ của thành viên.
 *
 * Phòng ngủ suy từ vai trò và số người; khu vệ sinh suy từ số tầng và số phòng ngủ (khép kín
 * thì khai bằng `ensuite`). Biểu mẫu đã thôi đề xuất cả ba, nhưng đầu bài đã lưu còn mang
 * chúng — và mọi chỗ HIỂN THỊ phải lọc chúng ra, nếu không màn hình đổ mã máy `bedroom` cho
 * kiến trúc sư đọc (CLAUDE.md 4.1). Khai ở đây một lần thay vì lọc rời rạc ở từng màn hình.
 */
export const DERIVED_NEED_CODES: readonly string[] = [...BEDROOM_CODES, 'wc'];

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

  // --- Hình thửa đất khai một đằng, số đo một nẻo ---------------------------
  // Ba phép kiểm dưới đây đều thuần số học, và cả ba đều bắt loại nhầm mà không lỗi nào lộ
  // ra: đầu bài vẫn hợp lệ theo hợp đồng, engine vẫn chạy, chỉ là chạy trên một mảnh đất
  // khác mảnh đất thật.
  const shape = site?.shape ?? 'chu_nhat';

  if (shape === 'hinh_thang' && typeof site?.rear_width_m !== 'number') {
    found.push({
      code: 'hinh_thang_thieu_mat_hau',
      severity: 'nghiem_trong',
      message:
        'Thửa đất khai là hình thang nhưng chưa có chiều rộng mặt hậu. Nhập số đo mặt hậu, hoặc chọn lại hình thửa là chữ nhật.',
      paths: ['site.shape', 'site.rear_width_m'],
    });
  }

  if (shape === 'da_giac' && (site?.boundary_m ?? []).length < 3) {
    found.push({
      code: 'da_giac_thieu_ranh_gioi',
      severity: 'nghiem_trong',
      message:
        'Thửa đất khai là đa giác nhưng ranh giới chưa đủ ba đỉnh. Nhập toạ độ các đỉnh, hoặc chọn lại hình thửa.',
      paths: ['site.shape', 'site.boundary_m'],
    });
  }

  // Diện tích trên giấy chứng nhận đối chiếu với diện tích suy từ số đo. Ngưỡng 5% là mức
  // để hệ thống biết lúc nào nên HỎI LẠI người nhập — sai số đo đạc thực địa vẫn nằm trong
  // đó — chứ không phải một yêu cầu pháp lý; nó cùng loại với `nguoi_moi_phong_ngu`.
  if (typeof site?.area_m2 === 'number' && site.area_m2 > 0) {
    let computed: number | null = null;
    try {
      computed = siteGeometry(site as DesignBrief['site']).areaM2;
    } catch {
      // Số đo chưa đủ để dựng hình — hai phép kiểm ở trên đã nói ra rồi, không nói lại.
      computed = null;
    }
    if (computed !== null && Math.abs(computed - site.area_m2) / site.area_m2 > 0.05) {
      found.push({
        code: 'dien_tich_lech_giay_to',
        severity: 'canh_bao',
        message:
          `Diện tích suy ra từ số đo là ${formatNumber(computed)} m², lệch quá 5% so với ` +
          `${formatNumber(site.area_m2)} m² ghi trên giấy chứng nhận. Kiểm tra lại số đo hoặc hình thửa.`,
        paths: ['site.area_m2', 'site.width_m', 'site.depth_m'],
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
  //
  // ⚠️ Phép kiểm này TỪNG hỏi "danh sách không gian bắt buộc có phòng ngủ không", và câu hỏi
  // đó nay sai chỗ: phòng ngủ suy thẳng từ `family` (`kb/space_norms.yaml` mục `occupancy`),
  // còn danh sách không gian không còn đề xuất hai mã đó nữa. Hỏi như cũ thì MỌI đầu bài mới
  // đều dính một lỗi "nghiêm trọng" ngay khi vừa khai xong gia đình.
  //
  // Câu hỏi đúng: đã khai người ở thì có suy ra được phòng ngủ nào không. Trả lời được bằng
  // đúng dữ liệu đang có, và dùng chung phép tính với Lớp 2 nên hai bên không thể lệch.
  const hasBedroom = spaces.some((s) => BEDROOM_CODES.includes(s.type));
  const derivedBedrooms = (draft.family ?? []).reduce(
    (sum, m) => sum + bedroomsFor(m.role ?? '', m.count ?? 0),
    0,
  );

  if (people > 0 && derivedBedrooms === 0 && !hasBedroom) {
    found.push({
      code: 'thieu_phong_ngu',
      severity: 'nghiem_trong',
      message: `Đầu bài khai ${people} người ở nhưng không suy ra được phòng ngủ nào. Kiểm tra lại vai trò và số người ở phần Thành viên gia đình.`,
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

  // ── Đã GỠ: «nhu cầu riêng mà danh sách không gian chưa có» ──────────────────────────
  //
  // Phép kiểm này đòi người dùng thêm vào «Không gian bắt buộc có» một mã mà họ vừa chọn ở
  // nhu cầu riêng của một nhóm thành viên. Nó sai vì Lớp 2 ĐÃ TỰ LÀM việc đó: mọi mã chuẩn
  // trong `family[].needs` đi thẳng thành `extraSpaces` (`program/run.ts`, biến `declared`)
  // rồi thành một không gian trong chương trình (`program/engine.ts`, `addSingle`).
  //
  // Nên câu cảnh báo nói sai sự thật — không gian không hề thiếu — và việc nó yêu cầu là nhập
  // lại thứ hệ thống đã có (CLAUDE.md 5.4). Nó lại nổ NGAY khi người dùng bấm một ô chọn, nên
  // đúng kiểu cảnh báo người ta học cách bỏ qua, kể cả những cảnh báo khác quanh nó.
  //
  // Trước khi gỡ đã cân nhắc thu hẹp thay vì bỏ: chỉ miễn cho mã thuộc về một phòng ngủ
  // (`closet`, `dressing_room`, `study`, `study_area`, `balcony`). Nhưng lập luận trên đúng
  // cho MỌI mã chuẩn, không riêng năm mã đó — thu hẹp chỉ dời chỗ sai đi.
  //
  // Chỗ trống thật sự còn lại KHÔNG kiểm được ở đây: mã có trong từ vựng nhưng thiếu chuẩn
  // diện tích thì `addSingle` lặng lẽ bỏ qua. Kiểm được điều đó cần `kb/space_norms.yaml`,
  // thứ chỉ nạp ở Worker — và ở đó engine đã có cảnh báo riêng cho mã lạ.

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

  // --- Ghim tầng không tồn tại -----------------------------------------------
  // Cùng loại lỗi với "Ưu tiên tầng không tồn tại" ở trên: hạ số tầng SAU khi đã ghim một
  // không gian vào một tầng cụ thể. Engine (`collectRequests`) tự bỏ ghim và cảnh báo khi gặp
  // trường hợp này nên không bao giờ vỡ chương trình — nhưng người nhập nên thấy ngay ở đây,
  // sớm hơn, thay vì phải mở tab Chương trình không gian mới biết.
  const outOfRange = (floor: number | null | undefined) =>
    typeof floor === 'number' && (floor < 1 || floor > (draft.floors ?? 1));
  // Đếm cả hai chỗ ghim được tầng: danh sách không gian VÀ phòng ngủ của từng nhóm thành
  // viên. Bỏ vế thứ hai thì hạ số tầng sau khi đã ghim phòng ngủ ông bà xuống tầng ba là một
  // ghim lặng lẽ bị engine bỏ, mà biểu mẫu không nói gì.
  const invalidPins =
    spaces.filter((s) => outOfRange(s.floor)).length +
    (draft.family ?? []).filter((m) => outOfRange(m.floor)).length;
  if (invalidPins > 0) {
    found.push({
      code: 'ghim_tang_khong_ton_tai',
      severity: 'canh_bao',
      message: `${invalidPins} chỗ đang ghim vào tầng không tồn tại trong công trình. Sửa lại tầng ghim hoặc tăng số tầng.`,
      paths: ['floors', 'required_spaces', 'family'],
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

/** Nhãn của một trường theo cấu hình — dùng khi dựng thông báo ngoài giao diện. */
export function fieldByPath(config: BriefFormConfig, path: string): BriefFormField | undefined {
  for (const section of config.sections) {
    const field = section.fields.find((f) => f.path === path);
    if (field) return field;
  }
  return undefined;
}
