/**
 * Quét mã vật tư (KHO-09) — mẫu bố cục Di động (Webapp Flow 4.7).
 *
 * Webapp Flow 3.6 bước 1: "quét mã vật tư hoặc mã giàn giáo, hệ thống hiển thị phiếu liên
 * quan". Đây là trang mặc định của vai trò Kho vì nó là thao tác họ làm nhiều nhất.
 *
 * Ô nhập tự chọn hết nội dung khi có kết quả: máy quét mã vạch hoạt động như một bàn phím —
 * nó gõ mã rồi bấm Enter. Không xoá ô cũ thì mã thứ hai nối đuôi mã thứ nhất.
 *
 * ⚠️ CHƯA có camera quét mã: cần quyền camera và một thư viện giải mã, mà quyết định
 * "ngoại tuyến thật hay chỉ chống ghi trùng" (KHO-09) còn treo và nó chi phối luôn cách
 * màn hình này hoạt động khi mất mạng. Máy quét cầm tay cắm vào máy tính bảng dùng được ngay
 * với ô nhập này.
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ScanLine } from 'lucide-react';
import { STOCK_ALERT_LABELS, formatDateTime, formatNumber, stockAlerts } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { useScanMaterial } from '@/hooks/use-warehouse';
import { toUserMessage } from '@/hooks/use-error-message';
import { KhoNav } from './kho-nav';

export function StockScanPage() {
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, error } = useScanMaterial(submitted);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(code.trim());
    // Chọn hết nội dung để mã quét tiếp theo ghi đè, không nối đuôi.
    inputRef.current?.select();
  }

  const rows = data ?? [];
  const material = rows[0];

  return (
    <>
      <KhoNav />
      <PageHeader
        title="Quét mã"
        breadcrumbs={[{ label: 'Kho' }, { label: 'Quét mã' }]}
        description="Quét mã vạch trên tem, hoặc gõ mã vật tư khi tem mờ."
      />

      <form onSubmit={submit} className="mb-4 max-w-xl">
        <Field label="Mã vạch hoặc mã vật tư" hint="Máy quét cầm tay gõ mã rồi tự bấm Enter.">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="off"
              // Bàn phím điện thoại: không tự viết hoa và không tự sửa chính tả mã vật tư.
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="THEP-ONG-D49X2.0"
              className="h-11 font-mono"
            />
            <Button type="submit" variant="primary" className="h-11 shrink-0 px-4">
              <ScanLine className="size-4" aria-hidden />
              Tra
            </Button>
          </div>
        </Field>
      </form>

      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {toUserMessage(error)}
        </p>
      )}

      {isLoading && <TableSkeleton rows={2} columns={3} />}

      {!isLoading && !error && submitted && rows.length === 0 && (
        <EmptyState message="Vật tư này chưa có tồn ở kho nào trong phạm vi của bạn. Lập phiếu nhập để đưa vào kho." />
      )}

      {material && (
        <div className="space-y-3">
          <section className="rounded-lg border border-border bg-surface p-4">
            <p className="font-mono text-fg-subtle">{material.material_code}</p>
            <p className="text-lg font-semibold">{material.name}</p>
            {material.specification && <p className="text-fg-muted">{material.specification}</p>}
            <p className="mt-1 text-fg-muted">
              Đơn vị tính: {material.unit}
              {material.is_scaffolding && ' · Quản lý theo vòng đời giàn giáo'}
            </p>
          </section>

          <ul className="space-y-2">
            {rows.map((row) => {
              const alerts = stockAlerts({
                quantityOnHand: row.quantity_on_hand,
                minQuantity: row.min_quantity,
                lastMovementAt: row.last_movement_at,
              });
              return (
                <li
                  key={row.warehouse_id}
                  className="rounded-lg border border-border bg-surface px-4 py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{row.warehouse_name}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatNumber(Number(row.quantity_on_hand))} {material.unit}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {row.last_movement_at
                      ? `Phát sinh lần cuối ${formatDateTime(row.last_movement_at)}`
                      : 'Chưa có phát sinh nào'}
                  </p>
                  {alerts.map((alert) => (
                    <p key={alert} className="mt-1 inline-flex items-center gap-1 text-status-overdue">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden />
                      {STOCK_ALERT_LABELS[alert]}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" asChild>
              <Link to={`/kho/phieu?loai=nhap&vat-tu=${material.material_id}`}>Lập phiếu nhập</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to={`/kho/phieu?loai=xuat&vat-tu=${material.material_id}`}>Lập phiếu xuất</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
