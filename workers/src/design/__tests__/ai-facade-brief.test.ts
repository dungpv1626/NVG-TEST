/**
 * Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2) — KHÔNG chạm mạng.
 *
 * Haan chốt 19/09/2026: mục đã điền là BẮT BUỘC, mục trống để AI đề xuất; kỹ sư nhập chiều cao cửa,
 * bề rộng là của mặt bằng. Bộ này canh đúng ba lời hứa ấy:
 *  · mục đã điền THẮNG câu trả lời của mô hình — hàm ghép áp thẳng, không trông vào mô hình;
 *  · chiều cao cửa và cốt nền đổi theo phiếu, bề rộng cửa KHÔNG đổi;
 *  · thứ chương trình không tự làm được (trang trí, có cổng) thì phép kiểm bắt mô hình làm lại.
 */

import {
  aiFacadeBriefSchema,
  aiFacadeConceptSchema,
  type AiFacadeBrief,
  type AiFacadeProposal,
} from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { renderElevationSheet } from '../ai/draw/elevation-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import {
  checkFacadeBriefCodes,
  emptyFacadeBrief,
  facadeRequirementsText,
} from '../ai/facade/brief';
import { checkFacade } from '../ai/facade/check';
import { parseFacadeQuality } from '../ai/facade/quality';
import { scoreFacade } from '../ai/facade/score';
import { briefKeys, facadeLegend } from '../ai/facade/describe';
import { facadeFrame, mainDoorOf } from '../ai/facade/frame';
import { mergeFacade } from '../ai/facade/merge';
import {
  facadeVocab,
  norms,
  outdoor,
  PLAN_REF,
  shiftBack,
  TOWNHOUSE_PROPOSAL,
  VILLA_PROPOSAL,
} from './ai-facade-fixtures';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';
import { read } from './ai-real-context';

const style = parseSheetStyle(read('kb/sheet_style.yaml'));
const BRIEF_REF = `sha256:${'b'.repeat(64)}`;
const GENERATOR = {
  kind: 'ai' as const,
  provider: 'fixture',
  model: 'viet-tay',
  route: 'fixture',
  prompt_version: '0.0.0',
};

function brief(over: (b: AiFacadeBrief) => void): AiFacadeBrief {
  const b = emptyFacadeBrief();
  over(b);
  return b;
}

describe('Hợp đồng và danh mục của phiếu', () => {
  it('phiếu trống đúng hợp đồng và không có mã lạ', () => {
    expect(aiFacadeBriefSchema.safeParse(emptyFacadeBrief()).success).toBe(true);
    expect(checkFacadeBriefCodes(emptyFacadeBrief(), facadeVocab)).toEqual([]);
  });

  it('mã ngoài danh mục bị bắt lúc lưu, nói rõ mục nào', () => {
    const issues = checkFacadeBriefCodes(
      brief((b) => {
        b.main_door.material = 'vang_ron';
        b.palette.primary = 'tim_than';
      }),
      facadeVocab,
    );
    expect(issues.join(' ')).toMatch(/Cửa chính — vật liệu: mã «vang_ron»/);
    expect(issues.join(' ')).toMatch(/tim_than/);
  });

  it('phiếu lưu TRƯỚC khi có khoá `saved_at` vẫn đọc lại được', () => {
    // Artifact là BẤT BIẾN (8.2 nguyên tắc 3): thêm một mục bắt buộc vào hợp đồng đang dùng biến mọi
    // dòng đã ghi thành không đọc nổi. Đã xảy ra thật 20/09/2026 — hai phiếu lưu hôm trước làm màn
    // hình Mặt đứng đỏ với «Dữ liệu không đúng hợp đồng "ai_facade_brief": saved_at — Required».
    const { saved_at: _cu, ...truoc } = emptyFacadeBrief();
    expect(aiFacadeBriefSchema.safeParse(truoc).success).toBe(true);
  });

  it('chiều cao cửa ngoài khoảng dựng được bị hợp đồng từ chối', () => {
    const tooShort = brief((b) => {
      b.main_door.h_cm = 90;
    });
    expect(aiFacadeBriefSchema.safeParse(tooShort).success).toBe(false);
  });
});

