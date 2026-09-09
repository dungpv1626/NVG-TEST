/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-floor-plan-proposal.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiFloorPlanProposalSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiFloorPlanProposalSemver = z.infer<typeof aiFloorPlanProposalSemverSchema>;

export const aiFloorPlanProposalArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiFloorPlanProposalArtifactRef = z.infer<typeof aiFloorPlanProposalArtifactRefSchema>;

export const aiFloorPlanProposalSpaceIdSchema = z.string().regex(/^[a-z0-9_]+$/);

export type AiFloorPlanProposalSpaceId = z.infer<typeof aiFloorPlanProposalSpaceIdSchema>;

/**
 * Mặt bằng do MÔ HÌNH đề xuất — đầu ra của nhánh AI, một DÒNG RIÊNG độc lập với bộ giải nội bộ (T10/T11/T14).
 *
 * Theo T14 (09/09/2026): mô hình chỉ nhận ĐẦU BÀI, không nhận ngưỡng quy chuẩn; kết quả KHÔNG đi qua Container, KHÔNG trở thành `floor-plan` chuẩn, và KHÔNG vào luồng phát hành. Nó là đề xuất để kiến trúc sư đọc — dùng lại được thì vẽ lại bằng bộ giải hoặc bằng tay.
 *
 * Đây là chỗ nới có kiểm soát thứ hai của nguyên tắc bất biến 2 (CLAUDE.md 8.2): mô hình đưa ra TOẠ ĐỘ chữ nhật theo mét. Ranh giới nằm ở chỗ toạ độ ấy không bao giờ được dựng thành tường, cửa hay khối ba chiều, và không có đường nào để nó đi vào hồ sơ.
 *
 * Sau khi mô hình trả về, Worker đối chiếu `rules/base/` (quy chuẩn QUỐC GIA — QCVN 01:2021/BXD, TCVN; `locality/` KHÔNG dùng ở đây) và sinh CẢNH BÁO cho chỗ lệch. Cảnh báo không chặn kết quả và không tự sửa toạ độ.
 *
 * Mô hình KHÔNG khai tường, không khai offset cửa. `connections` là TÔPÔ — phòng nào thông phòng nào — để bản vẽ đề xuất chỉ ra lối đi, không phải để dựng cửa.
 *
 * Hệ toạ độ: gốc ở góc trước-trái lô đất, `x` sang phải, `y` vào sâu, đơn vị mét (giống `floor-plan`). Chữ nhật là KÍCH THƯỚC LỌT LÒNG của phòng, không phải tim tường — nhờ vậy cảnh báo `min_dimension` so sánh thẳng với ngưỡng quy chuẩn mà không phải trừ bề dày tường.
 */
