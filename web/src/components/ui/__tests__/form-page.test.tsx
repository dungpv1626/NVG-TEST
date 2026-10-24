import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormLayout, FormSection } from '../form-page';

describe('Khuôn biểu mẫu v2', () => {
  it('thẻ «Sau khi lưu» liệt kê đúng thứ tự việc máy làm', () => {
    render(
      <FormLayout afterSave={['Cơ hội vào bước Tiếp nhận', 'Người phụ trách được báo']}>
        <FormSection n={1} title="Khách hàng">
          <input aria-label="Tên" />
        </FormSection>
      </FormLayout>,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['1Cơ hội vào bước Tiếp nhận', '2Người phụ trách được báo']);
    expect(screen.getByRole('heading', { name: 'Khách hàng' })).toBeInTheDocument();
  });

  it('không có gì để nói sau khi lưu thì không dựng cột phải', () => {
    render(
      <FormLayout>
        <FormSection n={1} title="Thông tin">
          <span />
        </FormSection>
      </FormLayout>,
    );
    expect(screen.queryByRole('complementary', { name: 'Sau khi lưu' })).not.toBeInTheDocument();
  });
});