describe('Khung theo phiếu — số đo chương trình áp thẳng', () => {
  const villa = shiftBack(VILLA_PLAN, 500);
  const plain = facadeFrame(villa, norms, outdoor);
  const filled = facadeFrame(
    villa,
    norms,
    outdoor,
    brief((b) => {
      b.ground_raise_cm = 60;
      b.main_door.h_cm = 270;
      b.side_door.h_cm = 240;
      b.roof.parapet_cm = 90;
    }),
  );

  it('cốt nền và tường chắn mái lấy từ phiếu', () => {
    expect(filled.groundZ).toBe(-60);
    expect(filled.parapetDefault).toBe(90);
  });

  it('chiều cao cửa chính và cửa phụ theo phiếu; BỀ RỘNG không đổi — là của mặt bằng', () => {
    const main = mainDoorOf(filled.openings)!;
    expect(main).toMatchObject({ level: 1, x: 512, w: 165, h: 270 });
    const sides = filled.openings.filter((o) => o.kind === 'door' && o !== main);
    expect(sides.map((o) => o.h)).toEqual(sides.map(() => 240));
    expect(filled.openings.map((o) => [o.x, o.w])).toEqual(plain.openings.map((o) => [o.x, o.w]));
    // Cửa sổ và cửa để xe không đổi chiều cao.
    expect(filled.openings.filter((o) => o.kind !== 'door')).toEqual(
      plain.openings.filter((o) => o.kind !== 'door'),
    );
  });
});

describe('Ghép theo phiếu — mục đã điền thắng câu trả lời của mô hình', () => {
  const frame = facadeFrame(TOWNHOUSE_PLAN, norms, outdoor);
  const filled = brief((b) => {
    b.roof.type = 'japanese';
    b.roof.material = 'ngoi_phang';
    b.roof.colour = 'xam_dam';
    b.surfaces.body = { material: 'son_nuoc', colour: 'ghi_bac' };
    b.palette.primary = 'ghi_bac';
    b.main_door = { material: 'nhom_kinh_he', colour: 'den', type: 'bon_canh', h_cm: 280 };
    b.balcony.railing = 'sat_hop';
    b.window.glass = 'phan_quang';
  });
  const concept = mergeFacade(
    facadeFrame(TOWNHOUSE_PLAN, norms, outdoor, filled),
    TOWNHOUSE_PROPOSAL,
    facadeVocab,
    { planRef: PLAN_REF, briefRef: BRIEF_REF, generator: GENERATOR },
    filled,
  );

  it('kết quả đúng hợp đồng và trỏ về phiếu', () => {
    expect(aiFacadeConceptSchema.safeParse(concept).success).toBe(true);
    expect(concept.brief_ref).toBe(BRIEF_REF);
  });

  it('mái Nhật thay mái bằng mô hình khai: dốc thấp, đua rộng, không tường chắn mái', () => {
    expect(concept.roof).toMatchObject({
      type: 'japanese',
      material: 'ngoi_phang',
      colour: 'xam_dam',
      pitch_deg: facadeVocab.roofDefaults.japanese.pitch_deg,
    });
    const outline = concept.elevation.roof_outline!;
    expect(outline).toHaveLength(4);
    expect(outline[0]).toEqual([-facadeVocab.roofDefaults.japanese.overhang_cm, frame.roofZ]);
    expect(concept.elevation.parapet).toBeNull();
  });

  it('vật liệu, màu và lan can theo phiếu; màu chính lấy đúng mã hex của danh mục', () => {
    expect(concept.materials.find((m) => m.where === 'body')).toMatchObject({
      material: 'son_nuoc',
      colour: 'ghi_bac',
    });
    expect(concept.palette.primary_hex).toBe(facadeVocab.colours.ghi_bac!.hex);
    expect(concept.balconies?.every((b) => b.railing === 'sat_hop')).toBe(true);
  });

  it('vùng cửa chính mô hình không khai thì phiếu thêm vào, kèm kiểu cửa KHOÁ', () => {
    expect(concept.materials.find((m) => m.where === 'main_door')).toMatchObject({
      material: 'nhom_kinh_he',
      colour: 'den',
    });
    expect(concept.openings_style).toEqual({
      main_door_type: 'bon_canh',
      side_door_type: null,
      glass: 'phan_quang',
      garage_door_type: null,
    });
  });

  it('bảng vật liệu nói ra cửa chính và kiểu cửa bằng chữ tiếng Việt', () => {
    const legend = facadeLegend(concept, facadeVocab);
    expect(legend).toContainEqual(
      expect.objectContaining({ label: 'Cửa chính', value: 'Nhôm kính hệ (Xingfa…), đen' }),
    );
    expect(legend).toContainEqual(
      expect.objectContaining({ label: 'Kiểu cửa chính', value: '4 cánh (2 cố định, 2 mở)' }),
    );
    expect(legend).toContainEqual(
      expect.objectContaining({ label: 'Kính cửa sổ', value: 'Kính phản quang' }),
    );
  });

  it('đánh dấu dòng nào kỹ sư đã chọn — phần còn lại là AI đề xuất', () => {
    const keys = briefKeys(filled);
    const legend = facadeLegend(concept, facadeVocab);
    const mine = legend.filter((row) => keys.has(row.key)).map((row) => row.key);
    expect(mine).toEqual(
      expect.arrayContaining(['roof', 'body', 'main_door', 'main_door_type', 'railing_type']),
    );
    // Phần đế: kỹ sư để trống, mô hình khai — là đề xuất của AI.
    expect(keys.has('base')).toBe(false);
    expect(legend.some((row) => row.key === 'base')).toBe(true);
  });

  it('kỹ sư chọn «không làm cổng» thì bỏ cổng dù mô hình khai', () => {
    const villa = facadeFrame(shiftBack(VILLA_PLAN, 500), norms, outdoor);
    const noGate = brief((b) => {
      b.gate.wanted = false;
    });
    const merged = mergeFacade(
      villa,
      VILLA_PROPOSAL,
      facadeVocab,
      { planRef: PLAN_REF, generator: GENERATOR },
      noGate,
    );
    expect(merged.gate).toBeNull();
    expect(merged.fence).not.toBeNull();
  });
});

