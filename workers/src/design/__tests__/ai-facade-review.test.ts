/**
 * KỸ SƯ CHẤM LẠI bản mặt đứng (T63) — KHÔNG chạm mạng, không chạm CSDL.
 *
 * Haan chọn «Máy chấm + kỹ sư chấm lại». Bộ này canh đúng những chỗ mà một bảng chấm tay sai sẽ
 * KHÔNG trông giống lỗi — con số vẫn ra, chỉ là nó nói về thứ khác:
 *  · tiêu chí kỹ sư BỎ QUA giữ nguyên điểm máy, không bị hiểu thành chấm 0;
 *  · tiêu chí máy bỏ trống mà người chấm được thì phần trọng số ấy QUAY LẠI mẫu số;
 *  · tiêu chí KHÔNG ÁP DỤNG có trọng số 0, nên chấm tay lên nó không dịch chuyển con số nào;
 *  · thước đổi phiên bản thì bản chấm cũ phải tự khai là cũ.
 */

import { describe, expect, it } from 'vitest';
import type { AiFacadeReview } from '@nvg/shared/design';
import { aiFacadeReviewSchema } from '@nvg/shared/design';
import { parseFacadeQuality } from '../ai/facade/quality';
import { applyFacadeReview, FACADE_REVIEW_SCHEMA_VERSION } from '../ai/facade/review';
import { scoreFacade } from '../ai/facade/score';
import { facadeVocab, VILLA_FACADE } from './ai-facade-fixtures';
import { read } from './ai-real-context';

const quality = parseFacadeQuality(read('kb/facade_quality.yaml'));

const score = (railingCm: number | null = 90) =>
  scoreFacade({ concept: VILLA_FACADE, quality, vocab: facadeVocab, railingCm });

function review(over: Partial<AiFacadeReview> = {}): AiFacadeReview {
  return {
    schema_version: FACADE_REVIEW_SCHEMA_VERSION,
    facade_ref: `sha256:${'b'.repeat(64)}`,
    score_version: quality.scoreVersion,
    machine_percent: 94,
    reviewed_at: '2026-09-20T08:00:00.000Z',
    reviewed_by: null,
    criteria: [],
    note: null,
    ...over,
  };
}

describe('Hợp đồng bảng chấm', () => {
  it('bảng rỗng là hợp lệ — «đồng ý với máy» phải nói được', () => {
    expect(aiFacadeReviewSchema.safeParse(review()).success).toBe(true);
  });

  it('điểm ngoài ba mức 0 / 0,5 / 1 bị từ chối', () => {
    // Trình duyệt gửi gì cũng được, nên chỗ chặn là hợp đồng — ép kiểu ở đây là cố ý.
    const bad = { ...review(), criteria: [{ code: 'V1', score: 0.7, note: null }] };
    expect(aiFacadeReviewSchema.safeParse(bad).success).toBe(false);
  });

  it('không gắn với bản vẽ nào thì không phải một bảng chấm', () => {
    const { facade_ref: _bo, ...thieu } = review();
    expect(aiFacadeReviewSchema.safeParse(thieu).success).toBe(false);
  });
});

describe('Áp bảng chấm lên điểm máy', () => {
  it('tiêu chí kỹ sư bỏ qua GIỮ NGUYÊN điểm máy — bảng rỗng không đổi con số nào', () => {
    const machine = score();
    const after = applyFacadeReview(machine, review(), quality);
    expect(after.percent).toBe(machine.percent);
    expect(after.points).toBe(machine.points);
    expect(after.scoredWeight).toBe(machine.scoredWeight);
    expect(after.changed).toEqual([]);
  });

  it('kỹ sư hạ điểm một tiêu chí thì điểm chung xuống, và tiêu chí ấy vào danh sách đã đổi', () => {
    const machine = score();
    const v1 = machine.criteria.find((c) => c.code === 'V1')!;
    expect(v1.score).toBe(1);
    const after = applyFacadeReview(
      machine,
      review({ criteria: [{ code: 'V1', score: 0, note: 'Đế sáng hơn thân trên bản in.' }] }),
      quality,
    );
    expect(after.points).toBeCloseTo(machine.points - v1.weight, 5);
    expect(after.changed).toEqual(['V1']);
    expect(after.reviewed).toEqual(['V1']);
    expect(after.criteria.find((c) => c.code === 'V1')!.giaiThich).toContain('bản in');
  });

  it('chỗ MÁY BỎ TRỐNG mà người chấm được thì phần trọng số ấy quay lại mẫu số', () => {
    // Chưa biết chiều cao lan can: R1 rỗng, nhóm R nằm ngoài phần chấm được.
    const machine = score(null);
    const r1 = machine.criteria.find((c) => c.code === 'R1')!;
    expect(r1.score).toBeNull();
    // Biệt thự mái Thái: nhóm Mái vốn đã ngoài phép chia, nên mốc so là chính nó khi đủ lan can.
    expect(machine.scoredWeight).toBe(score().scoredWeight - quality.groups.R!.weight);

    const after = applyFacadeReview(
      machine,
      review({ criteria: [{ code: 'R1', score: 1, note: 'Đo trên bản in: 90 cm.' }] }),
      quality,
    );
    expect(after.scoredWeight).toBe(machine.scoredWeight + r1.weight);
    expect(after.points).toBeCloseTo(machine.points + r1.weight, 5);
    expect(after.criteria.find((c) => c.code === 'R1')!.why).toBeNull();
  });

  it('tiêu chí KHÔNG ÁP DỤNG có trọng số 0 — chấm tay lên nó không dịch chuyển con số nào', () => {
    // Biệt thự mái Thái: M1 là tiêu chí của mái Nhật, ra khỏi phép chia hẳn.
    const machine = score();
    expect(machine.criteria.find((c) => c.code === 'M1')!.weight).toBe(0);
    const after = applyFacadeReview(
      machine,
      review({ criteria: [{ code: 'M1', score: 1, note: null }] }),
      quality,
    );
    expect(after.percent).toBe(machine.percent);
    expect(after.scoredWeight).toBe(machine.scoredWeight);
    // Vẫn ghi nhận là đã chấm: màn hình phải nói được rằng ô này không có tác dụng.
    expect(after.reviewed).toEqual(['M1']);
  });

  it('kỹ sư cũng không chấm được thì để RỖNG kèm lý do, không phải 0', () => {
    const machine = score();
    const after = applyFacadeReview(
      machine,
      review({
        criteria: [{ code: 'V2', score: null, note: 'Chưa có mẫu vật liệu để đối chiếu.' }],
      }),
      quality,
    );
    const v2 = after.criteria.find((c) => c.code === 'V2')!;
    expect(v2.score).toBeNull();
    expect(v2.why).toContain('mẫu vật liệu');
    expect(after.scoredWeight).toBe(machine.scoredWeight - v2.weight);
  });

  it('bản chấm dựng trên thước CŨ tự khai là cũ', () => {
    const machine = score();
    expect(applyFacadeReview(machine, review(), quality).staleRuler).toBe(false);
    expect(
      applyFacadeReview(machine, review({ score_version: quality.scoreVersion - 1 }), quality)
        .staleRuler,
    ).toBe(true);
  });
});
