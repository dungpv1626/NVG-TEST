/**
 * Ẩn danh đầu bài + khảo sát trước khi gửi cho mô hình của nhà cung cấp ngoài — nhánh AI
 * (quyết định T12, 08/09/2026).
 *
 * ── Ranh giới ─────────────────────────────────────────────────────────────────────────
 *
 * Hạng dữ liệu 2: gửi kích thước thật, gia đình, nhu cầu, phong cách, chữ tự do — nhưng KHÔNG
 * gửi danh tính: tên khách, điện thoại, địa chỉ, mã hồ sơ, ngân sách, người quyết định, giấy
 * tờ pháp lý. Đây là mức mà API trả phí có cam kết không huấn luyện được nhận (T12); hạ tiếp
 * xuống 1 không có lý do nào cả.
 *
 * ── Hai lớp cưỡng chế, không lớp nào là "nhớ mà làm" ─────────────────────────────────────
 *
 *  1. DANH SÁCH CHO PHÉP dựng bản gửi đi trường-theo-trường (khuôn `program/intent.ts`), và
 *     kết quả đi qua hợp đồng `contracts/ai-brief-digest.schema.json` có
 *     `additionalProperties: false` ở mọi cấp — một trường mới thêm vào đầu bài KHÔNG tự đi ra
 *     mạng, kể cả khi ai đó sao chép cả object.
 *  2. Chữ tự do đi qua `scrubIdentity`: số điện thoại, email, đường dẫn, mã hồ sơ, dãy số dài
 *     (căn cước, sổ đỏ) và TÊN khách đọc từ hồ sơ khách hàng đều bị thay bằng «[đã lược]».
 *
 * ⚠️ Địa chỉ trong chữ tự do KHÔNG lọc máy được chắc chắn (câu hỏi Q-30). Vì vậy màn hình có
 * nút «Xem dữ liệu sẽ gửi» hiện nguyên bản kết quả của hàm này — kiến trúc sư là lớp kiểm cuối.
 *
 * Hạng dữ liệu khai CỨNG ở đây và không nhận từ bên ngoài, cùng khuôn với `program/needs.ts`.
 */

import {
  aiBriefDigestSchema,
  type AiBriefDigest,
  type DataClass,
  type DesignBrief,
} from '@nvg/shared/design';

/** Bản gửi đi là hạng 2 — mặt bằng kích thước thật, đã lược danh tính. */
export const AI_DIGEST_DATA_CLASS: DataClass = 2;

const DIGEST_SCHEMA_VERSION = '1.1.0';

/** Năm cột chữ tự do của `design_briefs`; `legal_documents` cố ý không đi. */
export interface BriefFreeText {
  design_task?: string | null;
  functional_needs?: string | null;
  style_note?: string | null;
  site_condition?: string | null;
  legal_documents?: string | null;
}

/** Dòng `design_surveys` — số đo lưu dạng numeric nên có thể là chuỗi. */
export interface SurveyRow {
  land_width?: number | string | null;
  land_depth?: number | string | null;
  land_area?: number | string | null;
  orientation?: string | null;
  measurement_notes?: string | null;
  surrounding_notes?: string | null;
  usage_notes?: string | null;
  notes?: string | null;
}

export interface AnonymiseInput {
  brief: DesignBrief;
  freeText?: BriefFreeText | null;
  survey?: SurveyRow | null;
  /**
   * Chuỗi danh tính phải lược khỏi chữ tự do: tên khách, tên người quyết định, số điện thoại,
   * địa chỉ đã biết. Lấy từ `customers` và `decision_maker`, không đoán.
   */
  identities?: readonly (string | null | undefined)[];
}

const REDACTED = '[đã lược]';

