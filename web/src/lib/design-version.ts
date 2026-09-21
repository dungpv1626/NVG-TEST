/**
 * Phát hiện giao diện và dịch vụ thiết kế đang chạy HAI PHIÊN BẢN hợp đồng dữ liệu khác nhau.
 *
 * Vì sao cần: `web/` và `workers/` là hai Worker riêng, phát hành bằng hai lệnh riêng, nên
 * chúng trôi khỏi nhau được. Chuyện đó vô hại với phần lớn module — nhưng Module Thiết kế
 * lưu artifact BẤT BIẾN và kiểm hợp đồng cả khi ĐỌC LẠI, nên một bản Worker cũ hơn hợp đồng
 * đã ghi ra artifact thì không đọc nổi chính kho của mình.
 *
 * Đã xảy ra ngày 21/09/2026: giao diện `nvg` dựng 20/09 gọi `nvg-api` tải lên 19/09, và tab
 * «AI Design» chỉ hiện một câu lỗi kiểm kiểu bằng tiếng Anh kèm nút «Thử lại» không bao giờ
 * thoát được — vì chẳng có lượt sinh nào để thử lại, chỗ hỏng nằm ở lượt ĐỌC.
 *
 * Cách đo: cả hai bên nhúng `CONTRACTS_FINGERPRINT` (băm nội dung `contracts/`) lúc dựng;
 * Worker trả nó ở header `X-NVG-Contracts` của mọi phản hồi. Không tốn lượt gọi nào thêm.
 *
 * Chỉ BÁO, không chặn: một sửa đổi hợp đồng không liên quan cũng làm dấu vân tay đổi, mà khoá
 * cả module vì một dòng mô tả trong JSON Schema thì hại hơn lợi.
 */

import { useSyncExternalStore } from 'react';
import { CONTRACTS_FINGERPRINT } from '@nvg/shared/design';

export interface DesignVersionSkew {
  /** Dấu vân tay của bản giao diện đang chạy. */
  readonly ui: string;
  /** Dấu vân tay của dịch vụ vừa trả lời. */
  readonly api: string;
}

let skew: DesignVersionSkew | null = null;
const listeners = new Set<() => void>();

/**
 * Ghi nhận dấu vân tay ở phản hồi vừa nhận; trả về `true` khi nó lệch với bản giao diện.
 *
 * Không có header KHÔNG phải là lệch: một phản hồi lấy từ bộ đệm của trình duyệt, hay một
 * proxy lược header, đều dẫn tới đó — và báo lệch khi chưa đo được gì là cách chắc chắn để
 * người dùng học cách bỏ qua cảnh báo.
 */
export function noteContractsHeader(value: string | null): boolean {
  const next =
    value && value !== CONTRACTS_FINGERPRINT ? { ui: CONTRACTS_FINGERPRINT, api: value } : null;
  if (next?.api !== skew?.api) {
    skew = next;
    for (const listener of listeners) listener();
  }
  return next !== null;
}

/** Câu hiện trên màn hình. Nêu việc gì không dùng được và ai xử lý được (CGD 5.5). */
export const VERSION_SKEW_MESSAGE =
  'Giao diện và dịch vụ thiết kế đang chạy hai phiên bản khác nhau, nên một số bản ghi có thể ' +
  'không mở được. Báo Quản trị hệ thống phát hành lại cả hai; các phần khác của hồ sơ vẫn dùng ' +
  'được bình thường.';

export function useDesignVersionSkew(): DesignVersionSkew | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DesignVersionSkew | null {
  return skew;
}

/** Đặt lại giữa các phép thử — không dùng trong mã chạy thật. */
export function resetDesignVersionSkew(): void {
  skew = null;
  for (const listener of listeners) listener();
}
