/**
 * Lớp 2 — soạn chương trình không gian từ đầu bài. HÀM THUẦN.
 *
 * Nguồn: doc/design/03-data-contracts.md mục 3.2 · 08-milestones.md Mốc 4 ·
 * 06-knowledge-base.md mục 6.0 và 6.4.
 *
 * ── Ba nguồn tri thức, theo đúng thứ tự ưu tiên ────────────────────────────────────────
 *
 *  1. **Rule pack** (`rules/**`) — quy chuẩn. Diện tích tối thiểu, yêu cầu chiếu sáng,
 *     nguyện vọng tầng, quan hệ liền kề, khoảng lùi, mật độ. KHÔNG thương lượng được.
 *  2. **Thống kê thực nghiệm** (Knowledge Base) — "nhà NVG thường làm bao nhiêu". Rỗng cho
 *     tới khi mỗi ô đủ mẫu; khi rỗng thì bước này không tồn tại, không có giá trị thay thế
 *     nào được bịa ra.
 *  3. **Chuẩn nghề nghiệp** (`kb/space_norms.yaml`) — nền lùi về khi (2) chưa có.
 *
 * Bậc dưới không bao giờ nới lỏng bậc trên: diện tích tối thiểu luôn là `max(quy chuẩn,
 * chuẩn nghề)`, nên một quy chuẩn siết chặt hơn có hiệu lực ngay mà không phải sửa gì khác.
 *
 * ── Vì sao TẤT ĐỊNH ───────────────────────────────────────────────────────────────────
 * Không có mô hình ngôn ngữ nào trong tệp này. Mô hình chỉ tham gia ở một chỗ duy nhất và
 * nằm ngoài: quy phần chữ tự do (`family[].needs`, `priorities`) về mã phòng chuẩn — kết quả
 * đi vào đây qua `extraSpaces` như một danh sách mã đã sạch. Nhờ vậy cùng một đầu bài luôn
 * cho cùng một chương trình không gian, và mã băm artifact có nghĩa.
 */

import { formatNumber } from '@nvg/shared/format';
import {
  siteGeometry,
  type DesignBrief,
  type SiteGeometry,
  type SpaceProgram,
} from '@nvg/shared/design';
import type { RulePack } from './rule-pack';
import { bandFor, type FloorPreference, type SpaceNorms } from './norms';
import type { RoomAreaPriors } from './priors';

export class ProgramError extends Error {
  readonly retryable = false;
}

export interface ProgramInputs {
  brief: DesignBrief;
  briefRef: string;
  rules: RulePack;
  norms: SpaceNorms;
  /** Thống kê thực nghiệm; rỗng khi kho chưa đủ mẫu. */
  priors?: RoomAreaPriors | null;
  /** Mã phòng suy từ phần chữ tự do của đầu bài — đã quy chuẩn ở lớp ngoài. */
  extraSpaces?: string[];
  /** Mã dự án tham chiếu đã dùng, để truy được "số này lấy từ đâu". */
  referenceProjects?: string[];
}

export interface ProgramResult {
  payload: SpaceProgram;
  /**
   * Điều engine phải nói ra nhưng không đủ để dừng lại.
   *
   * Đi CÙNG kết quả chứ không chỉ vào nhật ký: kiến trúc sư cần thấy "lô không đủ chỗ cho
   * nhu cầu đã khai" đúng lúc đang đọc chương trình không gian, không phải sau khi bộ giải
   * trả về vô nghiệm và không ai hiểu vì sao.
   */
  warnings: string[];
}

const SCHEMA_VERSION = '1.0.0';

interface Instance {
  type: string;
  floor: number;
  preference: FloorPreference;
  min: number;
  target: number;
  max: number;
  priority: number;
}

