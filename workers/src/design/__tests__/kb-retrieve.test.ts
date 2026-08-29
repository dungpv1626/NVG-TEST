/**
 * Tầng 3 của truy hồi: chọn few-shot vừa sát đề bài vừa khác nhau (06-knowledge-base 6.3),
 * và ranh giới dữ liệu của văn bản đem đi nhúng.
 *
 * Hai nhóm test này canh hai loại hỏng khác hẳn nhau:
 *
 *  - MMR hỏng thì mô hình chỉ thấy một cách bố trí và mọi phương án sinh ra na ná nhau — một
 *    lỗi CHẤT LƯỢNG, không có triệu chứng nào ngoài "kết quả nhàm".
 *  - Văn bản nhúng hỏng thì dữ liệu khách hàng đi ra dịch vụ ngoài — một lỗi BẢO MẬT, và nó
 *    cũng không có triệu chứng gì cả.
 */

import { describe, expect, it } from 'vitest';
import {
  adjacencySimilarity,
  pairSimilarity,
  relevance,
  selectDiverse,
  type Candidate,
} from '../kb/mmr';
import { embeddingText, withheldFields } from '../kb/rationale';

function candidate(over: Partial<Candidate> & { id: string }): Candidate {
  return {
    project_code: `NVO-${over.id}`,
    quality_score: 0.8,
    floors: 3,
    site_width_m: 5,
    site_depth_m: 18,
    family_archetype: '3_the_he',
    style: 'hien_dai',
    similarity: 0,
    adjacency: [],
    embedding: null,
    ...over,
  };
}

describe('Độ giống nhau theo liền kề', () => {
  it('quy mã phòng về LOẠI trước khi so', () => {
    // `living_1` của công trình này và `living_1` của công trình kia là hai phòng khác nhau.
    // So nguyên văn thì tín hiệu này luôn gần 0 và thành vô dụng.
    const a = [{ a: 'living_1', b: 'kitchen_1' }];
    const b = [{ a: 'living_3', b: 'kitchen_9' }];
    expect(adjacencySimilarity(a, b)).toBe(1);
  });

  it('cặp không có thứ tự', () => {
    expect(
      adjacencySimilarity([{ a: 'kitchen_1', b: 'dining_1' }], [{ a: 'dining_2', b: 'kitchen_2' }]),
    ).toBe(1);
  });

  it('không có liền kề nào thì trả 0, không phải 1', () => {
    expect(adjacencySimilarity([], [])).toBe(0);
  });
});

describe('Độ sát đề bài', () => {
  it('bản ghi chưa chú giải vẫn có thứ hạng nhờ chất lượng', () => {
    // Phần lớn kho chưa được chú giải nên chưa có vector. Nếu độ sát chỉ dựa vào vector thì
    // mọi ứng viên đều bằng 0 và thứ tự trở thành ngẫu nhiên.
    const good = relevance(candidate({ id: 'a', quality_score: 0.9 }));
    const poor = relevance(candidate({ id: 'b', quality_score: 0.5 }));
    expect(good).toBeGreaterThan(poor);
  });

  it('có vector thì vector kéo thứ hạng lên', () => {
    const near = relevance(candidate({ id: 'a', similarity: 0.9 }));
    const far = relevance(candidate({ id: 'b', similarity: 0.1 }));
    expect(near).toBeGreaterThan(far);
  });
});

