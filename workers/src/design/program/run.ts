/**
 * Chạy Lớp 2 một lượt: gom ba nguồn tri thức rồi gọi engine.
 *
 * Tách khỏi cả `workflows/design-pipeline.ts` lẫn `index.ts` vì CẢ HAI đều cần đúng chuỗi
 * việc này. Chép sang hai chỗ thì có ngày chương trình không gian sinh từ nút bấm khác với
 * chương trình sinh từ đường ống — cùng đầu bài, hai kết quả, và không ai biết bản nào đúng.
 *
 * Bản thân engine (`engine.ts`) vẫn là hàm thuần. Tệp này là phần KHÔNG thuần: đọc cấu hình
 * đã nhúng, hỏi CSDL, gọi mô hình ngôn ngữ. Ranh giới đó giữ cho engine kiểm thử được mà
 * không cần dựng CSDL hay mạng.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DesignBrief, SpaceProgram } from '@nvg/shared/design';
import type { DesignEnv } from '../env';
import { roomVocabulary } from '../kb/vocabulary-data';
import { geminiClient } from '../llm/factory';
import { buildSpaceProgram } from './engine';
import { resolveNeeds } from './needs';
import { spaceNorms } from './norms-data';
import { readRoomAreaPriors } from './priors';
import { rulePackFor } from './rule-pack-data';

export interface Layer2Run {
  payload: SpaceProgram;
  /** Điều engine phải nói ra nhưng không đủ để dừng lại. */
  warnings: string[];
  /** Đoạn chữ trong đầu bài chưa quy được về không gian nào. */
  unresolved: string[];
  /**
   * Cấu hình đã dùng — băm thành `params_hash` của cạnh lineage.
   *
   * Phải chứa ĐỦ thứ quyết định đầu ra, nếu không "đã tính rồi thì không tính lại" sẽ trả về
   * kết quả cũ sau khi ai đó sửa chuẩn diện tích.
   */
  params: Record<string, unknown>;
}

export async function runLayer2(
  env: DesignEnv,
  db: SupabaseClient,
  brief: DesignBrief,
  briefRef: string,
  tenantId: string,
): Promise<Layer2Run> {
  const norms = spaceNorms();
  const rules = rulePackFor(brief.locality);

  // Phần chữ tự do đi qua bước quy đổi RIÊNG trước khi vào engine — engine phải tất định
  // (xem chú thích đầu `engine.ts`).
  const needs = await resolveNeeds(
    [...(brief.family ?? []).flatMap((m) => m.needs ?? []), ...(brief.priorities ?? [])],
    roomVocabulary(),
    geminiClient(env),
  );

  // Thống kê thực nghiệm: rỗng ở quy mô kho hiện tại, và đó là hành vi đúng
  // (06-knowledge-base 6.0b). Hỏng khi đọc thì KHÔNG chặn — Lớp 2 vẫn chạy bằng chuẩn nghề
  // nghiệp, chỉ là chất lượng thấp hơn, đúng điều kiện vào của Mốc 4.
  let priors = null;
  try {
    priors = await readRoomAreaPriors(db, norms, {
      tenantId,
      buildingType: brief.building_type,
      siteWidthM: brief.site.width_m,
      floors: brief.floors,
    });
  } catch (error) {
    needs.notes.push(
      `Chưa đọc được thống kê thực nghiệm nên đang dùng chuẩn nghề nghiệp: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const result = buildSpaceProgram({
    brief,
    briefRef,
    rules,
    norms,
    priors,
    extraSpaces: needs.spaces,
  });

  return {
    payload: result.payload,
    warnings: [...result.warnings, ...needs.notes],
    unresolved: needs.unresolved,
    params: {
      norms_version: norms.version,
      locality: brief.locality,
      priors_band: priors?.bandId ?? null,
    },
  };
}
