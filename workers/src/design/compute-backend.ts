/**
 * `ComputeBackend` — ranh giới runtime duy nhất giữa Worker và Container.
 *
 * Nguồn: doc/design/02-architecture.md mục 2.2, CLAUDE.md 8.3 và 8.5 T3.
 *
 * Container chạy bộ giải CP-SAT, hình học, CAD, mô hình ba chiều — những thứ chỉ có ở Python.
 * Nó KHÔNG gọi ngược Worker: nhận đầu vào, trả đầu ra, không có tác dụng phụ nào ngoài giá
 * trị trả về. Nhờ vậy đổi chỗ triển khai chỉ là đổi adapter.
 *
 * ⚠️ Cloudflare Containers ghi `N/A` trên gói Workers Free, mà giai đoạn dev giữ gói Free.
 * Nên giai đoạn này Container chạy bằng Docker tại chỗ và Worker gọi qua HTTP. Khi nâng gói:
 * đổi `createComputeBackend` sang `ContainerComputeBackend`, mở phần `containers[]` đang để
 * chú thích trong `wrangler.jsonc`. **Chỗ phải đổi nằm đúng trong tệp này.**
 */

import type { DesignEnv } from './env';

export interface SolveRequest {
  /** `LayoutIntent` đã kiểm hợp đồng. */
  intent: unknown;
  /**
   * Mã artifact của `LayoutIntent`. Worker cấp, Container KHÔNG tự băm: băm ở hai nơi là
   * hai cách chuẩn hoá JSON sẽ lệch nhau, và mã băm là khoá chính của artifact.
   */
  intent_ref: string;
  /** `SpaceProgram` đã kiểm hợp đồng — bộ giải cần diện tích tối thiểu/tối đa của từng phòng. */
  program: unknown;
  /**
   * Ô chữ nhật xây được, cộng những gì thửa đất áp lên phần đặt khối.
   *
   * `width_m`/`depth_m` là ô chữ nhật lớn nhất nội tiếp thửa — Worker quy đổi một lần ở
   * `solveFloorPlan`. `area_m2` là diện tích THẬT của thửa, dùng làm mẫu số cho mật độ xây
   * dựng: lấy tích hai cạnh ô chữ nhật là phạt oan mọi thửa không vuông vắn.
   *
   * `open_faces`/`access_faces` suy từ hiện trạng bốn phía trong đầu bài. Gửi sang thay vì
   * để Container đoán: "nhà phố có hai mặt thoáng" đúng với phần lớn thửa và sai với lô góc.
   */
  site: {
    width_m: number;
    depth_m: number;
    area_m2?: number;
    open_faces?: string[];
    access_faces?: string[];
    setback_required_m?: Record<string, number>;
    max_density?: number | null;
  };
  rule_pack: { locality: string; version?: string };
  time_budget_s: number;
  /**
   * Nhãn tiếng Việt của từng không gian.
   *
   * Container không giữ bảng từ vựng (CLAUDE.md 8.7) nhưng câu thông báo vi phạm phải đọc
   * được. Thiếu nhãn thì câu rơi về mã không gian — đúng chứ không đẹp.
   */
  labels?: Record<string, string>;
  /**
   * Thành viên của từng nhóm mã phòng: `habitable` gồm những mã nào.
   *
   * Quy tắc nhắm cả nhóm (`target: habitable`) chỉ áp đúng khi bộ giải biết nhóm đó gồm gì.
   * Gửi sang thay vì để Container tự tra, cùng lý do với `labels`.
   */
  groups?: Record<string, string[]>;
}

/** Bộ giải trả về MỘT trong hai: mặt bằng, hoặc lời giải thích vì sao vô nghiệm. */
export type SolveResponse =
  | { status: 'ok'; floor_plan: unknown; solve_time_ms: number }
  | { status: 'infeasible'; report: unknown; solve_time_ms: number };

/** Một bản vẽ CAD gửi sang Container để trích hình học (Mốc 3, Bước 1). */
export interface CadFile {
  /** Tên tệp gốc. Phần mở rộng quyết định có phải chạy qua bộ chuyển đổi ODA không. */
  name: string;
  bytes: ArrayBuffer | Uint8Array;
}

export interface KbRecordRequest {
  tenant_id: string;
  project_code: string;
  building_type: string;
  site: Record<string, unknown>;
  /** Kết quả `/extract` gửi trả NGUYÊN VẸN — Container không giữ trạng thái. */
  plans: unknown[];
  /** Mã phòng đã chuẩn hoá, theo từng tầng. Thiếu thì bản ghi vẫn hợp lệ, chỉ mất few-shot. */
  room_types?: (string | null)[][];
  project_id?: string | null;
  tier?: string;
  has_brief?: boolean;
  family_archetype?: string | null;
  style?: string | null;
}

export interface KbRecordResponse {
  status: 'ok';
  record: unknown;
  /** Trả riêng chứ không gói vào `quality_score`: người xác nhận cần biết mất điểm vì gì. */
  checks: { code: string; outcome: 'pass' | 'fail' | 'skipped'; detail: string }[];
}

