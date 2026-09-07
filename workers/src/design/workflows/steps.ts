/**
 * Năm bước của pipeline thiết kế, dưới dạng HÀM THUẦN.
 *
 * Nguồn: doc/design/02-architecture.md mục 2.3 và 2.5.
 *
 * "Mỗi layer là hàm thuần `(input_artifact, config) -> output_artifact`. Không đọc trạng
 * thái toàn cục, không ghi sang layer khác. Nhờ vậy regenerate một layer là chạy lại đúng
 * hàm đó với input cũ."
 *
 * Tách khỏi `design-pipeline.ts` (bản Cloudflare Workflow) vì tệp kia phải import
 * `cloudflare:workers` — chỉ tồn tại trong runtime Workers, kiểm thử bằng Node không nạp
 * được. Ranh giới này giữ cho phần nghiệp vụ kiểm thử được mà không cần dựng cả Worker.
 *
 * ⚠️ HAI trong sáu bước còn trả về STUB — dữ liệu đúng hợp đồng nhưng không phải kết quả
 * thật. Mỗi stub tự khai `stub: true` trong kết quả bước để không có cách nào nhầm nó với
 * kết quả thật ở lớp trên.
 *
 * Lớp 2 và Lớp 3a KHÔNG còn ở đây: bản thật nằm ở `../program/engine.ts` và
 * `../layout/intent.ts` vì chúng cần rule pack, chuẩn diện tích và bảng hiện trạng bốn phía —
 * quá nhiều đầu vào để nhét vừa chữ ký chung của tệp này.
 */

import {
  siteGeometry,
  type ArchModel,
  type DesignBrief,
  type FloorPlan,
  type LayoutIntent,
  type RenderResult,
  type SpaceProgram,
} from '@nvg/shared/design';
import type { ComputeBackend } from '../compute-backend';
import { parseArtifact } from '../contracts';
import {
  buildLayoutIntent,
  type BuildIntentArgs,
  type FaceNeed,
  type LayoutVariant,
  type MinSide,
  type Plate,
} from '../layout/intent';
import type { Face } from '../layout/site-context';

const SCHEMA_VERSION = '1.0.0';
// Dự phòng khi mặt bằng cũ chưa mang cao độ hay cửa chưa mang chiều cao — cùng giá trị với
// kb/construction_norms.yaml, nhưng đường chính là đọc từ FloorPlan.
const DEFAULT_STOREY_M = 3.6;
const DEFAULT_DOOR_H = 2.2;
const DEFAULT_WINDOW_H = 1.6;
const DEFAULT_PARAPET_M = 0.9;

export interface StepResult<T> {
  payload: T;
  /** `true` = kết quả tạm cho khung xương, KHÔNG phải kết quả thật của lớp đó. */
  stub: boolean;
}

/**
 * Layer 3a — ý đồ bố cục.
 *
 * Bản THẬT nằm ở `../layout/intent.ts` (bộ sinh tất định theo khung nhà ống). Hàm này chỉ
 * gói nó lại cho pipeline và kiểm hợp đồng ở đầu ra.
 *
 * Nó KHÔNG sinh toạ độ hay kích thước — nguyên tắc bất biến 2 (CLAUDE.md 8.2) áp dụng cho mọi
 * thứ đứng ở vị trí của Lớp 3a, kể cả khi đó là mã nguồn thay vì mô hình ngôn ngữ.
 */
