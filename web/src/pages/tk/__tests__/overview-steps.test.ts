/**
 * Dải bảy bước và dòng hoạt động — hai phép suy thuần, kiểm rời khỏi React.
 *
 * Chỗ đáng canh nhất không phải "bước nào xong" mà là **thứ tự đọc được**: dải chỉ có nghĩa
 * khi đọc một mạch từ trái sang phải, nên không được có bước "xong" nằm sau một bước "chưa mở".
 */

import { describe, expect, it } from 'vitest';
import { designSteps, type StepInput } from '../overview/steps';
import { recentActivity } from '../overview/activity';

const EMPTY: StepInput = {
  brief: null,
  surveyCount: 0,
  program: null,
  feasibleVariants: 0,
  disciplinePercents: [],
  hasEstimate: false,
  customerApproved: false,
};

describe('Dải bảy bước của quy trình thiết kế', () => {
  it('hồ sơ trống: bước đầu đang chạy, sáu bước sau chưa mở', () => {
    const steps = designSteps(EMPTY);
    expect(steps).toHaveLength(7);
    expect(steps.map((s) => s.state)).toEqual([
      'run',
      'todo',
      'todo',
      'todo',
      'todo',
      'todo',
      'todo',
    ]);
  });

  it('bước chưa mở KHÔNG mang con số của chính nó', () => {
    // Có sẵn 12 biên bản khảo sát nhưng đầu bài chưa xác nhận: bày "12 hồ sơ" ở một bước
    // đang khoá làm người đọc tưởng bước đó đã chạy.
    const steps = designSteps({ ...EMPTY, surveyCount: 12 });
    expect(steps[1]!.note).toBe('chưa mở');
  });

  it('không có bước "xong" nào nằm sau một bước "chưa mở"', () => {
    // Dự án nhảy cóc: đã có phương án nhưng chưa chốt chương trình không gian.
    const steps = designSteps({
      ...EMPTY,
      brief: { confirmed: true, completeness: 0.95 },
      surveyCount: 3,
      feasibleVariants: 3,
    });
    const order = steps.map((s) => s.state);
    expect(order.indexOf('todo')).toBeGreaterThan(order.lastIndexOf('done'));
    expect(steps[2]!.state).toBe('run');
  });

  it('độ đầy đủ đầu bài hiện thành phần trăm tròn, lấy từ số thật', () => {
    const steps = designSteps({ ...EMPTY, brief: { confirmed: true, completeness: 0.9512 } });
    expect(steps[0]!.note).toBe('95% đầy đủ');
  });

  it('chưa xác nhận đầu bài thì KHÔNG có số độ đầy đủ, không hiện 0%', () => {
    expect(designSteps(EMPTY)[0]!.note).toBe('');
  });

  it('đủ cả bảy thì không bước nào đang chạy', () => {
    const steps = designSteps({
      brief: { confirmed: true, completeness: 1 },
      surveyCount: 1,
      program: { committed: true, spaceCount: 24 },
      feasibleVariants: 3,
      disciplinePercents: [100, 100, 100],
      hasEstimate: true,
      customerApproved: true,
    });
    expect(steps.every((s) => s.state === 'done')).toBe(true);
  });

  it('mỗi bước trỏ tới một màn hình con có thật', () => {
    const tabs = designSteps(EMPTY).map((s) => s.tab);
    expect(tabs).toEqual([
      'dau-bai',
      'khao-sat',
      'chuong-trinh-khong-gian',
      'phuong-an',
      'ho-so-ky-thuat',
      'du-toan',
      'phien-ban',
    ]);
  });
});

describe('Hoạt động gần đây', () => {
  const when = (v: string) => v.slice(0, 10);

  it('trộn bốn nguồn rồi xếp mới nhất lên đầu', () => {
    const items = recentActivity(
      {
        briefs: [
          {
            id: 'b1',
            version: 1,
            created_at: '2026-09-01T08:00:00Z',
            author: { full_name: 'Đỗ Văn K' },
          },
        ],
        generations: [{ programArtifactId: 'g1', createdAt: '2026-09-04T10:00:00Z', count: 3 }],
        versions: [
          {
            id: 'v1',
            title: 'Mặt bằng kiến trúc',
            published_at: '2026-09-05T09:00:00Z',
            publisher: { full_name: 'Nguyễn Lâm' },
          },
        ],
        changes: [
          {
            id: 'c1',
            title: 'Đổi vị trí thang',
            requested_at: '2026-09-03T07:00:00Z',
            requester_name: 'Khách hàng',
            requester: null,
          },
        ],
      },
      when,
    );
    expect(items.map((i) => i.tone)).toEqual(['version', 'variant', 'change', 'brief']);
    expect(items[0]!.meta).toBe('Nguyễn Lâm · 2026-09-05');
  });

  it('phiên bản CHƯA phát hành không phải một hoạt động', () => {
    const items = recentActivity(
      {
        briefs: [],
        generations: [],
        versions: [{ id: 'v1', title: 'Nháp', published_at: null, publisher: null }],
        changes: [],
      },
      when,
    );
    expect(items).toEqual([]);
  });

  it('không biết ai làm thì bỏ vế người, không ghi "Không rõ"', () => {
    const items = recentActivity(
      {
        briefs: [{ id: 'b1', version: 1, created_at: '2026-09-01T00:00:00Z', author: null }],
        generations: [],
        versions: [],
        changes: [],
      },
      when,
    );
    expect(items[0]!.meta).toBe('2026-09-01');
  });
});
