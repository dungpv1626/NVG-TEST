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
import { STYLE_LABEL } from './brief-vocabulary';

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
  /** Ô chữ tự do nằm ngoài hợp đồng (cột `legacy.*`) — chỉ dùng để đối chiếu phong cách. */
  legacy: { style_note?: string | null } = {},
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

  found.push(...checkLayoutIntent(draft, legacy));

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

  found.push(...checkSurveyDetail(draft));

  return found;
}

// ---------------------------------------------------------------------------
// Mâu thuẫn trong các nhóm khảo sát chi tiết — thêm 21/09/2026
// ---------------------------------------------------------------------------

/**
 * Đối chiếu các nhóm khảo sát mới VỚI CHÍNH ĐẦU BÀI — không có một ngưỡng quy chuẩn nào.
 *
 * Mọi phép ở đây là số học hoặc là hai câu trả lời của cùng một người nói ngược nhau. Thứ
 * KHÔNG nằm ở đây, có chủ ý: lời khuyên nghề. «Nấu chiên xào nhiều mà không có bếp phụ» là
 * một nhận định hay, nhưng nó không phải mâu thuẫn — nó là ý kiến, và ý kiến chạy qua đường
 * chấm điểm phương án (`kb/plan_quality.yaml`), không qua đường cảnh báo đầu bài. Trộn hai
 * thứ là dạy người dùng bỏ qua cảnh báo (Haan, T52).
 */
