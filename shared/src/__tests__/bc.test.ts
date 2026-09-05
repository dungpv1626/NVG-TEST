/**
 * Phép tính của Dashboard điều hành (Module BC).
 *
 * Sai ở đây không làm hỏng màn hình nào — nó chỉ làm con số sai. Đó chính là lý do phải có
 * test: Ban Giám đốc dùng màn hình này để ra quyết định, và một chỉ số sai nhìn y hệt một
 * chỉ số đúng (PRD BC-06).
 */

import { describe, expect, it } from 'vitest';
import {
  PENDING_APPROVAL_AGING_DAYS,
  conversionRate,
  countByStatus,
  isStalePendingApproval,
  isWithinPeriod,
  matchesPeriodFilter,
  periodStartDate,
  summarizeBiddingOutcomes,
  summarizeOpportunitiesBySource,
  summarizeOpportunityFunnel,
  type BiddingOutcomeRow,
  type OpportunityFunnelRow,
} from '../bc';
import { sumMoney, toMoney } from '../format';

// 10:00 sáng giờ Việt Nam ngày 25/08/2026 — giữa quý 3.
const now = new Date('2026-08-25T03:00:00Z');

describe('periodStartDate', () => {
  it('tháng này bắt đầu từ ngày 1 của tháng', () => {
    expect(periodStartDate('thang-nay', now)).toBe('2026-08-01');
  });

  it('quý này lùi về tháng đầu quý, không phải tháng hiện tại', () => {
    expect(periodStartDate('quy-nay', now)).toBe('2026-07-01');
    expect(periodStartDate('quy-nay', new Date('2026-02-10T03:00:00Z'))).toBe('2026-01-01');
    expect(periodStartDate('quy-nay', new Date('2026-12-31T03:00:00Z'))).toBe('2026-10-01');
  });

  it('năm nay bắt đầu từ 01/01', () => {
    expect(periodStartDate('nam-nay', now)).toBe('2026-01-01');
  });

  it('"Tất cả" không có mốc đầu kỳ', () => {
    expect(periodStartDate('tat-ca', now)).toBeNull();
  });

  // Mốc đầu kỳ tính theo giờ Việt Nam, không theo UTC: 00:30 ngày 01/09 giờ Việt Nam vẫn
  // còn là 17:30 ngày 31/08 theo UTC. Tính nhầm thì ngày đầu tháng cả hệ thống lệch một kỳ.
  it('đổi kỳ theo giờ Việt Nam, không theo UTC', () => {
    expect(periodStartDate('thang-nay', new Date('2026-08-31T17:30:00Z'))).toBe('2026-09-01');
  });
});

describe('isWithinPeriod', () => {
  it('nhận hồ sơ trong kỳ và loại hồ sơ trước kỳ', () => {
    expect(isWithinPeriod('2026-08-20', 'thang-nay', now)).toBe(true);
    expect(isWithinPeriod('2026-07-31', 'thang-nay', now)).toBe(false);
    expect(isWithinPeriod('2026-07-31', 'quy-nay', now)).toBe(true);
    expect(isWithinPeriod('2026-06-30', 'quy-nay', now)).toBe(false);
  });

  it('ngày đầu kỳ nằm TRONG kỳ', () => {
    expect(isWithinPeriod('2026-08-01', 'thang-nay', now)).toBe(true);
  });

  it('hồ sơ thiếu ngày không được đếm vào kỳ nào, trừ "Tất cả"', () => {
    expect(isWithinPeriod(null, 'thang-nay', now)).toBe(false);
    expect(isWithinPeriod('', 'nam-nay', now)).toBe(false);
    expect(isWithinPeriod(null, 'tat-ca', now)).toBe(true);
  });
});

describe('matchesPeriodFilter', () => {
  it('không lọc gì khi đường dẫn không mang theo kỳ', () => {
    expect(matchesPeriodFilter('2020-01-01', null, now)).toBe(true);
    expect(matchesPeriodFilter(undefined, null, now)).toBe(true);
  });

  // Đây là chỗ dễ sai nhất: danh sách KHÔNG khai báo ngày lập (`undefined`) phải giữ nguyên
  // mọi dòng. Đối xử với nó như "hồ sơ không có ngày" sẽ làm cả danh sách rỗng trắng khi có
  // ai đó bấm vào từ Dashboard, mà không có gì trên màn hình giải thích vì sao.
  it('danh sách không theo dõi ngày lập thì bộ lọc kỳ không áp dụng', () => {
    expect(matchesPeriodFilter(undefined, 'thang-nay', now)).toBe(true);
  });

  it('hồ sơ có trường ngày nhưng để trống thì không thuộc kỳ nào', () => {
    expect(matchesPeriodFilter(null, 'thang-nay', now)).toBe(false);
    expect(matchesPeriodFilter('', 'thang-nay', now)).toBe(false);
  });

  it('còn lại thì so với mốc đầu kỳ như thường', () => {
    expect(matchesPeriodFilter('2026-08-20', 'thang-nay', now)).toBe(true);
    expect(matchesPeriodFilter('2026-07-20', 'thang-nay', now)).toBe(false);
  });
});

