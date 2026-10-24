/**
 * Tab «Biên bản thu hồi» của hợp đồng thuê giàn giáo — migration 0145.
 *
 * Mỗi đợt khách trả là một biên bản: hàng trả đạt / hư hỏng / mất, số ngày thuê và tiền của
 * đợt. Hai bên ký ngay tại bãi (khung ký trên màn hình) hoặc ký giấy rồi chụp ảnh đính vào.
 * Ký xong biên bản bị khoá và Kế toán nhận một khoản phải thu — màn hình nói trước con số đó
 * để người ký biết mình đang xác nhận gì.
 */

import { useRef, useState } from 'react';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  RENTAL_RETURN_SCAN_ACCEPT,
  useRentalDocUrls,
  useRentalReturns,
  useSignRentalReturn,
  type RentalReturnRecord,
} from '@/hooks/use-rental-returns';
import type { RentalAgreementRecord } from '@/hooks/use-sx';
import { escapeHtml, openPrintReport } from '@/lib/print-report';

type SignMethod = 'man_hinh' | 'anh_giay';

const SIGN_METHOD_LABELS: Record<SignMethod, string> = {
  man_hinh: 'Ký trên màn hình',
  anh_giay: 'Ảnh biên bản giấy đã ký',
};

function returnTotal(r: RentalReturnRecord): number {
  return Number(r.revenue) + Number(r.compensation);
}

