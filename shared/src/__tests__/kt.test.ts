/**
 * Hàm nghiệp vụ thuần của Module KT — chạy trong bộ nhớ, không cần CSDL.
 *
 * Trọng tâm là hai chỗ dễ sai theo hướng nguy hiểm:
 *
 *  - `receivableAging` cộng phần CÒN LẠI, không phải giá trị gốc. Nhầm chỗ này thì một hóa
 *    đơn 500 triệu đã thu 480 triệu vẫn hiện nguyên trong cột "quá hạn trên 90 ngày", và
 *    Ban Giám đốc đọc ra một khoản nợ xấu không tồn tại.
 *  - `agingBucketCode` coi "không có hạn" là CHƯA đến hạn. Mặc định ngược lại sẽ làm báo cáo
 *    công nợ phồng lên bằng những khoản chưa ai chốt ngày.
 *
 * Các mốc chia khung là DỮ LIỆU CẤU HÌNH (bảng `aging_buckets`), không phải hằng số — nên các
 * phép thử dưới đây truyền thẳng bộ khung vào hàm, và có một phép thử đổi hẳn sang bộ mốc khác
 * để chứng minh đổi cấu hình là đổi được cách chia. Cùng quy tắc được viết lần thứ hai bằng SQL
 * trong hàm `receivable_aging` (migration 0046); `db/src/__tests__/kt.test.ts` đối chiếu hai bản.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGING_BUCKETS,
  accountingPeriodCode,
  accountingPeriodLabel,
  advanceDisplayStatus,
  advanceOutstanding,
  agingBucketCode,
  checkStepOfStage,
  overdueDays,
  PAYMENT_CHECK_STEPS,
  PAYMENT_REQUEST_STAGE_META,
  projectCashFlow,
  receivableAging,
  receivableDisplayStatus,
} from '../kt';

const TODAY = new Date('2026-08-27T10:00:00+07:00');

/** Ngày cách hôm nay `days` ngày về quá khứ, dạng `yyyy-MM-dd`. */
function daysAgo(days: number): string {
  return new Date(TODAY.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

describe('PAYMENT_REQUEST_STAGE_META — KT-01, KT-02', () => {
  it('mọi bước đều nói rõ đang chờ ai — đây là vướng mắc #6 trong khảo sát', () => {
    for (const meta of Object.values(PAYMENT_REQUEST_STAGE_META)) {
      expect(meta.waitingOn.length).toBeGreaterThan(0);
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  it('chỉ hai bước là kết thúc hồ sơ: đã hạch toán và đã hủy', () => {
    const terminal = Object.entries(PAYMENT_REQUEST_STAGE_META)
      .filter(([, meta]) => meta.isTerminal)
      .map(([stage]) => stage)
      .sort();
    expect(terminal).toEqual(['da_hach_toan', 'huy']);
  });

  it('bị từ chối hiện màu Quá hạn — hồ sơ đang chặn dòng tiền của ai đó', () => {
    expect(PAYMENT_REQUEST_STAGE_META.tu_choi.statusGroup).toBe('overdue');
  });
});

describe('checkStepOfStage — KT-01', () => {
  it('ba bước chờ ứng đúng ba bước kiểm, theo đúng thứ tự PRD', () => {
    expect([
      checkStepOfStage('cho_don_vi'),
      checkStepOfStage('cho_ke_toan'),
      checkStepOfStage('cho_tai_chinh'),
    ]).toEqual([...PAYMENT_CHECK_STEPS]);
  });

  it('bước phê duyệt theo hạn mức KHÔNG phải bước kiểm tra', () => {
    // Nó đi qua Hộp thư Phê duyệt và `approval_limits`, không qua `advance_payment_step`.
    expect(checkStepOfStage('cho_phe_duyet')).toBeNull();
    expect(checkStepOfStage('nhap')).toBeNull();
    expect(checkStepOfStage('da_chi')).toBeNull();
  });
});

describe('advanceOutstanding và advanceDisplayStatus — KT-03', () => {
  it('còn nợ = số ứng trừ số đã hoàn', () => {
    expect(advanceOutstanding(10_000_000n, 4_000_000n)).toBe(6_000_000n);
  });

  it('hoàn dư không làm số còn nợ thành âm', () => {
    expect(advanceOutstanding(10_000_000n, 12_000_000n)).toBe(0n);
  });

  it('hoàn một phần mà quá hạn vẫn là quá hạn', () => {
    // KT-03 nói "hạn hoàn ứng", không nói hoàn từng phần thì được gia hạn.
    expect(advanceDisplayStatus('dang_no', daysAgo(60), TODAY)).toBe('overdue');
  });

  it('chưa tới hạn thì là đang xử lý, hoàn xong là hoàn thành', () => {
    expect(advanceDisplayStatus('dang_no', daysAgo(-10), TODAY)).toBe('in_progress');
    expect(advanceDisplayStatus('da_hoan', daysAgo(60), TODAY)).toBe('completed');
  });

  it('không có hạn hoàn ứng thì không tự coi là quá hạn', () => {
    expect(advanceDisplayStatus('dang_no', null, TODAY)).toBe('in_progress');
  });
});

describe('overdueDays và agingBucketCode — KT-04', () => {
  it('đến hạn hôm nay hoặc mai thì chưa quá hạn ngày nào', () => {
    expect(overdueDays(daysAgo(0), TODAY)).toBe(0);
    expect(overdueDays(daysAgo(-1), TODAY)).toBe(0);
  });

  it('trễ một ngày là trễ một ngày, không phải "chưa đến hạn"', () => {
    // Đây là lỗi cũ: so theo số GIỜ thì hoá đơn đến hạn hôm qua vẫn hiện "chưa đến hạn" suốt
    // cả ngày hôm nay, và bảng tuổi nợ luôn nhẹ hơn thực tế đúng một ngày.
    expect(overdueDays(daysAgo(1), TODAY)).toBe(1);
    expect(agingBucketCode(daysAgo(1), DEFAULT_AGING_BUCKETS, TODAY)).toBe('qua_1_30');
  });

  it('chia đúng theo bộ khung đang cấu hình', () => {
    const at = (d: number) => agingBucketCode(daysAgo(d), DEFAULT_AGING_BUCKETS, TODAY);
    expect(at(-1)).toBe('chua_den_han');
    expect(at(30)).toBe('qua_1_30');
    expect(at(31)).toBe('qua_31_60');
    expect(at(61)).toBe('qua_61_90');
    expect(at(91)).toBe('qua_tren_90');
  });

  it('đổi cấu hình thì đổi cách chia — mốc KHÔNG nằm cứng trong mã', () => {
    // NVG ban hành mốc 15/45 ngày thay cho 30/60/90: sửa dữ liệu, không sửa mã.
    const nvgBuckets = [
      { code: 'som', label: 'Quá hạn 1 – 15 ngày', fromDays: 1, toDays: 15 },
      { code: 'muon', label: 'Quá hạn trên 15 ngày', fromDays: 16, toDays: null },
    ];
    expect(agingBucketCode(daysAgo(10), nvgBuckets, TODAY)).toBe('som');
    expect(agingBucketCode(daysAgo(40), nvgBuckets, TODAY)).toBe('muon');
    expect(agingBucketCode(daysAgo(400), nvgBuckets, TODAY)).toBe('muon');
  });

  it('trễ hơn mọi khung đã cấu hình vẫn rơi vào khung CUỐI, không quay về "chưa đến hạn"', () => {
    // Cấu hình thiếu khung cuối mở là chỗ báo cáo có thể nói ngược: một khoản trễ 200 ngày
    // hiện thành nợ trong hạn.
    const capped = [{ code: 'toi_90', label: 'Quá hạn 1 – 90 ngày', fromDays: 1, toDays: 90 }];
    expect(agingBucketCode(daysAgo(200), capped, TODAY)).toBe('toi_90');
  });

  it('chưa cấu hình khung nào thì mọi khoản nằm ở "chưa đến hạn"', () => {
    // Cố ý KHÔNG dựng lại mốc mặc định: xoá hết cấu hình mà bảng vẫn chia như cũ sẽ khiến
    // người dùng tưởng cấu hình còn hiệu lực.
    expect(agingBucketCode(daysAgo(200), [], TODAY)).toBe('chua_den_han');
  });

  it('không có hạn thanh toán thì KHÔNG tự xếp vào quá hạn', () => {
    expect(agingBucketCode(null, DEFAULT_AGING_BUCKETS, TODAY)).toBe('chua_den_han');
    expect(agingBucketCode('không phải ngày', DEFAULT_AGING_BUCKETS, TODAY)).toBe('chua_den_han');
  });
});

describe('receivableAging — KT-04', () => {
  /** Tổng của một khung theo mã, đọc từ kết quả đã dựng. */
  function bucketTotal(aging: ReturnType<typeof receivableAging>, code: string): bigint {
    return aging.rows.find((r) => r.code === code)?.total ?? -1n;
  }

  it('cộng phần CÒN LẠI, không cộng giá trị gốc', () => {
    const aging = receivableAging(
      [
        { amount: 500_000_000n, settledAmount: 480_000_000n, dueDate: daysAgo(120) },
        { amount: 100_000_000n, settledAmount: 0n, dueDate: daysAgo(10) },
      ],
      DEFAULT_AGING_BUCKETS,
      TODAY,
    );

    expect(bucketTotal(aging, 'qua_tren_90')).toBe(20_000_000n);
    expect(bucketTotal(aging, 'qua_1_30')).toBe(100_000_000n);
    expect(aging.total).toBe(120_000_000n);
  });

  it('luôn trả đủ mọi khung, kể cả khung bằng 0', () => {
    const aging = receivableAging([], DEFAULT_AGING_BUCKETS, TODAY);
    expect(aging.rows.map((r) => r.code)).toEqual([
      'chua_den_han',
      ...DEFAULT_AGING_BUCKETS.map((b) => b.code),
    ]);
    expect(aging.total).toBe(0n);
  });

  it('khoản đã tất toán không xuất hiện ở khung nào', () => {
    const aging = receivableAging(
      [{ amount: 50_000_000n, settledAmount: 50_000_000n, dueDate: daysAgo(200) }],
      DEFAULT_AGING_BUCKETS,
      TODAY,
    );
    expect(aging.total).toBe(0n);
    expect(bucketTotal(aging, 'qua_tren_90')).toBe(0n);
  });

  it('nhận chuỗi từ PostgREST và giữ nguyên độ chính xác ở con số rất lớn', () => {
    const aging = receivableAging(
      [{ amount: '9007199254740993000', settledAmount: '0', dueDate: null }],
      DEFAULT_AGING_BUCKETS,
      TODAY,
    );
    expect(bucketTotal(aging, 'chua_den_han')).toBe(9007199254740993000n);
  });
});

describe('receivableDisplayStatus — KT-04', () => {
  it('thu đủ là hoàn thành, dù đã quá hạn từ lâu', () => {
    expect(receivableDisplayStatus(10n, 10n, daysAgo(300), TODAY)).toBe('completed');
  });

  it('còn nợ và quá hạn là quá hạn; còn nợ chưa tới hạn là đang xử lý', () => {
    expect(receivableDisplayStatus(10n, 3n, daysAgo(5), TODAY)).toBe('overdue');
    expect(receivableDisplayStatus(10n, 3n, daysAgo(-5), TODAY)).toBe('in_progress');
  });
});

describe('projectCashFlow — KT-06', () => {
  it('cộng cả kế hoạch lẫn khoản đã cam kết ở cả hai chiều', () => {
    const result = projectCashFlow({
      openingBalance: 1_000_000_000n,
      plannedIn: 500_000_000n,
      plannedOut: 300_000_000n,
      receivablesDue: 200_000_000n,
      payablesDue: 150_000_000n,
      approvedPayments: 250_000_000n,
    });

    expect(result.totalIn).toBe(700_000_000n);
    expect(result.totalOut).toBe(700_000_000n);
    expect(result.closingBalance).toBe(1_000_000_000n);
    expect(result.isShortfall).toBe(false);
  });

  it('bỏ sót đề nghị đã duyệt chưa chi là chỗ làm bảng dòng tiền đẹp hơn thực tế', () => {
    const withoutApproved = projectCashFlow({
      openingBalance: 100_000_000n,
      plannedIn: 0n,
      plannedOut: 0n,
      receivablesDue: 0n,
      payablesDue: 0n,
      approvedPayments: 0n,
    });
    const withApproved = projectCashFlow({
      openingBalance: 100_000_000n,
      plannedIn: 0n,
      plannedOut: 0n,
      receivablesDue: 0n,
      payablesDue: 0n,
      approvedPayments: 180_000_000n,
    });

    expect(withoutApproved.isShortfall).toBe(false);
    expect(withApproved.isShortfall).toBe(true);
    expect(withApproved.closingBalance).toBe(-80_000_000n);
  });

  it('thiếu số liệu thì coi là 0, không làm hỏng cả bảng', () => {
    const result = projectCashFlow({
      openingBalance: null,
      plannedIn: undefined,
      plannedOut: null,
      receivablesDue: undefined,
      payablesDue: null,
      approvedPayments: undefined,
    });
    expect(result.closingBalance).toBe(0n);
  });
});

describe('accountingPeriodCode và accountingPeriodLabel — KT-09', () => {
  it('mã kỳ luôn là yyyy-MM, có số 0 ở đầu tháng một chữ số', () => {
    expect(accountingPeriodCode(new Date('2026-08-27T00:00:00Z'))).toBe('2026-08');
    expect(accountingPeriodCode('2026-01-05T00:00:00Z')).toBe('2026-01');
  });

  it('ngày không hợp lệ trả chuỗi rỗng thay vì một mã kỳ bịa ra', () => {
    expect(accountingPeriodCode('không phải ngày')).toBe('');
  });

  it('nhãn hiển thị đọc được bằng tiếng Việt', () => {
    expect(accountingPeriodLabel('2026-08')).toBe('Tháng 08/2026');
    // Chuỗi lạ giữ nguyên, không dựng ra một tháng không có thật.
    expect(accountingPeriodLabel('2026')).toBe('2026');
  });
});
