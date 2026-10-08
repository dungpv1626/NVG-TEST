/**
 * Dải sáu bước và dòng hoạt động — hai phép suy thuần, kiểm rời khỏi React.
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
  disciplinePercents: [],
  hasEstimate: false,
  customerApproved: false,
  publishedOptions: 0,
  handedOver: false,
};

describe('Dải sáu bước của quy trình thiết kế', () => {
  it('hồ sơ trống: bước đầu đang chạy, năm bước sau chưa mở', () => {
    const steps = designSteps(EMPTY);
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.state)).toEqual(['run', 'todo', 'todo', 'todo', 'todo', 'todo']);
  });

  it('thứ tự theo luồng nghiệp vụ: khách duyệt phương án TRƯỚC hồ sơ kỹ thuật (08/10/2026)', () => {
    // Trước đó «Trình khách» đứng cuối — ngược với `record_design_review`: khách duyệt phương án
    // là thứ mở Hồ sơ kỹ thuật.
    expect(designSteps(EMPTY).map((s) => s.id)).toEqual([
      'dau-bai',
      'khao-sat',
      'trinh-khach',
      'ho-so-ky-thuat',
      'du-toan',
      'ban-giao',
    ]);
  });

  it('Trình khách nói số phương án đã phát hành, rồi «khách đã duyệt»', () => {
    const base = { ...EMPTY, brief: { confirmed: true, completeness: 1 }, surveyCount: 1 };
    expect(designSteps({ ...base, publishedOptions: 2 })[2]!.note).toBe('2 phương án đã phát hành');
    expect(designSteps({ ...base, customerApproved: true })[2]!.note).toBe('khách đã duyệt');
  });

  it('bước chưa mở KHÔNG mang con số của chính nó', () => {
    // Có sẵn 12 biên bản khảo sát nhưng đầu bài chưa xác nhận: bày "12 hồ sơ" ở một bước
    // đang khoá làm người đọc tưởng bước đó đã chạy.
    const steps = designSteps({ ...EMPTY, surveyCount: 12 });
    expect(steps[1]!.note).toBe('chưa mở');
  });

  it('không có bước "xong" nào nằm sau một bước "chưa mở"', () => {
    // Dự án nhảy cóc: đã có dự toán nhưng hồ sơ kỹ thuật chưa xong.
    const steps = designSteps({
      ...EMPTY,
      brief: { confirmed: true, completeness: 0.95 },
      surveyCount: 3,
      customerApproved: true,
      disciplinePercents: [40],
      hasEstimate: true,
    });
    const order = steps.map((s) => s.state);
    expect(order.indexOf('todo')).toBeGreaterThan(order.lastIndexOf('done'));
    expect(steps[3]!.state).toBe('run');
  });

  it('độ đầy đủ đầu bài hiện thành phần trăm tròn, lấy từ số thật', () => {
    const steps = designSteps({ ...EMPTY, brief: { confirmed: true, completeness: 0.9512 } });
    expect(steps[0]!.note).toBe('95% đầy đủ');
  });

  it('chưa xác nhận đầu bài thì KHÔNG có số độ đầy đủ, không hiện 0%', () => {
    expect(designSteps(EMPTY)[0]!.note).toBe('');
  });

  it('đủ cả sáu thì không bước nào đang chạy', () => {
    const steps = designSteps({
      brief: { confirmed: true, completeness: 1 },
      surveyCount: 1,
      disciplinePercents: [100, 100, 100],
      hasEstimate: true,
      customerApproved: true,
      publishedOptions: 1,
      handedOver: true,
    });
    expect(steps.every((s) => s.state === 'done')).toBe(true);
  });

  it('mỗi bước trỏ tới một màn hình con có thật', () => {
    const tabs = designSteps(EMPTY).map((s) => s.tab);
    expect(tabs).toEqual([
      'dau-bai',
      'khao-sat',
      'phien-ban',
      'ho-so-ky-thuat',
      'du-toan',
      'ho-so-ky-thuat',
    ]);
  });
});

describe('AI Design không là một bước của quy trình (Haan, 07/10/2026)', () => {
  it('dải không có bước AI Design, và chưa dùng AI không khoá Hồ sơ kỹ thuật', () => {
    const steps = designSteps({
      ...EMPTY,
      brief: { confirmed: true, completeness: 1 },
      surveyCount: 1,
      customerApproved: true,
    });
    expect(steps.map((s) => s.label)).not.toContain('AI Design');
    expect(steps.find((s) => s.id === 'ho-so-ky-thuat')!.state).toBe('run');
  });
});

describe('Hoạt động gần đây', () => {
  const when = (v: string) => v.slice(0, 10);

  it('trộn ba nguồn rồi xếp mới nhất lên đầu — bản phác AI Design không vào đây', () => {
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
    expect(items.map((i) => i.tone)).toEqual(['version', 'change', 'brief']);
    expect(items[0]!.meta).toBe('Nguyễn Lâm · 2026-09-05');
  });

  it('phiên bản CHƯA phát hành không phải một hoạt động', () => {
    const items = recentActivity(
      {
        briefs: [],
        versions: [{ id: 'v1', title: 'Nháp', published_at: null, publisher: null }],
        changes: [],
      },
      when,
    );
    expect(items).toEqual([]);
  });

  it('tab Lịch sử: kể cả góp ý của khách, yêu cầu làm rõ (gửi và trả lời) và mốc bàn giao (08/10/2026)', () => {
    const items = recentActivity(
      {
        briefs: [],
        versions: [],
        changes: [],
        reviews: [
          {
            id: 'r1',
            decisionLabel: 'Khách hàng duyệt',
            versionTitle: 'Phương án bản 2',
            reviewer: 'Anh Tâm',
            reviewed_at: '2026-10-02T00:00:00Z',
          },
        ],
        rfis: [
          {
            id: 'q1',
            code: 'NVO-RFI-2026-0001',
            title: 'Cốt sàn tầng 1',
            created_at: '2026-10-04T00:00:00Z',
            requester: 'Đỗ Văn K',
            answered_at: '2026-10-05T00:00:00Z',
            answerer: 'Phạm Thị D',
          },
        ],
        milestones: [{ id: 'bg', text: 'Bàn giao hồ sơ thi công', at: '2026-10-03T00:00:00Z' }],
      },
      when,
      Number.POSITIVE_INFINITY,
    );
    expect(items.map((i) => i.text)).toEqual([
      'Trả lời yêu cầu làm rõ NVO-RFI-2026-0001',
      'Công trường gửi yêu cầu làm rõ NVO-RFI-2026-0001: Cốt sàn tầng 1',
      'Bàn giao hồ sơ thi công',
      'Khách hàng duyệt: Phương án bản 2',
    ]);
  });

  it('không biết ai làm thì bỏ vế người, không ghi "Không rõ"', () => {
    const items = recentActivity(
      {
        briefs: [{ id: 'b1', version: 1, created_at: '2026-09-01T00:00:00Z', author: null }],
        versions: [],
        changes: [],
      },
      when,
    );
    expect(items[0]!.meta).toBe('2026-09-01');
  });
});
