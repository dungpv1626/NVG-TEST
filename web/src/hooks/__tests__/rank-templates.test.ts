/**
 * Thứ tự mẫu gợi ý cho hợp đồng (chạy thử NVO 30/10/2026): hợp đồng thi công của cơ hội đã ký
 * hợp đồng thiết kế mặc định chọn mẫu trọn gói chỉ vì tên đứng trước.
 */
import { describe, expect, it } from 'vitest';
import { rankTemplates, type ContractTemplateRecord } from '../use-contract-templates';

const t = (id: string, scope: string | null, price: string | null = null) =>
  ({ id, scope_kind: scope, price_form: price }) as unknown as ContractTemplateRecord;

describe('rankTemplates', () => {
  const list = [t('HD-02', 'tron_goi'), t('HD-03', 'thi_cong'), t('chung', null)];

  it('mẫu đúng phạm vi hợp đồng đứng đầu, mẫu khác phạm vi xuống cuối', () => {
    expect(rankTemplates(list, null, 'thi_cong').map((x) => x.id)).toEqual([
      'HD-03',
      'chung',
      'HD-02',
    ]);
  });

  it('không biết phạm vi thì giữ thứ tự cũ', () => {
    expect(rankTemplates(list, null).map((x) => x.id)).toEqual(['HD-02', 'HD-03', 'chung']);
  });

  it('cùng phạm vi thì mẫu khớp hình thức giá trước; mẫu khác hình thức giá bị loại', () => {
    const l = [
      t('a', 'thi_cong'),
      t('b', 'thi_cong', 'tron_goi'),
      t('c', 'thi_cong', 'theo_don_gia'),
    ];
    expect(rankTemplates(l, 'tron_goi' as never, 'thi_cong').map((x) => x.id)).toEqual(['b', 'a']);
  });
});
