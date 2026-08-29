/**
 * SINH TỰ ĐỘNG TỪ `contracts/layout-intent.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const layoutIntentSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type LayoutIntentSemver = z.infer<typeof layoutIntentSemverSchema>;

export const layoutIntentArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type LayoutIntentArtifactRef = z.infer<typeof layoutIntentArtifactRefSchema>;

export const layoutIntentWingIdSchema = z.string().regex(/^W[0-9]+$/);

export type LayoutIntentWingId = z.infer<typeof layoutIntentWingIdSchema>;

/** Nút của cây chia không gian — ĐÚNG MỘT trong ba dạng, không được lai. Cây chia đệ quy không thể sinh khe hở hay chồng lấn: đó là tính chất của cấu trúc dữ liệu, không phải kết quả kiểm tra. */
export type LayoutIntentLayoutNode =
  | {
      split: 'H' | 'V';
      ratio_hint?: number;
      a: LayoutIntentLayoutNode;
      b: LayoutIntentLayoutNode;
    }
  | {
      room: string;
    }
  | {
      void: 'lightwell' | 'courtyard' | 'atrium';
    };

export const layoutIntentLayoutNodeSchema: z.ZodType<LayoutIntentLayoutNode> = z.lazy(() =>
  z
    .union([
      z
        .object({
          /** H = cắt ngang · V = cắt dọc. */
          split: z.enum(['H', 'V']).describe('H = cắt ngang · V = cắt dọc.'),
          /** CHỈ là gợi ý cho hàm mục tiêu; bộ giải được phép bỏ qua. */
          ratio_hint: z
            .number()
            .gt(0)
            .lt(1)
            .describe('CHỈ là gợi ý cho hàm mục tiêu; bộ giải được phép bỏ qua.')
            .optional(),
          a: layoutIntentLayoutNodeSchema,
          b: layoutIntentLayoutNodeSchema,
        })
        .strict(),
      z
        .object({
          room: z.string().regex(/^[a-z0-9_]+$/),
        })
        .strict(),
      z
        .object({
          void: z.enum(['lightwell', 'courtyard', 'atrium']),
        })
        .strict(),
    ])
    .describe(
      'Nút của cây chia không gian — ĐÚNG MỘT trong ba dạng, không được lai. Cây chia đệ quy không thể sinh khe hở hay chồng lấn: đó là tính chất của cấu trúc dữ liệu, không phải kết quả kiểm tra.',
    ),
);

/** Ý đồ bố cục — output Layer 3a, thứ DUY NHẤT mô hình ngôn ngữ sinh ra. KHÔNG có toạ độ tuyệt đối, KHÔNG có kích thước chính xác: chỉ cấu trúc và gợi ý tỉ lệ (nguyên tắc bất biến 2, CLAUDE.md 8.2). Nguồn: doc/design/03-data-contracts.md mục 3.3. */
export const layoutIntentSchema = z
  .object({
    schema_version: layoutIntentSemverSchema,
    program_ref: layoutIntentArtifactRefSchema,
    /** 3–4 phương án mỗi lần chạy: A, B, C, D. */
    variant_id: z
      .string()
      .regex(/^[A-Z]$/)
      .describe('3–4 phương án mỗi lần chạy: A, B, C, D.'),
    variant_label: z.string().optional(),
    massing: z
      .object({
        wings: z
          .array(
            z
              .object({
                id: layoutIntentWingIdSchema,
                x_hint: z.number().optional(),
                y_hint: z.number().optional(),
                w_hint_m: z.number().gt(0).optional(),
                d_hint_m: z.number().gt(0).optional(),
              })
              .strict(),
          )
          .min(1),
        /** Rỗng với nhà phố; dùng cho biệt thự nhiều cánh. */
        wing_links: z
          .array(
            z
              .object({
                a: layoutIntentWingIdSchema,
                b: layoutIntentWingIdSchema,
                via: z.string().nullable().optional(),
              })
              .strict(),
          )
          .describe('Rỗng với nhà phố; dùng cho biệt thự nhiều cánh.')
          .optional(),
      })
      .strict(),
    cores: z
      .array(
        z
          .object({
            id: z.string().regex(/^C[0-9]+$/),
            wing: layoutIntentWingIdSchema,
            band: z.enum(['left', 'right', 'center']).optional(),
            position_hint: z.enum(['front', 'middle', 'rear']).optional(),
            contains: z.array(z.enum(['stair', 'wc', 'shaft', 'lift'])).optional(),
          })
          .strict(),
      )
      .min(1),
    floors: z
      .array(
        z
          .object({
            level: z.number().int().gte(1).lte(12),
            wings: z
              .array(
                z
                  .object({
                    wing_id: layoutIntentWingIdSchema,
                    tree: layoutIntentLayoutNodeSchema,
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
    rationale: z.string().optional(),
  })
  .strict()
  .describe(
    'Ý đồ bố cục — output Layer 3a, thứ DUY NHẤT mô hình ngôn ngữ sinh ra. KHÔNG có toạ độ tuyệt đối, KHÔNG có kích thước chính xác: chỉ cấu trúc và gợi ý tỉ lệ (nguyên tắc bất biến 2, CLAUDE.md 8.2). Nguồn: doc/design/03-data-contracts.md mục 3.3.',
  );

export type LayoutIntent = z.infer<typeof layoutIntentSchema>;
