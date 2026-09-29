/**
 * Phát lại lượt chạy thật 8efa35a6 (24/09/2026, gpt-5.6-terra, lời dẫn 8.23.0 — sau T73 c, d). Bốn lời
 * gọi (0,414 USD), không ra phương án.
 *
 * Tầng 1 qua cả bốn lượt. Tầng 2: câu nhắc «phòng không có lối vào» CÓ tác dụng — mỗi lượt mô hình sửa
 * đúng phòng bị báo — nhưng lại làm hở một phòng khác (lượt 1 laundry, 2 wc_4, 3 phòng thờ + laundry,
 * 4 phòng ngủ 5). Lượt 1 còn báo nhầm hộp kỹ thuật `shaft_1`, loại không cần cửa. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('8efa35a6');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function evaluate(round: string) {
  const input = { ...realContextInput(run.digest), mandatory };
  return evaluateHouse(input, planContext(input), run.intents[round]!, generator, prompts);
}

describe('phát lại lượt chạy thật 8efa35a6', () => {
  const rounds = ['round1', 'round2', 'round3', 'round4'].map(evaluate);

  it('tầng 1 qua cả bốn lượt — lượt nào cũng chỉ hỏng ở tầng 2', () => {
    for (const evaluation of rounds) {
      // Từ T73 (h) ban công đầu bài khai được đo ngay trên bản phác: đầu bài lượt này đòi một ban công
      // mặt bên trái mà bản phác không có — thêm một lỗi cả nhà (tầng 0) đi cùng lỗi tầng 2.
      expect(evaluation.rejections.map((rejection) => rejection.level)).toEqual([2, 0]);
    }
  });

  it('hộp kỹ thuật (`no_door_required`) không bị báo «không có lối vào»; giặt phơi mở ra ban công được (T91)', () => {
    const message = rounds[0]!.rejections[0]!.messages.join(' ');
    expect(message).not.toMatch(/shaft_1/);
    // T91 (Haan 27/09/2026): giặt phơi được mở cửa từ ban công — không còn bị báo không lối vào.
    expect(message).not.toMatch(/"laundry_1"/);
  });

  it('mỗi lượt báo đúng phòng không có lối vào trên bản phác', () => {
    const cut = rounds.map((evaluation) => evaluation.rejections[0]!.messages.join(' '));
    expect(cut[1]).toMatch(/"wc_4"/);
    expect(cut[2]).toMatch(/"altar_room_1"/);
    expect(cut[2]).not.toMatch(/"laundry_1"/);
    expect(cut[3]).toMatch(/"bedroom_5"/);
  });

  it('câu nhắc liệt kê cả các phòng ĐANG có lối vào và dặn giữ chúng (T73 e)', () => {
    // Lượt 3 báo phòng thờ + laundry; lượt 4 mô hình sửa chúng mà làm hở bedroom_5 — câu nhắc lượt 3
    // khi ấy không hề nhắc tới bedroom_5.
    const hint = rounds[2]!.hints.join(' ');
    expect(hint).toMatch(/must KEEP it after your change: .*"bedroom_5"/);
    expect(hint).not.toMatch(/KEEP it.*"altar_room_1"/);
  });
});
