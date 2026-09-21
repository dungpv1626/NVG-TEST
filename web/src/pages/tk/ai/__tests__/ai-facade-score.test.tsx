/**
 * Panel điểm mặt đứng và bảng KỸ SƯ CHẤM LẠI (T63) — dựng trong bộ nhớ, không gọi mạng.
 *
 * Haan chọn «Máy chấm + kỹ sư chấm lại». Bộ này canh những chỗ mà một lỗi sẽ KHÔNG trông giống lỗi,
 * vì mọi cách hiểu sai đều ra một con số trông hợp lý:
 *
 *  1. **Tiêu chí để «Theo máy» KHÔNG được gửi đi.** Gửi kèm điểm 0 là biến «tôi không có ý kiến»
 *     thành «tôi chấm trượt» — và bảng điểm vẫn ra một con số bình thường.
 *  2. **Tiêu chí không áp dụng (trọng số 0) không được mời chấm.** Một ô nhập không dịch chuyển
 *     con số nào là lời nói dối im lặng.
 *  3. **Chấm khác máy thì đọc được CẢ HAI.** Bảng đã sửa mà giấu số cũ là chỗ không kiểm lại được.
 *  4. **Con số hiện lên là con số của người** khi đã có bản chấm — và phải nói rõ đó là người chấm.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';
import type { AiFacadeReviewView, AiFacadeScore } from '@/hooks/use-ai-design';

const state = vi.hoisted(() => ({ save: vi.fn((_input: unknown, _opts?: unknown) => undefined) }));

vi.mock('@/hooks/use-ai-design', () => ({
  useSaveFacadeReview: () => ({
    mutate: state.save,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const { FacadeScorePanel } = await import('../ai-facade-score');

type Criterion = AiFacadeScore['criteria'][number];

function criterion(over: Partial<Criterion> = {}): Criterion {
  return {
    code: 'V1',
    group: 'V',
    vi: 'Phần đế tối màu hơn thân nhà',
    giaiThich: null,
    value: 1,
    score: 1,
    weight: 10,
    n: 6,
    label: 'ĐO',
    doAi: true,
    why: null,
    ...over,
  };
}

function score(over: Partial<AiFacadeScore> = {}): AiFacadeScore {
  return {
    scoreVersion: 2,
    coSoDuLieu: '6 công trình NVO',
    points: 10,
    scoredWeight: 10,
    percent: 100,
    acceptPercent: 80,
    groups: [{ code: 'V', vi: 'Vật liệu và màu', weight: 10, scoredWeight: 10, points: 10 }],
    criteria: [criterion()],
    ...over,
  };
}

function panel(props: { score?: AiFacadeScore; review?: AiFacadeReviewView | null } = {}) {
  return renderWithApp(
    <FacadeScorePanel
      score={props.score ?? score()}
      review={props.review ?? null}
      projectId="p1"
      artifactId="sha256:ff"
      readOnly={false}
    />,
  );
}

describe('Kỹ sư chấm lại', () => {
  it('tiêu chí để «Theo máy» KHÔNG đi vào bảng gửi lên — im lặng không phải chấm 0', async () => {
    const user = userEvent.setup();
    panel({
      score: score({
        criteria: [criterion(), criterion({ code: 'V2', vi: 'Phần đế dùng vật liệu ốp' })],
        groups: [{ code: 'V', vi: 'Vật liệu và màu', weight: 20, scoredWeight: 20, points: 20 }],
      }),
    });
    state.save.mockClear();

    await user.click(screen.getByRole('button', { name: 'Kỹ sư chấm lại' }));
    const rows = screen.getAllByRole('combobox');
    expect(rows).toHaveLength(2);
    await user.selectOptions(rows[0]!, '0');
    await user.click(screen.getByRole('button', { name: 'Lưu bảng chấm' }));

    expect(state.save).toHaveBeenCalledTimes(1);
    const sent = state.save.mock.calls[0]![0] as {
      review: { criteria: Array<{ code: string; score: number | null }> };
    };
    expect(sent.review.criteria).toEqual([{ code: 'V1', score: 0, note: null }]);
  });

  it('tiêu chí KHÔNG ÁP DỤNG không có ô chấm, và nói rõ vì sao', async () => {
    const user = userEvent.setup();
    panel({
      score: score({
        criteria: [
          criterion({
            code: 'M1',
            group: 'M',
            vi: 'Mái Nhật dốc 30–32°',
            score: null,
            value: null,
            weight: 0,
            why: 'Chỉ chấm cho nhà mái Nhật.',
          }),
        ],
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Kỹ sư chấm lại' }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/không áp dụng cho ngôi nhà này/)).toBeInTheDocument();
  });

  it('đã có bản chấm: hiện điểm NGƯỜI, nói rõ là người chấm, và giữ lại điểm máy của dòng đã sửa', () => {
    const machine = score();
    panel({
      score: machine,
      review: {
        artifactId: 'sha256:rr',
        reviewedAt: '2026-09-20T03:00:00Z',
        note: 'Đế nhìn trên bản in vẫn sáng hơn thân.',
        machinePercent: 100,
        criteria: [{ code: 'V1', score: 0, note: 'Đo trên bản in.' }],
        score: {
          ...machine,
          points: 0,
          percent: 0,
          criteria: [criterion({ score: 0 })],
          groups: [{ code: 'V', vi: 'Vật liệu và màu', weight: 10, scoredWeight: 10, points: 0 }],
          reviewed: ['V1'],
          changed: ['V1'],
          staleRuler: false,
        },
      },
    });

    expect(screen.getByText(/0% · ngưỡng 80%/)).toBeInTheDocument();
    expect(screen.getByText(/Kỹ sư đã chấm lại/)).toBeInTheDocument();
    expect(screen.getByText(/máy chấm 100%/)).toBeInTheDocument();
    expect(screen.getByText(/không phải phê duyệt/)).toBeInTheDocument();
    expect(screen.getByText(/Đế nhìn trên bản in/)).toBeInTheDocument();
  });

  it('bản chấm dựng trên thước CŨ thì nói ra, không lặng lẽ đem so', () => {
    const machine = score();
    panel({
      score: machine,
      review: {
        artifactId: 'sha256:rr',
        reviewedAt: '2026-09-20T03:00:00Z',
        note: null,
        machinePercent: 90,
        criteria: [],
        score: { ...machine, reviewed: [], changed: [], staleRuler: true },
      },
    });
    expect(screen.getByText(/bản thước cũ/)).toBeInTheDocument();
  });

  it('chỉ đọc thì không có nút chấm lại', () => {
    renderWithApp(
      <FacadeScorePanel
        score={score()}
        review={null}
        projectId="p1"
        artifactId="sha256:ff"
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: /chấm lại/i })).toBeNull();
  });
});