export function buildSpaceProgram(inputs: ProgramInputs): ProgramResult {
  const { brief, rules, norms } = inputs;
  const warnings: string[] = [];
  const buildingType = brief.building_type;
  const floors = brief.floors;

  // Hình học thửa đất tính MỘT lần rồi dùng chung: diện tích thật, ô chữ nhật xây được, phần
  // đất không xếp được phòng. Tính lại ở từng chỗ cần là mở đường cho hai chỗ hiểu khác nhau.
  const geometry = siteGeometry(brief.site);
  const footprint = buildableFootprint(brief, geometry, rules, warnings);

  // Dải bề rộng lấy theo ô XÂY ĐƯỢC, không theo mặt tiền: "nhà ống hẹp" là chuyện phòng bị
  // bó bao nhiêu, và với thửa hình thang thì phần hẹp mới là phần quyết định điều đó.
  const scale = bandFor(norms, geometry.buildable.widthM).scale;

  if (geometry.unusedM2 > 0.5) {
    warnings.push(
      `Bộ giải làm việc trên phần đất hình chữ nhật ${formatNumber(geometry.buildable.widthM)} × ` +
        `${formatNumber(geometry.buildable.depthM)} m; còn ${formatNumber(geometry.unusedM2)} m² ` +
        'nằm ngoài phần đó chưa được xếp phòng.',
    );
  }

  // ── 1. Có những không gian nào, mỗi loại mấy cái ────────────────────────────────────
  const requests = collectRequests(inputs, warnings);

  // ── 2. Gán tầng ─────────────────────────────────────────────────────────────────────
  const instances = assignFloors(
    requests,
    floors,
    norms,
    rules,
    buildingType,
    inputs,
    scale,
    footprint,
  );

  if (!instances.length) {
    throw new ProgramError(
      'Không soạn được chương trình không gian: đầu bài chưa khai không gian nào và loại hình chưa có danh sách bắt buộc.',
    );
  }

  // ── 3. Ép vừa diện tích sàn có được ─────────────────────────────────────────────────
  fitToFloors(instances, floors, footprint, norms, warnings);

  // ── 4. Dựng kết quả theo hợp đồng ───────────────────────────────────────────────────
  const counters = new Map<string, number>();
  const daylightRequired = rules.requiresDaylight(buildingType);
  const spaces: SpaceProgram['spaces'] = instances.map((it) => {
    const n = (counters.get(it.type) ?? 0) + 1;
    counters.set(it.type, n);
    const norm = norms.spaces[it.type]!;
    return {
      id: `${it.type}_${n}`,
      type: it.type,
      floor: it.floor,
      min_area_m2: round(it.min),
      target_area_m2: round(it.target),
      max_area_m2: round(it.max),
      priority: it.priority,
      needs_daylight: daylightRequired.has(it.type) || norm.daylight,
      needs_facade: norm.facade,
      needs_ventilation: norm.ventilation,
    };
  });

  return {
    warnings,
    payload: {
      schema_version: SCHEMA_VERSION,
      brief_ref: inputs.briefRef,
      spaces,
      adjacency: buildAdjacency(spaces, rules, norms, buildingType),
      floor_allocation: Array.from({ length: floors }, (_, i) => {
        const level = i + 1;
        return {
          floor: level,
          usable_area_m2: round(footprint),
          allocated_area_m2: round(
            spaces
              .filter((s) => s.floor === level)
              .reduce((sum, s) => sum + (s.target_area_m2 ?? 0), 0),
          ),
        };
      }),
      reference_projects: inputs.referenceProjects ?? [],
      priors_applied: Boolean(inputs.priors),
    },
  };
}

/**
 * Diện tích sàn có được mỗi tầng, sau khoảng lùi và mật độ xây dựng.
 *
 * Khoảng lùi khai trong đầu bài THẮNG rule pack: đó là số đo thực tế của mảnh đất này (giấy
 * phép quy hoạch, chỉ giới đã cắm), còn rule pack là mức chung của loại hình.
 *
 * Hai con số vào đây đến từ HAI nguồn khác nhau, và trộn chúng là lỗi đã từng có:
 *
 *  · Khoảng lùi trừ vào **ô chữ nhật xây được** (`geometry.buildable`) — thứ bộ giải thật sự
 *    xếp phòng lên. Với thửa hình thang, ô đó hẹp hơn mặt tiền.
 *  · Mật độ xây dựng nhân với **diện tích THẬT của thửa** (`geometry.areaM2`), vì chỉ tiêu quy
 *    hoạch tính trên diện tích ghi trong giấy chứng nhận, không phải trên hình bao. Dùng
 *    `width_m × depth_m` như trước là nới trần mật độ cho mọi thửa không vuông vắn.
 */