/** Khung tên của bản vẽ xuất ra. Container không biết mã hồ sơ của NVG — Worker cấp hết. */
export interface DxfTitleBlock {
  project_code: string;
  project_name: string;
  discipline: string;
  sheet: string;
  version: string;
  date: string;
}

export interface ExportDxfRequest {
  floor_plan: unknown;
  level: number;
  title_block: DxfTitleBlock;
  /** Mã không gian → nhãn tiếng Việt (`spaceLabels`). Container không tự tra `kb/`. */
  labels?: Record<string, string>;
  /** Nhóm mã phòng (`group_targets`) — để đa giác phòng mang `data-group` cho CSS tô màu. */
  groups?: Record<string, string[]>;
  /** Mã tờ theo họ `kt/NN`; rỗng thì Container đặt theo số tầng. */
  sheet_code?: string;
}

export interface SchedulesRequest {
  floor_plan: unknown;
  floorplan_ref: string;
  labels?: Record<string, string>;
  title?: string;
}

/**
 * Kết quả kiểm tra sống của lớp tính toán.
 *
 * `solverVersion` là dấu vân của mã hình học + chuẩn cấu tạo + rule pack trong ảnh Docker
 * (`compute/src/design_compute/version.py`). Nó phải nằm trong khoá bộ nhớ đệm của bước giải:
 * thiếu nó, sửa xong mã hình học rồi dựng lại ảnh vẫn nhận về đúng mặt bằng cũ, không lỗi và
 * không cảnh báo. Rỗng nghĩa là Container không nói ra được — khi đó KHÔNG dùng lại kết quả cũ.
 */
export interface ComputeHealth {
  reachable: boolean;
  solverVersion: string | null;
}

export interface ComputeBackend {
  readonly name: string;
  health(): Promise<ComputeHealth>;
  solve(request: SolveRequest): Promise<SolveResponse>;
  /**
   * Xuất một tầng của mặt bằng ra DXF. MỘT CHIỀU — không có đường nhập ngược (CLAUDE.md 8.7).
   *
   * Trả byte chứ không trả đường dẫn: Container không giữ trạng thái và không ghi ra đĩa, nên
   * không có chỗ nào để tệp nằm lại chờ ai tới lấy.
   */
  exportDxf(request: ExportDxfRequest): Promise<ArrayBuffer>;
  /**
   * CÙNG tờ bản vẽ đó dạng SVG để trình duyệt hiển thị — Container dựng từ một `SheetModel`
   * duy nhất cho cả DXF lẫn SVG (bất biến #5: trình duyệt không dựng hình).
   */
  exportSvg(request: ExportDxfRequest): Promise<string>;
  /** Khối ba chiều sơ bộ (glTF nhị phân) đùn từ mặt bằng — trình duyệt chỉ xem. */
  exportGlb(request: { floor_plan: unknown }): Promise<ArrayBuffer>;
  /** Bảng thống kê cửa · cửa sổ · diện tích · khối lượng sơ bộ — tính lại từ mặt bằng (TK-17). */
  schedules(request: SchedulesRequest): Promise<unknown>;
  /** Cùng bảng đó dạng XLSX để bàn giao. */
  exportXlsx(request: SchedulesRequest): Promise<ArrayBuffer>;
  /** Bước 1 số hoá — trích hình học từ một bản vẽ `.dxf`/`.dwg`. */
  extract(file: CadFile): Promise<{ status: 'ok'; extraction: unknown }>;
  /** Bước 2 số hoá — kiểm tra chéo và lắp bản ghi Knowledge Base. */
  buildKbRecord(request: KbRecordRequest): Promise<KbRecordResponse>;
}

/** Lỗi gọi Container — CÓ thể thử lại (mạng, container đang khởi động). */
export class ComputeUnavailable extends Error {
  readonly retryable = true;

  constructor(message: string) {
    super(`Không gọi được lớp tính toán: ${message}`);
    this.name = 'ComputeUnavailable';
  }
}

/** Adapter HTTP — Container chạy bằng Docker tại chỗ trong giai đoạn dev. */
export class HttpComputeBackend implements ComputeBackend {
  readonly name = 'http';

  constructor(private readonly baseUrl: string) {}

