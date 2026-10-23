/**
 * Phần thuần của Đợt 5B: chi phí ước tính từ nhật ký, ba lý do trừ điểm, tên tệp của bộ kết quả.
 */

import { describe, expect, it } from 'vitest';
import {
  costCeiling,
  estimateFromPricing,
  estimateRunCost,
  planRunUnits,
  type CostCallRow,
} from '../run-cost-estimate';
import { topDeductions } from '../plan-deductions';
import {
  bundleFiles,
  bundleReadme,
  bundleZipName,
  codePrefix,
  withExtension,
} from '../result-bundle';

const call = (over: Partial<CostCallRow>): CostCallRow => ({
  projectId: 'p1',
  createdAt: '2026-10-01T10:01:00Z',
  route: 'r1',
  purpose: 'plan_house',
  status: 'ok',
  inputTokens: 10,
  outputTokens: 10,
  costUsd: 0.1,
  ...over,
});
const run = (over: Record<string, unknown> = {}) => ({
  id: 'run',
  projectId: 'p1',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:10:00Z',
  units: 1,
  ...over,
});
const PLAN = { route: 'r1', purposes: ['plan_house', 'plan_house_revise'] };

describe('Chi phí ước tính (estimateRunCost)', () => {
  it('chưa có lượt nào: null — không bịa số', () => {
    expect(estimateRunCost([], [], PLAN)).toBeNull();
    expect(estimateRunCost([run()], [], PLAN)).toBeNull();
  });

  it('cộng cả lượt sửa chạy tuyến khác; chia theo số phương án; trung bình các lượt', () => {
    const calls = [
      call({}),
      call({
        route: 'r-revise',
        purpose: 'plan_house_revise',
        createdAt: '2026-10-01T10:02:00Z',
        costUsd: 0.1,
      }),
      call({ projectId: 'p2', createdAt: '2026-10-02T10:01:00Z', costUsd: 0.4 }),
    ];
    const est = estimateRunCost(
      [
        run(),
        run({
          id: 'b',
          projectId: 'p2',
          createdAt: '2026-10-02T10:00:00Z',
          updatedAt: '2026-10-02T10:10:00Z',
          units: 2,
        }),
      ],
      calls,
      PLAN,
    );
    expect(est).toMatchObject({ perUnitUsd: 0.2, samples: 2, basis: 'history' });
  });

  it('lượt do tuyến KHÁC khởi đầu thì bỏ; lượt có dòng chưa có giá thì bỏ, không coi là 0', () => {
    expect(estimateRunCost([run()], [call({ route: 'r2' })], PLAN)).toBeNull();
    expect(estimateRunCost([run()], [call({ costUsd: null })], PLAN)).toBeNull();
    // Lượt LỖI không trả token nào: không tốn tiền, không làm lượt thành «chưa có giá».
    expect(
      estimateRunCost(
        [run()],
        [
          call({}),
          call({
            status: 'failed',
            costUsd: null,
            inputTokens: null,
            outputTokens: null,
            createdAt: '2026-10-01T10:03:00Z',
          }),
        ],
        PLAN,
      ),
    ).toMatchObject({ perUnitUsd: 0.1, samples: 1, basis: 'history' });
  });

  it('dòng ngoài khoảng thời gian / khác hồ sơ / khác mục đích không tính', () => {
    const est = estimateRunCost(
      [run()],
      [
        call({}),
        call({ createdAt: '2026-10-01T12:00:00Z', costUsd: 9 }),
        call({ projectId: 'p2', costUsd: 9 }),
        call({ purpose: 'plan_house_edit', costUsd: 9 }),
      ],
      PLAN,
    );
    expect(est).toMatchObject({ perUnitUsd: 0.1, samples: 1, basis: 'history' });
  });

  it('số phương án đọc từ kết quả lượt chạy', () => {
    expect(planRunUnits({ plans: [{}, {}], failed: [{}] })).toBe(3);
    expect(planRunUnits(null)).toBeNull();
    expect(planRunUnits({ plans: [], failed: [] })).toBeNull();
  });
});

