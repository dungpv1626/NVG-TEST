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
  ROOM_LABEL,
  siteGeometry,
  type DesignBrief,
  type SiteGeometry,
  type ProgramIntent,
  type SpaceProgram,
} from '@nvg/shared/design';
import type { RulePack } from '../rules/rule-pack';
import { effectiveMaxDensity, effectiveSetbacks } from './site-limits';
import { checkPlausibility, type PlausibilityRules } from './plausibility';
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
  /**
   * Bộ soát tính hợp lý nghề nghiệp (`kb/program_plausibility.yaml`).
   *
   * Tuỳ chọn để phần kiểm thử của engine chạy được mà không phải nạp thêm tệp; lớp gọi thật
   * LUÔN truyền. Kết quả đi thẳng vào `warnings`, tức là hiện ngay trên màn hình Chương trình
   * không gian — chỗ kiến trúc sư đang đọc, không phải một nhật ký ai đó sẽ mở sau.
   */
  plausibility?: PlausibilityRules | null;
  /**
   * Ý đồ chương trình do Lớp 2a (mô hình ngôn ngữ) đề xuất — CHỈ ba bậc nhấn mạnh, không có
   * một con số diện tích nào. Vắng mặt = chạy hoàn toàn theo chuẩn nghề, đúng như trước.
   */
  intent?: ProgramIntent | null;
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
  /** Tỉ lệ nhận phần sàn còn dư. `0` = không nhận (giao thông tính riêng). */
  weight: number;
  /**
   * Diện tích đã do NGƯỜI hoặc DỮ LIỆU ĐO ấn định (`required_spaces[].area_m2`, hoặc trung
   * vị thống kê thực nghiệm) — bước cấp phát không được đụng vào.
   */
  fixedArea: boolean;
  key?: string;
  enclosedByKey?: string;
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
  const { instances, plate } = assignFloors(
    requests,
    floors,
    norms,
    rules,
    buildingType,
    inputs,
    scale,
    footprint,
    warnings,
  );

  if (!instances.length) {
    throw new ProgramError(
      'Không soạn được chương trình không gian: đầu bài chưa khai không gian nào và loại hình chưa có danh sách bắt buộc.',
    );
  }

  // ── 3. Cấp phát diện tích trên cỡ sàn đã chọn ───────────────────────────────────────
  //
  // Sàn XÂY ĐƯỢC là một trần pháp lý, không phải một yêu cầu: một gia đình bốn người trên lô
  // 20 × 30 m không cần căn nhà 360 m²/tầng. Cỡ sàn thật do `assignFloors` chọn cùng lúc với
  // việc xếp tầng — hai việc đó không tách được, xem chú thích ở đó.
  allocateAreas(instances, floors, plate, norms, warnings);

  // ── 4. Dựng kết quả theo hợp đồng ───────────────────────────────────────────────────
  const counters = new Map<string, number>();
  const daylightRequired = rules.requiresDaylight(buildingType);

  // Đánh số TRƯỚC rồi mới dựng: quan hệ mẹ–con trỏ bằng mã thật, mà mã chỉ có sau khi đánh số.
  const idByKey = new Map<string, string>();
  const ids = instances.map((it) => {
    const n = (counters.get(it.type) ?? 0) + 1;
    counters.set(it.type, n);
    const id = `${it.type}_${n}`;
    if (it.key) idByKey.set(it.key, id);
    return id;
  });

  const spaces: SpaceProgram['spaces'] = instances.map((it, index) => {
    const norm = norms.spaces[it.type]!;
    const enclosedIn = it.enclosedByKey ? (idByKey.get(it.enclosedByKey) ?? null) : null;
    return {
      id: ids[index]!,
      type: it.type,
      floor: it.floor,
      min_area_m2: round(it.min),
      target_area_m2: round(it.target),
      max_area_m2: round(it.max),
      priority: it.priority,
      // Khu vệ sinh khép kín lấy sáng và gió qua chính phòng mẹ, không qua hành lang — đòi nó
      // tự có mặt thoáng là ép một lỗ mở ra ngoài mà nhà thật không làm.
      needs_daylight: enclosedIn ? false : daylightRequired.has(it.type) || norm.daylight,
      needs_facade: enclosedIn ? false : norm.facade,
      needs_ventilation: norm.ventilation,
      ...(enclosedIn ? { enclosed_in: enclosedIn } : {}),
    };
  });

  const payload: SpaceProgram = {
    schema_version: SCHEMA_VERSION,
    brief_ref: inputs.briefRef,
    spaces,
    adjacency: buildAdjacency(
      spaces,
      rules,
      norms,
      buildingType,
      brief.massing?.service_core === true,
    ),
    floor_allocation: Array.from({ length: floors }, (_, i) => {
      const level = i + 1;
      return {
        floor: level,
        usable_area_m2: round(plate),
        buildable_area_m2: round(footprint),
        allocated_area_m2: round(
          spaces
            .filter((s) => s.floor === level)
            .reduce((sum, s) => sum + (s.target_area_m2 ?? 0), 0),
        ),
      };
    }),
    reference_projects: inputs.referenceProjects ?? [],
    priors_applied: Boolean(inputs.priors),
  };

  // ── Soát tính hợp lý NGHỀ NGHIỆP của chính kết quả vừa soạn ─────────────────────────
  //
  // Bước cuối, và cố ý KHÔNG chặn: một chương trình đáng ngờ vẫn phải đi tiếp, vì phán đoán
  // cuối cùng là của kiến trúc sư (PRD 2.3). Nhưng nó phải đi tiếp KÈM câu nói ra chỗ đáng
  // ngờ, ngay trên màn hình — không phải nằm trong một nhật ký ai đó sẽ mở sau.
  //
  // Đây là tầng bắt được thứ hai tầng trên bỏ lọt: quy chuẩn đúng và chuẩn nghề đúng vẫn cho
  // ra bếp 6 m² cạnh một căn nhà 360 m², vì cái sai nằm ở QUAN HỆ giữa các con số.
  if (inputs.plausibility) {
    const fixedIds = new Set(instances.flatMap((it, i) => (it.fixedArea ? [ids[i]!] : [])));
    for (const finding of checkPlausibility(payload, inputs.plausibility, fixedIds)) {
      warnings.push(finding.message);
    }
  }

  return { warnings, payload };
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
export function buildableFootprint(
  brief: DesignBrief,
  geometry: SiteGeometry,
  rules: RulePack,
  warnings: string[],
): number {
  // Mức CHẶT hơn giữa gói quy tắc và đầu bài — cùng một phép với bộ giải, xem `site-limits.ts`.
  // Trước 07/09/2026 chỗ này lấy đầu bài GHI ĐÈ gói quy tắc, nên đầu bài khai khoảng lùi nhỏ
  // hơn quy chuẩn thì Lớp 2 soạn chương trình trên phần đất bộ giải không cho xây.
  const setbacks = effectiveSetbacks(brief, rules);

  const width = geometry.buildable.widthM - setbacks.left - setbacks.right;
  const depth = geometry.buildable.depthM - setbacks.front - setbacks.back;
  if (width <= 0 || depth <= 0) {
    throw new ProgramError(
      'Khoảng lùi bắt buộc lớn hơn kích thước lô — không còn phần đất nào xây được. Kiểm tra lại kích thước hoặc khoảng lùi trong đầu bài.',
    );
  }

  const density = effectiveMaxDensity(brief, rules);
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
  /**
   * Diện tích mong muốn do kiến trúc sư khai, m². Nguyện vọng chứ không phải số đã chốt —
   * `areasFor` kẹp nó không xuống dưới tối thiểu quy chuẩn, và `fitToFloors` vẫn cắt được
   * khi tầng không đủ chỗ (và nói ra khi cắt).
   */
  areaWanted?: number;
  /**
   * Khoá TẠM, chỉ sống trong lượt soạn này — mã phòng thật (`bedroom_3`) đánh số ở bước 4,
   * sau khi đã gán tầng, nên quan hệ mẹ–con không thể trỏ bằng mã thật ngay từ đây.
   */
  key?: string;
  /** Khoá tạm của phòng MẸ khi đây là khu vệ sinh của một phòng ngủ khép kín. */
  enclosedByKey?: string;
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
  let keySeq = 0;

  /**
   * Kiểm ghim tầng. Tách ra vì có ba chỗ gọi, và luật "ghim ngoài 1..floors thì bỏ GHIM chứ
   * không bỏ cả yêu cầu" là thứ chỉ nên viết một lần.
   */
  const checkPin = (type: string, pinned?: number): number | undefined => {
    if (pinned === undefined) return undefined;
    if (pinned < 1 || pinned > brief.floors) {
      warnings.push(
        // Nhãn tiếng Việt, không phải mã máy: câu này hiện thẳng cho kiến trúc sư đọc, và
        // "master_bedroom" thì không nói cho ai biết phòng nào đang bị bỏ ghim (CLAUDE.md 4.1).
        `Không gian "${ROOM_LABEL[type] ?? type}" ghim vào tầng ${pinned} nhưng công trình chỉ có ${brief.floors} tầng — bỏ qua ghim, để hệ thống tự xếp.`,
      );
      return undefined;
    }
    return pinned;
  };

  /**
   * Loại phòng suy từ THÀNH PHẦN GIA ĐÌNH — không bao giờ được thêm qua đường "mỗi loại một
   * cái", dù mã có đến từ đâu.
   *
   * Ba đường đều có thể đưa `bedroom` vào `extraSpaces`: bảng bí danh quy chữ tự do của khách
   * ("phòng ngủ cho con"), mô hình ngôn ngữ ở bước quy nhãn, và từ 07/09/2026 là cả Lớp 2a —
   * lời gọi thật đầu tiên trả về đúng `bedroom` và `master_bedroom` trong `add_spaces`.
   *
   * Thêm qua đường đó là cộng thêm MỘT phòng ngủ vào số đã suy từ gia đình, vì `overridden`
   * chỉ đối trừ những dòng khai tường minh ở `required_spaces`. Không lỗi, không cảnh báo —
   * chỉ là căn nhà có thừa một phòng ngủ mà không ai đặt.
   */
  const fromFamily = new Set(Object.values(norms.occupancy).map((rule) => rule.room_type));

  /** Mỗi loại một cái — dùng cho danh sách bắt buộc của loại hình và cho mã suy từ chữ tự do. */
  const addSingle = (type: string): void => {
    const norm = norms.spaces[type];
    if (!norm || managed.has(type) || fromFamily.has(type) || seen.has(type)) return;
    seen.add(type);
    requests.push({ type, preference: norm.floor });
  };

  // Danh sách bắt buộc của loại hình chạy TRƯỚC, nhưng phải biết trước đầu bài đã khai đích
  // danh những mã nào — nếu không nó thêm một cái, rồi vòng lặp bên dưới thêm cái thứ hai.
  //
  // ⚠️ Đây là một hồi quy có thật (06→07/09/2026), và nó hỏng ĐÚNG KIỂU khó thấy nhất: mọi
  // biệt thự khai `kitchen` trong danh sách không gian đều nhận HAI bếp và HAI phòng ăn. Không
  // lỗi, không cảnh báo — chỉ là hai dòng trông hợp lệ, cộng thêm khoảng 30 m² nhu cầu ảo vào
  // một tầng, khiến bước ép vừa sàn cắt mọi phòng khác về tối thiểu. Cái Haan nhìn thấy là
  // "biệt thự lớn mà bếp 6 m²" — 6 chính là `kitchen.min_m2`.
  const explicitTypes = new Set((brief.required_spaces ?? []).map((s) => s.type));
  for (const type of norms.mandatory[brief.building_type] ?? []) {
    if (!explicitTypes.has(type)) addSingle(type);
  }

  // ── Không gian khai tường minh: MỘT PHẦN TỬ = MỘT PHÒNG ─────────────────────────────
  //
  // Cùng một mã lặp lại nhiều lần là hợp lệ và có ý nghĩa: đó là cách ghim từng phòng ngủ vào
  // một tầng riêng, hoặc cho mỗi phòng một diện tích riêng. Trước 06/09/2026 `seen` chặn từ
  // cái thứ hai trở đi, nên một căn bảy phòng ngủ chỉ khai được một dòng.
  //
  // `seen` vẫn được đánh dấu để danh sách bắt buộc của loại hình không thêm một cái thứ hai
  // chồng lên — nhưng KHÔNG chặn chính vòng lặp này.
  //
  // Dòng phòng ngủ còn phải NHỚ LẠI được ở vòng suy diễn bên dưới, không chỉ đếm: nó mang
  // theo `ensuite`, và chính nó là dòng đứng thay cho một phòng ngủ suy từ gia đình. Bản
  // trước chỉ giữ số đếm nên vòng dưới không biết khu vệ sinh khép kín phải gắn vào đâu và
  // bỏ luôn — xem chú thích ở `overriddenRows`.
  type ExplicitRow = { space: NonNullable<typeof brief.required_spaces>[number]; key: string };
  const explicitRows = new Map<string, ExplicitRow[]>();
  for (const space of brief.required_spaces ?? []) {
    const norm = norms.spaces[space.type];
    if (!norm) {
      // Mã lạ KHÔNG bị nuốt: nó có thể là mã đúng nhưng chưa vào từ vựng, và im lặng bỏ đi
      // nghĩa là khách yêu cầu một không gian rồi không thấy nó ở đâu nữa.
      warnings.push(
        `Không gian "${space.type}" chưa có trong chuẩn diện tích nên chưa đưa vào chương trình.`,
      );
      continue;
    }
    if (managed.has(space.type)) continue;
    seen.add(space.type);
    const key = `k${(keySeq += 1)}`;
    const bucket = explicitRows.get(space.type) ?? [];
    bucket.push({ space, key });
    explicitRows.set(space.type, bucket);
    requests.push({
      type: space.type,
      preference: norm.floor,
      pinned: checkPin(space.type, space.floor ?? undefined),
      areaWanted: space.area_m2 ?? undefined,
      key,
    });
  }
  for (const type of inputs.extraSpaces ?? []) addSingle(type);

  // ── Phòng ngủ, suy từ thành phần gia đình ───────────────────────────────────────────
  //
  // Dòng `bedroom`/`master_bedroom` khai tường minh ở trên GHI ĐÈ lên bấy nhiêu phòng đầu
  // tiên của phần suy diễn, không cộng thêm. Không có luật này thì kiến trúc sư ghim một
  // phòng ngủ xuống tầng một sẽ vô tình làm căn nhà mọc thêm một phòng ngủ thứ tám.
  //
  // ⚠️ Ghi đè KHÔNG được làm mất khu vệ sinh khép kín. Bản trước chỉ đếm số dòng khai tường
  // minh rồi `continue`, nên phòng bị đứng thay mất luôn khối `wc` gắn kèm — không lỗi, không
  // cảnh báo, chỉ là căn nhà thiếu một khu vệ sinh. Nó vô hại chừng nào hiếm ai khai tường
  // minh phòng ngủ; từ 07/09/2026 biểu mẫu tự sinh MỌI dòng phòng ngủ nên nó sẽ đúng luôn.
  //
  // Nay giữ lại chính dòng đó: `ensuite` của dòng thắng (biểu mẫu đã đồng bộ theo gia đình),
  // và khi dòng không nói gì — đầu bài cũ — thì rơi về câu trả lời của nhóm thành viên.
  const overriddenRows = new Map([...explicitRows].map(([type, rows]) => [type, [...rows]]));
  let bedrooms = 0;
  let ensuiteCount = 0;
  for (const member of brief.family ?? []) {
    const rule = norms.occupancy[member.role];
    if (!rule || member.count <= 0) continue;
    // Chấp nhận CẢ hai cách khai. Trước 06/09/2026 "khép kín" được gõ thành chuỗi `"wc"`
    // trong `needs` — chuỗi đó chưa bao giờ có tác dụng, nhưng nó nằm sẵn trong các đầu bài
    // đã lưu. Đọc nó ở đây rẻ hơn nhiều so với di trú một cột `jsonb` của artifact bất biến,
    // và nó làm đúng điều người khai đã định làm ngay từ đầu.
    const memberEnsuite = member.ensuite === true || (member.needs ?? []).includes('wc');
    for (let i = 0; i < Math.ceil(member.count / rule.per_room); i += 1) {
      bedrooms += 1;
      const standIn = overriddenRows.get(rule.room_type)?.shift();
      if (standIn) {
        // Phòng này đã có một dòng khai tường minh đứng thay. Vẫn ĐẾM vào `bedrooms` vì định
        // mức khu vệ sinh tính trên tổng số phòng ngủ thật, không trên số phòng suy diễn.
        const wants = standIn.space.ensuite ?? memberEnsuite;
        if (wants && norms.spaces.wc) {
          ensuiteCount += 1;
          requests.push({
            type: 'wc',
            preference: 'any',
            key: `k${(keySeq += 1)}`,
            enclosedByKey: standIn.key,
          });
        }
        continue;
      }
      const key = `k${(keySeq += 1)}`;
      requests.push({
        type: rule.room_type,
        // Nguyện vọng tầng của chính gia đình thắng mặc định theo vai trò.
        //
        // Hai cách khai, và `floor` thắng khi có cả hai. `floor` là số tầng THẬT nên nó GHIM;
        // `floor_pref` là nguyện vọng tương đối ("tầng giữa") nên nó chỉ định hướng. Cách cũ
        // vẫn đọc để đầu bài đã lưu không mất câu trả lời, nhưng biểu mẫu không sinh thêm giá
        // trị mới cho nó: "tầng giữa" của một căn hai tầng không trỏ vào tầng nào.
        preference: (member.floor_pref as FloorPreference | null | undefined) ?? rule.floor,
        pinned: checkPin(rule.room_type, member.floor ?? undefined),
        key,
      });
      // ── Phòng ngủ khép kín ────────────────────────────────────────────────────────
      // Khu vệ sinh nằm TRONG phòng, nên nó không mở ra hành lang và không thay được một khu
      // vệ sinh chung của tầng. `pinned` để rỗng ở đây: tầng của nó phải bằng tầng phòng mẹ,
      // mà tầng đó chỉ biết sau bước cân tải — `assignFloors` đặt nốt.
      if (memberEnsuite && norms.spaces.wc) {
        ensuiteCount += 1;
        requests.push({
          type: 'wc',
          preference: 'any',
          key: `k${(keySeq += 1)}`,
          enclosedByKey: key,
        });
      }
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
  //
  // KẸP VỀ 1 cho tới khi bộ giải nhận được nhiều lõi (V-21). `_align_cores` trong
  // `compute/…/solver/model.py` ép MỌI phòng thuộc nhóm lõi trùng khít với lõi ĐẦU TIÊN —
  // kể cả hai lõi trên cùng một tầng, vốn phải là hai ô rời nhau. Thả giá trị 2 xuống tới đó
  // là một `InfeasibilityReport` có bảo đảm, và nó sẽ đổ lỗi cho `stair_alignment` chứ không
  // chỉ về đây. Kẹp kèm cảnh báo còn hơn: người dùng biết yêu cầu của mình chưa được đáp ứng.
  const requestedCores = brief.massing?.cores_preferred ?? 1;
  const cores = Math.min(requestedCores, 1);
  if (requestedCores > cores) {
    warnings.push(
      `Đầu bài muốn ${requestedCores} lõi thang, đang tạm xếp ${cores} — bộ giải chưa đặt được nhiều lõi tách rời. Yêu cầu này được giữ lại và sẽ áp dụng khi phần đó hoàn thiện.`,
    );
  }
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
    //
    // Phòng khép kín KHÔNG tính vào định mức này: nó đã có khu vệ sinh riêng bên trong, và
    // đếm nó hai lần cho ra một căn nhà thừa nhà vệ sinh đúng bằng số phòng khép kín.
    const shared = Math.max(0, bedrooms - ensuiteCount);
    const byBedrooms = Math.ceil(shared / Math.max(1, norms.derived.wc.per_bedrooms));
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
  buildable: number,
  warnings: string[],
): { instances: Instance[]; plate: number } {
  const rulePreference = rules.floorPreference(buildingType);
  const load = new Array<number>(floors + 1).fill(0);
  const placed: Instance[] = [];
  const pending: Array<{ instance: Omit<Instance, 'floor'>; range: [number, number] }> = [];

  // Khu vệ sinh khép kín KHÔNG đi qua vòng cân tải: tầng của nó không phải một lựa chọn mà là
  // hệ quả — bằng đúng tầng phòng mẹ. Để nó tự chọn thì sớm muộn có một phòng ngủ tầng hai với
  // khu vệ sinh riêng nằm ở tầng một.
  const enclosed = requests.filter((r) => r.enclosedByKey !== undefined);
  for (const request of requests.filter((r) => r.enclosedByKey === undefined)) {
    const norm = norms.spaces[request.type]!;
    const base: Omit<Instance, 'floor'> = {
      type: request.type,
      preference: request.preference,
      priority: norm.priority,
      key: request.key,
      ...areasFor(
        request.type,
        norm,
        rules,
        buildingType,
        inputs,
        scale,
        request.areaWanted,
        norms,
      ),
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

  // ── Cỡ sàn: chia đều nhu cầu cho SỐ TẦNG đã khai ─────────────────────────────────────
  //
  // Phải tính TRƯỚC vòng cân tải, vì chính nó là sức chứa mà vòng đó dùng để quyết định khi
  // nào mở tầng mới. Lấy trần xây được làm sức chứa (cách cũ) hỏng theo hai chiều cùng lúc:
  // tầng dưới nhồi chặt trong khi tầng trên gần như trống, rồi phần sàn không ai nhận ở tầng
  // trên dồn hết vào khối giao thông — đo được 54 % mặt sàn là hành lang ở một biệt thự ba
  // tầng cho gia đình ba người.
  //
  // Lấy tầng NẶNG NHẤT làm mốc cũng sai, và sai theo đúng kiểu đó: nó chỉ nói tầng một cần
  // bao nhiêu, không nói cả công trình cần bao nhiêu.
  //
  // Chia cho `1 − tỉ lệ giao thông` để chừa chỗ hành lang. Không cộng thẳng giao thông vào
  // nhu cầu: diện tích của nó là HỆ QUẢ của diện tích sàn, cộng vào là tự tham chiếu.
  //
  // Một con số cho CẢ công trình, không phải mỗi tầng một con số: bộ giải dựng đúng một hình
  // bao dùng chung cho mọi tầng (`compute/.../solver/model.py::_footprint`).
  const circulationRatio = norms.derived.circulation?.ratio_of_floor ?? 0;
  const roomDemand =
    [...placed, ...pending.map((p) => p.instance)]
      .filter((it) => it.type !== 'circulation')
      .reduce((sum, it) => sum + it.target, 0) +
    enclosed.reduce((sum, r) => {
      const norm = norms.spaces[r.type];
      return norm
        ? sum + areasFor(r.type, norm, rules, buildingType, inputs, scale, r.areaWanted).target
        : sum;
    }, 0);
  const capacity = Math.min(buildable, roomDemand / floors / (1 - circulationRatio));

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

  // ── Cỡ sàn thật, sau khi đã biết phòng nào nằm tầng nào ──────────────────────────────
  //
  // Sức chứa ở trên là mức chia ĐỀU; cỡ sàn thật phải lấy tầng NẶNG NHẤT, vì không phải phòng
  // nào cũng dời được. Phòng khách, bếp, phòng ăn và chỗ để xe đều mang nguyện vọng `ground`,
  // nên nhu cầu tầng một là một con số không thương lượng — đặt sàn nhỏ hơn nó thì mọi phòng
  // tầng một bị cắt về tối thiểu quy chuẩn, đúng cái sai vừa phải sửa.
  //
  // Hai vế cùng có mặt là có chủ ý: vế chia đều đẩy vòng cân tải rải phòng cho hết các tầng
  // (thay vì nhồi tầng dưới rồi bỏ tầng trên gần trống), vế tầng nặng nhất giữ cho không tầng
  // nào bị bóp. Bỏ vế nào cũng hỏng, và hỏng theo hai kiểu ngược nhau — đã đo cả hai.
  const plateFor = (level: number): number => {
    const onFloor = placed.filter((it) => it.floor === level);
    if (!onFloor.length) return 0;
    const rooms = onFloor.filter((it) => it.type !== 'circulation');
    return rooms.reduce((sum, it) => sum + it.target, 0) / (1 - circulationRatio);
  };
  let plate = capacity;
  for (let level = 1; level <= floors; level += 1) plate = Math.max(plate, plateFor(level));
  plate = Math.min(buildable, plate);

  // Khu vệ sinh khép kín: đặt vào đúng tầng phòng mẹ, sau khi mọi phòng mẹ đã có tầng.
  const floorByKey = new Map(placed.filter((it) => it.key).map((it) => [it.key!, it.floor]));
  for (const request of enclosed) {
    const parentFloor = floorByKey.get(request.enclosedByKey!);
    if (parentFloor === undefined) continue;
    const norm = norms.spaces[request.type]!;
    const areas = areasFor(
      request.type,
      norm,
      rules,
      buildingType,
      inputs,
      scale,
      request.areaWanted,
      norms,
    );
    load[parentFloor] = (load[parentFloor] ?? 0) + areas.target;
    placed.push({
      type: request.type,
      preference: request.preference,
      priority: norm.priority,
      key: request.key,
      enclosedByKey: request.enclosedByKey,
      floor: parentFloor,
      ...areas,
    });
  }

  // Tầng còn trống quá thì thêm không gian bổ sung theo danh sách của loại hình — tới khi đủ
  // ngưỡng, hoặc hết danh sách. Mỗi loại một cái mỗi tầng.
  const fillers = norms.allocation.fillers[buildingType] ?? [];
  const floorOf = new Map<number, Set<string>>();
  for (const it of placed) floorOf.set(it.floor, (floorOf.get(it.floor) ?? new Set()).add(it.type));
  for (let level = 1; level <= floors; level += 1) {
    for (const type of fillers) {
      if ((load[level] ?? 0) >= plate * norms.allocation.filler_below_ratio) break;
      const norm = norms.spaces[type];
      if (!norm || floorOf.get(level)?.has(type)) continue;
      // Không gian bổ sung vẫn phải TÔN TRỌNG nguyện vọng tầng của chính nó — bỏ vế này thì
      // engine rải sân thượng lên tầng hai VÀ tầng ba của một căn ba tầng, và đặt sân trong ở
      // tầng ba. Hai thứ đó không sai về diện tích nên không bộ đo nào bắt được; chúng chỉ sai
      // về nghề. Quy tắc thắng nguyện vọng, cùng thứ tự với vòng cân tải ở trên.
      const fromRule = rulePreference.get(type);
      const preference: FloorPreference =
        fromRule === 'top' ? 'top' : fromRule === 'ground' ? 'ground' : norm.floor;
      const [lo, hi] = floorRange(preference, floors);
      if (level < lo || level > hi) continue;
      const areas = areasFor(type, norm, rules, buildingType, inputs, scale, undefined, norms);
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
  return { instances: placed, plate };
}

/** Ba con số diện tích của một loại phòng, theo đúng thứ tự ưu tiên ba nguồn tri thức. */
function areasFor(
  type: string,
  norm: SpaceNorms['spaces'][string],
  rules: RulePack,
  buildingType: string,
  inputs: ProgramInputs,
  scale: number,
  areaWanted?: number,
  norms?: SpaceNorms,
): { min: number; target: number; max: number; weight: number; fixedArea: boolean } {
  const min = Math.max(norm.min_m2, rules.minArea(buildingType, type) ?? 0);
  const fromPriors = inputs.priors?.medianFor(type) ?? null;
  // Diện tích khai tường minh đứng TRÊN cả thống kê lẫn chuẩn nghề — đó là người biết công
  // trình này nói ra. Nhưng nó không đứng trên tối thiểu quy chuẩn: con số đó không thương
  // lượng được, kể cả khi khách muốn nhỏ hơn.
  const decided = areaWanted ?? fromPriors ?? null;
  // `target` ở đây là NHU CẦU TỰ NHIÊN của loại phòng: dùng để cân tải giữa các tầng và để
  // suy ra công trình cần bao nhiêu sàn. Diện tích CUỐI CÙNG do `allocateAreas` quyết —
  // trừ khi con số đã được người hoặc dữ liệu đo ấn định, lúc đó nó đứng nguyên.
  const target = Math.max(min, decided ?? norm.target_m2 * scale);
  const max = Math.max(target, norm.max_m2);
  // Ba bậc nhấn mạnh của Lớp 2a nhân vào TRỌNG SỐ, không vào diện tích. Đó là toàn bộ đường
  // đi của đầu ra mô hình ngôn ngữ vào con số: nó đổi được thứ tự ưu ái khi chia phần sàn còn
  // dư, và không đổi được tối thiểu quy chuẩn hay trần nghề.
  const level = inputs.intent?.emphasis?.find((e) => e.space_type === type)?.level;
  const factor = level && norms ? (norms.allocation.emphasis[level] ?? 1) : 1;
  return { min, target, max, weight: norm.weight * factor, fixedArea: decided !== null };
}

/**
 * Chọn DIỆN TÍCH SÀN THẬT của một tầng — giữa nhu cầu và trần pháp lý.
 *
 * Trước 07/09/2026 không có bước này: mọi tầng lấy luôn diện tích XÂY ĐƯỢC. Nhưng sàn xây
 * được là một TRẦN, không phải một yêu cầu. Hệ quả đo được trên bộ đầu bài đại diện: nhà vườn
 * 20 × 30 m cho một gia đình sáu người xếp được 224 m² trên sàn 360 m² — 38 % mặt sàn không
 * thuộc phòng nào, mà bộ giải thì chia HẾT mặt sàn nên phần đó phải chui vào một phòng nào đó
 * không ai chọn. Bảy đầu bài thì sáu cái dính, tầng thấp nhất chỉ lấp 34 %.
 *
 * Ba con số vào đây:
 *  · **nhu cầu tự nhiên** của tầng nặng nhất — tổng diện tích chuẩn nghề của các phòng, chia
 *    cho `1 − tỉ lệ giao thông` để chừa chỗ cho hành lang. Không cộng thẳng giao thông vào:
 *    diện tích của nó là HỆ QUẢ của diện tích sàn, cộng vào là tự tham chiếu.
 *  · **tối thiểu quy chuẩn** của tầng nặng nhất — sàn không được nhỏ hơn con số này.
 *  · **trần xây được** — không được lớn hơn.
 *
 * Một con số cho CẢ công trình, không phải mỗi tầng một con số: bộ giải dựng đúng một hình
 * bao cho mọi tầng (`compute/.../solver/model.py::_footprint`). Tầng nhẹ hơn được lấp đầy ở
 * bước cấp phát; đó là lý do bước này lấy tầng NẶNG NHẤT làm mốc.
 */
function sizeFloorPlate(
  instances: Instance[],
  floors: number,
  buildable: number,
  norms: SpaceNorms,
  warnings: string[],
): number {
  const circulationRatio = norms.derived.circulation?.ratio_of_floor ?? 0;
  let natural = 0;
  let minimum = 0;
  for (let level = 1; level <= floors; level += 1) {
    const onFloor = instances.filter((it) => it.floor === level);
    if (!onFloor.length) continue;
    const rooms = onFloor.filter((it) => it.type !== 'circulation');
    natural = Math.max(
      natural,
      rooms.reduce((sum, it) => sum + it.target, 0) / (1 - circulationRatio),
    );
    minimum = Math.max(
      minimum,
      onFloor.reduce((sum, it) => sum + it.min, 0),
    );
  }

  if (minimum > buildable) {
    warnings.push(
      `Nhu cầu tối thiểu của tầng nặng nhất là ${formatNumber(minimum)} m² nhưng sàn xây được chỉ ${formatNumber(buildable)} m². Cân nhắc giảm số phòng, tăng số tầng, hoặc xem lại khoảng lùi và mật độ.`,
    );
    return buildable;
  }
  return Math.min(buildable, Math.max(natural, minimum));
}

/**
 * Cấp phát diện tích từng phòng — chia NGÂN SÁCH SÀN, không dán một con số cố định.
 *
 * ── Vì sao đổi cách làm (07/09/2026) ──────────────────────────────────────────────────
 * Bản cũ lấy `target_m2` của chuẩn nghề nhân với một hệ số theo DẢI BỀ RỘNG lô, rồi cắt dần
 * theo độ ưu tiên nếu vượt sàn. Hai chỗ hỏng, và cả hai đều lộ ra trên hồ sơ thật:
 *
 *  1. **Không co giãn theo quy mô.** Dải rộng nhất chỉ nhân 1,3 lần, nên biệt thự mặt tiền
 *     15 m và nhà phố mặt tiền 9 m nhận CÙNG một bộ số. Phòng khách biệt thự 28,6 m².
 *  2. **Cắt về đúng tối thiểu.** Khi một tầng quá tải, phòng ưu tiên thấp bị cắt về
 *     `min_m2` — và `min_m2` là ngưỡng QUY CHUẨN, thứ không ai thiết kế tới. Haan nhìn thấy
 *     "biệt thự lớn mà bếp 6 m²"; 6 chính là `kitchen.min_m2`.
 *
 * ── Cách làm mới ──────────────────────────────────────────────────────────────────────
 * Mọi phòng nhận TỐI THIỂU trước, rồi phần sàn còn dư chia theo `weight`, dâng dần
 * (water-filling): phòng nào chạm trần nghề thì rút ra, phần của nó chia lại cho những phòng
 * còn lại. Nhờ đó cùng một bảng chuẩn cho ra bếp 10 m² trong nhà phố 90 m²/tầng và bếp 17 m²
 * trong biệt thự 180 m²/tầng, mà không cần hệ số nhân nào.
 *
 * Ba loại KHÔNG đi qua vòng chia:
 *  · **giao thông** — lấy theo tỉ lệ mặt sàn (`06-knowledge-base` 6.4). Hành lang của tầng
 *    40 m² và tầng 120 m² không thể bằng nhau, mà cũng không co giãn theo trọng số được.
 *  · **phòng có diện tích đã ấn định** — khách khai đích danh, hoặc thống kê thực nghiệm đo
 *    được. Chia lại là ghi đè lên câu trả lời của người biết rõ hơn.
 *  · **phòng có `weight: 0`**.
 *
 * Chiều THIẾU chỗ vẫn giữ nguyên cách cũ (nhường theo độ ưu tiên) — nó là cách kiến trúc sư
 * xử lý một lô chật, và ở đó việc chạm tối thiểu là có thật chứ không phải một lỗi.
 */
function allocateAreas(
  instances: Instance[],
  floors: number,
  plate: number,
  norms: SpaceNorms,
  warnings: string[],
): void {
  for (let level = 1; level <= floors; level += 1) {
    const onFloor = instances.filter((it) => it.floor === level);
    if (!onFloor.length) continue;

    // ── Giao thông: theo tỉ lệ mặt sàn ───────────────────────────────────────────────
    const circulation = onFloor.filter((it) => it.type === 'circulation');
    for (const it of circulation) {
      const byRatio = (plate * norms.derived.circulation.ratio_of_floor) / circulation.length;
      it.target = Math.min(Math.max(byRatio, it.min), it.max);
    }

    const rest = onFloor.filter((it) => it.type !== 'circulation');
    for (const it of rest.filter((x) => x.fixedArea)) {
      it.target = Math.min(Math.max(it.target, it.min), it.max);
    }

    const spentFixed =
      circulation.reduce((sum, it) => sum + it.target, 0) +
      rest.filter((it) => it.fixedArea).reduce((sum, it) => sum + it.target, 0);
    const pool = rest.filter((it) => !it.fixedArea);
    const minSum = pool.reduce((sum, it) => sum + it.min, 0);
    let budget = plate - spentFixed;

    if (budget < minSum) {
      // ── Chiều thiếu chỗ ────────────────────────────────────────────────────────────
      // Nhường theo ĐỘ ƯU TIÊN: cái ưu tiên thấp nhất về tối thiểu trước. Co đều tất cả sẽ
      // làm phòng khách và nhà kho cùng hụt như nhau — không phải cách kiến trúc sư xử lý.
      for (const it of pool) it.target = it.min;
      let excess = minSum - budget;
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
    } else {
      // ── Chiều đủ chỗ: dâng dần theo trọng số ───────────────────────────────────────
      for (const it of pool) it.target = it.min;
      let spare = budget - minSum;
      let active = pool.filter((it) => it.weight > 0 && it.max > it.min + 0.01);
      // Chặn trên số vòng: nới trần từng phòng làm số vòng nhiều nhất bằng số phòng, cộng
      // một vòng dừng. Vòng `while` trần trụi ở đây là chỗ dễ treo cả yêu cầu nhất.
      for (let guard = 0; guard <= pool.length && spare > 0.01 && active.length; guard += 1) {
        const weightSum = active.reduce((sum, it) => sum + it.weight, 0);
        if (weightSum <= 0) break;
        let used = 0;
        const next: Instance[] = [];
        for (const it of active) {
          const give = Math.min((spare * it.weight) / weightSum, it.max - it.target);
          it.target += give;
          used += give;
          if (it.max - it.target > 0.01) next.push(it);
        }
        spare -= used;
        active = next;
        if (used <= 0.01) break;
      }

      // ── Mọi phòng đã chạm trần NGHỀ mà sàn vẫn dư ──────────────────────────────────
      //
      // Xảy ra khi một tầng có ít phòng hơn tầng nặng nhất — mà cỡ sàn thì dùng chung cho cả
      // công trình (bộ giải dựng đúng một hình bao). Nhà bốn tầng cho bảy người là ví dụ:
      // tầng một gánh phòng khách, bếp, phòng ăn và chỗ để xe; tầng ba chỉ có hai phòng ngủ.
      //
      // Bản đầu dồn hết phần dư vào khối giao thông. Sai, và đo được: 40 % mặt sàn thành hành
      // lang. Trần `max_m2` là mức RỘNG RÃI của chuẩn nghề, không phải giới hạn vật lý — nếu
      // tầng đã tồn tại thì diện tích phải nằm ở đâu đó, và một phòng ngủ 32 m² vẫn tốt hơn
      // một hành lang 35 m². Nên: chia tiếp cho các phòng theo trọng số, lần này KHÔNG trần.
      //
      // Giao thông chỉ nhận phần cuối cùng khi không còn phòng nào nhận được (tầng chỉ có
      // thang và hành lang).
      if (spare > 0.5) {
        // Trần `max_m2` KHÔNG được vượt ở đây, và đó là một quyết định đã thử cả hai chiều:
        // bản đầu chia tiếp phần dư mà bỏ trần, và nó cho ra phòng ngủ chính 69 m² trong một
        // căn 112 m²/tầng — đổi một cái vô lý (hành lang 40 %) lấy một cái vô lý khác.
        //
        // Phần dư còn lại giao cho khối giao thông, vì đó đúng là thứ nó là: sảnh, chiếu nghỉ,
        // phần sàn không thuộc phòng nào. Và NÓI RA — phần dư lớn nghĩa là chương trình thiếu
        // không gian so với số tầng đã khai, thứ chỉ người mới quyết được (thêm phòng, hay bớt
        // một tầng).
        const absorber = circulation[0] ?? [...onFloor].sort((a, b) => a.priority - b.priority)[0];
        if (absorber) {
          absorber.target += spare;
          absorber.max = Math.max(absorber.max, absorber.target);
        }
        if (spare > plate * 0.12) {
          warnings.push(
            `Tầng ${level}: chương trình chỉ cần ${formatNumber(plate - spare)} m² nhưng sàn dùng chung của công trình là ${formatNumber(plate)} m². Còn dư ${formatNumber(spare)} m² đang dồn vào khối giao thông — cân nhắc thêm không gian cho tầng này hoặc giảm một tầng.`,
          );
        }
      }
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
export function buildAdjacency(
  spaces: SpaceProgram['spaces'],
  rules: RulePack,
  norms: SpaceNorms,
  buildingType: string,
  /** Đầu bài khai có lối dịch vụ riêng cho bếp (`massing.service_core`). */
  serviceCore: boolean,
): SpaceProgram['adjacency'] {
  const out: NonNullable<SpaceProgram['adjacency']> = [];
  const seen = new Set<string>();

  // Khu vệ sinh khép kín phải KỀ phòng mẹ — không phải nguyện vọng nghề mà là định nghĩa của
  // "khép kín". Đặt trước vòng quy tắc và trọng số 1 để không quy tắc nào ghi đè xuống thấp hơn.
  for (const space of spaces) {
    if (!space.enclosed_in) continue;
    const key = [space.id, space.enclosed_in].sort().join('|') + '|adjacent';
    seen.add(key);
    out.push({ a: space.enclosed_in, b: space.id, kind: 'adjacent', weight: 1 });
  }

  // Lối dịch vụ riêng: bếp phải chạm được khối giao thông, và khối đó KHÔNG nằm sát phòng
  // khách — đó là toàn bộ nghĩa của «không đi qua khu tiếp khách».
  //
  // Diễn đạt bằng quan hệ chứ không bằng hình học, vì đây là quy ước tiện nghi chứ không phải
  // quy chuẩn: nó thuộc HÀM MỤC TIÊU của bộ giải, không phải ràng buộc cứng. Đặt thành ràng
  // buộc cứng thì một lô hẹp không đủ chỗ cho hai tuyến đi sẽ thành vô nghiệm, và người dùng
  // mất cả phương án chỉ vì một ô chọn tiện nghi.
  //
  // Trọng số lấy mức `warning` của chuẩn diện tích — cùng thang với mọi quan hệ khác, không
  // dựng một con số riêng ở đây (CLAUDE.md 8.7).
  if (serviceCore) {
    const weight = norms.adjacency_weight.warning;
    for (const kitchen of spaces.filter((s) => s.type === 'kitchen')) {
      for (const route of spaces.filter(
        (s) => s.type === 'circulation' && s.floor === kitchen.floor,
      )) {
        const key = [kitchen.id, route.id].sort().join('|') + '|adjacent';
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ a: kitchen.id, b: route.id, kind: 'adjacent', weight });
        }
        for (const living of spaces.filter((s) => s.type === 'living' && s.floor === route.floor)) {
          const far = [living.id, route.id].sort().join('|') + '|separate';
          if (seen.has(far)) continue;
          seen.add(far);
          out.push({ a: route.id, b: living.id, kind: 'separate', weight });
        }
      }
    }
  }

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
