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
  briefFormConfigSchema,
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

  it('mọi gói quy tắc địa phương đều chọn được từ biểu mẫu', () => {
    // Chiều ràng buộc đã ĐỔI ngày 29/08/2026, và chiều mới mới là chiều bắt được lỗi thật.
    //
    // Trước đây biểu mẫu chỉ có một địa phương nên "mỗi lựa chọn phải có một gói" là kiểm
    // được. Từ khi danh sách mở ra đủ 34 đơn vị hành chính, ràng buộc đó đòi 34 gói quy
    // tắc — mà tạo một gói chép lại đúng số của quy chuẩn quốc gia là tạo bản sao thứ hai
    // của cùng con số, không phải một quy định địa phương.
    //
    // Chiều còn lại thì vẫn hỏng thật được: một gói nằm trong `rules/locality/` mà không
    // lựa chọn nào sinh ra được giá trị `locality` ấy là một gói KHÔNG BAO GIỜ chạy. Nó
    // trông như đã cấu hình xong, không có lỗi nào nổ ra, và mọi hồ sơ ở tỉnh đó âm thầm
    // chạy bằng gói nền.
    const field = allFields.find((f) => f.path === 'locality')!;
    const selectable = new Set(
      (field.options ?? []).map((option) => option.value.replace(/_/g, '-')),
    );
    const packs = readdirSync(root('rules/locality'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const pack of packs) {
      expect(selectable, `gói quy tắc không ai chọn tới được: ${pack}`).toContain(pack);
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

  it('khoảng lùi nuốt hết lô đất', () => {
    expect(
      codes({ site: { width_m: 5, depth_m: 18, setback_required_m: { front: 10, back: 10 } } }),
    ).toContain('khoang_lui_vuot_chieu_sau');
    expect(
      codes({ site: { width_m: 5, depth_m: 18, setback_required_m: { left: 3, right: 3 } } }),
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

  it('nhà phố mà khai khoảng lùi hai bên', () => {
    expect(
      codes({
        building_type: 'nha_pho',
        site: { width_m: 5, depth_m: 18, setback_required_m: { left: 1 } },
      }),
    ).toContain('nha_pho_co_khoang_lui_ben');
  });

  it('có người ở mà không có phòng ngủ nào', () => {
    expect(
      codes({
        family: [{ role: 'vo_chong', count: 2 }],
        required_spaces: [{ type: 'living' }, { type: 'kitchen' }],
      }),
    ).toContain('thieu_phong_ngu');
  });

  it('khai phòng ngủ mà chưa cho biết ai ở', () => {
    expect(codes({ required_spaces: [{ type: 'bedroom' }] })).toContain('chua_khai_nguoi_o');
  });

  it('nhu cầu riêng của một nhóm mà danh sách không gian chưa có', () => {
    const issues = checkBriefConsistency(
      {
        family: [{ role: 'ong_ba', count: 2, needs: ['bedroom', 'wc'] }],
        required_spaces: [{ type: 'living' }, { type: 'bedroom' }],
      },
      BRIEF_FORM,
    );
    const issue = issues.find((i) => i.code === 'nhu_cau_thieu_khong_gian');
    expect(issue).toBeDefined();
    // Nói bằng NHÃN tiếng Việt, không phải mã: người nhập không biết `wc` là gì.
    expect(issue!.message).toContain('Khu vệ sinh');
    expect(issue!.message).not.toContain('wc');
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
