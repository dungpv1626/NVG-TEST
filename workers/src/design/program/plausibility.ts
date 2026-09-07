/**
 * Soát tính HỢP LÝ NGHỀ NGHIỆP của chương trình không gian đã soạn. HÀM THUẦN.
 *
 * Nguồn quy tắc: `kb/program_plausibility.yaml` (xem đầu tệp đó để biết vì sao cần tầng soát
 * thứ ba, tách khỏi `rules/` và `space_norms.yaml`).
 *
 * Bước này chạy SAU khi chương trình đã soạn xong và soát chính KẾT QUẢ, không soát đầu vào.
 * Lý do nó tồn tại: quy chuẩn đúng và chuẩn nghề đúng vẫn cho ra kết quả vô lý được. Bếp 6 m²
 * không vi phạm gì cả — nó chỉ vô lý khi đặt cạnh một căn nhà 360 m². Cái sai nằm ở QUAN HỆ
 * giữa các con số, mà không tầng nào ở trên nhìn được quan hệ đó.
 *
 * Một bản thực thi, hai nơi dùng: kiểm thử hồi quy, và cảnh báo hiện thẳng cho kiến trúc sư.
 * Hai bản riêng sẽ lệch nhau đúng vào ngày ai đó chỉnh một ngưỡng.
 */

import { load as parseYaml } from 'js-yaml';
import { ROOM_LABEL, type SpaceProgram } from '@nvg/shared/design';

export class PlausibilityError extends Error {
  readonly retryable = false;
}

export type PlausibilitySeverity = 'error' | 'warning';

export interface PlausibilityFinding {
  id: string;
  severity: PlausibilitySeverity;
  /** Câu tiếng Việt đã điền số, hiện thẳng cho người dùng (CGD 5.5). */
  message: string;
}

type Check =
  | {
      id: string;
      kind: 'not_at_minimum';
      severity: PlausibilitySeverity;
      message: string;
      exempt: string[];
    }
  | {
      id: string;
      kind: 'min_share_of_floor';
      severity: PlausibilitySeverity;
      message: string;
      room: string;
      share: number;
      floor_m2: number;
      floor_max_share: number;
      cap_m2: number;
    }
  | {
      id: string;
      kind: 'at_least';
      severity: PlausibilitySeverity;
      message: string;
      room: string;
      than: string;
    }
  | {
      id: string;
      kind: 'ratio_of_floor';
      severity: PlausibilitySeverity;
      message: string;
      room: string;
      min: number;
      max: number;
    }
  | {
      id: string;
      kind: 'floor_fill';
      severity: PlausibilitySeverity;
      message: string;
      min: number;
      max: number;
    }
  | {
      id: string;
      kind: 'at_most_one';
      severity: PlausibilitySeverity;
      message: string;
      rooms: string[];
    };

export interface PlausibilityRules {
  version: string;
  checks: Check[];
}

const KINDS = new Set([
  'not_at_minimum',
  'min_share_of_floor',
  'at_least',
  'ratio_of_floor',
  'floor_fill',
  'at_most_one',
]);

export function parsePlausibilityRules(yaml: string): PlausibilityRules {
  const doc = parseYaml(yaml) as Partial<PlausibilityRules> | null;
  if (!doc || typeof doc !== 'object')
    throw new PlausibilityError('kb/program_plausibility.yaml rỗng.');
  if (!Array.isArray(doc.checks) || doc.checks.length === 0) {
    throw new PlausibilityError('kb/program_plausibility.yaml không khai mục `checks` nào.');
  }
  for (const check of doc.checks) {
    // Mã soát lạ đi qua im lặng là tệ nhất: tệp trông như đang canh, mà không canh gì.
    if (!KINDS.has(check.kind)) {
      throw new PlausibilityError(`Phép soát "${check.id}" khai kind lạ: ${check.kind}.`);
    }
    if (check.severity !== 'error' && check.severity !== 'warning') {
      throw new PlausibilityError(`Phép soát "${check.id}" khai severity lạ: ${check.severity}.`);
    }
  }
  return { version: String(doc.version ?? '0'), checks: doc.checks };
}