function buildableFootprint(
  brief: DesignBrief,
  geometry: SiteGeometry,
  rules: RulePack,
  warnings: string[],
): number {
  const packSetbacks = rules.setbacks(brief.building_type);
  const briefSetbacks = brief.site.setback_required_m ?? {};
  const side = (name: 'front' | 'back' | 'left' | 'right'): number =>
    briefSetbacks[name] ?? packSetbacks[name] ?? 0;

  const width = geometry.buildable.widthM - side('left') - side('right');
  const depth = geometry.buildable.depthM - side('front') - side('back');
  if (width <= 0 || depth <= 0) {
    throw new ProgramError(
      'Khoảng lùi bắt buộc lớn hơn kích thước lô — không còn phần đất nào xây được. Kiểm tra lại kích thước hoặc khoảng lùi trong đầu bài.',
    );
  }

  const density = brief.site.max_density ?? rules.maxDensity(brief.building_type);
  const byDensity =
    density === null || density === undefined ? Infinity : geometry.areaM2 * density;
  const footprint = Math.min(width * depth, byDensity);

  if (density === null || density === undefined) {
    warnings.push(
      'Chưa biết mật độ xây dựng tối đa — đang lấy toàn bộ phần đất trong khoảng lùi. Bổ sung khi có chỉ tiêu quy hoạch.',
    );
  }
  return footprint;
}

interface Request {
  type: string;
  preference: FloorPreference;
  /** Rỗng = xếp theo nguyện vọng; có số = ghim đúng tầng đó. */
  pinned?: number;
}

/**
 * Có những không gian nào — hợp của: bắt buộc theo loại hình, đầu bài khai, suy từ gia đình.
 *
 * Ba loại có quy tắc đặt riêng nên KHÔNG đi qua đường "mỗi loại một cái": thang, giao thông
 * và khu vệ sinh. Chúng nhận diện bằng chính các khoá của mục `derived` trong
 * `kb/space_norms.yaml` — thêm một loại có quy tắc riêng là thêm một khoá ở đó, không phải
 * thêm một danh sách thứ hai trong mã.
 */
function collectRequests(inputs: ProgramInputs, warnings: string[]): Request[] {
  const { brief, norms } = inputs;
  const managed = new Set(Object.keys(norms.derived));
  const requests: Request[] = [];
  const seen = new Set<string>();

  // `pinned` không cần kiểm ở đây so với `range` — hàm biết `brief.floors` qua closure, nên
  // đây là chỗ DUY NHẤT phải nhớ luật "ghim ngoài 1..floors thì bỏ ghim, không bỏ cả yêu cầu".
  const addSingle = (type: string, pinned?: number): void => {
    const norm = norms.spaces[type];
    if (!norm || managed.has(type) || seen.has(type)) return;
    seen.add(type);
    if (pinned !== undefined && (pinned < 1 || pinned > brief.floors)) {
      warnings.push(
        `Không gian "${type}" ghim vào tầng ${pinned} nhưng công trình chỉ có ${brief.floors} tầng — bỏ qua ghim, để hệ thống tự xếp.`,
      );
      pinned = undefined;
    }
    requests.push({ type, preference: norm.floor, pinned });
  };

  for (const type of norms.mandatory[brief.building_type] ?? []) addSingle(type);

  for (const space of brief.required_spaces ?? []) {
    if (!norms.spaces[space.type]) {
      // Mã lạ KHÔNG bị nuốt: nó có thể là mã đúng nhưng chưa vào từ vựng, và im lặng bỏ đi
      // nghĩa là khách yêu cầu một không gian rồi không thấy nó ở đâu nữa.
      warnings.push(
        `Không gian "${space.type}" chưa có trong chuẩn diện tích nên chưa đưa vào chương trình.`,
      );
      continue;
    }
    addSingle(space.type, space.floor ?? undefined);
  }
  for (const type of inputs.extraSpaces ?? []) addSingle(type);

  // ── Phòng ngủ, suy từ thành phần gia đình ───────────────────────────────────────────
  let bedrooms = 0;
  for (const member of brief.family ?? []) {
    const rule = norms.occupancy[member.role];
    if (!rule || member.count <= 0) continue;
    for (let i = 0; i < Math.ceil(member.count / rule.per_room); i += 1) {
      requests.push({
        type: rule.room_type,
        // Nguyện vọng tầng của chính gia đình thắng mặc định theo vai trò.
        preference: (member.floor_pref as FloorPreference | null | undefined) ?? rule.floor,
      });
      bedrooms += 1;
    }
  }
  if (bedrooms === 0 && (brief.family?.length ?? 0) > 0) {
    warnings.push(
      'Thành phần gia đình đã khai nhưng không suy ra được phòng ngủ nào — kiểm tra lại số người.',
    );
  }

  // ── Thang ───────────────────────────────────────────────────────────────────────────
  // Một cái cho mỗi lõi, ở mọi tầng TRỪ tầng trên cùng. Vế cuối không phải tiểu tiết: đặt
  // một vế thang ở tầng mái là chiếm diện tích cho một đoạn thang không dẫn đi đâu. Nhà một
  // tầng vì vậy không có thang, kể cả khi thang nằm trong danh sách bắt buộc.
  const cores = brief.massing?.cores_preferred ?? 1;
  if (brief.floors > 1 && norms.spaces.stair) {
    for (let level = 1; level < brief.floors; level += 1) {
      for (let c = 0; c < cores * norms.derived.stair.per_core; c += 1) {
        requests.push({ type: 'stair', preference: 'any', pinned: level });
      }
    }
  }

  // ── Giao thông: một khối mỗi tầng ───────────────────────────────────────────────────
  if (norms.spaces.circulation) {
    for (let level = 1; level <= brief.floors; level += 1) {
      requests.push({ type: 'circulation', preference: 'any', pinned: level });
    }
  }

  // ── Vệ sinh ─────────────────────────────────────────────────────────────────────────
  // Phần tối thiểu GHIM theo tầng, không thả nổi. Thả nổi thì bước cân tải sẽ dồn cả ba khu
  // lên tầng đang nhẹ nhất — đúng về số học, và là một căn nhà có hai tầng không có nhà vệ
  // sinh nào.
  if (norms.spaces.wc) {
    const perFloor = Math.max(0, Math.round(norms.derived.wc.min_per_floor));
    for (let level = 1; level <= brief.floors; level += 1) {
      for (let i = 0; i < perFloor; i += 1) {
        requests.push({ type: 'wc', preference: 'any', pinned: level });
      }
    }
    // Phần thêm theo số phòng ngủ thì thả nổi: nó đi theo phòng ngủ, mà phòng ngủ nằm ở đâu
    // là kết quả của bước gán tầng.
    const byBedrooms = Math.ceil(bedrooms / Math.max(1, norms.derived.wc.per_bedrooms));
    for (let i = perFloor * brief.floors; i < byBedrooms; i += 1) {
      requests.push({ type: 'wc', preference: 'any' });
    }
  }

  return requests;
}