describe('Chọn đa dạng (MMR)', () => {
  it('lấy cái sát nhất trước', () => {
    const chosen = selectDiverse(
      [
        candidate({ id: 'a', similarity: 0.2 }),
        candidate({ id: 'b', similarity: 0.9 }),
        candidate({ id: 'c', similarity: 0.5 }),
      ],
      { k: 1 },
    );
    expect(chosen.map((c) => c.id)).toEqual(['b']);
  });

  it('không chọn năm bản ghi gần trùng nhau', () => {
    // Ba bản ghi 5 m gần như trùng nhau + một bản 8 m khác hẳn. Xếp hạng thuần sẽ lấy hai
    // trong ba cái giống nhau; MMR phải lấy cái khác.
    const pool = [
      candidate({ id: 'a', similarity: 0.9, site_width_m: 5 }),
      candidate({ id: 'b', similarity: 0.88, site_width_m: 5 }),
      candidate({ id: 'c', similarity: 0.86, site_width_m: 5 }),
      candidate({ id: 'd', similarity: 0.6, site_width_m: 8, family_archetype: 'hat_nhan' }),
    ];
    const chosen = selectDiverse(pool, { k: 2, lambda: 0.5 });
    expect(chosen.map((c) => c.id)).toEqual(['a', 'd']);
  });

  it('lambda = 1 tắt hẳn tính đa dạng, quay về xếp hạng thuần', () => {
    const pool = [
      candidate({ id: 'a', similarity: 0.9, site_width_m: 5 }),
      candidate({ id: 'b', similarity: 0.88, site_width_m: 5 }),
      candidate({ id: 'd', similarity: 0.6, site_width_m: 8 }),
    ];
    expect(selectDiverse(pool, { k: 2, lambda: 1 }).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('cùng đầu vào cho cùng kết quả — few-shot phải lặp lại được', () => {
    const pool = [
      candidate({ id: 'x', project_code: 'NVO-002', similarity: 0.5 }),
      candidate({ id: 'y', project_code: 'NVO-001', similarity: 0.5 }),
    ];
    const first = selectDiverse(pool, { k: 2 }).map((c) => c.project_code);
    const again = selectDiverse([...pool].reverse(), { k: 2 }).map((c) => c.project_code);
    expect(first).toEqual(again);
  });

  it('xin nhiều hơn số ứng viên thì trả về đúng số có', () => {
    expect(selectDiverse([candidate({ id: 'a' })], { k: 5 })).toHaveLength(1);
  });

  it('có vector thì dùng vector để đo độ khác nhau', () => {
    const a = candidate({ id: 'a', embedding: [1, 0], similarity: 0.9 });
    const same = candidate({ id: 'b', embedding: [1, 0], similarity: 0.85 });
    const other = candidate({ id: 'c', embedding: [0, 1], similarity: 0.8 });
    expect(pairSimilarity(a, same)).toBeCloseTo(1);
    expect(pairSimilarity(a, other)).toBeCloseTo(0);
    expect(selectDiverse([a, same, other], { k: 2, lambda: 0.5 }).map((c) => c.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('thiếu vector KHÔNG làm phần đa dạng biến mất', () => {
    // Trả 0 cho mọi cặp nghĩa là "hai bản ghi khác nhau hoàn toàn", và khi cả kho chưa chú
    // giải thì MMR sẽ lặng lẽ thoái hoá thành xếp hạng thuần — đúng thứ nó sinh ra để tránh.
    const a = candidate({ id: 'a' });
    const b = candidate({ id: 'b' });
    expect(a.embedding).toBeNull();
    expect(pairSimilarity(a, b)).toBeGreaterThan(0.5);
  });
});

describe('Văn bản đem đi nhúng — ranh giới dữ liệu', () => {
  const record = {
    project_code: 'NVO-015',
    project_id: '11111111-1111-1111-1111-111111111111',
    building_type: 'nha_pho',
    floors: 3,
    family_archetype: '3_the_he',
    style: 'hien_dai',
    site: { width_m: 5.2, depth_m: 18.4 },
    floor_plans: [{ rooms: [{ type: 'living', polygon: [[0, 0]] }, { type: 'kitchen' }] }],
    rationale: {
      stair_position: 'lay_sang_gieng_troi',
      would_change: 'Chị Lan muốn bếp rộng hơn, lần sau nới ra 0,5m',
    },
  };

  it('gửi đi lựa chọn rời rạc và thuộc tính không định danh', () => {
    const text = embeddingText(record);
    expect(text).toContain('nha_pho');
    expect(text).toContain('lay_sang_gieng_troi');
    expect(text).toContain('living, kitchen'.split(', ').sort().join(', '));
  });

  it('KHÔNG gửi mã công trình, kích thước lô thật, hay ô chữ tự do', () => {
    // Ô "nếu làm lại sẽ đổi gì" là chỗ tự nhiên nhất để một cái tên khách hàng lọt vào.
    const text = embeddingText(record);
    expect(text).not.toContain('NVO-015');
    expect(text).not.toContain('11111111');
    expect(text).not.toContain('5.2');
    expect(text).not.toContain('Lan');
  });

  it('trường mới trong hợp đồng mặc định KHÔNG đi đâu cả', () => {
    // Danh sách CHO PHÉP, không phải danh sách loại trừ: danh sách loại trừ sẽ hỏng vào ngày
    // hợp đồng thêm một trường mới, và hỏng trong im lặng.
    const text = embeddingText({ ...record, ...{ khach_hang: 'Nguyễn Văn A' } } as never);
    expect(text).not.toContain('Nguyễn');
  });

  it('nói ra ô nào bị giữ lại, để giao diện giải thích được', () => {
    expect(withheldFields(record.rationale)).toEqual(['would_change']);
    expect(withheldFields({ stair_position: 'lay_sang_gieng_troi' })).toEqual([]);
  });

  it('bản ghi chưa có gì để nhúng trả chuỗi rỗng', () => {
    expect(embeddingText({})).toBe('');
  });
});