function checkSurveyDetail(draft: DesignBriefDraft): BriefIssue[] {
  const out: BriefIssue[] = [];
  const site = draft.site;
  const life = draft.lifestyle;
  const entrance = draft.entrance;
  const vertical = draft.vertical;
  const household = draft.household;
  const balconies = draft.balconies;
  const floors = draft.floors;

  // --- Tuổi khai không khớp số người ----------------------------------------
  // Gộp thành MỘT cảnh báo cho cả biểu mẫu: một dòng cho mỗi nhóm thành viên thì bảng cảnh
  // báo dài hơn chính câu trả lời, và người dùng cuộn qua hết.
  const ageMismatch = (draft.family ?? []).filter(
    (m) => m.ages?.length && typeof m.count === 'number' && m.ages.length !== m.count,
  ).length;
  if (ageMismatch > 0) {
    out.push({
      code: 'tuoi_lech_so_nguoi',
      severity: 'canh_bao',
      message: `${ageMismatch} nhóm thành viên đang khai số tuổi khác số người. Bổ sung cho đủ hoặc sửa lại số người.`,
      paths: ['family'],
    });
  }

  // --- Cao độ: đất thấp hơn đường, và cốt nền thấp hơn đất ------------------
  const road = site?.road_level_m;
  const land = site?.land_level_m;
  if (typeof road === 'number' && typeof land === 'number') {
    if (land < road) {
      out.push({
        code: 'dat_thap_hon_duong',
        severity: 'canh_bao',
        message:
          'Khu đất đang thấp hơn tim đường. Phải tôn nền và tính lại hướng thoát nước — ghi rõ cốt nền tầng 1 ở mục Thang, lối vào và cao độ nền.',
        paths: ['site.land_level_m', 'site.road_level_m', 'entrance.floor_above_road_m'],
      });
    }
    const aboveRoad = entrance?.floor_above_road_m;
    if (typeof aboveRoad === 'number' && land > road && aboveRoad < land - road) {
      out.push({
        code: 'cot_nen_thap_hon_dat',
        severity: 'canh_bao',
        message:
          'Cốt nền tầng 1 đang thấp hơn mặt đất tự nhiên của thửa — nghĩa là phải hạ nền, không phải tôn nền. Xác nhận lại hai con số cao độ.',
        paths: ['entrance.floor_above_road_m', 'site.land_level_m'],
      });
    }
  }

  // --- Thang máy cho nhà một tầng -------------------------------------------
  if (vertical?.elevator && vertical.elevator !== 'khong' && floors === 1) {
    out.push({
      code: 'thang_may_nha_mot_tang',
      severity: 'canh_bao',
      message: 'Công trình một tầng mà vẫn khai thang máy. Bỏ thang máy hoặc sửa lại số tầng.',
      paths: ['vertical.elevator', 'floors'],
    });
  }

  // --- Có người đi lại khó khăn mà lối vào vẫn là bậc -----------------------
  if (
    life?.reduced_mobility === true &&
    entrance?.steps_from_yard === true &&
    entrance?.vehicle_ramp !== true
  ) {
    out.push({
      code: 'di_lai_kho_khan_con_bac',
      severity: 'canh_bao',
      message:
        'Đầu bài khai có người đi lại khó khăn nhưng lối vào chỉ có bậc tam cấp, không có dốc. Bổ sung dốc ở lối vào hoặc xác nhận lại.',
      paths: ['lifestyle.reduced_mobility', 'entrance.steps_from_yard', 'entrance.vehicle_ramp'],
    });
  }

  // --- Có tín ngưỡng mà lại khai không có nơi thờ ---------------------------
  if (
    household?.religion &&
    household.religion !== 'khong' &&
    household.altar_arrangement === 'khong_co'
  ) {
    out.push({
      code: 'tin_nguong_khong_co_noi_tho',
      severity: 'canh_bao',
      message:
        'Đầu bài khai gia đình có thờ cúng nhưng lại chọn «không có nơi thờ». Chọn lại cách bố trí nơi thờ hoặc sửa mục tín ngưỡng.',
      paths: ['household.religion', 'household.altar_arrangement'],
    });
  }

  // --- Tầng đặt nơi thờ vượt số tầng ----------------------------------------
  if (
    typeof household?.altar_floor === 'number' &&
    typeof floors === 'number' &&
    household.altar_floor > floors
  ) {
    out.push({
      code: 'tang_tho_khong_ton_tai',
      severity: 'canh_bao',
      message:
        'Nơi thờ đang ghim vào tầng không tồn tại trong công trình. Sửa lại tầng hoặc tăng số tầng.',
      paths: ['household.altar_floor', 'floors'],
    });
  }

  // --- Số tầng kinh doanh vượt số tầng công trình ---------------------------
  const business = household?.home_business;
  if (
    typeof business?.floor_count === 'number' &&
    typeof floors === 'number' &&
    business.floor_count > floors
  ) {
    out.push({
      code: 'tang_kinh_doanh_vuot_so_tang',
      severity: 'nghiem_trong',
      message:
        'Số tầng dành cho kinh doanh đang lớn hơn số tầng của công trình. Sửa một trong hai con số.',
      paths: ['household.home_business.floor_count', 'floors'],
    });
  }

  // --- Ban công đua ra ngoài ranh mà chưa biết đường rộng bao nhiêu ---------
  // Không phải phép kiểm quy chuẩn (ở đây không có ngưỡng nào): chỉ là đầu bài đang khẳng
  // định một điều mà chính nó chưa có đủ dữ kiện để khẳng định.
  if (balconies?.projection_over_boundary === true && typeof site?.road_width_m !== 'number') {
    out.push({
      code: 'ban_cong_dua_ranh_chua_ro_duong',
      severity: 'canh_bao',
      message:
        'Đầu bài khai ban công đua ra ngoài ranh đất nhưng chưa ghi bề rộng đường trước nhà — chưa đủ căn cứ để chốt. Bổ sung bề rộng đường.',
      paths: ['balconies.projection_over_boundary', 'site.road_width_m'],
    });
  }

  // --- Khai không làm ban công nhưng vẫn chọn mặt đặt ban công --------------
  if (
    balconies?.scope === 'khong_co' &&
    (balconies.sides?.length || balconies.drying_balcony === true)
  ) {
    out.push({
      code: 'ban_cong_noi_khong_ma_van_khai',
      severity: 'canh_bao',
      message:
        'Đầu bài chọn «không làm ban công» nhưng vẫn khai mặt đặt ban công hoặc ban công phơi. Bỏ một trong hai.',
      paths: ['balconies.scope', 'balconies.sides'],
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Mâu thuẫn về Ý ĐỒ BỐ CỤC — thêm 13/09/2026
// ---------------------------------------------------------------------------

type Side = 'front' | 'back' | 'left' | 'right';
const SIDES: readonly Side[] = ['front', 'back', 'left', 'right'];
const SIDE_VI: Record<Side, string> = {
  front: 'mặt trước',
  back: 'mặt sau',
  left: 'bên trái',
  right: 'bên phải',
};

/** Hiện trạng một mặt mà ô tô không đi vào được. Mã lấy từ `site.adjacent` của biểu mẫu. */
const NARROW_ALLEYS = ['hem_2m', 'hem_3m'];

/**
 * Diện tích đã ghim trên một tầng vượt quá phần này của sàn xây được thì CẢNH BÁO: phần còn lại
 * không đủ cho thang, hành lang và tường. Là mức để HỎI LẠI người nhập, cùng loại với ngưỡng 5%
 * lệch giấy tờ ở trên — không phải một yêu cầu kỹ thuật.
 */
const PINNED_AREA_WARN_RATIO = 0.85;

/**
 * Các mâu thuẫn làm hỏng việc XẾP MẶT BẰNG, rút từ đầu bài thật «Biệt thự nhà vườn (demo)» mà bộ
 * kiểm cũ chấm «98%, 0 chỗ chưa nhất quán» (13/09/2026): phòng khép kín ghim sai tầng so với gia
 * đình, đòi ba sân mà không nói rộng bao nhiêu nên bản vẽ chiếm trọn bề ngang lô, «hai cánh» đi
 * cùng «hình chữ nhật», phong cách chọn một kiểu ghi chú một kiểu.
 *
 * Mọi phép ở đây chỉ đối chiếu ĐẦU BÀI VỚI CHÍNH NÓ — không có ngưỡng quy chuẩn nào.
 */
function checkLayoutIntent(
  draft: DesignBriefDraft,
  legacy: { style_note?: string | null },
): BriefIssue[] {
  const found: BriefIssue[] = [];
  const site = draft.site;
  const access = site?.access_sides;

  // --- Lối vào chính và lối xe phải là mặt tiếp cận được -------------------------------
  for (const [path, value, what] of [
    ['site.main_entrance_side', site?.main_entrance_side, 'Lối vào chính'],
    ['site.vehicle_entrance_side', site?.vehicle_entrance_side, 'Lối xe'],
  ] as const) {
    if (value && access && access.length > 0 && !access.includes(value)) {
      found.push({
        code:
          path === 'site.main_entrance_side' ? 'loi_vao_khong_tiep_can' : 'loi_xe_khong_tiep_can',
        severity: 'nghiem_trong',
        message: `${what} đặt ở ${SIDE_VI[value]}, nhưng mặt đó không nằm trong «Mặt tiếp cận được». Chọn lại mặt đặt ${what.toLowerCase()} hoặc bổ sung mặt tiếp cận.`,
        paths: [path, 'site.access_sides'],
      });
    }
  }

  const cars = draft.parking?.cars ?? 0;
  const bikes = draft.parking?.motorbikes ?? 0;
  const vehicleSide = site?.vehicle_entrance_side;
  if (vehicleSide && cars > 0) {
    const adjacent = (site?.adjacent as Record<string, string | null> | undefined)?.[vehicleSide];
    if (adjacent && NARROW_ALLEYS.includes(adjacent)) {
      found.push({
        code: 'loi_xe_hem_hep',
        severity: 'canh_bao',
        message: `Lối xe đặt ở ${SIDE_VI[vehicleSide]}, giáp hẻm hẹp — ô tô thường không vào được. Kiểm tra lại hoặc chuyển lối xe sang mặt giáp đường lớn.`,
        paths: ['site.vehicle_entrance_side', 'site.adjacent', 'parking.cars'],
      });
    }
  }
  const spaces = draft.required_spaces ?? [];
  if (cars + bikes > 0 && !spaces.some((space) => space.type === 'garage')) {
    found.push({
      code: 'xe_chua_co_cho_de',
      severity: 'canh_bao',
      message: `Đầu bài khai ${cars} ô tô, ${bikes} xe máy nhưng «Không gian bắt buộc có» chưa có chỗ để xe. Thêm dòng Chỗ để xe, ghim tầng nếu cần.`,
      paths: ['parking.cars', 'required_spaces'],
    });
  }

  // --- Tường chung/riêng khai ở mặt không giáp hàng xóm --------------------------------
  const walls = site?.boundary_walls;
  const adjacentMap = (site?.adjacent ?? {}) as Record<string, string | null>;
  for (const side of SIDES) {
    if (walls?.[side] && adjacentMap[side] && adjacentMap[side] !== 'nha_hang_xom') {
      found.push({
        code: 'tuong_ranh_khong_giap_hang_xom',
        severity: 'canh_bao',
        message: `Đã khai tường chung/riêng ở ${SIDE_VI[side]}, nhưng hiện trạng mặt đó không phải nhà hàng xóm. Bỏ lựa chọn tường ở mặt này hoặc sửa hiện trạng.`,
        paths: ['site.boundary_walls', 'site.adjacent'],
      });
    }
  }

  // --- Sân: nằm đâu và rộng bao nhiêu phải khớp nhau -----------------------------------
  const yards = draft.massing?.yards ?? [];
  const depth = (draft.massing?.yard_depth_m ?? {}) as Partial<Record<Side, number>>;
  const hasDepth = (side: Side) => typeof depth[side] === 'number' && depth[side]! > 0;
  const missingDepth: string[] = [];
  if (yards.includes('san_truoc') && !hasDepth('front')) missingDepth.push('sân trước');
  if (yards.includes('san_sau') && !hasDepth('back')) missingDepth.push('sân sau');
  if (yards.includes('san_ben') && !hasDepth('left') && !hasDepth('right')) {
    missingDepth.push('sân bên');
  }
  if (missingDepth.length) {
    found.push({
      code: 'san_chua_co_kich_thuoc',
      severity: 'canh_bao',
      message: `Đầu bài đòi ${missingDepth.join(', ')} nhưng chưa khai khoảng sân. Không có con số thì bản thiết kế không biết chừa bao nhiêu và có thể phủ kín lô. Khai «Khoảng sân mong muốn theo từng mặt».`,
      paths: ['massing.yards', 'massing.yard_depth_m'],
    });
  }
  const orphanDepth = SIDES.filter((side) => {
    if (!hasDepth(side)) return false;
    if (side === 'front') return !yards.includes('san_truoc');
    if (side === 'back') return !yards.includes('san_sau');
    return !yards.includes('san_ben');
  });
  if (orphanDepth.length && yards.length) {
    found.push({
      code: 'kich_thuoc_san_khong_co_san',
      severity: 'canh_bao',
      message: `Đã khai khoảng sân ở ${orphanDepth.map((s) => SIDE_VI[s]).join(', ')} nhưng «Sân nằm ở đâu» không chọn sân ở mặt đó. Sửa một trong hai cho khớp.`,
      paths: ['massing.yards', 'massing.yard_depth_m'],
    });
  }

  // Sân mong muốn không lớn hơn khoảng lùi quy hoạch thì không đổi gì: mỗi mặt lấy số lớn hơn.
  // Người nhập thường tưởng hai số CỘNG vào nhau (13/09/2026: «Mặt trước 1» trên lô đã lùi 4 m).
  const setbacks = (site?.setback_required_m ?? {}) as Partial<Record<Side, number>>;
  const shadowed = SIDES.filter((side) => hasDepth(side) && (setbacks[side] ?? 0) >= depth[side]!);
  if (shadowed.length) {
    found.push({
      code: 'san_nho_hon_khoang_lui',
      severity: 'canh_bao',
      message: `Chiều sâu sân ở ${shadowed
        .map(
          (side) =>
            `${SIDE_VI[side]} (${formatNumber(depth[side]!)} m, khoảng lùi ${formatNumber(setbacks[side]!)} m)`,
        )
        .join(
          ', ',
        )} không lớn hơn khoảng lùi quy hoạch nên không có tác dụng — hai số không cộng vào nhau, mỗi mặt lấy số lớn hơn. Muốn sân rộng hơn thì điền số lớn hơn khoảng lùi.`,
      paths: ['massing.yard_depth_m', 'site.setback_required_m'],
    });
  }

  // --- Diện tích TỐI THIỂU đã khai so với sàn xây được thật ------------------------------
  // Cột diện tích của «Không gian bắt buộc có» là mức TỐI THIỂU (Haan, 13/09/2026). Nên tổng các
  // mức ấy — theo từng tầng đã ghim, và cả nhà — không thể vượt phần sàn xây được sau khoảng lùi,
  // sân và mật độ. Vượt thì không phương án nào đạt được, dù sáng tạo đến đâu.
  const budget = briefAreaBudget(draft);
  if (budget.plateM2 !== null) {
    const plate = budget.plateM2;
    for (const [floor, pinned] of Object.entries(budget.pinnedByFloor)
      .map(([f, a]) => [Number(f), a] as const)
      .sort((a, b) => a[0] - b[0])) {
      if (pinned <= plate * PINNED_AREA_WARN_RATIO) continue;
      const over = pinned > plate;
      found.push({
        code: over ? 'dien_tich_vuot_san_xay_duoc' : 'dien_tich_gan_kin_san',
        severity: over ? 'nghiem_trong' : 'canh_bao',
        message: over
          ? `Tầng ${floor}: diện tích tối thiểu các phòng ghim ở tầng này cộng lại ${formatNumber(pinned)} m², vượt phần sàn xây được ${formatNumber(plate)} m² (sau khoảng lùi, sân và mật độ). Giảm diện tích tối thiểu, dời bớt phòng lên tầng khác, hoặc thu hẹp sân.`
          : `Tầng ${floor}: diện tích tối thiểu các phòng ghim ở tầng này cộng lại ${formatNumber(pinned)} m² trên ${formatNumber(plate)} m² sàn xây được — gần kín, không còn chỗ cho thang, hành lang và tường. Kiểm tra lại diện tích hoặc khoảng sân.`,
        paths: ['required_spaces', 'massing.yard_depth_m', 'site.setback_required_m'],
      });
    }
    const total = budget.pinnedTotalM2;
    const capacity = budget.totalPlateM2!;
    if (total > capacity * PINNED_AREA_WARN_RATIO) {
      const over = total > capacity;
      found.push({
        code: over ? 'tong_dien_tich_vuot_san' : 'tong_dien_tich_gan_kin_san',
        severity: over ? 'nghiem_trong' : 'canh_bao',
        message:
          `Tổng diện tích tối thiểu đã khai ${formatNumber(total)} m² ` +
          (over ? 'vượt' : 'gần kín') +
          ` tổng sàn xây được ${formatNumber(capacity)} m² (${formatNumber(plate)} m² mỗi tầng × ${budget.floors} tầng, sau khoảng lùi, sân và mật độ)` +
          (over
            ? '. Không phương án nào đạt được: giảm diện tích tối thiểu, bỏ bớt phòng, thu hẹp sân hoặc tăng số tầng.'
            : ' — phần còn lại không đủ cho thang, hành lang và tường. Kiểm tra lại diện tích tối thiểu hoặc khoảng sân.'),
        paths: ['required_spaces', 'floors', 'massing.yard_depth_m'],
      });
    }
  }

  // --- Phòng ngủ khép kín: gia đình nói một tầng, danh sách không gian nói tầng khác ---
  const fromFamily = new Map<number, number>();
  for (const member of draft.family ?? []) {
    if (member.ensuite !== true || typeof member.floor !== 'number') continue;
    const rooms = bedroomsFor(member.role ?? '', member.count ?? 0);
    fromFamily.set(member.floor, (fromFamily.get(member.floor) ?? 0) + rooms);
  }
  const fromRows = new Map<number, number>();
  for (const space of spaces) {
    if (!BEDROOM_CODES.includes(space.type) || space.ensuite !== true) continue;
    if (typeof space.floor !== 'number') continue;
    fromRows.set(space.floor, (fromRows.get(space.floor) ?? 0) + 1);
  }
  if (fromFamily.size && fromRows.size) {
    const floors = [...new Set([...fromFamily.keys(), ...fromRows.keys()])].sort((a, b) => a - b);
    const mismatched = floors.filter((f) => (fromFamily.get(f) ?? 0) !== (fromRows.get(f) ?? 0));
    if (mismatched.length) {
      found.push({
        code: 'khep_kin_lech_gia_dinh',
        severity: 'nghiem_trong',
        message:
          `Phòng ngủ khép kín không khớp giữa «Thành viên gia đình» và «Không gian bắt buộc có» ở ` +
          mismatched
            .map(
              (f) =>
                `tầng ${f} (gia đình ${fromFamily.get(f) ?? 0}, danh sách ${fromRows.get(f) ?? 0})`,
            )
            .join(', ') +
          '. Sửa lại ô khép kín hoặc tầng của từng dòng phòng ngủ cho khớp với gia đình.',
        paths: ['family', 'required_spaces'],
      });
    }
  }

  // --- Hình khối và thang tự nói ngược nhau ---------------------------------------------
  const wings = draft.massing?.wings_preferred;
  const shape = draft.massing?.footprint_shape;
  if (typeof wings === 'number' && shape) {
    if ((wings >= 2 && shape === 'chu_nhat') || (wings === 1 && shape !== 'chu_nhat')) {
      found.push({
        code: 'hinh_khoi_mau_thuan',
        severity: 'canh_bao',
        message:
          wings >= 2
            ? `Chọn ${wings} cánh nhà nhưng hình bao là chữ nhật — hai cánh trở lên thường cho hình L, U hoặc T. Chọn lại một trong hai.`
            : 'Chọn một cánh nhà nhưng hình bao là chữ L, U hoặc T — các hình này cần từ hai cánh. Chọn lại một trong hai.',
        paths: ['massing.wings_preferred', 'massing.footprint_shape'],
      });
    }
  }
  if (draft.massing?.cores_preferred === 1 && draft.massing?.service_core === true) {
    found.push({
      code: 'thang_phu_mot_loi',
      severity: 'canh_bao',
      message:
        'Chọn một lõi thang nhưng lại có thang phụ hoặc lối dịch vụ riêng. Nếu cần thang phụ thì chọn hai lõi; nếu chỉ cần lối đi riêng ở tầng 1 thì ghi rõ ở ghi chú công năng.',
      paths: ['massing.cores_preferred', 'massing.service_core'],
    });
  }

  // --- Phong cách chọn một kiểu, ghi chú một kiểu ---------------------------------------
  const note = normaliseText(legacy.style_note ?? '');
  if (draft.style && note) {
    const others = (Object.entries(STYLE_LABEL) as [string, string][])
      .filter(([code, label]) => code !== draft.style && note.includes(normaliseText(label)))
      .map(([, label]) => label);
    if (others.length) {
      found.push({
        code: 'phong_cach_lech_ghi_chu',
        severity: 'canh_bao',
        message: `Phong cách chọn «${STYLE_LABEL[draft.style as keyof typeof STYLE_LABEL]}» nhưng ghi chú phong cách nhắc «${others.join(', ')}». Chọn lại phong cách hoặc sửa ghi chú.`,
        paths: ['style', 'legacy.style_note'],
      });
    }
  }

  return found;
}

export interface BriefAreaBudget {
  /** Sàn xây được MỖI TẦNG, m², sau khoảng lùi, sân và mật độ. `null` khi chưa đủ số đo. */
  plateM2: number | null;
  floors: number;
  /** `plateM2 × floors`; `null` khi chưa đủ số đo. */
  totalPlateM2: number | null;
  /** Tổng diện tích TỐI THIỂU của mọi dòng đã khai diện tích, m². */
  pinnedTotalM2: number;
  /** Diện tích tối thiểu theo tầng — chỉ các dòng vừa ghim tầng vừa khai diện tích. */
  pinnedByFloor: Record<number, number>;
}

/**
 * Phép tính diện tích DÙNG CHUNG cho bộ kiểm và dòng tổng dưới bảng không gian — một phép, hai chỗ
 * hiện, để màn hình không bao giờ nói một con số khác với cảnh báo.
 */
export function briefAreaBudget(draft: DesignBriefDraft): BriefAreaBudget {
  const floors = Math.max(1, draft.floors ?? 1);
  const plate = buildablePlateM2(draft);
  const pinnedByFloor: Record<number, number> = {};
  let pinnedTotalM2 = 0;
  for (const space of draft.required_spaces ?? []) {
    if (typeof space.area_m2 !== 'number' || space.area_m2 <= 0) continue;
    pinnedTotalM2 += space.area_m2;
    if (typeof space.floor === 'number') {
      pinnedByFloor[space.floor] = (pinnedByFloor[space.floor] ?? 0) + space.area_m2;
    }
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    plateM2: plate,
    floors,
    totalPlateM2: plate === null ? null : round(plate * floors),
    pinnedTotalM2: round(pinnedTotalM2),
    pinnedByFloor: Object.fromEntries(
      Object.entries(pinnedByFloor).map(([floor, area]) => [floor, round(area)]),
    ),
  };
}

/**
 * Sàn xây được mỗi tầng, m²: ô chữ nhật lớn nhất trong thửa trừ mức LỚN HƠN giữa khoảng lùi quy
 * hoạch và khoảng sân mong muốn trên mỗi mặt, rồi kẹp dưới mật độ xây dựng tối đa nếu đầu bài khai.
 * `null` khi chưa đủ số đo. Cùng phép với `workers/src/design/ai/buildable.ts` và bước chương
 * trình không gian, để màn hình đầu bài và bước sau nói cùng một con số.
 */
export function buildablePlateM2(draft: DesignBriefDraft): number | null {
  const site = draft.site;
  if (typeof site?.width_m !== 'number' || typeof site?.depth_m !== 'number') return null;
  let geometry: { buildable: { widthM: number; depthM: number }; areaM2: number };
  try {
    geometry = siteGeometry(site as DesignBrief['site']);
  } catch {
    return null;
  }
  const rect = geometry.buildable;
  const setback = (site.setback_required_m ?? {}) as Partial<Record<Side, number>>;
  const yard = (draft.massing?.yard_depth_m ?? {}) as Partial<Record<Side, number>>;
  const take = (side: Side) => Math.max(setback[side] ?? 0, yard[side] ?? 0);
  const width = rect.widthM - take('left') - take('right');
  const depth = rect.depthM - take('front') - take('back');
  if (width <= 0 || depth <= 0) return 0;
  let plate = width * depth;
  if (typeof site.max_density === 'number' && site.max_density > 0) {
    plate = Math.min(plate, site.max_density * geometry.areaM2);
  }
  return Math.round(plate * 10) / 10;
}

function normaliseText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Nhãn của một trường theo cấu hình — dùng khi dựng thông báo ngoài giao diện. */
export function fieldByPath(config: BriefFormConfig, path: string): BriefFormField | undefined {
  for (const section of config.sections) {
    const field = section.fields.find((f) => f.path === path);
    if (field) return field;
  }
  return undefined;
}
