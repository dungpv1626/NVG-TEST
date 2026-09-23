/**
 * Cấu hình biểu mẫu Đầu bài HIỆU LỰC của một tenant = bản gốc trong mã nguồn + lớp phủ của
 * quản trị viên (`design_setting.brief_form_overlay`).
 *
 * ## Vì sao Worker cũng phải đọc lớp phủ, không chỉ trình duyệt
 *
 * `buildBriefPayload` **tính lại** `completeness_score` và bỏ con số máy khách gửi lên — đó là
 * chốt chặn của cổng Lớp 2. Nếu Worker chấm theo bản gốc còn màn hình chấm theo bản đã sửa
 * trọng số thì hai bên nói hai con số khác nhau về cùng một đầu bài, và con số đi vào artifact
 * BẤT BIẾN là con số người dùng chưa bao giờ nhìn thấy.
 *
 * ## Hỏng thì dùng bản gốc, và nói ra
 *
 * Lớp phủ sai (quản trị viên vừa lưu một cấu hình hỏng, hay ai đó sửa tay trong CSDL) KHÔNG
 * được làm chết đường xác nhận đầu bài. Hàm trả về bản gốc kèm `fellBack: true`; nơi gọi ghi
 * vào `params` của artifact, nên về sau tra ra được artifact nào đúc bằng bản gốc dù tenant
 * đang có lớp phủ.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyBriefFormOverlay,
  BRIEF_FORM,
  BRIEF_FORM_OVERLAY_KEY,
  readBriefFormOverlay,
  type BriefFormConfig,
} from '@nvg/shared/design';

export interface EffectiveBriefForm {
  config: BriefFormConfig;
  /** Tenant có lớp phủ và đã áp được. */
  overlayApplied: boolean;
  /** Có lớp phủ nhưng không dùng được — đã lùi về bản gốc. */
  fellBack: boolean;
}

/**
 * `tenantId` là TUỲ CHỌN vì hai nơi gọi biết hai thứ khác nhau.
 *
 * Tuyến xác nhận đầu bài đã suy ra tenant từ pháp nhân của hồ sơ, nên lọc thẳng cho rõ ràng.
 * Tuyến gom dữ liệu gửi mô hình (`aiDigestInputs`) thì không — và cũng không cần: RLS của
 * `design_setting` đã giới hạn đúng các tenant người gọi thuộc về, nên lọc theo khoá là đủ.
 * Bịa thêm một tham số tenant ở đó chỉ để «cho đủ» là chép một điều kiện quyền ra ngoài CSDL,
 * đúng thứ CLAUDE.md 3.4 bảo đừng làm.
 */
export async function readEffectiveBriefForm(
  db: SupabaseClient,
  tenantId?: string,
): Promise<EffectiveBriefForm> {
  let query = db.from('design_setting').select('value').eq('key', BRIEF_FORM_OVERLAY_KEY);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.limit(1).maybeSingle();

  if (error || !data) return { config: BRIEF_FORM, overlayApplied: false, fellBack: false };

  const overlay = readBriefFormOverlay(data.value);
  if (!overlay) return { config: BRIEF_FORM, overlayApplied: false, fellBack: true };

  try {
    return {
      config: applyBriefFormOverlay(BRIEF_FORM, overlay),
      overlayApplied: true,
      fellBack: false,
    };
  } catch {
    return { config: BRIEF_FORM, overlayApplied: false, fellBack: true };
  }
}
