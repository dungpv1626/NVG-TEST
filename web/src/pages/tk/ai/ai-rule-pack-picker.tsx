/**
 * Ô chọn gói quy tắc của nhánh AI — dùng ở bước mặt bằng.
 *
 * Tách khỏi `ai-program-step.tsx` khi bước «Chương trình không gian» gỡ khỏi tab AI Design
 * (19/09/2026): mặt bằng đọc đầu bài + khảo sát, không đọc chương trình không gian (T45).
 */

import { AI_DISCLAIMERS } from '@nvg/shared/design';
import type { AiRulePackChoice } from '@/hooks/use-ai-design';

/**
 * Hai ô chọn gói quy tắc.
 *
 * Ghi rõ ngay trên màn hình gói nào là LUẬT, gói nào là thói quen — đó là toàn bộ lý do hai ô
 * này tồn tại thay vì một nút. Không tích gì thì mô hình thiết kế tự do và không có cảnh báo
 * nào; câu dưới nói thẳng điều đó để không ai tưởng màn hình hỏng.
 */
export function RulePackPicker({
  value,
  onChange,
  disabled,
}: {
  value: AiRulePackChoice;
  onChange: (next: AiRulePackChoice) => void;
  disabled?: boolean;
}): React.ReactElement {
  const none = !value.experience;
  return (
    <fieldset className="rounded-md border border-tk-line p-3">
      <legend className="px-1 font-medium">Quy tắc áp cho lượt này</legend>
      {/*
       * Ô tích «Quy chuẩn quốc gia» đã GỠ ngày 12/09/2026 (T30). Một ô tích không bật gì còn tệ
       * hơn không có ô: nó tạo cảm giác đã kiểm quy chuẩn — cùng lý lẽ với CLAUDE.md 8.8 điểm 2
       * («cấu hình khai ra mà không policy nào đọc tới còn tệ hơn không khai»). Câu nói rõ rằng
       * không kiểm quy chuẩn nằm ở dòng cuối fieldset này và ở panel đối chiếu của bước mặt bằng.
       */}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.experience}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, experience: e.target.checked })}
        />
        <span>
          <b>Kinh nghiệm nghề Nhà Việt Group</b>
          <span className="block text-fg-subtle">
            Cách phòng thiết kế quen làm. Không phải luật, bỏ qua được.
          </span>
        </span>
      </label>
      <p className="mt-2 text-fg-subtle">
        {none
          ? 'Chưa chọn gói nào: mô hình thiết kế tự do, và sẽ không có cảnh báo nào.'
          : 'Gói đã chọn vừa được gửi cho mô hình để làm theo, vừa dùng để đối chiếu kết quả.'}
      </p>
      <p className="mt-2 font-medium">{AI_DISCLAIMERS.noCodeCheck}</p>
    </fieldset>
  );
}