export function layoutIntent(
  program: SpaceProgram,
  programRef: string,
  options: {
    variant?: LayoutVariant;
    openFaces?: readonly Face[];
    accessFaces?: readonly Face[];
    /** Tra `requires_face` theo loại phòng — gói quy tắc do lớp gọi cấp, tệp này không tự nạp. */
    faceOf?: FaceNeed;
    /** Mặt sàn dùng chung — Lớp 3a dùng để chọn khung mẫu, không để gán toạ độ. */
    plate?: Plate;
    /** Tra `min_dimension` theo loại phòng — cùng nguồn với `faceOf`. */
    minSideOf?: MinSide;
    /** Ý đồ khối nhà của đầu bài — xem `BuildIntentArgs.massing`. */
    massing?: BuildIntentArgs['massing'];
  } = {},
): StepResult<LayoutIntent> {
  return {
    stub: false,
    payload: parseArtifact(
      'layout_intent',
      buildLayoutIntent({
        program,
        programRef,
        variant: options.variant,
        openFaces: options.openFaces,
        accessFaces: options.accessFaces,
        faceOf: options.faceOf,
        plate: options.plate,
        minSideOf: options.minSideOf,
        massing: options.massing,
      }),
    ),
  };
}

/**
 * Layer 3b — giải ràng buộc. Bước DUY NHẤT của pipeline đã có bản thật ở Mốc 0.
 *
 * Bộ giải nằm trong Container (Python + OR-Tools). Worker chỉ chuyển tiếp và kiểm hợp đồng
 * ở cả hai chiều — Container không tin Worker và ngược lại.
 */
export async function solveFloorPlan(
  compute: ComputeBackend,
  args: {
    intent: LayoutIntent;
    intentRef: string;
    program: SpaceProgram;
    /**
     * Phần `site` NGUYÊN VĂN của đầu bài, không phải kích thước đã quy đổi sẵn.
     *
     * Quy đổi sang ô chữ nhật xây được làm ở ĐÂY, tại điểm gọi duy nhất, chứ không ở lớp
     * trên: nơi nào chuẩn bị lời gọi mà tự quy đổi thì nơi đó có cơ hội quy đổi sai một
     * cách riêng, và bộ giải nhận một mảnh đất khác mảnh đất Lớp 2 đã soạn chương trình.
     */
    site: DesignBrief['site'];
    /**
     * Loại hình công trình — quyết định tập quy tắc bộ giải áp dụng (`applies_to` trong
     * `rules/base/50-massing.yaml`). Bắt buộc: bỏ trống thì Container rơi về `"nha_pho"`
     * và giải biệt thự bằng luật nhà phố mà không báo gì (V-23).
     */
    buildingType: DesignBrief['building_type'];
    locality: string;
    timeBudgetS: number;
    /**
     * Mặt thoáng và mặt vào được của thửa, cùng nhãn tiếng Việt của từng không gian.
     *
     * Lớp gọi cấp, tệp này KHÔNG tự tra: cả hai đến từ tệp YAML dưới `kb/`, mà YAML chỉ nhúng
     * được vào bản dựng Worker. Tệp này phải chạy được dưới Node thuần để kiểm thử.
     * Thiếu thì Container dùng mặc định của nó và câu thông báo rơi về mã không gian.
     */
    openFaces?: readonly Face[];
    accessFaces?: readonly Face[];
    labels?: Record<string, string>;
    /** Thành viên của từng nhóm mã phòng (`habitable`…) — xem `kb/room_vocabulary.yaml`. */
    groups?: Record<string, string[]>;
  },
): Promise<
  | { status: 'ok'; payload: FloorPlan; solveTimeMs: number }
  | { status: 'infeasible'; payload: unknown; solveTimeMs: number }
