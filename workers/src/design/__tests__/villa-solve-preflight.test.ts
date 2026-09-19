/**
 * Tiền kiểm bắt buộc của Đợt 0 (07/09/2026): gửi ĐÚNG loại hình sang bộ giải có làm dự án nào
 * đang chạy được thành vô nghiệm không.
 *
 * Cho tới hôm nay `SolveRequest` không mang `building_type`, nên Container rơi về mặc định
 * `"nha_pho"` và mọi biệt thự được giải với khoảng lùi 0 và mật độ 1,0 (V-23). Sửa lại cho
 * đúng nghĩa là biệt thự bỗng nhiên bị lùi 3 m và trần mật độ 0,6 — thu hẹp thật, trên những
 * lô trước đây được phủ kín. Đó là rủi ro lớn nhất của cả đợt sửa, và nó KHÔNG lộ ra ở bộ
 * kiểm thử một phía: bộ giải nằm ở runtime khác.
 *
 * Bộ này chạy cả hai chiều trên cùng một đề bài và so kết quả, nên nó vừa là tiền kiểm vừa là
 * bằng chứng con số thật sự đổi — một bài chỉ khẳng định "vẫn khả thi" sẽ xanh y hệt nếu tham
 * số bị bỏ qua lần nữa.
 *
 * Cần Container:
 *     docker run --rm -d -p 8080:8080 nvg-design-compute
 *     DESIGN_COMPUTE_URL=http://localhost:8080 npx vitest run --project logic \
 *       workers/src/design/__tests__/villa-solve-preflight.test.ts
 */

import { describe, expect, it } from 'vitest';
import type { DesignBrief } from '@nvg/shared/design';
import { HttpComputeBackend } from '../compute-backend';
import { buildSpaceProgram } from '../program/engine';
import { buildArchModel, layoutIntent, solveFloorPlan } from '../workflows/steps';
import { plateFor } from '../layout/plate';
import { siteFaces, parseSiteContext } from '../kb/site-context';
import { ruleCatalogue } from '../layout/summary';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { CORPUS } from './program-corpus';
import {
  testNorms,
  testRulePack,
  testSiteContextYaml,
  testVocabularyYaml,
} from './program-fixtures';

const computeUrl = process.env.DESIGN_COMPUTE_URL;
const describeSolve = computeUrl ? describe : describe.skip;

const REF = `sha256:${'a'.repeat(64)}`;
const VILLAS = CORPUS.filter((c) => c.brief.building_type !== 'nha_pho');

describeSolve('Tiền kiểm: gửi đúng loại hình không làm biệt thự nào vô nghiệm', () => {
  const rules = testRulePack();
  const norms = testNorms();
  const vocabulary = parseVocabulary(testVocabularyYaml());
  const groups = roomGroups(vocabulary);
  const siteContext = parseSiteContext(testSiteContextYaml());

  async function solveAs(brief: DesignBrief, buildingType: DesignBrief['building_type']) {
    const program = buildSpaceProgram({ brief, briefRef: REF, rules, norms });
    const catalogue = ruleCatalogue(rules.rules, brief.building_type, groups);
    const faces = siteFaces(brief.site as never, siteContext);
    const intent = layoutIntent(program.payload, REF, {
      openFaces: faces.open,
      accessFaces: faces.access,
      faceOf: catalogue.faceOf,
      minSideOf: catalogue.minSideOf,
      plate: plateFor(brief, program.payload, catalogue.setbacks),
    });
    return solveFloorPlan(new HttpComputeBackend(computeUrl!), {
      intent: intent.payload,
      intentRef: REF,
      program: program.payload,
      site: brief.site,
      buildingType,
      locality: brief.locality,
      timeBudgetS: 30,
      openFaces: faces.open,
      accessFaces: faces.access,
      groups,
    });
  }

  it('bộ đề có biệt thự để kiểm — nếu không thì bài này không canh gì cả', () => {
    expect(VILLAS.length).toBeGreaterThan(0);
  });

  for (const item of VILLAS) {
    it(`gửi đúng loại hình KHÔNG đổi kết quả: ${item.name}`, async () => {
      // Đây là câu hỏi của tiền kiểm, và nó không phải "biệt thự có giải được không".
      // Đo ngày 07/09/2026: 4 trong 5 đề biệt thự của bộ đề ĐÃ vô nghiệm từ trước (V-24), vì
      // hai khung mẫu hiện có đều dựng cho lô hẹp-sâu của nhà phố. Bắt bài này đòi `ok` là
      // biến một lỗi có sẵn thành lỗi của đợt sửa này, và sẽ phải tắt bài đi — tức mất luôn
      // chỗ canh hồi quy.
      //
      // Câu hỏi đúng: sửa V-23 có làm đề nào ĐỔI TRẠNG THÁI không. Bài này giữ được nghĩa cả
      // sau khi V-24 được gỡ, vì lúc đó cả hai vế cùng chuyển sang `ok`.
      const brief = item.brief as DesignBrief;
      const [before, after] = await Promise.all([
        solveAs(brief, 'nha_pho'),
        solveAs(brief, brief.building_type),
      ]);
      expect(after.status).toBe(before.status);
    }, 300_000);
  }

  it('hình bao thụt vào theo khoảng lùi, và mặt đứng vẫn có lỗ mở (V-22)', async () => {
    // Đo được ngày 07/09/2026 trên đề 12×18: thửa 12 × 18, hình bao [0, 3, 12, 12,3] — thụt
    // đúng 3 m khoảng lùi trước của biệt thự. Mã cũ so tường với `y = 0` của RANH THỬA, nên
    // mặt trước trả về rỗng; nay ra ba lỗ mở.
    const solvable = VILLAS.find((c) => (c.brief.site as { width_m: number }).width_m === 12)!;
    const solved = await solveAs(solvable.brief as DesignBrief, 'biet_thu');
    expect(solved.status).toBe('ok');

    const plan = solved.payload as { footprint_m?: number[]; site: { depth_m: number } };
    expect(
      plan.footprint_m,
      'Container phải ghi hình bao ra — dựng lại ảnh nếu thiếu',
    ).toBeDefined();
    expect(plan.footprint_m![1]).toBeGreaterThanOrEqual(3);
    expect(plan.footprint_m![1]).toBeLessThan(plan.site.depth_m);

    const arch = buildArchModel(solved.payload as never, REF);
    const openings = (arch.payload.facades ?? []).reduce(
      (total, facade) => total + (facade.openings ?? []).length,
      0,
    );
    expect(openings).toBeGreaterThan(0);
  }, 300_000);

  it('ít nhất một đề biệt thự giải được — nếu không, so sánh ở trên vô nghĩa', async () => {
    // Không có vế này thì bộ trên vẫn xanh khi MỌI thứ vô nghiệm theo cả hai chiều, kể cả vì
    // Container chết hay hợp đồng vỡ.
    const solvable = VILLAS.find((c) => (c.brief.site as { width_m: number }).width_m === 12);
    expect(solvable, 'đề biệt thự 12×18 là mốc đối chiếu của bộ này').toBeDefined();
    const solved = await solveAs(solvable!.brief as DesignBrief, 'biet_thu');
    expect(solved.status).toBe('ok');
  }, 300_000);
});
