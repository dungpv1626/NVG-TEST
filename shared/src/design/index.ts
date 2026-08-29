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
