/**
 * Định mức diện tích theo loại phòng — mục `spaces` của `kb/space_norms.yaml` (T48, 16/09/2026).
 *
 * Bộ giải nội bộ đã đọc tệp này từ lâu (`design/program/norms.ts`), nhưng nhánh AI KHÔNG được import
 * mã bộ giải (`ai-independence.test.ts` canh). Bản đọc ở đây hẹp hơn hẳn: chỉ ba con số mỗi loại, đủ
 * cho hai việc của nhánh AI — gửi mô hình biết một phòng thường rộng bao nhiêu, và trừ điểm khi phòng
 * dựng ra nhỏ hơn mức tối thiểu hoặc lớn hơn mức tối đa.
 *
 * Haan chốt 16/09/2026: định mức nghề **chỉ trừ điểm**, không chặn — nó là thói quen nghề, không phải
 * quy chuẩn. Chỗ chặn duy nhất về diện tích vẫn là mức đầu bài khách khai (T45).
 */

import { load as parseYaml } from 'js-yaml';

export interface AreaNorm {
  min: number;
  target: number;
  max: number;
}

export class SpaceNormsError extends Error {
  readonly retryable = false;
}

/** Mã loại phòng → ba mức diện tích, m². Loại không khai đủ ba số bị bỏ qua, không đoán. */
export function parseAreaNorms(yaml: string): Map<string, AreaNorm> {
  const doc = parseYaml(yaml);
  if (!doc || typeof doc !== 'object') {
    throw new SpaceNormsError('kb/space_norms.yaml: tệp rỗng hoặc không phải YAML đối tượng.');
  }
  const spaces = (doc as { spaces?: unknown }).spaces;
  if (!spaces || typeof spaces !== 'object') {
    throw new SpaceNormsError('kb/space_norms.yaml: thiếu mục `spaces`.');
  }
  const out = new Map<string, AreaNorm>();
  for (const [type, raw] of Object.entries(spaces as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as { min_m2?: unknown; target_m2?: unknown; max_m2?: unknown };
    const numbers = [entry.min_m2, entry.target_m2, entry.max_m2];
    if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) continue;
    const [min, target, max] = numbers as [number, number, number];
    if (min <= 0 || max < min) {
      throw new SpaceNormsError(
        `kb/space_norms.yaml: loại "${type}" có mức diện tích vô lý (min ${min}, max ${max}).`,
      );
    }
    out.set(type, { min, target, max });
  }
  if (out.size === 0)
    throw new SpaceNormsError('kb/space_norms.yaml: mục `spaces` không có loại nào.');
  return out;
}