describe('Phép kiểm theo phiếu — chỉ thứ chương trình không tự làm được', () => {
  const frame = facadeFrame(TOWNHOUSE_PLAN, norms, outdoor);

  it('kỹ sư chọn trang trí mà ý tưởng thiếu loại ấy thì bắt mô hình làm lại', () => {
    const issues = checkFacade(
      TOWNHOUSE_PROPOSAL,
      frame,
      facadeVocab,
      brief((b) => {
        b.decorations = ['planter', 'louvre'];
      }),
    );
    expect(issues.join(' ')).toMatch(/bồn cây \(planter\)/);
    // Lam đã có trong ý tưởng mẫu — không bị nêu.
    expect(issues.join(' ')).not.toMatch(/louvre/);
  });

  it('mục chương trình tự áp (mái, vật liệu, màu) lệch thì KHÔNG bắt gọi lại — hàm ghép sửa', () => {
    const issues = checkFacade(
      TOWNHOUSE_PROPOSAL,
      frame,
      facadeVocab,
      brief((b) => {
        b.roof.type = 'gable';
        b.surfaces.body = { material: 'da_granite', colour: 'den' };
      }),
    );
    expect(issues).toEqual([]);
  });

  it('kỹ sư muốn có cổng mà ý tưởng để trống cổng thì bị bắt (nhà có sân trước)', () => {
    const villa = facadeFrame(shiftBack(VILLA_PLAN, 500), norms, outdoor);
    const issues = checkFacade(
      { ...VILLA_PROPOSAL, gate: null },
      villa,
      facadeVocab,
      brief((b) => {
        b.gate.wanted = true;
      }),
    );
    expect(issues.join(' ')).toMatch(/yêu cầu có cổng/);
  });
});

/*
 * Haan, 20/09/2026: «bản vẽ mặt bằng vẽ phòng để xe ở bên phải nhưng bản vẽ mặt đứng thì không có
 * lối vào phòng để xe cho ô tô… hai bản vẽ không được phép mâu thuẫn nhau».
 *
 * Đây là luật CỨNG chứ không phải thói quen nghề (T49 cho phép chặn khi «không đi được»): xe không
 * vào nổi phòng để xe là hai tờ vẽ của cùng một ngôi nhà nói ngược nhau.
 */
