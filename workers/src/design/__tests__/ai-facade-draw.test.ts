/**
 * Tờ mặt đứng, ảnh neo và tệp DXF của mặt đứng (T59) — dựng từ ý tưởng viết tay.
 *
 * Cùng hai loại phép thử với `ai-draw.test.ts`: ảnh chụp vàng giữ tờ KHÔNG ĐỔI (và là thứ đem cho
 * Haan chấm), còn khẳng định hình học đo trên chính chuỗi đầu ra — đủ lỗ mở, cao độ đúng, chuỗi
 * kích thước cộng đúng tổng, ảnh neo không có khung tên.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { AI_DISCLAIMERS, aiFacadeConceptSchema } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { ANCHOR_FRAMES } from '../ai/draw/anchor';
import {
  levelLabel,
  renderElevationAnchor,
  renderElevationSheet,
  type ElevationOptions,
} from '../ai/draw/elevation-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import { renderFacadeDxf } from '../ai/dxf/facade-dxf';
import { parseLayerExport } from '../ai/dxf/layers';
import { facadeLegend, facadeNote } from '../ai/facade/describe';
import { facadeFrame } from '../ai/facade/frame';
import { mergeFacade, pitchedOutline } from '../ai/facade/merge';
import { TOWNHOUSE_PLAN } from './ai-plan-fixtures';
import {
  facadeVocab,
  norms,
  outdoor,
  PLAN_REF,
  TOWNHOUSE_FACADE,
  TOWNHOUSE_PROPOSAL,
  VILLA_FACADE,
} from './ai-facade-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

const style = parseSheetStyle(read('kb/sheet_style.yaml'));
const layers = parseLayerExport(read('kb/layer_mapping.yaml'));

const optionsFor = (concept: typeof TOWNHOUSE_FACADE): ElevationOptions => ({
  style,
  railingHeightCm: Math.round(norms.outdoor.railing_h_m * 100),
  legend: facadeLegend(concept, facadeVocab),
});

function textsOfClass(svg: string, cls: string): string[] {
  const matches = svg.matchAll(new RegExp(`<text[^>]*class="${cls}"[^>]*>([^<]*)</text>`, 'g'));
  return [...matches].map((match) => match[1] ?? '');
}

describe('ý tưởng mẫu đúng hợp đồng', () => {
  it('hai artifact ghép từ khung + ý tưởng qua được hợp đồng ai-facade-concept', () => {
    expect(aiFacadeConceptSchema.safeParse(TOWNHOUSE_FACADE).success).toBe(true);
    expect(aiFacadeConceptSchema.safeParse(VILLA_FACADE).success).toBe(true);
  });
});

describe('tờ mặt đứng — ảnh chụp vàng', () => {
  for (const [name, concept] of [
    ['mat-dung-nha-pho', TOWNHOUSE_FACADE],
    ['mat-dung-biet-thu', VILLA_FACADE],
  ] as const) {
    it(`giữ nguyên tờ "${name}"`, async () => {
      const result = renderElevationSheet(concept, optionsFor(concept));
      expect(result.notes).toEqual([]);
      await expect(result.svg).toMatchFileSnapshot(`./__snapshots__/${name}.svg`);
    });
  }
});

/*
 * Haan, 20/09/2026: «bản vẽ mặt bằng vẽ phòng để xe (có ô tô) ở bên phải nhưng bản vẽ mặt đứng thì
 * không có lối vào phòng để xe cho ô tô… hai bản vẽ không được phép mâu thuẫn nhau».
 *
 * Trước T64 bộ vẽ chỉ chừa chỗ cho CỔNG, nên nhà có cả cửa chính lẫn cửa để xe thì cổng đứng trước
 * một cái và hàng rào bịt kín cái còn lại. Đây không phải chuyện thẩm mỹ: một lối vào không đi được
 * là hai tờ vẽ của cùng một ngôi nhà nói ngược nhau.
 */
