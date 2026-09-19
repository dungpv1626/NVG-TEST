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
 *  · **Ba con số diện tích hiện đủ cả ba, kèm AI QUYẾT từng con số.** Tối thiểu là số lớn
 *    nhất của khách khai, quy chuẩn và chuẩn nghề; đề xuất là phần chương trình chia; tối đa
 *    là chỗ bộ giải được co giãn. Cột từng tên «Mong muốn» — nhưng không ai mong muốn con số
 *    ấy: khách chỉ khai tối thiểu, còn số trong cột do chương trình chia sàn mà ra (Haan bắt
 *    được 13/09/2026). Nay gọi đúng tên là «Đề xuất» và ghi nguồn dưới từng số.
 *  · **Kiến trúc sư sửa được diện tích đề xuất TRƯỚC khi chốt.** Soát ngay khi gõ bằng cùng
 *    hàm Worker dùng để chặn (`applyProgramEdits`), nên lỗi hiện cạnh ô đang sửa. Có phòng nào,
 *    ở tầng nào thì vẫn sửa ở Đầu bài — một căn nhà không nên có hai chỗ khai tầng.
 *  · **AI chỉ chạy khi BẤM NÚT, với model đã chọn**, và mỗi lượt hiện số token, chi phí ngay
 *    dưới nút (Haan, 13/09/2026). Trước đó màn hình tự gọi mô hình mỗi lần mở — chấp nhận được
 *    với khoá miễn phí, không chấp nhận được khi chọn được model trả phí. Đề xuất vừa hỏi về là
 *    NHÁP cho tới khi chốt, và lưu kèm bản chốt (`space_program.ai_intent`).
 *  · **Bản đang xem luôn là bản của đầu bài HIỆN TẠI**, tính lại mỗi lần mở. Sửa đầu bài
 *    xong quay lại đây phải thấy ngay chương trình đã đổi — không phải một bản cũ không có
 *    dấu hiệu gì cho biết là cũ.
 */

import { AlertTriangle, CheckCircle2, Layers, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatNumber } from '@nvg/shared';
import {
  applyProgramEdits,
  BRIEF_FORM,
  parseAreaInput,
  type AppliedProgramEdits,
  type ProgramEdit,
  type SpaceProgram,
} from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/states';
import {
  useAskProgramIntent,
  useGenerateSpaceProgram,
  useSpaceProgram,
  useSpaceProgramPreview,
  type ProgramAiIntent,
  type PlateExplanation,
  type ProgramAreaEdit,
  type ProgramSpace,
  type ProgramView,
  type SpaceProgramPayload,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';
import { AiModePicker, useAiChoice } from './ai/ai-model-picker';
import { AiUsageLine } from './ai/ai-usage';

export function ProgramPanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}): React.ReactElement {
  const program = useSpaceProgram(projectId);
  const generate = useGenerateSpaceProgram();

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

  return (
    <ProgramBody
      key={program.data.briefArtifactId}
      projectId={projectId}
      view={program.data}
      readOnly={readOnly}
      generate={generate}
    />
  );
}

/** Nơi giữ bản nháp chỗ sửa — theo hồ sơ VÀ đầu bài: đầu bài đổi thì mã không gian có thể đổi. */
function draftKey(projectId: string, briefArtifactId: string): string {
  return `tk.program-edits.${projectId}.${briefArtifactId}`;
}

function toText(value: number): string {
  return formatNumber(value, 1);
}

function readDraft(key: string): Record<string, string> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return null;
  }
}

function intentKey(projectId: string, briefArtifactId: string): string {
  return `tk.program-ai-intent.${projectId}.${briefArtifactId}`;
}

/** Đề xuất AI chưa chốt: `undefined` = không có nháp; `null` = kiến trúc sư đã bỏ đề xuất. */
function readIntentDraft(key: string): ProgramAiIntent | null | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as { intent?: ProgramAiIntent | null } | null;
    return parsed && 'intent' in parsed ? (parsed.intent ?? null) : undefined;
  } catch {
    return undefined;
  }
}

