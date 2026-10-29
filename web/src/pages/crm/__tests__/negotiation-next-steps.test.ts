/**
 * Khối «Việc còn lại tới ký hợp đồng» theo dõi hợp đồng nào khi cơ hội có hai hợp đồng (0243).
 */

import { describe, expect, it } from 'vitest';
import type { GroupContractRow } from '@/hooks/use-contract-group';
import { negotiationTarget } from '../negotiation-next-steps';

const row = (
  scope_kind: GroupContractRow['scope_kind'],
  stage: GroupContractRow['stage'],
): GroupContractRow => ({
  contract_id: `${scope_kind}-${stage}`,
  code: `HD-${scope_kind}`,
  title: null,
  scope_kind,
  stage,
  source_type: 'opportunities',
});

describe('negotiationTarget — hợp đồng thiết kế trước, thi công sau', () => {
  it('chưa có hợp đồng: chưa theo dõi gì', () => {
    expect(negotiationTarget([], false)).toEqual({ target: null, designSigned: null });
  });

  it('hợp đồng thiết kế đang soạn: theo dõi hợp đồng thiết kế', () => {
    const design = row('thiet_ke', 'cho_duyet');
    expect(negotiationTarget([design], false)).toEqual({ target: design, designSigned: null });
  });

  it('hợp đồng thiết kế đã ký: việc tiếp theo là hợp đồng thi công', () => {
    const design = row('thiet_ke', 'da_ky');
    expect(negotiationTarget([design], false)).toEqual({ target: null, designSigned: design });
  });

  it('«Chỉ thiết kế»: hợp đồng thiết kế là đích cuối', () => {
    const design = row('thiet_ke', 'da_duyet');
    expect(negotiationTarget([design], true).target).toBe(design);
  });

  it('đã có hợp đồng thi công: theo dõi hợp đồng thi công, ghi nhận hợp đồng thiết kế đã ký', () => {
    const design = row('thiet_ke', 'da_ky');
    const build = row('thi_cong', 'nhap');
    expect(negotiationTarget([design, build], false)).toEqual({
      target: build,
      designSigned: design,
    });
  });
});