describe('tờ mặt đứng — hàng rào không bịt lối vào (T64)', () => {
  /** Khoảng [x0, x1] của mọi mảng rào/cổng trên tờ, theo đơn vị giấy. */
  const fenceRuns = (svg: string): Array<[number, number]> =>
    [...svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*class="ff"/g)].map(
      (m) => [Number(m[1]), Number(m[1]) + Number(m[2])] as [number, number],
    );

  it('không mảng rào nào cắt ngang cửa chính hay cửa để xe', () => {
    for (const concept of [TOWNHOUSE_FACADE, VILLA_FACADE]) {
      const svg = renderElevationSheet(concept, optionsFor(concept)).svg;
      // Mảng CỔNG được vẽ trước mọi mảng rào (`gateAndFence`), và nó được phép trùm lên lối mở —
      // mặt đứng là hình chiếu phẳng, cổng đứng trước nhà thì che thứ sau nó là đúng. Chỉ hàng RÀO
      // mới là thứ bịt đường.
      const runs = fenceRuns(svg).slice(concept.gate ? 1 : 0);
      if (runs.length === 0) continue;
      // Đổi toạ độ lỗ mở sang đơn vị giấy bằng chính hai mốc mà tờ vẽ dùng: mép trái và mép phải
      // của khối tầng dưới cùng. Không chép công thức tỷ lệ của bộ vẽ sang đây.
      const first = concept.elevation.levels[0]!;
      const body = svg.match(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*class="eo"/)!;
      const px0 = Number(body[1]);
      const scale = Number(body[2]) / (first.x1 - first.x0);
      const toPaper = (x: number) => px0 + (x - first.x0) * scale;

      for (const o of concept.openings_front) {
        if (o.level !== first.level || (o.kind !== 'door' && o.kind !== 'garage')) continue;
        const a = toPaper(o.x);
        const b = toPaper(o.x + o.w);
        for (const [ra, rb] of runs) {
          expect(rb > a + 0.01 && ra < b - 0.01).toBe(false);
        }
      }
    }
  });
});

describe('tờ mặt đứng — hình học', () => {
  const sheet = renderElevationSheet(TOWNHOUSE_FACADE, optionsFor(TOWNHOUSE_FACADE)).svg;

  it('mỗi lỗ mở của mặt bằng có đúng một khung trên mặt đứng', () => {
    const frames = sheet.match(/<rect[^>]*class="op"/g) ?? [];
    expect(frames).toHaveLength(TOWNHOUSE_FACADE.openings_front.length);
  });

  it('ghi cao độ theo quy ước hồ sơ: cốt vỉa hè, ±0.000, từng sàn, mặt mái, đỉnh tường chắn', () => {
    expect(textsOfClass(sheet, 'tlm')).toEqual([
      '-0.450',
      '±0.000',
      '+3.600',
      '+7.200',
      '+11.100',
      '+12.000',
    ]);
    expect(levelLabel(-45)).toBe('-0.450');
  });

  it('chuỗi kích thước chi tiết cộng đúng bằng chuỗi tổng, cả hai phương', () => {
    const dims = textsOfClass(sheet, 'td').map(Number);
    // Dọc: 450 + 3600 + 3600 + 3900 + 900 = 12450. Ngang: 500 + 3000 + 500 = 4000.
    const vertical = [450, 3600, 3600, 3900, 900];
    const horizontal = [500, 3000, 500];
    for (const [detail, total] of [
      [vertical, 12450],
      [horizontal, 4000],
    ] as const) {
      for (const value of detail) expect(dims).toContain(value);
      expect(detail.reduce((a, b) => a + b, 0)).toBe(total);
      expect(dims).toContain(total);
    }
  });

  it('lỗ mở sát mép vẫn giữ nguyên mép hình: chuỗi tổng bằng bề rộng mặt tiền', () => {
    // Cửa để xe kết thúc cách mép phải 3 cm. Gộp trạm sát nhau mà giữ trạm ĐẦU của cụm thì chuỗi
    // tổng in ra 3.970 mm trên một mặt tiền rộng 4.000 mm — sai số đo, không một dòng cảnh báo.
    const near = {
      ...TOWNHOUSE_FACADE,
      openings_front: TOWNHOUSE_FACADE.openings_front.map((o) =>
        o.kind === 'garage' ? { ...o, x: 50, w: 347 } : o,
      ),
    };
    const dims = textsOfClass(renderElevationSheet(near, optionsFor(near)).svg, 'td').map(Number);
    expect(dims).toContain(4000);
  });

  it('in câu cảnh báo bắt buộc, và vật liệu từng vùng thành ô khung tên bằng chữ tiếng Việt', () => {
    expect(sheet).toContain(AI_DISCLAIMERS.aiSheet);
    expect(textsOfClass(sheet, 'tbl')).toEqual(
      expect.arrayContaining(['THÂN NHÀ', 'MÁI', 'LAN CAN BAN CÔNG']),
    );
    expect(sheet).toContain('Sơn nước ngoại thất, trắng');
    expect(facadeNote(TOWNHOUSE_FACADE, facadeVocab)).toContain(
      'Thân nhà: sơn nước ngoại thất, trắng kem',
    );
  });

  it('không có kịch bản, liên kết ngoài hay bộ bắt sự kiện', () => {
    for (const concept of [TOWNHOUSE_FACADE, VILLA_FACADE]) {
      const svg = renderElevationSheet(concept, optionsFor(concept)).svg;
      expect(svg).not.toMatch(/<script|href=|\son[a-z]+=/i);
    }
  });

  it('nhà có sân trước thì vẽ cổng và rào; nhà sát ranh thì không', () => {
    const villa = renderElevationSheet(VILLA_FACADE, optionsFor(VILLA_FACADE)).svg;
    expect(VILLA_FACADE.gate).not.toBeNull();
    expect(VILLA_FACADE.fence).not.toBeNull();
    // Cổng canh giữa cửa để xe — cửa ấy sát mép phải, nên cổng dời vào trong cho đủ 3,6 m và rào
    // chỉ còn MỘT đoạn bên trái. Cả hai vẽ nét đứt (lớp `ff`) vì đứng trước nhà.
    const fences = (villa.match(/<rect[^>]*class="ff"/g) ?? []).length;
    expect(fences).toBe(1 + 1);
    // Lan can ban công vẫn là nét liền: nó thuộc mặt tiền, không đứng trước nhà.
    const railings = (villa.match(/<rect[^>]*class="rl"/g) ?? []).length;
    expect(railings).toBe(VILLA_FACADE.balconies?.length ?? 0);
    expect(TOWNHOUSE_FACADE.gate).toBeNull();
  });
});

