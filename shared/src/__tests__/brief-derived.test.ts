/**
 * Hai phép SUY của biểu mẫu Đầu bài, và một phép quy đổi đơn vị. Cả ba hỏng im lặng.
 *
 *  · Mật độ xây dựng: biểu mẫu hỏi PHẦN TRĂM, hợp đồng lưu TỈ LỆ 0–1. Không quy đổi thì mọi
 *    giá trị người ta thật sự gõ đều trượt kiểm tra lúc đúc artifact — và quả thật, tới
 *    07/09/2026 chưa đầu bài nào lưu nổi ô đó.
 *  · Thửa đa giác: hợp đồng BẮT BUỘC `width_m`/`depth_m`, biểu mẫu lại ẩn chúng đi ở nhánh
 *    này. Không suy thì chọn «Đa giác không đều» là đầu bài không xác nhận được, và không có
 *    gì nói ra điều đó cho tới lúc bấm nút.
 */

import { describe, expect, it } from 'vitest';
import {
  BRIEF_FORM,
  designBriefSchema,
  displayNumber,
  fieldByPath,
  storedNumber,
  withDerivedSiteDimensions,
  type DesignBriefDraft,
} from '../design';

const maxDensity = fieldByPath(BRIEF_FORM, 'site.max_density')!;
const floors = fieldByPath(BRIEF_FORM, 'floors')!;

describe('Quy đổi đơn vị của ô số', () => {
  it('gõ 60 % thì lưu 0,6 — và hiện lại đúng 60, không phải 60,00000000000001', () => {
    const stored = storedNumber(maxDensity, 60);
    expect(stored).toBe(0.6);
    // Phép chia nhị phân không tròn: `0.6 / 0.01` ra 60.00000000000001, và con số đó rơi
    // thẳng vào ô nhập cho người dùng nhìn thấy.
    expect(displayNumber(maxDensity, stored)).toBe(60);
  });

  it('giá trị đã lưu đi qua hợp đồng được — đây là chỗ trước đây trượt', () => {
    const brief = {
      schema_version: '1.1.0',
      project_id: '11111111-1111-4111-8111-111111111111',
      building_type: 'biet_thu',
      locality: 'hung_yen',
      floors: 2,
      site: { width_m: 20, depth_m: 25, max_density: storedNumber(maxDensity, 60) },
    };
    expect(designBriefSchema.safeParse(brief).success).toBe(true);
    // Còn con số người dùng gõ, nếu lưu thẳng, thì KHÔNG qua được.
    expect(
      designBriefSchema.safeParse({ ...brief, site: { ...brief.site, max_density: 60 } }).success,
    ).toBe(false);
  });

  it('trường không khai `value_scale` thì không đụng gì tới con số', () => {
    expect(storedNumber(floors, 3)).toBe(3);
    expect(displayNumber(floors, 3)).toBe(3);
  });
});

describe('Thửa đa giác: suy `width_m` và `depth_m` từ ranh giới', () => {
  const polygon: DesignBriefDraft = {
    site: {
      shape: 'da_giac',
      boundary_m: [
        [0, 0],
        [12, 0],
        [12, 18],
        [4, 18],
      ],
    },
  } as DesignBriefDraft;

  it('mặt tiền là cạnh đỉnh 0 → đỉnh 1, chiều sâu là chiều sâu lớn nhất', () => {
    const next = withDerivedSiteDimensions(polygon);
    expect(next.site!.width_m).toBe(12);
    expect(next.site!.depth_m).toBe(18);
  });

  it('sau khi suy thì đầu bài xác nhận được — trước đây trượt ở đúng hai đường dẫn này', () => {
    const next = withDerivedSiteDimensions(polygon);
    const result = designBriefSchema.safeParse({
      schema_version: '1.1.0',
      project_id: '11111111-1111-4111-8111-111111111111',
      building_type: 'biet_thu',
      locality: 'hung_yen',
      floors: 2,
      site: next.site,
    });
    expect(result.success).toBe(true);
  });

  it('không đụng tới thửa chữ nhật hay hình thang — trả về CHÍNH đối tượng cũ', () => {
    // Trả cùng tham chiếu là cách nơi gọi biết bản nháp có đổi hay không; dựng mảng mới ở mọi
    // lượt gõ thì hộp thoại «rời trang?» nổ ở chỗ không ai đụng gì.
    const rect = { site: { width_m: 5, depth_m: 18 } } as DesignBriefDraft;
    expect(withDerivedSiteDimensions(rect)).toBe(rect);
  });

  it('sửa một đỉnh thì SUY LẠI — không giữ con số của hình cũ', () => {
    // Bản trước dừng ở "đã có hai số": suy đúng một lần rồi giữ mãi. Đổi đỉnh, hay đổi từ
    // «Chữ nhật» 5×18 sang «Đa giác», đều để lại số của hình cũ trên màn hình và trong phép
    // so với biên bản khảo sát (rà soát 08/09/2026).
    const first = withDerivedSiteDimensions(polygon);
    expect(first.site!.width_m).toBe(12);
    const moved = {
      site: {
        ...first.site!,
        boundary_m: [
          [0, 0],
          [10, 0],
          [12, 18],
          [4, 18],
        ],
      },
    } as DesignBriefDraft;
    expect(withDerivedSiteDimensions(moved).site!.width_m).toBe(10);

    const fromRect = {
      site: { ...polygon.site, width_m: 5, depth_m: 18 },
    } as DesignBriefDraft;
    const derived = withDerivedSiteDimensions(fromRect);
    expect(derived.site!.width_m).toBe(12);
    expect(derived.site!.depth_m).toBe(18);
  });

  it('không có gì đổi thì trả về CHÍNH đối tượng cũ', () => {
    const settled = withDerivedSiteDimensions(polygon);
    expect(withDerivedSiteDimensions(settled)).toBe(settled);
  });

  it('đỉnh trùng nhau (mặt tiền 0 m) thì không ghi số — đó là chưa khai xong', () => {
    // Ghi 0 vào là trượt `exclusiveMinimum` ở đúng trường đang ẩn, và không sửa được từ
    // màn hình vì ô đó không hiện với thửa đa giác.
    const degenerate = {
      site: {
        shape: 'da_giac',
        boundary_m: [
          [0, 0],
          [0, 0],
          [12, 18],
          [4, 18],
        ],
      },
    } as DesignBriefDraft;
    expect(withDerivedSiteDimensions(degenerate)).toBe(degenerate);
  });

  it('ranh giới chưa đủ ba đỉnh thì KHÔNG dựng số để lấp chỗ', () => {
    // Đã có phép kiểm riêng nói câu đó (`da_giac_thieu_ranh_gioi`). Bịa một con số ở đây là
    // biến "chưa khai xong" thành "đã khai", và bộ giải nhận một mảnh đất không có thật.
    const partial = {
      site: {
        shape: 'da_giac',
        boundary_m: [
          [0, 0],
          [12, 0],
        ],
      },
    } as DesignBriefDraft;
    expect(withDerivedSiteDimensions(partial)).toBe(partial);
  });
});
