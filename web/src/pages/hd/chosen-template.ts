/**
 * Mẫu Word đang chọn ở tab «Soạn hợp đồng» — `DocumentPanel` giữ lựa chọn, khối điều khoản (dựng ở `contract-detail`)
 * đọc để biết nhóm nào mẫu thật sự in ra (anh Dũng 27/10/2026: thêm / sửa điều khoản mà văn bản không đổi — vì mẫu
 * NVG viết sẵn câu chữ cho phần ấy, không có bảng để in dòng điều khoản). Ngoài tab ấy giá trị là `null`.
 */

import { createContext, useContext } from 'react';
import type { ContractTemplateRecord, TemplateFreeField } from '@/hooks/use-contract-templates';

export const ChosenTemplateContext = createContext<ContractTemplateRecord | null>(null);

export function useChosenTemplate(): ContractTemplateRecord | null {
  return useContext(ChosenTemplateContext);
}

/** Mẫu có in chỗ trống nào trong `keys` không — tìm cả trong khối phương án lồng nhau (`pa_N_x`). */
export function templatePrintsAny(
  tags: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  for (const [key, inner] of Object.entries(tags)) {
    if (keys.includes(key)) return true;
    if (
      inner &&
      typeof inner === 'object' &&
      templatePrintsAny(inner as Record<string, unknown>, keys)
    )
      return true;
  }
  return false;
}

/**
 * Điền một chỗ trống tự do của mẫu từ khối điều khoản — `DocumentPanel` cung cấp (cùng bộ giá trị đang lưu dần của
 * văn bản, `document-inputs.tsx`), ngoài tab «Soạn hợp đồng» là `null`.
 */
export interface FreeFieldFill {
  /** Giá trị đang có của chỗ trống tự do `key` (`o_N`) của mẫu đang chọn. */
  valueOf: (key: string) => string;
  fill: (key: string, value: string) => void;
}

export const FreeFieldFillContext = createContext<FreeFieldFill | null>(null);

export function useFreeFieldFill(): FreeFieldFill | null {
  return useContext(FreeFieldFillContext);
}

/**
 * Chỗ trống của mẫu nhận nội dung «Phạm vi công việc» khi mẫu không in bảng dòng phạm vi (anh Dũng 29/10/2026: ghi
 * phạm vi xong mà văn bản không đổi). Mẫu NVG viết «… nhận thi công các hạng mục: ……» ở điều «Nội dung và khối lượng
 * công việc» — lấy dải chấm đầu tiên của điều ấy nói tới hạng mục / công việc, ngoài mọi phương án, không phải ô chọn.
 */
export function scopeFreeField(fields: readonly TemplateFreeField[] | null | undefined) {
  return (
    fields?.find(
      (f) =>
        /phạm vi|nội dung|khối lượng/i.test(f.article) &&
        /hạng mục|công việc/i.test(f.before) &&
        !f.option &&
        !f.choices?.length &&
        !/loại trừ/i.test(f.before),
    ) ?? null
  );
}
