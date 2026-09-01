/**
 * SINH TỰ ĐỘNG TỪ `contracts/site-boundary-extraction.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const siteBoundaryExtractionSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type SiteBoundaryExtractionSemver = z.infer<typeof siteBoundaryExtractionSemverSchema>;

export const siteBoundaryExtractionEdgeSchema = z
  .object({
    index: z.number().int().gte(0).lte(23),
    /** Chữ/số NGUYÊN VĂN ghi trên ảnh cho cạnh này, ví dụ "12.45" hoặc "12,45m" — KHÔNG quy chuẩn hoá (cùng lý lẽ `layers_unmapped`, CLAUDE.md 8.7: quy ước đọc là dữ liệu người xác nhận cần thấy nguyên văn, không phải việc của bước trích xuất). */
    label_raw: z
      .string()
      .nullable()
      .describe(
        'Chữ/số NGUYÊN VĂN ghi trên ảnh cho cạnh này, ví dụ "12.45" hoặc "12,45m" — KHÔNG quy chuẩn hoá (cùng lý lẽ `layers_unmapped`, CLAUDE.md 8.7: quy ước đọc là dữ liệu người xác nhận cần thấy nguyên văn, không phải việc của bước trích xuất).',
      )
      .optional(),
    /** Chiều dài cạnh, quy về mét. */
    length_m: z.number().lte(500).gt(0).describe('Chiều dài cạnh, quy về mét.'),
    /** labeled: đọc thẳng số ghi trên ảnh. scaled: suy từ thước tỷ lệ vẽ trên ảnh. estimated: không có căn cứ số, mô hình ước lượng tỷ lệ so với các cạnh khác. */
    length_source: z
      .enum(['labeled', 'scaled', 'estimated'])
      .describe(
        'labeled: đọc thẳng số ghi trên ảnh. scaled: suy từ thước tỷ lệ vẽ trên ảnh. estimated: không có căn cứ số, mô hình ước lượng tỷ lệ so với các cạnh khác.',
      ),
    /** Góc quay NGOÀI sang cạnh kế tiếp (dương = quay trái/ngược chiều kim đồng hồ). `null` khi ảnh không đủ căn cứ để đọc — lớp gọi (`polygonFromEdges`) tự chia đều phần góc còn thiếu, KHÔNG suy đoán ở đây. */
    turn_deg: z
      .number()
      .gte(-180)
      .lte(180)
      .nullable()
      .describe(
        'Góc quay NGOÀI sang cạnh kế tiếp (dương = quay trái/ngược chiều kim đồng hồ). `null` khi ảnh không đủ căn cứ để đọc — lớp gọi (`polygonFromEdges`) tự chia đều phần góc còn thiếu, KHÔNG suy đoán ở đây.',
      ),
    /** labeled: có số đo góc ghi trên ảnh. right_angle_assumed: ảnh vẽ như góc vuông, không ghi số. estimated: mô hình ước lượng từ hình vẽ tay không theo tỷ lệ. unknown: không có căn cứ, khớp với `turn_deg: null`. */
    turn_source: z
      .enum(['labeled', 'right_angle_assumed', 'estimated', 'unknown'])
      .describe(
        'labeled: có số đo góc ghi trên ảnh. right_angle_assumed: ảnh vẽ như góc vuông, không ghi số. estimated: mô hình ước lượng từ hình vẽ tay không theo tỷ lệ. unknown: không có căn cứ, khớp với `turn_deg: null`.',
      ),
    /** Ghi chú giáp ranh nguyên văn trên ảnh cho cạnh này, ví dụ "giáp hẻm 2m", "giáp đất ông Nguyễn Văn A". */
    boundary_label: z
      .string()
      .nullable()
      .describe(
        'Ghi chú giáp ranh nguyên văn trên ảnh cho cạnh này, ví dụ "giáp hẻm 2m", "giáp đất ông Nguyễn Văn A".',
      )
      .optional(),
    /** Độ tin cậy của RIÊNG cạnh này — khác `closed_shape_confidence` (đánh giá cả hình). Giao diện gắn cảnh báo lên đúng đỉnh có cạnh `confidence: low`. */
    confidence: z
      .enum(['high', 'medium', 'low'])
      .describe(
        'Độ tin cậy của RIÊNG cạnh này — khác `closed_shape_confidence` (đánh giá cả hình). Giao diện gắn cảnh báo lên đúng đỉnh có cạnh `confidence: low`.',
      ),
  })
  .strict();

export type SiteBoundaryExtractionEdge = z.infer<typeof siteBoundaryExtractionEdgeSchema>;

export const siteBoundaryExtractionWarningSchema = z
  .object({
    code: z.string(),
    detail: z.string(),
  })
  .strict();

export type SiteBoundaryExtractionWarning = z.infer<typeof siteBoundaryExtractionWarningSchema>;

