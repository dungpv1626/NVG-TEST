/**
 * Đầu bài cắt theo lời gọi AI (T114, `brief/slice.ts`).
 *
 * Canh chỗ hỏng im lặng của việc gắn nhãn: mô hình vẫn trả lời khi nhận thừa hay thiếu thông tin,
 * chỉ trả lời kém đi. Ba chiều:
 *  · lời dẫn MẶT BẰNG không mang phong cách / ghi chú phong cách;
 *  · lời dẫn MẶT ĐỨNG không mang thành viên gia đình, phòng, thang máy, khảo sát hiện trạng — nhưng
 *    có phong cách, hướng nhà, sân, cốt nền mà mặt ngoài cần;
 *  · ngữ cảnh PHỐI CẢNH chỉ thấy những câu gắn `perspective`.
 * Và digest gốc không bị đụng: bộ kiểm đầu bài, bộ xếp vẫn đọc bản đầy đủ.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyBriefFormOverlay, BRIEF_FORM, type AiBriefDigest } from '@nvg/shared/design';
import { briefNarrative } from '../brief/narrative';
import { digestFor } from '../brief/slice';
import { facadeBrief } from '../ai/facade/propose';
import { emptyFacadeBrief, facadeBriefOfArtifact, sameJson } from '../ai/facade/brief';
import { parseVocabulary } from '../kb/vocabulary';
import { digestOf, VILLA } from './ai-digest-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');
const roomLabels = Object.fromEntries(
  parseVocabulary(read('kb/room_vocabulary.yaml')).types.map((t) => [t.code, t.vi]),
);

/** Biệt thự mẫu có đủ câu của cả ba phần. Giả lập, không lấy từ hồ sơ khách. */
function rich(): AiBriefDigest {
  const digest = digestOf(VILLA);
  return {
    ...digest,
    style: 'indochine',
    site: {
      ...digest.site,
      orientation: 'DN',
      harsh_sun_sides: ['left'],
      road_width_m: 8,
      adjacent: { front: 'duong', back: 'nha_hang_xom', left: null, right: null },
    },
    massing: { ...(digest.massing ?? {}), yards: ['san_truoc'], indoor_outdoor: 'mo_toi_da' },
    vertical: { elevator: 'lam_ngay' },
    entrance: { floor_above_road_m: 0.6, steps_from_yard: true },
    parking: { cars: 2, motorbikes: 2 },
    finishing_level: 'kha',
    custom: [{ label: 'Có bếp nướng ngoài trời không', value: 'Có' }],
    free_text: {
      design_task: 'Nhà cho ba thế hệ.',
      functional_needs: null,
      style_note: 'Mái ngói, gỗ tối màu, gợi nhà Đông Dương.',
      site_condition: null,
    },
    survey: {
      land_width_m: 15.1,
      land_depth_m: 19.9,
      measurement_notes: 'Mốc ranh sau lệch 20 cm.',
    },
  } as AiBriefDigest;
}

describe('Lời dẫn mặt bằng', () => {
  const text = briefNarrative(rich(), { roomLabels });

  it('không còn phong cách và ghi chú phong cách', () => {
    expect(text).not.toMatch(/Phong cách mong muốn/);
    expect(text).not.toContain('Mái ngói, gỗ tối màu');
  });

  it('vẫn đủ phần mặt bằng cần: gia đình, phòng, thang máy, khảo sát, câu tự thêm', () => {
    expect(text).toMatch(/Ông bà: 2 người/);
    expect(text).toContain(roomLabels.altar_room);
    expect(text).toContain('Mốc ranh sau lệch 20 cm.');
    expect(text).toContain('Có bếp nướng ngoài trời không: Có');
    expect(text).toContain('Nhà cho ba thế hệ.');
  });
});

describe('Lời dẫn mặt đứng', () => {
  const sent = JSON.parse(facadeBrief(rich())) as Record<string, unknown>;

  it('có những câu mặt ngoài cần', () => {
    expect(sent.style).toBe('indochine');
    expect(sent.floors).toBe(2);
    expect(sent.finishing_level).toBe('kha');
    expect(sent.site).toMatchObject({ orientation: 'DN', harsh_sun_sides: ['left'] });
    expect(sent.massing).toMatchObject({ yards: ['san_truoc'], indoor_outdoor: 'mo_toi_da' });
    expect(sent.entrance).toMatchObject({ floor_above_road_m: 0.6, steps_from_yard: true });
    expect((sent.free_text as Record<string, unknown>).style_note).toContain('Mái ngói');
  });

  it('KHÔNG mang gia đình, phòng, thang, khảo sát, khoảng lùi, câu tự thêm mặt bằng', () => {
    for (const key of ['family', 'required_spaces', 'vertical', 'survey', 'custom', 'parking']) {
      expect(sent, key).not.toHaveProperty(key);
    }
    expect(sent.site).not.toHaveProperty('setback_required_m');
    expect(JSON.stringify(sent)).not.toContain('Nhà cho ba thế hệ.');
  });

  it('không mang ô trống — lời dẫn không phình vì khoá `null`', () => {
    expect(JSON.stringify(sent)).not.toContain('null');
  });
});

