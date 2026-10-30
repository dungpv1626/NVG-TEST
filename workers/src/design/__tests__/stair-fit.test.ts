/**
 * Ô thang có chỗ trong cả nhà không (T178, việc 3) — kiểm tất định trước lời gọi mô hình đầu tiên. Chặn CHỈ khi chắc
 * chắn không dựng được dù đặt ô thang ở đâu; «khá chật» chỉ cảnh báo. Không lượt ghi nào (mọi lượt ghi đều từng được
 * gửi mô hình, có lượt đã qua cổng — 46d6eff3, 7c6de305) bị chặn.
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stairFitIssue, stairFitOf } from '../ai/feasibility';
import { briefAdvice, briefInfeasible, planContext } from '../ai/plan';
import { parseConstructionNorms } from '../kb/construction';
import { stairFit, stairFitBlockMessage, stairFitWarnings } from '../ai/stair-fit';
import { loadRun, read, realContextInput } from './ai-real-context';

const label = (type: string) => ({ bedroom: 'Phòng ngủ', living: 'Phòng khách' })[type] ?? type;

describe('stairFit — hàm thuần', () => {
  it('lô 3,5 m, thang 2,2 × 3,6 m: phòng ngủ cạnh 2,4 m không có chỗ ở hướng nào — chặn', () => {
    const fits = stairFit({
      widthM: 3.5,
      depthM: 5,
      stair: { shortM: 2.2, longM: 3.6 },
      // 6 m² lọt diện tích dải cạnh thang (1,3 × 5 m) — chỉ CẠNH 2,4 m làm nó không có chỗ.
      levels: [{ level: 2, rooms: [{ type: 'bedroom', minM2: 6, minSideM: 2.4 }], plateM2: 17.5 }],
    });
    // Cạnh ngắn theo bề ngang: còn 1,3 m cạnh thang, 1,4 m trước / sau; xoay lại: thang 3,6 m không lọt 3,5 m.
    expect(fits[0]!.blocked).toBe(true);
    const message = stairFitBlockMessage(fits, label)!;
    expect(message).toMatch(
      /^Chưa tạo được mặt bằng vì đầu bài không xếp vừa khối nhà dù đặt ô thang ở đâu/,
    );
    expect(message).toContain('tầng 2: Phòng ngủ cần cạnh tối thiểu 2,4 m');
    expect(message).toContain('1,3 m bề ngang');
    expect(message).toMatch(/Cần nới đầu bài trước khi chạy/);
    // Không IN HOA để nhấn mạnh, không đại từ nhân xưng (CLAUDE.md 4.4).
    expect(message).not.toMatch(/\b(bạn|anh|chị)\b/i);
  });

  it('một hướng thang dựng được thì KHÔNG chặn, dù hướng kia hỏng', () => {
    // 5 × 4,5 m. Cạnh ngắn theo bề ngang: cạnh thang còn 2,8 m — đủ cho phòng ngủ 2,4 m. Xoay thang: cạnh thang còn
    // 1,4 m, trước / sau còn 2,3 m — phòng ngủ không có chỗ.
    const fits = stairFit({
      widthM: 5,
      depthM: 4.5,
      stair: { shortM: 2.2, longM: 3.6 },
      levels: [{ level: 2, rooms: [{ type: 'bedroom', minM2: 9, minSideM: 2.4 }], plateM2: 22.5 }],
    });
    expect(fits[0]!.orientations.map((o) => o.problems.length > 0)).toEqual([false, true]);
    expect(fits[0]!.blocked).toBe(false);
    expect(stairFitBlockMessage(fits, label)).toBeNull();
  });

  it('phòng chỉ đặt được trước / sau thang vượt vùng ấy ở cả hai hướng — chặn, nói số m²', () => {
    // 4 × 10 m, thang 2,2 × 3,6: hướng A còn 1,8 m cạnh thang (phòng khách 3 m không lọt), trước / sau 4 × 6,4 = 25,6 m²;
    // hướng B còn 0,4 m cạnh thang, trước / sau 4 × 7,8 = 31,2 m². Hai phòng khách 16 m² = 32 m² vượt cả hai.
    const fits = stairFit({
      widthM: 4,
      depthM: 10,
      stair: { shortM: 2.2, longM: 3.6 },
      levels: [
        {
          level: 1,
          rooms: [
            { type: 'living', minM2: 16, minSideM: 3 },
            { type: 'living', minM2: 16, minSideM: 3 },
          ],
          plateM2: 40,
        },
      ],
    });
    expect(fits[0]!.blocked).toBe(true);
    expect(stairFitBlockMessage(fits, label)).toMatch(
      /các phòng không đặt cạnh ô thang được \(Phòng khách\) cần khoảng 32 m² mà phần trước và sau ô thang chỉ có (25,6|31,2) m²/,
    );
  });

  it('cảnh báo «khá chật» chỉ khi vùng chặt nhất từ ngưỡng trở lên, và không bao giờ cho tầng đã chặn', () => {
    const fits = stairFit({
      widthM: 10,
      depthM: 10,
      stair: { shortM: 2, longM: 4 },
      levels: [
        {
          level: 2,
          rooms: Array.from({ length: 8 }, () => ({ type: 'bedroom', minM2: 10, minSideM: 2.4 })),
          plateM2: 100,
        },
      ],
    });
    // Mỗi phòng đặt được cả cạnh lẫn trước / sau thang; sàn còn 100 − 8 = 92 m², phòng 80 m² → ~87 %.
    expect(fits[0]!.blocked).toBe(false);
    expect(stairFitWarnings(fits, 0.8)).toHaveLength(1);
    expect(stairFitWarnings(fits, 0.8)[0]).toMatch(/^Tầng 2 khá chật: .* khoảng 87 %/);
    expect(stairFitWarnings(fits, 0.9)).toHaveLength(0);
  });
});

describe('nối vào cổng trước lời gọi mô hình (briefInfeasible)', () => {
  const ids = readdirSync(fileURLToPath(new URL('./fixtures', import.meta.url)))
    .filter((f) => /^ai-run-[0-9a-f]+\.json$/.test(f))
    .map((f) => f.slice('ai-run-'.length, -'.json'.length));

  it('kb/construction_norms.yaml bật kiểm chặn', () => {
    expect(
      parseConstructionNorms(read('kb/construction_norms.yaml')).sketch?.stair_fit?.block,
    ).toBe(true);
  });

  it('không đầu bài nào đã ghi bị chặn hay cảnh báo, kể cả lượt đã qua cổng (46d6eff3, 7c6de305) và ba lượt 9272', () => {
    expect(ids).toEqual(
      expect.arrayContaining(['46d6eff3', '7c6de305', '1dd74b99', '2f443166', 'd919051b']),
    );
    for (const id of ids) {
      const run = loadRun(id);
      // Ngữ cảnh Workflow: loại thang, số đo theo loại nhà, mặt thoáng — đúng thứ lượt thật chạy.
      const input = realContextInput(run.digest, {
        stairShape: true,
        openSetback: true,
        houseProfile: true,
      });
      const context = planContext(input);
      // Nhà một tầng (lượt 620f46a5, nhà vườn) không có ô thang để đo.
      if (run.digest.floors > 1)
        expect(stairFitOf(context.knowledge, input.construction, 0), id).not.toBeNull();
      expect(briefInfeasible(input, context), id).toBeNull();
      expect(briefAdvice(input, context), id).toEqual([]);
    }
  });

  it('đầu bài thu lô còn 3,5 × 7 m: chặn ở cổng, đúng câu của ô thang', () => {
    const run = loadRun('4a25b460');
    const digest = {
      ...run.digest,
      site: { ...run.digest.site, width_m: 3.5, depth_m: 7 },
    } as typeof run.digest;
    const input = realContextInput(digest, {
      stairShape: true,
      openSetback: true,
      houseProfile: true,
    });
    const context = planContext(input);
    const message = stairFitIssue(context.knowledge, input.construction, 0, input.labels);
    expect(message).toMatch(
      /dù đặt ô thang ở đâu — tầng 1: [^;]+ cần cạnh tối thiểu 2,7 m mà cạnh ô thang chỉ còn 1,3 m bề ngang/,
    );
    expect(briefInfeasible(input, context)).not.toBeNull();
  });

  it('tắt `sketch.stair_fit` thì không kiểm (đối chứng)', () => {
    const run = loadRun('4a25b460');
    const digest = {
      ...run.digest,
      site: { ...run.digest.site, width_m: 3.5, depth_m: 7 },
    } as typeof run.digest;
    const base = realContextInput(digest, {
      stairShape: true,
      openSetback: true,
      houseProfile: true,
    });
    const { stair_fit: _off, ...sketch } = base.construction.sketch!;
    const input = { ...base, construction: { ...base.construction, sketch } };
    const context = planContext(input);
    expect(stairFitIssue(context.knowledge, input.construction, 0, input.labels)).toBeNull();
  });
});
