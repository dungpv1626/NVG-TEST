/**
 * Bước 1 của nhánh AI — chương trình không gian do mô hình lập.
 *
 * Ba điều màn hình này phải nói ra, và cả ba đều là ràng buộc chứ không phải trang trí:
 *
 *  · **Lý do và giả định của mô hình.** Không có chúng thì bảng diện tích là những con số
 *    không giải thích được, và «con người quyết định cuối cùng» (PRD 2.3) không có gì để kiểm.
 *    `assumptions` là danh sách câu hỏi cho khách, không phải ghi chú kỹ thuật.
 *  · **Cảnh báo quy chuẩn kèm nguồn văn bản.** Lệch không chặn kết quả (T14) nhưng phải hiện.
 *  · **Số quy tắc CHƯA đối chiếu được.** Đây là chỗ dễ đọc sai nhất: danh sách cảnh báo rỗng
 *    KHÔNG có nghĩa là đạt quy chuẩn, nó chỉ có nghĩa là không lệch trong số thứ đo được ở
 *    bước này. Giấu con số ấy đi là để người đọc tự kết luận sai.
 */

import { useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { designApi } from '@/lib/design-api';
import {
  useAiDesignState,
  useInvalidateAiDesign,
  type AiDesignState,
  type AiSpaceProgramView,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { useMutation } from '@tanstack/react-query';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';

export interface AiProgramWarning {
  ruleId: string;
  severity: 'error' | 'warning';
  source: string;
  message: string;
  spaceId: string;
}

export interface AiProgramResponse {
  artifactId: string;
  reused: boolean;
  program: AiSpaceProgramView;
  roomLabels: Record<string, string>;
  rationale: string;
  assumptions: string[];
  notes: Record<string, string>;
  buildable: { widthM: number; depthM: number; areaM2: number; exact: boolean };
  repaired: boolean;
  warnings: AiProgramWarning[];
  checkedRules: string[];
  uncheckedRules: Array<{ ruleId: string; predicate: string; source: string }>;
}

function useRunAiProgram() {
  return useMutation<AiProgramResponse, Error, { projectId: string; route: string }>({
    mutationFn: (body) => designApi<AiProgramResponse>('/design/ai/program', body),
  });
}

export function AiProgramStep({
  projectId,
  readOnly,
  state,
}: {
  projectId: string;
  readOnly: boolean;
  state: AiDesignState;
}): React.ReactElement {
  const ai = useAiChoice('text', false);
  const run = useRunAiProgram();
  const invalidate = useInvalidateAiDesign();
  const [result, setResult] = useState<AiProgramResponse | null>(null);

  const program = result?.program ?? state.program?.payload ?? null;
  const labels = result?.roomLabels ?? state.roomLabels;
  const blocked = !state.briefArtifactId;

  const onRun = () => {
    if (!ai.choice.route) return;
    setResult(null);
    void run
      .mutateAsync({ projectId, route: ai.choice.route })
      .then((out) => {
        setResult(out);
        invalidate(projectId);
      })
      .catch(() => undefined);
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Chương trình không gian"
        aside={
          program ? (
            <Chip tone="gr">{program.spaces.length} không gian</Chip>
          ) : (
            <Chip tone="am">Chưa có</Chip>
          )
        }
      >
        {blocked ? (
          <p className="text-fg-subtle">
            Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài ở tab «Đầu bài thiết kế» trước
            khi lập chương trình không gian.
          </p>
        ) : (
          !readOnly && (
            <div className="flex flex-wrap items-end gap-3">
              <AiModePicker
                kind="text"
                choice={ai.choice}
                options={ai.options}
                onMode={ai.pickMode}
                onRoute={ai.pickRoute}
                allowSolver={false}
                disabled={run.isPending}
              />
              <Button
                variant="primary"
                onClick={onRun}
                disabled={run.isPending || !ai.choice.route}
              >
                {run.isPending ? 'Đang lập…' : 'Lập chương trình không gian'}
              </Button>
            </div>
          )
        )}

        {/* Con số này là số ĐO, không phải ước lượng: 08/09/2026, cùng một đầu bài nhà phố hai
            tầng — GPT 158 giây, Claude 103 giây. Hứa ngắn hơn thực tế thì người dùng tưởng
            treo và bấm lại, mà bấm lại là một lượt gọi tính tiền nữa. */}
        {run.isPending && (
          <p className="mt-3 text-fg-subtle" aria-live="polite">
            Đang hỏi mô hình — thường 1,5&ndash;3 phút.
          </p>
        )}
        {run.isError && <p className="mt-3 text-status-overdue">{toUserMessage(run.error)}</p>}
      </Panel>

      {run.isPending && <Skeleton className="h-64 w-full" />}

      {program && (
        <>
          <Panel title="Ý đồ và giả định">
            <p className="flex items-center gap-2 font-medium">
              <Sparkles className="size-4" aria-hidden />
              {program.generator.provider} · {program.generator.model}
              {program.generator.repaired ? ' · đã yêu cầu sửa một lần' : ''}
            </p>
            {(result?.rationale ?? program.rationale) && (
              <p className="mt-2">{result?.rationale ?? program.rationale}</p>
            )}
            {(result?.assumptions ?? program.assumptions ?? []).length > 0 && (
              <div className="mt-3">
                <p className="font-medium">Điều mô hình phải giả định — cần hỏi lại khách</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {(result?.assumptions ?? program.assumptions ?? []).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          {result && <RuleReview result={result} />}

          <ProgramTable program={program} labels={labels} notes={result?.notes ?? {}} />
        </>
      )}
    </div>
  );
}

/**
 * Cảnh báo quy chuẩn, và — quan trọng hơn — phạm vi đã soát.
 *
 * Cảnh báo rỗng mà không nói phạm vi thì người đọc kết luận «đạt quy chuẩn», trong khi ở bước
 * này mới chỉ đo được diện tích: kích thước tối thiểu, mặt thoáng, khoảng lùi đều cần hình
 * học, và hình học phải tới bước mặt bằng mới có.
 */
function RuleReview({ result }: { result: AiProgramResponse }): React.ReactElement {
  return (
    <Panel title="Đối chiếu quy chuẩn quốc gia">
      {result.warnings.length === 0 ? (
        <p>Không có cảnh báo trong số quy tắc đo được ở bước này.</p>
      ) : (
        <ul className="space-y-2">
          {result.warnings.map((w) => (
            <li key={`${w.ruleId}-${w.spaceId}`} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-pending" aria-hidden />
              <span>
                {w.message} <span className="text-fg-subtle">({w.source})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-fg-subtle">
        Đã đối chiếu {result.checkedRules.length} quy tắc.{' '}
        <b>{result.uncheckedRules.length} quy tắc chưa đối chiếu được</b> ở bước này vì chúng cần
        hình học — kích thước phòng, mặt thoáng, khoảng lùi. Danh sách cảnh báo rỗng không có nghĩa
        là đạt quy chuẩn.
      </p>
    </Panel>
  );
}

function ProgramTable({
  program,
  labels,
  notes,
}: {
  program: AiSpaceProgramView;
  labels: Record<string, string>;
  notes: Record<string, string>;
}): React.ReactElement {
  const levels = [...new Set(program.spaces.map((s) => s.level))].sort((a, b) => a - b);
  return (
    <>
      {levels.map((level) => {
        const rows = program.spaces.filter((s) => s.level === level);
        // Phòng khép kín nằm TRONG phòng khác nên không cộng vào tổng của tầng.
        const total = rows
          .filter((s) => !s.ensuite_of)
          .reduce((sum, s) => sum + s.target_area_m2, 0);
        return (
          <Panel
            key={level}
            title={`Tầng ${level}`}
            aside={<Chip tone="mute">{formatNumber(total)} m²</Chip>}
          >
            <table className="w-full">
              <thead>
                <tr className="text-left text-fg-subtle">
                  <th className="pb-2 font-medium">Không gian</th>
                  <th className="pb-2 text-right font-medium">Diện tích</th>
                  <th className="pb-2 pl-4 font-medium">Ghi chú của mô hình</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-tk-line">
                    <td className="py-2">
                      {labels[s.type] ?? s.type}
                      {s.ensuite_of && (
                        <span className="text-fg-subtle">
                          {' '}
                          — khép kín trong{' '}
                          {labels[program.spaces.find((p) => p.id === s.ensuite_of)?.type ?? ''] ??
                            s.ensuite_of}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">{formatNumber(s.target_area_m2)} m²</td>
                    <td className="py-2 pl-4 text-fg-subtle">{notes[s.id] ?? s.why ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        );
      })}
    </>
  );
}