function SignForm({
  rentalReturn,
  onDone,
}: {
  rentalReturn: RentalReturnRecord;
  onDone: () => void;
}) {
  const sign = useSignRentalReturn();
  const customerPad = useRef<SignaturePadHandle>(null);
  const nvgPad = useRef<SignaturePadHandle>(null);
  const [method, setMethod] = useState<SignMethod>('man_hinh');
  const [representative, setRepresentative] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const name = representative.trim();
    if (!name) {
      setError('Ghi họ tên người đại diện bên thuê ký biên bản.');
      return;
    }
    try {
      if (method === 'man_hinh') {
        const customerSignature = await customerPad.current?.toBlob();
        const nvgSignature = await nvgPad.current?.toBlob();
        if (!customerSignature || !nvgSignature) {
          setError('Cần đủ chữ ký của hai bên trong hai khung ký.');
          return;
        }
        await sign.mutateAsync({
          rentalReturnId: rentalReturn.id,
          customerRepresentative: name,
          method,
          customerSignature,
          nvgSignature,
        });
      } else {
        if (!scan) {
          setError('Chụp hoặc chọn ảnh biên bản giấy đã có chữ ký hai bên.');
          return;
        }
        await sign.mutateAsync({
          rentalReturnId: rentalReturn.id,
          customerRepresentative: name,
          method,
          paperScan: scan,
        });
      }
      onDone();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  const total = returnTotal(rentalReturn);

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mt-3 space-y-4 border-t border-border pt-3"
      aria-label={`Ký biên bản ${rentalReturn.code}`}
    >
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <Field label="Người đại diện bên thuê" required>
        <Input
          value={representative}
          onChange={(e) => setRepresentative(e.target.value)}
          maxLength={255}
          placeholder="Họ và tên người ký"
          required
        />
      </Field>
      <SegmentedControl
        options={['man_hinh', 'anh_giay'] as const}
        value={method}
        onChange={setMethod}
        getLabel={(m) => SIGN_METHOD_LABELS[m]}
      />
      {method === 'man_hinh' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SignaturePad ref={customerPad} label="Chữ ký đại diện bên thuê" />
          <SignaturePad ref={nvgPad} label="Chữ ký người nhận hàng của bên cho thuê" />
        </div>
      ) : (
        <Field
          label="Ảnh biên bản giấy"
          required
          hint="Chụp rõ cả trang, thấy đủ chữ ký hai bên. Nhận ảnh hoặc tệp PDF, tối đa 20 MB."
        >
          <input
            type="file"
            accept={RENTAL_RETURN_SCAN_ACCEPT}
            capture="environment"
            onChange={(e) => setScan(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </Field>
      )}
      <p className="rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
        Ký xong, biên bản bị khoá và không sửa được nữa.
        {total > 0
          ? ` Kế toán nhận khoản phải thu ${formatCurrency(total)} của đợt này.`
          : ' Đợt này không phát sinh tiền phải thu.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={sign.isPending}>
          {sign.isPending ? 'Đang lưu chữ ký…' : 'Xác nhận ký biên bản'}
        </Button>
        <Button type="button" variant="subtle" onClick={onDone}>
          Để sau
        </Button>
      </div>
    </form>
  );
}

function SignedBlock({ rentalReturn }: { rentalReturn: RentalReturnRecord }) {
  const paths = [
    rentalReturn.customer_signature_path,
    rentalReturn.nvg_signature_path,
    rentalReturn.paper_scan_path,
  ].filter((p): p is string => Boolean(p));
  const { data: urls } = useRentalDocUrls(paths);
  const url = (p: string | null) => (p ? urls?.[p] : undefined);
  const scanUrl = url(rentalReturn.paper_scan_path);

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-fg-subtle">Đại diện bên thuê</dt>
          <dd>{rentalReturn.customer_representative}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Người nhận của bên cho thuê</dt>
          <dd>{rentalReturn.signer?.full_name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Ký lúc</dt>
          <dd>{rentalReturn.signed_at ? formatDateTime(rentalReturn.signed_at) : '—'}</dd>
        </div>
      </dl>
      {rentalReturn.paper_scan_path ? (
        scanUrl ? (
          rentalReturn.paper_scan_path.endsWith('.pdf') ? (
            <a
              href={scanUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              Mở biên bản giấy đã ký (PDF)
            </a>
          ) : (
            <a href={scanUrl} target="_blank" rel="noreferrer" className="block max-w-md">
              <img
                src={scanUrl}
                alt={`Biên bản giấy ${rentalReturn.code} đã ký`}
                className="rounded-sm border border-border"
              />
            </a>
          )
        ) : (
          <p className="text-fg-subtle">Đang tải ảnh biên bản…</p>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Chữ ký đại diện bên thuê', path: rentalReturn.customer_signature_path },
            { label: 'Chữ ký người nhận của bên cho thuê', path: rentalReturn.nvg_signature_path },
          ].map((s) => (
            <figure key={s.label} className="m-0">
              {url(s.path) ? (
                <img
                  src={url(s.path)}
                  alt={s.label}
                  className="h-24 w-full rounded-sm border border-border bg-white object-contain"
                />
              ) : (
                <div className="h-24 rounded-sm border border-border bg-surface-sunken" />
              )}
              <figcaption className="mt-1 text-xs text-fg-subtle">{s.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function printReturn(
  agreement: RentalAgreementRecord,
  r: RentalReturnRecord,
  urls: Record<string, string> | undefined,
) {
  const rows = r.lines
    .map(
      (l) => `<tr>
  <td>${escapeHtml(`${l.material?.code ?? ''} — ${l.material?.name ?? ''}`)}</td>
  <td class="num">${escapeHtml(formatNumber(Number(l.quantity_ok)))}</td>
  <td class="num">${escapeHtml(formatNumber(Number(l.quantity_damaged)))}</td>
  <td class="num">${escapeHtml(formatNumber(Number(l.quantity_lost)))}</td>
  <td class="num">${l.rental_days}</td>
  <td class="num">${escapeHtml(formatCurrency(l.daily_rate))}</td>
  <td class="num">${escapeHtml(formatCurrency(l.revenue))}</td>
  <td class="num">${escapeHtml(formatCurrency(l.compensation_amount))}</td>
</tr>${l.note ? `<tr><td colspan="8" class="muted">Ghi chú: ${escapeHtml(l.note)}</td></tr>` : ''}`,
    )
    .join('');
  const sig = (path: string | null) =>
    path && urls?.[path]
      ? `<img src="${escapeHtml(urls[path]!)}" alt="" style="height:80px;max-width:100%;object-fit:contain" />`
      : '<div style="height:80px"></div>';

  const body = `
<dl>
  <div><dt>Hợp đồng thuê</dt><dd>${escapeHtml(agreement.code)}</dd></div>
  <div><dt>Bên thuê</dt><dd>${escapeHtml(agreement.customer?.name ?? '')}</dd></div>
  <div><dt>Ngày bắt đầu thuê</dt><dd>${escapeHtml(formatDate(agreement.start_date))}</dd></div>
  <div><dt>Ngày trả</dt><dd>${escapeHtml(formatDate(r.return_date))}</dd></div>
</dl>
<table>
  <thead><tr><th>Loại giàn giáo</th><th class="num">Trả đạt</th><th class="num">Hư hỏng</th><th class="num">Mất</th><th class="num">Số ngày thuê</th><th class="num">Đơn giá/ngày</th><th class="num">Tiền thuê</th><th class="num">Bồi thường</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="8" class="muted">Đợt này ghi trước khi có biên bản chi tiết từng dòng.</td></tr>'}</tbody>
</table>
<p>Tiền thuê của đợt: <strong>${escapeHtml(formatCurrency(r.revenue))}</strong> · Bồi thường: <strong>${escapeHtml(formatCurrency(r.compensation))}</strong> · Cộng: <strong>${escapeHtml(formatCurrency(returnTotal(r)))}</strong></p>
<table style="margin-top:24px">
  <tr><th style="width:50%">Đại diện bên thuê</th><th>Người nhận của bên cho thuê</th></tr>
  <tr><td>${sig(r.customer_signature_path)}</td><td>${sig(r.nvg_signature_path)}</td></tr>
  <tr><td>${escapeHtml(r.customer_representative ?? '(Ký, ghi rõ họ tên)')}</td><td>${escapeHtml(r.signer?.full_name ?? '(Ký, ghi rõ họ tên)')}</td></tr>
</table>
${r.signed_at ? `<p class="muted">Hai bên đã ký lúc ${escapeHtml(formatDateTime(r.signed_at))}.</p>` : ''}`;
  openPrintReport(`Biên bản thu hồi giàn giáo ${r.code}`, body);
}

function ReturnCard({
  agreement,
  rentalReturn,
  canSign,
  signing,
  onToggleSign,
}: {
  agreement: RentalAgreementRecord;
  rentalReturn: RentalReturnRecord;
  canSign: boolean;
  signing: boolean;
  onToggleSign: () => void;
}) {
  const signed = Boolean(rentalReturn.signed_at);
  const sigPaths = [rentalReturn.customer_signature_path, rentalReturn.nvg_signature_path].filter(
    (p): p is string => Boolean(p),
  );
  const { data: urls } = useRentalDocUrls(sigPaths);

  return (
    <li className="rounded-card bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            Biên bản <span className="font-mono">{rentalReturn.code}</span>
          </p>
          <p className="text-fg-subtle">
            Ngày trả {formatDate(rentalReturn.return_date)} · Ghi nhận bởi{' '}
            {rentalReturn.creator?.full_name ?? '—'}
          </p>
        </div>
        <StatusWithLabel
          status={signed ? 'completed' : 'pending_approval'}
          label={signed ? 'Đã ký hai bên' : 'Chờ ký hai bên'}
        />
      </div>

      <div className="mt-3 overflow-x-auto">
        {rentalReturn.lines.length === 0 ? (
          <p className="text-fg-subtle">Đợt này ghi trước khi có biên bản chi tiết từng dòng.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-fg-subtle">
              <tr>
                <th className="py-1 pr-3 text-left font-medium">Loại giàn giáo</th>
                <th className="py-1 pr-3 text-right font-medium">Trả đạt</th>
                <th className="py-1 pr-3 text-right font-medium">Hư hỏng</th>
                <th className="py-1 pr-3 text-right font-medium">Mất</th>
                <th className="py-1 pr-3 text-right font-medium">Số ngày</th>
                <th className="py-1 pr-3 text-right font-medium">Tiền thuê</th>
                <th className="py-1 text-right font-medium">Bồi thường</th>
              </tr>
            </thead>
            <tbody>
              {rentalReturn.lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="py-1 pr-3">
                    {l.material?.code} — {l.material?.name}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-3 text-right">
                    {formatNumber(Number(l.quantity_ok))} {l.material?.unit}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {formatNumber(Number(l.quantity_damaged))}
                  </td>
                  <td className="py-1 pr-3 text-right">{formatNumber(Number(l.quantity_lost))}</td>
                  <td className="py-1 pr-3 text-right">{l.rental_days}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-right">
                    {formatCurrency(l.revenue)}
                  </td>
                  <td className="whitespace-nowrap py-1 text-right">
                    {formatCurrency(l.compensation_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-2">
        Tiền thuê {formatCurrency(rentalReturn.revenue)} · Bồi thường{' '}
        {formatCurrency(rentalReturn.compensation)} ·{' '}
        <span className="font-semibold">Cộng {formatCurrency(returnTotal(rentalReturn))}</span>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!signed && canSign && (
          <Button variant={signing ? 'subtle' : 'secondary'} onClick={onToggleSign}>
            {signing ? 'Đóng khung ký' : 'Ký biên bản'}
          </Button>
        )}
        <Button variant="subtle" onClick={() => printReturn(agreement, rentalReturn, urls)}>
          In biên bản
        </Button>
      </div>

      {signed ? (
        <SignedBlock rentalReturn={rentalReturn} />
      ) : (
        signing && <SignForm rentalReturn={rentalReturn} onDone={onToggleSign} />
      )}
    </li>
  );
}

export function RentalReturnsPanel({
  agreement,
  canSign,
  signingId,
  onSigningChange,
}: {
  agreement: RentalAgreementRecord;
  canSign: boolean;
  signingId: string | null;
  onSigningChange: (id: string | null) => void;
}) {
  const { data, isLoading, error } = useRentalReturns(agreement.id);

  if (isLoading) return <TableSkeleton rows={2} columns={4} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  const returns = data ?? [];
  if (returns.length === 0) {
    return (
      <EmptyState message="Chưa có đợt trả nào. Mỗi lần khách trả giàn giáo, bấm «Thu hồi giàn giáo» — hệ thống lập biên bản để hai bên ký." />
    );
  }

  return (
    <ul className="space-y-3">
      {returns.map((r) => (
        <ReturnCard
          key={r.id}
          agreement={agreement}
          rentalReturn={r}
          canSign={canSign}
          signing={signingId === r.id}
          onToggleSign={() => onSigningChange(signingId === r.id ? null : r.id)}
        />
      ))}
    </ul>
  );
}