describe('đường mái tự dựng', () => {
  const frame = facadeFrame(TOWNHOUSE_PLAN, norms, outdoor);

  it('mái hai dốc là tam giác cân, đua đúng khoảng đã khai hai bên', () => {
    const outline = pitchedOutline(frame, 'gable', 30, facadeVocab);
    const overhang = facadeVocab.roofDefaults.overhang_cm;
    expect(outline).toHaveLength(3);
    expect(outline[0]).toEqual([-overhang, frame.roofZ]);
    expect(outline[2]).toEqual([400 + overhang, frame.roofZ]);
    expect(outline[1]?.[0]).toBe(200);
  });

  it('độ dốc lớn trên nhà rộng không vẽ đỉnh mái vọt quá giới hạn', () => {
    const wide = { ...frame, levels: frame.levels.map((l) => ({ ...l, x0: 0, x1: 5000 })) };
    const outline = pitchedOutline(wide, 'hip', 60, facadeVocab);
    const rise = Math.max(...outline.map(([, z]) => z)) - frame.roofZ;
    expect(rise).toBe(facadeVocab.limits.roof_rise_max_cm);
  });

  it('mái bằng không có đường mái, lấy tường chắn mặc định khi mô hình để trống', () => {
    expect(TOWNHOUSE_FACADE.elevation.roof_outline).toBeUndefined();
    expect(TOWNHOUSE_FACADE.elevation.parapet).toBe(frame.parapetDefault);
  });

  it('ghép không đổi một lỗ mở nào của khung KHOÁ', () => {
    const concept = mergeFacade(frame, TOWNHOUSE_PROPOSAL, facadeVocab, {
      planRef: PLAN_REF,
      generator: TOWNHOUSE_FACADE.generator,
    });
    expect(concept.openings_front).toEqual(frame.openings);
  });
});

/*
 * Ba hình của hồ sơ thật mà bộ vẽ trước đây không dựng nổi (T63, 20/09/2026): vòm đầu cửa (M6),
 * ô tròn trang trí R700 (M3), sảnh trước mái dốc (M2, M4). Chúng từng nằm trong `chua_cham_duoc`
 * của thước chấm vì đúng lý do ấy.
 *
 * Phép thử đo HÌNH HỌC chứ không đếm thẻ: một cái vòm vẽ sai bán kính vẫn là một thẻ `path` có chữ
 * `A` trong đó. Cả ba đặt chung một bề rộng 200 cm để quy đổi ra giấy dùng chung một thước.
 */
