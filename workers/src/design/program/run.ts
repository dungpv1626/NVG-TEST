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

  // Nhu cầu riêng của từng nhóm thành viên tách làm hai đường, và ranh giới ở đây quan trọng:
  //
  //  · Biểu mẫu hiện hành cho chọn từ danh sách, nên phần lớn giá trị ĐÃ LÀ mã không gian
  //    chuẩn. Chúng đi thẳng vào engine. Cho chúng chạy qua bước quy đổi là nhờ bảng bí danh
  //    dịch một mã về chính nó — đúng cho tới ngày có mã phòng mà tên tiếng Anh không nằm
  //    trong bí danh của chính nó, rồi im lặng biến mất.
  //  · Phần còn lại là chữ tự do (hợp đồng cho phép, và bước dán đầu bài từ tin nhắn sẽ sinh
  //    ra nhiều), mới cần quy đổi.
  //
  // `priorities` KHÔNG đi vào đây. Đó là thứ tự ưu tiên thiết kế ("lấy sáng tự nhiên"), không
  // phải một không gian — đưa vào thì lần chạy nào cũng đọng lại một danh sách "chưa quy được"
  // không bao giờ vơi, và một cảnh báo luôn nổ là một cảnh báo bị bỏ qua.
  const vocabulary = roomVocabulary();
  const known = new Set(vocabulary.codes);
  const declared: string[] = [];
  const freeText: string[] = [];
  for (const phrase of (brief.family ?? []).flatMap((m) => m.needs ?? [])) {
    const text = phrase?.trim();
    if (!text) continue;
    (known.has(text) ? declared : freeText).push(text);
  }

  const needs = await resolveNeeds(freeText, vocabulary, geminiClient(env));

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
    extraSpaces: [...declared, ...needs.spaces],
  });

  return {
    payload: result.payload,
    warnings: [...result.warnings, ...needs.notes],
    unresolved: needs.unresolved,
    params: {
      norms_version: norms.version,
      locality: brief.locality,
      // Chế độ quy tắc đã chạy, KHÔNG phải địa phương đã chọn: hai thứ này khác nhau chừng
      // nào còn tỉnh chưa có gói riêng, và bản kết quả phải nói được mình dựa trên bộ số nào.
      rule_pack_locality: rules.localityMissing ? null : brief.locality,
      priors_band: priors?.bandId ?? null,
    },
  };
}
