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
import { NonRetryableError } from 'cloudflare:workflows';
import { createComputeBackend, type KbRecordResponse } from '../compute-backend';
import type { DesignEnv } from '../env';
import { createSourceFileStore } from '../source-files';
import {
  assembleRecordRequest,
  extractSource,
  persistKbRecord,
  type DigitiseParams,
  type SourceOutcome,
} from './digitise-steps';

export class DigitisePipeline extends WorkflowEntrypoint<DesignEnv, DigitiseParams> {
  override async run(event: WorkflowEvent<DigitiseParams>, step: WorkflowStep) {
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

    // Kết quả mỗi bước phải SERIALISE được để Workflow lưu lại và chạy lại từ giữa. Bản ghi
    // Knowledge Base chỉ hợp lệ theo JSON Schema chứ không theo kiểu TypeScript (`unknown`),
    // mà `Serializable` không diễn đạt được `unknown` — nên bước này trả về chuỗi JSON.
    const built = await step.do(
      'lap-ban-ghi',
      async (): Promise<{ recordJson: string; checks: KbRecordResponse['checks'] }> => {
        let request;
        try {
          request = assembleRecordRequest(params, outcomes);
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
      // Tệp hỏng KHÔNG bị nuốt: trả về để lớp gọi hiển thị và để người vận hành biết cần
      // bổ sung mẫu lớp bản vẽ nào.
      failed: outcomes
        .filter((o): o is Extract<SourceOutcome, { status: 'failed' }> => o.status === 'failed')
        .map((o) => ({ name: o.source.name, error: o.error })),
    };
  }
}
