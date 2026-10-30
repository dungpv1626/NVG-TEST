/**
 * Điều chuyển giàn giáo sang công trình khác mà không qua kho (G5, migration 0245; phiếu Ban Giám
 * đốc, mảng giàn giáo bước 8).
 *
 * Hai bước như biên bản thu hồi (0145): lập biên bản (công trình nhận, ngày, số lượng) → hai bên ký
 * trên màn hình hoặc chụp biên bản giấy đã ký. Ký xong máy chốt tiền thuê ở đơn này tới ngày điều
 * chuyển, mở đơn mới cho công trình nhận từ ngày đó và chuyển đúng lô — sổ giàn giáo không đổi tổng.
 * Đơn nội bộ chỉ chuyển sang công trình NVG khác; đơn của khách ngoài chuyển sang địa chỉ khác của
 * chính khách đó.
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { FilePick } from '@/components/ui/file-pick';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad';
import { toUserMessage } from '@/hooks/use-error-message';
import { RENTAL_RETURN_SCAN_ACCEPT } from '@/hooks/use-rental-returns';
import type { RentalAgreementItemRecord, RentalAgreementRecord } from '@/hooks/use-sx';
import {
  uploadTransferFile,
  useCancelRentalTransfer,
  useCreateRentalTransfer,
  useRentalTransfers,
  useSignRentalTransfer,
  useTransferTargetSites,
  type RentalTransfer,
} from '@/hooks/use-sx-rental';

type SignMethod = 'man_hinh' | 'anh_giay';
const SIGN_LABELS: Record<SignMethod, string> = {
  man_hinh: 'Ký trên màn hình',
  anh_giay: 'Ảnh biên bản giấy đã ký',
};
const selectClass = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

function remaining(it: RentalAgreementItemRecord): number {
  return (
    Number(it.quantity_out) -
    Number(it.quantity_returned_ok) -
    Number(it.quantity_damaged) -
    Number(it.quantity_lost)
  );
}

function SignTransfer({ transfer, onDone }: { transfer: RentalTransfer; onDone: () => void }) {
  const customerPad = useRef<SignaturePadHandle>(null);
  const nvgPad = useRef<SignaturePadHandle>(null);
  const [method, setMethod] = useState<SignMethod>('man_hinh');
  const [rep, setRep] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sign = useSignRentalTransfer();
  const cancel = useCancelRentalTransfer();

  async function submit() {
    setError(null);
    if (!rep.trim()) return setError('Ghi họ tên người đại diện bên thuê ký biên bản.');
    try {
      let cust: string | null = null;
      let nvg: string | null = null;
      let paper: string | null = null;
      if (method === 'man_hinh') {
        const a = await customerPad.current?.toBlob();
        const b = await nvgPad.current?.toBlob();
        if (!a || !b) return setError('Cần đủ chữ ký của hai bên trong hai khung ký.');
        cust = await uploadTransferFile(transfer.id, 'chu-ky-khach', a);
        nvg = await uploadTransferFile(transfer.id, 'chu-ky-nvg', b);
      } else {
        if (!scan) return setError('Chụp hoặc chọn ảnh biên bản giấy đã có chữ ký hai bên.');
        paper = await uploadTransferFile(transfer.id, 'bien-ban-giay', scan);
      }
      await sign.mutateAsync({
        id: transfer.id,
        representative: rep.trim(),
        customerSignature: cust,
        nvgSignature: nvg,
        paperScan: paper,
      });
      onDone();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-3 rounded-card border border-border p-3">
      <p className="font-medium">Ký biên bản {transfer.code}</p>
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <Field label="Người đại diện bên thuê" required>
        <Input
          value={rep}
          onChange={(e) => setRep(e.target.value)}
          placeholder="Họ và tên người ký"
        />
      </Field>
      <SegmentedControl
        options={['man_hinh', 'anh_giay'] as const}
        value={method}
        onChange={setMethod}
        getLabel={(m) => SIGN_LABELS[m]}
      />
      {method === 'man_hinh' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SignaturePad ref={customerPad} label="Chữ ký đại diện bên thuê" />
          <SignaturePad ref={nvgPad} label="Chữ ký người của bên cho thuê" />
        </div>
      ) : (
        <Field label="Ảnh biên bản giấy" required>
          <FilePick
            accept={RENTAL_RETURN_SCAN_ACCEPT}
            capture="environment"
            file={scan}
            onChange={setScan}
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={sign.isPending} onClick={() => void submit()}>
          {sign.isPending ? 'Đang lưu chữ ký…' : 'Ký và điều chuyển'}
        </Button>
        <Button
          variant="subtle"
          disabled={cancel.isPending}
          onClick={() =>
            void cancel
              .mutateAsync(transfer.id)
              .then(onDone, (e: unknown) => setError(toUserMessage(e, 'edit')))
          }
        >
          Huỷ biên bản
        </Button>
      </div>
    </div>
  );
}

export function RentalTransferPanel({
  agreement,
  items,
  canEdit,
}: {
  agreement: RentalAgreementRecord;
  items: RentalAgreementItemRecord[];
  canEdit: boolean;
}) {
  const { data: transfers } = useRentalTransfers(agreement.id);
  const canTransfer = canEdit && agreement.status === 'dang_thue';
  const { data: sites } = useTransferTargetSites(
    agreement.id,
    canTransfer && agreement.is_internal,
  );
  const create = useCreateRentalTransfer();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [siteId, setSiteId] = useState('');
  const [label, setLabel] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const left = items.filter((i) => remaining(i) > 0);

  async function submit() {
    setError(null);
    const lines = left
      .filter((i) => Number(qty[i.material_id] || 0) > 0)
      .map((i) => ({ material_id: i.material_id, quantity: Number(qty[i.material_id]) }));
    if (!date) return setError('Chọn ngày điều chuyển.');
    if (agreement.is_internal ? !siteId : !label.trim())
      return setError(
        agreement.is_internal ? 'Chọn công trình nhận.' : 'Ghi địa chỉ / công trình nhận.',
      );
    if (lines.length === 0) return setError('Nhập số lượng điều chuyển ít nhất một loại.');
    try {
      await create.mutateAsync({
        fromAgreementId: agreement.id,
        transferDate: date,
        toSiteId: agreement.is_internal ? siteId : null,
        toSiteLabel: agreement.is_internal ? '' : label.trim(),
        items: lines,
        notes: '',
      });
      setOpen(false);
      setQty({});
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-fg-subtle">
        Chuyển giàn giáo đang ở công trình này sang công trình khác
        {agreement.is_internal ? ' của NVG' : ' của cùng khách'} mà không đưa về kho. Ký biên bản
        xong, tiền thuê ở đơn này chốt tới ngày điều chuyển và đơn mới tính từ ngày đó.
      </p>
      {canTransfer && !open && left.length > 0 && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Lập biên bản điều chuyển
        </Button>
      )}
      {open && (
        <div className="space-y-3 rounded-card bg-surface-sunken p-3">
          {error && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngày điều chuyển" required>
              <DateInput value={date} onChange={setDate} min={agreement.start_date} />
            </Field>
            {agreement.is_internal ? (
              <Field label="Công trình nhận" required>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Chọn công trình</option>
                  {(sites ?? []).map((s) => (
                    <option key={s.site_id} value={s.site_id}>
                      {s.company_code} · {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Công trình / địa chỉ nhận" required>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              </Field>
            )}
          </div>
          {left.map((i) => (
            <Field
              key={i.material_id}
              label={`${i.material?.code ?? ''} — ${i.material?.name ?? ''} (đang ở công trình ${formatNumber(remaining(i))})`}
            >
              <Input
                inputMode="decimal"
                value={qty[i.material_id] ?? ''}
                onChange={(e) =>
                  setQty((p) => ({ ...p, [i.material_id]: e.target.value.replace(/[^\d.]/g, '') }))
                }
              />
            </Field>
          ))}
          <div className="flex gap-2">
            <Button variant="primary" disabled={create.isPending} onClick={() => void submit()}>
              Lập biên bản
            </Button>
            <Button variant="subtle" onClick={() => setOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      )}

      {(transfers ?? []).length === 0 ? (
        <p className="text-fg-subtle">Chưa điều chuyển lần nào.</p>
      ) : (
        <ul className="space-y-3">
          {(transfers ?? []).map((t) => (
            <li key={t.id} className="space-y-2 rounded-card bg-surface p-3">
              <p className="font-medium">
                {t.code} — sang {t.to_site_label} · {formatDate(t.transfer_date)}
              </p>
              <p className="text-sm">
                {t.items
                  .map((i) => `${i.material?.code ?? ''} × ${formatNumber(i.quantity)}`)
                  .join(' · ')}
              </p>
              {t.status === 'da_ky' ? (
                <p className="text-sm text-status-completed">
                  Đã ký ({t.customer_representative}).{' '}
                  {t.to_agreement_id && (
                    <Link to={`/sx/tai-san-cho-thue/${t.to_agreement_id}`} className="text-brand">
                      Mở đơn của công trình nhận
                    </Link>
                  )}
                </p>
              ) : t.status === 'huy' ? (
                <p className="text-sm text-fg-subtle">Đã huỷ.</p>
              ) : canTransfer ? (
                <SignTransfer transfer={t} onDone={() => undefined} />
              ) : (
                <p className="text-sm text-fg-subtle">Chờ hai bên ký.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