> {
  // Bộ giải CP-SAT chia hết MỘT hình chữ nhật — nó không có khái niệm "phần đất thừa".
  // Đưa vào kích thước thô của một thửa hình thang là bảo nó xếp phòng lên phần đất không
  // tồn tại: lời giải vẫn ra, vẫn hợp lệ theo mọi ràng buộc, và tràn qua ranh giới thửa.
  const geometry = siteGeometry(args.site);
  const buildable = geometry.buildable;

  const response = await compute.solve({
    intent: args.intent,
    intent_ref: args.intentRef,
    program: args.program,
    site: {
      width_m: buildable.widthM,
      depth_m: buildable.depthM,
      // Diện tích THẬT của thửa, không phải tích hai cạnh ô chữ nhật: mật độ xây dựng lấy nó
      // làm mẫu số, và thửa hình thang có ô chữ nhật nhỏ hơn thửa.
      area_m2: geometry.areaM2,
      open_faces: args.openFaces ? [...args.openFaces] : undefined,
      access_faces: args.accessFaces ? [...args.accessFaces] : undefined,
      setback_required_m: args.site.setback_required_m,
      max_density: args.site.max_density ?? null,
    },
    building_type: args.buildingType,
    rule_pack: { locality: args.locality },
    time_budget_s: args.timeBudgetS,
    labels: args.labels,
    groups: args.groups,
  });

  if (response.status === 'infeasible') {
    return {
      status: 'infeasible',
      payload: parseArtifact('infeasibility_report', response.report),
      solveTimeMs: response.solve_time_ms,
    };
  }

  return {
    status: 'ok',
    payload: parseArtifact('floor_plan', response.floor_plan),
    solveTimeMs: response.solve_time_ms,
  };
}

/**
 * Layer 4 — mô hình kiến trúc tham số, bản TẤT ĐỊNH cho khối sơ bộ (Mốc 5, 11-design-flow 11.4b).
 *
 * Không còn là stub: khối theo cao độ tầng thật của `FloorPlan.levels[].height_m` (đọc từ chuẩn
 * cấu tạo, không phải hằng số), lỗ mở mặt đứng lấy từ các lỗ mở nằm trên tường ngoài, mái bằng
 * có lan can. Phần mô hình ngôn ngữ chọn tham số mặt đứng theo phong cách (TK-14) đến sau và chỉ
 * BỔ SUNG vào cấu trúc này, không thay nó.
 *
 * Nguyên tắc bất biến 2 vẫn đúng: mọi con số ở đây là chép từ hình học đã giải, không có số nào
 * được "sáng tác" tại chỗ.
 */
/**
 * Hình bao công trình `[x0, y0, x1, y1]` trong hệ toạ độ thửa.
 *
 * Bộ giải đã tính sẵn và `FloorPlan.footprint_m` chở sang — không suy lại, vì suy lại là bản
 * thực thi thứ hai của cùng một phép và nó sẽ lệch.
 *
 * Đường lùi chỉ dành cho artifact tạo TRƯỚC 07/09/2026, lúc hợp đồng chưa có trường này:
 * lấy hộp bao của toàn bộ tường. Artifact là bất biến nên chúng còn nằm đó mãi, và đọc chúng
 * bằng ranh thửa sẽ cho ra đúng lỗi vừa sửa. Không có tường nào thì mới quay về ranh thửa —
 * lúc đó chẳng có lỗ mở nào để phân loại, nên chọn gì cũng như nhau.
 */
function footprintOf(plan: FloorPlan): [number, number, number, number] {
  const declared = plan.footprint_m;
  if (declared && declared.length === 4) {
    return [declared[0]!, declared[1]!, declared[2]!, declared[3]!];
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const level of plan.levels) {
    for (const wall of level.walls ?? []) {
      for (const [px, py] of [wall.a, wall.b]) {
        minX = Math.min(minX, px ?? 0);
        minY = Math.min(minY, py ?? 0);
        maxX = Math.max(maxX, px ?? 0);
        maxY = Math.max(maxY, py ?? 0);
      }
    }
  }
  if (!Number.isFinite(minX)) return [0, 0, plan.site.width_m, plan.site.depth_m];
  return [minX, minY, maxX, maxY];
}

