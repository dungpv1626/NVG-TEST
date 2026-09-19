/**
 * Kiến trúc sư sửa diện tích ĐỀ XUẤT của chương trình không gian trước khi chốt.
 *
 * Hàm thuần, dùng ở HAI nơi và phải cho cùng một kết quả ở cả hai:
 *
 *  · màn hình — soát ngay khi gõ, để lỗi hiện cạnh ô đang sửa chứ không phải sau khi bấm chốt;
 *  · Worker — nơi có thẩm quyền. Trình duyệt soát hộ cho nhanh, nhưng một lượt gọi thẳng vào
 *    tuyến chốt vẫn phải bị chặn ở đúng chỗ ấy.
 *
 * Chỉ sửa được DIỆN TÍCH. Có phòng nào và phòng nằm tầng nào là câu trả lời của khách, và nó
 * đã có chỗ khai ở Đầu bài (`required_spaces[].floor`) — mở thêm một chỗ sửa thứ hai ở đây là
 * hai nguồn nói khác nhau về cùng một căn nhà.
 *
 * Ba luật, theo đúng thứ tự thẩm quyền:
 *
 *  1. **Không xuống dưới tối thiểu.** Tối thiểu đã là số lớn nhất của khách, quy chuẩn và
 *     chuẩn nghề — xuống dưới là cãi một trong ba, và màn hình nói rõ là cãi ai.
 *  2. **Tổng một tầng không vượt sàn xây được.** Đó là trần pháp lý (khoảng lùi, mật độ).
 *  3. **Vượt mức rộng rãi của chuẩn nghề, hay nới sàn dùng chung** — được, nhưng nói ra.
 *     Đó là quyết định của kiến trúc sư, không phải lỗi.
 */

import { formatNumber } from '../format';
import { ROOM_LABEL } from './kb.generated';
import type { SpaceProgram } from './space-program.generated';

export type ProgramEdit = NonNullable<SpaceProgram['architect_edits']>[number];

export interface ProgramEditIssue {
  /** Rỗng khi lỗi thuộc cả tầng, không thuộc riêng một không gian. */
  spaceId: string | null;
  floor: number | null;
  message: string;
}

export interface AppliedProgramEdits {
  program: SpaceProgram;
  /** Chặn chốt. */
  errors: ProgramEditIssue[];
  /** Không chặn — quyết định của kiến trúc sư, nhưng phải nhìn thấy. */
  warnings: ProgramEditIssue[];
  /** Những chỗ sửa CÓ TÁC DỤNG, xếp theo mã — đúng thứ được lưu vào artifact. */
  edits: ProgramEdit[];
}

const MIN_SOURCE_TEXT: Record<string, string> = {
  brief: 'khách khai ở đầu bài',
  rule_pack: 'kinh nghiệm NVG',
  practice: 'chuẩn nghề',
};

/** Làm tròn tới 0,1 m² — cùng độ phân giải với bảng hiện ra. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Đọc ô diện tích người gõ. Nhận cả dấu phẩy thập phân kiểu Việt («12,5»), vì đó là cách
 * màn hình hiện số — bắt gõ dấu chấm là bắt người dùng đổi thói quen giữa chừng một bảng.
 */
