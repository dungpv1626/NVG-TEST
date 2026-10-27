/**
 * Định nghĩa luồng dùng chung (`shared/src/flow.ts`) — dải tiến trình đọc từ đây, hàm chặn ở CSDL
 * đọc từ migration. Hai nơi lệch nhau là màn hình mời bấm một bước mà CSDL từ chối.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BIDDING_FLOW,
  BIDDING_STAGES,
  CONTRACT_FLOW,
  CONTRACT_STAGES,
  OPPORTUNITY_FLOW,
  OPPORTUNITY_STAGES,
  SITE_FLOW,
  SITE_STAGES,
  stepWindow,
  type Flow,
} from '../index';

const FLOWS: [string, Flow<string>, readonly string[]][] = [
  ['cơ hội', OPPORTUNITY_FLOW as Flow<string>, OPPORTUNITY_STAGES],
  ['hợp đồng', CONTRACT_FLOW as Flow<string>, CONTRACT_STAGES],
  ['công trình', SITE_FLOW as Flow<string>, SITE_STAGES],
  ['gói thầu', BIDDING_FLOW as Flow<string>, BIDDING_STAGES],
];

describe.each(FLOWS)('Luồng %s', (_name, flow, stages) => {
  it('mọi giai đoạn đều nằm trên đường chính hoặc là nhánh rẽ — không sót, không thừa', () => {
    expect([...flow.main, ...flow.exits].sort()).toEqual([...stages].sort());
    expect(Object.keys(flow.steps).sort()).toEqual([...stages].sort());
  });

  it('bước kế tiếp nào cũng là giai đoạn có thật', () => {
    for (const [stage, step] of Object.entries(flow.steps)) {
      for (const n of step.next) expect(stages, `${stage} → ${n}`).toContain(n);
    }
  });

  it('đi được hết đường chính: mỗi bước tới được bước sau bằng tay hoặc tự chuyển', () => {
    for (let i = 0; i < flow.main.length - 1; i++) {
      const from = flow.main[i]!;
      const to = flow.main[i + 1]!;
      const byHand = flow.steps[from]!.next.includes(to);
      const byLink = Boolean(flow.steps[to]!.auto);
      expect(byHand || byLink, `${from} → ${to}`).toBe(true);
    }
  });

  it('bước cuối đường chính và nhánh rẽ không đi tới đâu nữa', () => {
    expect(flow.steps[flow.main.at(-1)!]!.next).toEqual([]);
  });
});

describe('Khớp với hàm chặn ở CSDL', () => {
  it('bước kế tiếp của cơ hội y hệt `opportunity_next_stages` (0155)', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'db/migrations/0155_buoc_co_hoi_theo_thu_tu.sql'),
      'utf8',
    );
    const fromSql: Record<string, string[]> = {};
    for (const m of sql.matchAll(/WHEN '([a-z_]+)'\s+THEN ARRAY\[([^\]]*)\]/g)) {
      fromSql[m[1]!] = [...m[2]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    }
    expect(Object.keys(fromSql).length).toBeGreaterThan(0);
    for (const stage of OPPORTUNITY_STAGES) {
      expect([...OPPORTUNITY_FLOW.steps[stage].next], stage).toEqual(fromSql[stage] ?? []);
    }
  });
});

describe('stepWindow — đang ở đâu, tiếp theo, sau đó, bước cuối', () => {
  it('giữa đường chính', () => {
    expect(stepWindow(OPPORTUNITY_FLOW, 'khao_sat')).toEqual({
      done: ['tiep_nhan', 'xac_minh'],
      current: 'khao_sat',
      next: 'bao_gia',
      after: 'dam_phan',
      last: 'ky_hop_dong',
      isExit: false,
    });
  });

  it('sát cuối thì không có bước sau đó', () => {
    const w = stepWindow(CONTRACT_FLOW, 'da_ky');
    expect(w.next).toBe('hoan_thanh');
    expect(w.after).toBeNull();
  });

  it('nhánh rẽ (hủy) không giả vờ đang trên đường chính', () => {
    const w = stepWindow(CONTRACT_FLOW, 'huy');
    expect(w.isExit).toBe(true);
    expect(w.next).toBeNull();
    expect(w.last).toBe('hoan_thanh');
  });
});