export function buildArchModel(plan: FloorPlan, planRef: string): StepResult<ArchModel> {
  let base = 0;
  const levels = plan.levels.map((level) => {
    const height = level.height_m ?? DEFAULT_STOREY_M;
    const row = { level: level.level, extrude_from_m: base, extrude_to_m: base + height };
    base += height;
    return row;
  });

  const eps = 1e-6;
  // Mặt ngoài đo theo HÌNH BAO CÔNG TRÌNH, không theo ranh thửa.
  //
  // Toạ độ phòng và tường là toạ độ tuyệt đối trong thửa, còn khối thì thụt vào theo khoảng
  // lùi. So với `plan.site` là so với một đường mà không tường nào chạm tới: nhà phố (lùi 0)
  // vẫn đúng nên lỗi không bao giờ lộ ra ở đề bài demo, còn mọi biệt thự có khoảng lùi thật
  // thì trả về bốn mảng lỗ mở RỖNG — mất sạch cửa trên phối cảnh và khối ba chiều (V-22).
  const [x0, y0, x1, y1] = footprintOf(plan);
  type FacadeOpening = NonNullable<NonNullable<ArchModel['facades']>[number]['openings']>[number];
  const facades: Record<'front' | 'back' | 'left' | 'right', FacadeOpening[]> = {
    front: [],
    back: [],
    left: [],
    right: [],
  };
  for (const level of plan.levels) {
    const walls = new Map((level.walls ?? []).map((w) => [w.id, w]));
    for (const opening of level.openings ?? []) {
      const wall = walls.get(opening.wall);
      if (!wall) continue;
      const ax = wall.a[0] ?? 0;
      const ay = wall.a[1] ?? 0;
      const bx = wall.b[0] ?? 0;
      const by = wall.b[1] ?? 0;
      const vertical = Math.abs(bx - ax) < eps;
      let direction: keyof typeof facades | null = null;
      if (vertical && Math.abs(ax - x0) < eps) direction = 'left';
      else if (vertical && Math.abs(ax - x1) < eps) direction = 'right';
      else if (!vertical && Math.abs(ay - y0) < eps) direction = 'front';
      else if (!vertical && Math.abs(ay - y1) < eps) direction = 'back';
      if (!direction) continue;
      const origin = vertical ? Math.min(ay, by) : Math.min(ax, bx);
      const kind = opening.kind === 'opening' ? 'opening' : opening.kind;
      facades[direction].push({
        level: level.level,
        x_m: origin + opening.offset_m,
        w_m: opening.width_m,
        h_m: opening.height_m ?? (kind === 'door' ? DEFAULT_DOOR_H : DEFAULT_WINDOW_H),
        sill_m: kind === 'door' ? 0 : (opening.sill_m ?? null),
        kind,
      });
    }
  }

  // Mặt cắt A-A dọc qua lõi thang (cùng vị trí với ký hiệu trên tờ mặt bằng).
  const stair = plan.levels[0]?.rooms.find((r) => r.type === 'stair' || r.type === 'core');
  const stairX = stair
    ? stair.polygon.reduce((s, p) => s + (p[0] ?? 0), 0) / stair.polygon.length
    : (x0 + x1) / 2;

  return {
    stub: false,
    payload: parseArtifact('arch_model', {
      schema_version: SCHEMA_VERSION,
      floorplan_ref: planRef,
      style: null,
      massing: { levels },
      roof: { kind: 'flat', parapet_h_m: DEFAULT_PARAPET_M },
      facades: (['front', 'back', 'left', 'right'] as const).map((direction) => ({
        direction,
        openings: facades[direction],
      })),
      sections: [{ id: 'A', plane: { axis: 'x', at_m: Math.round(stairX * 1000) / 1000 } }],
    }),
  };
}

/**
 * Layer 5 — sinh ảnh.
 *
 * STUB: chưa gọi dịch vụ nào và cố ý trả danh sách ảnh RỖNG. Trả một ảnh giả sẽ vi phạm
 * quy tắc `watermark_applied` (03-data-contracts 3.7): không có ảnh thì không có gì để đóng
 * dấu, còn ảnh giả đã đóng dấu thì lẫn được với ảnh thật.
 */
export function stubRenderResult(): StepResult<RenderResult> {
  return {
    stub: true,
    payload: parseArtifact('render_result', {
      schema_version: SCHEMA_VERSION,
      images: [],
      backend: 'stub',
      duration_s: 0,
    }),
  };
}