export const aiFloorPlanProposalSchema = z
  .object({
    schema_version: aiFloorPlanProposalSemverSchema,
    /** Chương trình không gian mà mặt bằng này bám theo — artifact của chính nhánh AI, hoặc bản do bộ giải lập nếu người dùng đã chốt bản đó. Chỉ dùng để lấy danh sách phòng và mã `id`. */
    program_ref: aiFloorPlanProposalArtifactRefSchema.describe(
      'Chương trình không gian mà mặt bằng này bám theo — artifact của chính nhánh AI, hoặc bản do bộ giải lập nếu người dùng đã chốt bản đó. Chỉ dùng để lấy danh sách phòng và mã `id`.',
    ),
    /** Mã phương án của nhánh AI: AI-A, AI-B, AI-C. Tiền tố phân biệt với A/B/C của bộ giải, để hai nguồn không đè nhãn của nhau trong bảng so sánh. */
    variant_id: z
      .string()
      .regex(/^AI-[A-Z]$/)
      .describe(
        'Mã phương án của nhánh AI: AI-A, AI-B, AI-C. Tiền tố phân biệt với A/B/C của bộ giải, để hai nguồn không đè nhãn của nhau trong bảng so sánh.',
      ),
    /** Tên phương án bằng tiếng Việt, mô tả CẤU TRÚC (« Lõi thang giữa, bếp thông phòng ăn »), không phải số. */
    variant_label: z
      .string()
      .max(120)
      .describe(
        'Tên phương án bằng tiếng Việt, mô tả CẤU TRÚC (« Lõi thang giữa, bếp thông phòng ăn »), không phải số.',
      ),
    /** Ý đồ bố cục mà phương án này theo đuổi — Worker đưa vào lời dẫn để ba phương án khác nhau về cấu trúc, không phải khác vài chục xăng-ti-mét. */
    strategy: z
      .string()
      .max(200)
      .nullable()
      .describe(
        'Ý đồ bố cục mà phương án này theo đuổi — Worker đưa vào lời dẫn để ba phương án khác nhau về cấu trúc, không phải khác vài chục xăng-ti-mét.',
      )
      .optional(),
    levels: z
      .array(
        z
          .object({
            level: z.number().int().gte(1),
            rooms: z
              .array(
                z
                  .object({
                    /** Mã không gian LẤY TỪ chương trình không gian (`space_program.spaces[].id`). Không đặt mã mới. */
                    id: aiFloorPlanProposalSpaceIdSchema.describe(
                      'Mã không gian LẤY TỪ chương trình không gian (`space_program.spaces[].id`). Không đặt mã mới.',
                    ),
                    x0_m: z.number(),
                    y0_m: z.number(),
                    x1_m: z.number(),
                    y1_m: z.number(),
                  })
                  .strict(),
              )
              .min(1),
            voids: z
              .array(
                z
                  .object({
                    id: aiFloorPlanProposalSpaceIdSchema.optional(),
                    kind: z.enum(['lightwell', 'courtyard', 'atrium']),
                    x0_m: z.number(),
                    y0_m: z.number(),
                    x1_m: z.number(),
                    y1_m: z.number(),
                  })
                  .strict(),
              )
              .optional(),
            /** Phòng nào thông sang phòng nào trên tầng này — tôpô, không toạ độ. */
            connections: z
              .array(
                z
                  .object({
                    a: aiFloorPlanProposalSpaceIdSchema,
                    b: aiFloorPlanProposalSpaceIdSchema,
                  })
                  .strict(),
              )
              .max(60)
              .describe('Phòng nào thông sang phòng nào trên tầng này — tôpô, không toạ độ.')
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    /** Vì sao bố cục như vậy, tiếng Việt, 2–5 câu. Hiện thẳng cho kiến trúc sư. */
    rationale: z
      .string()
      .max(1500)
      .describe('Vì sao bố cục như vậy, tiếng Việt, 2–5 câu. Hiện thẳng cho kiến trúc sư.'),
    /**
     * Tờ bản vẽ mặt bằng do CHÍNH mô hình vẽ, dạng SVG, một tệp cho toàn bộ đề xuất (các tầng xếp cạnh nhau). Vẽ theo đúng toạ độ đã khai ở `levels[].rooms`: tường có bề dày, cửa có cánh mở, chuỗi kích thước, tên phòng và diện tích bằng tiếng Việt, trục và cao độ.
     *
     * ⚠️ Đây là bản vẽ của MÔ HÌNH, không phải của bộ giải: nó không đi qua `build_walls_and_openings` và không được kiểm hình học. Cảnh báo quy chuẩn đo trên `levels[].rooms`, không đo trên tệp này — hai thứ có thể lệch nhau, và màn hình phải nói ra điều đó.
     *
     * ⚠️ Nội dung do mô hình sinh nên KHÔNG TIN ĐƯỢC về mặt an toàn: Worker lược thẻ kịch bản, thuộc tính sự kiện và mọi tham chiếu ra ngoài trước khi lưu, và trình duyệt hiển thị nó qua `<img>` để trình duyệt không chạy kịch bản trong đó. Xem `ai/svg-guard.ts`.
     */
    svg: z
      .string()
      .max(400000)
      .describe(
        'Tờ bản vẽ mặt bằng do CHÍNH mô hình vẽ, dạng SVG, một tệp cho toàn bộ đề xuất (các tầng xếp cạnh nhau). Vẽ theo đúng toạ độ đã khai ở `levels[].rooms`: tường có bề dày, cửa có cánh mở, chuỗi kích thước, tên phòng và diện tích bằng tiếng Việt, trục và cao độ.\n\n⚠️ Đây là bản vẽ của MÔ HÌNH, không phải của bộ giải: nó không đi qua `build_walls_and_openings` và không được kiểm hình học. Cảnh báo quy chuẩn đo trên `levels[].rooms`, không đo trên tệp này — hai thứ có thể lệch nhau, và màn hình phải nói ra điều đó.\n\n⚠️ Nội dung do mô hình sinh nên KHÔNG TIN ĐƯỢC về mặt an toàn: Worker lược thẻ kịch bản, thuộc tính sự kiện và mọi tham chiếu ra ngoài trước khi lưu, và trình duyệt hiển thị nó qua `<img>` để trình duyệt không chạy kịch bản trong đó. Xem `ai/svg-guard.ts`.',
      ),
  })
  .strict()
  .describe(
    'Mặt bằng do MÔ HÌNH đề xuất — đầu ra của nhánh AI, một DÒNG RIÊNG độc lập với bộ giải nội bộ (T10/T11/T14).\n\nTheo T14 (09/09/2026): mô hình chỉ nhận ĐẦU BÀI, không nhận ngưỡng quy chuẩn; kết quả KHÔNG đi qua Container, KHÔNG trở thành `floor-plan` chuẩn, và KHÔNG vào luồng phát hành. Nó là đề xuất để kiến trúc sư đọc — dùng lại được thì vẽ lại bằng bộ giải hoặc bằng tay.\n\nĐây là chỗ nới có kiểm soát thứ hai của nguyên tắc bất biến 2 (CLAUDE.md 8.2): mô hình đưa ra TOẠ ĐỘ chữ nhật theo mét. Ranh giới nằm ở chỗ toạ độ ấy không bao giờ được dựng thành tường, cửa hay khối ba chiều, và không có đường nào để nó đi vào hồ sơ.\n\nSau khi mô hình trả về, Worker đối chiếu `rules/base/` (quy chuẩn QUỐC GIA — QCVN 01:2021/BXD, TCVN; `locality/` KHÔNG dùng ở đây) và sinh CẢNH BÁO cho chỗ lệch. Cảnh báo không chặn kết quả và không tự sửa toạ độ.\n\nMô hình KHÔNG khai tường, không khai offset cửa. `connections` là TÔPÔ — phòng nào thông phòng nào — để bản vẽ đề xuất chỉ ra lối đi, không phải để dựng cửa.\n\nHệ toạ độ: gốc ở góc trước-trái lô đất, `x` sang phải, `y` vào sâu, đơn vị mét (giống `floor-plan`). Chữ nhật là KÍCH THƯỚC LỌT LÒNG của phòng, không phải tim tường — nhờ vậy cảnh báo `min_dimension` so sánh thẳng với ngưỡng quy chuẩn mà không phải trừ bề dày tường.',
  );

export type AiFloorPlanProposal = z.infer<typeof aiFloorPlanProposalSchema>;
