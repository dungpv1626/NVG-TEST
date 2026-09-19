/**
 * Panel điểm chất lượng mặt bằng (Đợt C′ — T24 · T27 · T31).
 *
 * Bộ này canh đúng những chỗ mà một lỗi sẽ KHÔNG trông giống lỗi — panel điểm là màn hình dễ đọc
 * sai nhất của cả nhánh, vì mọi cách hiểu sai đều ra một con số trông hợp lý:
 *
 *  1. **Mẫu số là phần trọng số CHẤM ĐƯỢC, không phải 100.** Thiếu câu ấy thì «89» đọc thành
 *     «89/100», tức phương án thiếu dữ liệu trông như phương án đủ dữ liệu bị trừ điểm.
 *  2. **Tiêu chí không chấm được hiện LÝ DO, tuyệt đối không hiện `0`** (CLAUDE.md 5.2). `0` đọc
 *     như «vi phạm hết» theo hướng xấu nhất, và đây là màn hình dùng để so phương án.
 *  3. **Hai lý do không chấm phải phân biệt được**: cổng dữ liệu đã bảo đảm (đạt rồi) khác hẳn
 *     thiếu đầu vào (không biết).
 *  4. **`n` và nhãn nguồn ngưỡng ở TỪNG DÒNG** (T31). Bộ đo mới có n ≤ 6 nên «ngưỡng này là suy
 *     luận» phải thấy được ở mức tiêu chí, không chỉ một câu chung cuối panel.
 *  5. **Thước cũ bị gọi ra.** Điểm chấm bằng thước khác thước hôm nay là con số không so được;
 *     im lặng thì bảng so model đem hai thước ra xếp hạng với nhau (T27).
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { renderWithApp } from '@/test/render';
import type { AiPlanScoreCriterion, AiPlanScoreView } from '@/hooks/use-ai-design';
import { PlanScorePanel } from '../ai-plan-score';

function criterion(over: Partial<AiPlanScoreCriterion> = {}): AiPlanScoreCriterion {
  return {
    code: 'C1',
    group: 'C',
    vi: 'Số phòng phải đi xuyên phòng ngủ khác mới tới',
    giaiThich: null,
    value: 0,
    score: 1,
    weight: 6,
    n: 3,
    label: 'ĐO',
    notScored: null,
    why: null,
    refs: [],
    ...over,
  };
}

function score(over: Partial<AiPlanScoreView> = {}): AiPlanScoreView {
  return {
    scoreVersion: 1,
    currentVersion: 1,
    points: 80.67,
    scoredWeight: 90,
    reasonedWeight: 0,
    coSoDuLieu: '2 dự án NVO, 6 mặt bằng độc lập — mọi ngưỡng [ĐO] là chỉ dấu, chưa phải chuẩn',
    groups: [{ code: 'C', vi: 'Giao thông', weight: 30, scoredWeight: 24, points: 18 }],
    criteria: [criterion()],
    ...over,
  };
}

describe('Panel điểm — mẫu số là phần trọng số chấm được, không phải 100', () => {
  it('in điểm KÈM phần trọng số chấm được thành chữ, không để dấu gạch chéo tự nói', () => {
    renderWithApp(<PlanScorePanel score={score()} />);
    expect(screen.getByText('80,7')).toBeInTheDocument();
    expect(screen.getByText(/^điểm trên/)).toHaveTextContent(
      'điểm trên 90 phần trọng số chấm được',
    );
  });

  it('nói rõ phần trọng số thiếu KHÔNG chia lại cho tiêu chí khác', () => {
    // Đây là điều cấm của CLAUDE.md 5.2 mà chính tôi đã cài sai một lần ở backend: chia lại làm
    // `scoredWeight` luôn bằng 100, và lúc ấy con số mất hết ý nghĩa mà vẫn trông đúng.
    renderWithApp(<PlanScorePanel score={score()} />);
    expect(
      screen.getByText(/10 phần trọng số không chấm được/, { selector: 'span' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/không chia lại/, { selector: 'b' })).toBeInTheDocument();
  });

  it('chấm đủ 100 phần thì KHÔNG hiện câu về phần thiếu', () => {
    renderWithApp(<PlanScorePanel score={score({ scoredWeight: 100, points: 100 })} />);
    expect(
      screen.queryByText(/không chấm được trên phương án này/, { selector: 'span' }),
    ).toBeNull();
  });
});

describe('Panel điểm — tiêu chí không chấm được', () => {
  it('hiện lý do THAY cho con số, và không có số 0 nào trong dòng đó', () => {
    const entry = criterion({
      code: 'E4',
      vi: 'Hộp kỹ thuật liên tục các tầng',
      value: null,
      score: null,
      notScored: 'thieu_du_lieu',
      why: 'Phương án không khai hộp kỹ thuật nào.',
    });
    renderWithApp(<PlanScorePanel score={score({ criteria: [entry] })} />);

    const row = screen.getByRole('row', { name: /E4/ });
    expect(row).toHaveTextContent('Phương án không khai hộp kỹ thuật nào.');
    // Không phải «không có chữ 0 nào» — trọng số có thể chứa số 0 — mà là: ô giá trị và ô điểm
    // không được hiện một con số nào, vì bất kỳ con số nào ở đó cũng đọc thành kết quả đo.
    expect(row).not.toHaveTextContent(/\b0\b(?! phần)/);
    expect(row).toHaveTextContent(/không cộng \(6 phần\)/);
  });

  it('phân biệt «cổng đã bảo đảm» với «thiếu đầu vào» — hai chuyện khác hẳn nhau', () => {
    const gate = criterion({
      code: 'A2',
      vi: 'Phòng đặt đúng tầng chương trình đã định',
      value: null,
      score: null,
      weight: 0,
      notScored: 'gate',
      why: 'Lỗi chặn room_wrong_level đã bảo đảm điều này trước khi chấm.',
    });
    renderWithApp(<PlanScorePanel score={score({ criteria: [gate] })} />);

    const row = screen.getByRole('row', { name: /A2/ });
    expect(row).toHaveTextContent(/đã bảo đảm/);
    expect(row).not.toHaveTextContent(/Chưa đủ dữ liệu/);
    // Trọng số 0 nên KHÔNG được hiện «không cộng (0 phần)»: tiêu chí này không bị mất điểm, nó
    // không phải tiêu chí chấm điểm.
    expect(row).not.toHaveTextContent(/không cộng/);
  });
});

describe('Panel điểm — nguồn ngưỡng hiện ở từng dòng (T31)', () => {
  it('mỗi dòng mang nhãn nguyên văn của bộ đo và số mẫu', () => {
    const rows = [
      criterion({ code: 'C4', label: 'ĐO 1,1; CHUNG 0,9', n: 3 }),
      criterion({ code: 'A1', label: 'CHUNG', n: 0 }),
    ];
    renderWithApp(<PlanScorePanel score={score({ criteria: rows })} />);

    expect(screen.getByRole('row', { name: /C4/ })).toHaveTextContent('ĐO 1,1; CHUNG 0,9');
    expect(screen.getByRole('row', { name: /C4/ })).toHaveTextContent('n = 3');
    expect(screen.getByRole('row', { name: /A1/ })).toHaveTextContent('n = 0');
  });

  it('nói ra phần trọng số dựa trên ngưỡng chưa ai đo', () => {
    renderWithApp(<PlanScorePanel score={score({ reasonedWeight: 6.25 })} />);
    expect(
      screen.getByText(/6,25 phần trọng số dựa trên ngưỡng chưa ai đo/, { selector: 'b' }),
    ).toBeInTheDocument();
  });

  it('nêu tên chỗ bị trừ điểm — một con số thấp không nói được phải sửa gì', () => {
    renderWithApp(
      <PlanScorePanel
        score={score({ criteria: [criterion({ score: 0, refs: ['wc_2', 'wc_3'] })] })}
      />,
    );
    expect(screen.getByText(/Chỗ bị trừ: wc_2, wc_3/)).toBeInTheDocument();
  });
});

describe('Panel điểm — thước cũ và phương án chưa chấm', () => {
  it('thước khác thước hôm nay thì nói rõ hai con số không so được', () => {
    renderWithApp(<PlanScorePanel score={score({ scoreVersion: 1, currentVersion: 2 })} />);
    expect(screen.getByText(/không so với nhau được/, { selector: 'span' })).toBeInTheDocument();
  });

  it('cùng phiên bản thì không cảnh báo gì', () => {
    renderWithApp(<PlanScorePanel score={score()} />);
    expect(screen.queryByText(/không so với nhau được/, { selector: 'span' })).toBeNull();
  });

  it('phương án đúc trước khi có thước: nói «chưa chấm» và nêu giá của việc chấm bù', () => {
    // Không hiện 0 điểm, và không hiện một cái nút chấm lại không tồn tại: điểm nằm trong payload
    // bất biến nên chấm bù đòi đúc lại phương án, tức tiền thật.
    renderWithApp(<PlanScorePanel score={null} />);
    expect(screen.getByText('Chưa chấm')).toBeInTheDocument();
    expect(screen.getByText(/một lượt gọi mô hình mới/)).toBeInTheDocument();
    expect(screen.queryByText(/^điểm trên/)).toBeNull();
  });
});

describe('Panel điểm — câu do mã chèn', () => {
  it('câu «điểm không đo chất lượng thiết kế» luôn có mặt', () => {
    // Cùng hạng với nhãn cảnh báo ở CLAUDE.md 8.7: do mã chèn, không tắt được từ giao diện. Một
    // con số trên màn hình được đọc như lời phán, nên câu này là phần kết luận chứ không phải rào.
    renderWithApp(<PlanScorePanel score={score()} />);
    expect(screen.getByText(AI_DISCLAIMERS.scoreNotJudgement)).toBeInTheDocument();
  });

  it('nói bộ đo dựa trên mấy hồ sơ, nguyên văn', () => {
    renderWithApp(<PlanScorePanel score={score()} />);
    expect(screen.getByText(/2 dự án NVO, 6 mặt bằng độc lập/)).toBeInTheDocument();
  });
});
