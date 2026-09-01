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
import { buildLayoutIntent, type LayoutVariant } from '../layout/intent';
import type { Face } from '../layout/site-context';

const SCHEMA_VERSION = '1.0.0';

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
  options: { variant?: LayoutVariant; openFaces?: readonly Face[] } = {},
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
