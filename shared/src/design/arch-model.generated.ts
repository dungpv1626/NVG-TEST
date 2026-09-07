/**
 * SINH TỰ ĐỘNG TỪ `contracts/arch-model.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const archModelSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type ArchModelSemver = z.infer<typeof archModelSemverSchema>;

export const archModelArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type ArchModelArtifactRef = z.infer<typeof archModelArtifactRefSchema>;

/** Mô hình kiến trúc tham số — output Layer 4. CHƯA cài đặt ở Mốc 1; hợp đồng viết sẵn để bước stub trả đúng hình dạng. Nguồn: doc/design/03-data-contracts.md mục 3.6. */
export const archModelSchema = z
  .object({
    schema_version: archModelSemverSchema,
    floorplan_ref: archModelArtifactRefSchema,
    style: z
      .union([
        z.literal('hien_dai'),
        z.literal('tan_co_dien'),
        z.literal('indochine'),
        z.literal('mai_thai'),
        z.literal('toi_gian'),
        z.literal('nhiet_doi'),
        z.literal('dia_trung_hai'),
        z.literal('co_dien'),
        z.literal('bac_au'),
        z.literal(null),
      ])
      .nullable()
      .optional(),
    style_template_version: z.string().nullable().optional(),
    massing: z
      .object({
        levels: z.array(
          z
            .object({
              level: z.number().int().gte(1),
              extrude_from_m: z.number(),
              extrude_to_m: z.number(),
            })
            .strict(),
        ),
      })
      .strict(),
    roof: z
      .object({
        kind: z.enum(['flat', 'gable', 'hip', 'mansard']).optional(),
        parapet_h_m: z.number().gte(0).nullable().optional(),
        pitch_deg: z.number().gte(0).lte(89).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    facades: z
      .array(
        z
          .object({
            direction: z.enum(['front', 'back', 'left', 'right']),
            openings: z
              .array(
                z
                  .object({
                    level: z.number().int().gte(1),
                    x_m: z.number(),
                    w_m: z.number().gt(0),
                    h_m: z.number().gt(0),
                    sill_m: z.number().gte(0).nullable().optional(),
                    kind: z.enum(['window', 'door', 'louver', 'opening']),
                  })
                  .strict(),
              )
              .optional(),
            materials: z
              .array(
                z
                  .object({
                    zone: z.string(),
                    material: z.string(),
                  })
                  .strict(),
              )
              .optional(),
          })
          .strict(),
      )
      .optional(),
    sections: z
      .array(
        z
          .object({
            id: z.string(),
            plane: z
              .object({
                axis: z.enum(['x', 'y']),
                at_m: z.number(),
              })
              .strict(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .describe(
    'Mô hình kiến trúc tham số — output Layer 4. CHƯA cài đặt ở Mốc 1; hợp đồng viết sẵn để bước stub trả đúng hình dạng. Nguồn: doc/design/03-data-contracts.md mục 3.6.',
  );

export type ArchModel = z.infer<typeof archModelSchema>;
