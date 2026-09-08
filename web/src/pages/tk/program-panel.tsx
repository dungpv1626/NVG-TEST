/**
 * Tab "Chương trình không gian" — kết quả Lớp 2 (TK-11).
 *
 * Nguồn: doc/design/03-data-contracts.md mục 3.2, 11-design-flow.md mục 11.1.
 *
 * Ba quyết định về cách bày:
 *
 *  · **Nhóm theo TẦNG, không phải một bảng phẳng.** Câu hỏi đầu tiên của kiến trúc sư khi
 *    đọc chương trình không gian là "tầng này có gì, đủ chỗ không" — bày phẳng thì phải tự
 *    cộng nhẩm.
 *  · **Ba con số diện tích hiện đủ cả ba**, không rút gọn còn diện tích mong muốn. Cận dưới
 *    là quy chuẩn, cận trên là chỗ bộ giải được co giãn; giấu đi thì không ai hiểu vì sao
 *    phương án sinh ra lại lệch số mong muốn.
 *  · **Bản đang xem luôn là bản của đầu bài HIỆN TẠI**, tính lại mỗi lần mở. Sửa đầu bài
 *    xong quay lại đây phải thấy ngay chương trình đã đổi — không phải một bản cũ không có
 *    dấu hiệu gì cho biết là cũ.
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Layers, Sparkles } from 'lucide-react';
import { formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  useGenerateSpaceProgram,
  useGenerateSpaceProgramAi,
  useSpaceProgram,
  type GenerateProgramAiResult,
  type ProgramGenerator,
  type ProgramSpace,
  type ProgramView,
  type SpaceProgramPayload,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';
import { AiModePicker, useAiChoice, type AiChoice } from './ai-model-picker';

export function ProgramPanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}): React.ReactElement {
  const program = useSpaceProgram(projectId);
  const generate = useGenerateSpaceProgram();
  const generateAi = useGenerateSpaceProgramAi();
  const ai = useAiChoice('text');
  /** Kết quả lượt AI vừa chạy — hiện lý do và bảng so sánh cho tới khi rời tab. */
  const [aiResult, setAiResult] = useState<GenerateProgramAiResult | null>(null);
  /** Bản đang xem trong bảng: bộ giải tính lại, hay bản AI đã chốt. */
  const [shown, setShown] = useState<'solver' | 'head'>('head');

  if (program.isLoading) return <ProgramSkeleton />;

  // Lỗi ở đây phần lớn là TRẠNG THÁI NGHIỆP VỤ đọc được ("chưa xác nhận đầu bài"), không
  // phải hỏng hóc — nên bày như một trạng thái rỗng có hướng dẫn, không phải một hộp lỗi đỏ.
  if (program.isError || !program.data) {
    return (
      <EmptyState
        icon={<Layers className="size-6" />}
        message={toUserMessage(program.error)}
        action={
          <Button variant="secondary" onClick={() => void program.refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  const view = program.data;
  // Bản chốt do AI lập cho ĐÚNG đầu bài hiện tại: bảng mặc định hiện bản đó (nó đang hiệu lực),
  // bản bộ giải tính lại giữ làm đối chiếu. `matchesHead` khi ấy luôn false vì hai nhánh không
  // cho ra cùng mã băm — không được đọc thành «đầu bài đã đổi».
  const aiHead =
    view.head &&
    view.head.generator.kind === 'ai' &&
    view.head.program.brief_ref === view.briefArtifactId
      ? view.head
      : null;
  const table: SpaceProgramPayload = aiHead && shown === 'head' ? aiHead.program : view.program;
  const floors = floorsOf(table);

  const saving = generate.isPending || generateAi.isPending;
  const runError = generate.isError
    ? toUserMessage(generate.error)
    : generateAi.isError
      ? toUserMessage(generateAi.error)
      : null;

  const onGenerate = () => {
    setAiResult(null);
    if (ai.choice.mode === 'ai') {
      if (!ai.choice.route) return;
      void generateAi
        .mutateAsync({ projectId, route: ai.choice.route })
        .then((result) => {
          setAiResult(result);
          setShown('head');
        })
        .catch(() => undefined);
    } else {
      void generate.mutateAsync({ projectId }).catch(() => undefined);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        view={view}
        aiHead={aiHead}
        readOnly={readOnly}
        saving={saving}
        error={runError}
        choice={ai.choice}
        picker={
          !readOnly && (
            <AiModePicker
              kind="text"
              choice={ai.choice}
              options={ai.options}
              onMode={ai.pickMode}
              onRoute={ai.pickRoute}
              disabled={saving}
            />
          )
        }
        onGenerate={onGenerate}
      />

      {saving && ai.choice.mode === 'ai' && (
        <p className="text-fg-subtle" aria-live="polite">
          Đang hỏi mô hình — thường 15–40 giây. Kết quả sẽ được kiểm theo quy chuẩn trước khi chốt.
        </p>
      )}

      {aiResult && <AiProgramReport result={aiResult} labels={view.roomLabels} />}

      {aiHead && !aiResult && (
        <AiHeadNotice generator={aiHead.generator} shown={shown} onShown={setShown} />
      )}
      {aiHead && aiResult && (
        <div>
          <SegmentedControl
            options={['head', 'solver'] as const}
            value={shown}
            onChange={setShown}
            getLabel={(o) => (o === 'head' ? 'Bản AI đã chốt' : 'Bộ giải nội bộ (đối chiếu)')}
          />
        </div>
      )}

      {view.aiSuggestion && shown === 'solver' && (
        <AiSuggestion suggestion={view.aiSuggestion} labels={view.roomLabels} />
      )}
      {(shown === 'solver' || !aiHead) && view.warnings.length > 0 && (
        <Warnings items={view.warnings} />
      )}
      {aiResult && shown === 'head' && aiResult.warnings.length > 0 && (
        <Warnings items={aiResult.warnings} />
      )}
      {view.unresolvedNeeds.length > 0 && <UnresolvedNeeds items={view.unresolvedNeeds} />}

      {floors.map((allocation) => (
        <FloorTable
          key={allocation.floor}
          floor={allocation.floor}
          usable={allocation.usable_area_m2 ?? null}
          buildable={allocation.buildable_area_m2 ?? null}
          allocated={allocation.allocated_area_m2 ?? null}
          spaces={table.spaces.filter((s) => s.floor === allocation.floor)}
          labels={view.roomLabels}
        />
      ))}
    </div>
  );
}

function floorsOf(program: SpaceProgramPayload) {
  return program.floor_allocation?.length
    ? [...program.floor_allocation].sort((a, b) => a.floor - b.floor)
    : [...new Set(program.spaces.map((s) => s.floor))]
        .sort((a, b) => a - b)
        .map((floor) => ({
          floor,
          usable_area_m2: null,
          buildable_area_m2: null,
          allocated_area_m2: null,
        }));
}

/** Tên nhà cung cấp và mô hình để hiện — không có tên mô hình thì chỉ nhãn chung. */
function generatorLabel(generator: ProgramGenerator): string {
  const parts = [generator.provider, generator.model].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'AI';
}

/**
 * Bản đang hiệu lực do AI lập — nói ra ngay trên đầu, kèm lý do mô hình đã nêu, và cho đổi
 * sang bản bộ giải để đối chiếu. Thiếu khối này thì bảng bên dưới là những con số không rõ
 * nguồn, và «con người quyết định cuối cùng» (PRD 2.3) không có gì để kiểm.
 */
function AiHeadNotice({
  generator,
  shown,
  onShown,
}: {
  generator: ProgramGenerator;
  shown: 'solver' | 'head';
  onShown: (value: 'solver' | 'head') => void;
}): React.ReactElement {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4" aria-hidden />
        Bản đã chốt do AI lập — {generatorLabel(generator)}
      </p>
      {generator.rationale && <p className="mt-2">{generator.rationale}</p>}
      <div className="mt-3">
        <SegmentedControl
          options={['head', 'solver'] as const}
          value={shown}
          onChange={onShown}
          getLabel={(o) => (o === 'head' ? 'Bản AI đã chốt' : 'Bộ giải nội bộ (đối chiếu)')}
        />
      </div>
    </div>
  );
}

/**
 * Kết quả lượt AI vừa chạy: lý do, giả định (câu hỏi cho khách), và bảng so với bộ giải.
 *
 * Bảng so sánh là thứ làm lựa chọn «AI» kiểm lại được: kiến trúc sư thấy AI thêm gì, bớt gì,
 * nới phòng nào — thay vì nhận một bảng số mới và phải tin.
 */
function AiProgramReport({
  result,
  labels,
}: {
  result: GenerateProgramAiResult;
  labels: Record<string, string>;
}): React.ReactElement {
  const name = (type: string) => labels[type] ?? type;
  const rows = result.comparison.filter(
    (r) => r.solver_m2 === null || r.ai_m2 === null || Math.abs(r.solver_m2 - r.ai_m2) >= 0.5,
  );
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4" aria-hidden />
        Chương trình do AI lập — {generatorLabel(result.generator)} · đã kiểm quy chuẩn
        {result.warnings.length ? `: ${result.warnings.length} cảnh báo` : ': không có cảnh báo'}
        {result.repaired ? ' · đã yêu cầu sửa một lần' : ''}
      </p>
      {result.rationale && <p className="mt-2">{result.rationale}</p>}
      {result.assumptions.length > 0 && (
        <div className="mt-3">
          <p className="font-medium">Điều AI phải giả định — cần hỏi lại khách</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer font-medium">
          So với bộ giải nội bộ ({rows.length} chỗ khác)
        </summary>
        {rows.length === 0 ? (
          <p className="mt-2 text-fg-subtle">Hai bản trùng nhau về diện tích từng không gian.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded border border-border">
            <table className="w-full min-w-[28rem] border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-sunken text-left">
                  <th className="px-3 py-2 font-medium">Không gian</th>
                  <th className="px-3 py-2 font-medium">Tầng</th>
                  <th className="px-3 py-2 text-right font-medium">Bộ giải (m²)</th>
                  <th className="px-3 py-2 text-right font-medium">AI (m²)</th>
                  <th className="px-3 py-2 text-right font-medium">Chênh</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      {name(r.type)}
                      {result.notes[r.key] ? (
                        <span className="block text-xs text-fg-subtle">{result.notes[r.key]}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{r.floor ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.solver_m2 === null ? 'không có' : formatNumber(r.solver_m2, 1)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.ai_m2 === null ? 'bỏ' : formatNumber(r.ai_m2, 1)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.solver_m2 !== null && r.ai_m2 !== null
                        ? `${r.ai_m2 - r.solver_m2 >= 0 ? '+' : '−'}${formatNumber(Math.abs(r.ai_m2 - r.solver_m2), 1)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}

function Header({
  view,
  aiHead,
  readOnly,
  saving,
  error,
  choice,
  picker,
  onGenerate,
}: {
  view: ProgramView;
  aiHead: NonNullable<ProgramView['head']> | null;
  readOnly: boolean;
  saving: boolean;
  error: string | null;
  choice: AiChoice;
  picker: React.ReactNode;
  onGenerate: () => void;
}): React.ReactElement {
  const total = view.program.spaces.length;
  const aiMode = choice.mode === 'ai';
  const canRun = aiMode ? Boolean(choice.route) : !view.matchesHead;
  const buttonLabel = saving
    ? aiMode
      ? 'Đang lập bằng AI…'
      : 'Đang chốt…'
    : aiMode
      ? 'Lập bằng AI rồi chốt'
      : 'Chốt chương trình không gian';

  return (
    <div className="rounded border border-border bg-surface-sunken p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1 font-medium">
            {total} không gian trên {new Set(view.program.spaces.map((s) => s.floor)).size} tầng
            <SectionHelp {...DESIGN_HELP.program} autoOpenKey="tk.chuong-trinh-khong-gian" />
          </p>
          <p className="mt-1 text-fg-subtle">
            {view.program.priors_applied
              ? 'Diện tích lấy theo thống kê công trình NVG đã làm.'
              : 'Diện tích lấy theo quy chuẩn và chuẩn nghề nghiệp — kho hồ sơ cũ chưa đủ để thống kê.'}
          </p>
          <p className="mt-2">
            {view.matchesHead || aiHead ? (
              <span className="inline-flex items-center gap-1 text-status-completed">
                <CheckCircle2 className="size-4" aria-hidden />
                {aiHead
                  ? 'Đã chốt bản do AI lập, các bước sau đang dùng bản này'
                  : 'Đã chốt, các bước sau đang dùng bản này'}
              </span>
            ) : view.headArtifactId ? (
              <span className="text-status-pending">
                Đầu bài đã đổi từ lần chốt trước — chốt lại để các bước sau dùng bản mới
              </span>
            ) : (
              <span className="text-status-draft">Chưa chốt bản nào</span>
            )}
          </p>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-end gap-3">
            {picker}
            <Button variant="primary" onClick={onGenerate} disabled={saving || !canRun}>
              {buttonLabel}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-status-overdue">{error}</p>}
    </div>
  );
}

/**
 * Đề xuất của AI ở Lớp 2a, hiện nguyên văn để kiến trúc sư kiểm lại được.
 *
 * ⚠️ Khối này KHÔNG phải trang trí. AI có tham gia vào bảng diện tích bên dưới; thiếu chỗ nói
 * ra nó đã đề xuất gì và vì sao thì con số trong bảng trở thành thứ không giải thích được, và
 * "con người quyết định cuối cùng" (PRD 2.3) chỉ còn là một câu trong tài liệu.
 *
 * Nói rõ ranh giới ngay trên màn hình: AI chọn mức ƯU ÁI, không chọn mét vuông. Người đọc cần
 * biết điều đó để biết mình đang kiểm lại cái gì.
 */
function AiSuggestion({
  suggestion,
  labels,
}: {
  suggestion: NonNullable<ProgramView['aiSuggestion']>;
  labels: Record<string, string>;
}): React.ReactElement {
  const name = (code: string) => labels[code] ?? code;
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="font-medium">Đề xuất của AI về mức ưu tiên diện tích</p>
      <p className="mt-1 text-fg-subtle">
        AI chỉ chọn phòng nào nên rộng rãi, phòng nào nên tối giản. Diện tích cụ thể do quy chuẩn và
        chuẩn nghề nghiệp quyết định — đề xuất này không đổi được mức tối thiểu hay tối đa.
      </p>
      {suggestion.rationale && <p className="mt-2">{suggestion.rationale}</p>}
      {suggestion.generous.length > 0 && (
        <p className="mt-2 text-fg-subtle">
          Ưu tiên rộng rãi: {suggestion.generous.map(name).join(', ')}.
        </p>
      )}
      {suggestion.modest.length > 0 && (
        <p className="text-fg-subtle">Giữ tối giản: {suggestion.modest.map(name).join(', ')}.</p>
      )}
    </div>
  );
}

function Warnings({ items }: { items: string[] }): React.ReactElement {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="flex items-center gap-2 font-medium text-status-pending">
        <AlertTriangle className="size-4" aria-hidden />
        Cần xem lại ({items.length})
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function UnresolvedNeeds({ items }: { items: string[] }): React.ReactElement {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="font-medium">Nhu cầu chưa quy được về không gian ({items.length})</p>
      <p className="mt-1 text-fg-subtle">
        Đọc và bổ sung thủ công vào danh sách không gian của đầu bài nếu cần.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function FloorTable({
  floor,
  usable,
  buildable,
  allocated,
  spaces,
  labels,
}: {
  floor: number;
  usable: number | null;
  buildable: number | null;
  allocated: number | null;
  spaces: ProgramSpace[];
  labels: Record<string, string>;
}): React.ReactElement {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">Tầng {floor}</h3>
        {usable !== null && (
          <p className="text-fg-subtle">
            Sàn {formatNumber(usable, 1)} m² · đã bố trí {formatNumber(allocated ?? 0, 1)} m²
            {/*
              Phần đất KHÔNG xây tới phải hiện ra thành một con số, không biến mất lặng lẽ.
              Từ 07/09/2026 mặt sàn co lại theo nhu cầu thay vì lấp kín phần xây được — đó là
              một quyết định, và một quyết định không nhìn thấy được thì không kiểm lại được.
            */}
            {buildable !== null && buildable > usable + 0.5 && (
              <>
                {' · '}
                <span title="Phần còn lại của đất xây được — để làm sân, vườn hoặc mở rộng sau.">
                  xây được tới {formatNumber(buildable, 1)} m², còn{' '}
                  {formatNumber(buildable - usable, 1)} m² chưa dùng
                </span>
              </>
            )}
          </p>
        )}
      </div>

      {/* Bảng rộng cuộn trong chính nó, không đẩy cả trang trượt ngang. */}
      <div className="mt-2 overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[36rem] border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-sunken text-left">
              <th className="px-3 py-2 font-medium">Không gian</th>
              <th className="px-3 py-2 text-right font-medium">Tối thiểu</th>
              <th className="px-3 py-2 text-right font-medium">Mong muốn</th>
              <th className="px-3 py-2 text-right font-medium">Tối đa</th>
              <th className="px-3 py-2 font-medium">Yêu cầu</th>
            </tr>
          </thead>
          <tbody>
            {spaces.map((space) => (
              <tr key={space.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{labels[space.type] ?? space.type}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(space.min_area_m2, 1)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatNumber(space.target_area_m2 ?? space.min_area_m2, 1)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(space.max_area_m2 ?? space.min_area_m2, 1)}
                </td>
                <td className="px-3 py-2 text-fg-subtle">{needsOf(space)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Yêu cầu của một không gian, viết bằng chữ — không dùng biểu tượng đơn độc (CGD 6.8). */
function needsOf(space: ProgramSpace): string {
  const needs = [
    space.needs_daylight ? 'chiếu sáng tự nhiên' : null,
    space.needs_facade ? 'giáp mặt tiền' : null,
    space.needs_ventilation ? 'thông gió' : null,
  ].filter(Boolean);
  return needs.length ? needs.join(' · ') : '—';
}

/** Khung chờ đúng hình dạng nội dung, không phải vòng xoay giữa màn hình (AFD 6.7). */
function ProgramSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-24 animate-pulse rounded bg-surface-sunken" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-5 w-24 animate-pulse rounded bg-surface-sunken" />
          <div className="h-28 animate-pulse rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  );
}
