/**
 * SINH TỰ ĐỘNG TỪ `contracts/kb-record.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const kbRecordSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type KbRecordSemver = z.infer<typeof kbRecordSemverSchema>;

export const kbRecordUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

export type KbRecordUuid = z.infer<typeof kbRecordUuidSchema>;

export const kbRecordRoomTypeSchema = z.string().regex(/^[a-z0-9_]+$/);

export type KbRecordRoomType = z.infer<typeof kbRecordRoomTypeSchema>;

export const kbRecordPointSchema = z.array(z.number()).min(2).max(2);

export type KbRecordPoint = z.infer<typeof kbRecordPointSchema>;

/** Đỉnh theo chiều kim đồng hồ, KHÔNG lặp đỉnh đầu ở cuối (03-data-contracts 3.4). */
export const kbRecordPolygonSchema = z
  .array(kbRecordPointSchema)
  .min(3)
  .describe('Đỉnh theo chiều kim đồng hồ, KHÔNG lặp đỉnh đầu ở cuối (03-data-contracts 3.4).');

export type KbRecordPolygon = z.infer<typeof kbRecordPolygonSchema>;

/** Nút của cây chia không gian — ĐÚNG MỘT trong ba dạng, không được lai. Định nghĩa phải KHỚP với layout-intent.schema.json: bản ghi Knowledge Base được đưa vào prompt làm few-shot, nên lệch định dạng là dạy mô hình sinh sai. */
export type KbRecordLayoutNode =
  | {
      split: 'H' | 'V';
      ratio_hint?: number;
      a: KbRecordLayoutNode;
      b: KbRecordLayoutNode;
    }
  | {
      room: KbRecordRoomType;
    }
  | {
      void: 'lightwell' | 'courtyard' | 'atrium';
    };

export const kbRecordLayoutNodeSchema: z.ZodType<KbRecordLayoutNode> = z.lazy(() =>
  z
    .union([
      z
        .object({
          /** H = cắt ngang · V = cắt dọc. */
          split: z.enum(['H', 'V']).describe('H = cắt ngang · V = cắt dọc.'),
          ratio_hint: z.number().gt(0).lt(1).optional(),
          a: kbRecordLayoutNodeSchema,
          b: kbRecordLayoutNodeSchema,
        })
        .strict(),
      z
        .object({
          room: kbRecordRoomTypeSchema,
        })
        .strict(),
      z
        .object({
          void: z.enum(['lightwell', 'courtyard', 'atrium']),
        })
        .strict(),
    ])
    .describe(
      'Nút của cây chia không gian — ĐÚNG MỘT trong ba dạng, không được lai. Định nghĩa phải KHỚP với layout-intent.schema.json: bản ghi Knowledge Base được đưa vào prompt làm few-shot, nên lệch định dạng là dạy mô hình sinh sai.',
    ),
);

