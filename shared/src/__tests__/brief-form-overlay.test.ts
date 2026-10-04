/**
 * Lớp phủ biểu mẫu Đầu bài — phần quản trị viên sửa được (21/09/2026).
 *
 * Bộ này canh đúng những chỗ mà một lớp phủ sai KHÔNG kêu:
 *
 *  - Ẩn mất một trường hợp đồng bắt buộc → mọi đầu bài mới không chốt được, mà màn hình chỉ
 *    hiện ít câu hỏi đi một chút.
 *  - Thêm một GIÁ TRỊ lựa chọn không có trong hợp đồng → biểu mẫu ghi ra thứ hợp đồng không
 *    nhận, và lỗi nổ ở bước đúc artifact, sau khi người dùng đã điền xong.
 *  - Câu hỏi tự thêm mang trọng số → `completeness_score` tụt dưới ngưỡng chạy Lớp 2 mà không
 *    ai đổi một câu trả lời nào.
 *  - `LOCKED_PATHS` lệch với `required` của hợp đồng → danh sách khoá bảo vệ nhầm trường.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyBriefFormOverlay,
  BRIEF_FORM,
  customAnswers,
  designBriefDraftSchema,
  LOCKED_PATHS,
  readBriefFormOverlay,
  scoreBrief,
  visibleFields,
  type BriefFormOverlay,
  type DesignBriefDraft,
} from '../design';

const contract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../contracts/design-brief.schema.json', import.meta.url)),
    'utf8',
  ),
) as { required: string[]; properties: { site: { required: string[] } } };

const townhouse: DesignBriefDraft = {
  building_type: 'nha_pho',
  locality: 'ha_noi',
  floors: 3,
  site: { width_m: 5, depth_m: 18 },
};

describe('Danh sách trường khoá', () => {
  it('khớp đúng phần `required` của hợp đồng — không thừa, không thiếu', () => {
    // Thiếu một trường ở đây nghĩa là quản trị viên ẩn được nó, và mọi đầu bài mới sau đó
    // không chốt được. Thừa nghĩa là khoá nhầm một trường vốn ẩn được.
    // Bỏ ba khoá không phải CÂU HỎI: hai khoá đầu do Worker cấp (`schema_version`,
    // `project_id`), còn `site` là cái bọc — thứ bắt buộc nằm ở `site.required` bên dưới.
    const required = [
      ...contract.required.filter((key) => !['schema_version', 'project_id', 'site'].includes(key)),
      ...contract.properties.site.required.map((key) => `site.${key}`),
    ];
    expect([...LOCKED_PATHS].sort()).toEqual(required.sort());
  });
});

describe('Ghép lớp phủ', () => {
  it('không có lớp phủ thì trả đúng bản gốc', () => {
    expect(applyBriefFormOverlay(BRIEF_FORM, null)).toBe(BRIEF_FORM);
  });

  it('đổi nhãn, gợi ý và trọng số của câu hỏi có sẵn', () => {
    const merged = applyBriefFormOverlay(BRIEF_FORM, {
      version: 1,
      sections: [
        {
          id: 'cong_trinh_khu_dat',
          title: 'Khu đất và hiện trạng',
          fields: [{ path: 'site.orientation', label: 'Hướng mặt tiền', weight: 4 }],
        },
      ],
    });
    const section = merged.sections.find((s) => s.id === 'cong_trinh_khu_dat')!;
    expect(section.title).toBe('Khu đất và hiện trạng');
    const field = section.fields.find((f) => f.path === 'site.orientation')!;
    expect(field.label).toBe('Hướng mặt tiền');
    expect(field.weight).toBe(4);
    // Hình dạng dữ liệu KHÔNG đổi theo — đó là ranh giới của lớp phủ.
    expect(field.control).toBe('choice');
    expect(field.options?.length).toBe(8);
  });

  it('ẩn được câu hỏi thường, KHÔNG ẩn được câu hỏi bắt buộc của hợp đồng', () => {
    const hideStyle = applyBriefFormOverlay(BRIEF_FORM, {
      version: 1,
      sections: [{ id: 'khoi_nha', fields: [{ path: 'style', hidden: true }] }],
    });
    expect(hideStyle.sections.flatMap((s) => s.fields).some((f) => f.path === 'style')).toBe(false);

    expect(() =>
      applyBriefFormOverlay(BRIEF_FORM, {
        version: 1,
        sections: [{ id: 'cong_trinh_khu_dat', fields: [{ path: 'site.width_m', hidden: true }] }],
      }),
    ).toThrow(/bắt buộc/);
  });

  it('không hạ được trọng số của trường bắt buộc xuống 0', () => {
    expect(() =>
      applyBriefFormOverlay(BRIEF_FORM, {
        version: 1,
        sections: [{ id: 'cong_trinh_khu_dat', fields: [{ path: 'floors', weight: 0 }] }],
      }),
    ).toThrow(/bắt buộc/);
  });

  it('ẩn được cả một mục', () => {
    const merged = applyBriefFormOverlay(BRIEF_FORM, {
      version: 1,
      sections: [{ id: 'ky_thuat', hidden: true }],
    });
    expect(merged.sections.some((s) => s.id === 'ky_thuat')).toBe(false);
  });

  it('đổi được NHÃN lựa chọn, nhưng thêm một GIÁ TRỊ lạ thì bác', () => {
    const merged = applyBriefFormOverlay(BRIEF_FORM, {
      version: 1,
      sections: [
        {
          id: 'cong_trinh_khu_dat',
          fields: [
            { path: 'building_type', options: [{ value: 'nha_pho', label: 'Nhà ống mặt phố' }] },
          ],
        },
      ],
    });
    const field = merged.sections.flatMap((s) => s.fields).find((f) => f.path === 'building_type')!;
    expect(field.options?.find((o) => o.value === 'nha_pho')?.label).toBe('Nhà ống mặt phố');
    // Các lựa chọn không nhắc tới giữ nguyên nhãn gốc.
    expect(field.options?.find((o) => o.value === 'biet_thu')?.label).toBe('Biệt thự');

    expect(() =>
      applyBriefFormOverlay(BRIEF_FORM, {
        version: 1,
        sections: [
          {
            id: 'cong_trinh_khu_dat',
            fields: [{ path: 'building_type', options: [{ value: 'nha_go', label: 'Nhà gỗ' }] }],
          },
        ],
      }),
    ).toThrow(/mã «nha_go»/);
  });

  it('đổi được thứ tự mục TRONG một phần, không kéo mục sang phần khác', () => {
    const ids = BRIEF_FORM.sections.map((s) => s.id);
    const reversed = [...ids].reverse();
    const merged = applyBriefFormOverlay(BRIEF_FORM, { version: 1, section_order: reversed });
    // Mỗi phần giữ chỗ của nó; trong phần thì theo thứ tự quản trị viên kéo.
    const expected = BRIEF_FORM.parts.flatMap((part) =>
      reversed.filter((id) => BRIEF_FORM.sections.find((s) => s.id === id)!.part === part.id),
    );
    expect(merged.sections.map((s) => s.id)).toEqual(expected);
  });
});

describe('Lớp phủ lưu trước T114 (đầu bài ba phần)', () => {
  it('vá cho câu đã dời sang mục khác vẫn ăn — không làm rơi cả lớp phủ', () => {
    // Trước T114 `style` nằm trong `khoi_nha`; lớp phủ cũ vá nhãn của nó dưới mục ấy.
    const merged = applyBriefFormOverlay(BRIEF_FORM, {
      version: 1,
      section_order: [
        'cong_trinh_khu_dat',
        'gia_dinh',
        'cong_nang',
        'khoi_nha',
        'ky_thuat',
        'uu_tien',
      ],
      sections: [
        {
          id: 'khoi_nha',
          title: 'Hình khối',
          fields: [
            { path: 'style', label: 'Phong cách mong muốn' },
            { path: 'vertical.elevator', label: 'Thang máy gia đình' },
          ],
        },
      ],
    });
    const field = (path: string) =>
      merged.sections
        .flatMap((s) => s.fields.map((f) => ({ s, f })))
        .find((x) => x.f.path === path)!;
    expect(field('style').s.id).toBe('mat_dung');
    expect(field('style').f.label).toBe('Phong cách mong muốn');
    expect(field('vertical.elevator').f.label).toBe('Thang máy gia đình');
    expect(merged.sections.find((s) => s.id === 'khoi_nha')!.title).toBe('Hình khối');
  });

  it('mục tự tạo không khai phần thì về phần Mặt bằng; khai thì đứng đúng phần', () => {
    const custom = (id: string, part?: 'chung' | 'mat_dung') => ({
      id,
      custom: true,
      ...(part ? { part } : {}),
      title: id,
      fields: [{ path: `custom.${id}`, label: id, custom: { control: 'text' as const } }],
    });
    const merged = applyBriefFormOverlay(BRIEF_FORM, {
      version: 1,
      sections: [custom('muc_a'), custom('muc_b', 'mat_dung'), custom('muc_c', 'chung')],
    });
    const partOf = (id: string) => merged.sections.find((s) => s.id === id)!.part;
    expect(partOf('muc_a')).toBe('mat_bang');
    expect(partOf('muc_b')).toBe('mat_dung');
    expect(partOf('muc_c')).toBe('chung');
    // Và cấu hình vẫn qua lược đồ: mục cùng phần đứng liền nhau.
    const parts = merged.sections.map((s) => s.part);
    expect(parts).toEqual(
      [...parts].sort(
        (a, b) =>
          ['chung', 'mat_bang', 'mat_dung'].indexOf(a) -
          ['chung', 'mat_bang', 'mat_dung'].indexOf(b),
      ),
    );
  });
});

describe('Câu hỏi tự thêm', () => {
  const overlay: BriefFormOverlay = {
    version: 1,
    sections: [
      {
        id: 'gia_dinh',
        fields: [
          {
            path: 'custom.bep_phu_ngoai_troi',
            label: 'Có bếp nướng ngoài trời không',
            custom: { control: 'tristate' },
            options: [
              { value: 'true', label: 'Có' },
              { value: 'false', label: 'Không' },
            ],
          },
        ],
      },
    ],
  };

  it('hiện ra trong biểu mẫu và lưu được vào đầu bài', () => {
    const merged = applyBriefFormOverlay(BRIEF_FORM, overlay);
    const shown = visibleFields(merged, townhouse);
    expect(shown.some((v) => v.field.path === 'custom.bep_phu_ngoai_troi')).toBe(true);

    // Hợp đồng nhận đường dẫn này — nếu không thì câu trả lời rơi mất ở bước lưu.
    const parsed = designBriefDraftSchema.safeParse({
      ...townhouse,
      custom: { bep_phu_ngoai_troi: true },
    });
    expect(parsed.success).toBe(true);
  });

  it('KHÔNG kéo điểm độ đầy đủ xuống — trọng số mặc định là 0', () => {
    const merged = applyBriefFormOverlay(BRIEF_FORM, overlay);
    expect(scoreBrief(townhouse, merged).score).toBe(scoreBrief(townhouse, BRIEF_FORM).score);
  });

  it('mã sai hình dạng thì bác, không lặng lẽ bỏ qua', () => {
    expect(() =>
      applyBriefFormOverlay(BRIEF_FORM, {
        version: 1,
        sections: [
          {
            id: 'gia_dinh',
            fields: [{ path: 'Bếp Phụ', label: 'Bếp phụ', custom: { control: 'text' } }],
          },
        ],
      }),
    ).toThrow(/custom\./);
  });

  it('câu chọn mà không khai lựa chọn nào thì bác', () => {
    expect(() =>
      applyBriefFormOverlay(BRIEF_FORM, {
        version: 1,
        sections: [
          {
            id: 'gia_dinh',
            fields: [{ path: 'custom.mau_son', label: 'Màu sơn', custom: { control: 'choice' } }],
          },
        ],
      }),
    ).toThrow(/lựa chọn/);
  });

  it('mục tự tạo phải tự khai là mục tự tạo', () => {
    expect(() =>
      applyBriefFormOverlay(BRIEF_FORM, {
        version: 1,
        sections: [
          {
            id: 'muc_la',
            fields: [{ path: 'custom.a', label: 'A', custom: { control: 'text' } }],
          },
        ],
      }),
    ).toThrow(/không có trong biểu mẫu gốc/);
  });

  it('đọc ra chữ kèm nhãn để gửi mô hình — không gửi mã khoá', () => {
    const merged = applyBriefFormOverlay(BRIEF_FORM, overlay);
    expect(customAnswers(merged, { bep_phu_ngoai_troi: true })).toEqual([
      { label: 'Có bếp nướng ngoài trời không', value: 'Có' },
    ]);
    // Câu hỏi đã gỡ khỏi biểu mẫu thì câu trả lời không đi tiếp, dù vẫn nằm trong hồ sơ.
    expect(customAnswers(BRIEF_FORM, { bep_phu_ngoai_troi: true })).toEqual([]);
  });
});

describe('Đọc lớp phủ đã lưu', () => {
  it('hình dạng sai thì trả null, không ném — màn hình Đầu bài không được trắng', () => {
    expect(readBriefFormOverlay({ version: 9 })).toBeNull();
    expect(readBriefFormOverlay('hỏng')).toBeNull();
    expect(readBriefFormOverlay(null)).toBeNull();
  });

  it('hình dạng đúng thì đọc được', () => {
    expect(readBriefFormOverlay({ version: 1, sections: [] })).toEqual({
      version: 1,
      sections: [],
    });
  });
});