/**
 * Lược danh tính khỏi một đoạn chữ. Thứ tự: chuỗi biết trước (tên, địa chỉ) → mẫu chung.
 *
 * Tên riêng tiếng Việt trùng với từ thông dụng của nghề (Nam, Đông, Hà, Lan, Hạnh…). Lược mọi
 * chỗ xuất hiện của một từ đơn là cắt luôn «hướng Nam», «phía Đông», «lan can» — mất đúng dữ
 * liệu hạng 2 mà bản gửi tồn tại để giữ (rà soát 08/09/2026). Nên:
 *  · cụm ≥ 2 từ («Nguyễn Văn Tuấn», số điện thoại, địa chỉ) lược ở mọi chỗ, so nguyên từ;
 *  · từ đơn CHỈ lược khi đứng sau danh xưng («anh Tuấn», «chị Lan», «bà Hạnh») — cách người
 *    Việt gọi tên trong câu, và cũng là cách địa chỉ/hướng KHÔNG bao giờ được gọi.
 */
const HONORIFICS =
  '(?:anh|chị|ông|bà|cô|chú|bác|cậu|mợ|dì|thím|em|cháu|cụ|thầy|cô giáo|vợ|chồng|gia đình|nhà|khách|chủ nhà|a\/c|mr|mrs|ms)';