/** Một bộ hồ sơ công trình cũ đã số hoá thành dữ liệu có cấu trúc — kết quả của pipeline Mốc 3. Nguồn: doc/design/06-knowledge-base.md mục 6.2. Bản ghi này đi từ Container (trích xuất hình học) sang Worker (chuẩn hoá nhãn, chú giải của kiến trúc sư) nên phải có hợp đồng (nguyên tắc bất biến 3, CLAUDE.md 8.2). */
export const kbRecordSchema = z
  .object({
    schema_version: kbRecordSemverSchema,
    tenant_id: kbRecordUuidSchema,
    /** Khoá ngoại tới bảng dự án SẴN CÓ (`design_projects`). Rỗng khi hồ sơ cũ không còn dự án tương ứng trong hệ thống — vẫn số hoá được, chỉ là không nối được sang module khác. */
    project_id: z
      .union([kbRecordUuidSchema, z.null()])
      .describe(
        'Khoá ngoại tới bảng dự án SẴN CÓ (`design_projects`). Rỗng khi hồ sơ cũ không còn dự án tương ứng trong hệ thống — vẫn số hoá được, chỉ là không nối được sang module khác.',
      )
      .optional(),
    project_code: z.string().min(1),
    /** Ở quy mô dưới 50 bộ thì tất cả là hạng A (mục 6.0). Giữ cả ba giá trị vì kho sẽ lớn lên; KHÔNG dựng giao diện quản lý phân hạng khi chưa cần. */
    tier: z
      .enum(['A', 'B', 'C'])
      .describe(
        'Ở quy mô dưới 50 bộ thì tất cả là hạng A (mục 6.0). Giữ cả ba giá trị vì kho sẽ lớn lên; KHÔNG dựng giao diện quản lý phân hạng khi chưa cần.',
      ),
    /** Sinh từ Bước 2 (kiểm tra chéo tự động), không phải người chấm. */
    quality_score: z
      .number()
      .gte(0)
      .lte(1)
      .describe('Sinh từ Bước 2 (kiểm tra chéo tự động), không phải người chấm.'),
    /** Cùng bộ từ vựng với rule pack (`VALID_BUILDING_TYPES`). `nha_xuong` nằm ngoài phạm vi module. */
    building_type: z
      .enum(['nha_pho', 'biet_thu', 'nha_vuon'])
      .describe(
        'Cùng bộ từ vựng với rule pack (`VALID_BUILDING_TYPES`). `nha_xuong` nằm ngoài phạm vi module.',
      ),
    site: z
      .object({
        width_m: z.number().gt(0),
        depth_m: z.number().gt(0),
        /** Hướng nhà theo tám hướng, viết tắt tiếng Việt (B = bắc, DN = đông nam…). */
        orientation: z
          .union([z.enum(['B', 'DB', 'D', 'DN', 'N', 'TN', 'T', 'TB']), z.null()])
          .describe('Hướng nhà theo tám hướng, viết tắt tiếng Việt (B = bắc, DN = đông nam…).')
          .optional(),
        /** Khoảng lùi theo từng cạnh: front · rear · left · right. */
        setback_m: z
          .record(z.string(), z.number().gte(0))
          .describe('Khoảng lùi theo từng cạnh: front · rear · left · right.')
          .optional(),
      })
      .strict(),
    floors: z.number().int().gte(1).lte(12),
    family_archetype: z.string().nullable().optional(),
    style: z.string().nullable().optional(),
    floor_plans: z
      .array(
        z
          .object({
            level: z.number().int().gte(1).lte(12),
            rooms: z.array(
              z
                .object({
                  /** Mã phòng ĐÃ chuẩn hoá. Rỗng khi chưa chuẩn hoá được — trích xuất trong Container KHÔNG tự quy nhãn, việc đó thuộc lớp mô hình ngôn ngữ ở Worker (mục 6.1). */
                  type: z
                    .union([kbRecordRoomTypeSchema, z.null()])
                    .describe(
                      'Mã phòng ĐÃ chuẩn hoá. Rỗng khi chưa chuẩn hoá được — trích xuất trong Container KHÔNG tự quy nhãn, việc đó thuộc lớp mô hình ngôn ngữ ở Worker (mục 6.1).',
                    )
                    .optional(),
                  /** Nguyên văn chuỗi trong bản vẽ. Giữ lại để người xác nhận đối chiếu được kết quả chuẩn hoá. */
                  label_raw: z
                    .string()
                    .nullable()
                    .describe(
                      'Nguyên văn chuỗi trong bản vẽ. Giữ lại để người xác nhận đối chiếu được kết quả chuẩn hoá.',
                    )
                    .optional(),
                  polygon: kbRecordPolygonSchema,
                  area_m2: z.number().gt(0),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(1),
    /** Trường quan trọng nhất cho Layer 3a: few-shot phải đưa vào ĐÚNG định dạng mà mô hình ngôn ngữ cần sinh ra, nên đây là cùng một `layout_node` với LayoutIntent. Rỗng khi mặt bằng không thuộc lớp slicing — khi đó phải hạ `quality_score` và KHÔNG dùng bản ghi làm few-shot. */
    slicing_tree: z
      .union([kbRecordLayoutNodeSchema, z.null()])
      .describe(
        'Trường quan trọng nhất cho Layer 3a: few-shot phải đưa vào ĐÚNG định dạng mà mô hình ngôn ngữ cần sinh ra, nên đây là cùng một `layout_node` với LayoutIntent. Rỗng khi mặt bằng không thuộc lớp slicing — khi đó phải hạ `quality_score` và KHÔNG dùng bản ghi làm few-shot.',
      )
      .optional(),
    structural_grid: z
      .object({
        axes_x_m: z.array(z.number()).optional(),
        axes_y_m: z.array(z.number()).optional(),
      })
      .strict()
      .optional(),
    adjacency_graph: z
      .array(
        z
          .object({
            a: kbRecordRoomTypeSchema,
            b: kbRecordRoomTypeSchema,
            kind: z.enum(['adjacent', 'connected', 'visible', 'separated']),
          })
          .strict(),
      )
      .optional(),
    /** Bước 3 — tri thức ngầm, do kiến trúc sư chọn từ danh sách có sẵn (10–15 phút mỗi công trình), KHÔNG bắt viết luận. */
    rationale: z
      .union([
        z
          .object({
            stair_position: z.string().nullable().optional(),
            kitchen_position: z.string().nullable().optional(),
            biggest_constraint: z.string().nullable().optional(),
            would_change: z.string().nullable().optional(),
          })
          .strict(),
        z.null(),
      ])
      .describe(
        'Bước 3 — tri thức ngầm, do kiến trúc sư chọn từ danh sách có sẵn (10–15 phút mỗi công trình), KHÔNG bắt viết luận.',
      )
      .optional(),
    outcome: z
      .union([
        z
          .object({
            client_satisfied: z.boolean().nullable().optional(),
            construction_issues: z.array(z.string()).optional(),
          })
          .strict(),
        z.null(),
      ])
      .optional(),
    /** Có cặp (đầu bài → mặt bằng kết quả) hay chỉ có bản vẽ. Chỉ có mặt bằng thì không dạy được hệ thống VÌ SAO lại bố trí như vậy. */
    has_brief: z
      .boolean()
      .describe(
        'Có cặp (đầu bài → mặt bằng kết quả) hay chỉ có bản vẽ. Chỉ có mặt bằng thì không dạy được hệ thống VÌ SAO lại bố trí như vậy.',
      ),
    /** Những chỗ trích xuất không chắc chắn. Đi kèm bản ghi thay vì chỉ nằm trong nhật ký, vì người xác nhận cần thấy chúng đúng lúc đang xem bản ghi. */
    extraction_warnings: z
      .array(
        z
          .object({
            code: z.string(),
            detail: z.string(),
          })
          .strict(),
      )
      .describe(
        'Những chỗ trích xuất không chắc chắn. Đi kèm bản ghi thay vì chỉ nằm trong nhật ký, vì người xác nhận cần thấy chúng đúng lúc đang xem bản ghi.',
      )
      .optional(),
  })
  .strict()
  .describe(
    'Một bộ hồ sơ công trình cũ đã số hoá thành dữ liệu có cấu trúc — kết quả của pipeline Mốc 3. Nguồn: doc/design/06-knowledge-base.md mục 6.2. Bản ghi này đi từ Container (trích xuất hình học) sang Worker (chuẩn hoá nhãn, chú giải của kiến trúc sư) nên phải có hợp đồng (nguyên tắc bất biến 3, CLAUDE.md 8.2).',
  );

export type KbRecord = z.infer<typeof kbRecordSchema>;
