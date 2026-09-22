/**
 * Bản nháp Đầu bài — hình dạng của dữ liệu khi người dùng mới điền một nửa.
 *
 * Hợp đồng `DesignBrief` đòi `floors`, `site.width_m`, `site.depth_m`… vì đó là hình dạng
 * của một đầu bài ĐÃ XONG, thứ đi vào artifact. Nhưng biểu mẫu phải lưu được lúc đang dở.
 *
 * ⚠️ KHÔNG viết tay một schema thứ hai cho bản nháp. Dẫn xuất từ chính schema sinh, để hợp
 * đồng đổi thì bản nháp đổi theo — hai bản viết tay song song là hai bản sẽ lệch.
 */

import { z } from 'zod';
import { designBriefSchema } from './design-brief.generated';

/**
 * `.partial()` chỉ nới lỏng CẤP GỐC, nên `site` — object duy nhất của hợp đồng có `required`
 * lồng bên trong — phải nới riêng.
 *
 * Không dùng `.deepPartial()`: zod đã đánh dấu bỏ dần và nó im lặng bỏ qua union, mà hợp
 * đồng này có nhiều trường `["string","null"]`.
 *
 * `.partial()` **giữ nguyên `.strict()`**, nên bản nháp vẫn từ chối khoá lạ — có kiểm thử,
 * vì đây là thứ dễ mất khi nâng zod hoặc sửa bộ sinh.
 */
export const designBriefDraftSchema = designBriefSchema.partial().extend({
  site: designBriefSchema.shape.site.partial().optional(),
});

export type DesignBriefDraft = z.infer<typeof designBriefDraftSchema>;

/**
 * Phiên bản hình dạng ghi vào `structured.schema_version` ngay lúc lưu.
 *
 * Mỗi phiên bản đầu bài tự khai nó được viết theo hình dạng hợp đồng nào; không có nó thì
 * sau một lần đổi hợp đồng, không phân biệt được bản ghi cũ với bản ghi hỏng.
 *
 * `1.1.0` (29/08/2026): thêm `massing` — ý đồ tổ hợp khối cho biệt thự và nhà vườn. Chỉ THÊM
 * trường tuỳ chọn nên tăng số phụ, không tăng số chính: bản ghi viết theo `1.0.0` vẫn đọc
 * được nguyên vẹn (03-data-contracts, quy tắc semver).
 *
 * `1.2.0` (07/09/2026): thêm `family[].ensuite`, `family[].floor`, `required_spaces[].area_m2`,
 * và sáu mã phong cách. Vẫn chỉ THÊM: `floor_pref` không bị gỡ, và bản ghi cũ đọc nguyên vẹn —
 * Lớp 2 hiểu cả hai cách khai "khép kín" lẫn cả hai cách khai tầng.
 *
 * `1.3.0` (07/09/2026): thêm `required_spaces[].ensuite` và `required_spaces[].amenities`.
 * Vẫn chỉ THÊM trường tuỳ chọn: `ensuite` vắng mặt nghĩa là "lấy theo `family`", đúng hành vi
 * bản ghi cũ đang có.
 *
 * `1.4.0` (13/09/2026): thêm `site.main_entrance_side`, `site.vehicle_entrance_side`,
 * `site.boundary_walls`, `massing.yard_depth_m` và `parking`. Vẫn chỉ THÊM trường tuỳ chọn. Vì
 * sao: lượt chạy thật 13/09/2026 chiếm trọn bề ngang lô dù đầu bài đòi sân bên — đầu bài nói sân
 * NẰM ĐÂU mà không nói RỘNG BAO NHIÊU, và không nói lối vào, lối xe ở mặt nào.
 *
 * `1.5.0` (21/09/2026): đợt «khảo sát chi tiết» — thêm `household` (nghề nghiệp, tín ngưỡng,
 * kinh doanh tại nhà), `lifestyle` (nếp sinh hoạt), `storage`, `vertical` (thang bộ, thang máy),
 * `entrance` (cao độ nền, bậc tam cấp), `balconies`, `systems`, `future`, `finishing_level`,
 * `family[].ages`, `parking.car_size`/`ev_charging`, và tám trường khu đất: cao độ đường và cao
 * độ đất, mặt nắng gắt, mặt đón gió, bề rộng đường, nguy cơ ngập, hiện trạng xây dựng, số tầng
 * nhà liền kề. Vẫn chỉ THÊM trường tuỳ chọn: mọi bản ghi `1.0.0`–`1.4.0` đọc nguyên vẹn, và một
 * đầu bài không trả lời câu nào trong số này vẫn chốt được — điểm độ đầy đủ thấp hơn, đúng ý
 * nghĩa của nó (yêu cầu của Haan 21/09/2026: khảo sát càng chi tiết, phương án càng sát mong muốn).
 */
export const BRIEF_SCHEMA_VERSION = '1.5.0';
