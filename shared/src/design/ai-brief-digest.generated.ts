/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-brief-digest.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiBriefDigestSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiBriefDigestSemver = z.infer<typeof aiBriefDigestSemverSchema>;

/** Bản đầu bài + khảo sát GỬI CHO mô hình của nhà cung cấp ngoài (nhánh AI, T12). Đây là DANH SÁCH CHO PHÉP: additionalProperties=false ở mọi cấp, nên một trường mới thêm vào design-brief không tự đi ra mạng. Cố ý KHÔNG có: project_id, project_code, budget_range_vnd, decision_maker, household.owner_birth_year (không tồn tại — tuổi khai theo `family[].ages`), legal_docs, completeness_score. Chữ tự do đi qua sau khi lược danh tính (scrubIdentity). Hạng dữ liệu 2. */
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
        road_level_m: z.number().gte(-10).lte(200).nullable().optional(),
        land_level_m: z.number().gte(-10).lte(200).nullable().optional(),
        harsh_sun_sides: z
          .array(z.enum(['front', 'back', 'left', 'right']))
          .nullable()
          .optional(),
        cool_wind_sides: z
          .array(z.enum(['front', 'back', 'left', 'right']))
          .nullable()
          .optional(),
        road_width_m: z.number().gte(0).lte(60).nullable().optional(),
        flood_risk: z
          .union([
            z.literal('khong'),
            z.literal('thinh_thoang'),
            z.literal('thuong_xuyen'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        existing_structure: z
          .union([
            z.literal('dat_trong'),
            z.literal('nha_cu_pha_do'),
            z.literal('nha_cu_cai_tao'),
            z.literal('mong_cu_giu_lai'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        neighbour_floors: z
          .object({
            front: z.number().int().gte(0).lte(30).nullable().optional(),
            back: z.number().int().gte(0).lte(30).nullable().optional(),
            left: z.number().int().gte(0).lte(30).nullable().optional(),
            right: z.number().int().gte(0).lte(30).nullable().optional(),
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
          ages: z.array(z.number().int().gte(0).lte(120)).max(20).nullable().optional(),
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
        car_size: z
          .union([
            z.literal('gam_thap'),
            z.literal('gam_cao'),
            z.literal('ban_tai'),
            z.literal('xe_7_cho'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        ev_charging: z.boolean().nullable().optional(),
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
    household: z
      .object({
        occupation: z.string().max(200).nullable().optional(),
        religion: z
          .union([
            z.literal('tho_cung_to_tien'),
            z.literal('phat_giao'),
            z.literal('cong_giao'),
            z.literal('tin_lanh'),
            z.literal('khac'),
            z.literal('khong'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        altar_arrangement: z
          .union([
            z.literal('phong_tho_rieng'),
            z.literal('chung_phong_khach'),
            z.literal('tren_san_thuong'),
            z.literal('khong_co'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        altar_floor: z.number().int().gte(1).lte(12).nullable().optional(),
        feng_shui: z
          .union([
            z.literal('khong_xem'),
            z.literal('co_xem'),
            z.literal('co_thay_rieng'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        feng_shui_notes: z.string().max(1000).nullable().optional(),
        taboos: z.string().max(1000).nullable().optional(),
        home_business: z
          .object({
            mode: z
              .union([
                z.literal('khong'),
                z.literal('van_phong_tai_nha'),
                z.literal('cua_hang_mat_tien'),
                z.literal('kho_hang'),
                z.literal('luu_tru_cho_thue'),
                z.literal('san_xuat_nho'),
                z.literal(null),
              ])
              .nullable()
              .optional(),
            floor_count: z.number().int().gte(1).lte(12).nullable().optional(),
            separate_entrance: z.boolean().nullable().optional(),
            customer_wc: z.boolean().nullable().optional(),
            staff_count: z.number().int().gte(0).lte(50).nullable().optional(),
            note: z.string().max(1000).nullable().optional(),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict()
      .nullable()
      .optional(),
    lifestyle: z
      .object({
        cooking: z
          .union([
            z.literal('nau_nhieu_chien_xao'),
            z.literal('nau_hang_ngay_don_gian'),
            z.literal('it_nau'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        second_kitchen: z.boolean().nullable().optional(),
        dining_place: z
          .union([
            z.literal('ban_an_rieng'),
            z.literal('quay_bep'),
            z.literal('linh_hoat'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        guests: z
          .union([
            z.literal('thuong_xuyen'),
            z.literal('thinh_thoang'),
            z.literal('it'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        overnight_guests: z.boolean().nullable().optional(),
        work_from_home: z.boolean().nullable().optional(),
        night_shift: z.boolean().nullable().optional(),
        reduced_mobility: z.boolean().nullable().optional(),
        drying: z
          .union([
            z.literal('phoi_nang_ngoai_troi'),
            z.literal('may_say_trong_nha'),
            z.literal('ca_hai'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        pets: z
          .union([
            z.literal('khong'),
            z.literal('cho'),
            z.literal('meo'),
            z.literal('cho_va_meo'),
            z.literal('khac'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        daily_rhythm: z.string().max(1000).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    storage: z
      .object({
        level: z
          .union([z.literal('it'), z.literal('vua'), z.literal('nhieu'), z.literal(null)])
          .nullable()
          .optional(),
        items: z
          .array(
            z.enum([
              'kho_chung',
              'kho_thuc_pham',
              'tu_am_tuong',
              'do_theo_mua',
              'hanh_ly',
              'tai_lieu',
              'dung_cu_sua_chua',
              'do_the_thao',
              'ham_ruou',
              'do_tho_cung',
            ]),
          )
          .nullable()
          .optional(),
        note: z.string().max(1000).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    vertical: z
      .object({
        elevator: z
          .union([
            z.literal('khong'),
            z.literal('lam_ngay'),
            z.literal('chua_cho'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        elevator_capacity: z
          .union([
            z.literal('nho_350kg'),
            z.literal('vua_450kg'),
            z.literal('lon_630kg'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        elevator_shaft_width_m: z.number().nullable().optional(),
        elevator_shaft_depth_m: z.number().nullable().optional(),
        elevator_position: z
          .union([
            z.literal('giua_long_thang_bo'),
            z.literal('canh_thang_bo'),
            z.literal('doi_dien_thang_bo'),
            z.literal('khac'),
            z.literal('rieng_biet'),
            z.literal('chua_quyet'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        elevator_layout_note: z.string().max(300).nullable().optional(),
        stair_type: z
          .union([
            z.literal('thang_ho'),
            z.literal('thang_kin'),
            z.literal('chua_quyet'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
      })
      .strict()
      .nullable()
      .optional(),
    entrance: z
      .object({
        floor_above_road_m: z.number().gte(0).lte(3).nullable().optional(),
        steps_from_yard: z.boolean().nullable().optional(),
        step_count: z.number().int().gte(1).lte(8).nullable().optional(),
        vehicle_ramp: z.boolean().nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    balconies: z
      .object({
        /** Mặt BẮT BUỘC có ban công (T91). Thiếu ban công ở mặt này là sai đầu bài — bác phương án. */
        required_sides: z
          .array(z.enum(['front', 'back', 'left', 'right']))
          .nullable()
          .describe(
            'Mặt BẮT BUỘC có ban công (T91). Thiếu ban công ở mặt này là sai đầu bài — bác phương án.',
          )
          .optional(),
        /** Mặt CÓ THỂ có ban công (T91) — có hay không đều được. Mặt không nằm trong hai danh sách thì KHÔNG được đặt ban công (khi gia chủ đã khai ít nhất một mặt). */
        optional_sides: z
          .array(z.enum(['front', 'back', 'left', 'right']))
          .nullable()
          .describe(
            'Mặt CÓ THỂ có ban công (T91) — có hay không đều được. Mặt không nằm trong hai danh sách thì KHÔNG được đặt ban công (khi gia chủ đã khai ít nhất một mặt).',
          )
          .optional(),
        /** Độ đua ra ngoài ranh của ban công TỪNG MẶT, mét (T91, Haan 27/09/2026). 0 = không đua — ban công nằm trong diện tích sàn. Trống = chưa trả lời: chương trình giữ ban công trong ranh và nói ra. Đua sang đất nhà khác bị chặn ở bước soát đầu bài; đua ra đường, hẻm, ao hồ chỉ cảnh báo. */
        projection_by_side: z
          .object({
            front: z.number().gte(0).lte(3).nullable().optional(),
            back: z.number().gte(0).lte(3).nullable().optional(),
            left: z.number().gte(0).lte(3).nullable().optional(),
            right: z.number().gte(0).lte(3).nullable().optional(),
          })
          .strict()
          .nullable()
          .describe(
            'Độ đua ra ngoài ranh của ban công TỪNG MẶT, mét (T91, Haan 27/09/2026). 0 = không đua — ban công nằm trong diện tích sàn. Trống = chưa trả lời: chương trình giữ ban công trong ranh và nói ra. Đua sang đất nhà khác bị chặn ở bước soát đầu bài; đua ra đường, hẻm, ao hồ chỉ cảnh báo.',
          )
          .optional(),
        /** CŨ (trước T91): đọc như `required_sides`. Đầu bài mới không ghi trường này. */
        sides: z
          .array(z.enum(['front', 'back', 'left', 'right']))
          .nullable()
          .describe('CŨ (trước T91): đọc như `required_sides`. Đầu bài mới không ghi trường này.')
          .optional(),
        scope: z
          .union([
            z.literal('moi_tang'),
            z.literal('chi_mat_tien'),
            z.literal('theo_tung_phong'),
            z.literal('khong_co'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        /** CŨ (trước T91): thay bằng `projection_by_side`; chỉ còn để đọc đầu bài đã lưu. */
        projection_over_boundary: z
          .boolean()
          .nullable()
          .describe(
            'CŨ (trước T91): thay bằng `projection_by_side`; chỉ còn để đọc đầu bài đã lưu.',
          )
          .optional(),
        /** CŨ (trước T91): thay bằng `projection_by_side`; chỉ còn để đọc đầu bài đã lưu. */
        projection_m: z
          .number()
          .gte(0)
          .lte(3)
          .nullable()
          .describe(
            'CŨ (trước T91): thay bằng `projection_by_side`; chỉ còn để đọc đầu bài đã lưu.',
          )
          .optional(),
        drying_balcony: z.boolean().nullable().optional(),
        note: z.string().max(1000).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    systems: z
      .object({
        water_storage: z
          .array(z.enum(['be_ngam', 'bon_mai', 'may_bom_tang_ap']))
          .nullable()
          .optional(),
        solar_water: z.boolean().nullable().optional(),
        aircon_outdoor: z
          .union([
            z.literal('hop_ky_thuat'),
            z.literal('ban_cong_phu'),
            z.literal('san_thuong'),
            z.literal('chua_quyet'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        note: z.string().max(1000).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    future: z
      .object({
        expansion: z
          .union([
            z.literal('khong'),
            z.literal('nang_them_tang'),
            z.literal('xay_them_phia_sau'),
            z.literal(null),
          ])
          .nullable()
          .optional(),
        expansion_floors: z.number().int().gte(1).lte(6).nullable().optional(),
        phasing: z.boolean().nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    finishing_level: z
      .union([z.literal('co_ban'), z.literal('kha'), z.literal('cao_cap'), z.literal(null)])
      .nullable()
      .optional(),
    /** Câu hỏi quản trị viên tự thêm, kèm NHÃN đã đọc ra chữ. Đi thành cặp nhãn–câu trả lời chứ không phải khoá–giá trị: bên nhận không có tệp cấu hình của NVG, nên `bep_phu_2` không nói gì cả. Câu trả lời đã qua bộ lược danh tính. */
    custom: z
      .array(
        z
          .object({
            label: z.string().max(200),
            value: z.string().max(1000),
          })
          .strict(),
      )
      .max(60)
      .nullable()
      .describe(
        'Câu hỏi quản trị viên tự thêm, kèm NHÃN đã đọc ra chữ. Đi thành cặp nhãn–câu trả lời chứ không phải khoá–giá trị: bên nhận không có tệp cấu hình của NVG, nên `bep_phu_2` không nói gì cả. Câu trả lời đã qua bộ lược danh tính.',
      )
      .optional(),
  })
  .strict()
  .describe(
    'Bản đầu bài + khảo sát GỬI CHO mô hình của nhà cung cấp ngoài (nhánh AI, T12). Đây là DANH SÁCH CHO PHÉP: additionalProperties=false ở mọi cấp, nên một trường mới thêm vào design-brief không tự đi ra mạng. Cố ý KHÔNG có: project_id, project_code, budget_range_vnd, decision_maker, household.owner_birth_year (không tồn tại — tuổi khai theo `family[].ages`), legal_docs, completeness_score. Chữ tự do đi qua sau khi lược danh tính (scrubIdentity). Hạng dữ liệu 2.',
  );

export type AiBriefDigest = z.infer<typeof aiBriefDigestSchema>;