function sameEdits(a: readonly ProgramAreaEdit[], b: readonly ProgramAreaEdit[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = (list: readonly ProgramAreaEdit[]) =>
    [...list].sort((x, y) => (x.space_id < y.space_id ? -1 : 1));
  const left = sorted(a);
  const right = sorted(b);
  return left.every(
    (edit, i) =>
      edit.space_id === right[i]!.space_id &&
      Math.abs(edit.target_area_m2 - right[i]!.target_area_m2) < 0.05,
  );
}

function ProgramBody({
  projectId,
  view: baseView,
  readOnly,
  generate,
}: {
  projectId: string;
  view: ProgramView;
  readOnly: boolean;
  generate: ReturnType<typeof useGenerateSpaceProgram>;
}): React.ReactElement {
  const headEdits = useMemo(() => baseView.headEdits ?? [], [baseView.headEdits]);
  const storageKey = draftKey(projectId, baseView.briefArtifactId);

  // ── Đề xuất AI chưa chốt ──────────────────────────────────────────────────────────────
  // Giữ trong trình duyệt theo hồ sơ VÀ đầu bài: hỏi AI là một lượt tính tiền, rời màn hình
  // rồi quay lại không được mất nó; nhưng đề xuất của đầu bài cũ không áp sang đầu bài mới.
  const intentStorageKey = intentKey(projectId, baseView.briefArtifactId);
  const [pendingIntent, setPendingIntent] = useState<ProgramAiIntent | null | undefined>(() =>
    readIntentDraft(intentStorageKey),
  );
  useEffect(() => {
    try {
      if (pendingIntent === undefined) window.localStorage.removeItem(intentStorageKey);
      else window.localStorage.setItem(intentStorageKey, JSON.stringify({ intent: pendingIntent }));
    } catch {
      // Trình duyệt chặn bộ nhớ: đề xuất vẫn dùng được trong phiên này.
    }
  }, [pendingIntent, intentStorageKey]);
  const previewQuery = useSpaceProgramPreview(projectId, pendingIntent);
  const previewing = pendingIntent !== undefined;
  const view: ProgramView =
    previewing && previewQuery.data
      ? {
          ...baseView,
          program: previewQuery.data.program,
          warnings: previewQuery.data.warnings,
          unresolvedNeeds: previewQuery.data.unresolvedNeeds,
          aiSuggestion: previewQuery.data.aiSuggestion,
          plateExplanation: previewQuery.data.plateExplanation,
        }
      : baseView;
  const intentDirty =
    previewing && JSON.stringify(pendingIntent) !== JSON.stringify(baseView.headAiIntent ?? null);

  /**
   * Chữ người đang gõ, theo mã không gian — giữ nguyên CHUỖI chứ không phải số: «12,» là một
   * bước gõ dở hợp lệ, đổi ngay sang số là nuốt mất dấu phẩy dưới tay người gõ.
   *
   * Lưu nháp vào trình duyệt: rời màn hình sang bước khác rồi quay lại không được mất chỗ
   * sửa (AFD 6.3). Không có nháp thì bắt đầu từ đúng những chỗ sửa của bản đang chốt.
   */
  const [draft, setDraft] = useState<Record<string, string>>(
    () =>
      readDraft(storageKey) ??
      Object.fromEntries(headEdits.map((e) => [e.space_id, toText(e.target_area_m2)])),
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Chế độ ẩn danh chặn bộ nhớ trình duyệt: vẫn sửa được, chỉ không giữ qua lần tải lại.
    }
  }, [draft, storageKey]);

  const unreadable = Object.entries(draft)
    .filter(([, text]) => text.trim() !== '' && parseAreaInput(text) === null)
    .map(([spaceId]) => spaceId);
  const requested: ProgramEdit[] = Object.entries(draft).flatMap(([space_id, text]) => {
    const value = parseAreaInput(text);
    return value === null ? [] : [{ space_id, target_area_m2: value }];
  });
  const base = view.program as unknown as SpaceProgram;
  const preview = applyProgramEdits(base, requested);
  const table = preview.program as unknown as SpaceProgramPayload;
  const floors = floorsOf(table);

  const dirty = !sameEdits(preview.edits, headEdits) || intentDirty;
  const blocked = preview.errors.length > 0 || unreadable.length > 0;
  const saving = generate.isPending;
  const runError = generate.isError ? toUserMessage(generate.error) : null;

  const onGenerate = () => {
    void generate
      .mutateAsync({
        projectId,
        edits: preview.edits,
        // Chốt ĐÚNG đề xuất đang hiện trên màn hình: nháp nếu có, không thì của bản đang chốt.
        aiIntent: previewing ? pendingIntent : (baseView.headAiIntent ?? null),
      })
      .then(() => {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Không xoá được nháp thì lần sau vẫn mở ra đúng những chỗ vừa chốt — vô hại.
        }
        setPendingIntent(undefined);
      })
      .catch(() => undefined);
  };

  const setText = (spaceId: string, text: string) =>
    setDraft((current) => ({ ...current, [spaceId]: text }));
  const reset = (spaceId: string) =>
    setDraft((current) => {
      const next = { ...current };
      delete next[spaceId];
      return next;
    });

  return (
    <div className="space-y-6">
      <Header
        view={view}
        readOnly={readOnly}
        saving={saving}
        error={runError}
        dirty={dirty}
        blocked={blocked || (previewing && !previewQuery.data)}
        editCount={preview.edits.length}
        intentPending={intentDirty}
        onGenerate={onGenerate}
        onDiscard={() => setDraft({})}
      />

      {view.plateExplanation && (
        <PlateExplainer
          explanation={view.plateExplanation}
          currentPlate={preview.edits.length > 0 ? (floors[0]?.usable_area_m2 ?? null) : null}
        />
      )}

      <ColumnGuide editable={!readOnly} />

      <AiIntentCard
        projectId={projectId}
        // Bản máy chủ ĐÃ ÁP (đã bỏ không gian đề xuất thêm vượt sàn) thắng bản nháp thô.
        intent={
          previewing
            ? pendingIntent && (view.program.ai_intent ?? pendingIntent)
            : (baseView.headAiIntent ?? null)
        }
        pending={intentDirty}
        labels={view.roomLabels}
        readOnly={readOnly || saving}
        onAdopt={setPendingIntent}
        onDrop={() => setPendingIntent(null)}
      />
      {previewing && previewQuery.isLoading && (
        <p className="text-fg-subtle" aria-live="polite">
          Đang tính lại bảng diện tích theo đề xuất — không gọi AI thêm lượt nào.
        </p>
      )}
      {previewing && previewQuery.isError && (
        <p className="text-status-overdue">
          Chưa tính lại được bảng diện tích theo đề xuất. {toUserMessage(previewQuery.error)}
        </p>
      )}
      {view.warnings.length > 0 && <Warnings items={view.warnings} />}
      {preview.warnings.length > 0 && (
        <Warnings title="Hệ quả của chỗ sửa" items={preview.warnings.map((w) => w.message)} />
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
          proposed={base.spaces}
          labels={view.roomLabels}
          editable={!readOnly && !saving}
          draft={draft}
          unreadable={unreadable}
          preview={preview}
          onChange={setText}
          onReset={reset}
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

function Header({
  view,
  readOnly,
  saving,
  error,
  dirty,
  blocked,
  editCount,
  intentPending,
  onGenerate,
  onDiscard,
}: {
  view: ProgramView;
  readOnly: boolean;
  saving: boolean;
  error: string | null;
  /** Chỗ sửa trên màn hình khác chỗ sửa của bản đang chốt. */
  dirty: boolean;
  /** Còn ô sửa không hợp lệ — chưa chốt được. */
  blocked: boolean;
  editCount: number;
  /** Đề xuất AI trên màn hình khác đề xuất của bản đang chốt. */
  intentPending: boolean;
  onGenerate: () => void;
  onDiscard: () => void;
}): React.ReactElement {
  const total = view.program.spaces.length;
  const canRun = (!view.matchesHead || dirty) && !blocked;
  const buttonLabel = saving ? 'Đang chốt…' : 'Chốt chương trình không gian';

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
              ? 'Diện tích đề xuất lấy theo thống kê công trình NVG đã làm.'
              : 'Diện tích đề xuất do chương trình chia theo chuẩn nghề nghiệp — kho hồ sơ cũ chưa đủ để thống kê.'}
          </p>
          <p className="mt-2">
            {dirty ? (
              <span className="text-status-pending">
                {[
                  editCount > 0 ? `Có ${editCount} chỗ sửa diện tích chưa chốt` : null,
                  intentPending ? 'Đề xuất của AI đổi, chưa chốt' : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Đã bỏ các chỗ sửa của bản đang chốt — chưa chốt lại'}
                {blocked ? ' — còn ô chưa hợp lệ, xem dòng báo đỏ trong bảng' : ''}
              </span>
            ) : view.matchesHead ? (
              <span className="inline-flex items-center gap-1 text-status-completed">
                <CheckCircle2 className="size-4" aria-hidden />
                Đã chốt, các bước sau đang dùng bản này
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
            {editCount > 0 && (
              <Button variant="secondary" onClick={onDiscard} disabled={saving}>
                Bỏ mọi chỗ sửa
              </Button>
            )}
            <Button variant="primary" onClick={onGenerate} disabled={saving || !canRun}>
              {buttonLabel}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-status-overdue">{error}</p>}
      {/* Nhánh AI là một DÒNG RIÊNG từ 09/09/2026 (T15–T18): nó có chương trình không gian
          riêng, hợp đồng riêng và tab riêng. Trộn hai nhánh vào cùng một bảng thì con số hiện
          ra không rõ của bên nào, và ngày xoá bộ giải màn hình này vỡ theo. */}
      <p className="mt-3 text-fg-subtle">
        Lập bằng AI: mở tab <b>Thiết kế AI</b>.
      </p>
    </div>
  );
}

const m = (value: number) => `${formatNumber(value, 1)} m`;
const m2 = (value: number) => `${formatNumber(value, 1)} m²`;
const pct = (ratio: number) => `${formatNumber(ratio * 100, 1)}%`;

/**
 * Vì sao sàn mỗi tầng là con số ấy — kể lại từng bước bằng số thật của hồ sơ.
 *
 * Haan (13/09/2026): «nên có phần giải thích ở đầu về con số 180 m² mặt sàn». Con số ấy quyết
 * mọi ô «Đề xuất» bên dưới (phần sàn dư chia theo nó), mà trước đó nó chỉ hiện trơ trọi ở đầu
 * mỗi bảng tầng. Máy chủ gửi từng bước đã tính; màn hình chỉ kể lại, không tự tính lại.
 */
function PlateExplainer({
  explanation: e,
  currentPlate,
}: {
  explanation: PlateExplanation;
  /** Sàn đang hiện trên bảng — khác `plateM2` khi chỗ sửa diện tích đã nới sàn. */
  currentPlate: number | null;
}): React.ReactElement {
  const s = e.setbacks;
  const need = Math.max(e.evenShareM2, e.heaviest?.plateM2 ?? 0);
  const conclusion =
    e.limitedBy === 'buildable'
      ? `Nhu cầu (${m2(need)}) lớn hơn sàn xây được, nên sàn dừng ở trần xây được.`
      : e.limitedBy === 'heaviest_floor' && e.heaviest
        ? `Tầng ${e.heaviest.floor} là tầng cần nhiều nhất (${m2(e.heaviest.plateM2)}), chưa chạm trần xây được — sàn lấy theo tầng đó.`
        : `Nhu cầu chia đều cho các tầng (${m2(e.evenShareM2)}) chưa chạm trần xây được — sàn lấy theo mức đó.`;

  return (
    <section
      aria-labelledby="giai-thich-san"
      className="rounded border border-border bg-surface p-4"
    >
      <p id="giai-thich-san" className="font-medium">
        Vì sao sàn mỗi tầng là {m2(e.plateM2)}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Đất {m(e.site.widthM)} × {m(e.site.depthM)}, diện tích {m2(e.site.areaM2)}
          {Math.abs(e.rect.widthM - e.site.widthM) > 0.05 ||
          Math.abs(e.rect.depthM - e.site.depthM) > 0.05
            ? `; phần hình chữ nhật xếp phòng được ${m(e.rect.widthM)} × ${m(e.rect.depthM)}`
            : ''}
          .
        </li>
        <li>
          {/* Mỗi mặt lấy số lớn hơn giữa khoảng lùi đầu bài khai và khoảng sân mong muốn —
              nói rõ mặt nào do sân quyết, không thì con số «trái 2 m» trông như một khoảng lùi. */}
          Trừ khoảng lùi và khoảng sân mong muốn (mỗi mặt lấy số lớn hơn):{' '}
          {(['front', 'back', 'left', 'right'] as const)
            .map((side) => {
              const setback = s[side];
              const yard = e.yards?.[side] ?? 0;
              const label = { front: 'trước', back: 'sau', left: 'trái', right: 'phải' }[side];
              return yard > setback ? `${label} ${m(yard)} (sân)` : `${label} ${m(setback)}`;
            })
            .join(' · ')}{' '}
          → còn {m(e.afterSetbacks.widthM)} × {m(e.afterSetbacks.depthM)} ={' '}
          <b>{m2(e.afterSetbacks.areaM2)}</b>.
        </li>
        <li>
          {e.maxDensity !== null && e.byDensityM2 !== null ? (
            <>
              Mật độ xây dựng tối đa
              {/* Nói ĐỦ hai nguồn và nguồn nào thắng. Chỉ hiện con số đang áp thì người vừa gõ
                  80% ở Đầu bài đọc thấy 60% mà không biết vì sao (Haan hỏi đúng câu đó, 13/09/2026). */}
              {e.densityDeclared != null && e.densityRule
                ? `: đầu bài khai ${pct(e.densityDeclared)}, gói quy tắc${e.densityRule.source ? ` (${e.densityRule.source})` : ''} ${pct(e.densityRule.value)} — lấy mức chặt hơn`
                : e.densityRule
                  ? ` theo gói quy tắc${e.densityRule.source ? ` (${e.densityRule.source})` : ''}`
                  : ' theo đầu bài'}
              : {pct(e.maxDensity)} × {m2(e.site.areaM2)} = {m2(e.byDensityM2)}. Sàn xây được mỗi
              tầng lấy số nhỏ hơn: <b>{m2(e.buildableM2)}</b>.
              {e.densityDeclared != null &&
                e.densityRule &&
                e.densityDeclared > e.densityRule.value + 1e-9 && (
                  <span className="block text-status-pending">
                    Số đầu bài khai ({pct(e.densityDeclared)}) cao hơn gói quy tắc nên không được
                    dùng. Kiểm lại chỉ tiêu trên giấy phép hoặc thông tin quy hoạch của thửa.
                  </span>
                )}
            </>
          ) : (
            <>
              Đầu bài chưa khai mật độ xây dựng tối đa, nên không giới hạn mật độ — sàn xây được mỗi
              tầng là toàn bộ phần trong khoảng lùi: <b>{m2(e.buildableM2)}</b>. Có chỉ tiêu quy
              hoạch thì khai ở Đầu bài.
            </>
          )}
        </li>
        <li>
          Nhu cầu: các phòng cần {m2(e.roomDemandM2)} (theo chuẩn nghề, chưa kể hành lang) trên{' '}
          {e.floors} tầng. Chia đều và cộng {formatNumber(e.circulationRatio * 100, 0)}% giao thông
          → {m2(e.evenShareM2)} mỗi tầng
          {e.heaviest
            ? `; sau khi xếp phòng vào tầng, tầng ${e.heaviest.floor} cần nhiều nhất: ${m2(e.heaviest.plateM2)}`
            : ''}
          .
        </li>
        <li>
          {conclusion} Mọi tầng dùng chung một cỡ sàn (một khối nhà); tầng cần ít hơn thì phần dư
          chia thêm cho các phòng của tầng đó.
        </li>
      </ol>
      {currentPlate !== null && Math.abs(currentPlate - e.plateM2) > 0.05 && (
        <p className="mt-2 text-status-pending">
          Chỗ sửa diện tích đang nới sàn lên {m2(currentPlate)} — xem «Hệ quả của chỗ sửa».
        </p>
      )}
    </section>
  );
}

/**
 * Ba cột diện tích nghĩa là gì, và ai quyết. Nói MỘT lần ở đầu, không nhét vào tiêu đề cột:
 * bảng rộng, và tiêu đề dài bẻ dòng thì không ai đọc hết.
 */
function ColumnGuide({ editable }: { editable: boolean }): React.ReactElement {
  return (
    <dl className="grid gap-2 rounded border border-border bg-surface p-4 sm:grid-cols-3">
      <div>
        <dt className="font-medium">Tối thiểu</dt>
        <dd className="text-fg-subtle">
          Số lớn nhất của: khách khai ở đầu bài, kinh nghiệm NVG, chuẩn nghề. Không sửa ở đây —
          khách đổi ý thì sửa Đầu bài.
        </dd>
      </div>
      <div>
        <dt className="font-medium">Đề xuất</dt>
        <dd className="text-fg-subtle">
          Chương trình chia phần sàn còn dư của tầng theo chuẩn nghề.
          {editable ? ' Kiến trúc sư sửa được trước khi chốt.' : ''}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Tối đa</dt>
        <dd className="text-fg-subtle">
          Mức rộng rãi của chuẩn nghề — khoảng bộ giải được co giãn khi xếp mặt bằng.
        </dd>
      </div>
    </dl>
  );
}

/**
 * Đề xuất của AI ở Lớp 2a — hỏi khi BẤM NÚT, hiện nguyên văn để kiến trúc sư kiểm lại được.
 *
 * ⚠️ Khối này KHÔNG phải trang trí. AI có tham gia vào bảng diện tích bên dưới; thiếu chỗ nói
 * ra nó đã đề xuất gì và vì sao thì con số trong bảng trở thành thứ không giải thích được, và
 * "con người quyết định cuối cùng" (PRD 2.3) chỉ còn là một câu trong tài liệu.
 *
 * Nói rõ ranh giới ngay trên màn hình: AI chọn mức ƯU ÁI, không chọn mét vuông. Và nói rõ giá:
 * mỗi lần bấm là một lượt gọi tính tiền theo model đã chọn — số token, chi phí hiện ngay dưới.
 */
function AiIntentCard({
  projectId,
  intent,
  pending,
  labels,
  readOnly,
  onAdopt,
  onDrop,
}: {
  projectId: string;
  intent: ProgramAiIntent | null;
  /** Đề xuất đang hiện chưa nằm trong bản chốt. */
  pending: boolean;
  labels: Record<string, string>;
  readOnly: boolean;
  onAdopt: (intent: ProgramAiIntent) => void;
  onDrop: () => void;
}): React.ReactElement {
  // Bước này chỉ gửi bản tóm tắt ĐÃ ẨN DANH (hạng 3), nên model gói miễn phí dùng được — và
  // được chọn sẵn khi kỹ sư chưa chọn gì ở đây.
  const ai = useAiChoice('text', false, 3, 'program_intent');
  const ask = useAskProgramIntent();
  const name = (code: string) => labels[code] ?? code;
  const generous = intent?.emphasis.filter((e) => e.level === 'generous') ?? [];
  const modest = intent?.emphasis.filter((e) => e.level === 'modest') ?? [];

  const onAsk = () => {
    if (!ai.choice.route) return;
    void ask
      .mutateAsync({ projectId, route: ai.choice.route })
      .then((out) => {
        if (out.aiIntent) onAdopt(out.aiIntent);
      })
      .catch(() => undefined);
  };

  return (
    <section
      aria-labelledby="de-xuat-ai-uu-tien"
      className="rounded border border-border bg-surface p-4"
    >
      <p id="de-xuat-ai-uu-tien" className="font-medium">
        Đề xuất của AI về mức ưu tiên diện tích
      </p>
      <p className="mt-1 text-fg-subtle">
        AI chỉ chọn phòng nào nên rộng rãi, phòng nào nên tối giản. Diện tích cụ thể do đầu bài và
        chuẩn nghề nghiệp quyết định — đề xuất này không đổi được mức tối thiểu hay tối đa. AI chỉ
        chạy khi bấm nút; mỗi lần bấm là một lượt gọi theo model đã chọn.
      </p>

      {intent ? (
        <div className="mt-3">
          <p className="text-xs text-fg-subtle">
            {intent.model} ·{' '}
            {pending
              ? 'chưa chốt — bấm «Chốt chương trình không gian» để dùng'
              : 'đang dùng trong bản chốt'}
          </p>
          {intent.rationale && <p className="mt-1">{intent.rationale}</p>}
          {generous.length > 0 && (
            <p className="mt-2 text-fg-subtle">
              Ưu tiên rộng rãi: {generous.map((e) => name(e.space_type)).join(', ')}.
            </p>
          )}
          {modest.length > 0 && (
            <p className="text-fg-subtle">
              Giữ tối giản: {modest.map((e) => name(e.space_type)).join(', ')}.
            </p>
          )}
          {intent.add_spaces.length > 0 && (
            <p className="text-fg-subtle">
              AI đề xuất thêm: {intent.add_spaces.map(name).join(', ')}.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3">
          Chưa dùng đề xuất AI — bảng diện tích đang lập thuần theo chuẩn nghề.
        </p>
      )}

      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <AiModePicker
            kind="text"
            choice={ai.choice}
            options={ai.options}
            onMode={ai.pickMode}
            onRoute={ai.pickRoute}
            allowSolver={false}
            disabled={ask.isPending}
          />
          <Button variant="secondary" onClick={onAsk} disabled={ask.isPending || !ai.choice.route}>
            {ask.isPending ? 'Đang hỏi AI…' : intent ? 'Hỏi lại AI' : 'Hỏi AI'}
          </Button>
          {intent && (
            <Button variant="secondary" onClick={onDrop} disabled={ask.isPending}>
              Bỏ đề xuất AI
            </Button>
          )}
        </div>
      )}
      {ask.isError && <p className="mt-2 text-status-overdue">{toUserMessage(ask.error)}</p>}
      {ask.data?.notes.map((note) => (
        <p key={note} className="mt-2 text-status-pending">
          {note}
        </p>
      ))}
      {ask.data && <AiUsageLine usage={ask.data.usage} />}
    </section>
  );
}

function Warnings({
  items,
  title = 'Cần xem lại',
}: {
  items: string[];
  title?: string;
}): React.ReactElement {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="flex items-center gap-2 font-medium text-status-pending">
        <AlertTriangle className="size-4" aria-hidden />
        {title} ({items.length})
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

/**
 * Nhãn tiện ích trong phòng — lấy từ CHÍNH ô «nhu cầu riêng» của biểu mẫu đầu bài, nơi khách
 * đã chọn nó («Góc làm việc», không phải «Phòng làm việc» của danh mục phòng). Đọc bảng thấy
 * đúng chữ đã khai thì mới đối chiếu được.
 */
const NEED_LABEL: Record<string, string> = Object.fromEntries(
  BRIEF_FORM.sections
    .flatMap((section) => section.fields)
    .filter((field) => field.path === 'family')
    .flatMap((field) => field.options ?? [])
    .map((option) => [String(option.value), option.label]),
);

function includesText(codes: readonly string[] | null | undefined, labels: Record<string, string>) {
  if (!codes?.length) return '';
  const names = codes.map((code) =>
    (NEED_LABEL[code] ?? labels[code] ?? code).toLocaleLowerCase('vi'),
  );
  return ` (có ${names.join(', ')})`;
}

const MIN_SOURCE_LABEL: Record<string, string> = {
  brief: 'khách khai',
  rule_pack: 'kinh nghiệm NVG',
  practice: 'chuẩn nghề',
};

const TARGET_SOURCE_LABEL: Record<string, string> = {
  program: 'chương trình chia',
  statistics: 'thống kê NVG',
  architect: 'kiến trúc sư sửa',
};

function FloorTable({
  floor,
  usable,
  buildable,
  allocated,
  spaces,
  proposed,
  labels,
  editable,
  draft,
  unreadable,
  preview,
  onChange,
  onReset,
}: {
  floor: number;
  usable: number | null;
  buildable: number | null;
  allocated: number | null;
  spaces: ProgramSpace[];
  /** Bản chương trình tính, CHƯA sửa — để nói «đề xuất ban đầu là bao nhiêu». */
  proposed: SpaceProgram['spaces'];
  labels: Record<string, string>;
  editable: boolean;
  draft: Record<string, string>;
  unreadable: string[];
  preview: AppliedProgramEdits;
  onChange: (spaceId: string, text: string) => void;
  onReset: (spaceId: string) => void;
}): React.ReactElement {
  const floorErrors = preview.errors.filter((e) => e.spaceId === null && e.floor === floor);
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
      {floorErrors.map((e) => (
        <p key={e.message} role="alert" className="mt-1 text-status-overdue">
          {e.message}
        </p>
      ))}

      {/* Bảng rộng cuộn trong chính nó, không đẩy cả trang trượt ngang. */}
      <div className="mt-2 overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[40rem] border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-sunken text-left">
              <th className="px-3 py-2 font-medium">Không gian</th>
              <th className="px-3 py-2 text-right font-medium">Tối thiểu</th>
              <th className="px-3 py-2 text-right font-medium">Đề xuất</th>
              <th className="px-3 py-2 text-right font-medium">Tối đa</th>
              <th className="px-3 py-2 font-medium">Yêu cầu</th>
            </tr>
          </thead>
          <tbody>
            {spaces.map((space) => {
              const name = labels[space.type] ?? space.type;
              const original = proposed.find((p) => p.id === space.id);
              const originalTarget = original?.target_area_m2 ?? original?.min_area_m2 ?? null;
              const text = draft[space.id];
              const edited = text !== undefined;
              const rowError = unreadable.includes(space.id)
                ? 'Nhập một số, ví dụ 12,5.'
                : (preview.errors.find((e) => e.spaceId === space.id)?.message ?? null);
              const errorId = `loi-dien-tich-${space.id}`;
              return (
                <tr key={space.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2">
                    {name}
                    {/* Tiện ích nằm TRONG phòng (tủ đồ, góc học tập…) ghi gộp vào tên, diện tích
                        đã nằm trong ba con số của phòng — không có dòng riêng (Haan, 13/09/2026). */}
                    {includesText(space.includes, labels)}
                    {/* Phòng của ai — đọc bảng biết ngay phòng nào dành cho ai, kiểm được với
                        «Thành viên gia đình» của đầu bài (Haan, 13/09/2026). */}
                    {space.occupant && (
                      <span className="block text-xs text-fg-subtle">{space.occupant}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(space.min_area_m2, 1)}
                    {space.min_source && (
                      <span className="block text-xs text-fg-subtle">
                        {MIN_SOURCE_LABEL[space.min_source]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editable ? (
                      <div className="ml-auto flex max-w-[11rem] items-center justify-end gap-1">
                        <Input
                          inputMode="decimal"
                          aria-label={`Diện tích đề xuất — ${name}, tầng ${space.floor}`}
                          aria-invalid={rowError ? true : undefined}
                          aria-describedby={rowError ? errorId : undefined}
                          className={cn(
                            'h-8 w-24 text-right tabular-nums',
                            edited && 'font-medium',
                            rowError && 'border-status-overdue',
                          )}
                          value={text ?? formatNumber(space.target_area_m2 ?? space.min_area_m2, 1)}
                          onChange={(event) => onChange(space.id, event.target.value)}
                        />
                        {edited && (
                          <button
                            type="button"
                            onClick={() => onReset(space.id)}
                            className="inline-flex size-8 items-center justify-center rounded text-fg-subtle hover:bg-surface-sunken hover:text-fg"
                            aria-label={`Trả về số chương trình đề xuất — ${name}`}
                            title={
                              originalTarget != null
                                ? `Trả về ${formatNumber(originalTarget, 1)} m²`
                                : undefined
                            }
                          >
                            <RotateCcw className="size-4" aria-hidden />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="font-medium">
                        {formatNumber(space.target_area_m2 ?? space.min_area_m2, 1)}
                      </span>
                    )}
                    {space.target_source && (
                      <span className="block text-xs text-fg-subtle">
                        {TARGET_SOURCE_LABEL[space.target_source]}
                        {space.target_source === 'architect' && originalTarget != null
                          ? ` · đề xuất ${formatNumber(originalTarget, 1)}`
                          : ''}
                      </span>
                    )}
                    {rowError && (
                      <span id={errorId} className="block text-left text-xs text-status-overdue">
                        {rowError}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(space.max_area_m2 ?? space.min_area_m2, 1)}
                  </td>
                  <td className="px-3 py-2 text-fg-subtle">{needsOf(space)}</td>
                </tr>
              );
            })}
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
