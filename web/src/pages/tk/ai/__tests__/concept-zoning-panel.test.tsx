/**
 * Khối «Sơ đồ công năng từng tầng» (Bộ ý tưởng cho khách B1 + B2) — dựng trong bộ nhớ, không gọi mạng.
 *
 * Canh: không vừa lô thì câu báo + cách nới đứng TRÊN sơ đồ (role alert) mà không khoá gì; sơ đồ hiện qua `<img>`
 * (không nhúng thẳng SVG); chưa có đầu bài đã xác nhận thì nói cần làm gì.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({ response: null as unknown }));

vi.mock('@/lib/design-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/design-api')>()),
  designApi: () => Promise.resolve(state.response),
}));

const { ConceptZoningPanel, zoningFileName } = await import('../concept-zoning-panel');

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>Phòng khách</text></svg>';

describe('Sơ đồ công năng từng tầng', () => {
  it('không vừa lô: câu báo và cách nới đứng trên sơ đồ, sơ đồ qua <img>', async () => {
    state.response = {
      briefArtifactId: 'b1',
      zoning: {
        verdict: 'over',
        shortfallM: 1.31,
        messages: ['Đầu bài chưa vừa lô: tầng 1 … thiếu khoảng 1,3 m.', 'Ước lượng …'],
        suggestions: ['Bỏ giếng trời ở tầng 1: bớt khoảng 1,5 m chiều sâu (tầng 1 khi đó vừa).'],
        floors: [],
      },
      svg: SVG,
    };
    const { container } = renderWithApp(
      <ConceptZoningPanel projectId="p1" projectCode="NVO-TK-1" />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Đầu bài chưa vừa lô');
    expect(screen.getByText('Chưa vừa lô')).toBeInTheDocument();
    expect(screen.getByText(/Bỏ giếng trời ở tầng 1/)).toBeInTheDocument();
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    // Tờ không nhúng thẳng vào trang.
    expect(container.querySelector('svg text')).toBeNull();
    expect(screen.getByRole('button', { name: /Tải sơ đồ/ })).toBeEnabled();
  });

  it('vừa lô: không có câu báo đỏ, không có mục cách nới', async () => {
    state.response = {
      briefArtifactId: 'b1',
      zoning: {
        verdict: 'fits',
        shortfallM: 0,
        messages: [
          'Đầu bài vừa lô: tầng chật nhất (tầng 1) cần khoảng 12,8 m trên 16,0 m chiều sâu.',
        ],
        suggestions: [],
        floors: [],
      },
      svg: SVG,
    };
    renderWithApp(<ConceptZoningPanel projectId="p1" />);
    expect(await screen.findByText('Vừa lô')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Cách nới đầu bài')).toBeNull();
  });

  it('chưa xác nhận đầu bài thì nói cần làm gì', async () => {
    state.response = { briefArtifactId: null, zoning: null };
    renderWithApp(<ConceptZoningPanel projectId="p1" />);
    expect(await screen.findByText(/Xác nhận đầu bài ở hồ sơ thiết kế/)).toBeInTheDocument();
  });

  it('tên tệp tải về theo mã hồ sơ', () => {
    expect(zoningFileName('NVO-TK-2026-AT01')).toBe('NVO-TK-2026-AT01_so-do-cong-nang.svg');
  });
});
