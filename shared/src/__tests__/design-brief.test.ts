/**
 * Đầu bài thiết kế (Lớp 1 — TK-10): cấu hình biểu mẫu, chấm độ đầy đủ, soát mâu thuẫn.
 *
 * Bộ này canh những chỗ hỏng KHÔNG có triệu chứng:
 *
 *  - Gõ nhầm một `path` trong cấu hình → trường đó không bao giờ được tính, điểm luôn thấp
 *    hơn thật, và không lỗi nào nổ ra.
 *  - Điều kiện hiện/ẩn của giao diện lệch với của bộ chấm điểm → có mục "còn thiếu" mà
 *    không màn hình nào cho nhập.
 *  - Mã phòng lạ trong danh sách lựa chọn → đi hết engine mà chưa từng bị kiểm quy chuẩn.
 *  - Coi `false`/`0` là "chưa trả lời" → mọi đầu bài nhà phố (khoảng lùi 0) vĩnh viễn không
 *    đạt ngưỡng, trong khi màn hình trông như đã điền đủ.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  BRIEF_FORM,
  DECISION_RELATIONSHIPS,
  briefFormConfigSchema,
  briefAreaBudget,
  checkBriefConsistency,
  designBriefDraftSchema,
  evaluateCondition,
  familyArchetype,
  householdSize,
  isAnswered,
  scoreBrief,
  visibleFields,
  type BriefFormConfig,
  type DesignBriefDraft,
  withoutHiddenAnswers,
} from '../design';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

const allFields = BRIEF_FORM.sections.flatMap((s) => s.fields);
/** Trường của hợp đồng dữ liệu. Tiền tố `legacy.` là sáu cột chữ tự do của TK-01. */
const contractFields = allFields.filter((f) => !f.path.startsWith('legacy.'));

/** Dựng một đối tượng chỉ có đúng một đường dẫn, để hỏi hợp đồng "có khoá này không". */
function probe(path: string, leaf: unknown): unknown {
  const keys = path.split('.');
  return keys.reduceRight<unknown>((value, key) => ({ [key]: value }), leaf);
}

