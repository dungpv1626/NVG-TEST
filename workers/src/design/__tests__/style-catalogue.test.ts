/**
 * Bộ đặc trưng phong cách (`kb/style_catalogue.yaml`, T175) — KHÔNG chạm mạng, không gọi mô hình.
 *
 * Canh sáu chỗ một sai lệch sẽ không trông giống lỗi:
 *  · mã trong `allowed` / `match` có thật trong danh mục mặt đứng (mã gõ sai = ô chọn lặng lẽ bớt);
 *  · chín phong cách khớp đúng chín lựa chọn của câu `style` trong biểu mẫu đầu bài;
 *  · bảng phong cách của lời dẫn ảnh chỉ có MỘT nguồn (tệp này), không còn bản viết tay thứ hai;
 *  · lời dẫn mặt đứng mang `must` của phong cách đầu bài;
 *  · mã ngoài tập hợp phong cách thành cảnh báo, KHÔNG loại ý tưởng (T52);
 *  · điểm «đúng phong cách» (nhóm S) đổi đúng chiều.
 */

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  aiFacadeConceptSchema,
  BRIEF_FORM,
  emptyFacadeBrief,
  selectionsOfFacadeBrief,
  STYLES,
  styleMismatches,
  type AiFacadeConcept,
  type AiFacadeProposal,
} from '@nvg/shared/design';
import { facadeFrame } from '../ai/facade/frame';
import { mergeFacade } from '../ai/facade/merge';
import { callFacadeModel, facadeRequirementsWithStyle } from '../ai/facade/propose';
import { parseFacadeQuality } from '../ai/facade/quality';
import { scoreFacade } from '../ai/facade/score';
import { parseAiPrompts } from '../ai/prompts';
import { parseStyleCatalogue, StyleCatalogueError } from '../kb/style-catalogue';
import type { TextModelClient } from '../llm/text-client';
import {
  facadeVocab,
  norms,
  outdoor,
  PLAN_REF,
  TOWNHOUSE_PROPOSAL,
  VILLA_FACADE,
  VILLA_PROPOSAL,
  VILLA_PLAN_SHIFTED,
} from './ai-facade-fixtures';
import { TOWNHOUSE_PLAN } from './ai-plan-fixtures';
import { FAKE_CALL, loadRun, prompts, read } from './ai-real-context';
import { styleCat, styleCatalogueYaml } from './ai-style-fixtures';