describe('Đồng bộ với mặt bằng — lối vào phải đi được (T64)', () => {
  // Nhà phố có cửa để xe trên mặt tiền; lùi khối nhà để có sân trước, không thì cổng và rào bị bỏ.
  const yard = facadeFrame(shiftBack(TOWNHOUSE_PLAN, 400), norms, outdoor);
  const garage = yard.openings.find((o) => o.kind === 'garage');
  const withFence = (over: Partial<AiFacadeProposal>): AiFacadeProposal => ({
    ...TOWNHOUSE_PROPOSAL,
    fence: { material: 'son_nuoc', colour: 'trang', h: 160 },
    ...over,
  });

  it('mặt bằng có cửa để xe mà ý tưởng chỉ có rào, không cổng: bắt làm lại', () => {
    expect(garage).toBeDefined();
    const issues = checkFacade(withFence({ gate: null }), yard, facadeVocab, null);
    expect(issues.join(' ')).toMatch(/không có cổng — không có lối vào nhà/);
  });

  it('cổng hẹp hơn cửa để xe: nói thẳng là ô tô không vào được', () => {
    const issues = checkFacade(
      withFence({
        gate: {
          type: 'swing',
          material: 'thep_son_tinh_dien',
          colour: 'den',
          w: Math.max(1, garage!.w - 50),
          h: 180,
        },
      }),
      yard,
      facadeVocab,
      null,
    );
    expect(issues.join(' ')).toMatch(/ô tô không vào được phòng để xe/);
  });

  it('cổng đủ rộng thì không bắt lỗi gì về lối vào', () => {
    const issues = checkFacade(
      withFence({
        gate: {
          type: 'swing',
          material: 'thep_son_tinh_dien',
          colour: 'den',
          w: garage!.w + 40,
          h: 180,
        },
      }),
      yard,
      facadeVocab,
      null,
    );
    expect(issues.join(' ')).not.toMatch(/lối vào|ô tô/);
  });

  it('nhà sát ranh mặt tiền (không sân trước) thì không kiểm cổng rào', () => {
    const noYard = facadeFrame(TOWNHOUSE_PLAN, norms, outdoor);
    expect(noYard.frontYard).toBe(false);
    const issues = checkFacade(withFence({ gate: null }), noYard, facadeVocab, null);
    expect(issues.join(' ')).not.toMatch(/lối vào/);
  });
});

describe('Số đo của phiếu — kiểm lúc LƯU vì nó đi thẳng vào khung', () => {
  it('số ngoài khoảng dựng được bị bắt, nói rõ khoảng', () => {
    const issues = checkFacadeBriefCodes(
      brief((b) => {
        b.roof.parapet_cm = 300;
        b.gate.h_cm = 900;
        b.fence.h_cm = 1000;
      }),
      facadeVocab,
    );
    expect(issues.join(' ')).toMatch(/Tường chắn mái cao: 300 cm, phải trong khoảng 0–200 cm/);
    expect(issues.join(' ')).toMatch(/Cổng cao: 900 cm/);
    expect(issues.join(' ')).toMatch(/Tường rào cao: 1000 cm/);
  });

  it('mã của loại mái, kiểu cổng và trang trí cũng phải có trong danh mục', () => {
    const issues = checkFacadeBriefCodes(
      { ...emptyFacadeBrief(), decorations: ['khong_co_that'] } as unknown as AiFacadeBrief,
      facadeVocab,
    );
    expect(issues.join(' ')).toMatch(/Chi tiết trang trí: mã «khong_co_that»/);
  });
});