describe('Ba lý do trừ điểm (topDeductions)', () => {
  const c = (
    code: string,
    score: number | null,
    weight: number,
    notScored: 'gate' | 'thieu_du_lieu' | null = null,
  ) => ({
    code,
    group: 'C',
    vi: code,
    giaiThich: null,
    value: null,
    score,
    weight,
    n: 1,
    label: 'ĐO',
    notScored,
    why: null,
    refs: [],
  });
  const score = (criteria: ReturnType<typeof c>[]) => ({
    scoreVersion: 1,
    currentVersion: 1,
    points: 0,
    scoredWeight: 100,
    reasonedWeight: 0,
    coSoDuLieu: '',
    groups: [],
    criteria,
  });

  it('điểm mất = (1 − điểm) × trọng số; lớn trước; tối đa ba', () => {
    const out = topDeductions(
      score([c('A', 0.5, 10), c('B', 0, 4), c('C', 0.9, 30), c('D', 0.8, 5)]),
    );
    expect(out.map((d) => [d.code, Math.round(d.lost * 10) / 10])).toEqual([
      ['A', 5],
      ['B', 4],
      ['C', 3],
    ]);
  });

  it('không chấm được / đạt trọn / chưa có thước thì không phải lý do trừ', () => {
    expect(topDeductions(null)).toEqual([]);
    expect(
      topDeductions(
        score([c('A', null, 10, 'thieu_du_lieu'), c('B', 1, 10), c('C', 0, 0, 'gate')]),
      ),
    ).toEqual([]);
  });
});

describe('Bộ kết quả — tên tệp theo mã hồ sơ', () => {
  const files = bundleFiles({
    projectId: 'p1',
    code: 'NVO-TK-2026-0007',
    plan: {
      artifactId: 'sha256:abc',
      name: 'Phương án 3.1',
      levels: [
        { level: 1, name: 'Tầng 1' },
        { level: 2, name: 'Tầng 2' },
        { level: 9, name: 'Mái', roof: true },
      ],
    },
    facade: { artifactId: 'sha256:fa', name: 'Mặt đứng 2' },
    imageSet: {
      artifactId: 'sha256:im',
      name: 'Bộ ảnh 1',
      views: [{ view: 'front', label: 'Chính diện' }],
    },
  });

  it('gói và mọi tệp mang tiền tố mã hồ sơ', () => {
    expect(bundleZipName('NVO-TK-2026-0007', 'Phương án 3.1')).toBe(
      'NVO-TK-2026-0007_AI-Design_phuong-an-3-1.zip',
    );
    expect(files.every((f) => f.path.split('/')[1]!.startsWith('NVO-TK-2026-0007_'))).toBe(true);
    expect(codePrefix(null)).toBe('ho-so');
  });

  it('đủ tờ mặt bằng mọi tầng + mái, DXF, ảnh nội thất (trừ mái), mặt đứng, phối cảnh', () => {
    expect(files.map((f) => f.path)).toEqual([
      'mat-bang/NVO-TK-2026-0007_phuong-an-3-1_tang-1.svg',
      'mat-bang/NVO-TK-2026-0007_phuong-an-3-1_tang-2.svg',
      'mat-bang/NVO-TK-2026-0007_phuong-an-3-1_mai.svg',
      'mat-bang/NVO-TK-2026-0007_phuong-an-3-1_ca-nha.dxf',
      'mat-bang/NVO-TK-2026-0007_phuong-an-3-1_tang-1_noi-that',
      'mat-bang/NVO-TK-2026-0007_phuong-an-3-1_tang-2_noi-that',
      'mat-dung/NVO-TK-2026-0007_mat-dung-2.svg',
      'mat-dung/NVO-TK-2026-0007_mat-dung-2.dxf',
      'mat-dung/NVO-TK-2026-0007_mat-dung-2_vat-lieu',
      'phoi-canh/NVO-TK-2026-0007_bo-anh-1_chinh-dien',
    ]);
    // Ảnh do mô hình ảnh vẽ có thể chưa có — 404 là «chưa có», không phải lỗi.
    expect(files.filter((f) => f.optional).every((f) => !/\.(svg|dxf)$/.test(f.path))).toBe(true);
    expect(files[0]!.url).toBe('/design/ai/plan/p1/sheet?artifactId=sha256%3Aabc&level=1');
  });

  it('đuôi ảnh theo loại máy chủ trả', () => {
    expect(withExtension('a/b', 'image/jpeg', 'png')).toBe('a/b.jpg');
    expect(withExtension('a/b', null, 'png')).toBe('a/b.png');
    expect(withExtension('a/b.svg', 'image/png', 'png')).toBe('a/b.svg');
  });

  it('tờ «Đọc trước» nói rõ là bản phác tham khảo và liệt kê tệp thiếu', () => {
    const text = bundleReadme({
      code: 'NVO-TK-2026-0007',
      projectName: 'Nhà thử',
      planName: 'Phương án 3.1',
      facadeName: null,
      imageSetName: null,
      scoreLine: '70%',
      deductions: ['C2: −8 điểm'],
      files: ['mat-bang/x.svg'],
      skipped: ['x_noi-that'],
      createdAt: '22/10/2026 — 10:00',
      noCodeCheck: 'Không kiểm quy chuẩn xây dựng.',
    });
    expect(text).toContain('BẢN PHÁC THAM KHẢO');
    expect(text).toContain('Không kiểm quy chuẩn xây dựng.');
    expect(text).toContain('Mặt đứng: chưa có');
    expect(text).toContain('x_noi-that');
  });
});