const quality = parseFacadeQuality(read('kb/facade_quality.yaml'));
const META = {
  planRef: PLAN_REF,
  generator: {
    kind: 'ai',
    provider: 'fixture',
    model: 'viet-tay',
    route: 'fixture',
    prompt_version: '0.0.0',
  },
} as const;

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('Tệp bộ đặc trưng', () => {
  it('chín phong cách khớp đúng chín lựa chọn của câu `style` trong đầu bài', () => {
    const field = BRIEF_FORM.sections.flatMap((s) => s.fields).find((f) => f.path === 'style');
    const options = (field?.options ?? []).map((o) => o.value).sort();
    expect(options).toHaveLength(9);
    expect(Object.keys(styleCat.styles).sort()).toEqual(options);
    expect(Object.keys(styleCat.styles).sort()).toEqual([...STYLES].sort());
  });

  it('mọi phong cách mang cờ đề xuất, và đầu tệp nói rõ chờ kiến trúc sư NVO duyệt', () => {
    expect(styleCat.status).toBe('de_xuat');
    expect(Object.values(styleCat.styles).every((s) => s.status === 'de_xuat')).toBe(true);
    const head = styleCatalogueYaml.split('\n')[0]!;
    expect(head).toMatch(/ĐỀ XUẤT của Claude Code/);
    expect(head).toMatch(/chờ kiến trúc sư NVO duyệt/);
  });

  it('mọi mã trong `allowed` và `match` có thật trong kb/facade_vocabulary.yaml', () => {
    // `parseStyleCatalogue` đã kiểm lúc nạp; ở đây đếm lại để phép kiểm ấy không bị gỡ lặng lẽ.
    let counted = 0;
    for (const spec of Object.values(styleCat.styles)) {
      for (const [group, list] of Object.entries(spec.allowed)) {
        const table = {
          roof_types: facadeVocab.roofTypes,
          roof_materials: facadeVocab.roofMaterials,
          materials: facadeVocab.materials,
          colours: facadeVocab.colours,
          railings: facadeVocab.railings,
          door_materials: facadeVocab.doorMaterials,
          gate_types: facadeVocab.gateTypes,
          fence_types: facadeVocab.fenceTypes,
        }[group]!;
        for (const code of list!) {
          expect(code in table, `${spec.code}.allowed.${group}: ${code}`).toBe(true);
          counted += 1;
        }
      }
    }
    expect(counted).toBeGreaterThan(100);
  });

  it('mã lạ, khoá lạ hoặc thiếu `must` bị bắt NGAY lúc nạp', () => {
    const bad = styleCatalogueYaml.replace('roof_types: [flat, mixed] }', 'roof_types: [phang] }');
    expect(bad).not.toBe(styleCatalogueYaml);
    expect(() => parseStyleCatalogue(bad, facadeVocab)).toThrow(StyleCatalogueError);
    expect(() => parseStyleCatalogue(bad, facadeVocab)).toThrow(/phang/);
    const badKey = styleCatalogueYaml.replace(
      'match: { roof_types: [flat, mixed] }',
      'match: { mai: [flat] }',
    );
    expect(() => parseStyleCatalogue(badKey, facadeVocab)).toThrow(/khoá lạ/);
    const badGroup = styleCatalogueYaml.replace(
      '      roof_types: [flat, mixed, hip, gable, japanese]',
      '      mai: [flat]',
    );
    expect(() => parseStyleCatalogue(badGroup, facadeVocab)).toThrow(/nhóm lạ/);
  });
});

describe('Một nguồn cho lời dẫn ảnh', () => {
  it('tệp lời dẫn không còn khối `styles:` viết tay; bảng dựng từ bộ đặc trưng', () => {
    const raw = load(read('kb/ai_design_prompts.yaml')) as Record<string, Record<string, unknown>>;
    expect(raw.sheet_image!.styles).toBeUndefined();
    expect(raw.facade_image!.styles).toBeUndefined();
    const bare = parseAiPrompts(raw);
    expect(bare.sheetImage.styles).toEqual({});
    for (const spec of Object.values(styleCat.styles)) {
      expect(prompts.sheetImage.styles[spec.code]).toBe(spec.prompt.interior);
      expect(prompts.facadeImage.styles[spec.code]!.startsWith(spec.prompt.exterior)).toBe(true);
    }
  });

  it('câu phong cách của ảnh mặt đứng / phối cảnh mang chi tiết nên có và nên tránh', () => {
    const spec = styleCat.styles.tan_co_dien!;
    const phrase = prompts.facadeImage.styles.tan_co_dien!;
    expect(phrase).toContain(spec.must[0]!.en);
    expect(phrase).toContain(`avoid: ${spec.avoid[0]!.en}`);
    // Ảnh vẽ từ ảnh neo đã khoá — dặn không thêm chi tiết bản vẽ không có.
    expect(phrase).toContain('only where the drawing already has them');
  });
});

