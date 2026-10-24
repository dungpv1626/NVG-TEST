/**
 * Bảng theo dõi công trình — màn hình của Trưởng phòng Thi công (Đợt 2 — 2E).
 *
 * Tiêu chí xong của Đợt 2: «Trưởng phòng thấy công trình nào chậm không cần gọi». Mỗi công trình
 * đang chạy một dòng (mẫu Danh sách, AFD 4.2): mốc hiện tại, nhật ký hôm nay, mốc chờ kiểm, đề
 * nghị đang mở. Dòng có vấn đề đứng trên; vấn đề luôn kèm chữ, không chỉ màu (CGD 6.8).
 *
 * «Chậm» chỉ tính từ ngày đã khai (hạn công trình, hạn mốc, ngày cần của đề nghị) — CSDL tính
 * (`tc_site_board`, 0191). Chưa ghi nhật ký hôm nay KHÔNG tính là chậm: NVG chưa quyết bao lâu
 * không ghi là có vấn đề (CLAUDE.md 5.2), bảng hiện lần ghi gần nhất để người xem tự đánh giá.
 * Phạm vi công trình do RLS quyết — chỉ huy trưởng mở màn hình này chỉ thấy công trình được giao.
 */

import { useSearchParams } from 'react-router-dom';
import { SITE_STAGE_META, formatDate, siteDisplayStatus } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useSiteBoard, type SiteBoardRow } from '@/hooks/use-construction-sites';
import { cn } from '@/lib/utils';
import { TcNav } from './tc-nav';

const ATTENTION_PARAM = 'can-chu-y';

interface BoardRow extends EntityRow {
  board: SiteBoardRow;
  problems: string[];
}

/** Vấn đề của một công trình, theo thứ tự nặng → nhẹ; rỗng = ổn. */
function problemsOf(r: SiteBoardRow): string[] {
  const out: string[] = [];
  if (r.site_overdue) out.push('Quá hạn hoàn thành');
  if (r.current_milestone_overdue) out.push('Mốc quá hạn');
  if (r.overdue_requests > 0) out.push(`${r.overdue_requests} đề nghị quá ngày cần`);
  if (r.overdue_warranty_claims > 0)
    out.push(`${r.overdue_warranty_claims} phiếu bảo hành quá hạn`);
  if (r.milestones_waiting_check > 0) out.push(`${r.milestones_waiting_check} mốc chờ kiểm`);
  return out;
}

