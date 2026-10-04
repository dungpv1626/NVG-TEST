/**
 * Cắt đầu bài theo lời gọi AI (T114): mỗi lời gọi chỉ thấy câu trả lời nó cần.
 *
 * Nhãn nằm ở biểu mẫu — khoá `for` của từng câu, không khai thì theo PHẦN chứa câu
 * (`fieldTargets`, `shared/src/design/brief-form.ts`). Đây là chỗ DUY NHẤT đọc nhãn ấy; các lời
 * dẫn không tự nhặt trường nữa. Haan, 03/10/2026: «khi tạo prompt cho AI sẽ được chính xác và
 * không bị thừa thông tin không cần thiết».
 *
 * CHỈ dùng cho chữ GỬI MÔ HÌNH. Bộ kiểm đầu bài (`brief-demands`), bộ xếp, cổng và thước chấm đọc
 * digest ĐẦY ĐỦ: cắt ở đó là bỏ mất ràng buộc gia chủ đã khai (T65).
 *
 * Câu bị cắt thì trống như «chưa trả lời»: mảng thành rỗng, còn lại thành `null`. Kết quả cố ý
 * KHÔNG qua lại hợp đồng digest — nó là đầu vào của lời dẫn, không phải một artifact.
 *
 * Hai thứ không phải câu của biểu mẫu:
 *  · khảo sát hiện trạng (`survey`) — số đo và ghi chú tại thửa đất, chỉ mặt bằng dùng; mặt đứng
 *    và phối cảnh đã có kích thước lô và hiện trạng bốn phía từ phần Chung;
 *  · câu hỏi quản trị viên tự thêm (`custom`) — tra theo nhãn trong cấu hình được truyền vào;
 *    không tra ra (cấu hình gốc không có câu tự thêm) thì coi như phần Mặt bằng, đúng chỗ chúng
 *    vẫn đi tới trước T114.
 */

import {
  BRIEF_FORM,
  BRIEF_PART_TARGETS,
  fieldTargets,
  valueAtPath,
  type AiBriefDigest,
  type BriefFormConfig,
  type BriefTarget,
} from '@nvg/shared/design';

/** Ô chữ tự do cũ (`legacy.*` của biểu mẫu) nằm ở `free_text.*` của digest. */
const LEGACY_TO_DIGEST: Readonly<Record<string, string>> = {
  'legacy.design_task': 'free_text.design_task',
  'legacy.functional_needs': 'free_text.functional_needs',
  'legacy.style_note': 'free_text.style_note',
  'legacy.site_condition': 'free_text.site_condition',
};

/** Lời gọi nào được đọc khảo sát hiện trạng. */
const SURVEY_TARGETS: readonly BriefTarget[] = ['plan'];

/** Đường trong digest của một câu biểu mẫu; `null` = câu không đi vào digest. */
function digestPath(path: string): string | null {
  if (path.startsWith('legacy.')) return LEGACY_TO_DIGEST[path] ?? null;
  if (path.startsWith('custom.')) return null; // câu tự thêm — xử lý theo nhãn
  return path;
}

function clearAt(target: Record<string, unknown>, path: string): void {
  const keys = path.split('.');
  let node: unknown = target;
  for (const key of keys.slice(0, -1)) {
    if (!node || typeof node !== 'object') return;
    node = (node as Record<string, unknown>)[key];
  }
  if (!node || typeof node !== 'object') return;
  const leaf = keys[keys.length - 1]!;
  if (!(leaf in (node as Record<string, unknown>))) return;
  const current = (node as Record<string, unknown>)[leaf];
  (node as Record<string, unknown>)[leaf] = Array.isArray(current) ? [] : null;
}

/** Digest chỉ còn những câu lời gọi `target` được thấy. */
export function digestFor(
  digest: AiBriefDigest,
  target: BriefTarget,
  form: BriefFormConfig = BRIEF_FORM,
): AiBriefDigest {
  const out = structuredClone(digest) as AiBriefDigest & Record<string, unknown>;
  const customTargets = new Map<string, readonly BriefTarget[]>();

  for (const section of form.sections) {
    for (const field of section.fields) {
      const targets = fieldTargets(section, field);
      if (field.path.startsWith('custom.')) {
        customTargets.set(field.label, targets);
        continue;
      }
      if (targets.includes(target)) continue;
      const path = digestPath(field.path);
      if (path && valueAtPath(out, path) !== undefined) clearAt(out, path);
    }
  }

  if (out.custom) {
    out.custom = out.custom.filter((answer) =>
      (customTargets.get(answer.label) ?? BRIEF_PART_TARGETS.mat_bang).includes(target),
    );
  }
  if (!SURVEY_TARGETS.includes(target)) out.survey = null;
  return out;
}

/**
 * Bản chữ gọn của digest đã cắt — bỏ mọi ô trống, để lời dẫn không mang hàng chục khoá `null`.
 * Dùng cho lời gọi đọc đầu bài dạng JSON (mặt đứng).
 */
export function compactDigest(digest: AiBriefDigest): Record<string, unknown> {
  const strip = (value: unknown): unknown => {
    if (value === null || value === undefined || value === '') return undefined;
    if (Array.isArray(value)) {
      const items = value.map(strip).filter((v) => v !== undefined);
      return items.length ? items : undefined;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => [k, strip(v)] as const)
        .filter(([, v]) => v !== undefined);
      return entries.length ? Object.fromEntries(entries) : undefined;
    }
    return value;
  };
  const { schema_version: _version, ...rest } = digest;
  return (strip(rest) as Record<string, unknown> | undefined) ?? {};
}