/**
 * Nguyện vọng tầng → DẢI tầng chấp nhận được, không phải một tầng cụ thể.
 *
 * Vì sao là dải: "tầng giữa" của một căn ba tầng không có nghĩa là đúng tầng hai. Quy về một
 * số thì bốn phòng ngủ cùng mang nguyện vọng "tầng giữa" sẽ chồng hết lên một tầng, còn tầng
 * trên gần như bỏ trống — đúng về mặt tuân thủ nguyện vọng, và là một chương trình không gian
 * không kiến trúc sư nào chấp nhận. Trả về dải rồi để bước cân tải chọn trong dải đó giữ được
 * cả nguyện vọng lẫn sự cân đối.
 */
function floorRange(preference: FloorPreference, floors: number): [number, number] {
  switch (preference) {
    case 'ground':
      return [1, 1];
    case 'top':
      return [floors, floors];
    case 'low':
      return [1, Math.min(2, floors)];
    case 'mid':
      // Từ tầng hai trở lên — phần "ở" của nhà ống Việt Nam. Nhà một tầng thì không có lựa chọn.
      return floors > 1 ? [2, floors] : [1, 1];
    default:
      return [1, floors];
  }
}

function assignFloors(
  requests: Request[],
  floors: number,
  norms: SpaceNorms,
  rules: RulePack,
  buildingType: string,
  inputs: ProgramInputs,
  scale: number,
  footprint: number,
): Instance[] {
  const rulePreference = rules.floorPreference(buildingType);
  const load = new Array<number>(floors + 1).fill(0);
  const placed: Instance[] = [];
  const pending: Array<{ instance: Omit<Instance, 'floor'>; range: [number, number] }> = [];
  const capacity = footprint * norms.allocation.fill_target_ratio;

  for (const request of requests) {
    const norm = norms.spaces[request.type]!;
    const base: Omit<Instance, 'floor'> = {
      type: request.type,
      preference: request.preference,
      priority: norm.priority,
      ...areasFor(request.type, norm, rules, buildingType, inputs, scale),
    };

    // Quy tắc thắng nguyện vọng: "phòng thờ ở tầng trên cùng" là kinh nghiệm nghề đã được
    // Phòng Thiết kế viết thành quy tắc, không phải mặc định của phần mềm.
    const fromRule = rulePreference.get(request.type);
    const preference: FloorPreference =
      fromRule === 'top' ? 'top' : fromRule === 'ground' ? 'ground' : request.preference;

    if (request.pinned !== undefined) {
      load[request.pinned] = (load[request.pinned] ?? 0) + base.target;
      placed.push({ ...base, floor: request.pinned });
    } else {
      pending.push({ instance: base, range: floorRange(preference, floors) });
    }
  }

  // Tải "cố định" của mỗi tầng là phần ghim (thang, giao thông, vệ sinh tối thiểu, phòng ghim
  // tầng). Một tầng được coi là ĐANG DÙNG khi đã có phòng thả nổi nào đó đặt lên trên phần đó.
  const fixed = [...load];

  // Chọn trong dải cho phép: ưu tiên tầng ĐANG DÙNG còn chỗ (nhẹ nhất trong số đó); hết thì mở
  // tầng thấp nhất chưa dùng còn chỗ; không tầng nào còn chỗ thì rơi về tầng nhẹ nhất. Duyệt
  // theo thứ tự đầu vào nên kết quả tất định. Lý do ở `kb/space_norms.yaml` mục `allocation`.
  for (const { instance, range } of pending) {
    const fits = (level: number) => (load[level] ?? 0) + instance.target <= capacity;
    let best: number | null = null;
    for (let level = range[0]; level <= range[1]; level += 1) {
      const inUse = (load[level] ?? 0) > (fixed[level] ?? 0);
      if (inUse && fits(level) && (best === null || (load[level] ?? 0) < (load[best] ?? 0)))
        best = level;
    }
    if (best === null) {
      for (let level = range[0]; level <= range[1]; level += 1) {
        if (fits(level)) {
          best = level;
          break;
        }
      }
    }
    if (best === null) {
      best = range[0];
      for (let level = range[0] + 1; level <= range[1]; level += 1) {
        if ((load[level] ?? 0) < (load[best] ?? 0)) best = level;
      }
    }
    load[best] = (load[best] ?? 0) + instance.target;
    placed.push({ ...instance, floor: best });
  }

  // Tầng còn trống quá thì thêm không gian bổ sung theo danh sách của loại hình — tới khi đủ
  // ngưỡng, hoặc hết danh sách. Mỗi loại một cái mỗi tầng.
  const fillers = norms.allocation.fillers[buildingType] ?? [];
  const floorOf = new Map<number, Set<string>>();
  for (const it of placed) floorOf.set(it.floor, (floorOf.get(it.floor) ?? new Set()).add(it.type));
  for (let level = 1; level <= floors; level += 1) {
    for (const type of fillers) {
      if ((load[level] ?? 0) >= footprint * norms.allocation.filler_below_ratio) break;
      const norm = norms.spaces[type];
      if (!norm || floorOf.get(level)?.has(type)) continue;
      const areas = areasFor(type, norm, rules, buildingType, inputs, scale);
      placed.push({
        type,
        preference: norm.floor,
        priority: norm.priority,
        ...areas,
        floor: level,
      });
      load[level] = (load[level] ?? 0) + areas.target;
      floorOf.set(level, (floorOf.get(level) ?? new Set()).add(type));
    }
  }
  return placed;
}

