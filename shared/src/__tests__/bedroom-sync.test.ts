/**
 * Đồng bộ dòng phòng ngủ giữa «Thành viên gia đình» và «Không gian bắt buộc có».
 *
 * Bộ này canh ba thứ hỏng KHÔNG có triệu chứng:
 *
 *  - Đồng bộ làm MẤT diện tích và tiện ích người dùng đã gõ. Không lỗi, không cảnh báo —
 *    chỉ là mấy ô vừa điền tự trống lại sau khi sửa số người ở một nhóm khác.
 *  - Đồng bộ dựng mảng mới ở MỌI lượt gõ, kể cả khi không có gì đổi. Khi đó gõ một ký tự
 *    vào ô bất kỳ cũng thành "đầu bài vừa đổi", và hộp thoại «rời trang?» nổ ở chỗ không ai
 *    đụng gì.
 *  - Số dòng lệch số phòng ngủ suy từ gia đình — tức là hai chỗ trên cùng màn hình nói khác
 *    nhau về cùng một con số, đúng thứ `syncBedroomRows` sinh ra để chặn.
 */

import { describe, expect, it } from 'vitest';
import {
  bedroomOwnerLabels,
  bedroomsFromFamily,
  syncBedroomRows,
  type DesignBriefDraft,
} from '../design';

const draft = (over: Partial<DesignBriefDraft> = {}): DesignBriefDraft => ({
  building_type: 'biet_thu',
  floors: 2,
  ...over,
});

const shape = (rows: DesignBriefDraft['required_spaces']) =>
  (rows ?? []).map((r) => `${r.type}${r.ensuite ? '+wc' : ''}`);

describe('bedroomsFromFamily', () => {
  it('suy đúng số phòng và loại phòng theo vai trò', () => {
    // Ông bà ở chung một phòng, con mỗi đứa một phòng — quy tắc nằm ở `kb/space_norms.yaml`,
    // không viết cứng ở đây.
    expect(
      bedroomsFromFamily([
        { role: 'ong_ba', count: 2 },
        { role: 'vo_chong', count: 2, ensuite: true },
        { role: 'con', count: 3 },
      ]).map((b) => `${b.type}${b.ensuite ? '+wc' : ''}`),
    ).toEqual(['bedroom', 'master_bedroom+wc', 'bedroom', 'bedroom', 'bedroom']);
  });

  it('đọc CẢ cách khai "khép kín" cũ bằng chuỗi `wc` trong `needs`', () => {
    // Chuỗi đó chưa bao giờ có tác dụng ở Lớp 2, nhưng nó nằm sẵn trong đầu bài đã lưu — bỏ
    // qua là làm mất một câu trả lời người dùng đã đưa.
    const [first] = bedroomsFromFamily([{ role: 'vo_chong', count: 2, needs: ['wc'] }]);
    expect(first?.ensuite).toBe(true);
  });

  it('vai trò lạ hoặc số người bằng 0 không sinh phòng nào', () => {
    // Ép kiểu vì hợp đồng đã chặn vai trò lạ ở tầng kiểu — nhưng dữ liệu đến từ CSDL, nơi
    // một vai trò gỡ khỏi `occupancy` vẫn còn nằm trong các bản ghi cũ.
    expect(bedroomsFromFamily([{ role: 'khong_co_that', count: 3 } as never])).toEqual([]);
    expect(bedroomsFromFamily([{ role: 'con', count: 0 }])).toEqual([]);
  });
});