describe('Ngữ cảnh phối cảnh', () => {
  const d = digestFor(rich(), 'perspective');

  it('giữ hướng nhà, kích thước lô, hiện trạng bốn phía, số xe, phong cách', () => {
    expect(d.site.orientation).toBe('DN');
    expect(d.site.width_m).toBe(15);
    expect(d.site.adjacent?.back).toBe('nha_hang_xom');
    expect(d.parking?.cars).toBe(2);
    expect(d.style).toBe('indochine');
  });

  it('bỏ phòng, gia đình, khảo sát, thang máy', () => {
    expect(d.family).toEqual([]);
    expect(d.required_spaces).toEqual([]);
    expect(d.survey).toBeNull();
    expect(d.vertical?.elevator ?? null).toBeNull();
  });

  it('giữ cốt nền và sân — phối cảnh từ mặt đứng tải lên dựng khối nhà theo đầu bài (T114 Đợt 4b)', () => {
    expect(d.entrance?.floor_above_road_m).toBe(0.6);
  });
});

describe('Bản gốc không bị đụng', () => {
  it('digestFor trả bản sao — bộ kiểm đầu bài và bộ xếp vẫn thấy đủ', () => {
    const digest = rich();
    const before = JSON.stringify(digest);
    digestFor(digest, 'facade');
    digestFor(digest, 'perspective');
    briefNarrative(digest, { roomLabels });
    expect(JSON.stringify(digest)).toBe(before);
  });
});

describe('Câu hỏi tự thêm theo phần của mục chứa nó', () => {
  it('mục tự tạo ở phần Mặt đứng: câu trả lời đi vào mặt đứng, không vào mặt bằng', () => {
    const form = applyBriefFormOverlay(BRIEF_FORM, {
      version: 1,
      sections: [
        {
          id: 'mat_ngoai_them',
          custom: true,
          part: 'mat_dung',
          title: 'Thêm về mặt ngoài',
          fields: [
            { path: 'custom.den_hat', label: 'Đèn hắt mặt tiền', custom: { control: 'text' } },
          ],
        },
      ],
    });
    const digest = { ...rich(), custom: [{ label: 'Đèn hắt mặt tiền', value: 'Có, ánh vàng' }] };
    expect(digestFor(digest, 'facade', form).custom).toHaveLength(1);
    expect(digestFor(digest, 'plan', form).custom).toHaveLength(0);
  });
});

describe('Nguồn yêu cầu mặt đứng (T114)', () => {
  it('đầu bài có phần mặt đứng thì đọc từ đầu bài, phong cách lấy câu của đầu bài', () => {
    const brief = facadeBriefOfArtifact({
      kind: 'design_brief',
      payload: { ...VILLA, style: 'indochine', facade: { roof: { type: 'hip' } } },
    });
    expect(brief?.style).toBe('indochine');
    expect(brief?.roof.type).toBe('hip');
    expect(brief?.roof.material).toBeNull();
  });

  it('đầu bài chưa có phần mặt đứng thì không mang yêu cầu — lượt chạy lùi về phiếu riêng cũ', () => {
    expect(facadeBriefOfArtifact({ kind: 'design_brief', payload: VILLA })).toBeNull();
    const old = { ...emptyFacadeBrief(), style: 'hien_dai' as const };
    expect(facadeBriefOfArtifact({ kind: 'ai_facade_brief', payload: old })).toEqual(old);
  });
});

describe('Lưu yêu cầu mặt đứng: so nội dung, không so chuỗi', () => {
  it('cùng nội dung khác thứ tự khoá (jsonb của CSDL) vẫn là bằng nhau — không đẻ phiên bản thừa', () => {
    expect(
      sameJson(
        { type: 'hip', colour: null, pitch_deg: 30 },
        { pitch_deg: 30, type: 'hip', colour: null },
      ),
    ).toBe(true);
    expect(
      sameJson(
        { roof: { type: 'hip' }, decorations: ['canopy', 'arch'] },
        { decorations: ['canopy', 'arch'], roof: { type: 'hip' } },
      ),
    ).toBe(true);
    expect(sameJson({ roof: { pitch_deg: 30 } }, { roof: { pitch_deg: 25 } })).toBe(false);
    // Thứ tự MẢNG vẫn tính — danh sách trang trí là danh sách, không phải tập.
    expect(sameJson(['canopy', 'arch'], ['arch', 'canopy'])).toBe(false);
  });
});