describe('mảng trang trí có hình riêng — vòm, ô tròn, mái sảnh (T63)', () => {
  const W = 200;
  const concept = {
    ...TOWNHOUSE_FACADE,
    elevation: {
      ...TOWNHOUSE_FACADE.elevation,
      elements: [
        // Vòm nửa tròn: độ vồng đúng nửa bề rộng.
        { kind: 'arch', rect: [150, 250, 150 + W, 350], material_ref: null },
        // Vòm cung: độ vồng bằng một phần tư bề rộng, bán kính phải LỚN hơn nửa dây cung.
        { kind: 'arch', rect: [150, 500, 150 + W, 550], material_ref: null },
        // Khung bao CỐ Ý không vuông: 200 × 160. Cạnh ngắn phải quyết định đường kính.
        { kind: 'oculus', rect: [50, 600, 50 + W, 760], material_ref: null },
        { kind: 'porch_roof', rect: [0, 900, W, 1000], material_ref: null },
      ],
    },
  } as typeof TOWNHOUSE_FACADE;

  const svg = renderElevationSheet(concept, optionsFor(concept)).svg;
  const arcs = [...svg.matchAll(/<path class="el" d="M ([\d.-]+) ([\d.-]+) A ([\d.-]+) /g)];

  it('ý tưởng mang ba hình mới vẫn qua được hợp đồng', () => {
    expect(aiFacadeConceptSchema.safeParse(concept).success).toBe(true);
  });

  it('vòm nửa tròn có bán kính đúng nửa dây cung; vòm cung thì lớn hơn', () => {
    expect(arcs).toHaveLength(2);
    const [half, segment] = arcs;
    // Dây cung trên giấy = bề rộng 200 cm quy đổi; suy ra từ chính hai đầu cung của vòm nửa tròn.
    const chord = 2 * Number(half![3]);
    expect(Number(segment![3])).toBeGreaterThan(chord / 2);
    // Vòm cung độ vồng w/4: r = (w²/4 + h²) / 2h = (10000 + 2500) / 100 = 125 cm = 0,625 dây cung.
    expect(Number(segment![3]) / chord).toBeCloseTo(0.625, 3);
  });

  it('ô tròn là đường tròn lớn nhất VỪA trong khung bao, không phải hình bầu dục', () => {
    const circle = /<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.-]+)" class="el"/.exec(svg);
    expect(circle).not.toBeNull();
    // Khung bao 200 × 160 → bán kính 80 cm = 0,4 lần dây cung 200 cm của vòm nửa tròn.
    const chord = 2 * Number(arcs[0]![3]);
    expect(Number(circle![3]) / chord).toBeCloseTo(0.4, 3);
  });

  it('mái sảnh là tam giác khép kín, nóc ở giữa', () => {
    const tri =
      /<path class="el" d="M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) Z"/.exec(
        svg,
      );
    expect(tri).not.toBeNull();
    const [x0, , xTop, , x1] = [1, 2, 3, 4, 5, 6].map((i) => Number(tri![i]));
    expect(xTop).toBeCloseTo((x0! + x1!) / 2, 3);
    // Nóc phải CAO hơn hai chân: trên giấy, cao hơn nghĩa là y nhỏ hơn.
    expect(Number(tri![4])).toBeLessThan(Number(tri![2]));
  });

  it('tệp DXF giữ đủ cung và đường tròn, cùng lớp hatch với mảng trang trí khác', () => {
    const dxf = renderFacadeDxf(concept, { ...optionsFor(concept), layers });
    // DXF R12 xuống dòng bằng CRLF.
    expect(dxf).toContain('\r\nARC\r\n');
    expect(dxf).toContain('\r\nCIRCLE\r\n');
    // Không rơi ra lớp mặc định 0: mất lớp là tệp CAD không in đúng nét.
    expect(dxf.split('\r\nCIRCLE\r\n')[1]).toContain(layers.hatch.layer);
  });
});

describe('ảnh neo mặt đứng', () => {
  it('không có khung tên, đúng một khung ảnh chuẩn, nền trắng', () => {
    for (const concept of [TOWNHOUSE_FACADE, VILLA_FACADE]) {
      const anchor = renderElevationAnchor(concept, optionsFor(concept));
      expect(anchor.svg).not.toMatch(/TÊN BẢN VẼ|Hạng mục|HẠNG MỤC/);
      expect(anchor.svg).not.toContain('class="fr"');
      expect(ANCHOR_FRAMES).toContainEqual({ widthPx: anchor.widthPx, heightPx: anchor.heightPx });
      expect(anchor.svg).toContain('fill="#ffffff"');
    }
  });
});

describe('tệp DXF mặt đứng', () => {
  // Chữ trong DXF mã hoá `\U+XXXX` — giải mã trước khi so với chữ tiếng Việt.
  const dxf = renderFacadeDxf(TOWNHOUSE_FACADE, {
    ...optionsFor(TOWNHOUSE_FACADE),
    layers,
  }).replace(/\\U\+([0-9A-F]{4})/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));

  it('mảng trang trí nằm ở lớp hatch, khối nhà ở lớp tường — tên lớp lấy từ kb', () => {
    expect(dxf).toContain(layers.hatch.layer);
    expect(dxf).toContain(layers.wall.layer);
  });

  it('mang tên tờ, cảnh báo bắt buộc và cao độ', () => {
    expect(dxf).toContain('Mặt đứng mặt tiền');
    expect(dxf).toContain(AI_DISCLAIMERS.aiSheet);
    expect(dxf).toContain('+11.100');
  });
});
