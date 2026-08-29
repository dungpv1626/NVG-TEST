/**
 * Biểu mẫu thích ứng của Đầu bài thiết kế — phần MÃ đọc cấu hình.
 *
 * Nguồn: `doc/design/08-milestones.md` Mốc 2 — "logic hiện/ẩn nằm trong cấu hình JSON chứ
 * không viết cứng trong giao diện".
 *
 * Cấu hình nằm ở `brief-form.json` cạnh tệp này. Tệp đó là DỮ LIỆU: thêm câu hỏi cho biệt
 * thự, đổi nhãn, đổi trọng số đều là sửa JSON, không sửa mã.
 *
 * ## Vì sao chỗ đặt là `shared/src/design/`, không phải `config/`
 *
 * `shared/tsconfig.json` khai `rootDir: "./src"`, nên import `../../config/*.json` từ trong
 * `shared/src` sẽ hỏng `tsc -b`. Giữ tệp ở `config/` thì phải thêm một bộ sinh và một lệnh
 * `--check` chạy tay — mà repo chưa có CI, nên đó là thêm một bản sao không có gì canh.
 * Một tệp, một nguồn.
 *
 * ## Vì sao JSON chứ không YAML
 *
 * Đây là tệp DUY NHẤT cả hai runtime phải đọc: `web/` để vẽ biểu mẫu, `workers/` để tính
 * lại điểm khi đúc artifact. JSON nhập được trực tiếp ở cả Vite lẫn esbuild mà không thêm
 * công cụ nào; YAML thì Worker phải qua `js-yaml` và trình duyệt phải kéo thư viện đó vào
 * bản dựng. Đổi lại JSON không có chú thích — nên mọi cấp đều nhận khoá `note`.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Điều kiện hiện/ẩn
// ---------------------------------------------------------------------------

/**
 * Ngôn ngữ điều kiện cố ý RẤT NHỎ — sáu dạng, không hơn.
 *
 * Mỗi dạng thêm vào là một bước tiến tới việc có một ngôn ngữ lập trình thứ hai nằm trong
 * tệp dữ liệu, thứ không ai gỡ lỗi được. Sáu dạng này đủ diễn đạt mọi phân nhánh mà tài
 * liệu đòi; cần hơn thì đó là dấu hiệu câu hỏi nên tách làm hai.
 */
export type BriefCondition =
  | { field: string; equals: string | number | boolean | null }
  | { field: string; in: (string | number | boolean | null)[] }
  | { field: string; filled: boolean }
  | { all: BriefCondition[] }
  | { any: BriefCondition[] }
  | { not: BriefCondition };

const conditionSchema: z.ZodType<BriefCondition> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string(),
      equals: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    }),
    z.object({
      field: z.string(),
      in: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }),
    z.object({ field: z.string(), filled: z.boolean() }),
    z.object({ all: z.array(conditionSchema) }),
    z.object({ any: z.array(conditionSchema) }),
    z.object({ not: conditionSchema }),
  ]),
);

// ---------------------------------------------------------------------------
// Cấu hình
// ---------------------------------------------------------------------------

/**
 * Kiểu điều khiển. KHÔNG có `date` và KHÔNG có `number` gốc của trình duyệt: hai thứ đó tự
 * sinh chữ tiếng Anh trên máy đặt ngôn ngữ khác (CLAUDE.md 4.1). `number` ở đây là ô chữ
 * với `inputMode`, `money_range` là hai `MoneyInput`.
 *
 * `choice` và `select` cùng là "chọn đúng một", khác nhau ở SỐ LƯỢNG lựa chọn: `choice` vẽ
 * chip bật/tắt (đọc lướt được, hợp với 3–8 mục), `select` vẽ `<select>` gốc có nhóm (hợp với
 * hàng chục mục). `<select>` nằm trong danh sách an toàn của CLAUDE.md 4.1 vì mọi chữ bên
 * trong nó là chữ của chúng ta — nó không tự sinh câu nào như `date` hay `number`.
 *
 * `polygon` là bảng toạ độ đỉnh của ranh giới thửa đất — dạng duy nhất mô tả được thửa tứ
 * giác hay ngũ giác không đều mà không mập mờ. Chiều dài các cạnh thì không: cùng bộ độ dài
 * cạnh ứng với vô số hình khác nhau.
 */
