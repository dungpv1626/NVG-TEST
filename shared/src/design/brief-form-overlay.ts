/**
 * Lớp phủ của quản trị viên lên cấu hình biểu mẫu Đầu bài — phần cho phép THÊM, SỬA, XOÁ mục
 * khảo sát mà không phát hành lại phần mềm (yêu cầu của Haan 21/09/2026).
 *
 * ## Vì sao là LỚP PHỦ chứ không phải thay hẳn tệp cấu hình
 *
 * Cách hiển nhiên là cho quản trị viên sửa thẳng `brief-form.json` rồi cất cả tệp vào CSDL.
 * Cách đó sai ở ba chỗ, và cả ba đều chỉ lộ ra sau khi đã hỏng:
 *
 *  1. **Trường của hợp đồng không phải dữ liệu tự do.** `site.width_m` có kiểu, có đơn vị, có
 *     điều khiển riêng, và `massing.wings_preferred` ghi số chứ không ghi chuỗi. Một bản chép
 *     toàn tệp trong CSDL cho phép sửa những thứ đó thành sai, và lỗi chỉ nổ ra ở bước đúc
 *     artifact — sau khi kiến trúc sư đã điền xong cả biểu mẫu.
 *  2. **Bản chép đóng băng ở ngày nó được chép.** Đợt sau thêm câu hỏi mới vào `brief-form.json`
 *     thì tenant nào đã từng bấm «Lưu» sẽ không bao giờ thấy câu hỏi đó — im lặng.
 *  3. **Không phân biệt được «NVG đổi» với «quản trị viên đổi».** Lớp phủ thì đọc ra ngay: nó
 *     chỉ chứa phần KHÁC bản gốc.
 *
 * Nên: bản gốc trong mã nguồn vẫn là nguồn của TẬP TRƯỜNG và KIỂU; lớp phủ chỉ đổi những thứ
 * an toàn để đổi (nhãn, gợi ý, trọng số, thứ tự, ẩn/hiện) và thêm được câu hỏi MỚI vào ô mở
 * `custom.*` của hợp đồng.
 *
 * ## Cái gì KHÔNG sửa được, và vì sao
 *
 *  · `control`, `unit`, `min`, `max`, `value_scale`, `value_type`, `when` của trường có sẵn —
 *    chúng là hình dạng dữ liệu, không phải cách diễn đạt.
 *  · GIÁ TRỊ của lựa chọn (`option.value`) — chúng là enum của hợp đồng. Nhãn thì sửa được.
 *  · Năm trường hợp đồng bắt buộc (`LOCKED_PATHS`) không ẩn được: ẩn chúng là làm mọi đầu bài
 *    mới không chốt được, mà màn hình thì không nói vì sao.
 *  · Xoá một trường có sẵn: không có. Ẩn thì được — và ẩn giữ lại câu trả lời đã lưu, còn xoá
 *    thì không. Hồ sơ đã xác nhận là BẤT BIẾN; một biểu mẫu không còn đọc nổi chính nó là cái
 *    giá không đáng trả cho một nút «Xoá».
 */

import { z } from 'zod';
import {
  briefFormConfigSchema,
  type BriefFormConfig,
  type BriefFormField,
  type BriefFormSection,
} from './brief-form';

/**
 * Khoá của lớp phủ trong bảng `design_setting` (theo từng tenant).
 *
 * Cùng bảng với `brief_completeness_min`: cả hai đều là cấu hình mức module, và bảng ấy đã có
 * sẵn RLS đúng thứ cần — ai trong tenant cũng ĐỌC được (biểu mẫu phải vẽ được cho mọi người),
 * chỉ `design.settings.write` mới GHI được.
 */
export const BRIEF_FORM_OVERLAY_KEY = 'brief_form_overlay';

/**
 * Trường hợp đồng đòi bắt buộc — không ẩn được, không hạ trọng số xuống 0 được.
 *
 * Lấy từ `required` của `contracts/design-brief.schema.json`. Viết tay ở đây thay vì đọc lại
 * từ schema vì Zod sinh ra không giữ danh sách `required` ở dạng tra được; có kiểm thử canh
 * hai bên khớp nhau, nên lệch thì đỏ chứ không lặng lẽ.
 */
export const LOCKED_PATHS: readonly string[] = [
  'building_type',
  'locality',
  'floors',
  'site.width_m',
  'site.depth_m',
];

/**
 * Điều khiển mà một câu hỏi TỰ THÊM được phép dùng.
 *
 * Hẹp hơn hẳn `BRIEF_CONTROLS`: ô `custom.*` của hợp đồng chỉ nhận chuỗi, số, đúng/sai. Những
 * điều khiển còn lại (`family`, `space_floor`, `sides`, `polygon`, `money_range`, `multi`) đều
 * ghi ra CẤU TRÚC, và cấu trúc thì engine phải hiểu — mà engine không đọc `custom.*`. Cho phép
 * chúng ở đây là hứa một thứ phần mềm không làm được.
 */
