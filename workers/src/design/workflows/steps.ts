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
 * ⚠️ MỐC 1: bốn trong sáu bước trả về STUB — dữ liệu đúng hợp đồng nhưng không phải kết quả
 * thật. Mỗi stub tự khai `stub: true` trong kết quả bước để không có cách nào nhầm nó với
 * kết quả thật ở lớp trên.
 */

import type {
  ArchModel,
  DesignBrief,
  FloorPlan,
  LayoutIntent,
  RenderResult,
  SpaceProgram,
} from '@nvg/shared/design';
import type { ComputeBackend } from '../compute-backend';
import { parseArtifact } from '../contracts';

const SCHEMA_VERSION = '1.0.0';

export interface StepResult<T> {
  payload: T;
  /** `true` = kết quả tạm cho khung xương, KHÔNG phải kết quả thật của lớp đó. */
  stub: boolean;
}

/**
 * Layer 2 — chương trình không gian.
 *
 * STUB: bản thật gọi mô hình ngôn ngữ cộng truy hồi thống kê thực nghiệm từ Knowledge Base
 * (Mốc 3 + Mốc 4). Bản này chia đều số phòng theo số tầng của đầu bài, chỉ để có dữ liệu
 * đúng hợp đồng chảy qua đường ống.
 */
export function stubSpaceProgram(brief: DesignBrief, briefRef: string): StepResult<SpaceProgram> {
  const floors = brief.floors;
  const spaces: SpaceProgram['spaces'] = [];

  for (let level = 1; level <= floors; level += 1) {
    spaces.push({
      id: `main_${level}`,
      type: level === 1 ? 'living' : 'bedroom',
      floor: level,
      min_area_m2: 12,
      max_area_m2: 40,
      priority: 1,
      needs_daylight: true,
      needs_facade: level === 1,
      needs_ventilation: true,
    });
    spaces.push({
      id: `landing_${level}`,
      type: 'circulation',
      floor: level,
      min_area_m2: 6,
      max_area_m2: 18,
      priority: 2,
      needs_daylight: false,
      needs_facade: false,
      needs_ventilation: false,
    });
  }

  return {
    stub: true,
    payload: parseArtifact('space_program', {
      schema_version: SCHEMA_VERSION,
      brief_ref: briefRef,
      spaces,
      adjacency: [],
      floor_allocation: Array.from({ length: floors }, (_, i) => ({ floor: i + 1 })),
      reference_projects: [],
      priors_applied: false,
    }),
  };
}

/**
 * Layer 3a — ý đồ bố cục.
 *
 * STUB: bản thật gọi mô hình ngôn ngữ sinh cây chia không gian (Mốc 5). Bản này dựng một cây
 * một lát cắt cho mỗi tầng — hợp lệ về cấu trúc, nghèo nàn về kiến trúc, và đó là điều cần
 * thiết: một stub trông "đẹp" sẽ có người tưởng lớp này đã xong.
 *
 * Chú ý: kể cả stub cũng KHÔNG sinh toạ độ hay kích thước — nguyên tắc bất biến 2
 * (CLAUDE.md 8.2) áp dụng cho mọi thứ đứng ở vị trí của mô hình ngôn ngữ.
 */
export function stubLayoutIntent(
  program: SpaceProgram,
  programRef: string,
  variantId = 'A',
): StepResult<LayoutIntent> {
  const levels = [...new Set(program.spaces.map((s) => s.floor))].sort((a, b) => a - b);

  const floors = levels.map((level) => {
    const onFloor = program.spaces.filter((s) => s.floor === level);
    return {
      level,
      wings: [
        {
          wing_id: 'W1',
          tree: buildBalancedTree(onFloor.map((s) => s.id)),
        },
      ],
    };
  });

  return {
    stub: true,
    payload: parseArtifact('layout_intent', {
      schema_version: SCHEMA_VERSION,
      program_ref: programRef,
      variant_id: variantId,
      variant_label: 'Khung xương — chưa phải phương án kiến trúc',
      massing: { wings: [{ id: 'W1' }], wing_links: [] },
      cores: [{ id: 'C1', wing: 'W1', band: 'left', position_hint: 'middle', contains: ['stair'] }],
      floors,
      rationale: 'Kết quả tạm của khung xương Mốc 1: cây chia đều, chưa có suy luận kiến trúc nào.',
    }),
  };
}

/** Cây nhị phân chia đôi danh sách phòng — cấu trúc hợp lệ, không mang ý đồ kiến trúc. */
function buildBalancedTree(roomIds: string[]): unknown {
  if (roomIds.length === 0) return { void: 'lightwell' };
  if (roomIds.length === 1) return { room: roomIds[0] };
  const mid = Math.ceil(roomIds.length / 2);
  return {
    split: 'H',
    ratio_hint: 0.5,
    a: buildBalancedTree(roomIds.slice(0, mid)),
    b: buildBalancedTree(roomIds.slice(mid)),
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
    site: { width_m: number; depth_m: number };
    locality: string;
    timeBudgetS: number;
  },
): Promise<
  | { status: 'ok'; payload: FloorPlan; solveTimeMs: number }
  | { status: 'infeasible'; payload: unknown; solveTimeMs: number }
> {
  const response = await compute.solve({
    intent: args.intent,
    intent_ref: args.intentRef,
    program: args.program,
    site: args.site,
    rule_pack: { locality: args.locality },
    time_budget_s: args.timeBudgetS,
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
 * Layer 4 — mô hình kiến trúc tham số.
 *
 * STUB: bản thật gọi mô hình ngôn ngữ chọn tham số mặt đứng theo phong cách, rồi Container
 * dựng mặt cắt và bảng thống kê (Mốc 6).
 */
export function stubArchModel(plan: FloorPlan, planRef: string): StepResult<ArchModel> {
  let base = 0;
  const levels = plan.levels.map((level) => {
    const height = level.height_m ?? 3.4;
    const row = { level: level.level, extrude_from_m: base, extrude_to_m: base + height };
    base += height;
    return row;
  });

  return {
    stub: true,
    payload: parseArtifact('arch_model', {
      schema_version: SCHEMA_VERSION,
      floorplan_ref: planRef,
      style: null,
      massing: { levels },
      roof: { kind: 'flat', parapet_h_m: 0.9 },
      facades: [],
      sections: [],
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
