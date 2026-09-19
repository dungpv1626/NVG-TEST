/**
 * Hằng số và tiện ích dùng chung của Module Thiết kế AI (TK-10 → TK-17).
 *
 * Tệp này viết tay; `*.generated.ts` cạnh nó do `scripts/contracts-gen.mjs` sinh từ
 * `contracts/*.schema.json` — KHÔNG sửa các tệp đó bằng tay.
 *
 * Xuất qua đường dẫn con `@nvg/shared/design` chứ KHÔNG gộp vào `@nvg/shared` gốc: kiểu
 * `DesignBrief` ở đây là HỢP ĐỒNG DỮ LIỆU của engine, khác `DesignBrief` của bảng
 * `design_briefs` trong `@nvg/db/schema` (bảng cũ của TK-01). Hai thứ trùng tên nhưng khác
 * nghĩa — gộp chung sẽ có ngày import nhầm. Việc hợp nhất hai khái niệm là Mốc 2, đang chờ
 * Haan trả lời câu hỏi Q-2.
 */

export * from './index.generated';
export * from './annotation';
export * from './brief-vocabulary';
export * from './brief-draft';
export * from './brief-form';
export * from './brief-form-data';
export * from './brief-completeness';
export * from './bedroom-sync';
export * from './site-geometry';
export * from './compare';
export * from './program-edits';
export * from './site-boundary-from-edges';
export * from './site-boundary-from-coordinates';

// ---------------------------------------------------------------------------
// Bộ môn — dùng lại enum `design_discipline` sẵn có (CLAUDE.md 8.5 T7)
// ---------------------------------------------------------------------------

/**
 * Bộ môn mà artifact và hồ sơ phát hành mang theo.
 *
 * Hẹp hơn `DESIGN_DISCIPLINES` của `@nvg/shared/tk`: giá trị `phuong_an` là một BƯỚC hồ sơ
 * (TK-03), không phải bộ môn kỹ thuật, nên không có người "chịu trách nhiệm chuyên môn" để
 * ký — mà chữ ký theo bộ môn chính là thứ 03-data-contracts 3.8b cưỡng chế.
 */
export const ARTIFACT_DISCIPLINES = ['kien_truc', 'ket_cau', 'dien_nuoc'] as const;

export type ArtifactDiscipline = (typeof ARTIFACT_DISCIPLINES)[number];

/** Ánh xạ viết tắt trong tài liệu đặc tả sang từ vựng đang chạy trong CSDL. */
export const DOC_DISCIPLINE_MAP: Readonly<Record<'KT' | 'KC' | 'DN', ArtifactDiscipline>> = {
  KT: 'kien_truc',
  KC: 'ket_cau',
  DN: 'dien_nuoc',
};

// ---------------------------------------------------------------------------
// Loại artifact và bước pipeline
// ---------------------------------------------------------------------------

/**
 * Loại artifact — trùng tên tệp hợp đồng ở `contracts/` (dấu gạch nối đổi thành gạch dưới).
 * Dùng làm cột `kind` của `design_artifact` và khoá của `design_head`.
 */
