/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-brief-digest.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiBriefDigestSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiBriefDigestSemver = z.infer<typeof aiBriefDigestSemverSchema>;

/** Bản đầu bài + khảo sát GỬI CHO mô hình của nhà cung cấp ngoài (nhánh AI, T12). Đây là DANH SÁCH CHO PHÉP: additionalProperties=false ở mọi cấp, nên một trường mới thêm vào design-brief không tự đi ra mạng. Cố ý KHÔNG có: project_id, project_code, budget_range_vnd, decision_maker, legal_docs, completeness_score. Chữ tự do đi qua sau khi lược danh tính (scrubIdentity). Hạng dữ liệu 2. */
export const aiBriefDigestSchema = z
  .object({
    schema_version: aiBriefDigestSemverSchema,
    building_type: z.enum(['nha_pho', 'biet_thu', 'nha_vuon']),
    locality: z.string(),
    floors: z.number().int().gte(1),
    site: z
      .object({
        shape: z
          .union([
            z.literal('chu_nhat'),
            z.literal('hinh_thang'),
            z.literal('da_giac'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        width_m: z.number(),
        depth_m: z.number(),
        rear_width_m: z.number().nullable().optional(),
        boundary_m: z.array(z.array(z.number()).min(2).max(2)).nullable().optional(),
        orientation: z
          .union([
            z.literal('B'),
            z.literal('BD'),
            z.literal('D'),
            z.literal('DN'),
            z.literal('N'),
            z.literal('TN'),
            z.literal('T'),
            z.literal('TB'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        access_sides: z.array(z.enum(['front', 'back', 'left', 'right'])).optional(),
        adjacent: z
          .object({
            front: z.string().nullable().optional(),
            back: z.string().nullable().optional(),
            left: z.string().nullable().optional(),
            right: z.string().nullable().optional(),
          })
          .strict()
          .optional(),
        setback_required_m: z
          .object({
            front: z.number().optional(),
            back: z.number().optional(),
            left: z.number().optional(),
            right: z.number().optional(),
          })
          .strict()
          .nullable()
          .optional(),
        max_density: z.number().nullable().optional(),
        main_entrance_side: z
          .union([
            z.literal('front'),
            z.literal('back'),
            z.literal('left'),
            z.literal('right'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        vehicle_entrance_side: z
          .union([
            z.literal('front'),
            z.literal('back'),
            z.literal('left'),
            z.literal('right'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        boundary_walls: z
          .object({
            front: z
              .union([z.literal('chung'), z.literal('rieng'), z.literal(null)])
              .nullable()
              .optional(),
            back: z
              .union([z.literal('chung'), z.literal('rieng'), z.literal(null)])
              .nullable()
              .optional(),
            left: z
              .union([z.literal('chung'), z.literal('rieng'), z.literal(null)])
              .nullable()
              .optional(),
            right: z
              .union([z.literal('chung'), z.literal('rieng'), z.literal(null)])
              .nullable()
              .optional(),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict(),
    family: z.array(
      z
        .object({
          role: z.enum(['ong_ba', 'vo_chong', 'con', 'khach', 'nguoi_giup_viec']),
          count: z.number().int().gte(0),
          floor: z.number().int().nullable().optional(),
          floor_pref: z
            .union([z.literal('low'), z.literal('mid'), z.literal('top'), z.literal(null)])
            .nullable()
            .optional(),
          needs: z.array(z.string()).optional(),
          ensuite: z.boolean().nullable().optional(),
        })
        .strict(),
    ),
    required_spaces: z.array(
      z
        .object({
          type: z.string(),
          floor: z.number().int().nullable().optional(),
          area_m2: z.number().nullable().optional(),
          ensuite: z.boolean().nullable().optional(),
          amenities: z.string().nullable().optional(),
        })
        .strict(),
    ),
    massing: z
      .object({
        wings_preferred: z.number().int().nullable().optional(),
        footprint_shape: z
          .union([
            z.literal('chu_nhat'),
            z.literal('L'),
            z.literal('U'),
            z.literal('T'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        cores_preferred: z.number().int().nullable().optional(),
        service_core: z.boolean().nullable().optional(),
        yards: z.array(z.enum(['san_truoc', 'san_ben', 'san_trong', 'san_sau'])).optional(),
        indoor_outdoor: z
          .union([
            z.literal('mo_toi_da'),
            z.literal('can_bang'),
            z.literal('kin_dao'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        yard_depth_m: z
          .object({
            front: z.number().optional(),
            back: z.number().optional(),
            left: z.number().optional(),
            right: z.number().optional(),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict()
      .nullable()
      .optional(),
    parking: z
      .object({
        cars: z.number().int().nullable().optional(),
        motorbikes: z.number().int().nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
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
    priorities: z.array(z.string()),
    /** Năm ô chữ tự do của đầu bài, ĐÃ lược danh tính. legal_documents cố ý không có: hay chứa số sổ đỏ. */
    free_text: z
      .object({
        design_task: z.string().nullable().optional(),
        functional_needs: z.string().nullable().optional(),
        style_note: z.string().nullable().optional(),
        site_condition: z.string().nullable().optional(),
      })
      .strict()
      .describe(
        'Năm ô chữ tự do của đầu bài, ĐÃ lược danh tính. legal_documents cố ý không có: hay chứa số sổ đỏ.',
      ),
    /** Biên bản khảo sát hiện trạng gắn với đầu bài (site_source_survey_id), đã lược danh tính. null khi đầu bài nhập tay. */
    survey: z
      .object({
        land_width_m: z.number().nullable().optional(),
        land_depth_m: z.number().nullable().optional(),
        land_area_m2: z.number().nullable().optional(),
        orientation: z.string().nullable().optional(),
        measurement_notes: z.string().nullable().optional(),
        surrounding_notes: z.string().nullable().optional(),
        usage_notes: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Biên bản khảo sát hiện trạng gắn với đầu bài (site_source_survey_id), đã lược danh tính. null khi đầu bài nhập tay.',
      ),
  })
  .strict()
  .describe(
    'Bản đầu bài + khảo sát GỬI CHO mô hình của nhà cung cấp ngoài (nhánh AI, T12). Đây là DANH SÁCH CHO PHÉP: additionalProperties=false ở mọi cấp, nên một trường mới thêm vào design-brief không tự đi ra mạng. Cố ý KHÔNG có: project_id, project_code, budget_range_vnd, decision_maker, legal_docs, completeness_score. Chữ tự do đi qua sau khi lược danh tính (scrubIdentity). Hạng dữ liệu 2.',
  );

export type AiBriefDigest = z.infer<typeof aiBriefDigestSchema>;
