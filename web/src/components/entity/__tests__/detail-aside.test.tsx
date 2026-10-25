import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailAside, DetailAsideContext } from '../detail-aside';

const slot = (hidden: boolean) => ({
  targets: { next: null, chain: null },
  register: () => () => undefined,
  hidden,
});

describe('DetailAside — tab cần cả bề ngang (Soạn hợp đồng)', () => {
  it('không có cột phải thì khối nằm tại chỗ', () => {
    render(
      <DetailAsideContext.Provider value={slot(false)}>
        <DetailAside place="next">Bước tiếp theo</DetailAside>
      </DetailAsideContext.Provider>,
    );
    expect(screen.getByText('Bước tiếp theo')).toBeTruthy();
  });

  it('tab fullWidth: khối ẩn hẳn, không dồn về đầu cột chính', () => {
    render(
      <DetailAsideContext.Provider value={slot(true)}>
        <DetailAside place="next">Bước tiếp theo</DetailAside>
      </DetailAsideContext.Provider>,
    );
    expect(screen.queryByText('Bước tiếp theo')).toBeNull();
  });
});
