/**
 * Cloudflare Workflow — số hoá một bộ hồ sơ cũ (Mốc 3).
 *
 * Nguồn: `doc/design/06-knowledge-base.md` mục 6.1 — "Chạy trên Cloudflare Workflows: **mỗi
 * file là một step**. Một file lỗi không giết cả mẻ; sửa extractor rồi chạy lại riêng phần lỗi."
 *
 * Vì sao mỗi tệp một `step.do` chứ không phải một bước lặp qua cả danh sách: Workflow lưu kết
 * quả TỪNG bước. Gộp lại thì sửa extractor xong phải trích lại cả mười tệp, và tệp thứ mười
 * hỏng sẽ vứt bỏ công của chín tệp trước.
 *
 * ⚠️ Tệp này import `cloudflare:workers` nên CHỈ nạp được trong runtime Workers. Phần nghiệp
 * vụ kiểm thử được nằm ở `digitise-steps.ts`.
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { disposingStep } from './rpc-stub';
import { NonRetryableError } from 'cloudflare:workflows';
import { createComputeBackend, type KbRecordResponse } from '../compute-backend';
import type { DesignEnv } from '../env';
import { roomVocabulary } from '../kb/vocabulary-data';
import { normaliseRoomLabels } from '../kb/normalize-labels';
import { geminiClient } from '../llm/factory';
import { createSourceFileStore } from '../source-files';
import {
  assembleRecordRequest,
  extractSource,
  persistKbRecord,
  type DigitiseParams,
  type SourceOutcome,
} from './digitise-steps';

export class DigitisePipeline extends WorkflowEntrypoint<DesignEnv, DigitiseParams> {
  override async run(event: WorkflowEvent<DigitiseParams>, rpcStep: WorkflowStep) {
    // Mọi kết quả `step.do` là kết quả RPC — huỷ ngay (T85, `workflows/rpc-stub.ts`).
    const step = disposingStep(rpcStep);
    const params = event.payload;
    const store = createSourceFileStore(this.env);
    const compute = createComputeBackend(this.env);

    // Mỗi tệp một bước. Tên bước mang tên tệp để đọc nhật ký biết ngay tệp nào hỏng.
    const outcomes: SourceOutcome[] = [];
    for (const source of params.sources) {
      outcomes.push(
        (await step.do(`trich:${source.name}`, () =>
          extractSource(store, compute, source),
        )) as SourceOutcome,
      );
    }

    // Chuẩn hoá nhãn phòng — bước RIÊNG chứ không gộp vào bước lắp bản ghi, vì đây là bước
    // duy nhất của mẻ gọi ra dịch vụ ngoài: gộp vào thì một lần 429 của Gemini sẽ kéo theo
    // việc lắp lại bản ghi, và chạy lại mẻ sẽ gọi mô hình thêm lần nữa dù kết quả cũ vẫn dùng
    // được. Tách ra thì Workflow lưu riêng kết quả bước này.
    const labels = await step.do('chuan-hoa-nhan', async () => {
      const plans = outcomes
        .filter((o): o is Extract<SourceOutcome, { status: 'ok' }> => o.status === 'ok')
        .sort((a, b) => a.source.level - b.source.level)
        .map((o) => JSON.parse(o.extractionJson) as { rooms: { label_raw?: string | null }[] });

      // Mã phòng do lớp gọi truyền vào (nếu có) THẮNG kết quả suy đoán: người đã xác nhận
      // thì không hỏi lại mô hình.
      if (params.roomTypes) return { roomTypes: params.roomTypes, inferred: [], unresolved: [] };

      return normaliseRoomLabels(plans, roomVocabulary(), geminiClient(this.env));
    });

    // Kết quả mỗi bước phải SERIALISE được để Workflow lưu lại và chạy lại từ giữa. Bản ghi
    // Knowledge Base chỉ hợp lệ theo JSON Schema chứ không theo kiểu TypeScript (`unknown`),
    // mà `Serializable` không diễn đạt được `unknown` — nên bước này trả về chuỗi JSON.
    const built = await step.do(
      'lap-ban-ghi',
      async (): Promise<{ recordJson: string; checks: KbRecordResponse['checks'] }> => {
        let request;
        try {
          request = assembleRecordRequest({ ...params, roomTypes: labels.roomTypes }, outcomes);
        } catch (error) {
          // Không tệp nào trích được: thử lại không đổi được gì, dừng ngay và giữ nguyên lý do.
          throw new NonRetryableError(error instanceof Error ? error.message : String(error));
        }
        const response = await compute.buildKbRecord(request);
        return { recordJson: JSON.stringify(response.record), checks: response.checks };
      },
    );

    const saved = await step.do('ghi-csdl', () =>
      persistKbRecord(this.env, params, JSON.parse(built.recordJson), built.checks, params.sources),
    );

    return {
      kbRecordId: saved.id,
      created: saved.created,
      extracted: outcomes.filter((o) => o.status === 'ok').length,
      // Nhãn do mô hình suy ra và nhãn không ai quy được đi CÙNG kết quả, không chỉ nằm trong
      // nhật ký: người xác nhận cần thấy đúng lúc đang xem bản ghi (hợp đồng kb-record, phần
      // `extraction_warnings` cũng theo lý lẽ này).
      inferredLabels: labels.inferred,
      unresolvedLabels: labels.unresolved,
      // Tệp hỏng KHÔNG bị nuốt: trả về để lớp gọi hiển thị và để người vận hành biết cần
      // bổ sung mẫu lớp bản vẽ nào.
      failed: outcomes
        .filter((o): o is Extract<SourceOutcome, { status: 'failed' }> => o.status === 'failed')
        .map((o) => ({ name: o.source.name, error: o.error })),
    };
  }
}