describe('Khối yêu cầu trong lời dẫn', () => {
  it('mục đã điền ghi REQUIRED kèm mã; mục trống gộp vào «Left to you»', () => {
    const text = facadeRequirementsText(
      brief((b) => {
        b.roof.type = 'japanese';
        b.main_door.material = 'nhom_kinh_he';
        b.notes = 'Mặt tiền nhìn ra công viên.';
      }),
      facadeVocab,
    );
    expect(text).toContain('- REQUIRED roof type: japanese');
    expect(text).toContain('- REQUIRED main_door material: nhom_kinh_he (aluminium-framed glass)');
    expect(text).toMatch(/Left to you: [^\n]*roof material/);
    expect(text).toContain('Mặt tiền nhìn ra công viên.');
  });

  it('chưa có phiếu thì nói rõ mọi lựa chọn là của mô hình', () => {
    expect(facadeRequirementsText(null, facadeVocab)).toMatch(/every choice is yours/);
  });

  it('nhà sát ranh mặt tiền: không gửi yêu cầu cổng, rào — khung đã nói phải để trống', () => {
    const filled = brief((b) => {
      b.gate.wanted = true;
      b.gate.h_cm = 180;
      b.fence.h_cm = 160;
    });
    const noYard = facadeRequirementsText(filled, facadeVocab, { frontYard: false });
    expect(noYard).not.toMatch(/gate/);
    expect(noYard).not.toMatch(/fence/);
    // Có sân trước thì vẫn gửi như cũ.
    expect(facadeRequirementsText(filled, facadeVocab, { frontYard: true })).toContain(
      'REQUIRED gate: yes, draw a gate',
    );
  });

  it('mái dốc: không gửi yêu cầu tường chắn mái — hàm ghép bỏ nó', () => {
    const text = facadeRequirementsText(
      brief((b) => {
        b.roof.type = 'japanese';
        b.roof.parapet_cm = 90;
      }),
      facadeVocab,
    );
    expect(text).not.toMatch(/parapet/);
  });

  it('ghi chú của kỹ sư đi qua bộ lược danh tính trước khi ra khỏi máy chủ', () => {
    const text = facadeRequirementsText(
      brief((b) => {
        b.notes = 'Gọi 0912345678 hoặc a@b.vn để chốt màu.';
      }),
      facadeVocab,
    );
    expect(text).not.toContain('0912345678');
    expect(text).not.toContain('a@b.vn');
    expect(text).toContain('để chốt màu');
  });
});

describe('Bộ vẽ theo kiểu cửa của phiếu', () => {
  const concept = mergeFacade(
    facadeFrame(shiftBack(VILLA_PLAN, 500), norms, outdoor),
    VILLA_PROPOSAL,
    facadeVocab,
    { planRef: PLAN_REF, generator: GENERATOR },
  );
  const leafLines = (svg: string) => (svg.match(/class="dl"/g) ?? []).length;
  const base = { style, railingHeightCm: 110 };

  it('cửa chính 4 cánh vẽ ba nét chia, thay vì một nét của cửa hai cánh mặc định', () => {
    const plain = renderElevationSheet(concept, base).svg;
    const four = renderElevationSheet(concept, {
      ...base,
      openingStyles: { main: 4, side: null, garage: null },
    }).svg;
    expect(leafLines(four) - leafLines(plain)).toBe(2);
  });

  it('cửa để xe kiểu mở quay vẽ một nét giữa thay cho nan cửa cuốn', () => {
    const plain = renderElevationSheet(concept, base).svg;
    const swing = renderElevationSheet(concept, {
      ...base,
      openingStyles: { main: null, side: null, garage: 'mo_quay' },
    }).svg;
    // Cửa cuốn mặc định: 5 nan; mở quay: 1 nét.
    expect(leafLines(plain) - leafLines(swing)).toBe(4);
  });
});

/*
 * Lỗi đã xảy ra thật (20/09/2026): kỹ sư tick 7 ô «Chi tiết trang trí», phiếu bị từ chối bằng câu
 * «Phiếu yêu cầu chưa đúng. Kiểm tra lại các ô đã điền» — không nói ô nào. Nguyên nhân: hợp đồng
 * chặn `maxItems: 6`, đặt khi danh mục còn 9 mã, và không gì buộc hai con số ấy đi cùng nhau.
 *
 * Đây là kiểu hỏng của một CON SỐ VIẾT TAY nằm cách xa thứ nó nói về: thêm mã vào danh mục thì
 * biểu mẫu hiện thêm ô tick, còn trần thì đứng yên. Phép thử này buộc chúng đi cùng.
 */
describe('Danh mục trang trí và hợp đồng phiếu phải đi cùng nhau', () => {
  const schema = JSON.parse(read('contracts/ai-facade-brief.schema.json')) as {
    properties: { decorations: { maxItems: number; items: { enum: string[] } } };
  };
  const kinds = Object.keys(facadeVocab.elements);

  it('mã trong hợp đồng đúng bằng mã trong danh mục', () => {
    expect([...schema.properties.decorations.items.enum].sort()).toEqual([...kinds].sort());
  });

  it('tick HẾT mọi ô vẫn lưu được — trần không được thấp hơn số mã', () => {
    expect(schema.properties.decorations.maxItems).toBeGreaterThanOrEqual(kinds.length);
    const full = { ...emptyFacadeBrief(), decorations: kinds };
    expect(aiFacadeBriefSchema.safeParse(full).success).toBe(true);
  });
});

