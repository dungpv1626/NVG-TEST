import { describe, expect, it } from 'vitest';
import { showcaseSendPath } from '../send-showcase-link';

describe('showcaseSendPath', () => {
  it('gắn đầu mối, tên khách và lọc sẵn loại mẫu khi loại công trình khớp', () => {
    const path = showcaseSendPath({ leadId: 'dm-1', name: 'Anh Bình', projectType: 'Nhà phố' });
    const params = new URLSearchParams(path.split('?')[1]);
    expect(path.startsWith('/mau-cong-trinh?')).toBe(true);
    expect(params.get('dau-moi')).toBe('dm-1');
    expect(params.get('cho')).toBe('Anh Bình');
    expect(params.get('loai')).toBe('nha_pho');
  });

  it('loại công trình không khớp loại mẫu thì không lọc (không đoán)', () => {
    const path = showcaseSendPath({
      opportunityId: 'ch-1',
      name: null,
      projectType: 'Nhà cao tầng',
    });
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('co-hoi')).toBe('ch-1');
    expect(params.has('loai')).toBe(false);
    expect(params.has('cho')).toBe(false);
  });
});