export const CUSTOM_CONTROLS = ['text', 'textarea', 'number', 'choice', 'tristate'] as const;
export type CustomControl = (typeof CUSTOM_CONTROLS)[number];

/** Mã câu hỏi tự thêm: `custom.<khoá>`, khoá viết thường không dấu. */
export const CUSTOM_PATH_PATTERN = /^custom\.[a-z0-9_]{1,40}$/;

const overlayOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  note: z.string().optional(),
  /** Lựa chọn thôi hiện, nhưng hồ sơ đang mang nó vẫn đọc ra chữ (`retired` của bản gốc). */
  hidden: z.boolean().optional(),
});

const overlayFieldSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1).optional(),
  hint: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  weight: z.number().min(0).max(10).optional(),
  optional: z.boolean().optional(),
  /** Ẩn khỏi biểu mẫu. Câu trả lời đã lưu KHÔNG bị xoá — xem đầu tệp. */
  hidden: z.boolean().optional(),
  options: z.array(overlayOptionSchema).optional(),
  /**
   * Chỉ có ở câu hỏi TỰ THÊM (`custom.*`): phần bản gốc không có nên lớp phủ phải tự khai.
   * Trường có sẵn mang khoá này là lỗi cấu hình, bị `applyBriefFormOverlay` bác.
   */
  custom: z
    .object({
      control: z.enum(CUSTOM_CONTROLS),
      unit: z.string().optional(),
    })
    .optional(),
});

const overlaySectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  hint: z.string().nullable().optional(),
  hidden: z.boolean().optional(),
  /** Mục do quản trị viên tạo — bản gốc không có `id` này. */
  custom: z.boolean().optional(),
  fields: z.array(overlayFieldSchema).optional(),
});

export const briefFormOverlaySchema = z
  .object({
    version: z.literal(1),
    /**
     * Thứ tự MỤC, viết bằng danh sách id đầy đủ.
     *
     * Là một danh sách chứ không phải số thứ tự trên từng mục: số thứ tự cho phép hai mục
     * cùng mang số 3, và lúc ấy thứ tự trên màn hình do thuật toán sắp xếp quyết định — nghĩa
     * là quản trị viên kéo thả xong không chắc nhìn lại thấy đúng như vừa kéo.
     *
     * Id lạ trong danh sách bị bỏ qua; mục có thật mà thiếu trong danh sách xếp về cuối, giữ
     * nguyên thứ tự gốc.
     */
    section_order: z.array(z.string()).optional(),
    sections: z.array(overlaySectionSchema).optional(),
    /** Ai sửa lần cuối và lúc nào — để màn hình nói ra, không phải để phân quyền. */
    updated_at: z.string().optional(),
    updated_by_name: z.string().optional(),
  })
  .strict();

export type BriefFormOverlay = z.infer<typeof briefFormOverlaySchema>;
export type BriefFormOverlayField = z.infer<typeof overlayFieldSchema>;
export type BriefFormOverlaySection = z.infer<typeof overlaySectionSchema>;

/** Lớp phủ rỗng — dùng khi tenant chưa sửa gì. */
export const EMPTY_BRIEF_FORM_OVERLAY: BriefFormOverlay = { version: 1 };

export class BriefFormOverlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BriefFormOverlayError';
  }
}

/**
 * Ghép lớp phủ lên cấu hình gốc, trả về cấu hình HIỆU LỰC.
 *
 * Hàm THUẦN và ném khi lớp phủ sai — nơi gọi bắt lỗi và lùi về bản gốc. Không bao giờ trả về
 * một cấu hình «gần đúng»: biểu mẫu chạy trên cấu hình hỏng là cách chắc chắn nhất để mất câu
 * trả lời của người dùng.
 */
