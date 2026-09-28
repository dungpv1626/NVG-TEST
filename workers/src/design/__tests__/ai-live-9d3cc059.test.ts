/**
 * Phát lại lượt chạy thật 9d3cc059 (24/09/2026, GPT-6 Sol — lượt đầu của tuyến `ai_text_openai_sol6`,
 * lời dẫn 8.24.0). Hai lời gọi (0,188 USD) rồi DỪNG, không ra phương án.
 *
 * Lượt sửa thứ nhất chia hành lang tầng 2 thành bốn mẩu nối nhau chỉ MỘT ô — không đặt được cửa (cần 110
 * cm vách). Mọi lỗi báo lên là lỗi hình học nên không gửi mô hình (`retry: none`). T73 (g): tầng đã hỏng
 * thì đo lại lối vào trên bản phác với đoạn tiếp giáp đủ đặt cửa, và gửi mô hình. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('9d3cc059');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

/**
 * Luật ô thang TRƯỚC T74 (T54): mọi loại phòng lấy cửa từ ô thang được, trừ phòng ở. Lượt này ghi dưới
 * luật ấy, và T73 (g) được đo trên đúng tình huống nó sinh ra — giữ nguyên để cơ chế (g) còn phép thử.
 */
function beforeT74() {
  const base = realContextInput(run.digest);
  const passage = base.groups.passage!;
  const oldBlocked = new Set([
    'bedroom',
    'master_bedroom',
    'study',
    'study_area',
    'altar_room',
    'shop',
  ]);
  const allowed = new Set(Object.keys(base.labels).filter((code) => !oldBlocked.has(code)));
  return {
    ...base,
    mandatory,
    groups: { ...base.groups, passage: { ...passage, stairOpensTo: allowed } },
  };
}

describe('T74 — ô thang chỉ mở cửa sang giao thông, khu chung (Haan 25/09/2026)', () => {
  it('bộ xếp không còn tính ô thang là lối vào của WC, kho: tầng 2 xếp được, chỉ còn ban công sai mặt → GỬI LẠI', () => {
    const input = { ...realContextInput(run.digest), mandatory };
    const round2 = evaluateHouse(
      input,
      planContext(input),
      run.intents.round2!,
      generator,
      prompts,
    );
    // T91 (27/09/2026): bếp thành khu đi xuyên — bộ xếp chọn cách chia tầng 1 khác, và tầng 2 nay hỏng
    // vì WC trên bếp (luật T71) cùng lối vào; ban công sai mặt vẫn còn. Điều T74 canh vẫn đúng: không
    // phòng nào còn bị báo «chỉ vào được qua ô thang» ở WC, kho.
    const codes = round2.rejections.flatMap((rejection) => rejection.codes ?? []);
    expect(codes).not.toContain('door_from_stair');
    expect(round2.rejections.flatMap((r) => r.messages).join(' ')).toMatch(/ban công/);
    expect(retryPlan({ intent: run.intents.round2!, issues: [] }, round2).kind).toBe('revise');
  });
});

describe('T73 (g) — tiếp giáp quá ngắn để đặt cửa, nói ra khi tầng đã hỏng (luật ô thang trước T74)', () => {
  const input = beforeT74();
  const round2 = evaluateHouse(input, planContext(input), run.intents.round2!, generator, prompts);

  it('tầng 2 hỏng vì hành lang chia mẩu → lượt GỬI LẠI mô hình, không dừng', () => {
    // Từ T73 (h) ban công đầu bài khai được đo ngay trên bản phác: đầu bài lượt này đòi một ban công
    // mặt sau (và bên trái) mà bản phác không có — thêm một lỗi cả nhà (tầng 0) đi cùng lỗi tầng 2.
    expect(round2.rejections.map((rejection) => rejection.level)).toEqual([2, 0]);
    expect(retryPlan({ intent: run.intents.round2!, issues: [] }, round2).kind).toBe('revise');
  });

  it('câu nhắc nêu các mẩu hành lang, đòi đoạn tiếp giáp đủ ô, và dặn giữ phòng đang ổn', () => {
    const hint = round2.hints.join(' ');
    expect(hint).toMatch(/"circulation_3".*have no way in/);
    expect(hint).toMatch(/at least 2 cells long/);
    expect(hint).toMatch(/must KEEP it after your change: .*"study_1"/);
    // (Trước T91 dòng này canh `master_bedroom_1` — chỉ vào được qua ô thang — không nằm trong danh sách
    // giữ. Bếp thành khu đi xuyên đổi cách chia tầng 1 nên phòng ấy nay có lối vào hợp lệ; phép canh
    // «phòng bị nêu lỗi không nằm trong danh sách giữ» còn ở `ai-live-4b0268b1`.)
  });
});