describe('countByStatus', () => {
  it('đếm đủ 6 nhóm, nhóm rỗng vẫn có mặt với số 0', () => {
    const counts = countByStatus([
      { status: 'draft' },
      { status: 'overdue' },
      { status: 'overdue' },
    ]);
    expect(counts).toEqual({
      draft: 1,
      pending_approval: 0,
      in_progress: 0,
      completed: 0,
      overdue: 2,
      disputed: 0,
    });
  });
});

describe('conversionRate', () => {
  it('tính đúng phần trăm', () => {
    expect(conversionRate(3, 12)).toBe(25);
  });

  // "Chưa có cơ hội nào" khác hẳn "có cơ hội nhưng không chốt được cái nào".
  it('không có cơ hội nào thì KHÔNG phải 0%', () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(0, 5)).toBe(0);
  });
});

describe('isStalePendingApproval', () => {
  it('chưa quá ngưỡng thì chưa tính là để lâu', () => {
    const requestedAt = new Date(now.getTime() - PENDING_APPROVAL_AGING_DAYS * 24 * 60 * 60 * 1000);
    expect(isStalePendingApproval(requestedAt.toISOString(), now)).toBe(false);
  });

  it('vượt ngưỡng thì tính là để lâu', () => {
    const requestedAt = new Date(
      now.getTime() - (PENDING_APPROVAL_AGING_DAYS + 1) * 24 * 60 * 60 * 1000,
    );
    expect(isStalePendingApproval(requestedAt.toISOString(), now)).toBe(true);
  });

  it('không có ngày gửi hoặc ngày không hợp lệ thì KHÔNG tính là để lâu', () => {
    expect(isStalePendingApproval(null, now)).toBe(false);
    expect(isStalePendingApproval(undefined, now)).toBe(false);
    expect(isStalePendingApproval('', now)).toBe(false);
  });
});

describe('summarizeOpportunitiesBySource (BC-03, phần nguồn khách)', () => {
  const rows: OpportunityFunnelRow[] = [
    {
      companyId: 'c1',
      source: 'Giới thiệu',
      stage: 'ky_hop_dong',
      opportunityCount: 2,
      estimatedValue: '500000000',
    },
    {
      companyId: 'c1',
      source: 'Giới thiệu',
      stage: 'mat_co_hoi',
      opportunityCount: 1,
      estimatedValue: '100000000',
    },
    {
      companyId: 'c1',
      source: 'Facebook',
      stage: 'bao_gia',
      opportunityCount: 3,
      estimatedValue: '300000000',
    },
  ];

  it('cộng dồn mọi giai đoạn về một dòng mỗi nguồn, chỉ tính "ký hợp đồng" là thắng', () => {
    const result = summarizeOpportunitiesBySource(rows);
    expect(result).toHaveLength(2);

    const gioiThieu = result.find((r) => r.source === 'Giới thiệu');
    expect(gioiThieu).toMatchObject({ total: 3, won: 2, value: 600_000_000n });
    expect(gioiThieu!.winRate).toBeCloseTo(66.67, 1);

    const facebook = result.find((r) => r.source === 'Facebook');
    expect(facebook).toEqual({
      source: 'Facebook',
      total: 3,
      won: 0,
      value: 300_000_000n,
      winRate: 0,
    });
  });

  // Nguồn chưa từng ghi (customer.source NULL) phải tách khỏi "Khác" — hai tình huống khác
  // nhau: một bên chưa đo, một bên đã đo và người dùng chọn "Khác".
  it('nguồn NULL từ CSDL gộp vào "Chưa ghi nhận", không lẫn với "Khác"', () => {
    const result = summarizeOpportunitiesBySource([
      {
        companyId: 'c1',
        source: 'Chưa ghi nhận',
        stage: 'tiep_nhan',
        opportunityCount: 1,
        estimatedValue: 0,
      },
      {
        companyId: 'c1',
        source: 'Khác',
        stage: 'tiep_nhan',
        opportunityCount: 1,
        estimatedValue: 0,
      },
    ]);
    expect(result.map((r) => r.source).sort()).toEqual(['Chưa ghi nhận', 'Khác']);
  });
});

