/**
 * SINH TỰ ĐỘNG TỪ `contracts/design-brief.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const designBriefSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type DesignBriefSemver = z.infer<typeof designBriefSemverSchema>;

export const designBriefBuildingTypeSchema = z.enum(['nha_pho', 'biet_thu', 'nha_vuon']);

export type DesignBriefBuildingType = z.infer<typeof designBriefBuildingTypeSchema>;

/** Đầu bài thiết kế — output Layer 1. Nguồn: doc/design/03-data-contracts.md mục 3.1. */
export const designBriefSchema = z
  .object({
    schema_version: designBriefSemverSchema,
    /** Khoá ngoại tới design_projects.id — bảng SẴN CÓ. Tài liệu ví dụ ghi mã hiển thị 'NVO-028'; repo dùng UUID và giữ mã hiển thị ở project_code. */
    project_id: z
      .string()
      .uuid()
      .describe(
        "Khoá ngoại tới design_projects.id — bảng SẴN CÓ. Tài liệu ví dụ ghi mã hiển thị 'NVO-028'; repo dùng UUID và giữ mã hiển thị ở project_code.",
      ),
    /** Mã hồ sơ hiển thị (NVO-TK-2026-0001) — chỉ để đọc, không phải khoá. */
    project_code: z
      .string()
      .max(40)
      .describe('Mã hồ sơ hiển thị (NVO-TK-2026-0001) — chỉ để đọc, không phải khoá.')
      .optional(),
    building_type: designBriefBuildingTypeSchema,
    /** Chọn rule pack địa phương. Giá trị ánh xạ sang thư mục rules/locality/<locality với _ đổi thành ->. */
    locality: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .describe(
        'Chọn rule pack địa phương. Giá trị ánh xạ sang thư mục rules/locality/<locality với _ đổi thành ->.',
      ),
    site: z
      .object({
        width_m: z.number().lte(500).gt(0),
        depth_m: z.number().lte(500).gt(0),
        /** Hướng nhà: B bắc · BD bắc-đông · D đông · DN đông-nam · N nam · TN tây-nam · T tây · TB tây-bắc. */
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
          .describe(
            'Hướng nhà: B bắc · BD bắc-đông · D đông · DN đông-nam · N nam · TN tây-nam · T tây · TB tây-bắc.',
          )
          .optional(),
        access_sides: z.array(z.enum(['front', 'back', 'left', 'right'])).optional(),
        /** Hiện trạng bốn phía: nha_hang_xom, hem_2m, duong_lon, dat_trong… */
        adjacent: z
          .record(z.string(), z.string().nullable())
          .describe('Hiện trạng bốn phía: nha_hang_xom, hem_2m, duong_lon, dat_trong…')
          .optional(),
        setback_required_m: z
          .object({
            front: z.number().gte(0).optional(),
            back: z.number().gte(0).optional(),
            left: z.number().gte(0).optional(),
            right: z.number().gte(0).optional(),
          })
          .strict()
          .optional(),
        /** Mật độ xây dựng tối đa, tỉ lệ 0..1. null = chưa biết, lấy theo rule pack. */
        max_density: z
          .number()
          .gte(0)
          .lte(1)
          .nullable()
          .describe('Mật độ xây dựng tối đa, tỉ lệ 0..1. null = chưa biết, lấy theo rule pack.')
          .optional(),
        legal_docs_available: z.boolean().optional(),
      })
      .strict(),
    floors: z.number().int().gte(1).lte(12),
    family: z
      .array(
        z
          .object({
            role: z.enum(['ong_ba', 'vo_chong', 'con', 'khach', 'nguoi_giup_viec']),
            count: z.number().int().gte(0).lte(20),
            floor_pref: z
              .union([z.literal('low'), z.literal('mid'), z.literal('top'), z.literal(null)])
              .nullable()
              .optional(),
            needs: z.array(z.string()).optional(),
          })
          .strict(),
      )
      .optional(),
    required_spaces: z.array(z.string()).optional(),
    style: z
      .union([
        z.literal('hien_dai'),
        z.literal('tan_co_dien'),
        z.literal('indochine'),
        z.literal(null),
      ])
      .nullable()
      .optional(),
    /** [cận dưới, cận trên] đơn vị ĐỒNG, số nguyên (CLAUDE.md 4.2 — tiền không có phần thập phân). */
    budget_range_vnd: z
      .array(z.number().int().gte(0))
      .min(2)
      .max(2)
      .nullable()
      .describe(
        '[cận dưới, cận trên] đơn vị ĐỒNG, số nguyên (CLAUDE.md 4.2 — tiền không có phần thập phân).',
      )
      .optional(),
    priorities: z.array(z.string()).optional(),
    /** Bắt buộc THU THẬP dù được để trống — thiếu người quyết định là nguyên nhân hàng đầu phải sửa phương án nhiều lần (03-data-contracts 3.1). */
    decision_maker: z
      .object({
        name: z.string().nullable().optional(),
        relationship: z.string().nullable().optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Bắt buộc THU THẬP dù được để trống — thiếu người quyết định là nguyên nhân hàng đầu phải sửa phương án nhiều lần (03-data-contracts 3.1).',
      )
      .optional(),
    /** Ngưỡng cho phép chạy Layer 2 nằm trong config, KHÔNG hard-code ở đây. */
    completeness_score: z
      .number()
      .gte(0)
      .lte(1)
      .describe('Ngưỡng cho phép chạy Layer 2 nằm trong config, KHÔNG hard-code ở đây.')
      .optional(),
    missing_fields: z.array(z.string()).optional(),
  })
  .strict()
  .describe('Đầu bài thiết kế — output Layer 1. Nguồn: doc/design/03-data-contracts.md mục 3.1.');

export type DesignBrief = z.infer<typeof designBriefSchema>;
