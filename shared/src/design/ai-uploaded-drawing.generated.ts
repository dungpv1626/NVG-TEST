/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-uploaded-drawing.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

/**
 * Bản vẽ KỸ SƯ tải lên làm nguồn cho mô hình ảnh (T114 Đợt 4, 03/10/2026 — Haan: ảnh mặt bằng có nội thất và ảnh mặt đứng có vật liệu «có 2 cách: dựa trên bản vẽ do AI tạo hoặc bản vẽ do kỹ sư chỉnh sửa (hoặc tự tạo)»).
 *
 * Ảnh, không phải DXF (Haan chọn): kỹ sư xuất từ AutoCAD ra PNG/JPG/PDF. Trình duyệt chuẩn hoá về PNG đúng một trong ba khung mô hình ảnh nhận (1024×1024, 1536×1024, 1024×1536) — PDF dựng trang đã chọn, ảnh được đệm nền trắng, không kéo méo. Máy chủ kiểm lại khung.
 *
 * KHÔNG có toạ độ, phòng hay số đo: chương trình không đọc nét vẽ. Mô hình ảnh đọc trực tiếp; số trên ảnh do mô hình viết lại nên KHÔNG đo được, như mọi ảnh của nhánh AI.
 *
 * ⚠️ Dữ liệu hạng 1: bản vẽ thật thường mang khung tên có tên chủ nhà, địa chỉ, mã hồ sơ (T12). `identity_cleared` là lời xác nhận của người tải lên rằng đã cắt khung tên — máy chủ từ chối khi thiếu; tên tệp gốc cố ý KHÔNG lưu vì hay mang tên khách.
 *
 * Ảnh lưu trong bucket `design-renders`; trình duyệt đọc qua endpoint có kiểm quyền.
 */
export const aiUploadedDrawingSchema = z
  .object({
    schema_version: z.string().regex(/^\d+\.\d+\.\d+$/),
    /** Mặt bằng một tầng, hay mặt đứng mặt tiền. */
    drawing: z.enum(['plan', 'facade']).describe('Mặt bằng một tầng, hay mặt đứng mặt tiền.'),
    /** Tầng của mặt bằng. `null` với mặt đứng. */
    level: z.number().int().gte(1).nullable().describe('Tầng của mặt bằng. `null` với mặt đứng.'),
    uri: z.string().regex(/^(r2|supabase):\/\/.+/),
    mime: z.enum(['image/png']),
    width: z.union([z.literal(1024), z.literal(1536)]),
    height: z.union([z.literal(1024), z.literal(1536)]),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().gte(1),
    /** Ghi chú của kỹ sư để nhận ra bản vẽ trong danh sách («sau khi sửa WC tầng 2»). KHÔNG gửi cho mô hình. */
    note: z
      .string()
      .max(200)
      .nullable()
      .describe(
        'Ghi chú của kỹ sư để nhận ra bản vẽ trong danh sách («sau khi sửa WC tầng 2»). KHÔNG gửi cho mô hình.',
      )
      .optional(),
    /** Người tải lên xác nhận đã bỏ khung tên và mọi thông tin chủ nhà khỏi ảnh. */
    identity_cleared: z
      .literal(true)
      .describe('Người tải lên xác nhận đã bỏ khung tên và mọi thông tin chủ nhà khỏi ảnh.'),
  })
  .strict()
  .describe(
    'Bản vẽ KỸ SƯ tải lên làm nguồn cho mô hình ảnh (T114 Đợt 4, 03/10/2026 — Haan: ảnh mặt bằng có nội thất và ảnh mặt đứng có vật liệu «có 2 cách: dựa trên bản vẽ do AI tạo hoặc bản vẽ do kỹ sư chỉnh sửa (hoặc tự tạo)»).\n\nẢnh, không phải DXF (Haan chọn): kỹ sư xuất từ AutoCAD ra PNG/JPG/PDF. Trình duyệt chuẩn hoá về PNG đúng một trong ba khung mô hình ảnh nhận (1024×1024, 1536×1024, 1024×1536) — PDF dựng trang đã chọn, ảnh được đệm nền trắng, không kéo méo. Máy chủ kiểm lại khung.\n\nKHÔNG có toạ độ, phòng hay số đo: chương trình không đọc nét vẽ. Mô hình ảnh đọc trực tiếp; số trên ảnh do mô hình viết lại nên KHÔNG đo được, như mọi ảnh của nhánh AI.\n\n⚠️ Dữ liệu hạng 1: bản vẽ thật thường mang khung tên có tên chủ nhà, địa chỉ, mã hồ sơ (T12). `identity_cleared` là lời xác nhận của người tải lên rằng đã cắt khung tên — máy chủ từ chối khi thiếu; tên tệp gốc cố ý KHÔNG lưu vì hay mang tên khách.\n\nẢnh lưu trong bucket `design-renders`; trình duyệt đọc qua endpoint có kiểm quyền.',
  );

export type AiUploadedDrawing = z.infer<typeof aiUploadedDrawingSchema>;