export function SiteBoardPage() {
  const { data, isLoading, error, refetch } = useSiteBoard();
  const [searchParams, setSearchParams] = useSearchParams();
  const attentionOnly = searchParams.get(ATTENTION_PARAM) === '1';

  const all: BoardRow[] = (data ?? [])
    .map((r) => ({
      id: r.site_id,
      code: r.code,
      title: r.name,
      responsiblePerson: r.responsible_name,
      status: siteDisplayStatus(r.stage, r.planned_end_date),
      deadline: r.planned_end_date,
      companyId: r.company_id,
      board: r,
      problems: problemsOf(r),
    }))
    // Có vấn đề đứng trên, nhiều vấn đề hơn đứng trên nữa; còn lại theo mã.
    .sort((a, b) => b.problems.length - a.problems.length || a.code.localeCompare(b.code));
  const rows = attentionOnly ? all.filter((r) => r.problems.length > 0) : all;

  const running = all.filter((r) => r.board.stage === 'dang_thi_cong');
  // `alarm`: số > 0 là vấn đề (đỏ). Chưa ghi nhật ký hôm nay chỉ là tình trạng — sáng sớm
  // chưa ai ghi là bình thường.
  const summary = [
    {
      label: 'Cần chú ý',
      value: all.filter((r) => r.problems.length > 0).length,
      alarm: true,
    },
    {
      label: 'Mốc chờ kiểm',
      value: all.reduce((n, r) => n + r.board.milestones_waiting_check, 0),
      alarm: true,
    },
    {
      label: 'Chưa ghi nhật ký hôm nay',
      value: running.filter((r) => !r.board.logged_today).length,
      alarm: false,
    },
  ];

  return (
    <>
      <TcNav />
      <PageHeader
        title="Bảng theo dõi công trình"
        breadcrumbs={[
          { label: 'Thi công & Ngân sách' },
          { label: 'Công trình', to: '/tc/cong-trinh' },
          { label: 'Bảng theo dõi' },
        ]}
        description="Mỗi công trình đang chạy (và công trình bảo hành còn phiếu mở) một dòng: mốc hiện tại, nhật ký hôm nay, mốc chờ kiểm, phiếu bảo hành, đề nghị đang mở. Công trình có vấn đề đứng trên."
      />

      {!isLoading && !error && (
        <dl className="mb-4 grid grid-cols-3 gap-2">
          {summary.map((s) => (
            <div
              key={s.label}
              className="rounded-card bg-surface px-3 py-2 shadow-card sm:px-4 sm:py-3"
            >
              <dt className="text-xs text-fg-subtle sm:text-sm">{s.label}</dt>
              <dd
                className={cn(
                  'text-xl font-semibold sm:text-2xl',
                  s.alarm && s.value > 0 ? 'text-status-overdue' : 'text-fg',
                )}
              >
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <EntityTable<BoardRow>
        rows={rows}
        isLoading={isLoading}
        error={error ?? undefined}
        onRetry={() => void refetch()}
        detailPath={(row) => `/tc/cong-trinh/${row.id}`}
        searchPlaceholder="Tìm theo mã, tên công trình hoặc chỉ huy trưởng…"
        emptyMessage={
          attentionOnly
            ? 'Không có công trình nào đang có vấn đề.'
            : 'Chưa có công trình nào đang chạy. Công trình được mở từ hợp đồng đã ký hoặc khi hồ sơ thiết kế được bàn giao.'
        }
        filters={
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                if (e.target.checked) next.set(ATTENTION_PARAM, '1');
                else next.delete(ATTENTION_PARAM);
                setSearchParams(next);
              }}
              className="size-4"
            />
            Chỉ công trình cần chú ý
          </label>
        }
        columns={[
          {
            key: 'problems',
            header: 'Cần chú ý',
            render: (r) =>
              r.problems.length === 0 ? (
                <span className="text-status-completed">Ổn</span>
              ) : (
                <ul className="space-y-0.5">
                  {r.problems.map((p) => (
                    <li key={p} className="font-medium text-status-overdue">
                      {p}
                    </li>
                  ))}
                </ul>
              ),
          },
          {
            key: 'milestone',
            header: 'Mốc hiện tại',
            render: (r) => <MilestoneCell r={r.board} />,
          },
          {
            key: 'log',
            header: 'Nhật ký',
            render: (r) => <LogCell r={r.board} />,
          },
          {
            key: 'warranty',
            header: 'Phiếu bảo hành mở',
            numeric: true,
            render: (r) =>
              r.board.open_warranty_claims === 0 ? (
                <span className="text-fg-subtle">—</span>
              ) : (
                r.board.open_warranty_claims
              ),
          },
          {
            key: 'requests',
            header: 'Đề nghị đang mở',
            numeric: true,
            render: (r) =>
              r.board.open_requests === 0 ? (
                <span className="text-fg-subtle">—</span>
              ) : (
                r.board.open_requests
              ),
          },
        ]}
      />
    </>
  );
}

function MilestoneCell({ r }: { r: SiteBoardRow }) {
  if (r.milestones_total === 0) {
    return <span className="text-fg-subtle">{SITE_STAGE_META[r.stage].label} · chưa có mốc</span>;
  }
  if (!r.current_milestone_label) {
    return (
      <span className="text-status-completed">
        Đạt đủ {r.milestones_total}/{r.milestones_total} mốc
      </span>
    );
  }
  return (
    <span>
      <span className="font-medium">{r.current_milestone_label}</span>
      <span className="block text-xs text-fg-subtle">
        Đạt {r.milestones_passed}/{r.milestones_total}
        {r.current_milestone_status === 'cho_ky_thuat' && ' · chờ kiểm'}
        {r.current_milestone_due && (
          <span className={cn(r.current_milestone_overdue && 'font-semibold text-status-overdue')}>
            {' '}
            · hạn {formatDate(r.current_milestone_due)}
          </span>
        )}
      </span>
    </span>
  );
}

function LogCell({ r }: { r: SiteBoardRow }) {
  if (r.logged_today) return <span className="text-status-completed">Đã ghi hôm nay</span>;
  if (!r.last_log_date) return <span className="text-fg-subtle">Chưa có nhật ký</span>;
  return <span>Lần cuối {formatDate(r.last_log_date)}</span>;
}