export function parseAreaInput(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function applyProgramEdits(
  base: SpaceProgram,
  requested: readonly ProgramEdit[],
): AppliedProgramEdits {
  const errors: ProgramEditIssue[] = [];
  const warnings: ProgramEditIssue[] = [];
  const byId = new Map(base.spaces.map((s) => [s.id, s]));
  const label = (type: string) => ROOM_LABEL[type] ?? type;

  const accepted = new Map<string, number>();
  for (const edit of requested) {
    const space = byId.get(edit.space_id);
    if (!space) {
      errors.push({
        spaceId: edit.space_id,
        floor: null,
        message: `Không gian «${edit.space_id}» không còn trong chương trình — đầu bài đã đổi từ lần sửa trước. Bỏ chỗ sửa này hoặc sửa lại.`,
      });
      continue;
    }
    const name = `${label(space.type)} (tầng ${space.floor})`;
    if (!Number.isFinite(edit.target_area_m2) || edit.target_area_m2 <= 0) {
      errors.push({
        spaceId: space.id,
        floor: space.floor,
        message: `${name}: diện tích phải là một số lớn hơn 0.`,
      });
      continue;
    }
    const value = round1(edit.target_area_m2);
    if (value < space.min_area_m2) {
      const source = space.min_source ? ` — mức của ${MIN_SOURCE_TEXT[space.min_source]}` : '';
      errors.push({
        spaceId: space.id,
        floor: space.floor,
        message: `${name}: ${formatNumber(value, 1)} m² nhỏ hơn tối thiểu ${formatNumber(space.min_area_m2, 1)} m²${source}.`,
      });
      continue;
    }
    // Sửa về đúng số chương trình đề xuất thì không phải một chỗ sửa: lưu nó là đổi mã băm
    // của bản chốt mà nội dung không đổi gì.
    if (space.target_area_m2 != null && Math.abs(value - space.target_area_m2) < 0.05) continue;
    accepted.set(space.id, value);
  }

  const spaces = base.spaces.map((space) => {
    const value = accepted.get(space.id);
    if (value === undefined) return space;
    if (space.max_area_m2 != null && value > space.max_area_m2) {
      warnings.push({
        spaceId: space.id,
        floor: space.floor,
        message: `${label(space.type)} (tầng ${space.floor}): ${formatNumber(value, 1)} m² vượt mức rộng rãi ${formatNumber(space.max_area_m2, 1)} m² của chuẩn nghề.`,
      });
    }
    return {
      ...space,
      target_area_m2: value,
      // Cận trên không được thấp hơn diện tích đề xuất — miền rỗng là vô nghiệm ở bộ giải.
      max_area_m2: Math.max(space.max_area_m2 ?? value, value),
      target_source: 'architect' as const,
    };
  });

  // ── Tổng từng tầng ────────────────────────────────────────────────────────────────────
  const allocation = base.floor_allocation ?? [];
  const allocated = new Map<number, number>();
  for (const space of spaces) {
    allocated.set(space.floor, (allocated.get(space.floor) ?? 0) + (space.target_area_m2 ?? 0));
  }
  const usableBefore = Math.max(0, ...allocation.map((f) => f.usable_area_m2 ?? 0));
  let heaviest = 0;
  for (const floor of allocation) {
    const total = round1(allocated.get(floor.floor) ?? 0);
    heaviest = Math.max(heaviest, total);
    if (floor.buildable_area_m2 != null && total > floor.buildable_area_m2 + 0.05) {
      errors.push({
        spaceId: null,
        floor: floor.floor,
        message: `Tầng ${floor.floor}: tổng diện tích các không gian ${formatNumber(total, 1)} m² vượt sàn xây được ${formatNumber(floor.buildable_area_m2, 1)} m².`,
      });
    }
  }

  // Sàn dùng CHUNG cho mọi tầng (bộ giải dựng một hình bao), nên nới là nới cả công trình.
  const buildable = Math.min(
    ...allocation.map((f) => f.buildable_area_m2 ?? Number.POSITIVE_INFINITY),
  );
  const usableAfter =
    accepted.size > 0 && heaviest > usableBefore + 0.05
      ? round1(Math.min(heaviest, buildable))
      : usableBefore;
  if (usableAfter > usableBefore + 0.05) {
    warnings.push({
      spaceId: null,
      floor: null,
      message: `Sàn dùng chung của mọi tầng nới từ ${formatNumber(usableBefore, 1)} m² lên ${formatNumber(usableAfter, 1)} m² để chứa đủ diện tích đã sửa.`,
    });
  }
  if (accepted.size > 0) {
    // Chỉ nói về tầng CÓ chỗ sửa: tầng nhẹ vốn đã có phần sàn dồn vào khối giao thông từ
    // bước chương trình, và lặp lại chuyện đó ở mọi tầng mỗi lần gõ một ô là nhiễu.
    const touched = new Set(spaces.filter((s) => accepted.has(s.id)).map((s) => s.floor));
    for (const floor of allocation) {
      const spare = usableAfter - (allocated.get(floor.floor) ?? 0);
      if (touched.has(floor.floor) && spare > 0.5) {
        warnings.push({
          spaceId: null,
          floor: floor.floor,
          message: `Tầng ${floor.floor}: còn ${formatNumber(spare, 1)} m² sàn chưa gán cho không gian nào — bộ giải sẽ chia phần này vào các phòng của tầng.`,
        });
      }
    }
  }

  const edits = [...accepted]
    .map(([space_id, target_area_m2]) => ({ space_id, target_area_m2 }))
    .sort((a, b) => (a.space_id < b.space_id ? -1 : a.space_id > b.space_id ? 1 : 0));

  if (accepted.size === 0) {
    // Không đụng vào cả phần phân bổ sàn: bản chưa ai sửa phải băm ra ĐÚNG mã của bản
    // chương trình tính, kể cả khi cách làm tròn ở đây khác ở engine.
    const { architect_edits: _dropped, ...untouched } = base;
    return { program: untouched, errors, warnings, edits };
  }

  const program: SpaceProgram = {
    ...base,
    spaces,
    floor_allocation: allocation.map((floor) => ({
      ...floor,
      usable_area_m2: usableAfter,
      allocated_area_m2: round1(allocated.get(floor.floor) ?? 0),
    })),
  };
  program.architect_edits = edits;
  return { program, errors, warnings, edits };
}
