/**
 * Dải tiến trình NĂM bước của Trang dự án thiết kế (bản mẫu §5.5a).
 *
 * ⚠️ AI Design KHÔNG là một bước (Haan, 07/10/2026): nó là module độc lập hỗ trợ phòng thiết kế,
 * không nằm trong quy trình. Trước đó dải có bước «AI Design» ở giữa và lấy «đã chọn phương án AI»
 * làm điều kiện xong — nên chưa chạy AI thì Hồ sơ kỹ thuật, Dự toán, Trình khách đều hiện «chưa
 * mở». Đó là một ràng buộc sai, và nó khiến người đọc tưởng phải đi qua AI mới làm tiếp được.
 *
 * ⚠️ Đây KHÔNG phải một cỗ máy trạng thái thứ hai. `design_projects.stage` vẫn là thẩm quyền
 * duy nhất về bước nghiệp vụ — nó hiện thành nhãn trạng thái trên header và chỉ đổi qua
 * `useMoveDesignStage`. Dải này trả lời một câu hỏi KHÁC: **sản phẩm của từng bước đã có
 * chưa**, suy tất định từ artifact và bản ghi đang tồn tại. Không lưu ở đâu, không bảng nào
 * ghi, không ai đặt tay được.
 *
 * Hai câu hỏi đó lệch nhau là chuyện bình thường và có ích: một dự án đang ở bước "Hồ sơ kỹ
 * thuật" vẫn có thể chưa có bản dự toán, và dải này nói ra điều đó.
 *
 * Bước ĐANG CHẠY là bước chưa xong đầu tiên; mọi bước sau nó là chưa mở. Không có bước nào
 * "xong" nằm sau một bước "chưa mở" — đọc dải là đọc một mạch từ trái sang phải.
 */

export type StepState = 'done' | 'run' | 'todo';

export interface DesignStep {
  id: string;
  label: string;
  /** Con số thật của bước, hoặc rỗng khi chưa có gì để nói. KHÔNG bịa số 0 (CLAUDE.md 5.2). */
  note: string;
  state: StepState;
  /** `?tab=` của màn hình con tương ứng; rỗng nếu bước chưa có màn hình riêng. */
  tab: string;
}

export interface StepInput {
  /** Đầu bài đang hiệu lực đã xác nhận chưa, và độ đầy đủ (0–1). */
  brief: { confirmed: boolean; completeness: number | null } | null;
  /** Số biên bản khảo sát hiện trạng. */
  surveyCount: number;
  /** Tiến độ ba bộ môn, đơn vị phần trăm; rỗng khi chưa lập việc nào. */
  disciplinePercents: number[];
  /** Đã có bản dự toán nào chưa. */
  hasEstimate: boolean;
  /** Đã có phiên bản nào được khách hàng duyệt chưa. */
  customerApproved: boolean;
}

/** Làm tròn phần trăm để hiện, tránh "94.99999%". */
function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export function designSteps(input: StepInput): DesignStep[] {
  const briefDone = input.brief?.confirmed === true;
  const disciplineAvg =
    input.disciplinePercents.length > 0
      ? input.disciplinePercents.reduce((a, b) => a + b, 0) / input.disciplinePercents.length
      : null;

  const raw: Omit<DesignStep, 'state'>[] = [
    {
      id: 'dau-bai',
      label: 'Đầu bài',
      // Độ đầy đủ là số THẬT do máy chủ tính; chưa xác nhận đầu bài thì chưa có số nào.
      note:
        input.brief?.completeness != null
          ? `${percent(input.brief.completeness * 100)} đầy đủ`
          : '',
      tab: 'dau-bai',
    },
    {
      id: 'khao-sat',
      label: 'Khảo sát',
      note: input.surveyCount > 0 ? `${input.surveyCount} hồ sơ` : '',
      tab: 'khao-sat',
    },
    {
      id: 'ho-so-ky-thuat',
      label: 'Hồ sơ kỹ thuật',
      note: disciplineAvg != null ? percent(disciplineAvg) : '',
      tab: 'ho-so-ky-thuat',
    },
    { id: 'du-toan', label: 'Dự toán', note: '', tab: 'du-toan' },
    { id: 'trinh-khach', label: 'Trình khách', note: '', tab: 'phien-ban' },
  ];

  const done = [
    briefDone,
    input.surveyCount > 0,
    disciplineAvg === 100,
    input.hasEstimate,
    input.customerApproved,
  ];

  // Bước đang chạy = bước chưa xong ĐẦU TIÊN. Mọi bước sau nó là chưa mở, kể cả khi tình cờ
  // đã có sản phẩm — bày một bước "xong" nằm sau một bước "chưa mở" thì dải mất nghĩa.
  const running = done.indexOf(false);

  return raw.map((step, i) => ({
    ...step,
    state: running === -1 || i < running ? 'done' : i === running ? 'run' : 'todo',
    // Bước chưa mở không mang con số của chính nó — nó chưa có sản phẩm nào để đếm.
    note: running !== -1 && i > running ? 'chưa mở' : step.note,
  }));
}
