/**
 * Mẫu Word đang chọn ở tab «Soạn hợp đồng» — `DocumentPanel` giữ lựa chọn, khối điều khoản (dựng ở `contract-detail`)
 * đọc để biết nhóm nào mẫu thật sự in ra (anh Dũng 27/10/2026: thêm / sửa điều khoản mà văn bản không đổi — vì mẫu
 * NVG viết sẵn câu chữ cho phần ấy, không có bảng để in dòng điều khoản). Ngoài tab ấy giá trị là `null`.
 */

import { createContext, useContext } from 'react';
import type { ContractTemplateRecord } from '@/hooks/use-contract-templates';

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