  private async call<T>(path: string, body?: unknown, timeoutMs = 120_000): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ComputeUnavailable(error instanceof Error ? error.message : String(error));
    }
    if (!res.ok) {
      // 4xx là lỗi dữ liệu đầu vào — thử lại vô ích. Chỉ 5xx mới đáng thử lại.
      const detail = await res.text().catch(() => '');
      if (res.status >= 500) throw new ComputeUnavailable(`máy chủ trả ${res.status}. ${detail}`);
      throw new Error(`Lớp tính toán từ chối yêu cầu (${res.status}). ${detail}`);
    }
    return (await res.json()) as T;
  }

  async health(): Promise<ComputeHealth> {
    try {
      const body = await this.call<{ ok: boolean; solver_version?: string }>(
        '/health',
        undefined,
        5_000,
      );
      return { reachable: true, solverVersion: body.solver_version ?? null };
    } catch {
      return { reachable: false, solverVersion: null };
    }
  }

  solve(request: SolveRequest): Promise<SolveResponse> {
    return this.call<SolveResponse>('/solve', request);
  }

  /**
   * Gửi tệp CAD bằng multipart.
   *
   * ⚠️ Đây là quyết định của GIAI ĐOẠN PHÁT TRIỂN, không phải của kiến trúc. Đích đến đã chốt
   * là R2 (CLAUDE.md 8.5 T4), nhưng R2 cần bật thanh toán. Multipart buộc Worker giữ cả tệp
   * trong bộ nhớ, nên có hạn kích thước; đổi sang R2 sau này là sửa đúng phương thức này —
   * `ComputeBackend` không đổi.
   */
  async extract(file: CadFile): Promise<{ status: 'ok'; extraction: unknown }> {
    const form = new FormData();
    // Truyền chính KHUNG NHÌN, không truyền `.buffer`: một `Uint8Array` có thể chỉ phủ một
    // đoạn của vùng đệm, và gửi cả vùng đệm là gửi kèm dữ liệu không thuộc tệp này.
    const view = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    form.append('file', new Blob([view]), file.name);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/extract`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      throw new ComputeUnavailable(error instanceof Error ? error.message : String(error));
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 503 ở đây có thể là "bản triển khai thiếu ODA File Converter" — Container nói rõ
      // `retryable: false` trong thân phản hồi, nên đừng suy đoán chỉ từ mã trạng thái.
      if (res.status >= 500 && !detail.includes('"retryable": false')) {
        throw new ComputeUnavailable(`máy chủ trả ${res.status}. ${detail}`);
      }
      throw new Error(`Không trích được bản vẽ ${file.name} (${res.status}). ${detail}`);
    }
    return (await res.json()) as { status: 'ok'; extraction: unknown };
  }

  buildKbRecord(request: KbRecordRequest): Promise<KbRecordResponse> {
    return this.call<KbRecordResponse>('/kb/record', request);
  }

  async exportSvg(request: ExportDxfRequest): Promise<string> {
    const res = await this.exportCall('/export/svg', request);
    return await res.text();
  }

  async exportDxf(request: ExportDxfRequest): Promise<ArrayBuffer> {
    const res = await this.exportCall('/export/dxf', request);
    return await res.arrayBuffer();
  }

  async exportGlb(request: { floor_plan: unknown }): Promise<ArrayBuffer> {
    const res = await this.exportCall('/export/glb', request);
    return await res.arrayBuffer();
  }

  async schedules(request: SchedulesRequest): Promise<unknown> {
    const res = await this.exportCall('/schedules', request);
    return await res.json();
  }

  async exportXlsx(request: SchedulesRequest): Promise<ArrayBuffer> {
    const res = await this.exportCall('/export/xlsx', request);
    return await res.arrayBuffer();
  }

  private async exportCall(
    path: string,
    request: ExportDxfRequest | SchedulesRequest | { floor_plan: unknown },
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new ComputeUnavailable(error instanceof Error ? error.message : String(error));
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status >= 500) throw new ComputeUnavailable(`máy chủ trả ${res.status}. ${detail}`);
      throw new Error(`Không xuất được bản vẽ (${res.status}). ${detail}`);
    }
    return res;
  }
}

/**
 * Adapter thay thế khi chưa có Container nào chạy.
 *
 * KHÔNG phải "bộ giải rút gọn" — nó không giải gì cả, chỉ trả lỗi có nội dung đọc được để
 * pipeline dừng đúng chỗ và người dùng biết phải khởi động Docker. Một bộ giải giả trả về
 * hình học bịa sẽ nguy hiểm hơn nhiều: nó đi tiếp qua các lớp sau và trông như thật.
 */
export class UnconfiguredComputeBackend implements ComputeBackend {
  readonly name = 'unconfigured';

  async health(): Promise<ComputeHealth> {
    return { reachable: false, solverVersion: null };
  }

  async solve(): Promise<SolveResponse> {
    throw this.unavailable();
  }

  async extract(): Promise<never> {
    throw this.unavailable();
  }

  async buildKbRecord(): Promise<never> {
    throw this.unavailable();
  }

  async exportDxf(): Promise<never> {
    throw this.unavailable();
  }

  async exportSvg(): Promise<never> {
    throw this.unavailable();
  }

  async schedules(): Promise<never> {
    throw this.unavailable();
  }

  async exportGlb(): Promise<never> {
    throw this.unavailable();
  }

  async exportXlsx(): Promise<never> {
    throw this.unavailable();
  }

  private unavailable(): ComputeUnavailable {
    return new ComputeUnavailable(
      'chưa cấu hình DESIGN_COMPUTE_URL. Chạy `docker run --rm -p 8080:8080 nvg-design-compute` rồi đặt DESIGN_COMPUTE_URL=http://localhost:8080.',
    );
  }
}

export function createComputeBackend(env: DesignEnv): ComputeBackend {
  if (env.DESIGN_COMPUTE_URL) return new HttpComputeBackend(env.DESIGN_COMPUTE_URL);
  return new UnconfiguredComputeBackend();
}
