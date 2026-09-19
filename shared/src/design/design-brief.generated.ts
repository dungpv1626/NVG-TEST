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
  })
  .strict()
  .describe('Đầu bài thiết kế — output Layer 1. Nguồn: doc/design/03-data-contracts.md mục 3.1.');

export type DesignBrief = z.infer<typeof designBriefSchema>;