export const siteBoundaryExtractionVertexCoordinateSchema = z
  .object({
    /** Số hiệu góc thửa đúng như ghi trong bảng (giữ nguyên thứ tự bảng, không tự sắp xếp lại — đây chính là chiều đi quanh ranh giới). */
    index: z
      .number()
      .int()
      .gte(0)
      .lte(23)
      .describe(
        'Số hiệu góc thửa đúng như ghi trong bảng (giữ nguyên thứ tự bảng, không tự sắp xếp lại — đây chính là chiều đi quanh ranh giới).',
      ),
    /** Số hiệu góc thửa NGUYÊN VĂN ghi trong bảng, ví dụ "1", "2", "10" — chỉ để đối chiếu khi người dùng xem lại. */
    label_raw: z
      .string()
      .nullable()
      .describe(
        'Số hiệu góc thửa NGUYÊN VĂN ghi trong bảng, ví dụ "1", "2", "10" — chỉ để đối chiếu khi người dùng xem lại.',
      )
      .optional(),
    /** Cột X (hoặc tương đương) trong bảng, chép đúng số đã in — không làm tròn, không quy đổi đơn vị, không trừ đi giá trị nào. */
    x: z
      .number()
      .describe(
        'Cột X (hoặc tương đương) trong bảng, chép đúng số đã in — không làm tròn, không quy đổi đơn vị, không trừ đi giá trị nào.',
      ),
    /** Cột Y (hoặc tương đương) trong bảng, chép đúng số đã in — không làm tròn, không quy đổi đơn vị, không trừ đi giá trị nào. */
    y: z
      .number()
      .describe(
        'Cột Y (hoặc tương đương) trong bảng, chép đúng số đã in — không làm tròn, không quy đổi đơn vị, không trừ đi giá trị nào.',
      ),
  })
  .strict();

export type SiteBoundaryExtractionVertexCoordinate = z.infer<
  typeof siteBoundaryExtractionVertexCoordinateSchema
>;

