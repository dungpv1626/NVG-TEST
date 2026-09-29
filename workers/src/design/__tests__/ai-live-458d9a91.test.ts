/**
 * Phát lại lượt chạy thật 458d9a91 (23/09/2026, gpt-5.6-terra, lời dẫn 8.17.0) — cùng đầu bài với
 * fad0c0fa, bốn lời gọi (0,333 USD), không ra phương án.
 *
 * Cả bốn lượt hỏng ở tầng 1 vì cùng một chỗ: `porch_1` mang cửa chính là hai ô ở góc trước, gara bao
 * quanh. Hai chỗ chương trình làm sai:
 *
 *  1. Dòng gợi ý gửi mô hình chỉ nói «vẽ hành lang nối phòng khách với thang» (lỗi đi xuyên hiên), còn
 *     lỗi cửa hiên thiếu vách là lỗi hình học nên không gửi. Mô hình đã có hành lang, giữ nguyên hiên.
 *  2. Lượt sửa 3 nộp lại nguyên văn lượt sửa 2 mà chương trình vẫn gọi lượt 4.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  entryBoxedIssue,
  evaluateHouse,
  planContext,
  programGenerator,
  retryPlan,
  unchangedWhereFailed,
} from '../ai/plan';
import type { PlanIssue } from '../ai/plan-check';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('458d9a91');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function evaluate(intent: HouseIntent) {
  const input = { ...realContextInput(run.digest), mandatory };
  return evaluateHouse(input, planContext(input), intent, generator, prompts);
}

describe('phát lại lượt chạy thật 458d9a91', () => {
  const round2 = evaluate(run.intents.round2!);
  const round3 = evaluate(run.intents.round3!);

  it('T73: tầng 1 giữ ô thang đúng chỗ bản phác thì XẾP ĐƯỢC; lượt hỏng ở tầng 2 vì bản phác', () => {
    // Trước T73 tầng 1 hỏng vì hiên cửa chính bị kẹt (dòng `entry_room_boxed_in`, phép thử
    // `entryBoxedIssue` bên dưới). Từ T73 các khung khoét giữ ô thang bộ / thang máy đúng chỗ bản phác
    // (`sketchCores`) và một khung như thế qua cổng tầng 1. Tầng 2: phòng ngủ chính không giáp phòng
    // giao thông nào ngay trên bản phác (T73 c) — báo mô hình trước cả chuyện nó vẽ thiếu ô.
    // Từ T73 (h) ban công đầu bài khai được đo ngay trên bản phác: đầu bài lượt này đòi một ban công
    // mặt bên trái mà bản phác không có — thêm một lỗi cả nhà (tầng 0) đi cùng lỗi tầng 2.
    expect(round2.rejections.map((rejection) => rejection.level)).toEqual([2, 0]);
    expect(round2.hints.join('\n')).toMatch(/"master_bedroom_1" have no way in/);
  });

  it('lượt sửa nộp lại y nguyên lượt trước ở tầng đang hỏng → dừng, không gọi thêm', () => {
    const asked = round2.renamed ?? run.intents.round2!;
    const plan = retryPlan({ intent: run.intents.round3!, issues: [] }, round3, asked);
    expect(plan.kind).toBe('unchanged');
  });

  it('lượt sửa có đổi bản phác tầng hỏng → vẫn gửi lại mô hình', () => {
    const round1 = evaluate(run.intents.round1!);
    const asked = round1.renamed ?? run.intents.round1!;
    expect(retryPlan({ intent: run.intents.round2!, issues: [] }, round2, asked).kind).toBe(
      'revise',
    );
  });
});

describe('unchangedWhereFailed', () => {
  const base = run.intents.round2!;

  it('bỏ qua chữ tự do: đổi `rationale` vẫn là y nguyên', () => {
    expect(unchangedWhereFailed(base, { ...base, rationale: 'khác' }, [1])).toBe(true);
  });

  it('tầng 1 hỏng: đổi riêng tầng trên không tính là sửa', () => {
    const sketches = base.sketches!.map((sketch) =>
      sketch.level === 2 ? { ...sketch, rows: [...sketch.rows].reverse() } : sketch,
    );
    expect(unchangedWhereFailed(base, { ...base, sketches }, [1])).toBe(true);
    // Tầng 2 hỏng thì đổi ở tầng 2 là sửa thật.
    expect(unchangedWhereFailed(base, { ...base, sketches }, [2])).toBe(false);
    // Lỗi cả nhà (tầng 0): so mọi tầng.
    expect(unchangedWhereFailed(base, { ...base, sketches }, [0])).toBe(false);
  });

  it('đổi phòng mang cửa chính là sửa', () => {
    expect(unchangedWhereFailed(base, { ...base, entry_room: 'living_1' }, [1])).toBe(false);
  });

  it('không có tầng hỏng thì không kết luận y nguyên', () => {
    expect(unchangedWhereFailed(base, base, [])).toBe(false);
  });
});

describe('entryBoxedIssue', () => {
  const issue = (code: string, params: Record<string, string | number>): PlanIssue => ({
    code,
    level: 'blocking',
    message: code,
    params,
  });

  it('chỉ lên tiếng khi lỗi trỏ đúng phòng mang cửa chính', () => {
    const doorShort = issue('door_wall_too_short', { a: 'porch_1', b: 'outside', cm: 110 });
    expect(entryBoxedIssue([doorShort], 'porch_1')?.code).toBe('entry_room_boxed_in');
    expect(entryBoxedIssue([doorShort], 'living_1')).toBeNull();
    // Cửa trong nhà của phòng cửa chính thiếu vách không phải chuyện lối vào.
    const inner = issue('door_wall_too_short', { a: 'porch_1', b: 'living_1', cm: 90 });
    expect(entryBoxedIssue([inner], 'porch_1')).toBeNull();
    const crossed = issue('route_through_service', { room: 'stair_1', via: 'porch_1' });
    expect(entryBoxedIssue([crossed], 'porch_1')?.params).toEqual({ room: 'porch_1' });
    const viaGarage = issue('route_through_service', { room: 'stair_1', via: 'garage_1' });
    expect(entryBoxedIssue([viaGarage], 'porch_1')).toBeNull();
  });

  it('có dòng gợi ý tiếng Anh trong lời dẫn', () => {
    expect(prompts.floorLevel.hints.entry_room_boxed_in).toContain('{room}');
  });
});
