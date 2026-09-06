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

import { AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import {
  useGenerateSpaceProgram,
  useSpaceProgram,
  type ProgramSpace,
  type ProgramView,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';

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

  const view = program.data;
  const floors = view.program.floor_allocation?.length
    ? [...view.program.floor_allocation].sort((a, b) => a.floor - b.floor)
    : [...new Set(view.program.spaces.map((s) => s.floor))]
        .sort((a, b) => a - b)
        .map((floor) => ({ floor, usable_area_m2: null, allocated_area_m2: null }));

  return (
    <div className="space-y-6">
      <Header
        view={view}
        readOnly={readOnly}
        saving={generate.isPending}
        error={generate.isError ? toUserMessage(generate.error) : null}
        onGenerate={() => void generate.mutateAsync({ projectId }).catch(() => undefined)}
      />

      {view.warnings.length > 0 && <Warnings items={view.warnings} />}
      {view.unresolvedNeeds.length > 0 && <UnresolvedNeeds items={view.unresolvedNeeds} />}

      {floors.map((allocation) => (
        <FloorTable
          key={allocation.floor}
          floor={allocation.floor}
          usable={allocation.usable_area_m2 ?? null}
          allocated={allocation.allocated_area_m2 ?? null}
          spaces={view.program.spaces.filter((s) => s.floor === allocation.floor)}
          labels={view.roomLabels}
        />
      ))}
    </div>
  );
}

function Header({
  view,
  readOnly,
  saving,
  error,
  onGenerate,
}: {
  view: ProgramView;
  readOnly: boolean;
  saving: boolean;
  error: string | null;
  onGenerate: () => void;
}): React.ReactElement {
  const total = view.program.spaces.length;

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
            {view.matchesHead ? (
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
          <Button variant="primary" onClick={onGenerate} disabled={saving || view.matchesHead}>
            {saving ? 'Đang chốt…' : 'Chốt chương trình không gian'}
          </Button>
        )}
      </div>
      {error && <p className="mt-3 text-status-overdue">{error}</p>}
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
  allocated,
  spaces,
  labels,
}: {
  floor: number;
  usable: number | null;
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