/*
 * Mục khảo sát LAN CAN (20/09/2026 — Haan: «thêm 1 mục khảo sát cho lan can: vật liệu, chiều cao»).
 *
 * Chiều cao lan can là số duy nhất của nhóm Lan can mà thước chấm đo (R1), và nó do CHƯƠNG TRÌNH
 * đặt — trước đây chỉ lấy từ `kb/construction_norms.yaml`, nên một hồ sơ muốn khác là không có
 * đường nào. Bộ này canh chỗ dễ hỏng nhất: tờ vẽ và điểm phải đọc CÙNG một con số.
 */
describe('Lan can: vật liệu và chiều cao lấy từ phiếu', () => {
  const quality = parseFacadeQuality(read('kb/facade_quality.yaml'));
  const frame = facadeFrame(shiftBack(VILLA_PLAN, 500), norms, outdoor);
  const conceptWith = (brief: AiFacadeBrief | null) =>
    mergeFacade(
      frame,
      VILLA_PROPOSAL,
      facadeVocab,
      { planRef: PLAN_REF, generator: GENERATOR },
      brief,
    );

  const briefWith = (over: Partial<AiFacadeBrief['balcony']>): AiFacadeBrief => {
    const b = emptyFacadeBrief();
    return { ...b, balcony: { ...b.balcony, ...over } };
  };

  it('phiếu trống thì ý tưởng không khai chiều cao — mọi nơi lùi về quy ước cấu tạo', () => {
    expect(conceptWith(null).elevation.railing_h_cm ?? null).toBeNull();
  });

  it('kỹ sư điền 90 cm thì ý tưởng mang đúng 90, và tờ vẽ dựng lan can cao 90', () => {
    const concept = conceptWith(briefWith({ h_cm: 90 }));
    expect(concept.elevation.railing_h_cm).toBe(90);
    expect(aiFacadeConceptSchema.safeParse(concept).success).toBe(true);

    // Đo trên chính tờ vẽ: mảng lan can cao bao nhiêu đơn vị giấy ở 90 so với ở 110.
    const railingHeight = (h: number) => {
      const svg = renderElevationSheet(concept, {
        style: parseSheetStyle(read('kb/sheet_style.yaml')),
        railingHeightCm: h,
      }).svg;
      const m = /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)"[^>]*class="rl"/.exec(
        svg,
      );
      return m ? Number(m[1]) : null;
    };
    const low = railingHeight(90);
    const high = railingHeight(110);
    expect(low).not.toBeNull();
    expect(low!).toBeLessThan(high!);
  });

  it('thước chấm đo đúng con số của phiếu: 90 đạt, 110 chỉ đạt một phần', () => {
    const concept = conceptWith(briefWith({ h_cm: 90 }));
    const score = (h: number | null) =>
      scoreFacade({ concept, quality, vocab: facadeVocab, railingCm: h }).criteria.find(
        (c) => c.code === 'R1',
      )!;
    expect(score(concept.elevation.railing_h_cm ?? null).score).toBe(1);
    expect(score(110).score).toBe(0.5);
  });

  it('vật liệu lan can của phiếu ghi đè vùng `railing` của mô hình', () => {
    const concept = conceptWith(briefWith({ material: 'sat_my_thuat', colour: 'den' }));
    const zone = concept.materials.find((m) => m.where === 'railing');
    expect(zone?.material).toBe('sat_my_thuat');
    expect(zone?.colour).toBe('den');
  });

  it('mã vật liệu lạ bị bắt ngay lúc lưu phiếu', () => {
    const issues = checkFacadeBriefCodes(briefWith({ material: 'khong_co_that' }), facadeVocab);
    expect(issues.join(' ')).toMatch(/Vật liệu lan can/);
  });

  it('chiều cao lan can KHÔNG đi vào khối yêu cầu gửi mô hình — bộ vẽ đặt số ấy', () => {
    const text = facadeRequirementsText(briefWith({ h_cm: 90 }), facadeVocab, undefined);
    expect(text).not.toMatch(/\b90\b/);
  });
});