export function scrubIdentity(
  text: string,
  identities: readonly (string | null | undefined)[] = [],
): string {
  let out = text;
  for (const raw of identities) {
    const needle = (raw ?? '').trim().replace(/\s+/g, ' ');
    if (needle.length < 2) continue;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    const single = !needle.includes(' ');
    const pattern = single
      ? `(?<=(?:^|[^\\p{L}\\p{N}])${HONORIFICS}\\s+)${escaped}(?![\\p{L}\\p{N}])`
      : `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
    out = out.replace(new RegExp(pattern, 'giu'), REDACTED);
  }
  return (
    out
      // Email và đường dẫn trước, vì chúng chứa cả chữ lẫn số mà các mẫu dưới sẽ cắt nát.
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, REDACTED)
      .replace(/https?:\/\/\S+/gi, REDACTED)
      // Số điện thoại Việt Nam: 0xxx hoặc +84, 9–10 chữ số, cho phép dấu cách/chấm/gạch/ngoặc.
      .replace(/(?<!\d)\(?(?:\+?84|0)\)?(?:[\s.()-]?\d){8,10}(?!\d)/g, REDACTED)
      // Mã hồ sơ của CHÍNH hệ thống (NVO-TK-2026-0001, HĐ-2026-15). Cố ý hẹp: mã tiêu chuẩn
      // (TCVN-5574-2018, QCVN-01-2021) là dữ liệu thiết kế và phải đi qua.
      .replace(
        /(?<![\p{L}\p{N}])(?:NVC|NVO|NVS|NVG|HĐ|HD|BG|DT)(?:-[A-Z0-9ĐÂĂÊÔƠƯ]{1,8})*-\d{2,}(?![\p{L}\p{N}])/gu,
        REDACTED,
      )
      // Dãy số dài: căn cước (12), sổ đỏ, tài khoản. Không đụng số 1–8 chữ số (diện tích, năm),
      // và không cắt đôi một số thập phân kiểu Việt («1.234.567,89») — dấu chấm/phẩy chỉ được
      // coi là phần của số khi hai bên đều là chữ số.
      .replace(/(?<!\d)(?<!\d[.,])\d{9,}(?!\d)(?![.,]\d)/g, REDACTED)
  );
}

function scrubOrNull(
  value: string | null | undefined,
  identities: readonly (string | null | undefined)[],
): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? scrubIdentity(trimmed, identities) : null;
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Dựng bản gửi đi. Ném `ZodError` nếu bản dựng lệch hợp đồng — đó là lỗi lập trình, phải nổ ở
 * kiểm thử, không phải lúc chạy thật.
 */
export function anonymiseForAi(input: AnonymiseInput): AiBriefDigest {
  const { brief } = input;
  const identities = [...(input.identities ?? []), brief.decision_maker?.name ?? null];
  const site = brief.site;

  const digest = {
    schema_version: DIGEST_SCHEMA_VERSION,
    building_type: brief.building_type,
    locality: brief.locality,
    floors: brief.floors,
    site: {
      shape: site.shape ?? null,
      width_m: site.width_m,
      depth_m: site.depth_m,
      rear_width_m: site.rear_width_m ?? null,
      boundary_m: site.boundary_m ?? null,
      orientation: site.orientation ?? null,
      access_sides: [...(site.access_sides ?? [])],
      adjacent: {
        front: site.adjacent?.front ?? null,
        back: site.adjacent?.back ?? null,
        left: site.adjacent?.left ?? null,
        right: site.adjacent?.right ?? null,
      },
      setback_required_m: site.setback_required_m
        ? Object.fromEntries(
            Object.entries(site.setback_required_m).filter(([, v]) => typeof v === 'number'),
          )
        : null,
      max_density: site.max_density ?? null,
      main_entrance_side: site.main_entrance_side ?? null,
      vehicle_entrance_side: site.vehicle_entrance_side ?? null,
      boundary_walls: site.boundary_walls
        ? {
            front: site.boundary_walls.front ?? null,
            back: site.boundary_walls.back ?? null,
            left: site.boundary_walls.left ?? null,
            right: site.boundary_walls.right ?? null,
          }
        : null,
    },
    family: (brief.family ?? []).map((m) => ({
      role: m.role,
      count: m.count,
      floor: m.floor ?? null,
      floor_pref: m.floor_pref ?? null,
      // Nhu cầu là MÃ (`study`, `balcony`…) nhưng đầu bài cũ từng lưu cả chữ tự do ở đây.
      needs: (m.needs ?? []).map((n) => scrubIdentity(n, identities)),
      ensuite: m.ensuite ?? null,
    })),
    required_spaces: (brief.required_spaces ?? []).map((s) => ({
      type: s.type,
      floor: s.floor ?? null,
      area_m2: s.area_m2 ?? null,
      ensuite: s.ensuite ?? null,
      amenities: scrubOrNull(s.amenities, identities),
    })),
    massing: brief.massing
      ? {
          wings_preferred: brief.massing.wings_preferred ?? null,
          footprint_shape: brief.massing.footprint_shape ?? null,
          cores_preferred: brief.massing.cores_preferred ?? null,
          service_core: brief.massing.service_core ?? null,
          yards: [...(brief.massing.yards ?? [])],
          indoor_outdoor: brief.massing.indoor_outdoor ?? null,
          yard_depth_m: brief.massing.yard_depth_m
            ? Object.fromEntries(
                Object.entries(brief.massing.yard_depth_m).filter(([, v]) => typeof v === 'number'),
              )
            : null,
        }
      : null,
    parking: brief.parking
      ? { cars: brief.parking.cars ?? null, motorbikes: brief.parking.motorbikes ?? null }
      : null,
    style: brief.style ?? null,
    priorities: [...(brief.priorities ?? [])],
    free_text: {
      design_task: scrubOrNull(input.freeText?.design_task, identities),
      functional_needs: scrubOrNull(input.freeText?.functional_needs, identities),
      style_note: scrubOrNull(input.freeText?.style_note, identities),
      site_condition: scrubOrNull(input.freeText?.site_condition, identities),
    },
    survey: input.survey
      ? {
          land_width_m: numberOrNull(input.survey.land_width),
          land_depth_m: numberOrNull(input.survey.land_depth),
          land_area_m2: numberOrNull(input.survey.land_area),
          orientation: input.survey.orientation ?? null,
          measurement_notes: scrubOrNull(input.survey.measurement_notes, identities),
          surrounding_notes: scrubOrNull(input.survey.surrounding_notes, identities),
          usage_notes: scrubOrNull(input.survey.usage_notes, identities),
          notes: scrubOrNull(input.survey.notes, identities),
        }
      : null,
  };

  return aiBriefDigestSchema.parse(digest);
}
