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
import { formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import {
  useChooseFloorPlan,
  useFloorPlanVariants,
  useGenerateFloorPlans,
  type FloorPlanVariant,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { MassingViewer } from './massing-viewer';
import { SchedulesPanel } from './schedules-panel';
import { SheetViewer } from './sheet-viewer';

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
  // Phương án đang XEM bản vẽ — mặc định là bản hiệu lực; bấm "Xem bản vẽ" ở thẻ khác để đổi.
  const [viewing, setViewing] = useState<string | null>(null);
  const headId = variants.data?.headArtifactId ?? null;
  useEffect(() => {
    setViewing((current) => current ?? headId);
  }, [headId]);

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
            <p className="font-medium">
              {feasible.length} phương án khả thi trên {view.variants.length} đã sinh
            </p>
            <p className="mt-1 text-fg-subtle">
              Mỗi phương án là một cấu trúc bố cục khác nhau, không phải vài con số khác nhau. Chọn
              một phương án để các bước sau — bản vẽ, khối ba chiều, thống kê — dùng bản đó.
            </p>
          </div>
          {!readOnly && (
            <Button variant="secondary" onClick={onGenerate} disabled={busy}>
              {generate.isPending ? 'Đang sinh…' : 'Sinh lại phương án'}
            </Button>
          )}
        </div>
        {error && <p className="mt-3 text-status-overdue">{error}</p>}
      </div>

      <ComparisonTable variants={view.variants} />

      <div className="grid gap-4 lg:grid-cols-3">
        {view.variants.map((variant) => (
          <VariantCard
            key={variant.artifactId}
            variant={variant}
            canChoose={!readOnly && variant.status === 'ok' && !variant.isHead}
            isViewing={variant.artifactId === (viewing ?? headId)}
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

      {(() => {
        const shown = view.variants.find((v) => v.artifactId === (viewing ?? headId));
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
          {variant.infeasibility && variant.infeasibility.conflictRules.length > 0 && (
            <p className="mt-1 text-fg-subtle">
              Quy tắc mâu thuẫn: {variant.infeasibility.conflictRules.join(', ')}
            </p>
          )}
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