/** Ba con số diện tích của một loại phòng, theo đúng thứ tự ưu tiên ba nguồn tri thức. */
function areasFor(
  type: string,
  norm: SpaceNorms['spaces'][string],
  rules: RulePack,
  buildingType: string,
  inputs: ProgramInputs,
  scale: number,
): { min: number; target: number; max: number } {
  const min = Math.max(norm.min_m2, rules.minArea(buildingType, type) ?? 0);
  const fromPriors = inputs.priors?.medianFor(type) ?? null;
  const target = Math.max(min, fromPriors ?? norm.target_m2 * scale);
  const max = Math.max(target, norm.max_m2 * scale);
  return { min, target, max };
}

/**
 * Ép chương trình mỗi tầng vừa với sàn có được — HAI chiều, không chỉ một.
 *
 * **Chiều thiếu chỗ.** Nhường theo ĐỘ ƯU TIÊN: cái ưu tiên thấp nhất co về diện tích tối
 * thiểu trước, rồi mới tới cái trên nó. Co đều tất cả sẽ làm phòng khách và nhà kho cùng hụt
 * như nhau — không phải cách kiến trúc sư xử lý một lô chật. Không bao giờ co xuống dưới tối
 * thiểu: con số đó là quy chuẩn. Hết chỗ co thì engine NÓI RA và để bộ giải kết luận vô
 * nghiệm kèm tập ràng buộc mâu thuẫn — đó mới là câu trả lời dùng được, không phải một
 * chương trình đã bị bóp cho vừa.
 *
 * **Chiều thừa chỗ — dễ bỏ sót.** Bộ giải CP-SAT chia HẾT mặt sàn: không có khái niệm "phần
 * còn lại để trống". Nên nếu tổng diện tích TỐI ĐA của một tầng nhỏ hơn mặt sàn thì phần dôi
 * ra phải rơi vào một phòng nào đó. Giao nó cho khối giao thông, vì đó chính là thứ nó là:
 * sảnh, hành lang, chiếu nghỉ — phần sàn không thuộc phòng nào.
 *
 * Từ Mốc 5, bộ giải coi `max_area` của chương trình là KHOẢN PHẠT chứ không phải ràng buộc
 * cứng (`compute/src/design_compute/solver/model.py`), nên bước này không còn là ranh giới
 * giữa "có phương án" và "vô nghiệm" — nó chỉ quyết định phần dôi ra rơi vào đâu cho hợp lý.
 */
