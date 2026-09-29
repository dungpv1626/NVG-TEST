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
    /** Thửa đất trong hệ toạ độ CỤC BỘ: trục x chạy dọc mặt tiền, trục y đi vào chiều sâu, gốc ở góc trước-trái, đường nằm ở y = 0. Mọi kích thước dưới đây đọc trong hệ đó. */
    site: z
      .object({
        /** Hình thửa đất. Vắng mặt = chu_nhat. `hinh_thang`: mặt tiền và mặt hậu rộng khác nhau (dạng không đều phổ biến nhất trên thực địa) — khai thêm `rear_width_m`. `da_giac`: tứ giác, ngũ giác… không quy về hai dạng trên được — khai `boundary_m`. */
        shape: z
          .union([
            z.literal('chu_nhat'),
            z.literal('hinh_thang'),
            z.literal('da_giac'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Hình thửa đất. Vắng mặt = chu_nhat. `hinh_thang`: mặt tiền và mặt hậu rộng khác nhau (dạng không đều phổ biến nhất trên thực địa) — khai thêm `rear_width_m`. `da_giac`: tứ giác, ngũ giác… không quy về hai dạng trên được — khai `boundary_m`.',
          )
          .optional(),
        /** **Chiều rộng MẶT TIỀN** — cạnh giáp đường, đo tại y = 0. Trước 29/08/2026 trường này chỉ ghi "chiều rộng lô", đọc được thành ba nghĩa khác nhau khi thửa không phải hình chữ nhật. Với `da_giac`, đây là chiều dài cạnh đầu tiên của `boundary_m` (đỉnh 0 → đỉnh 1). */
        width_m: z
          .number()
          .lte(500)
          .gt(0)
          .describe(
            '**Chiều rộng MẶT TIỀN** — cạnh giáp đường, đo tại y = 0. Trước 29/08/2026 trường này chỉ ghi "chiều rộng lô", đọc được thành ba nghĩa khác nhau khi thửa không phải hình chữ nhật. Với `da_giac`, đây là chiều dài cạnh đầu tiên của `boundary_m` (đỉnh 0 → đỉnh 1).',
          ),
        /** Chiều sâu lớn nhất của thửa, đo vuông góc với mặt tiền. */
        depth_m: z
          .number()
          .lte(500)
          .gt(0)
          .describe('Chiều sâu lớn nhất của thửa, đo vuông góc với mặt tiền.'),
        /** Chiều rộng mặt hậu, đo tại y = depth_m. Chỉ có nghĩa với `shape: hinh_thang`; vắng mặt thì coi bằng `width_m`. Mô hình giả định hai cạnh bên đối xứng qua trục giữa — đủ cho việc soạn chương trình không gian; thửa lệch hẳn một bên thì khai bằng `da_giac`. */
        rear_width_m: z
          .number()
          .lte(500)
          .gt(0)
          .nullable()
          .describe(
            'Chiều rộng mặt hậu, đo tại y = depth_m. Chỉ có nghĩa với `shape: hinh_thang`; vắng mặt thì coi bằng `width_m`. Mô hình giả định hai cạnh bên đối xứng qua trục giữa — đủ cho việc soạn chương trình không gian; thửa lệch hẳn một bên thì khai bằng `da_giac`.',
          )
          .optional(),
        /** Ranh giới thửa cho `shape: da_giac` — danh sách đỉnh [x, y] mét, đi theo một chiều, KHÔNG lặp lại đỉnh đầu ở cuối. Cạnh đỉnh 0 → đỉnh 1 là cạnh giáp đường. Bộ giải làm việc trên hình chữ nhật lớn nhất nội tiếp đa giác này, không phải trên chính đa giác — xem `siteGeometry` (@nvg/shared/design). */
        boundary_m: z
          .array(z.array(z.number().gte(-500).lte(500)).min(2).max(2))
          .min(3)
          .max(24)
          .nullable()
          .describe(
            'Ranh giới thửa cho `shape: da_giac` — danh sách đỉnh [x, y] mét, đi theo một chiều, KHÔNG lặp lại đỉnh đầu ở cuối. Cạnh đỉnh 0 → đỉnh 1 là cạnh giáp đường. Bộ giải làm việc trên hình chữ nhật lớn nhất nội tiếp đa giác này, không phải trên chính đa giác — xem `siteGeometry` (@nvg/shared/design).',
          )
          .optional(),
        /** Diện tích theo giấy chứng nhận quyền sử dụng đất. KHÔNG dùng để tính toán — dùng để ĐỐI CHIẾU với diện tích suy ra từ kích thước đã khai; lệch nhiều nghĩa là một trong hai số đã nhập sai. */
        area_m2: z
          .number()
          .lte(250000)
          .gt(0)
          .nullable()
          .describe(
            'Diện tích theo giấy chứng nhận quyền sử dụng đất. KHÔNG dùng để tính toán — dùng để ĐỐI CHIẾU với diện tích suy ra từ kích thước đã khai; lệch nhiều nghĩa là một trong hai số đã nhập sai.',
          )
          .optional(),
        /** Hướng nhà: B bắc · BD đông-bắc · D đông · DN đông-nam · N nam · TN tây-nam · T tây · TB tây-bắc. */
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
            'Hướng nhà: B bắc · BD đông-bắc · D đông · DN đông-nam · N nam · TN tây-nam · T tây · TB tây-bắc.',
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
        /** Mặt đặt lối vào CHÍNH của người (cửa chính). Phải là một mặt tiếp cận được (`access_sides`). null = chưa quyết, kiến trúc sư chọn. */
        main_entrance_side: z
          .union([
            z.literal('front'),
            z.literal('back'),
            z.literal('left'),
            z.literal('right'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Mặt đặt lối vào CHÍNH của người (cửa chính). Phải là một mặt tiếp cận được (`access_sides`). null = chưa quyết, kiến trúc sư chọn.',
          )
          .optional(),
        /** Mặt đặt cổng xe / cửa chỗ để xe. Có thể khác mặt lối vào chính (ví dụ ô tô vào từ đường lớn, người vào từ hẻm). null = chưa quyết hoặc không có xe. */
        vehicle_entrance_side: z
          .union([
            z.literal('front'),
            z.literal('back'),
            z.literal('left'),
            z.literal('right'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Mặt đặt cổng xe / cửa chỗ để xe. Có thể khác mặt lối vào chính (ví dụ ô tô vào từ đường lớn, người vào từ hẻm). null = chưa quyết hoặc không có xe.',
          )
          .optional(),
        /** Tường trên cạnh giáp nhà hàng xóm là tường CHUNG hay tường RIÊNG — quyết định của kỹ sư theo từng khách hàng (Haan, 12/09/2026). null = chưa xác định. Chỉ có nghĩa ở cạnh `adjacent` là nhà hàng xóm. */
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
          .describe(
            'Tường trên cạnh giáp nhà hàng xóm là tường CHUNG hay tường RIÊNG — quyết định của kỹ sư theo từng khách hàng (Haan, 12/09/2026). null = chưa xác định. Chỉ có nghĩa ở cạnh `adjacent` là nhà hàng xóm.',
          )
          .optional(),
        legal_docs_available: z.boolean().optional(),
        /** **Cao độ tim đường** trước nhà, mét, đọc theo MỐC CHUẨN mà người đo đã chọn (cốt quốc gia, hay mốc tự đặt của khu dân cư). Chỉ có nghĩa khi `land_level_m` đo theo CÙNG mốc: phần mềm chỉ dùng HIỆU của hai số, không dùng trị tuyệt đối. Đường cao hơn đất là nguyên nhân số một phải tôn nền và bơm thoát nước ngược. */
        road_level_m: z
          .number()
          .gte(-10)
          .lte(200)
          .nullable()
          .describe(
            '**Cao độ tim đường** trước nhà, mét, đọc theo MỐC CHUẨN mà người đo đã chọn (cốt quốc gia, hay mốc tự đặt của khu dân cư). Chỉ có nghĩa khi `land_level_m` đo theo CÙNG mốc: phần mềm chỉ dùng HIỆU của hai số, không dùng trị tuyệt đối. Đường cao hơn đất là nguyên nhân số một phải tôn nền và bơm thoát nước ngược.',
          )
          .optional(),
        /** **Cao độ mặt đất tự nhiên của thửa**, mét, cùng mốc với `road_level_m`. Hiệu `land_level_m - road_level_m` quyết cốt nền tầng 1, số bậc tam cấp, dốc dắt xe và hướng thoát nước — xem `entrance`. */
        land_level_m: z
          .number()
          .gte(-10)
          .lte(200)
          .nullable()
          .describe(
            '**Cao độ mặt đất tự nhiên của thửa**, mét, cùng mốc với `road_level_m`. Hiệu `land_level_m - road_level_m` quyết cốt nền tầng 1, số bậc tam cấp, dốc dắt xe và hướng thoát nước — xem `entrance`.',
          )
          .optional(),
        /** **Mặt chịu nắng gắt** (nắng chiều tây, nắng trực xạ kéo dài) — theo bốn mặt của thửa, không theo la bàn. Hướng la bàn đã có ở `orientation`; cái phần mềm cần biết để đặt phòng, che nắng và chọn lam là nắng đập vào MẶT NÀO của lô. Hai thứ không luôn suy ra nhau: nhà hàng xóm cao tầng có thể che hẳn mặt tây. */
        harsh_sun_sides: z
          .array(z.enum(['front', 'back', 'left', 'right']))
          .nullable()
          .describe(
            '**Mặt chịu nắng gắt** (nắng chiều tây, nắng trực xạ kéo dài) — theo bốn mặt của thửa, không theo la bàn. Hướng la bàn đã có ở `orientation`; cái phần mềm cần biết để đặt phòng, che nắng và chọn lam là nắng đập vào MẶT NÀO của lô. Hai thứ không luôn suy ra nhau: nhà hàng xóm cao tầng có thể che hẳn mặt tây.',
          )
          .optional(),
        /** **Mặt đón gió mát chủ đạo** — theo bốn mặt của thửa. Quyết hướng mở cửa sổ, vị trí giếng trời và chỗ đặt sân trong. Gió nóng tây nam hay gió lùa từ hẻm hẹp KHÔNG khai ở đây; ghi vào ghi chú hiện trạng. */
        cool_wind_sides: z
          .array(z.enum(['front', 'back', 'left', 'right']))
          .nullable()
          .describe(
            '**Mặt đón gió mát chủ đạo** — theo bốn mặt của thửa. Quyết hướng mở cửa sổ, vị trí giếng trời và chỗ đặt sân trong. Gió nóng tây nam hay gió lùa từ hẻm hẹp KHÔNG khai ở đây; ghi vào ghi chú hiện trạng.',
          )
          .optional(),
        /** **Bề rộng đường hoặc hẻm trước nhà**, mét. Quyết ba thứ rất thực tế: ô tô có vào tới cửa được không, xe bê tông và xe cẩu có vào được không, và nhiều địa phương lấy bề rộng đường làm căn cứ cho chiều cao và số tầng được phép. */
        road_width_m: z
          .number()
          .gte(0)
          .lte(60)
          .nullable()
          .describe(
            '**Bề rộng đường hoặc hẻm trước nhà**, mét. Quyết ba thứ rất thực tế: ô tô có vào tới cửa được không, xe bê tông và xe cẩu có vào được không, và nhiều địa phương lấy bề rộng đường làm căn cứ cho chiều cao và số tầng được phép.',
          )
          .optional(),
        /** Khu đất có bị ngập khi mưa lớn hoặc triều cường không. `thinh_thoang` = vài lần một năm; `thuong_xuyen` = mỗi mùa mưa. Có ngập thì cốt nền, chỗ để xe, ổ cắm điện tầng trệt và hướng thoát nước đều phải tính lại — đây là thứ hỏi lúc khảo sát thì rẻ, phát hiện lúc thi công thì đắt. */
        flood_risk: z
          .union([
            z.literal('khong'),
            z.literal('thinh_thoang'),
            z.literal('thuong_xuyen'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Khu đất có bị ngập khi mưa lớn hoặc triều cường không. `thinh_thoang` = vài lần một năm; `thuong_xuyen` = mỗi mùa mưa. Có ngập thì cốt nền, chỗ để xe, ổ cắm điện tầng trệt và hướng thoát nước đều phải tính lại — đây là thứ hỏi lúc khảo sát thì rẻ, phát hiện lúc thi công thì đắt.',
          )
          .optional(),
        /** Hiện trạng xây dựng trên thửa. `nha_cu_cai_tao` và `mong_cu_giu_lai` ràng buộc phương án rất mạnh — lưới cột và móng cũ không dời được — nên phải biết TRƯỚC khi dựng mặt bằng, không phải sau. */
        existing_structure: z
          .union([
            z.literal('dat_trong'),
            z.literal('nha_cu_pha_do'),
            z.literal('nha_cu_cai_tao'),
            z.literal('mong_cu_giu_lai'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Hiện trạng xây dựng trên thửa. `nha_cu_cai_tao` và `mong_cu_giu_lai` ràng buộc phương án rất mạnh — lưới cột và móng cũ không dời được — nên phải biết TRƯỚC khi dựng mặt bằng, không phải sau.',
          )
          .optional(),
        /** Số tầng của công trình liền kề từng mặt. Nhà bên cao hơn nhiều thì mặt đó coi như mất nắng và mất gió cả năm — ảnh hưởng chỗ đặt giếng trời, sân trong và phòng ngủ mạnh hơn cả hướng la bàn. */
        neighbour_floors: z
          .object({
            /** Số tầng nhà liền kề mặt front. 0 = đất trống. */
            front: z
              .number()
              .int()
              .gte(0)
              .lte(30)
              .nullable()
              .describe('Số tầng nhà liền kề mặt front. 0 = đất trống.')
              .optional(),
            /** Số tầng nhà liền kề mặt back. 0 = đất trống. */
            back: z
              .number()
              .int()
              .gte(0)
              .lte(30)
              .nullable()
              .describe('Số tầng nhà liền kề mặt back. 0 = đất trống.')
              .optional(),
            /** Số tầng nhà liền kề mặt left. 0 = đất trống. */
            left: z
              .number()
              .int()
              .gte(0)
              .lte(30)
              .nullable()
              .describe('Số tầng nhà liền kề mặt left. 0 = đất trống.')
              .optional(),
            /** Số tầng nhà liền kề mặt right. 0 = đất trống. */
            right: z
              .number()
              .int()
              .gte(0)
              .lte(30)
              .nullable()
              .describe('Số tầng nhà liền kề mặt right. 0 = đất trống.')
              .optional(),
          })
          .strict()
          .nullable()
          .describe(
            'Số tầng của công trình liền kề từng mặt. Nhà bên cao hơn nhiều thì mặt đó coi như mất nắng và mất gió cả năm — ảnh hưởng chỗ đặt giếng trời, sân trong và phòng ngủ mạnh hơn cả hướng la bàn.',
          )
          .optional(),
      })
      .strict()
      .describe(
        'Thửa đất trong hệ toạ độ CỤC BỘ: trục x chạy dọc mặt tiền, trục y đi vào chiều sâu, gốc ở góc trước-trái, đường nằm ở y = 0. Mọi kích thước dưới đây đọc trong hệ đó.',
      ),
    floors: z.number().int().gte(1).lte(12),
    family: z
      .array(
        z
          .object({
            role: z.enum(['ong_ba', 'vo_chong', 'con', 'khach', 'nguoi_giup_viec']),
            count: z.number().int().gte(0).lte(20),
            /** Ghim phòng ngủ của nhóm thành viên này vào đúng tầng này. Số tầng THẬT, không phải nguyện vọng tương đối: biểu mẫu dựng danh sách chọn từ chính `floors`, nên người khai không chọn được một tầng không tồn tại. Ghim vượt quá `floors` (vì số tầng giảm sau khi đã khai) bị bỏ kèm cảnh báo, không làm hỏng lượt soạn. `null`/vắng mặt = để Lớp 2 tự xếp. */
            floor: z
              .number()
              .int()
              .gte(1)
              .nullable()
              .describe(
                'Ghim phòng ngủ của nhóm thành viên này vào đúng tầng này. Số tầng THẬT, không phải nguyện vọng tương đối: biểu mẫu dựng danh sách chọn từ chính `floors`, nên người khai không chọn được một tầng không tồn tại. Ghim vượt quá `floors` (vì số tầng giảm sau khi đã khai) bị bỏ kèm cảnh báo, không làm hỏng lượt soạn. `null`/vắng mặt = để Lớp 2 tự xếp.',
              )
              .optional(),
            /** CÁCH KHAI CŨ — nguyện vọng tầng tương đối. Vẫn đọc được để các đầu bài đã lưu không mất câu trả lời, nhưng biểu mẫu không sinh thêm giá trị mới: "tầng giữa" của một căn hai tầng không trỏ vào tầng nào, và nó dùng một bộ từ vựng khác hẳn `required_spaces[].floor` cho cùng một khái niệm. `floor` thắng khi cả hai cùng có. */
            floor_pref: z
              .union([z.literal('low'), z.literal('mid'), z.literal('top'), z.literal(null)])
              .nullable()
              .describe(
                'CÁCH KHAI CŨ — nguyện vọng tầng tương đối. Vẫn đọc được để các đầu bài đã lưu không mất câu trả lời, nhưng biểu mẫu không sinh thêm giá trị mới: "tầng giữa" của một căn hai tầng không trỏ vào tầng nào, và nó dùng một bộ từ vựng khác hẳn `required_spaces[].floor` cho cùng một khái niệm. `floor` thắng khi cả hai cùng có.',
              )
              .optional(),
            needs: z.array(z.string()).optional(),
            /** Phòng ngủ của thành viên này KHÉP KÍN — khu vệ sinh nằm bên trong phòng, không mở ra hành lang. Lớp 2 sinh thêm một `wc` mang `enclosed_in` trỏ về phòng đó, và khu vệ sinh này KHÔNG tính vào định mức wc chung của tầng. Trước 06/09/2026 điều này khai bằng chuỗi `"wc"` trong `needs`, nhưng `wc` thuộc nhóm Lớp 2 tự suy nên chuỗi đó bị bỏ qua hoàn toàn — biểu mẫu có ô chọn mà chọn hay không đều ra cùng một chương trình. */
            ensuite: z
              .boolean()
              .describe(
                'Phòng ngủ của thành viên này KHÉP KÍN — khu vệ sinh nằm bên trong phòng, không mở ra hành lang. Lớp 2 sinh thêm một `wc` mang `enclosed_in` trỏ về phòng đó, và khu vệ sinh này KHÔNG tính vào định mức wc chung của tầng. Trước 06/09/2026 điều này khai bằng chuỗi `"wc"` trong `needs`, nhưng `wc` thuộc nhóm Lớp 2 tự suy nên chuỗi đó bị bỏ qua hoàn toàn — biểu mẫu có ô chọn mà chọn hay không đều ra cùng một chương trình.',
              )
              .optional(),
            /** Tuổi từng người trong nhóm, năm. Cố ý là TUỔI chứ không phải năm sinh: tuổi là thứ quyết định không gian (trẻ dưới 6 ngủ cùng bố mẹ, trẻ đi học cần góc học, người trên 70 nên ở tầng trệt và tránh bậc), còn năm sinh là dữ liệu định danh và còn kéo theo chuyện cung mệnh — thứ phần mềm không được tự quyết (PRD 2.3). Số phần tử nên bằng `count`; lệch thì bộ soát mâu thuẫn hỏi lại chứ không chặn. */
            ages: z
              .array(z.number().int().gte(0).lte(120))
              .max(20)
              .nullable()
              .describe(
                'Tuổi từng người trong nhóm, năm. Cố ý là TUỔI chứ không phải năm sinh: tuổi là thứ quyết định không gian (trẻ dưới 6 ngủ cùng bố mẹ, trẻ đi học cần góc học, người trên 70 nên ở tầng trệt và tránh bậc), còn năm sinh là dữ liệu định danh và còn kéo theo chuyện cung mệnh — thứ phần mềm không được tự quyết (PRD 2.3). Số phần tử nên bằng `count`; lệch thì bộ soát mâu thuẫn hỏi lại chứ không chặn.',
              )
              .optional(),
          })
          .strict(),
      )
      .optional(),
    /** Không gian bắt buộc có. MỘT PHẦN TỬ = MỘT PHÒNG, và cùng một mã được lặp lại nhiều lần khi cần ghim từng phòng vào tầng riêng hoặc cho từng phòng một diện tích riêng — trước 06/09/2026 mỗi phần tử là một LOẠI, nên một căn có bảy phòng ngủ chỉ ghim được chung một dòng. Phòng ngủ vẫn suy từ `family`; các phần tử `bedroom`/`master_bedroom` khai tường minh ở đây GHI ĐÈ lên bấy nhiêu phòng đầu tiên trong số đó, không cộng thêm. "Có sân trong hay không" khai ở đây bằng mã `courtyard`; VỊ TRÍ các sân khai ở `massing.yards`. */
    required_spaces: z
      .array(
        z
          .object({
            /** Mã không gian, lấy từ kb/room_vocabulary.yaml. Mã không có trong từ vựng đó thì không rule nào của rule pack nhắm tới, và nó đi qua cả engine mà chưa từng bị kiểm quy chuẩn. */
            type: z
              .string()
              .describe(
                'Mã không gian, lấy từ kb/room_vocabulary.yaml. Mã không có trong từ vựng đó thì không rule nào của rule pack nhắm tới, và nó đi qua cả engine mà chưa từng bị kiểm quy chuẩn.',
              ),
            /** Ghim cứng vào đúng tầng này. `null`/vắng mặt = để Lớp 2 tự xếp theo nguyện vọng và cân tải (mặc định, hành vi hiện tại). */
            floor: z
              .number()
              .int()
              .gte(1)
              .nullable()
              .describe(
                'Ghim cứng vào đúng tầng này. `null`/vắng mặt = để Lớp 2 tự xếp theo nguyện vọng và cân tải (mặc định, hành vi hiện tại).',
              )
              .optional(),
            /** Diện tích TỐI THIỂU của không gian này, m² — phòng được lớn hơn, không được nhỏ hơn (Haan, 13/09/2026). Không phải diện tích chốt cứng. Tổng các mức tối thiểu phải vừa phần sàn xây được sau khoảng lùi, sân và mật độ — bộ kiểm đầu bài đối chiếu. Vắng mặt = để thiết kế tự định. */
            area_m2: z
              .number()
              .lte(1000)
              .gt(0)
              .nullable()
              .describe(
                'Diện tích TỐI THIỂU của không gian này, m² — phòng được lớn hơn, không được nhỏ hơn (Haan, 13/09/2026). Không phải diện tích chốt cứng. Tổng các mức tối thiểu phải vừa phần sàn xây được sau khoảng lùi, sân và mật độ — bộ kiểm đầu bài đối chiếu. Vắng mặt = để thiết kế tự định.',
              )
              .optional(),
            /** CHỈ có nghĩa với `bedroom`/`master_bedroom`: phòng ngủ này KHÉP KÍN — khu vệ sinh nằm bên trong, không mở ra hành lang và không tính vào định mức wc chung của tầng. Sinh ra vì một dòng phòng ngủ khai tường minh GHI ĐÈ lên một phòng suy từ `family`: trước 07/09/2026 phần ghi đè bỏ luôn khu vệ sinh khép kín của phòng bị thay, im lặng — nên vừa ghim được tầng vừa mất một khu vệ sinh. Vắng mặt/`null` = lấy theo `family[].ensuite` của phòng bị ghi đè, nên đầu bài cũ giữ nguyên hành vi. */
            ensuite: z
              .boolean()
              .nullable()
              .describe(
                'CHỈ có nghĩa với `bedroom`/`master_bedroom`: phòng ngủ này KHÉP KÍN — khu vệ sinh nằm bên trong, không mở ra hành lang và không tính vào định mức wc chung của tầng. Sinh ra vì một dòng phòng ngủ khai tường minh GHI ĐÈ lên một phòng suy từ `family`: trước 07/09/2026 phần ghi đè bỏ luôn khu vệ sinh khép kín của phòng bị thay, im lặng — nên vừa ghim được tầng vừa mất một khu vệ sinh. Vắng mặt/`null` = lấy theo `family[].ensuite` của phòng bị ghi đè, nên đầu bài cũ giữ nguyên hành vi.',
              )
              .optional(),
            /** Tiện ích bổ sung khách yêu cầu cho RIÊNG phòng này, viết bằng lời ("bồn tắm nằm", "quầy bar nhỏ", "cửa sổ nhìn ra sân"). Engine KHÔNG đọc: đây là ghi chú cho kiến trúc sư, đi theo artifact để nó không rơi lại vào Zalo. Cố ý KHÔNG quy về mã phòng — một tiện ích không phải một không gian, và bịa ra một mã cho nó là đưa cái bồn tắm vào cây chia không gian. */
            amenities: z
              .string()
              .max(500)
              .nullable()
              .describe(
                'Tiện ích bổ sung khách yêu cầu cho RIÊNG phòng này, viết bằng lời ("bồn tắm nằm", "quầy bar nhỏ", "cửa sổ nhìn ra sân"). Engine KHÔNG đọc: đây là ghi chú cho kiến trúc sư, đi theo artifact để nó không rơi lại vào Zalo. Cố ý KHÔNG quy về mã phòng — một tiện ích không phải một không gian, và bịa ra một mã cho nó là đưa cái bồn tắm vào cây chia không gian.',
              )
              .optional(),
          })
          .strict(),
      )
      .describe(
        'Không gian bắt buộc có. MỘT PHẦN TỬ = MỘT PHÒNG, và cùng một mã được lặp lại nhiều lần khi cần ghim từng phòng vào tầng riêng hoặc cho từng phòng một diện tích riêng — trước 06/09/2026 mỗi phần tử là một LOẠI, nên một căn có bảy phòng ngủ chỉ ghim được chung một dòng. Phòng ngủ vẫn suy từ `family`; các phần tử `bedroom`/`master_bedroom` khai tường minh ở đây GHI ĐÈ lên bấy nhiêu phòng đầu tiên trong số đó, không cộng thêm. "Có sân trong hay không" khai ở đây bằng mã `courtyard`; VỊ TRÍ các sân khai ở `massing.yards`.',
      )
      .optional(),
    /** Số xe CẦN CHỖ ĐỖ — thay cho ô chữ tự do «để ô tô, 2 xe máy». Diện tích chỗ để xe suy từ đây theo `kb/brief_fidelity.yaml`. */
    parking: z
      .object({
        /** Số ô tô cần chỗ đỗ trong nhà. */
        cars: z
          .number()
          .int()
          .gte(0)
          .lte(10)
          .nullable()
          .describe('Số ô tô cần chỗ đỗ trong nhà.')
          .optional(),
        /** Số xe máy, xe máy điện, xe đạp điện. */
        motorbikes: z
          .number()
          .int()
          .gte(0)
          .lte(30)
          .nullable()
          .describe('Số xe máy, xe máy điện, xe đạp điện.')
          .optional(),
        /** Cỡ ô tô lớn nhất cần đỗ. Chỗ đỗ cho xe gầm thấp và cho xe bán tải chênh nhau gần một mét chiều dài và cả chiều cao cửa — một ô «có ô tô» duy nhất không đủ để chừa đúng chỗ. */
        car_size: z
          .union([
            z.literal('gam_thap'),
            z.literal('gam_cao'),
            z.literal('ban_tai'),
            z.literal('xe_7_cho'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Cỡ ô tô lớn nhất cần đỗ. Chỗ đỗ cho xe gầm thấp và cho xe bán tải chênh nhau gần một mét chiều dài và cả chiều cao cửa — một ô «có ô tô» duy nhất không đủ để chừa đúng chỗ.',
          )
          .optional(),
        /** Có sạc xe điện trong nhà không — kéo theo một tuyến điện riêng và một vị trí ổ sạc cố định ở chỗ để xe. */
        ev_charging: z
          .boolean()
          .nullable()
          .describe(
            'Có sạc xe điện trong nhà không — kéo theo một tuyến điện riêng và một vị trí ổ sạc cố định ở chỗ để xe.',
          )
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Số xe CẦN CHỖ ĐỖ — thay cho ô chữ tự do «để ô tô, 2 xe máy». Diện tích chỗ để xe suy từ đây theo `kb/brief_fidelity.yaml`.',
      )
      .optional(),
    /** Ý ĐỒ về tổ hợp khối, không phải hình học đã giải. Nhà phố là trường hợp một cánh nhà, khoảng lùi bằng không (04-layer3-floorplan) nên phần này để trống; với biệt thự và nhà vườn, lô rộng không tự ràng buộc như nhà phố nên đây là nguồn thu hẹp lời giải chính (01-overview 1.2). Mọi trường ở đây là LỰA CHỌN RỜI RẠC — bộ giải mới là nơi gán số đo (nguyên tắc bất biến 2). */
    massing: z
      .object({
        /** Số cánh nhà mong muốn. Nhà phố luôn là 1; biệt thự 1–3. */
        wings_preferred: z
          .number()
          .int()
          .gte(1)
          .lte(3)
          .nullable()
          .describe('Số cánh nhà mong muốn. Nhà phố luôn là 1; biệt thự 1–3.')
          .optional(),
        /** Hình bao mong muốn — hợp của các cánh nhà. Đi kèm `wings_preferred`: hình L/U/T không có nghĩa với một cánh. */
        footprint_shape: z
          .union([
            z.literal('chu_nhat'),
            z.literal('L'),
            z.literal('U'),
            z.literal('T'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Hình bao mong muốn — hợp của các cánh nhà. Đi kèm `wings_preferred`: hình L/U/T không có nghĩa với một cánh.',
          )
          .optional(),
        /** Số lõi thang. Nhà phố 1; biệt thự 1–2 (chính, và phụ hoặc dịch vụ). */
        cores_preferred: z
          .number()
          .int()
          .gte(1)
          .lte(2)
          .nullable()
          .describe('Số lõi thang. Nhà phố 1; biệt thự 1–2 (chính, và phụ hoặc dịch vụ).')
          .optional(),
        /** Có thang phụ hoặc lối dịch vụ riêng cho người giúp việc và bếp không. */
        service_core: z
          .boolean()
          .describe('Có thang phụ hoặc lối dịch vụ riêng cho người giúp việc và bếp không.')
          .optional(),
        /** Tổ chức sân vườn — sân nằm ở đâu so với khối nhà. Khác `required_spaces`: ở đó khai CÓ sân, ở đây khai sân NẰM ĐÂU. */
        yards: z
          .array(z.enum(['san_truoc', 'san_ben', 'san_trong', 'san_sau']))
          .describe(
            'Tổ chức sân vườn — sân nằm ở đâu so với khối nhà. Khác `required_spaces`: ở đó khai CÓ sân, ở đây khai sân NẰM ĐÂU.',
          )
          .optional(),
        /** Khoảng sân MONG MUỐN theo từng mặt, mét, đo từ RANH ĐẤT tới mặt ngoài khối nhà. Khác `site.setback_required_m` (quy hoạch bắt buộc): đây là ý muốn của gia chủ. Phần đất xây được lấy mức LỚN HƠN của hai số trên mỗi mặt. */
        yard_depth_m: z
          .object({
            front: z.number().gte(0).optional(),
            back: z.number().gte(0).optional(),
            left: z.number().gte(0).optional(),
            right: z.number().gte(0).optional(),
          })
          .strict()
          .nullable()
          .describe(
            'Khoảng sân MONG MUỐN theo từng mặt, mét, đo từ RANH ĐẤT tới mặt ngoài khối nhà. Khác `site.setback_required_m` (quy hoạch bắt buộc): đây là ý muốn của gia chủ. Phần đất xây được lấy mức LỚN HƠN của hai số trên mỗi mặt.',
          )
          .optional(),
        /** Quan hệ trong nhà với sân vườn (01-overview 1.2). Mở tối đa = nhiều cửa kính lớn nhìn ra sân; kín đáo = ưu tiên riêng tư với bên ngoài. */
        indoor_outdoor: z
          .union([
            z.literal('mo_toi_da'),
            z.literal('can_bang'),
            z.literal('kin_dao'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Quan hệ trong nhà với sân vườn (01-overview 1.2). Mở tối đa = nhiều cửa kính lớn nhìn ra sân; kín đáo = ưu tiên riêng tư với bên ngoài.',
          )
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Ý ĐỒ về tổ hợp khối, không phải hình học đã giải. Nhà phố là trường hợp một cánh nhà, khoảng lùi bằng không (04-layer3-floorplan) nên phần này để trống; với biệt thự và nhà vườn, lô rộng không tự ràng buộc như nhà phố nên đây là nguồn thu hẹp lời giải chính (01-overview 1.2). Mọi trường ở đây là LỰA CHỌN RỜI RẠC — bộ giải mới là nơi gán số đo (nguyên tắc bất biến 2).',
      )
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
    /** Gia chủ: nghề nghiệp, tín ngưỡng, và việc có kết hợp kinh doanh tại nhà hay không. */
    household: z
      .object({
        /** Ngành nghề của gia chủ, viết bằng lời. Không phải để phần mềm phân loại — để kiến trúc sư biết nhịp sinh hoạt và nhu cầu không gian làm việc. Đi qua bộ lược danh tính trước khi gửi mô hình. */
        occupation: z
          .string()
          .max(200)
          .nullable()
          .describe(
            'Ngành nghề của gia chủ, viết bằng lời. Không phải để phần mềm phân loại — để kiến trúc sư biết nhịp sinh hoạt và nhu cầu không gian làm việc. Đi qua bộ lược danh tính trước khi gửi mô hình.',
          )
          .optional(),
        /** Tín ngưỡng của gia đình — quyết định KHÔNG GIAN THỜ: bàn thờ gia tiên cần phòng riêng hoặc vị trí trang trọng ở tầng trên; bàn thờ Chúa thường gắn tường phòng khách; không thờ thì không dành chỗ. Đây là dữ liệu để dành CHỖ, phần mềm không suy ra nghi lễ hay hướng đặt. */
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
          .describe(
            'Tín ngưỡng của gia đình — quyết định KHÔNG GIAN THỜ: bàn thờ gia tiên cần phòng riêng hoặc vị trí trang trọng ở tầng trên; bàn thờ Chúa thường gắn tường phòng khách; không thờ thì không dành chỗ. Đây là dữ liệu để dành CHỖ, phần mềm không suy ra nghi lễ hay hướng đặt.',
          )
          .optional(),
        /** Cách bố trí nơi thờ. `phong_tho_rieng` sinh một phòng thật có diện tích; `chung_phong_khach` là một khu trong phòng khách (từ vựng phòng cho phép ghép `living` với `altar_room`); `tren_san_thuong` là gian thờ trên tầng mái. */
        altar_arrangement: z
          .union([
            z.literal('phong_tho_rieng'),
            z.literal('chung_phong_khach'),
            z.literal('tren_san_thuong'),
            z.literal('khong_co'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Cách bố trí nơi thờ. `phong_tho_rieng` sinh một phòng thật có diện tích; `chung_phong_khach` là một khu trong phòng khách (từ vựng phòng cho phép ghép `living` với `altar_room`); `tren_san_thuong` là gian thờ trên tầng mái.',
          )
          .optional(),
        /** Tầng đặt nơi thờ, nếu gia chủ đã quyết. Để trống là để kiến trúc sư đề xuất. */
        altar_floor: z
          .number()
          .int()
          .gte(1)
          .lte(12)
          .nullable()
          .describe('Tầng đặt nơi thờ, nếu gia chủ đã quyết. Để trống là để kiến trúc sư đề xuất.')
          .optional(),
        /** Gia đình có xem phong thuỷ không. `co_thay_rieng` = đã có thầy và sẽ đưa yêu cầu cụ thể — khi ấy mọi ràng buộc phải ghi vào `feng_shui_notes`, phần mềm KHÔNG tự luận. Ranh giới PRD 2.3: hệ thống không tự quyết nội dung chuyên môn, và cung mệnh không phải việc của máy. */
        feng_shui: z
          .union([
            z.literal('khong_xem'),
            z.literal('co_xem'),
            z.literal('co_thay_rieng'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Gia đình có xem phong thuỷ không. `co_thay_rieng` = đã có thầy và sẽ đưa yêu cầu cụ thể — khi ấy mọi ràng buộc phải ghi vào `feng_shui_notes`, phần mềm KHÔNG tự luận. Ranh giới PRD 2.3: hệ thống không tự quyết nội dung chuyên môn, và cung mệnh không phải việc của máy.',
          )
          .optional(),
        /** Yêu cầu phong thuỷ ĐÃ ĐƯỢC NGƯỜI quyết, ghi thành câu ràng buộc dùng được: «cửa chính không đối cửa sau», «bếp không nhìn thẳng cửa chính», «hướng tốt: Đông Nam». Ô này là nơi duy nhất phong thuỷ đi vào phương án — viết lời chung chung thì không ràng buộc được gì. */
        feng_shui_notes: z
          .string()
          .max(1000)
          .nullable()
          .describe(
            'Yêu cầu phong thuỷ ĐÃ ĐƯỢC NGƯỜI quyết, ghi thành câu ràng buộc dùng được: «cửa chính không đối cửa sau», «bếp không nhìn thẳng cửa chính», «hướng tốt: Đông Nam». Ô này là nơi duy nhất phong thuỷ đi vào phương án — viết lời chung chung thì không ràng buộc được gì.',
          )
          .optional(),
        /** Điều kiêng kỵ khác của gia đình: «khu vệ sinh không nằm trên bàn thờ», «không có phòng nào cửa mở thẳng ra cầu thang», «tránh số tầng 4». Tách khỏi `feng_shui_notes` vì nhiều gia đình có kiêng kỵ mà không xem phong thuỷ. */
        taboos: z
          .string()
          .max(1000)
          .nullable()
          .describe(
            'Điều kiêng kỵ khác của gia đình: «khu vệ sinh không nằm trên bàn thờ», «không có phòng nào cửa mở thẳng ra cầu thang», «tránh số tầng 4». Tách khỏi `feng_shui_notes` vì nhiều gia đình có kiêng kỵ mà không xem phong thuỷ.',
          )
          .optional(),
        /** Kết hợp kinh doanh tại nhà — thứ đổi hẳn mặt bằng tầng trệt và cả lối vào. Nhà ở có cửa hàng KHÔNG phải nhà ở thêm một phòng: nó là hai luồng người phải tách nhau. */
        home_business: z
          .object({
            /** Hình thức kinh doanh tại nhà. `khong` = thuần ở. */
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
              .describe('Hình thức kinh doanh tại nhà. `khong` = thuần ở.')
              .optional(),
            /** Số tầng dành cho kinh doanh, tính từ tầng 1 lên. Cố ý là SỐ LƯỢNG chứ không phải danh sách tầng: cửa hàng và văn phòng tại nhà luôn chiếm các tầng dưới liền nhau — chừa một tầng kinh doanh kẹp giữa hai tầng ở là bố cục không ai làm, và một ô số thì biểu mẫu nào cũng nhập được. */
            floor_count: z
              .number()
              .int()
              .gte(1)
              .lte(12)
              .nullable()
              .describe(
                'Số tầng dành cho kinh doanh, tính từ tầng 1 lên. Cố ý là SỐ LƯỢNG chứ không phải danh sách tầng: cửa hàng và văn phòng tại nhà luôn chiếm các tầng dưới liền nhau — chừa một tầng kinh doanh kẹp giữa hai tầng ở là bố cục không ai làm, và một ô số thì biểu mẫu nào cũng nhập được.',
              )
              .optional(),
            /** Có lối vào riêng cho khách, tách khỏi lối sinh hoạt của gia đình không. Đây là câu hỏi quyết định nhất của nhóm này: có thì mặt tiền phải chừa hai cửa và luồng đi trong nhà chia đôi. */
            separate_entrance: z
              .boolean()
              .nullable()
              .describe(
                'Có lối vào riêng cho khách, tách khỏi lối sinh hoạt của gia đình không. Đây là câu hỏi quyết định nhất của nhóm này: có thì mặt tiền phải chừa hai cửa và luồng đi trong nhà chia đôi.',
              )
              .optional(),
            /** Có khu vệ sinh riêng cho khách không — khách dùng chung WC gia đình là điều gia chủ thường chỉ nhận ra khi đã xây xong. */
            customer_wc: z
              .boolean()
              .nullable()
              .describe(
                'Có khu vệ sinh riêng cho khách không — khách dùng chung WC gia đình là điều gia chủ thường chỉ nhận ra khi đã xây xong.',
              )
              .optional(),
            /** Số người làm việc tại nhà, kể cả gia chủ. Quyết diện tích và số chỗ vệ sinh. */
            staff_count: z
              .number()
              .int()
              .gte(0)
              .lte(50)
              .nullable()
              .describe(
                'Số người làm việc tại nhà, kể cả gia chủ. Quyết diện tích và số chỗ vệ sinh.',
              )
              .optional(),
            /** Ghi chú thêm về hoạt động kinh doanh: mặt hàng, giờ mở cửa, xe giao hàng, tiếng ồn, mùi. */
            note: z
              .string()
              .max(1000)
              .nullable()
              .describe(
                'Ghi chú thêm về hoạt động kinh doanh: mặt hàng, giờ mở cửa, xe giao hàng, tiếng ồn, mùi.',
              )
              .optional(),
          })
          .strict()
          .nullable()
          .describe(
            'Kết hợp kinh doanh tại nhà — thứ đổi hẳn mặt bằng tầng trệt và cả lối vào. Nhà ở có cửa hàng KHÔNG phải nhà ở thêm một phòng: nó là hai luồng người phải tách nhau.',
          )
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Gia chủ: nghề nghiệp, tín ngưỡng, và việc có kết hợp kinh doanh tại nhà hay không.',
      )
      .optional(),
    /** Thói quen sinh hoạt của gia đình — phần trả lời câu «nhà này được dùng thế nào», thứ mà số phòng không nói ra. */
    lifestyle: z
      .object({
        /** Nếp nấu ăn. `nau_nhieu_chien_xao` là bếp Việt đúng nghĩa: chiên xào nhiều dầu mỡ, nhiều mùi — bếp phải KÍN hoặc có bếp phụ, và không nên mở thông phòng khách dù phong cách đang chuộng. `it_nau` thì bếp mở là hợp lý. */
        cooking: z
          .union([
            z.literal('nau_nhieu_chien_xao'),
            z.literal('nau_hang_ngay_don_gian'),
            z.literal('it_nau'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Nếp nấu ăn. `nau_nhieu_chien_xao` là bếp Việt đúng nghĩa: chiên xào nhiều dầu mỡ, nhiều mùi — bếp phải KÍN hoặc có bếp phụ, và không nên mở thông phòng khách dù phong cách đang chuộng. `it_nau` thì bếp mở là hợp lý.',
          )
          .optional(),
        /** Có cần bếp phụ (bếp Việt) tách khỏi bếp đẹp không. */
        second_kitchen: z
          .boolean()
          .nullable()
          .describe('Có cần bếp phụ (bếp Việt) tách khỏi bếp đẹp không.')
          .optional(),
        /** Cả nhà ăn ở đâu. Quyết phòng ăn có là một phòng thật hay chỉ là quầy kề bếp. */
        dining_place: z
          .union([
            z.literal('ban_an_rieng'),
            z.literal('quay_bep'),
            z.literal('linh_hoat'),
            z.literal(null),
          ])
          .nullable()
          .describe('Cả nhà ăn ở đâu. Quyết phòng ăn có là một phòng thật hay chỉ là quầy kề bếp.')
          .optional(),
        /** Tần suất tiếp khách. Tiếp khách thường xuyên kéo theo phòng khách rộng hơn, một khu vệ sinh khách ở tầng trệt, và chỗ để xe cho khách. */
        guests: z
          .union([
            z.literal('thuong_xuyen'),
            z.literal('thinh_thoang'),
            z.literal('it'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Tần suất tiếp khách. Tiếp khách thường xuyên kéo theo phòng khách rộng hơn, một khu vệ sinh khách ở tầng trệt, và chỗ để xe cho khách.',
          )
          .optional(),
        /** Có khách ở lại qua đêm không — nếu có thì cần một phòng ngủ khách thật, không phải sofa phòng khách. */
        overnight_guests: z
          .boolean()
          .nullable()
          .describe(
            'Có khách ở lại qua đêm không — nếu có thì cần một phòng ngủ khách thật, không phải sofa phòng khách.',
          )
          .optional(),
        /** Có người làm việc tại nhà thường xuyên không — kéo theo phòng làm việc yên tĩnh, tách khỏi khu sinh hoạt chung. */
        work_from_home: z
          .boolean()
          .nullable()
          .describe(
            'Có người làm việc tại nhà thường xuyên không — kéo theo phòng làm việc yên tĩnh, tách khỏi khu sinh hoạt chung.',
          )
          .optional(),
        /** Có người làm ca đêm, ngủ ban ngày không — phòng ngủ phải tránh mặt ồn và tránh nằm cạnh bếp hay phòng khách. */
        night_shift: z
          .boolean()
          .nullable()
          .describe(
            'Có người làm ca đêm, ngủ ban ngày không — phòng ngủ phải tránh mặt ồn và tránh nằm cạnh bếp hay phòng khách.',
          )
          .optional(),
        /** Có người đi lại khó khăn, dùng gậy hoặc xe lăn không. Trả lời «có» là ràng buộc cứng lên phương án: một phòng ngủ và một khu vệ sinh ở tầng trệt, hạn chế bậc, cửa và hành lang đủ rộng — không phải tiện nghi thêm. */
        reduced_mobility: z
          .boolean()
          .nullable()
          .describe(
            'Có người đi lại khó khăn, dùng gậy hoặc xe lăn không. Trả lời «có» là ràng buộc cứng lên phương án: một phòng ngủ và một khu vệ sinh ở tầng trệt, hạn chế bậc, cửa và hành lang đủ rộng — không phải tiện nghi thêm.',
          )
          .optional(),
        /** Cách phơi đồ. Phơi nắng ngoài trời đòi một sân hoặc ban công phơi có nắng thật và kín đáo với hàng xóm — chỗ này bị bỏ quên thì quần áo cuối cùng phơi ở mặt tiền. */
        drying: z
          .union([
            z.literal('phoi_nang_ngoai_troi'),
            z.literal('may_say_trong_nha'),
            z.literal('ca_hai'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Cách phơi đồ. Phơi nắng ngoài trời đòi một sân hoặc ban công phơi có nắng thật và kín đáo với hàng xóm — chỗ này bị bỏ quên thì quần áo cuối cùng phơi ở mặt tiền.',
          )
          .optional(),
        /** Thú nuôi trong nhà. Kéo theo chỗ tắm và chỗ ở cho thú, cửa sân, và vật liệu sàn. */
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
          .describe(
            'Thú nuôi trong nhà. Kéo theo chỗ tắm và chỗ ở cho thú, cửa sân, và vật liệu sàn.',
          )
          .optional(),
        /** Nếp sinh hoạt hằng ngày viết bằng lời: giờ giấc, ai dậy sớm, cả nhà quây quần ở đâu buổi tối, cuối tuần dùng nhà thế nào. Đây là ô giàu ý nhất của cả đầu bài — đi NGUYÊN VĂN tới mô hình, không tóm tắt. */
        daily_rhythm: z
          .string()
          .max(1000)
          .nullable()
          .describe(
            'Nếp sinh hoạt hằng ngày viết bằng lời: giờ giấc, ai dậy sớm, cả nhà quây quần ở đâu buổi tối, cuối tuần dùng nhà thế nào. Đây là ô giàu ý nhất của cả đầu bài — đi NGUYÊN VĂN tới mô hình, không tóm tắt.',
          )
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Thói quen sinh hoạt của gia đình — phần trả lời câu «nhà này được dùng thế nào», thứ mà số phòng không nói ra.',
      )
      .optional(),
    /** Nhu cầu lưu trữ. Tách riêng khỏi `required_spaces` vì phần lớn chỗ cất KHÔNG phải một phòng — là tủ âm, gầm thang, hốc tường — nhưng vẫn phải được tính diện tích từ đầu. */
    storage: z
      .object({
        /** Lượng đồ cần cất giữ nói chung. `nhieu` nghĩa là chỗ chứa phải được tính như một không gian thật, không phải phần còn thừa sau khi xếp xong các phòng. */
        level: z
          .union([z.literal('it'), z.literal('vua'), z.literal('nhieu'), z.literal(null)])
          .nullable()
          .describe(
            'Lượng đồ cần cất giữ nói chung. `nhieu` nghĩa là chỗ chứa phải được tính như một không gian thật, không phải phần còn thừa sau khi xếp xong các phòng.',
          )
          .optional(),
        /** Những thứ cụ thể cần chỗ cất. Khai ra từng loại thì chỗ chứa đặt đúng chỗ: đồ theo mùa cất trên cao, thực phẩm kề bếp, dụng cụ sửa chữa kề chỗ để xe. */
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
          .describe(
            'Những thứ cụ thể cần chỗ cất. Khai ra từng loại thì chỗ chứa đặt đúng chỗ: đồ theo mùa cất trên cao, thực phẩm kề bếp, dụng cụ sửa chữa kề chỗ để xe.',
          )
          .optional(),
        /** Ghi chú thêm về nhu cầu lưu trữ: món đồ khổ lớn, bộ sưu tập, hàng hoá kinh doanh. */
        note: z
          .string()
          .max(1000)
          .nullable()
          .describe(
            'Ghi chú thêm về nhu cầu lưu trữ: món đồ khổ lớn, bộ sưu tập, hàng hoá kinh doanh.',
          )
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Nhu cầu lưu trữ. Tách riêng khỏi `required_spaces` vì phần lớn chỗ cất KHÔNG phải một phòng — là tủ âm, gầm thang, hốc tường — nhưng vẫn phải được tính diện tích từ đầu.',
      )
      .optional(),
    /** Giao thông đứng: thang bộ và thang máy. */
    vertical: z
      .object({
        /** Thang máy gia đình. Ba câu trả lời thật sự khác nhau về mặt bằng: `lam_ngay` sinh một ô thang máy có cửa và có phòng kỹ thuật; `chua_cho` vẫn chiếm đúng ô ấy nhưng tạm dùng làm kho hoặc giếng trời, và móng, hố PIT, lỗ sàn phải chừa ngay lúc này — bỏ qua thì sau không lắp được; `khong` thì không chừa gì. */
        elevator: z
          .union([
            z.literal('khong'),
            z.literal('lam_ngay'),
            z.literal('chua_cho'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Thang máy gia đình. Ba câu trả lời thật sự khác nhau về mặt bằng: `lam_ngay` sinh một ô thang máy có cửa và có phòng kỹ thuật; `chua_cho` vẫn chiếm đúng ô ấy nhưng tạm dùng làm kho hoặc giếng trời, và móng, hố PIT, lỗ sàn phải chừa ngay lúc này — bỏ qua thì sau không lắp được; `khong` thì không chừa gì.',
          )
          .optional(),
        /** Tải trọng thang máy — thông tin cho kỹ sư và hãng thang. KHÔNG dùng để đoán kích thước giếng: kích thước lấy từ hai trường `elevator_shaft_*_m` (Haan 25/09/2026). */
        elevator_capacity: z
          .union([
            z.literal('nho_350kg'),
            z.literal('vua_450kg'),
            z.literal('lon_630kg'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Tải trọng thang máy — thông tin cho kỹ sư và hãng thang. KHÔNG dùng để đoán kích thước giếng: kích thước lấy từ hai trường `elevator_shaft_*_m` (Haan 25/09/2026).',
          )
          .optional(),
        /** Bề RỘNG lọt lòng giếng thang máy, mét, theo bản vẽ của hãng thang gia chủ chọn. Chương trình không đoán số này (Haan 25/09/2026): khai thang máy mà để trống thì đầu bài bị báo mâu thuẫn nghiêm trọng và chưa dựng được phương án. */
        elevator_shaft_width_m: z
          .number()
          .gte(0.8)
          .lte(4)
          .nullable()
          .describe(
            'Bề RỘNG lọt lòng giếng thang máy, mét, theo bản vẽ của hãng thang gia chủ chọn. Chương trình không đoán số này (Haan 25/09/2026): khai thang máy mà để trống thì đầu bài bị báo mâu thuẫn nghiêm trọng và chưa dựng được phương án.',
          )
          .optional(),
        /** Chiều SÂU lọt lòng giếng thang máy, mét (phía cửa cabin là bề rộng). Cùng nguồn và cùng luật với `elevator_shaft_width_m`. */
        elevator_shaft_depth_m: z
          .number()
          .gte(0.8)
          .lte(4)
          .nullable()
          .describe(
            'Chiều SÂU lọt lòng giếng thang máy, mét (phía cửa cabin là bề rộng). Cùng nguồn và cùng luật với `elevator_shaft_width_m`.',
          )
          .optional(),
        /** Kiểu bố trí thang máy so với thang bộ (Haan 25/09/2026, ba kiểu phổ biến ở Việt Nam): `giua_long_thang_bo` — giếng thang máy dựng ở khoảng trống giữa lòng thang bộ, thang bộ uốn quanh; `canh_thang_bo` — sát nhau trên cùng một mảng tường, cùng mở ra một hành lang; `doi_dien_thang_bo` — hai mặt đối diện, ngăn bởi hành lang / sảnh chờ; `khac` — kiến trúc sư tự mô tả ở `elevator_layout_note`. `rieng_biet`, `chua_quyet` là giá trị cũ, giữ để đọc lại đầu bài đã đúc. */
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
          .describe(
            'Kiểu bố trí thang máy so với thang bộ (Haan 25/09/2026, ba kiểu phổ biến ở Việt Nam): `giua_long_thang_bo` — giếng thang máy dựng ở khoảng trống giữa lòng thang bộ, thang bộ uốn quanh; `canh_thang_bo` — sát nhau trên cùng một mảng tường, cùng mở ra một hành lang; `doi_dien_thang_bo` — hai mặt đối diện, ngăn bởi hành lang / sảnh chờ; `khac` — kiến trúc sư tự mô tả ở `elevator_layout_note`. `rieng_biet`, `chua_quyet` là giá trị cũ, giữ để đọc lại đầu bài đã đúc.',
          )
          .optional(),
        /** Mô tả kiểu bố trí thang máy khi chọn `khac`. Đi tới mô hình dạng câu, không ràng buộc hình học. */
        elevator_layout_note: z
          .string()
          .max(300)
          .nullable()
          .describe(
            'Mô tả kiểu bố trí thang máy khi chọn `khac`. Đi tới mô hình dạng câu, không ràng buộc hình học.',
          )
          .optional(),
        /** Thang bộ hở (thông tầng, lấy sáng, ăn diện tích) hay kín (giữ điều hoà, kín tiếng, gọn). Đây là lựa chọn của gia chủ chứ không phải của phần mềm, và nó đổi hẳn cách tổ chức khu giữa nhà. */
        stair_type: z
          .union([
            z.literal('thang_ho'),
            z.literal('thang_kin'),
            z.literal('chua_quyet'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Thang bộ hở (thông tầng, lấy sáng, ăn diện tích) hay kín (giữ điều hoà, kín tiếng, gọn). Đây là lựa chọn của gia chủ chứ không phải của phần mềm, và nó đổi hẳn cách tổ chức khu giữa nhà.',
          )
          .optional(),
      })
      .strict()
      .nullable()
      .describe('Giao thông đứng: thang bộ và thang máy.')
      .optional(),
    /** Lối vào và cao độ nền — nhóm câu hỏi nhỏ nhưng bỏ sót thì sai từ mặt cắt đến mặt đứng. */
    entrance: z
      .object({
        /** **Cốt nền tầng 1 cao hơn tim đường bao nhiêu mét.** Số này, chứ không phải cao độ tuyệt đối, là thứ quyết số bậc tam cấp, độ dốc dắt xe và việc nước mưa chảy vào nhà hay chảy ra đường. Để trống thì suy tạm từ `site.land_level_m - site.road_level_m`, nhưng đó là cao độ ĐẤT chứ chưa phải cốt nền. */
        floor_above_road_m: z
          .number()
          .gte(0)
          .lte(3)
          .nullable()
          .describe(
            '**Cốt nền tầng 1 cao hơn tim đường bao nhiêu mét.** Số này, chứ không phải cao độ tuyệt đối, là thứ quyết số bậc tam cấp, độ dốc dắt xe và việc nước mưa chảy vào nhà hay chảy ra đường. Để trống thì suy tạm từ `site.land_level_m - site.road_level_m`, nhưng đó là cao độ ĐẤT chứ chưa phải cốt nền.',
          )
          .optional(),
        /** Có bậc tam cấp từ sân lên nền nhà không. «Không» nghĩa là sân và nền nhà cùng cao độ, hoặc nối bằng dốc thoải — cách duy nhất cho xe lăn và xe máy đi thẳng vào. */
        steps_from_yard: z
          .boolean()
          .nullable()
          .describe(
            'Có bậc tam cấp từ sân lên nền nhà không. «Không» nghĩa là sân và nền nhà cùng cao độ, hoặc nối bằng dốc thoải — cách duy nhất cho xe lăn và xe máy đi thẳng vào.',
          )
          .optional(),
        /** Số bậc tam cấp, nếu gia chủ đã muốn một con số cụ thể (nhiều gia đình kiêng số bậc). Để trống thì suy từ chênh cao. */
        step_count: z
          .number()
          .int()
          .gte(1)
          .lte(8)
          .nullable()
          .describe(
            'Số bậc tam cấp, nếu gia chủ đã muốn một con số cụ thể (nhiều gia đình kiêng số bậc). Để trống thì suy từ chênh cao.',
          )
          .optional(),
        /** Có dốc dắt xe từ sân lên chỗ để xe không. Dốc ăn chiều dài sân: chênh cao 0,45 m cần khoảng 2,5–3 m dốc — chỗ này không tính từ đầu thì cổng mở ra là đã hết sân. */
        vehicle_ramp: z
          .boolean()
          .nullable()
          .describe(
            'Có dốc dắt xe từ sân lên chỗ để xe không. Dốc ăn chiều dài sân: chênh cao 0,45 m cần khoảng 2,5–3 m dốc — chỗ này không tính từ đầu thì cổng mở ra là đã hết sân.',
          )
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Lối vào và cao độ nền — nhóm câu hỏi nhỏ nhưng bỏ sót thì sai từ mặt cắt đến mặt đứng.',
      )
      .optional(),
    /** Ban công — vị trí, phạm vi và độ vươn. Khai ở đây chứ không ở `required_spaces` vì ban công là một THUỘC TÍNH của mặt nhà theo tầng, không phải một phòng đứng riêng trong chương trình không gian. */
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
        /** Ban công đặt ở mặt nào của nhà: trước, sau, hông trái, hông phải. CŨ (trước T91): đọc như `required_sides`. Đầu bài mới không ghi trường này. */
        sides: z
          .array(z.enum(['front', 'back', 'left', 'right']))
          .nullable()
          .describe(
            'Ban công đặt ở mặt nào của nhà: trước, sau, hông trái, hông phải. CŨ (trước T91): đọc như `required_sides`. Đầu bài mới không ghi trường này.',
          )
          .optional(),
        /** Ban công làm tới đâu: mọi tầng trên, chỉ mặt tiền, hay chỉ ở những phòng gia chủ chỉ định. */
        scope: z
          .union([
            z.literal('moi_tang'),
            z.literal('chi_mat_tien'),
            z.literal('theo_tung_phong'),
            z.literal('khong_co'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Ban công làm tới đâu: mọi tầng trên, chỉ mặt tiền, hay chỉ ở những phòng gia chủ chỉ định.',
          )
          .optional(),
        /** Ban công có ĐUA RA NGOÀI ranh đất (nhô qua chỉ giới xây dựng, ra trên vỉa hè hoặc trên khoảng lùi) không. Đây là câu hỏi pháp lý trước khi là câu hỏi hình khối: nhiều địa phương chỉ cho đua khi đường đủ rộng và chỉ tới một độ vươn nhất định. Trả lời «không» thì ban công nằm trọn trong phần đất xây được, và diện tích sàn phải tính lại. CŨ (trước T91): thay bằng `projection_by_side`; chỉ còn để đọc đầu bài đã lưu. */
        projection_over_boundary: z
          .boolean()
          .nullable()
          .describe(
            'Ban công có ĐUA RA NGOÀI ranh đất (nhô qua chỉ giới xây dựng, ra trên vỉa hè hoặc trên khoảng lùi) không. Đây là câu hỏi pháp lý trước khi là câu hỏi hình khối: nhiều địa phương chỉ cho đua khi đường đủ rộng và chỉ tới một độ vươn nhất định. Trả lời «không» thì ban công nằm trọn trong phần đất xây được, và diện tích sàn phải tính lại. CŨ (trước T91): thay bằng `projection_by_side`; chỉ còn để đọc đầu bài đã lưu.',
          )
          .optional(),
        /** Độ vươn của ban công tính từ mặt tường, mét. Để trống thì lấy theo thông lệ của phương án. CŨ (trước T91): thay bằng `projection_by_side`; chỉ còn để đọc đầu bài đã lưu. */
        projection_m: z
          .number()
          .gte(0)
          .lte(3)
          .nullable()
          .describe(
            'Độ vươn của ban công tính từ mặt tường, mét. Để trống thì lấy theo thông lệ của phương án. CŨ (trước T91): thay bằng `projection_by_side`; chỉ còn để đọc đầu bài đã lưu.',
          )
          .optional(),
        /** Có ban công phơi riêng phía sau không — tách chỗ phơi khỏi ban công mặt tiền. */
        drying_balcony: z
          .boolean()
          .nullable()
          .describe('Có ban công phơi riêng phía sau không — tách chỗ phơi khỏi ban công mặt tiền.')
          .optional(),
        /** Ghi chú thêm về ban công: lan can kính hay xây, trồng cây, che mưa, làm lam. */
        note: z
          .string()
          .max(1000)
          .nullable()
          .describe('Ghi chú thêm về ban công: lan can kính hay xây, trồng cây, che mưa, làm lam.')
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Ban công — vị trí, phạm vi và độ vươn. Khai ở đây chứ không ở `required_spaces` vì ban công là một THUỘC TÍNH của mặt nhà theo tầng, không phải một phòng đứng riêng trong chương trình không gian.',
      )
      .optional(),
    /** Hệ thống kỹ thuật có ảnh hưởng tới MẶT BẰNG và MẶT ĐỨNG. Cố ý chỉ hỏi những thứ chiếm chỗ hoặc nhìn thấy được — phần còn lại của điện nước là việc của bộ môn, không phải của đầu bài. */
    systems: z
      .object({
        /** Cách trữ nước. Bể ngầm ăn chỗ dưới sân hoặc dưới chỗ để xe; bồn mái ăn chỗ và đổi hẳn hình mái — cả hai phải có chỗ từ đầu chứ không gắn thêm sau. */
        water_storage: z
          .array(z.enum(['be_ngam', 'bon_mai', 'may_bom_tang_ap']))
          .nullable()
          .describe(
            'Cách trữ nước. Bể ngầm ăn chỗ dưới sân hoặc dưới chỗ để xe; bồn mái ăn chỗ và đổi hẳn hình mái — cả hai phải có chỗ từ đầu chứ không gắn thêm sau.',
          )
          .optional(),
        /** Có bình nước nóng năng lượng mặt trời trên mái không — khối tấm thu nằm ngay trên mái và nhìn thấy từ đường, nên nó là việc của mặt đứng chứ không chỉ của điện nước. */
        solar_water: z
          .boolean()
          .nullable()
          .describe(
            'Có bình nước nóng năng lượng mặt trời trên mái không — khối tấm thu nằm ngay trên mái và nhìn thấy từ đường, nên nó là việc của mặt đứng chứ không chỉ của điện nước.',
          )
          .optional(),
        /** Cục nóng điều hoà đặt ở đâu. Câu hỏi này bị bỏ qua nhiều nhất và để lại hậu quả dễ thấy nhất: một dãy cục nóng treo trên mặt tiền vừa hoàn thiện. */
        aircon_outdoor: z
          .union([
            z.literal('hop_ky_thuat'),
            z.literal('ban_cong_phu'),
            z.literal('san_thuong'),
            z.literal('chua_quyet'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Cục nóng điều hoà đặt ở đâu. Câu hỏi này bị bỏ qua nhiều nhất và để lại hậu quả dễ thấy nhất: một dãy cục nóng treo trên mặt tiền vừa hoàn thiện.',
          )
          .optional(),
        /** Ghi chú thêm về hệ thống kỹ thuật: điện dự phòng, điện mặt trời, lọc nước, camera, mạng. */
        note: z
          .string()
          .max(1000)
          .nullable()
          .describe(
            'Ghi chú thêm về hệ thống kỹ thuật: điện dự phòng, điện mặt trời, lọc nước, camera, mạng.',
          )
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Hệ thống kỹ thuật có ảnh hưởng tới MẶT BẰNG và MẶT ĐỨNG. Cố ý chỉ hỏi những thứ chiếm chỗ hoặc nhìn thấy được — phần còn lại của điện nước là việc của bộ môn, không phải của đầu bài.',
      )
      .optional(),
    /** Dự trù tương lai — hỏi vào lúc còn sửa được là đầu bài, hỏi sau khi đổ móng là phá đi làm lại. */
    future: z
      .object({
        /** Dự trù mở rộng sau này. `nang_them_tang` bắt móng, cột và thang phải tính cho số tầng tương lai ngay từ bây giờ — quyết định này không lùi lại được sau khi đổ móng. */
        expansion: z
          .union([
            z.literal('khong'),
            z.literal('nang_them_tang'),
            z.literal('xay_them_phia_sau'),
            z.literal(null),
          ])
          .nullable()
          .describe(
            'Dự trù mở rộng sau này. `nang_them_tang` bắt móng, cột và thang phải tính cho số tầng tương lai ngay từ bây giờ — quyết định này không lùi lại được sau khi đổ móng.',
          )
          .optional(),
        /** Số tầng dự kiến nâng thêm. */
        expansion_floors: z
          .number()
          .int()
          .gte(1)
          .lte(6)
          .nullable()
          .describe('Số tầng dự kiến nâng thêm.')
          .optional(),
        /** Có xây theo giai đoạn không (hoàn thiện một phần trước, phần còn lại sau). */
        phasing: z
          .boolean()
          .nullable()
          .describe('Có xây theo giai đoạn không (hoàn thiện một phần trước, phần còn lại sau).')
          .optional(),
      })
      .strict()
      .nullable()
      .describe(
        'Dự trù tương lai — hỏi vào lúc còn sửa được là đầu bài, hỏi sau khi đổ móng là phá đi làm lại.',
      )
      .optional(),
    /** Mức hoàn thiện mong muốn. Đi cùng `budget_range_vnd`: cùng một khoảng tiền, mức hoàn thiện cao hơn nghĩa là diện tích phải nhỏ lại — bộ soát mâu thuẫn đối chiếu hai ô này với nhau. */
    finishing_level: z
      .union([z.literal('co_ban'), z.literal('kha'), z.literal('cao_cap'), z.literal(null)])
      .nullable()
      .describe(
        'Mức hoàn thiện mong muốn. Đi cùng `budget_range_vnd`: cùng một khoảng tiền, mức hoàn thiện cao hơn nghĩa là diện tích phải nhỏ lại — bộ soát mâu thuẫn đối chiếu hai ô này với nhau.',
      )
      .optional(),
    /**
     * Câu trả lời cho những câu hỏi do QUẢN TRỊ VIÊN tự thêm vào biểu mẫu khảo sát (màn hình «Biểu mẫu đầu bài»). Khoá là mã câu hỏi (`^[a-z0-9_]+$`), giá trị là câu trả lời.
     *
     * Vì sao có một ô mở giữa một hợp đồng `additionalProperties: false`: NVG còn học ra câu hỏi mới sau mỗi công trình, và bắt mỗi câu hỏi mới phải đi qua một lần sửa hợp đồng + sinh lại Zod + phát hành lại hai Worker là cách chắc chắn để câu hỏi ấy không bao giờ được thêm.
     *
     * Đổi lại, giá trị ở đây là CHỮ và SỐ THUẦN, không phải cấu trúc: engine KHÔNG đọc chúng, và không rule nào nhắm tới chúng. Chúng đi vào văn xuôi gửi mô hình kèm nhãn câu hỏi, đúng chỗ lời gia chủ vẫn đi. Một câu hỏi cần ràng buộc THẬT lên hình học (một tầng, một diện tích, một mặt của lô) thì phải là một trường có tên trong hợp đồng này — không phải một mục tự thêm.
     */
    custom: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullable())
      .nullable()
      .describe(
        'Câu trả lời cho những câu hỏi do QUẢN TRỊ VIÊN tự thêm vào biểu mẫu khảo sát (màn hình «Biểu mẫu đầu bài»). Khoá là mã câu hỏi (`^[a-z0-9_]+$`), giá trị là câu trả lời.\n\nVì sao có một ô mở giữa một hợp đồng `additionalProperties: false`: NVG còn học ra câu hỏi mới sau mỗi công trình, và bắt mỗi câu hỏi mới phải đi qua một lần sửa hợp đồng + sinh lại Zod + phát hành lại hai Worker là cách chắc chắn để câu hỏi ấy không bao giờ được thêm.\n\nĐổi lại, giá trị ở đây là CHỮ và SỐ THUẦN, không phải cấu trúc: engine KHÔNG đọc chúng, và không rule nào nhắm tới chúng. Chúng đi vào văn xuôi gửi mô hình kèm nhãn câu hỏi, đúng chỗ lời gia chủ vẫn đi. Một câu hỏi cần ràng buộc THẬT lên hình học (một tầng, một diện tích, một mặt của lô) thì phải là một trường có tên trong hợp đồng này — không phải một mục tự thêm.',
      )
      .optional(),
  })
  .strict()
  .describe('Đầu bài thiết kế — output Layer 1. Nguồn: doc/design/03-data-contracts.md mục 3.1.');

export type DesignBrief = z.infer<typeof designBriefSchema>;
