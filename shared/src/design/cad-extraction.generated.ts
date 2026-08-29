/**
 * SINH TỰ ĐỘNG TỪ `contracts/cad-extraction.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const cadExtractionSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type CadExtractionSemver = z.infer<typeof cadExtractionSemverSchema>;

export const cadExtractionPointSchema = z.array(z.number()).min(2).max(2);

export type CadExtractionPoint = z.infer<typeof cadExtractionPointSchema>;

export const cadExtractionPolygonSchema = z.array(cadExtractionPointSchema).min(3);

export type CadExtractionPolygon = z.infer<typeof cadExtractionPolygonSchema>;

/** Kết quả trích một bản vẽ mặt bằng CAD — Bước 1 của pipeline số hoá (doc/design/06-knowledge-base.md mục 6.1). Đi từ Container sang Worker nên phải có hợp đồng (nguyên tắc bất biến 3). ĐÂY KHÔNG PHẢI FloorPlan: FloorPlan là kết quả của bộ giải cho một phương án MỚI, còn cái này là hình học đọc được từ một công trình ĐÃ XÂY. */
export const cadExtractionSchema = z
  .object({
    schema_version: cadExtractionSemverSchema,
    source_file: z.string().min(1),
    /** Đơn vị gốc của bản vẽ. Mọi toạ độ trong bản ghi này ĐÃ quy về mét bất kể giá trị này. */
    units: z
      .enum(['mm', 'cm', 'm', 'in', 'ft'])
      .describe(
        'Đơn vị gốc của bản vẽ. Mọi toạ độ trong bản ghi này ĐÃ quy về mét bất kể giá trị này.',
      ),
    /** Bản vẽ không khai $INSUNITS nên đơn vị là suy ra từ bảng ánh xạ. Một diện tích sai hệ số 1000 mà không có dấu hiệu gì còn nguy hiểm hơn không trích được. */
    units_assumed: z
      .boolean()
      .describe(
        'Bản vẽ không khai $INSUNITS nên đơn vị là suy ra từ bảng ánh xạ. Một diện tích sai hệ số 1000 mà không có dấu hiệu gì còn nguy hiểm hơn không trích được.',
      ),
    rooms: z.array(
      z
        .object({
          polygon_m: cadExtractionPolygonSchema,
          area_m2: z.number().gt(0),
          layer: z.string(),
          /** NGUYÊN VĂN chuỗi trong bản vẽ. Container KHÔNG quy về mã phòng chuẩn — việc đó thuộc lớp mô hình ngôn ngữ ở Worker (CLAUDE.md 8.3). */
          label_raw: z
            .string()
            .nullable()
            .describe(
              'NGUYÊN VĂN chuỗi trong bản vẽ. Container KHÔNG quy về mã phòng chuẩn — việc đó thuộc lớp mô hình ngôn ngữ ở Worker (CLAUDE.md 8.3).',
            )
            .optional(),
          /** Nhãn nằm trong đa giác, hay chỉ là nhãn gần nhất, hay không có. Người xác nhận cần biết mức độ chắc chắn chứ không chỉ biết kết quả. */
          label_source: z
            .enum(['contains', 'nearest', 'none'])
            .describe(
              'Nhãn nằm trong đa giác, hay chỉ là nhãn gần nhất, hay không có. Người xác nhận cần biết mức độ chắc chắn chứ không chỉ biết kết quả.',
            ),
        })
        .strict(),
    ),
    columns_m: z.array(cadExtractionPointSchema).optional(),
    site_boundary_m: z.union([cadExtractionPolygonSchema, z.null()]).optional(),
    /** Chữ trên lớp nhãn không ghép được vào phòng nào. Giữ lại thay vì vứt đi: thường là số diện tích hoặc ghi chú mà người xác nhận cần nhìn thấy. */
    unmatched_labels: z
      .array(z.string())
      .describe(
        'Chữ trên lớp nhãn không ghép được vào phòng nào. Giữ lại thay vì vứt đi: thường là số diện tích hoặc ghi chú mà người xác nhận cần nhìn thấy.',
      )
      .optional(),
    layers_seen: z.array(z.string()).optional(),
    /** Lớp chưa có mẫu trong kb/layer_mapping.yaml và cũng không nằm trong danh sách cố ý bỏ qua. Đây là danh sách việc cần bổ sung, không phải lỗi. */
    layers_unmapped: z
      .array(z.string())
      .describe(
        'Lớp chưa có mẫu trong kb/layer_mapping.yaml và cũng không nằm trong danh sách cố ý bỏ qua. Đây là danh sách việc cần bổ sung, không phải lỗi.',
      )
      .optional(),
    warnings: z
      .array(
        z
          .object({
            code: z.string(),
            detail: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .describe(
    'Kết quả trích một bản vẽ mặt bằng CAD — Bước 1 của pipeline số hoá (doc/design/06-knowledge-base.md mục 6.1). Đi từ Container sang Worker nên phải có hợp đồng (nguyên tắc bất biến 3). ĐÂY KHÔNG PHẢI FloorPlan: FloorPlan là kết quả của bộ giải cho một phương án MỚI, còn cái này là hình học đọc được từ một công trình ĐÃ XÂY.',
  );

export type CadExtraction = z.infer<typeof cadExtractionSchema>;