describe('bedroomOwnerLabels', () => {
  it('gọi tên theo chủ nhân, chỉ đánh số khi một nhóm sinh nhiều phòng', () => {
    expect(
      bedroomOwnerLabels([
        { role: 'ong_ba', count: 2 },
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 3 },
        { role: 'khach', count: 1 },
      ]),
    ).toEqual(['ông bà', 'vợ chồng', 'con 1', 'con 2', 'con 3', 'khách']);
  });

  it('hai nhóm cùng vai trò khai tách vẫn đánh số chung — không ra hai «Phòng ngủ (con)»', () => {
    // Hai đứa con khai thành hai nhóm (một ở tầng 2, một ở tầng 3) là hai phòng cùng vai; đếm
    // theo nhóm cho ra hai nhãn trùng, không phân biệt được dòng nào của ai.
    expect(
      bedroomOwnerLabels([
        { role: 'con', count: 1, floor: 2 },
        { role: 'con', count: 1, floor: 3 },
      ]),
    ).toEqual(['con 1', 'con 2']);
  });

  it('vai trò lạ trả về RỖNG, không in mã máy ra màn hình', () => {
    // Vai trò gỡ khỏi `occupancy` vẫn còn trong bản ghi cũ. In `khong_co_that` ra giữa một
    // màn hình tiếng Việt còn tệ hơn quay về cách đánh số (CLAUDE.md 4.1).
    expect(bedroomOwnerLabels([{ role: 'khong_co_that', count: 2 }])).toEqual([]);
  });

  it('thứ tự khớp ĐÚNG thứ tự dòng mà syncBedroomRows dựng ra', () => {
    // Đây là điều kiện để suy được chủ nhân mà không phải lưu nó xuống từng dòng. Lệch một
    // nấc thì phòng của khách bị gắn tên con, và không có gì báo.
    const family: NonNullable<DesignBriefDraft['family']> = [
      { role: 'ong_ba', count: 2 },
      { role: 'vo_chong', count: 2, ensuite: true },
      { role: 'con', count: 2 },
    ];
    const rows = syncBedroomRows(draft({ family })) ?? [];
    const owners = bedroomOwnerLabels(family);

    expect(rows).toHaveLength(owners.length);
    expect(rows.map((r) => r.type)).toEqual(['bedroom', 'master_bedroom', 'bedroom', 'bedroom']);
    expect(owners).toEqual(['ông bà', 'vợ chồng', 'con 1', 'con 2']);
    // Phòng khép kín phải rơi đúng vào chỗ của vợ chồng.
    expect(rows[owners.indexOf('vợ chồng')]!.ensuite).toBe(true);
  });
});

