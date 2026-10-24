/**
 * Báo giá thuê giàn giáo (Đợt 5 — 5D, PRD CRM-11; migration 0209) — mẫu bố cục Biểu mẫu.
 *
 * Nhập số lượng từng mã + số ngày thuê → máy kiểm tồn kho cho thuê được (mới + còn dùng được,
 * cùng cách lấy hàng của đơn thuê) và tính tiền theo đơn giá thuê / ngày ĐÃ CẤU HÌNH theo mã
 * (`sx.rental_daily_rate`, phạm vi sản phẩm). Mã chưa có đơn giá ghi «Chưa cấu hình» và báo giá
 * không có tổng — máy không tự đặt giá (PRD 2.3, CLAUDE.md 5.2). Giá bồi thường không ở đây.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { formatCurrency, formatNumber, quoteRental, toNvgDateInput, formatDate } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCompanyScope } from '@/lib/company-scope';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { supabase } from '@/lib/supabase';
import { SxNav } from './sx-nav';

interface StockRow {
  material_id: string;
  code: string;
  name: string;
  specification: string | null;
  unit: string | null;
  available: number;
}

function useRentalStock(companyId: string | null) {
  return useQuery<StockRow[], Error>({
    queryKey: ['rental_available_stock', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rental_available_stock', {
        p_company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as StockRow[]).map((r) => ({ ...r, available: Number(r.available) }));
    },
    enabled: Boolean(companyId),
  });
}

/** Đơn giá thuê / ngày theo mã: tham số phạm vi sản phẩm. Thiếu = chưa cấu hình. */
function useRentalRates() {
  return useQuery<Record<string, number>, Error>({
    queryKey: ['rental_daily_rates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_parameters')
        .select('scope_id, value')
        .eq('param_key', 'sx.rental_daily_rate')
        .eq('scope_type', 'product')
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      const out: Record<string, number> = {};
      for (const r of (data ?? []) as { scope_id: string | null; value: unknown }[]) {
        const n = Number(r.value);
        if (r.scope_id && r.value !== null && Number.isFinite(n) && n > 0) out[r.scope_id] = n;
      }
      return out;
    },
  });
}

export function RentalQuotePage() {
  const scope = useCompanyScope();
  const companyId = scope.isAggregate ? null : scope.companyId;
  const { data: stock, isLoading, error } = useRentalStock(companyId);
  const { data: rates } = useRentalRates();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [days, setDays] = useState('');
  const [customer, setCustomer] = useState('');

  const quote = useMemo(
    () =>
      quoteRental(
        (stock ?? []).map((s) => ({
          materialId: s.material_id,
          quantity: Number(qty[s.material_id] || 0),
          available: s.available,
          dailyRate: rates?.[s.material_id] ?? null,
        })),
        Number(days || 0),
      ),
    [stock, rates, qty, days],
  );
  const byId = new Map((stock ?? []).map((s) => [s.material_id, s]));

  function print() {
    const rows = quote.lines
      .map((l) => {
        const s = byId.get(l.materialId)!;
        return `<tr><td>${escapeHtml(s.code)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(
          s.unit ?? '',
        )}</td><td style="text-align:right">${formatNumber(l.quantity)}</td><td style="text-align:right">${formatCurrency(
          l.dailyRate!,
        )}</td><td style="text-align:right">${formatCurrency(l.amount!)}</td></tr>`;
      })
      .join('');
    openPrintReport(
      `Báo giá thuê giàn giáo — ${formatDate(toNvgDateInput(new Date()))}`,
      `<dl><div><dt>Khách hàng</dt><dd>${escapeHtml(customer.trim() || '—')}</dd></div>
        <div><dt>Số ngày thuê</dt><dd>${quote.days}</dd></div></dl>
       <table><thead><tr><th>Mã</th><th>Tên</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá / ngày</th><th>Thành tiền</th></tr></thead>
       <tbody>${rows}</tbody></table>
       <p><strong>Tổng tiền thuê: ${formatCurrency(quote.total!)}</strong></p>
       <p class="muted">Báo giá tham khảo, chưa gồm tiền cọc, vận chuyển, bồi thường thiếu – hỏng.</p>`,
    );
  }

  const blockedReason =
    quote.lines.length === 0
      ? 'Nhập số lượng ít nhất một mã.'
      : quote.days === 0
        ? 'Nhập số ngày thuê.'
        : quote.missingRates > 0
          ? `${quote.missingRates} mã chưa cấu hình đơn giá thuê — Ban Giám đốc / Quản trị đặt ở Tham số hệ thống.`
          : quote.shortLines > 0
            ? `${quote.shortLines} mã không đủ tồn kho cho thuê.`
            : null;

  return (
    <>
      <PageHeader
        title="Báo giá thuê"
        description="Máy kiểm tồn kho cho thuê và tính tiền theo đơn giá đã cấu hình — không tự đặt giá."
        breadcrumbs={[{ label: 'Sản xuất – Cho thuê' }, { label: 'Báo giá thuê' }]}
      />
      <SxNav />
      {companyId === null ? (
        <EmptyState message="Chọn pháp nhân cho thuê (Nhà Việt Steel) ở bộ chọn góc trên bên trái." />
      ) : isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Khách hàng">
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </Field>
            <Field label="Số ngày thuê" required>
              <Input
                value={days}
                inputMode="numeric"
                onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>

          <ul className="divide-y divide-border rounded-card bg-surface">
            {(stock ?? []).map((s) => {
              const line = quote.lines.find((l) => l.materialId === s.material_id);
              const rate = rates?.[s.material_id] ?? null;
              return (
                <li
                  key={s.material_id}
                  className="grid gap-2 p-3 sm:grid-cols-[1fr_8rem_9rem_10rem] sm:items-center"
                >
                  <div>
                    <p className="font-medium">
                      {s.code} — {s.name}
                    </p>
                    <p className="text-sm text-fg-subtle">
                      Tồn cho thuê {formatNumber(s.available)} {s.unit ?? ''} · Đơn giá{' '}
                      {rate === null ? (
                        <span className="text-status-pending">Chưa cấu hình</span>
                      ) : (
                        `${formatCurrency(rate)} / ngày`
                      )}
                    </p>
                  </div>
                  <Field label="Số lượng">
                    <Input
                      value={qty[s.material_id] ?? ''}
                      inputMode="decimal"
                      onChange={(e) =>
                        setQty((q) => ({
                          ...q,
                          [s.material_id]: e.target.value.replace(/[^\d.]/g, ''),
                        }))
                      }
                    />
                  </Field>
                  <div className="text-sm">
                    {line && line.shortage > 0 && (
                      <span className="font-medium text-status-overdue">
                        Thiếu {formatNumber(line.shortage)}
                      </span>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    {line
                      ? line.amount === null
                        ? 'Chưa cấu hình'
                        : formatCurrency(line.amount)
                      : ''}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-sunken p-3">
            <p className="font-medium">
              Tổng tiền thuê:{' '}
              {quote.total === null ? (
                <span className="text-fg-subtle">Chưa đủ dữ liệu</span>
              ) : (
                formatCurrency(quote.total)
              )}
            </p>
            <div className="flex flex-col items-end gap-1">
              <Button variant="primary" disabled={blockedReason !== null} onClick={print}>
                <Printer className="size-4" aria-hidden />
                In báo giá
              </Button>
              {blockedReason && <p className="text-sm text-fg-subtle">{blockedReason}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