describe('Lời dẫn mặt đứng', () => {
  const frame = facadeFrame(TOWNHOUSE_PLAN, norms, outdoor);

  it('phiếu chọn Tân cổ điển: khối yêu cầu mang must / prefer / avoid và tập mã hợp phong cách', () => {
    const brief = { ...emptyFacadeBrief(), style: 'tan_co_dien' as const };
    const text = facadeRequirementsWithStyle(brief, facadeVocab, frame, styleCat);
    const spec = styleCat.styles.tan_co_dien!;
    for (const cue of spec.must) expect(text).toContain(`- ${cue.en}`);
    expect(text).toContain(`- ${spec.prefer[0]!.en}`);
    expect(text).toContain(`- ${spec.avoid[0]!.en}`);
    expect(text).toContain('- roof_types: mansard, hip, gable, flat, mixed');
    expect(text).toContain('not a hard rule');
  });

  it('không phong cách, hoặc không có bộ đặc trưng: khối yêu cầu như trước T175', () => {
    const plain = facadeRequirementsWithStyle(emptyFacadeBrief(), facadeVocab, frame, styleCat);
    expect(plain).not.toContain('Style guide');
    const brief = { ...emptyFacadeBrief(), style: 'indochine' as const };
    expect(facadeRequirementsWithStyle(brief, facadeVocab, frame, null)).not.toContain(
      'Style guide',
    );
  });

  it('lượt gọi mô hình (client giả) gửi đi «Style guide» của phong cách đầu bài', async () => {
    const calls: Array<{ prompt: string }> = [];
    const client: TextModelClient = {
      complete: async (_route, _dataClass, request) => {
        calls.push({ prompt: request.prompt });
        return { ...FAKE_CALL, json: TOWNHOUSE_PROPOSAL };
      },
    } as TextModelClient;
    const brief = { ...emptyFacadeBrief(), style: 'dia_trung_hai' as const };
    await callFacadeModel({
      client,
      route: 'ai_text_fake',
      prompts,
      digest: loadRun('58688ead').digest,
      frame,
      vocab: facadeVocab,
      brief,
      styles: styleCat,
    });
    expect(calls[0]!.prompt).toContain('Style guide for "dia_trung_hai"');
    expect(calls[0]!.prompt).toContain(styleCat.styles.dia_trung_hai!.must[0]!.en);
  });
});

describe('Hàm ghép — mã ngoài phong cách', () => {
  const frame = facadeFrame(VILLA_PLAN_SHIFTED, norms, outdoor);

  it('mô hình chọn mã ngoài tập: ghi cảnh báo `facade_style_mismatch`, KHÔNG loại ý tưởng', () => {
    // Biệt thự mái Thái nhưng mái tôn sóng và thân nhà ốp alu — cả hai ngoài tập của mái Thái.
    const proposal: AiFacadeProposal = copy(VILLA_PROPOSAL);
    proposal.roof.material = 'ton_song';
    proposal.materials.find((m) => m.where === 'body')!.material = 'tam_alu';
    const concept = mergeFacade(frame, proposal, facadeVocab, META, null, styleCat);
    expect(concept.roof.material).toBe('ton_song');
    const warnings = concept.warnings ?? [];
    expect(warnings.map((w) => w.code)).toEqual(['facade_style_mismatch', 'facade_style_mismatch']);
    expect(warnings.map((w) => w.field).sort()).toEqual(['body.material', 'roof.material']);
    expect(warnings.find((w) => w.field === 'roof.material')!.message).toBe(
      'Vật liệu mái: «Tôn sóng» không hợp phong cách Mái Thái đã chọn.',
    );
    // Artifact vẫn đúng hợp đồng — trường mới là tuỳ chọn.
    expect(aiFacadeConceptSchema.safeParse(concept).success).toBe(true);
  });

  it('mã kỹ sư đã điền trên phiếu không bị cảnh báo — đó là quyết định của kỹ sư', () => {
    const proposal: AiFacadeProposal = copy(VILLA_PROPOSAL);
    const brief = emptyFacadeBrief();
    brief.style = 'mai_thai';
    brief.roof.material = 'ton_song';
    const concept = mergeFacade(frame, proposal, facadeVocab, META, brief, styleCat);
    expect(concept.roof.material).toBe('ton_song');
    expect((concept.warnings ?? []).map((w) => w.field)).not.toContain('roof.material');
  });

  it('ý tưởng hợp phong cách, hoặc không có bộ đặc trưng: không có khoá `warnings`', () => {
    expect(
      mergeFacade(frame, VILLA_PROPOSAL, facadeVocab, META, null, styleCat),
    ).not.toHaveProperty('warnings');
    const off = copy(VILLA_PROPOSAL);
    off.roof.material = 'ton_song';
    expect(mergeFacade(frame, off, facadeVocab, META)).not.toHaveProperty('warnings');
  });
});