export function applyBriefFormOverlay(
  base: BriefFormConfig,
  overlay: BriefFormOverlay | null | undefined,
): BriefFormConfig {
  if (!overlay) return base;

  const patchById = new Map((overlay.sections ?? []).map((s) => [s.id, s]));
  const baseIds = new Set(base.sections.map((s) => s.id));

  const sections: BriefFormSection[] = [];

  for (const section of base.sections) {
    const patch = patchById.get(section.id);
    if (patch?.hidden) continue;
    sections.push(mergeSection(section, patch));
  }

  // Mục do quản trị viên tạo — chỉ chứa câu hỏi `custom.*`, nên không đụng vào hợp đồng.
  for (const patch of overlay.sections ?? []) {
    if (baseIds.has(patch.id) || patch.hidden) continue;
    if (!patch.custom) {
      throw new BriefFormOverlayError(
        `Mục «${patch.id}» không có trong biểu mẫu gốc. Mục tự thêm phải đánh dấu là mục tự tạo.`,
      );
    }
    const fields = (patch.fields ?? []).filter((f) => !f.hidden).map((f) => customField(f));
    if (!fields.length) continue; // Mục rỗng không vẽ ra — lược đồ gốc đòi tối thiểu một trường.
    sections.push({
      id: patch.id,
      title: patch.title ?? patch.id,
      ...(patch.hint ? { hint: patch.hint } : {}),
      fields,
    });
  }

  const ordered = orderSections(sections, overlay.section_order);
  const merged: BriefFormConfig = { ...base, sections: ordered };

  // Kiểm lại bằng chính lược đồ của cấu hình: lớp phủ không được phép dựng ra một cấu hình mà
  // bản gốc không bao giờ dựng được.
  const parsed = briefFormConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new BriefFormOverlayError(
      `Cấu hình biểu mẫu sau khi áp thay đổi không hợp lệ: ${parsed.error.issues[0]?.message ?? ''}`.trim(),
    );
  }
  return parsed.data;
}

function mergeSection(
  section: BriefFormSection,
  patch: BriefFormOverlaySection | undefined,
): BriefFormSection {
  const fieldPatches = new Map((patch?.fields ?? []).map((f) => [f.path, f]));
  const knownPaths = new Set(section.fields.map((f) => f.path));

  const fields: BriefFormField[] = [];
  for (const field of section.fields) {
    const fieldPatch = fieldPatches.get(field.path);
    if (fieldPatch?.hidden) {
      if (LOCKED_PATHS.includes(field.path)) {
        throw new BriefFormOverlayError(
          `Trường «${field.label}» là thông tin bắt buộc của hợp đồng đầu bài, không ẩn được.`,
        );
      }
      continue;
    }
    fields.push(mergeField(field, fieldPatch));
  }

  // Câu hỏi tự thêm vào một mục CÓ SẴN.
  for (const fieldPatch of patch?.fields ?? []) {
    if (knownPaths.has(fieldPatch.path) || fieldPatch.hidden) continue;
    fields.push(customField(fieldPatch));
  }

  return {
    ...section,
    ...(patch?.title ? { title: patch.title } : {}),
    ...(patch && 'hint' in patch ? { hint: patch.hint ?? undefined } : {}),
    fields,
  };
}

function mergeField(
  field: BriefFormField,
  patch: BriefFormOverlayField | undefined,
): BriefFormField {
  if (!patch) return field;
  if (patch.custom) {
    throw new BriefFormOverlayError(
      `Trường «${field.path}» đã có trong biểu mẫu gốc, không khai lại được như câu hỏi tự thêm.`,
    );
  }
  const next: BriefFormField = { ...field };
  if (patch.label) next.label = patch.label;
  if ('hint' in patch) next.hint = patch.hint ?? undefined;
  if ('placeholder' in patch) next.placeholder = patch.placeholder ?? undefined;
  if (typeof patch.optional === 'boolean') next.optional = patch.optional;
  if (typeof patch.weight === 'number') {
    if (patch.weight === 0 && LOCKED_PATHS.includes(field.path)) {
      throw new BriefFormOverlayError(
        `Trường «${field.label}» là thông tin bắt buộc, trọng số không hạ xuống 0 được.`,
      );
    }
    next.weight = patch.weight;
  }
  if (patch.options) next.options = mergeOptions(field, patch.options);
  return next;
}

/**
 * Nhãn lựa chọn sửa được, GIÁ TRỊ thì không.
 *
 * Giá trị là enum của hợp đồng: thêm một giá trị mới ở đây thì biểu mẫu ghi ra thứ hợp đồng
 * không nhận, và lỗi nổ ở bước đúc artifact chứ không ở lúc bấm Lưu cấu hình. Giá trị lạ bị
 * BÁC ngay, kèm tên — im lặng bỏ qua thì quản trị viên tưởng mình vừa thêm được lựa chọn.
 */
function mergeOptions(
  field: BriefFormField,
  patches: z.infer<typeof overlayOptionSchema>[],
): BriefFormField['options'] {
  const known = new Map((field.options ?? []).map((o) => [o.value, o]));
  for (const patch of patches) {
    if (!known.has(patch.value)) {
      throw new BriefFormOverlayError(
        `Trường «${field.label}» không có lựa chọn mang mã «${patch.value}». Lựa chọn của trường có sẵn chỉ đổi được nhãn.`,
      );
    }
  }
  const byValue = new Map(patches.map((p) => [p.value, p]));
  return (field.options ?? [])
    .filter((option) => !byValue.get(option.value)?.hidden)
    .map((option) => {
      const patch = byValue.get(option.value);
      if (!patch) return option;
      return { ...option, label: patch.label, ...(patch.note ? { note: patch.note } : {}) };
    });
}