export const BRIEF_CONTROLS = [
  'text',
  'textarea',
  'number',
  'money_range',
  'choice',
  'select',
  'multi',
  'tristate',
  'family',
  'sides',
  'polygon',
] as const;
export type BriefControl = (typeof BRIEF_CONTROLS)[number];

const optionSchema = z.object({
  value: z.string(),
  label: z.string(),
  /**
   * Nhãn nhóm, chỉ dùng cho `select`.
   *
   * Sinh ra vì danh sách địa phương có 34 mục: đọc hết 34 dòng để tìm bốn tỉnh NVG thi công
   * hằng ngày là bắt người dùng trả giá cho tính đầy đủ của danh sách. Nhóm giữ được cả hai —
   * đủ 34 lựa chọn, mà bốn cái hay dùng nằm ngay đầu.
   *
   * Tuỳ chọn không khai `group` xếp trước mọi nhóm, đúng thứ tự khai trong tệp cấu hình.
   */
  group: z.string().optional(),
  /**
   * Giá trị KHÔNG còn chọn được nữa, nhưng vẫn phải đọc ra chữ.
   *
   * Sinh ra từ sắp xếp đơn vị hành chính 2025: `thai_binh` không còn là một tỉnh, nhưng hồ
   * sơ đã xác nhận trước đó vẫn mang mã ấy — và bản đã xác nhận là BẤT BIẾN, sửa nó là làm
   * sai lệch chính thứ nó sinh ra để bảo vệ. Bỏ hẳn lựa chọn khỏi cấu hình thì màn hình hiện
   * đúng chữ `thai_binh` giữa một trang tiếng Việt.
   *
   * Danh sách chọn bỏ qua mục này; chỉ khi nó ĐANG là giá trị của hồ sơ thì mới hiện, xếp
   * riêng một nhóm — để người sửa thấy mình đang giữ một giá trị đã hết hiệu lực.
   */
  retired: z.boolean().optional(),
  note: z.string().optional(),
});

const fieldSchema = z.object({
  /** Đường dẫn vào payload `DesignBrief`, ví dụ `site.width_m`. */
  path: z.string().min(1),
  label: z.string().min(1),
  control: z.enum(BRIEF_CONTROLS),
  /**
   * Trọng số khi chấm độ đầy đủ. `0` = không tính điểm (ô ghi chú tự do).
   *
   * Trọng số nằm ở ĐÂY chứ không trong mã: "thiếu bề rộng lô nặng hơn thiếu phong cách" là
   * một nhận định nghiệp vụ, và người sửa nó phải sửa được mà không cần biết TypeScript.
   */
  weight: z.number().min(0).max(10),
  unit: z.string().optional(),
  hint: z.string().optional(),
  placeholder: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(optionSchema).optional(),
  /**
   * Kiểu thật của giá trị khi ghi vào payload.
   *
   * Lựa chọn trong tệp cấu hình luôn là CHUỖI (JSON không cho khoá số), nhưng hợp đồng có
   * trường là số nguyên — `massing.wings_preferred` chẳng hạn. Không khai kiểu ở đây thì
   * biểu mẫu ghi `"1"` vào chỗ đòi `1`, và lỗi chỉ nổ ra ở tận bước đúc artifact, sau khi
   * người dùng đã điền xong cả biểu mẫu.
   */
  value_type: z.enum(['string', 'number']).optional(),
  when: conditionSchema.optional(),
  note: z.string().optional(),
});

const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  hint: z.string().optional(),
  when: conditionSchema.optional(),
  fields: z.array(fieldSchema).min(1),
  note: z.string().optional(),
});

export const briefFormConfigSchema = z
  .object({
    _doc: z.string().optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    sections: z.array(sectionSchema).min(1),
    /**
     * Cấu hình của phần soát mâu thuẫn.
     *
     * Hiện RỖNG, và đó là kết quả đúng chứ không phải chỗ bỏ dở: mọi phép kiểm ở
     * `brief-completeness.ts` đều thuần số học và cấu trúc, không cần một ngưỡng nào. Giữ
     * lại khoá để chỗ khai tham số nằm sẵn ở đây khi cần — nhưng khai một tham số mà không
     * phép kiểm nào đọc tới còn tệ hơn không khai, vì nó tạo cảm giác đã cấu hình được.
     */
    consistency: z.object({}).strict(),
  })
  .strict();

