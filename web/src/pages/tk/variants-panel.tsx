/**
 * Phương án mặt bằng — kết quả Lớp 3 (TK-12) và cổng chốt phương án sớm (11-design-flow 11.4b).
 *
 * Ba quyết định về cách bày:
 *
 *  · **Bảng so sánh bằng ngôn ngữ khách đứng trước.** Khách chốt phương án dựa trên công năng
 *    và bố cục — mấy phòng ngủ, phòng thờ tầng mấy, để xe ở đâu — nên các con số đó đứng
 *    thành cột cạnh nhau. Tỉ lệ giao thông vẫn có nhưng đứng cuối, cho kiến trúc sư.
 *  · **Vô nghiệm là một cột như mọi cột khác**, kèm lời giải thích. Giấu nó đi thì kiến trúc
 *    sư không biết vì sao chỉ có hai phương án thay vì ba.
 *  · **Bản đang hiệu lực nói ra bằng chữ**, không chỉ bằng màu (CGD 6.8): mọi bước sau —
 *    bản vẽ, khối 3D, thống kê — đọc đúng bản đó.
 *
 * Hình học không vẽ ở đây trong bước này: bản vẽ đọc được (trục, kích thước, cửa) do Container
 * sinh thành SVG ở bước sau, giao diện chỉ hiển thị — một nguồn hình học duy nhất.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, LayoutGrid } from 'lucide-react';
import { formatDateTime, formatNumber } from '@nvg/shared';
import { compareFloorPlans, type FloorPlan } from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import {
  useChooseFloorPlan,
  useFloorPlanVariants,
  useGenerateFloorPlans,
  usePublishFloorPlan,
  type FloorPlanGeneration,
  type FloorPlanVariant,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { MassingViewer } from './massing-viewer';
import { RenderPanel } from './render-panel';
import { SchedulesPanel } from './schedules-panel';
import { SheetViewer } from './sheet-viewer';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';

export function VariantsPanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}): React.ReactElement {
  const variants = useFloorPlanVariants(projectId);
  const generate = useGenerateFloorPlans();
  const choose = useChooseFloorPlan();
  const publish = usePublishFloorPlan();
  // Phương án đang XEM bản vẽ — mặc định là bản hiệu lực; bấm "Xem bản vẽ" ở thẻ khác để đổi.
  const [viewing, setViewing] = useState<string | null>(null);
  // Ảnh khối chụp từ trình xem ba chiều — đầu vào của phối cảnh.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const headId = variants.data?.headArtifactId ?? null;
  // Phương án mở sẵn khi vào màn hình.
  //
  // Bản đang hiệu lực có thể thuộc một ĐỢT TRƯỚC — khách đổi đầu bài, đợt mới đã sinh nhưng
  // chưa ai chọn lại. Khi đó mở thẳng bản cũ là bày ra một màn hình nửa nọ nửa kia: thẻ tóm
  // tắt phía trên là đợt mới, còn tờ bản vẽ, khối ba chiều và bảng thống kê phía dưới là đợt
  // cũ, cùng mang nhãn "Phương án A" (đo được 06/09/2026: thẻ ghi 5 tầng 356,8 m², bảng thống
  // kê ghi 4 tầng 303,5 m²). Nên chỉ mở sẵn bản hiệu lực khi nó thuộc đợt đang xem; không thì
  // mở phương án khả thi đầu tiên của đợt này. Bản cũ vẫn xem được qua nút ở khối "Đợt trước".
  const current = variants.data?.variants ?? [];
  const defaultViewing =
    current.find((v) => v.artifactId === headId)?.artifactId ??
    current.find((v) => v.status === 'ok')?.artifactId ??
    null;
  useEffect(() => {
    setViewing((value) => value ?? defaultViewing);
  }, [defaultViewing]);

  if (variants.isLoading) return <VariantsSkeleton />;

  // "Chưa chốt chương trình không gian" là trạng thái nghiệp vụ, bày như trạng thái rỗng có
  // hướng dẫn — không phải hộp lỗi đỏ.
  if (variants.isError || !variants.data) {
    return (
      <EmptyState
        icon={<LayoutGrid className="size-6" />}
        message={toUserMessage(variants.error)}
        action={
          <Button variant="secondary" onClick={() => void variants.refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  const view = variants.data;
  const busy = generate.isPending || choose.isPending;
  const error = generate.isError
    ? toUserMessage(generate.error)
    : choose.isError
      ? toUserMessage(choose.error)
      : null;
  const onGenerate = () => void generate.mutateAsync({ projectId }).catch(() => undefined);

  if (view.variants.length === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid className="size-6" />}
        message="Chưa có phương án mặt bằng nào. Sinh phương án từ chương trình không gian đã chốt — ba phương án khác nhau về cấu trúc, vài giây."
        action={
          !readOnly ? (
            <Button variant="primary" onClick={onGenerate} disabled={busy}>
              {generate.isPending ? 'Đang sinh…' : 'Sinh phương án'}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const feasible = view.variants.filter((v) => v.status === 'ok');

  return (
    <div className="space-y-6">
      <div className="rounded border border-border bg-surface-sunken p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1 font-medium">
              {feasible.length} phương án khả thi trên {view.variants.length} đã sinh
              <SectionHelp {...DESIGN_HELP.variants} />
            </p>
            <p className="mt-1 text-fg-subtle">
              Mỗi phương án là một cấu trúc bố cục khác nhau, không phải vài con số khác nhau. Chọn
              một phương án để các bước sau — bản vẽ, khối ba chiều, thống kê — dùng bản đó.
            </p>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onGenerate} disabled={busy}>
                {generate.isPending ? 'Đang sinh…' : 'Sinh lại phương án'}
              </Button>
              {view.headArtifactId && (
                <Button
                  variant="primary"
                  disabled={busy || publish.isPending}
                  onClick={() => void publish.mutateAsync({ projectId }).catch(() => undefined)}
                >
                  {publish.isPending ? 'Đang phát hành…' : 'Phát hành hồ sơ kiến trúc'}
                </Button>
              )}
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-status-overdue">{error}</p>}
        {publish.isError && (
          <p className="mt-3 text-status-overdue">{toUserMessage(publish.error)}</p>
        )}
        {publish.isSuccess && (
          <p className="mt-3 text-status-completed">
            Đã phát hành {publish.data.documents.length} tờ mặt bằng vào hệ tài liệu (phiên bản do
            hệ tài liệu cấp). Xem ở tab Phiên bản bản vẽ và Hồ sơ liên quan.
          </p>
        )}
      </div>

      <ComparisonTable variants={view.variants} />

      <div className="grid gap-4 lg:grid-cols-3">
        {view.variants.map((variant) => (
          <VariantCard
            key={variant.artifactId}
            variant={variant}
            canChoose={!readOnly && variant.status === 'ok' && !variant.isHead}
            isViewing={variant.artifactId === (viewing ?? defaultViewing)}
            busy={busy}
            onChoose={() =>
              void choose
                .mutateAsync({ projectId, artifactId: variant.artifactId })
                .catch(() => undefined)
            }
            onView={() => setViewing(variant.artifactId)}
          />
        ))}
      </div>

      {(view.previous ?? []).length > 0 && (
        <PreviousGenerations
          previous={view.previous}
          current={
            view.variants.find((v) => v.isHead) ??
            view.variants.find((v) => v.status === 'ok') ??
            null
          }
          onView={(id) => setViewing(id)}
        />
      )}

      {(() => {
        const shown = [...view.variants, ...(view.previous ?? []).flatMap((g) => g.variants)].find(
          (v) => v.artifactId === (viewing ?? defaultViewing),
        );
        if (!shown || shown.status !== 'ok') return null;
        return (
          <>
            <SheetViewer
              projectId={projectId}
              artifactId={shown.artifactId}
              levels={(shown.summary?.levels ?? []).map((l) => l.level)}
              variantLabel={`Phương án ${shown.variantId}`}
            />
            <MassingViewer
              projectId={projectId}
              artifactId={shown.artifactId}
              variantLabel={`Phương án ${shown.variantId}`}
              onSnapshot={setSnapshot}
            />
            <RenderPanel
              projectId={projectId}
              snapshot={snapshot}
              style={null}
              variantLabel={`Phương án ${shown.variantId}`}
            />
            <SchedulesPanel
              projectId={projectId}
              artifactId={shown.artifactId}
              variantLabel={`Phương án ${shown.variantId}`}
            />
          </>
        );
      })()}
    </div>
  );
}

/** Cột = phương án, hàng = câu khách hay hỏi. Không có thuật ngữ kỹ thuật ở các hàng đầu. */
function ComparisonTable({ variants }: { variants: FloorPlanVariant[] }): React.ReactElement {
  const rows: Array<{ label: string; cell: (v: FloorPlanVariant) => string }> = [
    {
      label: 'Tổng diện tích sàn',
      cell: (v) => (v.summary ? `${formatNumber(v.summary.total_area_m2, 1)} m²` : '—'),
    },
    { label: 'Số phòng ngủ', cell: (v) => (v.summary ? String(v.summary.bedrooms) : '—') },
    {
      label: 'Phòng thờ',
      cell: (v) =>
        v.summary ? (v.summary.altar_level ? `Tầng ${v.summary.altar_level}` : 'Không có') : '—',
    },
    {
      label: 'Chỗ để xe',
      cell: (v) =>
        v.summary ? (v.summary.garage_level ? `Tầng ${v.summary.garage_level}` : 'Không có') : '—',
    },
    {
      label: 'Diện tích giao thông',
      cell: (v) => (v.summary ? `${formatNumber(v.summary.circulation_share * 100, 1)}%` : '—'),
    },
    { label: 'Ràng buộc', cell: constraintText },
  ];

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full min-w-[36rem] border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface-sunken text-left">
            <th className="px-3 py-2 font-medium">So sánh</th>
            {variants.map((v) => (
              <th key={v.artifactId} className="px-3 py-2 font-medium">
                Phương án {v.variantId}
                {v.isHead && <span className="ml-2 text-status-completed">· đang hiệu lực</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-fg-subtle">{row.label}</td>
              {variants.map((v) => (
                <td key={v.artifactId} className="px-3 py-2 tabular-nums">
                  {row.cell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Đợt trước — bản cũ còn nguyên để so sánh (11-design-flow 11.6: "phương án cũ vẫn còn nguyên
 * trong lịch sử"). Kèm phần tác động: điều gì đã đổi giữa phương án A của đợt trước và phương
 * án đang hiện hành, bằng câu tiếng Việt tất định (TK-13), tính ngay trên trình duyệt từ hai
 * mặt bằng đã có trong danh sách.
 */
function PreviousGenerations({
  previous,
  current,
  onView,
}: {
  previous: FloorPlanGeneration[];
  current: FloorPlanVariant | null;
  onView: (artifactId: string) => void;
}): React.ReactElement {
  return (
    <section className="rounded border border-border bg-surface p-4">
      <h3 className="font-medium">Đợt trước ({previous.length})</h3>
      <p className="text-fg-subtle">
        Chương trình không gian đã đổi và phương án được giải lại. Bản cũ vẫn còn nguyên để so sánh;
        chọn "Xem bản vẽ" để mở lại.
      </p>
      <ul className="mt-3 space-y-4">
        {previous.map((generation) => {
          const reference =
            generation.variants.find(
              (v) => v.status === 'ok' && v.variantId === current?.variantId,
            ) ??
            generation.variants.find((v) => v.status === 'ok') ??
            null;
          const labels: Record<string, string> = {};
          for (const v of [reference, current]) {
            for (const level of v?.summary?.levels ?? []) {
              for (const room of level.rooms) labels[room.id] = room.label;
            }
          }
          const changes =
            reference?.floorPlan && current?.floorPlan
              ? compareFloorPlans(
                  reference.floorPlan as FloorPlan,
                  current.floorPlan as FloorPlan,
                  labels,
                )
              : [];
          return (
            <li key={generation.programArtifactId} className="rounded border border-border p-3">
              <p className="font-medium">
                Đợt {formatDateTime(generation.createdAt)}
                <span className="ml-2 font-normal text-fg-subtle">
                  {generation.variants
                    .map((v) =>
                      v.summary
                        ? `${v.variantId}: ${formatNumber(v.summary.total_area_m2, 1)} m², ${v.summary.bedrooms} phòng ngủ`
                        : `${v.variantId}: vô nghiệm`,
                    )
                    .join(' · ')}
                </span>
              </p>
              {reference && current && (
                <div className="mt-2">
                  <p className="text-fg-subtle">
                    Tác động so với bản đang hiệu lực (phương án {reference.variantId} đợt này →
                    phương án {current.variantId} hiện hành):
                  </p>
                  {changes.length === 0 ? (
                    <p>Không có thay đổi đáng kể.</p>
                  ) : (
                    <ul className="list-disc space-y-0.5 pl-5">
                      {changes.map((c) => (
                        <li key={c.message}>{c.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {generation.variants
                  .filter((v) => v.status === 'ok')
                  .map((v) => (
                    <Button
                      key={v.artifactId}
                      variant="secondary"
                      onClick={() => onView(v.artifactId)}
                    >
                      Xem bản vẽ {v.variantId}
                    </Button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function constraintText(v: FloorPlanVariant): string {
  if (v.status === 'infeasible') return 'Vô nghiệm';
  const violations = v.summary?.violations ?? [];
  const errors = violations.filter((x) => x.severity === 'error').length;
  const warnings = violations.length - errors;
  if (violations.length === 0) return 'Đạt';
  return [errors ? `${errors} lỗi` : null, warnings ? `${warnings} cảnh báo` : null]
    .filter(Boolean)
    .join(' · ');
}

function VariantCard({
  variant,
  canChoose,
  isViewing,
  busy,
  onChoose,
  onView,
}: {
  variant: FloorPlanVariant;
  canChoose: boolean;
  isViewing: boolean;
  busy: boolean;
  onChoose: () => void;
  onView: () => void;
}): React.ReactElement {
  return (
    <section className="flex flex-col rounded border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">Phương án {variant.variantId}</h3>
          <p className="text-fg-subtle">{variant.label}</p>
        </div>
        {variant.isHead && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-status-completed">
            <CheckCircle2 className="size-4" aria-hidden />
            Đang hiệu lực
          </span>
        )}
      </div>

      {variant.status === 'infeasible' ? (
        <div className="mt-3 rounded border border-border bg-surface-sunken p-3">
          <p className="flex items-center gap-2 font-medium text-status-overdue">
            <AlertTriangle className="size-4" aria-hidden />
            Không xếp được
          </p>
          <p className="mt-1">{variant.infeasibility?.message}</p>
          {/* Mã quy tắc (`corridor_min_width`…) CỐ Ý không hiện: đó là tên biến trong bộ quy
              tắc, người dùng không đọc được và cũng không làm gì được với nó. Câu ngay trên đã
              nói bằng tiếng Việt hai yêu cầu nào đang chọi nhau; chỗ này nói bước tiếp theo.
              Mã vẫn nằm nguyên trong artifact InfeasibilityReport để tra khi cần. */}
          <p className="mt-1 text-fg-subtle">
            Cách gỡ: bớt yêu cầu hoặc tăng diện tích ở Chương trình không gian, rồi sinh lại phương
            án.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {variant.summary?.levels.map((level) => (
            <div key={level.level}>
              <p className="font-medium">
                Tầng {level.level}
                <span className="ml-2 font-normal text-fg-subtle">
                  {formatNumber(level.area_m2, 1)} m²
                  {level.height_m ? ` · cao ${formatNumber(level.height_m, 1)} m` : ''}
                </span>
              </p>
              <p className="text-fg-subtle">
                {level.rooms.map((r) => `${r.label} ${formatNumber(r.area_m2, 1)}`).join(' · ')}
              </p>
            </div>
          ))}
          {variant.summary && variant.summary.violations.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-status-pending">
              {variant.summary.violations.map((v) => (
                <li key={`${v.rule_id}-${v.message}`}>{v.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(canChoose || (variant.status === 'ok' && !isViewing)) && (
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {variant.status === 'ok' && !isViewing && (
            <Button variant="secondary" onClick={onView}>
              Xem bản vẽ
            </Button>
          )}
          {canChoose && (
            <Button variant="secondary" onClick={onChoose} disabled={busy}>
              Chọn phương án này
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** Khung chờ đúng hình dạng nội dung, không phải vòng xoay giữa màn hình (AFD 6.7). */
function VariantsSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-24 animate-pulse rounded bg-surface-sunken" />
      <div className="h-40 animate-pulse rounded bg-surface-sunken" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-56 animate-pulse rounded bg-surface-sunken" />
        ))}
      </div>
    </div>
  );
}