function customField(patch: BriefFormOverlayField): BriefFormField {
  if (!CUSTOM_PATH_PATTERN.test(patch.path)) {
    throw new BriefFormOverlayError(
      `Mã câu hỏi tự thêm phải có dạng «custom.<khoá>», khoá viết thường không dấu — nhận được «${patch.path}».`,
    );
  }
  if (!patch.custom) {
    throw new BriefFormOverlayError(`Câu hỏi tự thêm «${patch.path}» chưa khai kiểu điều khiển.`);
  }
  if (!patch.label) {
    throw new BriefFormOverlayError(`Câu hỏi tự thêm «${patch.path}» chưa có nhãn.`);
  }
  const control = patch.custom.control;
  if ((control === 'choice' || control === 'tristate') && !patch.options?.length) {
    throw new BriefFormOverlayError(
      `Câu hỏi tự thêm «${patch.label}» là câu chọn nhưng chưa có lựa chọn nào.`,
    );
  }
  return {
    path: patch.path,
    label: patch.label,
    control,
    // Trọng số mặc định 0: câu hỏi tự thêm KHÔNG được âm thầm kéo `completeness_score` xuống
    // dưới ngưỡng chạy Lớp 2. Quản trị viên nâng lên là một hành động có ý thức.
    weight: patch.weight ?? 0,
    optional: patch.optional ?? true,
    ...(patch.custom.unit ? { unit: patch.custom.unit } : {}),
    ...(patch.hint ? { hint: patch.hint } : {}),
    ...(patch.placeholder ? { placeholder: patch.placeholder } : {}),
    ...(patch.options
      ? {
          options: patch.options
            .filter((o) => !o.hidden)
            .map((o) => ({ value: o.value, label: o.label, ...(o.note ? { note: o.note } : {}) })),
        }
      : {}),
  };
}

function orderSections(sections: BriefFormSection[], order: string[] | undefined) {
  if (!order?.length) return sections;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...sections].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return sections.indexOf(a) - sections.indexOf(b);
  });
}

/**
 * Đọc lớp phủ từ giá trị thô của `design_setting.value`.
 *
 * Không ném: cấu hình hỏng trong CSDL không được làm cả màn hình Đầu bài trắng. Trả `null` và
 * nơi gọi dùng bản gốc — kèm một dòng báo trên màn hình quản trị, chỗ sửa được nó.
 */
export function readBriefFormOverlay(raw: unknown): BriefFormOverlay | null {
  if (!raw) return null;
  const parsed = briefFormOverlaySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Câu hỏi tự thêm + câu trả lời, đã đọc ra CHỮ — cho bước gửi mô hình và cho bản in.
 *
 * Đọc ra chữ ngay ở đây chứ không để bên nhận tự tra: bên nhận là mô hình của nhà cung cấp
 * ngoài, nó không có tệp cấu hình của NVG, nên cặp `bep_phu = co` không nói được gì. Và nếu
 * mỗi nơi hiển thị tự tra lấy thì cùng một câu trả lời hiện ra hai kiểu ở hai màn hình
 * (`brief-vocabulary.ts` đã nêu đúng lý lẽ này cho phần nhãn).
 *
 * Câu hỏi đã bị quản trị viên ẩn hoặc xoá KHÔNG còn trong `config`, nên câu trả lời của nó
 * cũng không đi tiếp — dù vẫn nằm nguyên trong `structured` của đầu bài. Đó là chủ ý: ẩn một
 * câu hỏi là nói «thôi hỏi điều này», không phải «xoá điều đã trả lời».
 */
export function customAnswers(
  config: BriefFormConfig,
  custom: Record<string, string | number | boolean | null> | null | undefined,
): { label: string; value: string }[] {
  if (!custom) return [];
  const out: { label: string; value: string }[] = [];
  for (const section of config.sections) {
    for (const field of section.fields) {
      if (!field.path.startsWith('custom.')) continue;
      const key = field.path.slice('custom.'.length);
      const raw = custom[key];
      if (raw === undefined || raw === null || raw === '') continue;
      out.push({ label: field.label, value: formatCustomValue(field, raw) });
    }
  }
  return out;
}

function formatCustomValue(field: BriefFormField, raw: string | number | boolean): string {
  if (typeof raw === 'boolean') {
    const option = field.options?.find((o) => o.value === String(raw));
    return option?.label ?? (raw ? 'Có' : 'Không');
  }
  const option = field.options?.find((o) => o.value === String(raw));
  if (option) return option.label;
  return field.unit ? `${raw} ${field.unit}` : String(raw);
}
