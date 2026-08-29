/**
 * Thống kê thực nghiệm từ Knowledge Base — "nhà NVG thường làm bao nhiêu m²".
 *
 * Nguồn: doc/design/06-knowledge-base.md mục 6.0(b) và 6.4.
 *
 * ⚠️ Hook này CỐ Ý trả về rỗng ở quy mô kho hiện tại, và đó không phải việc chưa làm xong.
 * Mục 6.0(b) nói rõ: dưới ~15 công trình mỗi ô thì mỗi ô còn một hai công trình — "đó là trùng hợp,
 * không phải phân bố". Dùng số liệu mỏng nguy hiểm hơn không dùng, vì nó mang dáng vẻ của dữ
 * liệu thật. Phép lọc ngưỡng đặt trong SQL (`HAVING`), nên không lớp gọi nào bỏ qua được.
 *
 * "Không xoá hook" cũng là chỉ dẫn nguyên văn của tài liệu: kho lớn lên thì cùng đoạn mã này
 * bắt đầu trả về số, không phải viết lại.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { bandFor, type SpaceNorms } from './norms';

export interface RoomAreaStat {
  roomType: string;
  sampleCount: number;
  projectCount: number;
  p25: number;
  median: number;
  p75: number;
}

export class RoomAreaPriors {
  private readonly byType: Map<string, RoomAreaStat>;

  constructor(
    stats: RoomAreaStat[],
    /** Mã dải bề rộng lô đã dùng — đi vào phần "vì sao ra số này". */
    readonly bandId: string,
  ) {
    this.byType = new Map(stats.map((s) => [s.roomType, s]));
  }

  get size(): number {
    return this.byType.size;
  }

  /** Diện tích trung vị của một loại phòng, hoặc rỗng khi ô đó chưa đủ công trình. */
  medianFor(roomType: string): number | null {
    return this.byType.get(roomType)?.median ?? null;
  }

  stats(): RoomAreaStat[] {
    return [...this.byType.values()];
  }
}

export interface PriorsQuery {
  tenantId: string;
  buildingType: string;
  siteWidthM: number;
  floors: number;
  /** Nới số tầng ±n để ô không quá hẹp. Nhà 3 và 4 tầng bố trí gần nhau. */
  floorTolerance?: number;
}

/**
 * Đọc thống kê cho một ô (loại hình × dải bề rộng × số tầng).
 *
 * Trả về `null` — chứ không phải một đối tượng rỗng — khi không ô nào đủ mẫu. Hai thứ đó
 * khác nhau ở chỗ `priors_applied` của hợp đồng: rỗng nghĩa là "đã dùng thống kê và nó
 * không nói gì", `null` nghĩa là "chưa hề dùng thống kê". Người đọc bản kết quả cần phân
 * biệt được.
 */
export async function readRoomAreaPriors(
  db: SupabaseClient,
  norms: SpaceNorms,
  query: PriorsQuery,
): Promise<RoomAreaPriors | null> {
  const band = bandFor(norms, query.siteWidthM);
  const index = norms.priors.width_bands.indexOf(band);
  const lower = index > 0 ? norms.priors.width_bands[index - 1]!.max_width_m : 0;
  const tolerance = query.floorTolerance ?? 1;

  const { data, error } = await db.rpc('kb_room_area_stats', {
    p_tenant_id: query.tenantId,
    p_building_type: query.buildingType,
    p_width_min: lower ?? 0,
    p_width_max: band.max_width_m,
    p_floors_min: Math.max(1, query.floors - tolerance),
    p_floors_max: query.floors + tolerance,
    p_min_samples: norms.priors.min_samples,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    room_type: string;
    sample_count: number;
    project_count: number;
    p25_m2: number;
    median_m2: number;
    p75_m2: number;
  }>;
  if (!rows.length) return null;

  return new RoomAreaPriors(
    rows.map((r) => ({
      roomType: r.room_type,
      sampleCount: Number(r.sample_count),
      projectCount: Number(r.project_count),
      p25: r.p25_m2,
      median: r.median_m2,
      p75: r.p75_m2,
    })),
    band.id,
  );
}