export const ARTIFACT_KINDS = [
  'design_brief',
  'space_program',
  'layout_intent',
  'floor_plan',
  'infeasibility_report',
  'arch_model',
  'schedules',
  'render_result',
  // ── Nhánh AI ─────────────────────────────────────────────────────────────
  // CỐ Ý là những loại RIÊNG, không dùng lại loại của bộ giải. Nhánh AI phải sống được sau
  // khi bộ giải bị xoá (T15–T19, 09/09/2026), nên nó không được mượn hợp đồng nào của bộ giải;
  // và gọi mặt bằng của nó là `floor_plan` thì mọi thứ hạ nguồn — bản vẽ, khối ba chiều, thống
  // kê, phát hành — đọc được nó và sẽ hỏng theo một cách khó lần.
  'ai_space_program',
  'ai_floor_plan',
  'ai_facade_concept',
  'ai_image_set',
  // Tờ mặt bằng công năng CÓ NỘI THẤT do MÔ HÌNH ẢNH vẽ từ ẢNH NEO (T57, 19/09/2026) — một
  // artifact một tầng. Nó KHÔNG thay `ai_floor_plan`: dữ liệu vẫn là nguồn đo diện tích và
  // đối chiếu quy chuẩn, còn loại này là tờ giấy trình khách, mô hình viết cả chữ lẫn số nên
  // không đo được. Loại này từng ra đời ở T21 rồi bị T22 xoá vì khi ấy KHÔNG có ảnh neo, tức
  // mô hình vẽ một ngôi nhà khác; nay ảnh neo là bắt buộc trong hợp đồng.
  'ai_plan_sheet_image',
  // Mặt bằng theo phương án CŨ (T14): mô hình tự viết chuỗi SVG. Không sinh mới nữa — giữ ở
  // đây để artifact đã đúc còn đọc được, vì artifact là bất biến.
  'ai_plan_proposal',
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * Năm bước của Workflow điều phối (02-architecture 2.5).
 *
 * Tên bước đi thẳng vào cột `step` của `design_artifact_edge`, nên đổi tên bước là đổi
 * dữ liệu lineage đã ghi — coi như một phần hợp đồng, không đặt lại tuỳ hứng.
 */
export const PIPELINE_STEPS = [
  'layer1_brief',
  'layer2_program',
  'layer3a_intent',
  'layer3b_solve',
  'layer4_arch',
  'layer5_render',
  // ── Nhánh AI ─────────────────────────────────────────────────────────────
  // Bốn bước nối nhau: đầu bài → chương trình → mặt bằng → mặt đứng → bộ ảnh. Kiểm máy và
  // cảnh báo quy chuẩn KHÔNG phải bước: chúng tính lại lúc đọc, không sinh artifact.
  'ai_program_propose',
  'ai_plan_propose',
  'ai_facade_propose',
  // Kiến trúc sư sửa ý tưởng mặt đứng. Artifact bất biến nên bản sửa là artifact MỚI, nối
  // lineage bằng bước này — không có `UPDATE`.
  'ai_facade_edit',
  'ai_image_render',
  // Vẽ tờ mặt bằng có nội thất bằng mô hình ảnh (T57). Nối từ `ai_floor_plan`, KHÔNG nối từ
  // `ai_facade_*`: tờ mặt bằng không đi qua ý tưởng mặt đứng.
  'ai_plan_sheet',
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** Artifact mà mỗi bước sinh ra khi thành công. */
export const STEP_OUTPUT_KIND: Readonly<Record<PipelineStep, ArtifactKind>> = {
  layer1_brief: 'design_brief',
  layer2_program: 'space_program',
  layer3a_intent: 'layout_intent',
  layer3b_solve: 'floor_plan',
  layer4_arch: 'arch_model',
  layer5_render: 'render_result',
  ai_program_propose: 'ai_space_program',
  ai_plan_propose: 'ai_floor_plan',
  ai_facade_propose: 'ai_facade_concept',
  ai_facade_edit: 'ai_facade_concept',
  ai_image_render: 'ai_image_set',
  ai_plan_sheet: 'ai_plan_sheet_image',
};

// ---------------------------------------------------------------------------
// Phân hạng dữ liệu (01-overview 1.5)
// ---------------------------------------------------------------------------

export const DATA_CLASSES = [1, 2, 3] as const;

export type DataClass = (typeof DATA_CLASSES)[number];

export const DATA_CLASS_LABELS: Readonly<Record<DataClass, string>> = {
  1: 'Nhạy cảm — thông tin khách hàng, đầu bài, hợp đồng, dự toán',
  2: 'Trung bình — mặt bằng kích thước thật, bản vẽ kỹ thuật, mô hình ba chiều',
  3: 'Thấp — ảnh khối, bản đồ độ sâu, mô tả phong cách',
};

// ---------------------------------------------------------------------------
// Quyền chuỗi của module (02-architecture 2.8)
// ---------------------------------------------------------------------------

/**
 * Quyền của module ở dạng chuỗi, gán vào vai trò qua bảng `role_capabilities`.
 *
 * Vì sao không dùng ma trận `permissions(role_id, module_code, 5 cờ)` sẵn có: ma trận đó chỉ
 * tới mức module, không phân biệt được ba bộ môn — mà "kiến trúc sư không ký được hồ sơ kết
 * cấu" là ràng buộc pháp lý, không phải tuỳ chọn. Ma trận cũ giữ nguyên cho 12 module đang
 * chạy (CLAUDE.md 8.5 T6).
 *
 * KHÔNG hard-code tên vai trò ở bất kỳ đâu — tenant thứ hai sẽ có cơ cấu tổ chức khác.
 */
export const DESIGN_CAPABILITIES = [
  /** Thấy MỌI dự án thiết kế trong phạm vi pháp nhân. Không có → chỉ thấy dự án được phân công. */
  'design.project.all',

  'design.read.kien_truc',
  'design.read.ket_cau',
  'design.read.dien_nuoc',

  'design.write.kien_truc',
  'design.write.ket_cau',
  'design.write.dien_nuoc',

  'design.publish.kien_truc',
  'design.publish.ket_cau',
  'design.publish.dien_nuoc',

  /** Sửa cấu hình module của tenant: rule pack địa phương, ngưỡng cho phép chạy Layer 2… */
  'design.settings.write',
] as const;

export type DesignCapability = (typeof DESIGN_CAPABILITIES)[number];

/**
 * Vì sao quyền chia theo BỘ MÔN chứ không theo lớp (`design.brief.write`, `design.floorplan.write`
 * như ví dụ trong tài liệu): mỗi quyền ở đây được một chính sách RLS thật sự đọc tới. Quyền theo
 * lớp thì chính sách nào cũng phải liệt kê đủ sáu lớp mà vẫn không trả lời được câu hỏi duy nhất
 * mà CSDL cần trả lời — "người này có được ghi bộ môn này của dự án này không". Cấu hình khai ra
 * mà không nơi nào đọc còn tệ hơn không khai: nó tạo cảm giác đã phân quyền.
 */

/** Quyền đọc artifact của một bộ môn. */
export function readCapability(discipline: ArtifactDiscipline): DesignCapability {
  return `design.read.${discipline}` as DesignCapability;
}

/** Quyền tạo artifact của một bộ môn. */
export function writeCapability(discipline: ArtifactDiscipline): DesignCapability {
  return `design.write.${discipline}` as DesignCapability;
}

/** Quyền ký phát hành hồ sơ của đúng một bộ môn. */
export function publishCapability(discipline: ArtifactDiscipline): DesignCapability {
  return `design.publish.${discipline}` as DesignCapability;
}

// ---------------------------------------------------------------------------
// Nhãn cảnh báo bắt buộc — do MÃ NGUỒN chèn (01-overview 1.4, CLAUDE.md 8.7)
// ---------------------------------------------------------------------------

export const AI_DISCLAIMERS = {
  render: 'Ảnh tham khảo ý tưởng — chưa phải phương án thi công',
  schedules: 'Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng',
  structuralGrid: 'Đề xuất — kỹ sư kết cấu quyết định',
  /**
   * In trên dải tiêu đề MỌI tờ vẽ của nhánh AI (mặt bằng, mặt đứng).
   *
   * Ở đây chứ không phải trong `kb/sheet_style.yaml`: quy ước trình bày là dữ liệu sửa được,
   * còn câu này thì không được sửa và không được tắt (CLAUDE.md 8.7). Kết quả nhánh AI không
   * đi vào hồ sơ phát hành (T14), nên một tờ rời khỏi màn hình mà không mang câu này là một tờ
   * bản vẽ trông như hồ sơ thi công.
   */
  aiSheet: 'Đề xuất AI — bản phác, không dùng để thi công',
  /**
   * Ghi thêm khi `generator.walls_derived` bật — tức MỌI tờ của nhánh AI từ T23 (12/09/2026).
   *
   * Trước T23 đây là lời thú nhận một lần cứu hộ (T19: mô hình khai tường sai, đã cho sửa một
   * lượt, chương trình dựng lại hộ). Nay nó là mô tả cách hệ thống làm việc: mô hình khai phòng,
   * chương trình suy tường từ chữ nhật phòng. Câu chữ giữ nguyên vì nó vẫn nói đúng điều người
   * đọc tờ vẽ cần biết — đường nét nào là của AI và đường nét nào không.
   */
  wallsDerived: 'Tường do chương trình suy từ phòng, không phải của AI',
  /**
   * In khi tờ vẽ có không gian mở chia khu (`rooms[].parts`) — T48, 16/09/2026.
   *
   * Haan chấm lượt đo 58d9ff66: một ô bếp + ăn + khách 86,8 m² chỉ ghi «PHÒNG KHÁCH» thì người đọc
   * hiểu nhầm là một phòng khách khổng lồ. Nay mỗi khu một nhãn và giữa hai khu có nét đứt — câu này
   * nói nét đứt ấy KHÔNG phải vách, để không ai bóc khối lượng tường theo nó.
   */
  openSpaceParts: 'Nét đứt trong một phòng là ranh mềm giữa các khu, không phải vách',
  /**
   * Hiện ở MỌI chỗ nhánh AI báo kết quả đối chiếu quy tắc — T30, 12/09/2026.
   *
   * Vì sao phải nói ra thay vì im lặng: nhánh AI không còn kiểm quy chuẩn nào (gói pháp quy
   * rỗng, xem `rules/rule-pack-data.ts#nationalRulePack`). Một màn hình chấm điểm mà im lặng về
   * quy chuẩn thì người đọc hiểu là **đã kiểm và đạt** — đúng thứ CLAUDE.md 5.2 cấm ở chỗ khác
   * («KHÔNG hiển thị số ước lượng», hiện «Chưa đủ dữ liệu» thay vì `0`). Câu này là cùng một
   * nguyên tắc, áp cho một khoảng trống chứ cho một con số.
   *
   * Cùng hạng với `aiSheet`: do MÃ chèn, không phụ thuộc người dùng nhớ bật, không tắt được từ
   * giao diện (CLAUDE.md 8.7). Có phép thử canh.
   */
  noCodeCheck:
    'Không kiểm quy chuẩn xây dựng. Chỉ đối chiếu thói quen thiết kế Nhà Việt Group đã đo trên 2 dự án.',
  /**
   * In cạnh MỌI chỗ hiện điểm chất lượng mặt bằng — T24 và mục 5.5 của phương án.
   *
   * Một con số trên màn hình được đọc như một lời phán. Thước này chỉ đo được thứ hình học đo
   * được: diện tích, cạnh ngắn, đường đi, mặt thoáng, chỗ xếp thẳng hàng. Một mặt bằng hay vẫn
   * có thể thấp điểm, và một mặt bằng vô hồn vẫn có thể cao điểm — nên điểm dùng để XẾP HẠNG ứng
   * viên và CHỈ CHỖ YẾU, không bao giờ thay bước kiến trúc sư xem bằng mắt.
   *
   * Cùng hạng với `aiSheet` và `noCodeCheck`: do mã chèn, không tắt được từ giao diện (8.7).
   */
  scoreNotJudgement:
    'Điểm chỉ đo những gì hình học đo được, không đo chất lượng thiết kế. Dùng để xếp hạng phương án và chỉ chỗ yếu — không thay bước kiến trúc sư xem bằng mắt.',
  /**
   * In LÊN PIXEL và in lại BẰNG CHỮ trong trang, ở mọi chỗ hiện tờ mặt bằng có nội thất do mô
   * hình ảnh vẽ — T57, 19/09/2026.
   *
   * Đây là nhãn nguy hiểm nhất phải nói đúng, vì tờ ấy TRÔNG như một bản vẽ kỹ thuật: nó có
   * chuỗi kích thước, có khung tên, có số mét vuông trong từng phòng. Nhưng chữ và số trên đó do
   * mô hình ảnh viết (Haan chốt 19/09), nên chúng là hình vẽ chứ không phải số đo — dấu tiếng
   * Việt có thể sai, con số có thể lệch bảng diện tích. Số đúng nằm ở tờ vector ngay bên trên.
   *
   * Khác `aiSheet` ở đúng chỗ đó: `aiSheet` nói «bản phác, đừng thi công theo», câu này nói
   * «đừng ĐO trên hình này». Một tờ vector vẫn đo được; tờ này thì không.
   *
   * Cùng hạng với `aiSheet`: do mã chèn, không tắt được từ giao diện (CLAUDE.md 8.7, 8.2 điểm 1).
   */
  aiSheetImage:
    'Ảnh minh hoạ do AI vẽ — không dựng từ toạ độ. Kích thước và diện tích in trên hình không đo được; số đúng ở tờ mặt bằng vector.',
  /**
   * Bản NGẮN của câu trên, để ĐÓNG DẤU lên chính tấm ảnh — T57b, 19/09/2026.
   *
   * Vì sao phải có bản riêng: `stampWatermark` in một dòng ngang đáy ảnh, và câu dài ở trên đo
   * được ~1.500 điểm ảnh ở cỡ chữ của một tấm 1024 px — tức bị cắt mất vế sau, đúng vế nói
   * «không đo được». Bản ngắn này giữ nguyên vế ấy và bỏ phần giải thích, thứ đã có bằng chữ
   * trong trang.
   *
   * ⚠️ Trùng nguyên văn với `sheet_image.watermark` của `kb/ai_design_prompts.yaml` — câu máy chủ
   * trả về sau một lượt vẽ. Trình duyệt KHÔNG đọc được `kb/`, nên đây là bản cho lúc xem lại một
   * tờ đã vẽ từ phiên trước. Trước T57b chỗ ấy ngã về `render` («Ảnh tham khảo ý tưởng — chưa
   * phải phương án thi công»), tức tấm tải về mất hẳn vế «không đo được» trong trường hợp THƯỜNG
   * GẶP nhất. Có phép thử canh hai chuỗi khớp nhau.
   */
  aiSheetImageStamp: 'Ảnh minh hoạ do AI vẽ — không đo được trên hình',
} as const;

// ---------------------------------------------------------------------------
// Băm nội dung artifact
// ---------------------------------------------------------------------------

/**
 * JSON chuẩn hoá: khoá sắp xếp tăng dần, không khoảng trắng thừa.
 *
 * Đây là điều kiện để "cùng input + cùng cấu hình → cùng mã băm" (02-architecture 2.5).
 * `JSON.stringify` thường KHÔNG đủ: thứ tự khoá theo thứ tự chèn, nên hai đối tượng cùng
 * nội dung nhưng dựng theo hai đường khác nhau sẽ ra hai mã băm khác nhau và hệ thống tính
 * lại một kết quả đã có.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function canonicalise(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Không băm được artifact chứa số không hữu hạn (NaN hoặc vô cực).');
    }
    return value;
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    // `undefined` bị JSON.stringify bỏ qua — loại sớm để mã băm không phụ thuộc việc
    // một khoá được gán undefined hay không tồn tại.
    for (const k of Object.keys(source).sort()) {
      if (source[k] === undefined) continue;
      out[k] = canonicalise(source[k]);
    }
    return out;
  }
  return value;
}

/** Định dạng mã artifact: `sha256:` + 64 ký tự hex. Trùng `$defs/artifact_ref` của hợp đồng. */
export const ARTIFACT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Mã artifact = băm SHA-256 của payload đã chuẩn hoá.
 *
 * Dùng `crypto.subtle` — có ở cả Cloudflare Workers, trình duyệt và Node 20+, nên hàm này
 * chạy được ở mọi nơi mà không cần bản riêng cho từng môi trường.
 */
export async function artifactId(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/**
 * Băm cấu hình đã dùng cho một bước — cột `params_hash` của `design_artifact_edge`.
 *
 * Trả lời câu hỏi "cùng input, cùng cấu hình → đã có kết quả chưa" để bỏ qua tính lại
 * (03-data-contracts 3.8). Không mang tiền tố `sha256:` vì nó không phải mã artifact.
 */
export async function paramsHash(params: unknown): Promise<string> {
  const id = await artifactId(params);
  return id.slice('sha256:'.length);
}