export type BriefFormConfig = z.infer<typeof briefFormConfigSchema>;
export type BriefFormSection = z.infer<typeof sectionSchema>;
export type BriefFormField = z.infer<typeof fieldSchema>;

// ---------------------------------------------------------------------------
// Đọc giá trị và xét điều kiện
// ---------------------------------------------------------------------------

/** Đọc theo đường dẫn `a.b.c`. Trả `undefined` khi đứt giữa chừng. */
export function valueAtPath(payload: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, payload);
}

/**
 * Ghi theo đường dẫn `a.b.c`, trả về bản SAO — không sửa đối tượng gốc.
 *
 * Đặt cạnh `valueAtPath` vì hai hàm là hai chiều của cùng một quy ước; tách ra hai tệp là
 * mở đường cho hai cách hiểu đường dẫn khác nhau.
 *
 * `undefined` XOÁ khoá thay vì gán `undefined`: hợp đồng `additionalProperties: false` chấp
 * nhận khoá vắng mặt nhưng không chấp nhận khoá mang `undefined` sau khi qua `JSON.stringify`
 * — và mã băm artifact tính trên JSON đã chuẩn hoá, nên hai thứ đó phải là một.
 */
export function setAtPath<T extends object>(payload: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  if (!head) return payload;

  const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  if (rest.length === 0) {
    if (value === undefined) delete copy[head];
    else copy[head] = value;
  } else {
    const child = copy[head];
    const base = child && typeof child === 'object' ? (child as object) : {};
    const next = setAtPath(base, rest.join('.'), value);
    if (Object.keys(next).length === 0) delete copy[head];
    else copy[head] = next;
  }
  return copy as T;
}

/**
 * Đã trả lời hay chưa — bảng này là chỗ lỗi trốn được lâu nhất, nên viết tường minh:
 *
 * | Giá trị | Kết luận |
 * |---|---|
 * | `undefined` · `null` · `''` · `[]` · `{}` rỗng | **chưa** trả lời |
 * | `false` | **đã** trả lời — "chưa có hồ sơ pháp lý" là một câu trả lời |
 * | `0` | **đã** trả lời — khoảng lùi bằng không là một câu trả lời |
 *
 * Coi `false` hoặc `0` là chưa trả lời sẽ khiến mọi đầu bài nhà phố (khoảng lùi 0) không
 * bao giờ đạt ngưỡng, mà nhìn màn hình thì thấy đã điền đủ.
 */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as object).some((v) => v !== undefined);
  return true;
}

export function evaluateCondition(condition: BriefCondition, payload: unknown): boolean {
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, payload));
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(c, payload));
  if ('not' in condition) return !evaluateCondition(condition.not, payload);

  const value = valueAtPath(payload, condition.field);
  if ('equals' in condition) return value === condition.equals;
  if ('in' in condition) return condition.in.includes(value as never);
  return isAnswered(value) === condition.filled;
}

/**
 * Trường có hiện không.
 *
 * ⚠️ **Giao diện và bộ chấm điểm PHẢI gọi chung hàm này.** Nếu màn hình tự quyết ẩn/hiện
 * theo một cách còn bộ chấm điểm theo cách khác thì sẽ có mục "còn thiếu" mà không màn hình
 * nào cho nhập — một lỗi không ai tái hiện được vì hai bên đều "đúng" theo lượt đọc riêng.
 */
export function isFieldVisible(
  field: BriefFormField,
  section: BriefFormSection,
  payload: unknown,
): boolean {
  if (section.when && !evaluateCondition(section.when, payload)) return false;
  return field.when ? evaluateCondition(field.when, payload) : true;
}

/** Mọi trường đang hiện, kèm section chứa nó — dùng cho cả vẽ lẫn chấm điểm. */
export function visibleFields(
  config: BriefFormConfig,
  payload: unknown,
): { field: BriefFormField; section: BriefFormSection }[] {
  const out: { field: BriefFormField; section: BriefFormSection }[] = [];
  for (const section of config.sections) {
    if (section.when && !evaluateCondition(section.when, payload)) continue;
    for (const field of section.fields) {
      if (isFieldVisible(field, section, payload)) out.push({ field, section });
    }
  }
  return out;
}
