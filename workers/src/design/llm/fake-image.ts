/**
 * Client ẢNH GIẢ LẬP — trả một tấm PNG mẫu, không gọi nhà cung cấp nào, không tốn tiền (B3b, 30/10/2026).
 *
 * Cùng hàng rào với khối AI chung (`workers/src/ai/index.ts`, chủ dự án chốt «AI làm bằng giả lập trước»,
 * CLAUDE.md 6.4): `AI_FAKE=1` hoặc danh sách có tên chức năng (vd `room_image`) — CHỈ đặt tay trong
 * `workers/.dev.vars`, không khai trong `wrangler.jsonc`. Lượt giả lập vẫn ghi một dòng `design_ai_call`
 * (nhà cung cấp `gia_lap`, không giá) để màn hình và sổ chi phí chạy trọn đường như lượt thật.
 */

import type { DesignEnv } from '../env';
import type { AiImageClient } from './text-client';

/** Nhà cung cấp ghi vào nhật ký cho lượt giả lập — `costUsd` của nó luôn rỗng (không khai giá). */
export const FAKE_PROVIDER = 'gia_lap';

/** PNG 64 × 48 điểm ảnh, một màu be nhạt — đủ để đi trọn đường lưu kho, đọc cỡ khung, hiện lên màn hình. */
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAARElEQVR42u3PMQ0AAAgDsPnXyMmBDCzwkjSpgWa6XouAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwNUCgUHh0jWW9RMAAAAASUVORK5CYII=';

/** Chức năng `name` có đang chạy GIẢ LẬP không — `AI_FAKE=1` hoặc danh sách cách nhau bởi dấu phẩy. */
export function aiFakeOn(env: Pick<DesignEnv, 'AI_FAKE'>, name: string): boolean {
  const raw = (env.AI_FAKE ?? '').trim();
  if (raw === '1') return true;
  return raw
    .split(',')
    .map((v) => v.trim())
    .includes(name);
}

export function fakeImageClient(): AiImageClient {
  return {
    async generateImage(route) {
      return {
        mimeType: 'image/png',
        dataBase64: SAMPLE_PNG_BASE64,
        provider: FAKE_PROVIDER,
        model: `gia-lap:${route}`.slice(0, 96),
        usage: { inputTokens: null, outputTokens: null },
        latencyMs: 0,
      };
    },
  };
}