/** Gemini đọc ảnh trích lục/sổ đỏ ra CẤU TRÚC — không tự tính toán hình học (nguyên tắc bất biến 2, CLAUDE.md 8.2: mô hình ngôn ngữ không sinh toạ độ hay kích thước bằng suy luận, chỉ sinh cấu trúc/chép chữ số đã in). Hai nguồn có thể có trên cùng một ảnh: `edges` (đọc số ghi trên hình vẽ sơ đồ, có thể ước lượng) và `vertex_coordinates` (chép nguyên văn một bảng toạ độ in sẵn, nếu ảnh có — chính xác hơn hẳn vì không cần suy luận gì). Lớp gọi ưu tiên tuyệt đối `vertex_coordinates` khi có ≥3 điểm; ngược lại dùng `polygonFromEdges` (@nvg/shared/design) đi bộ theo `edges`. Cả hai đều dựng `DesignBrief.site.boundary_m`. Không phải artifact bất biến: kết quả chỉ là dữ liệu NHÁP điền vào biểu mẫu Đầu bài, người dùng xem lại/sửa/lưu như mọi trường khác. */
export const siteBoundaryExtractionSchema = z
  .object({
    schema_version: siteBoundaryExtractionSemverSchema,
    /** Cạnh giáp đường/lộ giới, do mô hình nhận diện qua chữ ghi trên ảnh (vd. "lộ giới", "đường đi chung"). `null` nếu ảnh không ghi rõ — lớp gọi mặc định cạnh 0. */
    frontage_edge_index: z
      .number()
      .int()
      .gte(0)
      .nullable()
      .describe(
        'Cạnh giáp đường/lộ giới, do mô hình nhận diện qua chữ ghi trên ảnh (vd. "lộ giới", "đường đi chung"). `null` nếu ảnh không ghi rõ — lớp gọi mặc định cạnh 0.',
      )
      .optional(),
    /** Đánh số liên tục theo MỘT chiều duy nhất quanh ranh giới, bắt đầu từ cạnh giáp đường khi xác định được. Cạnh `i` nối đỉnh `i` tới đỉnh `i+1`. Vẫn phải điền đủ ngay cả khi `vertex_coordinates` đã có — lớp gọi chỉ dùng phần `boundary_label`/`length_source` của mảng này làm tham khảo khi đã có toạ độ, không dùng để dựng hình trong trường hợp đó. */
    edges: z
      .array(siteBoundaryExtractionEdgeSchema)
      .min(3)
      .max(24)
      .describe(
        'Đánh số liên tục theo MỘT chiều duy nhất quanh ranh giới, bắt đầu từ cạnh giáp đường khi xác định được. Cạnh `i` nối đỉnh `i` tới đỉnh `i+1`. Vẫn phải điền đủ ngay cả khi `vertex_coordinates` đã có — lớp gọi chỉ dùng phần `boundary_label`/`length_source` của mảng này làm tham khảo khi đã có toạ độ, không dùng để dựng hình trong trường hợp đó.',
      ),
    /** Toạ độ TỪNG ĐỈNH chép NGUYÊN VĂN từ bảng số liệu in trên ảnh (ví dụ "BẢNG KÊ TOẠ ĐỘ", "BẢNG KÊ GÓC THỬA" — cột X/Y hoặc tương đương) khi ảnh CÓ bảng này. Đây là việc ĐỌC CHỮ SỐ đã in, không phải tính toán hay ước lượng — không suy ra chiều dài/góc, không làm tròn, không đổi đơn vị. Để RỖNG khi ảnh không có bảng toạ độ (chỉ có hình vẽ sơ đồ). Khi có ≥3 điểm, lớp gọi dùng THẲNG mảng này để dựng ranh giới — chính xác tuyệt đối, bỏ qua toàn bộ phần suy góc/chia đều của `edges`. */
    vertex_coordinates: z
      .array(siteBoundaryExtractionVertexCoordinateSchema)
      .max(24)
      .describe(
        'Toạ độ TỪNG ĐỈNH chép NGUYÊN VĂN từ bảng số liệu in trên ảnh (ví dụ "BẢNG KÊ TOẠ ĐỘ", "BẢNG KÊ GÓC THỬA" — cột X/Y hoặc tương đương) khi ảnh CÓ bảng này. Đây là việc ĐỌC CHỮ SỐ đã in, không phải tính toán hay ước lượng — không suy ra chiều dài/góc, không làm tròn, không đổi đơn vị. Để RỖNG khi ảnh không có bảng toạ độ (chỉ có hình vẽ sơ đồ). Khi có ≥3 điểm, lớp gọi dùng THẲNG mảng này để dựng ranh giới — chính xác tuyệt đối, bỏ qua toàn bộ phần suy góc/chia đều của `edges`.',
      )
      .optional(),
    /** Đánh giá tổng thể của mô hình về việc danh sách cạnh có khép kín thành một hình hay không. Chỉ để cảnh báo — lớp gọi luôn tự tính độ khép kín thật bằng công thức (`polygonFromEdges`), không rẽ nhánh theo trường này. */
    closed_shape_confidence: z
      .enum(['high', 'medium', 'low'])
      .describe(
        'Đánh giá tổng thể của mô hình về việc danh sách cạnh có khép kín thành một hình hay không. Chỉ để cảnh báo — lớp gọi luôn tự tính độ khép kín thật bằng công thức (`polygonFromEdges`), không rẽ nhánh theo trường này.',
      ),
    /** Cảnh báo mức tài liệu — ảnh mờ, thiếu góc, chữ viết tay khó đọc… Cùng hình dạng `{code, detail}` với `CadExtraction.warnings`. */
    warnings: z
      .array(siteBoundaryExtractionWarningSchema)
      .describe(
        'Cảnh báo mức tài liệu — ảnh mờ, thiếu góc, chữ viết tay khó đọc… Cùng hình dạng `{code, detail}` với `CadExtraction.warnings`.',
      )
      .optional(),
    /** Ghi chú tự do của mô hình khi có điều đáng nói nhưng không thuộc field nào ở trên — ví dụ ảnh có hai thửa, chỉ đọc thửa được khoanh. */
    notes: z
      .string()
      .nullable()
      .describe(
        'Ghi chú tự do của mô hình khi có điều đáng nói nhưng không thuộc field nào ở trên — ví dụ ảnh có hai thửa, chỉ đọc thửa được khoanh.',
      )
      .optional(),
  })
  .strict()
  .describe(
    'Gemini đọc ảnh trích lục/sổ đỏ ra CẤU TRÚC — không tự tính toán hình học (nguyên tắc bất biến 2, CLAUDE.md 8.2: mô hình ngôn ngữ không sinh toạ độ hay kích thước bằng suy luận, chỉ sinh cấu trúc/chép chữ số đã in). Hai nguồn có thể có trên cùng một ảnh: `edges` (đọc số ghi trên hình vẽ sơ đồ, có thể ước lượng) và `vertex_coordinates` (chép nguyên văn một bảng toạ độ in sẵn, nếu ảnh có — chính xác hơn hẳn vì không cần suy luận gì). Lớp gọi ưu tiên tuyệt đối `vertex_coordinates` khi có ≥3 điểm; ngược lại dùng `polygonFromEdges` (@nvg/shared/design) đi bộ theo `edges`. Cả hai đều dựng `DesignBrief.site.boundary_m`. Không phải artifact bất biến: kết quả chỉ là dữ liệu NHÁP điền vào biểu mẫu Đầu bài, người dùng xem lại/sửa/lưu như mọi trường khác.',
  );

export type SiteBoundaryExtraction = z.infer<typeof siteBoundaryExtractionSchema>;
