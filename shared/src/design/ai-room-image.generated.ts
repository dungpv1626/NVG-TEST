/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-room-image.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiRoomImageSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiRoomImageSemver = z.infer<typeof aiRoomImageSemverSchema>;

export const aiRoomImageArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiRoomImageArtifactRef = z.infer<typeof aiRoomImageArtifactRefSchema>;

/**
 * Ảnh NỘI THẤT MỘT PHÒNG do MÔ HÌNH ẢNH vẽ thẳng từ ĐẦU BÀI, không cần mặt bằng (B3b «bộ ý tưởng cho khách», anh Dũng yêu cầu 30/10/2026).
 *
 * Khác ảnh mặt bằng có nội thất (T57, `ai-plan-sheet-image`): không có ảnh neo, vì chưa có mặt bằng để làm neo. Kiến trúc sư chọn MỘT phòng trong danh sách phòng đầu bài khai; lời dẫn ghép từ loại phòng, tầng, diện tích đầu bài, phong cách (`kb/style_catalogue.yaml`) và vài câu nếp sinh hoạt đã lược danh tính (hạng 2). Ảnh là HÌNH DUNG không gian theo phong cách — không đo được, không phải bố trí thật của một mặt bằng.
 *
 * MỘT artifact = MỘT tấm. Cạnh lineage `ai_room_image_draw` đi từ đầu bài đã xác nhận (`brief_ref`). Không đặt head: vẽ nhiều phòng, vẽ lại một phòng là chuyện bình thường; bộ sưu tập chọn lúc đọc theo cạnh lineage.
 */
export const aiRoomImageSchema = z
  .object({
    schema_version: aiRoomImageSemverSchema,
    /** Đầu bài đã xác nhận (`design_brief`) mà tấm này vẽ theo. Cũng là cạnh lineage `ai_room_image_draw`. */
    brief_ref: aiRoomImageArtifactRefSchema.describe(
      'Đầu bài đã xác nhận (`design_brief`) mà tấm này vẽ theo. Cũng là cạnh lineage `ai_room_image_draw`.',
    ),
    /** Phòng kiến trúc sư chọn, chép từ `required_spaces` của đầu bài lúc vẽ. */
    room: z
      .object({
        /** Khoá ổn định của phòng trong danh sách đầu bài (`<loại>:<tầng>:<thứ tự>`) — màn hình gom ảnh theo khoá này. */
        key: z
          .string()
          .max(64)
          .describe(
            'Khoá ổn định của phòng trong danh sách đầu bài (`<loại>:<tầng>:<thứ tự>`) — màn hình gom ảnh theo khoá này.',
          ),
        /** Mã loại phòng của `kb/room_vocabulary.yaml`. */
        type: z.string().max(40).describe('Mã loại phòng của `kb/room_vocabulary.yaml`.'),
        floor: z.number().int().gte(1).nullable(),
        area_m2: z.number().gte(0).nullable(),
      })
      .strict()
      .describe('Phòng kiến trúc sư chọn, chép từ `required_spaces` của đầu bài lúc vẽ.'),
    /** Mã phong cách đầu bài lúc vẽ. Rỗng khi đầu bài chưa chọn. */
    style: z
      .string()
      .max(40)
      .nullable()
      .describe('Mã phong cách đầu bài lúc vẽ. Rỗng khi đầu bài chưa chọn.')
      .optional(),
    /** Vị trí tệp ảnh trong kho nhị phân. */
    uri: z
      .string()
      .regex(/^(r2|supabase):\/\/.+/)
      .describe('Vị trí tệp ảnh trong kho nhị phân.'),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    width: z.number().int().gte(1).nullable().optional(),
    height: z.number().int().gte(1).nullable().optional(),
    /** Luôn `false`: ảnh do mô hình ảnh vẽ hiện NGUYÊN BẢN, không in dấu (T154). Đường dẫn gửi khách tự gắn nhãn của nó. */
    watermark_applied: z
      .literal(false)
      .describe(
        'Luôn `false`: ảnh do mô hình ảnh vẽ hiện NGUYÊN BẢN, không in dấu (T154). Đường dẫn gửi khách tự gắn nhãn của nó.',
      ),
    /** Trích đoạn lời dẫn ĐÃ GHÉP đã gửi đi — để đọc lại vì sao tấm này ra như vậy. */
    prompt_excerpt: z
      .string()
      .max(1200)
      .nullable()
      .describe('Trích đoạn lời dẫn ĐÃ GHÉP đã gửi đi — để đọc lại vì sao tấm này ra như vậy.')
      .optional(),
    generator: z
      .object({
        kind: z.enum(['ai']),
        provider: z.string().max(32),
        model: z.string().max(96),
        route: z.string().max(64),
        prompt_version: z.string().max(16),
        latency_ms: z.number().int().gte(0).nullable().optional(),
      })
      .strict(),
  })
  .strict()
  .describe(
    'Ảnh NỘI THẤT MỘT PHÒNG do MÔ HÌNH ẢNH vẽ thẳng từ ĐẦU BÀI, không cần mặt bằng (B3b «bộ ý tưởng cho khách», anh Dũng yêu cầu 30/10/2026).\n\nKhác ảnh mặt bằng có nội thất (T57, `ai-plan-sheet-image`): không có ảnh neo, vì chưa có mặt bằng để làm neo. Kiến trúc sư chọn MỘT phòng trong danh sách phòng đầu bài khai; lời dẫn ghép từ loại phòng, tầng, diện tích đầu bài, phong cách (`kb/style_catalogue.yaml`) và vài câu nếp sinh hoạt đã lược danh tính (hạng 2). Ảnh là HÌNH DUNG không gian theo phong cách — không đo được, không phải bố trí thật của một mặt bằng.\n\nMỘT artifact = MỘT tấm. Cạnh lineage `ai_room_image_draw` đi từ đầu bài đã xác nhận (`brief_ref`). Không đặt head: vẽ nhiều phòng, vẽ lại một phòng là chuyện bình thường; bộ sưu tập chọn lúc đọc theo cạnh lineage.',
  );

export type AiRoomImage = z.infer<typeof aiRoomImageSchema>;