const label = (type: string) => ROOM_LABEL[type] ?? type;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Điền số vào câu mẫu. Khoá thiếu để nguyên `{ten}` — thấy ngay là mẫu viết sai. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export function checkPlausibility(
  program: SpaceProgram,
  rules: PlausibilityRules,
  /**
   * Mã không gian có diện tích do NGƯỜI khai hoặc DỮ LIỆU đo ấn định (`fixedArea` của engine).
   * Phép soát `not_at_minimum` bỏ qua chúng: câu "đã bị cắt cho vừa sàn" nói về phòng bị bước
   * ép cắt, còn khách khai bếp 6 m² là một quyết định — nói ngược lại là nói sai (rà soát
   * 08/09/2026).
   */
  fixedIds: ReadonlySet<string> = new Set(),
): PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  const spaces = program.spaces;
  const allocation = program.floor_allocation ?? [];
  const total = allocation.reduce((sum, f) => sum + (f.usable_area_m2 ?? 0), 0);
  const areaOf = (s: SpaceProgram['spaces'][number]) => s.target_area_m2 ?? 0;
  const push = (check: Check, message: string) =>
    findings.push({ id: check.id, severity: check.severity, message });

  for (const check of rules.checks) {
    switch (check.kind) {
      case 'not_at_minimum': {
        const exempt = new Set(check.exempt);
        for (const s of spaces) {
          if (exempt.has(s.type) || fixedIds.has(s.id)) continue;
          const min = s.min_area_m2 ?? 0;
          if (min > 0 && areaOf(s) <= min + 0.05) {
            push(check, fill(check.message, { room: label(s.type), area: round1(areaOf(s)) }));
          }
        }
        break;
      }

      case 'min_share_of_floor': {
        // Đo theo sàn của CHÍNH TẦNG phòng đó nằm, không theo tổng sàn cả công trình. Bếp
        // không to ra vì nhà có thêm tầng: một căn bốn tầng và một căn hai tầng cùng mặt bằng
        // thì bếp bằng nhau. Đo theo tổng sàn là bắt nhà nhiều tầng phải có bếp phi lý.
        for (const s of spaces.filter((x) => x.type === check.room)) {
          const plate = allocation.find((f) => f.floor === s.floor)?.usable_area_m2 ?? 0;
          if (plate <= 0) continue;
          // Ba mức, và cả ba đều cần thiết:
          //  · `share`          — mức chính, co giãn theo mặt sàn.
          //  · `cap_m2`         — điểm BÃO HOÀ. Bếp 30 m² không phục vụ tốt hơn bếp 20 m²,
          //                       nên mặt sàn rất lớn không được đòi một cái bếp phi lý.
          //  · `floor_max_share` — ngưỡng SÀN cũng phải nhường mặt sàn. Trên lô 3,5 × 12 m
          //                       (42 m²/tầng) thì đòi bếp 8 m² và phòng khách 16 m² là đòi
          //                       57 % mặt sàn cho hai phòng, trong khi tầng đó còn phải có
          //                       thang, vệ sinh và lối đi. Thiếu vế này thì bộ đo báo lỗi ở
          //                       đúng những căn nhà nhỏ mà nó không giúp được gì.
          const floor = Math.min(check.floor_m2, plate * check.floor_max_share);
          const expected = Math.min(Math.max(plate * check.share, floor), check.cap_m2);
          if (areaOf(s) + 0.05 < expected) {
            push(
              check,
              fill(check.message, {
                room: label(s.type),
                area: round1(areaOf(s)),
                total: round1(plate),
                expected: round1(expected),
              }),
            );
          }
        }
        break;
      }

      case 'at_least': {
        // So cái NHỎ NHẤT của `room` với cái LỚN NHẤT của `than`: một căn có bốn phòng ngủ thì
        // phòng ngủ chính phải lớn hơn phòng ngủ lớn nhất, không phải lớn hơn trung bình.
        const mine = spaces.filter((s) => s.type === check.room).map(areaOf);
        const other = spaces.filter((s) => s.type === check.than).map(areaOf);
        if (!mine.length || !other.length) break;
        const lo = Math.min(...mine);
        const hi = Math.max(...other);
        if (lo + 0.05 < hi) {
          push(check, fill(check.message, { area: round1(lo), other: round1(hi) }));
        }
        break;
      }

      case 'ratio_of_floor': {
        for (const fa of allocation) {
          const usable = fa.usable_area_m2 ?? 0;
          if (usable <= 0) continue;
          const onFloor = spaces.filter((s) => s.floor === fa.floor && s.type === check.room);
          if (!onFloor.length) continue;
          const area = onFloor.reduce((sum, s) => sum + areaOf(s), 0);
          const ratio = area / usable;
          if (ratio + 0.001 < check.min || ratio > check.max + 0.001) {
            push(
              check,
              fill(check.message, {
                floor: fa.floor,
                area: round1(area),
                floor_area: round1(usable),
                pct: Math.round(ratio * 100),
              }),
            );
          }
        }
        break;
      }

      case 'floor_fill': {
        for (const fa of allocation) {
          const usable = fa.usable_area_m2 ?? 0;
          if (usable <= 0) continue;
          const allocated = fa.allocated_area_m2 ?? 0;
          const ratio = allocated / usable;
          // Dung sai theo M², không theo tỉ lệ: `allocated_area_m2` là tổng của các số ĐÃ LÀM
          // TRÒN tới 0,1 m², nên một tầng lấp đúng 100 % vẫn ra 100,1 % khi cộng lại. Một tỉ
          // lệ nhỏ tuyệt đối lại quá chặt với tầng nhỏ và quá lỏng với tầng lớn.
          if (allocated + 0.5 < usable * check.min || allocated > usable * check.max + 0.5) {
            push(
              check,
              fill(check.message, {
                floor: fa.floor,
                allocated: round1(fa.allocated_area_m2 ?? 0),
                floor_area: round1(usable),
                pct: Math.round(ratio * 100),
              }),
            );
          }
        }
        break;
      }

      case 'at_most_one': {
        for (const room of check.rooms) {
          const count = spaces.filter((s) => s.type === room).length;
          if (count > 1) push(check, fill(check.message, { room: label(room), count }));
        }
        break;
      }
    }
  }

  return findings;
}