describe('Điểm «đúng phong cách» (nhóm S)', () => {
  const score = (concept: AiFacadeConcept, withStyles = true) =>
    scoreFacade({
      concept,
      quality,
      vocab: facadeVocab,
      railingCm: 90,
      ...(withStyles ? { styles: styleCat } : {}),
    });
  const s = (concept: AiFacadeConcept, code: string) =>
    score(concept).criteria.find((c) => c.code === code)!;

  it('biệt thự mái Thái ngói màu: đủ hai chi tiết phải có, không dùng chi tiết nên tránh', () => {
    expect(s(VILLA_FACADE, 'S1').value).toBe(1);
    expect(s(VILLA_FACADE, 'S1').score).toBe(1);
    expect(s(VILLA_FACADE, 'S2').value).toBe(0);
    expect(s(VILLA_FACADE, 'S2').score).toBe(1);
  });

  it('cùng biệt thự đổi sang mái bằng: thiếu một chi tiết phải có VÀ dùng một chi tiết nên tránh', () => {
    const flat = copy(VILLA_FACADE);
    flat.roof.type = 'flat';
    flat.roof.material = 'btct_chong_tham';
    // `must`: mái Thái (thiếu), mái ngói (thiếu) → 0/2. `avoid`: mái bằng + sàn mái bê tông → 2.
    expect(s(flat, 'S1').value).toBe(0);
    expect(s(flat, 'S1').detail).toContain('Mái Thái dốc lớn');
    expect(s(flat, 'S2').value).toBe(2);
    expect(s(flat, 'S2').score).toBe(0);
    expect(score(flat).percent!).toBeLessThan(score(VILLA_FACADE).percent!);
  });

  it('Tân cổ điển: đếm theo mã và mảng trang trí — thêm vòm thì tỷ lệ chi tiết phải có tăng', () => {
    const neo = copy(VILLA_FACADE);
    neo.style = 'tan_co_dien';
    neo.roof.type = 'hip';
    // Đã có phào (cornice + phao_chi), cột, mái tứ giác; chưa có vòm. Chi tiết «đối xứng» không đo bằng mã.
    expect(s(neo, 'S1').value).toBe(3 / 4);
    neo.elevation.elements = [
      ...(neo.elevation.elements ?? []),
      { kind: 'arch', rect: [480, 300, 710, 360], material_ref: null },
    ];
    expect(s(neo, 'S1').value).toBe(1);
    expect(s(neo, 'S1').detail).toBeUndefined();
  });

  it('không có bộ đặc trưng: S1, S2 «thiếu đầu vào», điểm các nhóm khác không đổi', () => {
    const without = score(VILLA_FACADE, false);
    const sRows = without.criteria.filter((c) => c.group === 'S');
    expect(sRows.every((c) => c.score === null && c.why)).toBe(true);
    // Thiếu đầu vào: giữ trọng số, không vào phần chấm được.
    expect(sRows.every((c) => c.weight > 0)).toBe(true);
    expect(without.scoredWeight).toBe(score(VILLA_FACADE).scoredWeight - 15);
  });

  it('cùng một bộ so dùng ở phiếu: lựa chọn của kỹ sư ngoài tập được liệt kê, không bị loại', () => {
    const brief = emptyFacadeBrief();
    brief.roof.type = 'flat';
    brief.surfaces.body.material = 'son_nuoc';
    const off = styleMismatches(selectionsOfFacadeBrief(brief), styleCat.styles.mai_thai!);
    expect(off.map((x) => x.field)).toEqual(['roof.type']);
  });
});