describe('syncBedroomRows', () => {
  it('chưa có dòng phòng ngủ nào thì thêm vào CUỐI danh sách', () => {
    const next = syncBedroomRows(
      draft({
        family: [
          { role: 'vo_chong', count: 2, ensuite: true },
          { role: 'con', count: 2 },
        ],
        required_spaces: [{ type: 'living', floor: 1 }],
      }),
    );
    expect(shape(next)).toEqual(['living', 'master_bedroom+wc', 'bedroom', 'bedroom']);
  });

  it('thêm một đứa con thì GIỮ diện tích và tiện ích đã gõ cho các phòng trước đó', () => {
    const before = syncBedroomRows(
      draft({
        family: [{ role: 'con', count: 2 }],
        required_spaces: [
          { type: 'bedroom', floor: 2, area_m2: 18, amenities: 'bàn học kê sát cửa sổ' },
          { type: 'bedroom', floor: 2 },
        ],
      }),
    );
    const after = syncBedroomRows(
      draft({ family: [{ role: 'con', count: 3 }], required_spaces: before }),
    );

    expect(after).toHaveLength(3);
    expect(after![0]).toMatchObject({ area_m2: 18, amenities: 'bàn học kê sát cửa sổ', floor: 2 });
  });

  it('bớt người thì bỏ dòng CUỐI, không bỏ dòng đầu đã có dữ liệu', () => {
    const rows = syncBedroomRows(
      draft({
        family: [{ role: 'con', count: 3 }],
        required_spaces: [
          { type: 'bedroom', floor: 1, area_m2: 20 },
          { type: 'bedroom', floor: 2 },
          { type: 'bedroom', floor: 3 },
        ],
      }),
    );
    const after = syncBedroomRows(
      draft({ family: [{ role: 'con', count: 1 }], required_spaces: rows }),
    );
    expect(after).toHaveLength(1);
    expect(after![0]).toMatchObject({ area_m2: 20, floor: 1 });
  });

  it('đổi phòng sang khép kín vẫn giữ diện tích đã gõ', () => {
    // Không có lượt ghép thứ hai (chỉ trùng LOẠI) thì dòng cũ bị coi là không khớp và diện
    // tích biến mất đúng lúc người dùng vừa đổi một ô chọn ở phần trên.
    const rows = syncBedroomRows(
      draft({
        family: [{ role: 'vo_chong', count: 2 }],
        required_spaces: [{ type: 'master_bedroom', floor: 2, area_m2: 24 }],
      }),
    );
    const after = syncBedroomRows(
      draft({ family: [{ role: 'vo_chong', count: 2, ensuite: true }], required_spaces: rows }),
    );
    expect(after![0]).toMatchObject({ area_m2: 24, ensuite: true });
  });

  it('chọn tầng ở Thành viên gia đình SAU khi dòng đã có thì dòng theo — không bị nuốt', () => {
    // Dòng phòng ngủ sinh ra ngay lúc thêm thành viên (tầng còn trống). Bản trước giữ tầng
    // của dòng khi dòng đã có, nên mọi lần chọn tầng ở gia đình sau đó đều mất, và engine
    // (đọc ghim tầng từ chính dòng này) không bao giờ nhận được (rà soát 08/09/2026).
    const first = syncBedroomRows(draft({ family: [{ role: 'ong_ba', count: 2 }] }));
    expect(first![0]!.floor).toBeNull();
    const second = syncBedroomRows(
      draft({ family: [{ role: 'ong_ba', count: 2, floor: 1 }], required_spaces: first }),
    );
    expect(second![0]!.floor).toBe(1);
  });

  it('gia đình để trống tầng thì GIỮ tầng người dùng đặt ở dòng', () => {
    const rows = syncBedroomRows(
      draft({
        family: [{ role: 'con', count: 1 }],
        required_spaces: [{ type: 'bedroom', floor: 3, area_m2: 16 }],
      }),
    );
    expect(rows![0]).toMatchObject({ floor: 3, area_m2: 16 });
  });

  it('không có gì đổi thì trả về CHÍNH mảng cũ', () => {
    const rows = syncBedroomRows(
      draft({
        family: [{ role: 'con', count: 2 }],
        required_spaces: [{ type: 'living', floor: 1 }],
      }),
    );
    const again = syncBedroomRows(
      draft({ family: [{ role: 'con', count: 2 }], required_spaces: rows }),
    );
    expect(again).toBe(rows);
  });

  it('đầu bài chưa khai gia đình và chưa có phòng ngủ thì không đụng gì', () => {
    const rows = [{ type: 'living', floor: 1 }];
    expect(syncBedroomRows(draft({ required_spaces: rows }))).toBe(rows);
    expect(syncBedroomRows(draft())).toBeUndefined();
  });

  it('gỡ hết thành viên thì gỡ hết dòng phòng ngủ, giữ nguyên phòng khác', () => {
    const after = syncBedroomRows(
      draft({
        family: [],
        required_spaces: [
          { type: 'living', floor: 1 },
          { type: 'bedroom', floor: 2 },
          { type: 'kitchen', floor: 1 },
        ],
      }),
    );
    expect(shape(after)).toEqual(['living', 'kitchen']);
  });

  it('cụm phòng ngủ giữ nguyên VỊ TRÍ trong danh sách, không nhảy xuống cuối', () => {
    // Nhảy chỗ mỗi lần đồng bộ thì người dùng đang gõ dở một ô sẽ thấy dòng của mình trượt
    // đi mất — và họ không làm gì để gây ra chuyện đó.
    const after = syncBedroomRows(
      draft({
        family: [{ role: 'con', count: 2 }],
        required_spaces: [
          { type: 'living', floor: 1 },
          { type: 'bedroom', floor: 2 },
          { type: 'kitchen', floor: 1 },
        ],
      }),
    );
    expect(shape(after)).toEqual(['living', 'bedroom', 'bedroom', 'kitchen']);
  });
});
