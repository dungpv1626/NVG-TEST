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
          id: 'khu_dat',
          title: 'Khu đất và hiện trạng',
          fields: [{ path: 'site.orientation', label: 'Hướng mặt tiền', weight: 4 }],
        },
      ],
    });
    const section = merged.sections.find((s) => s.id === 'khu_dat')!;
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
      sections: [{ id: 'khong_gian', fields: [{ path: 'style', hidden: true }] }],
    });
    expect(hideStyle.sections.flatMap((s) => s.fields).some((f) => f.path === 'style')).toBe(false);

    expect(() =>
      applyBriefFormOverlay(BRIEF_FORM, {
        version: 1,
        sections: [{ id: 'khu_dat', fields: [{ path: 'site.width_m', hidden: true }] }],
      }),
    ).toThrow(/bắt buộc/);
  });

  it('không hạ được trọng số của trường bắt buộc xuống 0', () => {
    expect(() =>
      applyBriefFormOverlay(BRIEF_FORM, {
        version: 1,
        sections: [{ id: 'loai_hinh', fields: [{ path: 'floors', weight: 0 }] }],
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
          id: 'loai_hinh',
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
            id: 'loai_hinh',
            fields: [{ path: 'building_type', options: [{ value: 'nha_go', label: 'Nhà gỗ' }] }],
          },
        ],
      }),
    ).toThrow(/mã «nha_go»/);
  });

  it('đổi được thứ tự mục', () => {
    const ids = BRIEF_FORM.sections.map((s) => s.id);
    const reversed = [...ids].reverse();
    const merged = applyBriefFormOverlay(BRIEF_FORM, { version: 1, section_order: reversed });
    expect(merged.sections.map((s) => s.id)).toEqual(reversed);
  });
});

describe('Câu hỏi tự thêm', () => {
  const overlay: BriefFormOverlay = {
    version: 1,
    sections: [
      {
        id: 'sinh_hoat',
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
            id: 'sinh_hoat',
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
            id: 'sinh_hoat',
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