function fitToFloors(
  instances: Instance[],
  floors: number,
  footprint: number,
  norms: SpaceNorms,
  warnings: string[],
): void {
  for (let level = 1; level <= floors; level += 1) {
    const onFloor = instances.filter((it) => it.floor === level);
    if (!onFloor.length) continue;

    // Giao thông lấy diện tích theo TỈ LỆ mặt sàn, không phải một con số cố định: hành lang
    // của tầng 40 m² và tầng 120 m² không thể bằng nhau (06-knowledge-base 6.4).
    const circulation = onFloor.filter((it) => it.type === 'circulation');
    for (const it of circulation) {
      const byRatio = (footprint * norms.derived.circulation.ratio_of_floor) / circulation.length;
      it.target = Math.min(Math.max(byRatio, it.min), it.max);
    }

    let excess = onFloor.reduce((sum, it) => sum + it.target, 0) - footprint;
    if (excess > 0) {
      for (const it of [...onFloor].sort((a, b) => b.priority - a.priority)) {
        if (excess <= 0) break;
        const room = it.target - it.min;
        if (room <= 0) continue;
        const cut = Math.min(room, excess);
        it.target -= cut;
        excess -= cut;
      }
      if (excess > 0.05) {
        warnings.push(
          `Tầng ${level}: nhu cầu vượt sàn có được khoảng ${excess.toFixed(1)} m² kể cả khi mọi phòng đã về diện tích tối thiểu. Cân nhắc giảm số phòng, tăng số tầng, hoặc xem lại khoảng lùi.`,
        );
      }
    }

    const deficit = footprint - onFloor.reduce((sum, it) => sum + it.max, 0);
    if (deficit > 0) {
      const absorber = circulation[0] ?? [...onFloor].sort((a, b) => b.priority - a.priority)[0];
      if (absorber) absorber.max += deficit;
    }

    // Cận trên không bao giờ được thấp hơn diện tích mong muốn — miền rỗng là vô nghiệm.
    for (const it of onFloor) it.max = Math.max(it.max, it.target);
  }
}

/**
 * Quan hệ liền kề — chuyển quy tắc theo LOẠI phòng thành cặp theo TỪNG không gian cụ thể.
 *
 * `scope: floor` chỉ ghép các cặp cùng tầng; `scope: building` ghép mọi cặp. Bỏ qua vế này
 * thì "vệ sinh cách xa phòng thờ" (phạm vi cả nhà) sẽ không được sinh khi hai phòng ở khác
 * tầng — đúng chỗ nó có nghĩa nhất.
 */
function buildAdjacency(
  spaces: SpaceProgram['spaces'],
  rules: RulePack,
  norms: SpaceNorms,
  buildingType: string,
): SpaceProgram['adjacency'] {
  const out: NonNullable<SpaceProgram['adjacency']> = [];
  const seen = new Set<string>();

  for (const rule of rules.adjacency(buildingType)) {
    const weight = norms.adjacency_weight[rule.severity];
    for (const a of spaces.filter((s) => s.type === rule.a)) {
      for (const b of spaces.filter((s) => s.type === rule.b)) {
        if (a.id === b.id) continue;
        if (rule.scope === 'floor' && a.floor !== b.floor) continue;
        const key = [a.id, b.id].sort().join('|') + `|${rule.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a: a.id, b: b.id, kind: rule.kind, weight });
      }
    }
  }
  return out;
}

/** Một chữ số thập phân là đủ: hình học tính bằng mét, và mm² không có nghĩa ở lớp này. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