describe('summarizeOpportunityFunnel (BC-03, phần phễu bán hàng)', () => {
  it('luôn trả đủ 7 giai đoạn theo đúng thứ tự Kanban, kể cả giai đoạn không có cơ hội nào', () => {
    const result = summarizeOpportunityFunnel([
      {
        companyId: 'c1',
        source: 'Website',
        stage: 'bao_gia',
        opportunityCount: 4,
        estimatedValue: 0,
      },
    ]);
    expect(result.map((r) => r.stage)).toEqual([
      'tiep_nhan',
      'xac_minh',
      'khao_sat',
      'bao_gia',
      'dam_phan',
      'ky_hop_dong',
      'mat_co_hoi',
    ]);
    expect(result.find((r) => r.stage === 'bao_gia')?.count).toBe(4);
    expect(result.find((r) => r.stage === 'tiep_nhan')?.count).toBe(0);
  });

  it('cộng dồn nhiều nguồn khác nhau vào cùng một giai đoạn', () => {
    const result = summarizeOpportunityFunnel([
      {
        companyId: 'c1',
        source: 'Website',
        stage: 'khao_sat',
        opportunityCount: 2,
        estimatedValue: 0,
      },
      {
        companyId: 'c1',
        source: 'Facebook',
        stage: 'khao_sat',
        opportunityCount: 3,
        estimatedValue: 0,
      },
    ]);
    expect(result.find((r) => r.stage === 'khao_sat')?.count).toBe(5);
  });
});

describe('summarizeBiddingOutcomes (BC-03, tỷ lệ trúng thầu và nguyên nhân trượt)', () => {
  it('tính tỷ lệ trúng thầu trên MẪU SỐ đã có kết quả, xếp nguyên nhân trượt theo số lần giảm dần', () => {
    const rows: BiddingOutcomeRow[] = [
      { companyId: 'c1', stage: 'trung_thau', lostReason: null, biddingCount: 3 },
      { companyId: 'c1', stage: 'truot_thau', lostReason: 'Giá cao hơn đối thủ', biddingCount: 5 },
      {
        companyId: 'c1',
        stage: 'truot_thau',
        lostReason: 'Hồ sơ năng lực chưa đủ',
        biddingCount: 2,
      },
    ];
    const result = summarizeBiddingOutcomes(rows);

    expect(result.won).toBe(3);
    expect(result.lost).toBe(7);
    expect(result.winRate).toBeCloseTo(30, 1);
    expect(result.lossReasons).toEqual([
      { reason: 'Giá cao hơn đối thủ', count: 5 },
      { reason: 'Hồ sơ năng lực chưa đủ', count: 2 },
    ]);
  });

  // "Chưa có gói thầu nào ngã ngũ" khác hẳn "trượt hết 100%" — cùng nguyên tắc `conversionRate`.
  it('không có gói thầu nào ngã ngũ thì tỷ lệ trúng thầu là null, không phải 0%', () => {
    expect(summarizeBiddingOutcomes([]).winRate).toBeNull();
  });

  it('trượt thầu mà không ghi nguyên nhân thì gộp vào "Chưa ghi nhận"', () => {
    const result = summarizeBiddingOutcomes([
      { companyId: 'c1', stage: 'truot_thau', lostReason: null, biddingCount: 1 },
    ]);
    expect(result.lossReasons).toEqual([{ reason: 'Chưa ghi nhận', count: 1 }]);
  });
});

describe('cộng tiền', () => {
  // Tiền từ PostgREST về dạng CHUỖI. Cộng chuỗi trong JavaScript ra chuỗi nối, không báo lỗi.
  it('cộng được giá trị đến từ chuỗi, số và bigint lẫn lộn', () => {
    expect(sumMoney(['1000000', 2_000_000, 3_000_000n])).toBe(6_000_000n);
  });

  it('bỏ qua ô trống thay vì hỏng cả tổng', () => {
    expect(sumMoney([null, undefined, '', '500000'])).toBe(500_000n);
  });

  it('giữ nguyên độ chính xác ở giá trị vượt ngưỡng an toàn của số JavaScript', () => {
    expect(toMoney('9007199254740993')).toBe(9_007_199_254_740_993n);
  });
});