describe('Ước tính lần đầu theo bảng giá (estimateFromPricing, 23/10/2026)', () => {
  const PRICED = {
    purposes: ['plan_house', 'plan_house_revise'],
    inputPer1mUsd: 2,
    outputPer1mUsd: 12,
  };

  it('nhân bảng giá của mô hình đang chọn với số token ĐO ĐƯỢC ở lượt trước (tuyến nào cũng được)', () => {
    const calls = [
      call({ route: 'r-khac', inputTokens: 500_000, outputTokens: 50_000 }),
      call({
        route: 'r-khac',
        purpose: 'plan_house_revise',
        createdAt: '2026-10-01T10:02:00Z',
        inputTokens: 500_000,
        outputTokens: 50_000,
      }),
    ];
    const est = estimateFromPricing([run()], calls, PRICED);
    // (1.000.000 × 2 + 100.000 × 12) / 1e6 = 3,2 USD mỗi phương án; 1,6 USD mỗi lượt gọi.
    expect(est?.basis).toBe('pricing');
    expect(est?.samples).toBe(1);
    expect(est?.perUnitUsd).toBeCloseTo(3.2);
    expect(est?.perCallUsd).toBeCloseTo(1.6);
  });

  it('không bịa: chưa có lượt nào, mô hình chưa khai giá, hoặc lượt thiếu số token → null', () => {
    expect(estimateFromPricing([], [], PRICED)).toBeNull();
    expect(estimateFromPricing([run()], [call({})], { ...PRICED, inputPer1mUsd: null })).toBeNull();
    expect(estimateFromPricing([run()], [call({ inputTokens: null })], PRICED)).toBeNull();
  });

  it('trần = giá một lượt gọi × số lượt tối đa × số phương án; thiếu một trong hai thì null', () => {
    const est = { perUnitUsd: 0.4, samples: 2, basis: 'history' as const, perCallUsd: 0.1 };
    expect(costCeiling(est, 5, 2)).toBeCloseTo(1);
    expect(costCeiling(est, null, 2)).toBeNull();
    expect(costCeiling({ ...est, perCallUsd: null }, 5, 1)).toBeNull();
    expect(costCeiling(null, 5, 1)).toBeNull();
  });

  it('ước tính từ tiền thật cũng mang giá một lượt gọi', () => {
    const est = estimateRunCost(
      [run()],
      [call({}), call({ purpose: 'plan_house_revise', createdAt: '2026-10-01T10:02:00Z' })],
      PLAN,
    );
    expect(est?.perCallUsd).toBeCloseTo(0.1);
  });
});