describe('Cấu hình biểu mẫu Đầu bài', () => {
  it('hợp lệ theo lược đồ của chính nó', () => {
    expect(() => briefFormConfigSchema.parse(BRIEF_FORM)).not.toThrow();
  });

  it('không có đường dẫn trùng nhau', () => {
    const paths = allFields.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('mọi đường dẫn đều tồn tại trong hợp đồng DesignBrief', () => {
    // Gõ nhầm `site.with_m` thì trường đó không bao giờ được chấm, điểm luôn thấp hơn thật,
    // và không có lỗi nào nổ ra. Hỏi thẳng hợp đồng: nó `.strict()` nên khoá lạ bị nêu tên.
    for (const field of contractFields) {
      const result = designBriefDraftSchema.safeParse(probe(field.path, null));
      const unknownKey = result.success
        ? undefined
        : result.error.issues.find((i) => i.code === 'unrecognized_keys');
      expect(unknownKey, `đường dẫn lạ: ${field.path}`).toBeUndefined();
    }
  });

  it('mọi LỰA CHỌN đều được hợp đồng chấp nhận ở đúng đường dẫn của nó', () => {
    // Mạnh hơn hẳn phép thử "đường dẫn có tồn tại không": nó bắt cả lỗi SAI KIỂU.
    //
    // Lựa chọn trong tệp cấu hình luôn là chuỗi vì JSON không có khoá số, nhưng hợp đồng có
    // trường là số nguyên (`massing.wings_preferred`). Không có phép thử này thì biểu mẫu
    // ghi `"1"` vào chỗ đòi `1`, mọi thứ trên màn hình trông vẫn đúng, và lỗi chỉ nổ ra ở
    // tận bước đúc artifact — sau khi người dùng đã điền xong cả biểu mẫu.
    for (const field of contractFields) {
      if (!field.options) continue;

      for (const option of field.options) {
        const raw = field.value_type === 'number' ? Number(option.value) : option.value;
        // Mỗi kiểu điều khiển ghi vào payload một hình dạng khác nhau. `family` là ngoại lệ:
        // lựa chọn của nó là NHU CẦU của từng nhóm thành viên, nằm ở `family[].needs`.
        const leaf =
          field.control === 'family'
            ? [{ role: 'vo_chong', count: 1, needs: [raw] }]
            : field.control === 'multi'
              ? [raw]
              : field.control === 'space_floor'
                ? [{ type: raw }]
                : field.control === 'tristate'
                  ? option.value === 'true'
                  : field.control === 'sides'
                    ? { front: raw }
                    : raw;

        const result = designBriefDraftSchema.safeParse(probe(field.path, leaf));
        expect(
          result.success,
          `${field.path} không nhận lựa chọn ${option.value}: ${
            result.success ? '' : JSON.stringify(result.error.issues[0])
          }`,
        ).toBe(true);
      }
    }
  });

  it('mọi điều kiện hiện/ẩn trỏ tới một trường đã khai', () => {
    // Điều kiện trỏ vào trường không tồn tại thì luôn sai, và trường mang nó bị ẩn vĩnh viễn.
    const declared = new Set(allFields.map((f) => f.path));
    const conditionFields: string[] = [];
    const walk = (c: unknown): void => {
      if (!c || typeof c !== 'object') return;
      const node = c as Record<string, unknown>;
      if (typeof node.field === 'string') conditionFields.push(node.field);
      for (const inner of [node.all, node.any, node.not].flat()) walk(inner);
    };
    for (const section of BRIEF_FORM.sections) {
      walk(section.when);
      for (const field of section.fields) walk(field.when);
    }

    expect(conditionFields.length).toBeGreaterThan(0);
    for (const field of conditionFields) expect(declared).toContain(field);
  });

  it('mã không gian và nhu cầu đều nằm trong từ vựng phòng đang chạy', () => {
    // Mã phòng không có trong `kb/room_vocabulary.yaml` thì KHÔNG rule nào của rule pack
    // nhắm tới nó — nó đi qua toàn bộ engine mà chưa từng bị kiểm quy chuẩn nào, và không
    // có lỗi nào nổ ra. Ví dụ trong tài liệu dùng `garage_moto`, `drying_yard` — hai mã
    // không tồn tại; đây là kiểm thử chặn đúng loại nhầm đó.
    const vocabulary = parseYaml(readFileSync(root('kb/room_vocabulary.yaml'), 'utf8')) as {
      types: { code: string }[];
    };
    const codes = new Set(vocabulary.types.map((t) => t.code));

    for (const path of ['required_spaces', 'family']) {
      const field = allFields.find((f) => f.path === path)!;
      for (const option of field.options ?? []) {
        expect(codes, `${path}: mã lạ ${option.value}`).toContain(option.value);
      }
    }
  });

  it('danh sách địa phương là 34 đơn vị hành chính, mã viết đúng quy ước', () => {
    const field = allFields.find((f) => f.path === 'locality')!;
    const options = (field.options ?? []).filter((option) => !option.retired);
    expect(options).toHaveLength(34);
    for (const option of options) {
      // Mã phải khớp mẫu của hợp đồng (`^[a-z0-9_]+$`) VÀ đổi được thành tên thư mục gói
      // quy tắc bằng đúng một phép thay gạch dưới thành gạch nối.
      expect(option.value, option.label).toMatch(/^[a-z0-9_]+$/);
      expect(option.label.trim(), option.value).not.toBe('');
    }
    expect(new Set(options.map((o) => o.value)).size, 'mã trùng nhau').toBe(34);

    // Đơn vị hành chính đã hết hiệu lực vẫn phải có NHÃN — hồ sơ xác nhận trước sắp xếp
    // 2025 là bất biến, không sửa lại được, nên màn hình phải đọc ra chữ cho mã cũ.
    const retired = (field.options ?? []).filter((option) => option.retired);
    expect(retired.map((option) => option.value)).toContain('thai_binh');
    // Bốn địa bàn NVG thi công thường xuyên phải nằm ở nhóm đầu, không lẫn vào 30 tỉnh còn
    // lại — đây là lý do `select` có nhóm.
    expect(options.slice(0, 4).map((o) => o.value)).toEqual([
      'hung_yen',
      'hai_phong',
      'ninh_binh',
      'ha_noi',
    ]);
  });

  it('lựa chọn «Quan hệ của người quyết định» khớp DECISION_RELATIONSHIPS — một nguồn nhãn', () => {
    // Ghi chú trong cấu hình nói nhãn "lấy từ DECISION_RELATIONSHIPS", nhưng tới 08/09/2026
    // không nơi nào import hằng đó — hai bản chép tay chờ ngày lệch nhau. Bài này biến lời
    // hứa thành phép kiểm.
    const field = allFields.find((f) => f.path === 'decision_maker.relationship')!;
    const pick = (o: { value: string; label: string }) => ({ value: o.value, label: o.label });
    expect((field.options ?? []).map(pick)).toEqual(DECISION_RELATIONSHIPS.map(pick));
  });

  it('không hard-code ngưỡng độ đầy đủ ở bất kỳ đâu trong shared/design', () => {
    // Ngưỡng nằm trong `design_setting.brief_completeness_min`. Nó hay bò ngược vào mã theo
    // kiểu "tạm để đây cho chạy", và khi đó Quản trị hệ thống sửa cấu hình mà không có gì đổi.
    const files = readdirSync(root('shared/src/design')).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const source = readFileSync(root(`shared/src/design/${file}`), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${file} có ngưỡng viết cứng`).not.toMatch(/[^.\w]0\.7\b/);
    }
  });
});

describe('Đã trả lời hay chưa', () => {
  it('rỗng là chưa trả lời', () => {
    for (const value of [undefined, null, '', [], {}]) expect(isAnswered(value)).toBe(false);
  });

  it('`false` và `0` LÀ câu trả lời', () => {
    // "Chưa có hồ sơ pháp lý" và "khoảng lùi bằng không" đều là câu trả lời. Coi chúng là
    // chỗ trống thì mọi đầu bài nhà phố vĩnh viễn không đạt ngưỡng.
    expect(isAnswered(false)).toBe(true);
    expect(isAnswered(0)).toBe(true);
  });

  it('người quyết định để trống có chủ ý vẫn tính là đã trả lời', () => {
    // "Đã hỏi, khách chưa quyết" khác hẳn "chưa ai hỏi" — hợp đồng ghi rõ đây là trường bắt
    // buộc THU THẬP dù được để trống.
    expect(isAnswered({ name: null, relationship: null })).toBe(true);
    expect(isAnswered(undefined)).toBe(false);
  });
});

describe('Chấm độ đầy đủ', () => {
  const nhaPho: DesignBriefDraft = {
    building_type: 'nha_pho',
    locality: 'hung_yen',
    site: { width_m: 5, depth_m: 18 },
    floors: 3,
  };

  it('trường bị ẩn KHÔNG bao giờ nằm trong danh sách còn thiếu', () => {
    // Đòi nhà phố khai khoảng lùi là bắt điền một ô không màn hình nào hiện ra.
    const result = scoreBrief(nhaPho, BRIEF_FORM);
    expect(result.missingFields).not.toContain('site.setback_required_m');
    expect(result.missingFields).not.toContain('site.max_density');
  });

  it('biệt thự hỏi nhiều hơn nhà phố — phân nhánh thật sự chạy', () => {
    const pho = scoreBrief(nhaPho, BRIEF_FORM);
    const villa = scoreBrief({ ...nhaPho, building_type: 'biet_thu' }, BRIEF_FORM);
    expect(villa.totalWeight).toBeGreaterThan(pho.totalWeight);
    expect(villa.missingFields).toContain('site.setback_required_m');
  });

  it('thiếu bề rộng lô rớt điểm nặng hơn thiếu phong cách', () => {
    // Cho hai thứ cùng trọng số nghĩa là một đầu bài đủ phong cách, ngân sách, ưu tiên mà
    // thiếu kích thước lô vẫn đạt ngưỡng — rồi Lớp 2 chạy vào một bài toán không giải được.
    const full: DesignBriefDraft = {
      ...nhaPho,
      site: { width_m: 5, depth_m: 18, orientation: 'DN', access_sides: ['front'] },
      style: 'hien_dai',
    };
    const noWidth = scoreBrief({ ...full, site: { ...full.site, width_m: undefined } }, BRIEF_FORM);
    const noStyle = scoreBrief({ ...full, style: undefined }, BRIEF_FORM);
    expect(noWidth.score).toBeLessThan(noStyle.score);
  });

  it('trường chữ tự do không tham gia chấm điểm', () => {
    const legacy = allFields.filter((f) => f.path.startsWith('legacy.'));
    expect(legacy.length).toBeGreaterThan(0);
    for (const field of legacy) expect(field.weight).toBe(0);
    expect(scoreBrief(nhaPho, BRIEF_FORM).missingFields).not.toContain('legacy.design_task');
  });

  it('biểu mẫu trắng cho 0, không cho NaN', () => {
    const empty = scoreBrief({}, BRIEF_FORM);
    expect(empty.score).toBe(0);
    expect(Number.isFinite(empty.score)).toBe(true);
  });

  it('tất định và làm tròn ba chữ số — cùng độ chính xác với cột trong CSDL', () => {
    const first = scoreBrief(nhaPho, BRIEF_FORM);
    const again = scoreBrief(
      { floors: 3, site: { depth_m: 18, width_m: 5 }, ...nhaPho },
      BRIEF_FORM,
    );
    expect(again.score).toBe(first.score);
    expect(String(first.score).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it('nặng trước trong danh sách còn thiếu', () => {
    const result = scoreBrief({ building_type: 'nha_pho' }, BRIEF_FORM);
    expect(result.missingFields[0]).toMatch(/site\.(width|depth)_m|floors/);
  });
});

describe('Điều kiện hiện/ẩn', () => {
  it('sáu dạng đều chạy', () => {
    const payload = { building_type: 'biet_thu', floors: 3, site: { width_m: 0 } };
    expect(evaluateCondition({ field: 'building_type', equals: 'biet_thu' }, payload)).toBe(true);
    expect(evaluateCondition({ field: 'building_type', in: ['nha_pho'] }, payload)).toBe(false);
    // `0` là câu trả lời, nên `filled` phải đúng.
    expect(evaluateCondition({ field: 'site.width_m', filled: true }, payload)).toBe(true);
    expect(evaluateCondition({ field: 'style', filled: false }, payload)).toBe(true);
    expect(
      evaluateCondition(
        {
          all: [
            { field: 'floors', equals: 3 },
            { field: 'style', filled: false },
          ],
        },
        payload,
      ),
    ).toBe(true);
    expect(evaluateCondition({ not: { field: 'floors', equals: 3 } }, payload)).toBe(false);
  });

  it('giao diện và bộ chấm điểm dùng CHUNG một hàm', () => {
    // Hai bản thực thi khác nhau sẽ đẻ ra mục "còn thiếu" mà không màn hình nào cho nhập —
    // lỗi không ai tái hiện được vì mỗi bên đều đúng theo lượt đọc riêng.
    const draft: DesignBriefDraft = { building_type: 'nha_pho' };
    const shown = new Set(visibleFields(BRIEF_FORM, draft).map((v) => v.field.path));
    for (const path of scoreBrief(draft, BRIEF_FORM).missingFields) expect(shown).toContain(path);
  });
});

describe('Soát mâu thuẫn', () => {
  const codes = (draft: DesignBriefDraft) =>
    checkBriefConsistency(draft, BRIEF_FORM).map((i) => i.code);

  it('biểu mẫu trắng KHÔNG nổ cảnh báo nào', () => {
    // Cảnh báo lúc chưa ai nhập gì là kiểu phiền nhiễu khiến người dùng học cách bỏ qua mọi
    // cảnh báo, kể cả cảnh báo thật.
    expect(checkBriefConsistency({}, BRIEF_FORM)).toEqual([]);
  });

  it('khai thang máy mà chưa có kích thước giếng: NGHIÊM TRỌNG — không đoán theo tải (Haan 25/09/2026)', () => {
    for (const elevator of ['lam_ngay', 'chua_cho'] as const) {
      expect(
        codes({ floors: 3, vertical: { elevator, elevator_capacity: 'vua_450kg' } }),
      ).toContain('thang_may_thieu_kich_thuoc');
      expect(
        codes({
          floors: 3,
          vertical: { elevator, elevator_shaft_width_m: 1.5, elevator_shaft_depth_m: 1.6 },
        }),
      ).not.toContain('thang_may_thieu_kich_thuoc');
    }
    expect(codes({ floors: 3, vertical: { elevator: 'khong' } })).not.toContain(
      'thang_may_thieu_kich_thuoc',
    );
    const found = checkBriefConsistency(
      { floors: 3, vertical: { elevator: 'lam_ngay' } },
      BRIEF_FORM,
    ).find((i) => i.code === 'thang_may_thieu_kich_thuoc');
    expect(found?.severity).toBe('nghiem_trong');
  });

  it('kiểu bố trí thang máy «khác» mà chưa mô tả: cảnh báo, không chặn', () => {
    const vertical = { elevator: 'lam_ngay', elevator_position: 'khac' } as const;
    expect(codes({ floors: 3, vertical })).toContain('thang_may_kieu_khac_chua_mo_ta');
    expect(
      codes({ floors: 3, vertical: { ...vertical, elevator_layout_note: 'cuối hành lang' } }),
    ).not.toContain('thang_may_kieu_khac_chua_mo_ta');
  });

  it('khoảng lùi nuốt hết lô đất', () => {
    expect(
      codes({
        building_type: 'biet_thu',
        site: { width_m: 5, depth_m: 18, setback_required_m: { front: 10, back: 10 } },
      }),
    ).toContain('khoang_lui_vuot_chieu_sau');
    expect(
      codes({
        building_type: 'biet_thu',
        site: { width_m: 5, depth_m: 18, setback_required_m: { left: 3, right: 3 } },
      }),
    ).toContain('khoang_lui_vuot_be_rong');
  });

  it('hình thang mà thiếu mặt hậu thì hỏi lại', () => {
    expect(codes({ site: { width_m: 6, depth_m: 20, shape: 'hinh_thang' } })).toContain(
      'hinh_thang_thieu_mat_hau',
    );
    expect(
      codes({ site: { width_m: 6, depth_m: 20, shape: 'hinh_thang', rear_width_m: 4 } }),
    ).not.toContain('hinh_thang_thieu_mat_hau');
  });

  it('đa giác mà ranh giới chưa đủ ba đỉnh thì hỏi lại', () => {
    expect(
      codes({
        site: {
          width_m: 6,
          depth_m: 20,
          shape: 'da_giac',
          boundary_m: [
            [0, 0],
            [6, 0],
          ],
        },
      }),
    ).toContain('da_giac_thieu_ranh_gioi');
  });

  it('diện tích trên giấy chứng nhận lệch quá 5% so với số đo', () => {
    // 6 × 20 = 120 m² suy từ số đo, còn giấy tờ ghi 150 m² — một trong hai số đã nhập sai,
    // và cả hai đều hợp lệ theo hợp đồng nên không có gì khác bắt được.
    expect(codes({ site: { width_m: 6, depth_m: 20, area_m2: 150 } })).toContain(
      'dien_tich_lech_giay_to',
    );
    // Trong 5% thì im: sai số đo đạc thực địa nằm trong khoảng đó.
    expect(codes({ site: { width_m: 6, depth_m: 20, area_m2: 123 } })).not.toContain(
      'dien_tich_lech_giay_to',
    );
    // Thửa hình thang: diện tích thật là 100 m², KHÔNG phải hình bao 120 m². Nếu phép đối
    // chiếu dùng hình bao thì giấy tờ ghi đúng 100 m² lại bị báo lệch.
    expect(
      codes({
        site: { width_m: 6, depth_m: 20, shape: 'hinh_thang', rear_width_m: 4, area_m2: 100 },
      }),
    ).not.toContain('dien_tich_lech_giay_to');
  });

  it('khoảng lùi hợp lệ thì im lặng', () => {
    expect(
      codes({
        site: {
          width_m: 20,
          depth_m: 30,
          setback_required_m: { front: 3, back: 3, left: 2, right: 2 },
        },
      }),
    ).toEqual([]);
  });

  it('nhà phố: khoảng lùi còn lại từ lúc tạm chọn biệt thự là ô ẨN — bị bỏ, không soát (29/09/2026)', () => {
    // Trước đây có cảnh báo `nha_pho_co_khoang_lui_ben` cho đúng dữ liệu cũ này. Nay ô ẩn không đi tới
    // phép soát lẫn bản gửi mô hình (`withoutHiddenAnswers`), nên khoảng lùi cũ không còn tác dụng gì.
    const found = codes({
      building_type: 'nha_pho',
      site: { width_m: 5, depth_m: 18, setback_required_m: { left: 3, right: 3 } },
    });
    expect(found).not.toContain('khoang_lui_vuot_be_rong');
    expect(found).not.toContain('nha_pho_co_khoang_lui_ben');
  });

  it('khai người ở mà không suy ra được phòng ngủ nào', () => {
    // Vai trò lạ (không có trong `occupancy`) là trường hợp DUY NHẤT còn lại: từ 06/09/2026
    // phòng ngủ suy thẳng từ `family`, nên "có người mà thiếu phòng ngủ" không còn phụ thuộc
    // danh sách không gian bắt buộc nữa.
    expect(
      codes({
        family: [{ role: 'ban_be' as 'khach', count: 2 }],
        required_spaces: [{ type: 'living' }, { type: 'kitchen' }],
      }),
    ).toContain('thieu_phong_ngu');
  });

  it('khai vợ chồng thì tự có phòng ngủ, KHÔNG báo thiếu', () => {
    // Bài canh cho đúng một cảnh báo giả đã có thật: phép kiểm cũ hỏi danh sách không gian
    // bắt buộc, nên mọi đầu bài mới đều dính lỗi "nghiêm trọng" ngay khi vừa khai xong gia
    // đình. Một cảnh báo luôn nổ là một cảnh báo bị bỏ qua, kể cả lúc nó đúng.
    expect(
      codes({
        family: [{ role: 'vo_chong', count: 2 }],
        required_spaces: [{ type: 'living' }, { type: 'kitchen' }],
      }),
    ).not.toContain('thieu_phong_ngu');
  });

  it('ghim phòng ngủ của một nhóm vào tầng không tồn tại', () => {
    expect(codes({ floors: 2, family: [{ role: 'ong_ba', count: 2, floor: 3 }] })).toContain(
      'ghim_tang_khong_ton_tai',
    );
  });

  it('khai phòng ngủ mà chưa cho biết ai ở', () => {
    expect(codes({ required_spaces: [{ type: 'bedroom' }] })).toContain('chua_khai_nguoi_o');
  });

  it('chọn nhu cầu riêng KHÔNG sinh cảnh báo đòi bổ sung không gian', () => {
    // Từng có một phép kiểm đòi thêm mã vừa chọn vào «Không gian bắt buộc có». Đã gỡ
    // 07/09/2026: Lớp 2 tự làm việc đó — mã chuẩn trong `family[].needs` đi thành
    // `extraSpaces` (`program/run.ts`) rồi thành một không gian (`program/engine.ts`,
    // `addSingle`). Cảnh báo vừa nói sai sự thật vừa bắt nhập lại thứ đã có (CLAUDE.md 5.4),
    // và nó nổ ngay lúc bấm ô chọn nên kéo theo cả những cảnh báo khác bị bỏ qua.
    //
    // Ba mã ở đây cố ý phủ ba đường khác nhau: `balcony` là không gian thật của ngôi nhà,
    // `closet` chỉ tồn tại trong một phòng ngủ, `bedroom` là mã Lớp 2 tự suy và chỉ còn nằm
    // trong đầu bài lưu trước 06/09/2026.
    for (const need of ['balcony', 'closet', 'bedroom']) {
      const issues = checkBriefConsistency(
        {
          family: [{ role: 'ong_ba', count: 2, needs: [need] }],
          required_spaces: [{ type: 'living' }, { type: 'kitchen' }],
        },
        BRIEF_FORM,
      );
      expect(
        issues.map((i) => i.code),
        `nhu cầu "${need}"`,
      ).not.toContain('nhu_cau_thieu_khong_gian');
      // Và không mã máy nào lọt vào câu tiếng Việt trên màn hình (CLAUDE.md 4.1).
      for (const issue of issues) expect(issue.message).not.toContain(need);
    }
  });

  it('gia đình đông người KHÔNG bị cảnh báo oan', () => {
    // Phép kiểm cũ so "số người trên số loại phòng ngủ" và sai về bản chất: danh sách không
    // gian là một TẬP HỢP, không mang số lượng, nên số loại phòng ngủ tối đa luôn là hai —
    // mọi gia đình trên bốn người đều dính cảnh báo, tức gần như mọi đầu bài biệt thự. Một
    // cảnh báo luôn nổ là một cảnh báo bị bỏ qua, kể cả lúc nó đúng.
    expect(
      codes({
        family: [
          { role: 'ong_ba', count: 2 },
          { role: 'vo_chong', count: 2 },
          { role: 'con', count: 3 },
        ],
        required_spaces: [{ type: 'bedroom' }, { type: 'master_bedroom' }, { type: 'wc' }],
      }),
    ).toEqual([]);
  });

  it('ưu tiên tầng trên cùng trong nhà một tầng', () => {
    expect(
      codes({ floors: 1, family: [{ role: 'ong_ba', count: 2, floor_pref: 'top' }] }),
    ).toContain('uu_tien_tang_khong_ton_tai');
  });

  it('ghim tầng không tồn tại (hạ số tầng sau khi đã ghim)', () => {
    expect(codes({ floors: 2, required_spaces: [{ type: 'garage', floor: 3 }] })).toContain(
      'ghim_tang_khong_ton_tai',
    );
    expect(codes({ floors: 2, required_spaces: [{ type: 'garage', floor: 2 }] })).not.toContain(
      'ghim_tang_khong_ton_tai',
    );
  });

  it('ngân sách đảo ngược', () => {
    expect(codes({ budget_range_vnd: [3_000_000_000, 2_000_000_000] })).toContain(
      'ngan_sach_dao_nguoc',
    );
    expect(codes({ budget_range_vnd: [2_000_000_000, 3_000_000_000] })).toEqual([]);
  });

  it('không mặt nào tiếp cận được', () => {
    expect(codes({ site: { access_sides: [] } })).toContain('khong_co_mat_tiep_can');
  });
});

describe('Suy kiểu gia đình từ thành viên', () => {
  it('ba thế hệ khi có cả ông bà lẫn con', () => {
    expect(
      familyArchetype([
        { role: 'ong_ba', count: 2 },
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 2 },
      ]),
    ).toBe('3_the_he');
  });

  it('hạt nhân khi chỉ có vợ chồng', () => {
    expect(familyArchetype([{ role: 'vo_chong', count: 2 }])).toBe('hat_nhan');
  });

  it('thành viên khai số 0 không tính là có mặt', () => {
    expect(
      familyArchetype([
        { role: 'ong_ba', count: 0 },
        { role: 'vo_chong', count: 2 },
      ]),
    ).toBe('hat_nhan');
  });

  it('chưa khai ai thì trả rỗng, không đoán', () => {
    expect(familyArchetype([])).toBeNull();
    expect(familyArchetype(undefined)).toBeNull();
  });

  it('đếm đúng tổng số người', () => {
    expect(
      householdSize([
        { role: 'ong_ba', count: 2 },
        { role: 'con', count: 3 },
      ]),
    ).toBe(5);
    expect(householdSize(undefined)).toBe(0);
  });
});

describe('Lược đồ bản nháp', () => {
  it('nhận biểu mẫu điền dở', () => {
    expect(designBriefDraftSchema.safeParse({}).success).toBe(true);
    expect(designBriefDraftSchema.safeParse({ site: { width_m: 5 } }).success).toBe(true);
  });

  it('vẫn TỪ CHỐI khoá lạ', () => {
    // `.partial()` giữ `.strict()`. Mất tính chất này khi nâng zod thì khoá bịa sẽ lọt vào
    // payload và chỉ nổ ở tận bước đúc artifact.
    expect(designBriefDraftSchema.safeParse({ khoa_bia: 1 }).success).toBe(false);
    expect(designBriefDraftSchema.safeParse({ site: { rong: 5 } }).success).toBe(false);
  });

  it('cấu hình sai bị chặn ngay lúc nạp', () => {
    const broken = { ...(BRIEF_FORM as BriefFormConfig), version: 'một chấm không' };
    expect(() => briefFormConfigSchema.parse(broken)).toThrow();
  });
});

describe('Soát mâu thuẫn về ý đồ bố cục (13/09/2026)', () => {
  /**
   * Dựng lại đúng những chỗ nói ngược của đầu bài thật «Biệt thự nhà vườn (demo)» — bộ kiểm cũ
   * chấm nó «98%, 0 chỗ chưa nhất quán».
   */
  const villa: DesignBriefDraft = {
    building_type: 'biet_thu',
    floors: 2,
    style: 'tan_co_dien',
    site: {
      width_m: 15,
      depth_m: 20,
      access_sides: ['front', 'left'],
      adjacent: { front: 'duong_lon', back: 'dat_trong', left: 'hem_3m', right: 'nha_hang_xom' },
      setback_required_m: { front: 4 },
    },
    family: [
      { role: 'ong_ba', count: 2, floor: 1, ensuite: true },
      { role: 'vo_chong', count: 2, floor: 2, ensuite: true },
      { role: 'con', count: 2, floor: 2 },
    ],
    required_spaces: [
      { type: 'bedroom', floor: 2, ensuite: true, area_m2: 28 },
      { type: 'master_bedroom', floor: 2, ensuite: true, area_m2: 35 },
      { type: 'bedroom', floor: 1, area_m2: 23 },
      { type: 'living', floor: 1, area_m2: 58 },
      { type: 'garage', floor: 1 },
    ],
    massing: {
      wings_preferred: 2,
      footprint_shape: 'chu_nhat',
      cores_preferred: 1,
      service_core: true,
      yards: ['san_truoc', 'san_ben', 'san_sau'],
    },
  };
  const codes = (draft: DesignBriefDraft, legacy = {}) =>
    checkBriefConsistency(draft, BRIEF_FORM, legacy).map((i) => i.code);

  it('bắt đủ các chỗ nói ngược của đầu bài demo', () => {
    const found = codes(villa, { style_note: 'Hiện đại, mái dốc nhẹ, dễ bảo trì.' });
    expect(found).toEqual(
      expect.arrayContaining([
        'khep_kin_lech_gia_dinh',
        'san_chua_co_kich_thuoc',
        'hinh_khoi_mau_thuan',
        'thang_phu_mot_loi',
        'phong_cach_lech_ghi_chu',
      ]),
    );
  });

  it('phòng ngủ khép kín lệch tầng giữa gia đình và danh sách là NGHIÊM TRỌNG', () => {
    const issue = checkBriefConsistency(villa, BRIEF_FORM).find(
      (i) => i.code === 'khep_kin_lech_gia_dinh',
    )!;
    expect(issue.severity).toBe('nghiem_trong');
    expect(issue.message).toContain('tầng 1 (gia đình 1, danh sách 0)');
  });

  it('lối vào chính và lối xe phải là mặt tiếp cận được', () => {
    const draft = { ...villa, site: { ...villa.site, main_entrance_side: 'back' as const } };
    expect(codes(draft)).toContain('loi_vao_khong_tiep_can');
    const car = {
      ...villa,
      site: { ...villa.site, vehicle_entrance_side: 'left' as const },
      parking: { cars: 1 },
    };
    expect(codes(car)).toContain('loi_xe_hem_hep');
  });

  it('khai số xe mà không có chỗ để xe thì hỏi lại', () => {
    const draft = { ...villa, parking: { cars: 1 }, required_spaces: [{ type: 'living' }] };
    expect(codes(draft)).toContain('xe_chua_co_cho_de');
  });

  it('tường chung/riêng khai ở mặt không giáp hàng xóm thì hỏi lại', () => {
    const draft = {
      ...villa,
      site: { ...villa.site, boundary_walls: { right: 'chung' as const, left: 'rieng' as const } },
    };
    const issues = checkBriefConsistency(draft, BRIEF_FORM).filter(
      (i) => i.code === 'tuong_ranh_khong_giap_hang_xom',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('bên trái');
  });

  it('diện tích đã ghim vượt sàn xây được sau khi chừa sân là NGHIÊM TRỌNG', () => {
    const draft: DesignBriefDraft = {
      ...villa,
      massing: { yards: ['san_ben', 'san_sau'], yard_depth_m: { left: 5, back: 8 } },
      required_spaces: [
        { type: 'living', floor: 1, area_m2: 58 },
        { type: 'kitchen', floor: 1, area_m2: 30 },
      ],
    };
    // 15 × 20, lùi trước 4, sân trái 5, sân sau 8 → 10 × 8 = 80 m²; đã ghim 88 m².
    const issue = checkBriefConsistency(draft, BRIEF_FORM).find(
      (i) => i.code === 'dien_tich_vuot_san_xay_duoc',
    );
    expect(issue?.severity).toBe('nghiem_trong');
    expect(issue?.message).toContain('80 m²');
  });

  it('đầu bài khớp nhau thì không nổ phép nào trong nhóm này', () => {
    const clean: DesignBriefDraft = {
      ...villa,
      style: 'hien_dai',
      family: [
        { role: 'ong_ba', count: 2, floor: 1, ensuite: true },
        { role: 'vo_chong', count: 2, floor: 2, ensuite: true },
      ],
      required_spaces: [
        { type: 'bedroom', floor: 1, ensuite: true },
        { type: 'master_bedroom', floor: 2, ensuite: true },
        { type: 'garage', floor: 1 },
      ],
      site: { ...villa.site, main_entrance_side: 'front', vehicle_entrance_side: 'front' },
      parking: { cars: 1, motorbikes: 2 },
      massing: {
        wings_preferred: 2,
        footprint_shape: 'L',
        cores_preferred: 1,
        service_core: false,
        yards: ['san_truoc', 'san_ben'],
        yard_depth_m: { front: 5, left: 3 },
      },
    };
    expect(codes(clean, { style_note: 'Hiện đại, mái dốc nhẹ.' })).toEqual([]);
  });
});

describe('Chiều sâu sân so với khoảng lùi', () => {
  it('sân không lớn hơn khoảng lùi thì cảnh báo là không có tác dụng — hai số không cộng', () => {
    const issues = checkBriefConsistency(
      {
        building_type: 'biet_thu',
        site: { width_m: 15, depth_m: 20, setback_required_m: { front: 4 } },
        massing: { yards: ['san_truoc', 'san_ben'], yard_depth_m: { front: 1, left: 2 } },
      },
      BRIEF_FORM,
    );
    const issue = issues.find((i) => i.code === 'san_nho_hon_khoang_lui');
    expect(issue?.message).toContain('mặt trước (1 m, khoảng lùi 4 m)');
    expect(issue?.message).not.toContain('bên trái');
  });
});

describe('Diện tích TỐI THIỂU so với sàn xây được (13/09/2026)', () => {
  const base: DesignBriefDraft = {
    building_type: 'biet_thu',
    floors: 2,
    site: { width_m: 15, depth_m: 20, setback_required_m: { front: 4 } },
    massing: { yards: ['san_ben'], yard_depth_m: { left: 3 } },
  };

  it('tính sàn xây được sau khoảng lùi, sân và mật độ', () => {
    // 15 × 20, lùi trước 4, sân trái 3 → 12 × 16 = 192 m² mỗi tầng.
    expect(briefAreaBudget(base)).toMatchObject({ plateM2: 192, floors: 2, totalPlateM2: 384 });
    // Mật độ 50% trên lô 300 m² kẹp xuống 150 m².
    const dense = { ...base, site: { ...base.site!, max_density: 0.5 } };
    expect(briefAreaBudget(dense).plateM2).toBe(150);
  });

  it('tổng diện tích tối thiểu vượt tổng sàn xây được là NGHIÊM TRỌNG, kèm phép tính', () => {
    const draft: DesignBriefDraft = {
      ...base,
      required_spaces: [
        { type: 'living', area_m2: 150 },
        { type: 'kitchen', area_m2: 120 },
        { type: 'garage', area_m2: 130 },
      ],
    };
    const issue = checkBriefConsistency(draft, BRIEF_FORM).find(
      (i) => i.code === 'tong_dien_tich_vuot_san',
    );
    expect(issue?.severity).toBe('nghiem_trong');
    expect(issue?.message).toContain('400 m²');
    expect(issue?.message).toContain('384 m²');
    expect(issue?.message).toContain('192 m² mỗi tầng × 2 tầng');
  });

  it('gần kín thì cảnh báo; còn rộng thì không nói gì', () => {
    const near = { ...base, required_spaces: [{ type: 'living', area_m2: 340 }] };
    expect(checkBriefConsistency(near, BRIEF_FORM).map((i) => i.code)).toContain(
      'tong_dien_tich_gan_kin_san',
    );
    const roomy = { ...base, required_spaces: [{ type: 'living', area_m2: 60 }] };
    expect(checkBriefConsistency(roomy, BRIEF_FORM).map((i) => i.code)).not.toContain(
      'tong_dien_tich_gan_kin_san',
    );
  });
});

describe('Hướng bàn thờ / bếp khai lệch nhau (28/09/2026)', () => {
  // Haan: báo ngay ở đầu bài để người nhập quyết. Đầu bài demo: «bàn thờ hướng đông» ở ghi chú phong
  // thuỷ, «hướng đông nam» ở dòng phòng thờ — mô hình đọc cả hai và tự chọn một.
  const draft = (
    notes: string | null,
    rows: { type: string; amenities: string | null }[],
    taboos: string | null = null,
  ) =>
    ({
      household: { feng_shui: 'co_xem', feng_shui_notes: notes, taboos },
      required_spaces: rows.map((row) => ({ ...row, floor: null, area_m2: null, ensuite: null })),
    }) as unknown as DesignBriefDraft;
  const conflicts = (d: DesignBriefDraft) =>
    checkBriefConsistency(d, BRIEF_FORM).filter((i) => i.code === 'huong_lech_nhau');

  it('đầu bài demo: «đông» ở ghi chú, «đông nam» ở dòng phòng thờ → một cảnh báo nêu cả hai chỗ', () => {
    const found = conflicts(
      draft('bàn thờ hướng đông', [{ type: 'altar_room', amenities: 'hướng đông nam' }]),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('canh_bao');
    expect(found[0]!.message).toMatch(/bàn thờ/);
    expect(found[0]!.message).toMatch(/«đông» ở «Yêu cầu phong thuỷ cụ thể»/);
    expect(found[0]!.message).toMatch(/«đông nam» ở dòng «Phòng thờ/);
    expect(found[0]!.paths).toEqual(['household.feng_shui_notes', 'required_spaces']);
  });

  it('cùng một hướng ở hai chỗ, viết hoa khác nhau: không cảnh báo', () => {
    expect(
      conflicts(
        draft('Bàn thờ hướng Đông Nam', [{ type: 'altar_room', amenities: 'hướng đông nam' }]),
      ),
    ).toEqual([]);
  });

  it('chỉ đọc mệnh đề nhắc tới bàn thờ — «cửa chính hướng nam» không phải hướng bàn thờ', () => {
    expect(conflicts(draft('bàn thờ hướng đông; cửa chính hướng nam', []))).toEqual([]);
  });

  it('bếp: ghi chú kiêng kỵ và dòng bếp khai hai hướng → cảnh báo nói về bếp', () => {
    const found = conflicts(
      draft(null, [{ type: 'kitchen', amenities: 'bếp đảo, hướng bắc' }], 'bếp hướng tây'),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/hướng bếp/);
    expect(found[0]!.paths).toEqual(['household.taboos', 'required_spaces']);
  });

  it('«thờ» phải là trọn từ — «thời điểm khởi công hướng tây» không phải hướng bàn thờ', () => {
    const d = draft('thời điểm khởi công hướng tây', [
      { type: 'altar_room', amenities: 'hướng đông' },
    ]);
    expect(conflicts(d)).toEqual([]);
  });

  it('«bàn thờ, hướng tây» (dấu phẩy) vẫn là hướng bàn thờ; «cửa chính hướng nam» phía sau thì không', () => {
    const found = conflicts(
      draft('bàn thờ, hướng tây, cửa chính hướng nam', [
        { type: 'altar_room', amenities: 'hướng đông' },
      ]),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/«tây» ở «Yêu cầu phong thuỷ cụ thể»/);
    expect(found[0]!.message).not.toMatch(/«nam»/);
  });

  it('không xem phong thuỷ thì ô ghi chú phong thuỷ ẩn — chữ cũ còn lại không sinh cảnh báo', () => {
    const d = draft('bàn thờ hướng đông', [{ type: 'altar_room', amenities: 'hướng tây' }]);
    (d.household as { feng_shui: string }).feng_shui = 'khong_xem';
    expect(conflicts(d)).toEqual([]);
  });

  it('chữ Unicode tổ hợp (NFD, gõ từ máy Mac) vẫn đọc ra đúng hướng', () => {
    const notes = 'bàn thờ hướng đông'.normalize('NFD');
    expect(conflicts(draft(notes, [{ type: 'altar_room', amenities: 'hướng Tây' }]))).toHaveLength(
      1,
    );
  });

  it('biểu mẫu trắng và chỉ một chỗ khai hướng: không cảnh báo', () => {
    expect(conflicts({} as DesignBriefDraft)).toEqual([]);
    expect(conflicts(draft('bàn thờ hướng đông', []))).toEqual([]);
  });
});

describe('Hai câu trả lời ở hai mục khác nhau nói ngược nhau (28/09/2026)', () => {
  // Haan: «khi đầu bài nhập thông tin mâu thuẫn thì nên có cảnh báo ngay để user sửa».
  const has = (d: unknown, code: string) =>
    checkBriefConsistency(d as DesignBriefDraft, BRIEF_FORM).some((i) => i.code === code);
  const row = (type: string, floor: number | null = null) => ({
    type,
    floor,
    area_m2: null,
    ensuite: null,
    amenities: null,
  });

  it('lối vào / lối xe đặt ở mặt không tiếp cận được — chặn', () => {
    const d = { site: { access_sides: ['front'], main_entrance_side: 'left' } };
    expect(has(d, 'loi_vao_mat_khong_tiep_can')).toBe(true);
    const found = checkBriefConsistency(d as unknown as DesignBriefDraft, BRIEF_FORM).find(
      (i) => i.code === 'loi_vao_mat_khong_tiep_can',
    )!;
    expect(found.severity).toBe('nghiem_trong');
    expect(
      has(
        { site: { access_sides: ['front', 'left'], main_entrance_side: 'left' } },
        'loi_vao_mat_khong_tiep_can',
      ),
    ).toBe(false);
    // Chưa khai mặt tiếp cận: đã có cảnh báo riêng, không nổ thêm.
    expect(has({ site: { main_entrance_side: 'left' } }, 'loi_vao_mat_khong_tiep_can')).toBe(false);
  });

  it('mặt tiếp cận lại giáp nhà hàng xóm', () => {
    expect(
      has(
        { site: { access_sides: ['right'], adjacent: { right: 'nha_hang_xom' } } },
        'tiep_can_mat_giap_nha_xom',
      ),
    ).toBe(true);
    expect(
      has(
        { site: { access_sides: ['left'], adjacent: { left: 'hem_3m' } } },
        'tiep_can_mat_giap_nha_xom',
      ),
    ).toBe(false);
  });

  it('không thờ cúng / thờ chung phòng khách mà vẫn có dòng phòng thờ', () => {
    expect(
      has(
        { household: { religion: 'khong' }, required_spaces: [row('altar_room')] },
        'phong_tho_lech_cach_bo_tri',
      ),
    ).toBe(true);
    expect(
      has(
        {
          household: { religion: 'tho_cung_to_tien', altar_arrangement: 'chung_phong_khach' },
          required_spaces: [row('altar_room')],
        },
        'phong_tho_lech_cach_bo_tri',
      ),
    ).toBe(true);
    expect(
      has(
        {
          household: { religion: 'tho_cung_to_tien', altar_arrangement: 'phong_tho_rieng' },
          required_spaces: [row('altar_room')],
        },
        'phong_tho_lech_cach_bo_tri',
      ),
    ).toBe(false);
  });

  // «Tầng đặt nơi thờ» chỉ hiện khi nơi thờ là phòng riêng / trên sân thượng.
  const ownRoom = { religion: 'tho_cung_to_tien', altar_arrangement: 'phong_tho_rieng' };

  it('tầng đặt nơi thờ khác tầng của dòng phòng thờ', () => {
    expect(
      has(
        { household: { ...ownRoom, altar_floor: 3 }, required_spaces: [row('altar_room', 2)] },
        'tang_tho_lech_dong_phong_tho',
      ),
    ).toBe(true);
    expect(
      has(
        { household: { ...ownRoom, altar_floor: 2 }, required_spaces: [row('altar_room', 2)] },
        'tang_tho_lech_dong_phong_tho',
      ),
    ).toBe(false);
    expect(
      has(
        { household: { ...ownRoom, altar_floor: 2 }, required_spaces: [row('altar_room')] },
        'tang_tho_lech_dong_phong_tho',
      ),
    ).toBe(false);
  });

  it('không xem phong thuỷ mà xếp phong thuỷ vào ưu tiên', () => {
    expect(
      has(
        { household: { feng_shui: 'khong_xem' }, priorities: ['feng_shui'] },
        'khong_xem_phong_thuy_ma_uu_tien',
      ),
    ).toBe(true);
    expect(
      has(
        { household: { feng_shui: 'co_xem' }, priorities: ['feng_shui'] },
        'khong_xem_phong_thuy_ma_uu_tien',
      ),
    ).toBe(false);
  });

  it('0 ô tô VÀ 0 xe máy mà vẫn có dòng «Chỗ để xe»; chưa khai số xe thì không nói', () => {
    const garage = [row('garage')];
    expect(
      has({ parking: { cars: 0, motorbikes: 0 }, required_spaces: garage }, 'co_gara_khong_xe'),
    ).toBe(true);
    expect(has({ parking: {}, required_spaces: garage }, 'co_gara_khong_xe')).toBe(false);
  });

  it('«Chỗ để xe» là cả xe máy: 0 ô tô nhưng 2 xe máy không phải mâu thuẫn (rà soát 29/09/2026)', () => {
    const garage = [row('garage')];
    expect(
      has({ parking: { cars: 0, motorbikes: 2 }, required_spaces: garage }, 'co_gara_khong_xe'),
    ).toBe(false);
    expect(has({ parking: { cars: 0 }, required_spaces: garage }, 'co_gara_khong_xe')).toBe(false);
  });

  it('ô đang ẩn không sinh cảnh báo — phiếu giữ giá trị cũ của ô đã ẩn (rà soát 29/09/2026)', () => {
    // Chưa chọn «Ban công làm tới đâu» thì ô mặt ban công ẩn: giá trị cũ không được CHẶN «AI Design».
    const stale = {
      site: { adjacent: { right: 'nha_hang_xom' } },
      balconies: { required_sides: ['right'] },
    };
    expect(has(stale, 'ban_cong_mat_giap_nha_xom')).toBe(false);
    // Nơi thờ chung phòng khách thì ô «Tầng đặt nơi thờ» ẩn — tầng cũ không so với dòng phòng thờ.
    const shared = {
      household: {
        religion: 'tho_cung_to_tien',
        altar_arrangement: 'chung_phong_khach',
        altar_floor: 3,
      },
      required_spaces: [row('altar_room', 2)],
    };
    expect(has(shared, 'tang_tho_lech_dong_phong_tho')).toBe(false);
  });

  it('nhà phố không có ô khoảng lùi / sân: câu chặn không bảo khai thứ không nhập được', () => {
    const found = checkBriefConsistency(
      {
        building_type: 'nha_pho',
        site: { adjacent: { left: 'nha_hang_xom' } },
        balconies: { scope: 'moi_tang', required_sides: ['left'] },
      } as unknown as DesignBriefDraft,
      BRIEF_FORM,
    ).find((i) => i.code === 'ban_cong_mat_giap_nha_xom')!;
    expect(found.severity).toBe('nghiem_trong');
    expect(found.message).not.toMatch(/khoảng lùi/);
  });

  it('không kinh doanh mà có dòng cửa hàng', () => {
    expect(
      has(
        { household: { home_business: { mode: 'khong' } }, required_spaces: [row('shop')] },
        'cua_hang_khong_kinh_doanh',
      ),
    ).toBe(true);
    expect(
      has(
        {
          household: { home_business: { mode: 'cua_hang_mat_tien' } },
          required_spaces: [row('shop')],
        },
        'cua_hang_khong_kinh_doanh',
      ),
    ).toBe(false);
  });

  it('ban công chỉ mặt tiền mà mặt bắt buộc có mặt khác', () => {
    expect(
      has(
        { balconies: { scope: 'chi_mat_tien', required_sides: ['front', 'back'] } },
        'ban_cong_chi_mat_tien_lech_mat',
      ),
    ).toBe(true);
    expect(
      has(
        { balconies: { scope: 'chi_mat_tien', required_sides: ['front'] } },
        'ban_cong_chi_mat_tien_lech_mat',
      ),
    ).toBe(false);
  });

  it('ban công bắt buộc ở mặt giáp nhà hàng xóm không có khoảng lùi / sân — chặn; có sân thì thôi', () => {
    // Biệt thự: ô khoảng lùi và chiều sâu sân đang hiện.
    const base = {
      building_type: 'biet_thu',
      site: { adjacent: { right: 'nha_hang_xom' } },
      balconies: { scope: 'moi_tang', required_sides: ['right'] },
    };
    expect(has(base, 'ban_cong_mat_giap_nha_xom')).toBe(true);
    expect(
      has({ ...base, massing: { yard_depth_m: { right: 2 } } }, 'ban_cong_mat_giap_nha_xom'),
    ).toBe(false);
    expect(
      has(
        {
          ...base,
          site: { adjacent: { right: 'nha_hang_xom' }, setback_required_m: { right: 1.5 } },
        },
        'ban_cong_mat_giap_nha_xom',
      ),
    ).toBe(false);
  });

  it('người đi lại khó khăn, nhà nhiều tầng, không thang máy — chỉ cảnh báo nhẹ', () => {
    const d = { floors: 2, lifestyle: { reduced_mobility: true }, vertical: { elevator: 'khong' } };
    const found = checkBriefConsistency(d as unknown as DesignBriefDraft, BRIEF_FORM).find(
      (i) => i.code === 'di_lai_kho_khan_khong_thang_may',
    );
    expect(found?.severity).toBe('canh_bao');
    expect(
      has({ ...d, vertical: { elevator: 'chua_cho' } }, 'di_lai_kho_khan_khong_thang_may'),
    ).toBe(false);
    expect(has({ ...d, floors: 1 }, 'di_lai_kho_khan_khong_thang_may')).toBe(false);
  });

  it('cục nóng điều hoà đặt ban công phụ mà không làm ban công', () => {
    expect(
      has(
        { systems: { aircon_outdoor: 'ban_cong_phu' }, balconies: { scope: 'khong_co' } },
        'cuc_nong_ban_cong_khong_co',
      ),
    ).toBe(true);
    expect(
      has(
        { systems: { aircon_outdoor: 'ban_cong_phu' }, balconies: { scope: 'moi_tang' } },
        'cuc_nong_ban_cong_khong_co',
      ),
    ).toBe(false);
  });
});

describe('withoutHiddenAnswers — bỏ câu trả lời của ô đang ẩn (29/09/2026)', () => {
  it('ô ẩn kéo theo ô ẩn: không thờ cúng → bỏ cách bố trí nơi thờ → bỏ luôn tầng thờ', () => {
    const draft = {
      household: {
        religion: 'khong',
        altar_arrangement: 'phong_tho_rieng',
        altar_floor: 2,
        feng_shui: 'khong_xem',
      },
    };
    const pruned = withoutHiddenAnswers(draft, BRIEF_FORM) as typeof draft;
    expect(pruned.household).toEqual({ religion: 'khong', feng_shui: 'khong_xem' });
    // Không sửa đối tượng gốc — phiếu vẫn giữ để người dùng đổi lại lựa chọn thì thấy lại câu cũ.
    expect(draft.household.altar_floor).toBe(2);
  });

  it('ô đang hiện giữ nguyên; không có gì để bỏ thì trả chính đối tượng cũ', () => {
    const draft = { building_type: 'biet_thu', site: { setback_required_m: { front: 3 } } };
    expect(withoutHiddenAnswers(draft, BRIEF_FORM)).toBe(draft);
  });

  it('`keep` giữ ô ẩn mà chương trình tự dựng (chiều rộng / sâu của thửa đa giác)', () => {
    const draft = { site: { shape: 'da_giac', width_m: 15, depth_m: 20 } };
    expect(withoutHiddenAnswers(draft, BRIEF_FORM).site).toEqual({ shape: 'da_giac' });
    expect(withoutHiddenAnswers(draft, BRIEF_FORM, ['site.width_m', 'site.depth_m'])).toBe(draft);
  });
});
