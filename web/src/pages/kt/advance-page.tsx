/**
 * Tạm ứng đang theo dõi — KT-03.
 *
 * Danh sách này là các khoản tiền ĐÃ ứng ra và chưa hoàn xong, không phải các đề nghị tạm
 * ứng: một đề nghị có thể bị từ chối, còn một dòng ở đây nghĩa là tiền đã rời quỹ.
 *
 * "Quá hạn" là trạng thái SUY RA từ hạn hoàn ứng, không lưu trong CSDL — lưu thành cột thì
 * phải có tác vụ nền quét lại mỗi ngày, và mỗi lần quét sót là một khoản hiển thị sai.
 *
 * Hoàn ứng KHÔNG bấm từ đây: nó là một đề nghị chi loại "Hoàn ứng", đi qua đúng luồng duyệt
 * bốn bước như mọi khoản khác (KT-01). Một nút "hoàn ứng nhanh" ở đây sẽ là đường vòng.
 */

import { Link } from 'react-router-dom';
import { advanceDisplayStatus, advanceOutstanding, formatCurrency, formatDate } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { useAdvances } from '@/hooks/use-accounting';
import { useCan } from '@/lib/auth';
import { KtNav } from './kt-nav';

interface AdvanceRow extends EntityRow {
  amount: string;
  outstanding: bigint;
  advanceDate: string;
  /** Đề nghị tạm ứng đã sinh ra khoản này — đường truy ngược tới chứng từ gốc. */
  requestId: string;
}

export function AdvanceListPage() {
  const canCreate = useCan('KT', 'create');
  const { data, isLoading, error, refetch } = useAdvances();

  const rows: AdvanceRow[] = (data ?? []).map((a) => ({
    id: a.id,
    code: formatDate(a.advance_date),
    title: a.purpose,
    responsiblePerson: a.holder?.full_name ?? null,
    status: advanceDisplayStatus(a.status, a.due_date),
    deadline: a.due_date,
    companyId: a.company_id,
    createdAt: a.advance_date,
    amount: a.amount,
    outstanding: advanceOutstanding(a.amount, a.settled_amount),
    advanceDate: a.advance_date,
    requestId: a.payment_request_id,
  }));

  return (
    <>
      <KtNav />
      <PageHeader
        title="Tạm ứng"
        description="Các khoản đã ứng ra và phần còn phải hoàn."
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Tạm ứng' }]}
        actions={
          canCreate ? (
            <Button variant="primary" asChild>
              <Link to="/kt/de-nghi-thanh-toan/tao-moi?loai=tam_ung">Lập đề nghị tạm ứng</Link>
            </Button>
          ) : undefined
        }
      />

      <EntityTable<AdvanceRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/kt/de-nghi-thanh-toan/${row.requestId}`}
        searchPlaceholder="Tìm theo mục đích hoặc người nhận…"
        emptyMessage="Chưa có khoản tạm ứng nào đang theo dõi. Khoản tạm ứng xuất hiện ở đây ngay khi một đề nghị tạm ứng được ghi nhận đã chi."
        columns={[
          {
            key: 'amount',
            header: 'Số đã ứng',
            numeric: true,
            render: (r) => formatCurrency(r.amount),
          },
          {
            key: 'outstanding',
            header: 'Còn phải hoàn',
            numeric: true,
            render: (r) =>
              r.outstanding > 0n ? (
                <span className="font-semibold">{formatCurrency(r.outstanding)}</span>
              ) : (
                <span className="text-fg-subtle">Đã hoàn đủ</span>
              ),
          },
        ]}
      />
    </>
  );
}
