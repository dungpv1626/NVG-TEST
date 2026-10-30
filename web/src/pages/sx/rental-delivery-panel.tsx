/**
 * Phiếu giao hàng khách ký nhận trên điện thoại (Đợt 5 — 5D, migration 0209) — cùng cách ký của
 * biên bản thu hồi (0145): hai chữ ký trên màn hình HOẶC ảnh phiếu giấy đã ký. Ký một lần, khoá.
 * Tệp ở kho `rental-delivery-docs`, thư mục đầu = đơn thuê.
 */

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatDateTime, formatNumber } from '@nvg/shared';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FilePick } from '@/components/ui/file-pick';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad';
import { toUserMessage } from '@/hooks/use-error-message';
import { RENTAL_RETURN_SCAN_ACCEPT } from '@/hooks/use-rental-returns';
import type { RentalAgreementItemRecord, RentalAgreementRecord } from '@/hooks/use-sx';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { supabase } from '@/lib/supabase';

const BUCKET = 'rental-delivery-docs';
type SignMethod = 'man_hinh' | 'anh_giay';
const SIGN_METHOD_LABELS: Record<SignMethod, string> = {
  man_hinh: 'Ký trên màn hình',
  anh_giay: 'Ảnh phiếu giấy đã ký',
};

async function upload(agreementId: string, kind: string, file: Blob & { name?: string }) {
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? file.type.split('/').pop() ?? 'png';
  const path = `${agreementId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'image/png', upsert: false });
  if (error)
    throw new Error('Không tải được chữ ký hoặc ảnh phiếu giao. Kiểm tra mạng rồi thử lại.');
  return path;
}

function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: ['rental-delivery-urls', paths.join(',')],
    queryFn: async () => {
      const out: Record<string, string> = {};
      for (const p of paths) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p, 3600);
        if (data) out[p] = data.signedUrl;
      }
      return out;
    },
    enabled: paths.length > 0,
  });
}

/**
 * Phiếu giao in ra giấy: danh sách hàng giao + hai dòng ký. Dùng khi khách ký bản giấy (rồi chụp lên
 * «Ảnh phiếu giấy đã ký»), hoặc để lưu bản đã ký trên màn hình.
 */
function printDelivery(agreement: RentalAgreementRecord, items: RentalAgreementItemRecord[]) {
  const rows = items
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.material?.code ?? '')}</td><td>${escapeHtml(
          it.material?.name ?? '',
        )}</td><td class="num">${escapeHtml(formatNumber(Number(it.quantity_out)))} ${escapeHtml(
          it.material?.unit ?? '',
        )}</td></tr>`,
    )
    .join('');
  const place = agreement.site
    ? `${agreement.site.code} — ${agreement.site.name}`
    : (agreement.site_address ?? '—');
  openPrintReport(
    `Phiếu giao giàn giáo — đơn thuê ${agreement.code}`,
    `<dl>
      <div><dt>Bên thuê</dt><dd>${escapeHtml(agreement.customer?.name ?? '—')}</dd></div>
      <div><dt>Nơi nhận</dt><dd>${escapeHtml(place)}</dd></div>
      <div><dt>Ngày giao</dt><dd>${escapeHtml(formatDate(agreement.start_date))}</dd></div>
    </dl>
    <table><thead><tr><th>Mã</th><th>Tên</th><th class="num">Số lượng giao</th></tr></thead><tbody>${rows}</tbody></table>
    <table style="margin-top:32px"><tr><th>Đại diện bên thuê</th><th>Người giao của bên cho thuê</th></tr>
    <tr><td style="height:80px">${escapeHtml(
      agreement.delivery_customer_representative ?? '(Ký, ghi rõ họ tên)',
    )}</td><td>(Ký, ghi rõ họ tên)</td></tr></table>
    ${
      agreement.delivery_signed_at
        ? `<p class="muted">Đã ký trên hệ thống lúc ${escapeHtml(formatDateTime(agreement.delivery_signed_at))}.</p>`
        : ''
    }`,
  );
}

/** Hàng giao theo đơn — khách phải thấy đúng số lượng mình ký nhận (chạy thử NVS 30/10/2026). */
function DeliveryItems({
  agreement,
  items,
}: {
  agreement: RentalAgreementRecord;
  items: RentalAgreementItemRecord[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Hàng giao</p>
        <Button variant="secondary" size="sm" onClick={() => printDelivery(agreement, items)}>
          <Printer className="size-4" aria-hidden /> In phiếu giao
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-sm border border-border">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
            <span>
              {it.material?.code} — {it.material?.name}
            </span>
            <span className="font-medium tabular-nums">
              {formatNumber(Number(it.quantity_out))} {it.material?.unit ?? ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RentalDeliveryPanel({
  agreement,
  items,
  canSign,
}: {
  agreement: RentalAgreementRecord;
  items: RentalAgreementItemRecord[];
  canSign: boolean;
}) {
  const queryClient = useQueryClient();
  const customerPad = useRef<SignaturePadHandle>(null);
  const nvgPad = useRef<SignaturePadHandle>(null);
  const [method, setMethod] = useState<SignMethod>('man_hinh');
  const [rep, setRep] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedPaths = [
    agreement.delivery_customer_signature_path,
    agreement.delivery_nvg_signature_path,
    agreement.delivery_paper_scan_path,
  ].filter((p): p is string => Boolean(p));
  const { data: urls } = useSignedUrls(signedPaths);

  if (agreement.delivery_signed_at) {
    return (
      <div className="space-y-3">
        <DeliveryItems agreement={agreement} items={items} />
        <p className="text-status-completed">
          Khách đã ký nhận hàng: {agreement.delivery_customer_representative} —{' '}
          {formatDateTime(agreement.delivery_signed_at)}
        </p>
        <div className="flex flex-wrap gap-4">
          {signedPaths.map((p) =>
            urls?.[p] ? (
              p.endsWith('.pdf') ? (
                <a key={p} href={urls[p]} target="_blank" rel="noreferrer" className="text-brand">
                  Mở phiếu giấy đã ký
                </a>
              ) : (
                <img
                  key={p}
                  src={urls[p]}
                  alt="Chữ ký / phiếu giao đã ký"
                  className="h-28 rounded-sm border border-border bg-surface object-contain"
                />
              )
            ) : null,
          )}
        </div>
      </div>
    );
  }

  if (!canSign || agreement.status !== 'dang_thue') {
    return (
      <div className="space-y-3">
        <DeliveryItems agreement={agreement} items={items} />
        <p className="text-fg-subtle">
          Phiếu giao chưa có chữ ký khách. Xưởng sản xuất – Cho thuê lấy chữ ký khi giao hàng.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!rep.trim()) {
      setError('Ghi họ tên người đại diện bên thuê nhận hàng.');
      return;
    }
    setBusy(true);
    try {
      let cust: string | null = null;
      let nvg: string | null = null;
      let paper: string | null = null;
      if (method === 'man_hinh') {
        const a = await customerPad.current?.toBlob();
        const b = await nvgPad.current?.toBlob();
        if (!a || !b) {
          setError('Cần đủ chữ ký của hai bên trong hai khung ký.');
          return;
        }
        cust = await upload(agreement.id, 'chu-ky-khach', a);
        nvg = await upload(agreement.id, 'chu-ky-nvg', b);
      } else {
        if (!scan) {
          setError('Chụp hoặc chọn ảnh phiếu giao giấy đã có chữ ký hai bên.');
          return;
        }
        paper = await upload(agreement.id, 'phieu-giay', scan);
      }
      const { error: err } = await supabase.rpc('sign_rental_delivery', {
        p_rental_agreement_id: agreement.id,
        p_customer_representative: rep.trim(),
        p_customer_signature_path: cust,
        p_nvg_signature_path: nvg,
        p_paper_scan_path: paper,
      });
      if (err) throw err;
      await queryClient.invalidateQueries({ queryKey: ['rental-agreements'] });
    } catch (err) {
      setError(toUserMessage(err, 'edit'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-label="Ký phiếu giao hàng">
      <DeliveryItems agreement={agreement} items={items} />
      <p className="text-fg-subtle">
        Giao hàng ngày {formatDate(agreement.start_date)}. Khách ký nhận ngay khi nhận đủ hàng — ký
        xong phiếu bị khoá.
      </p>
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <Field label="Người đại diện bên thuê nhận hàng" required>
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
        getLabel={(m) => SIGN_METHOD_LABELS[m]}
      />
      {method === 'man_hinh' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SignaturePad ref={customerPad} label="Chữ ký đại diện bên thuê" />
          <SignaturePad ref={nvgPad} label="Chữ ký người giao hàng của bên cho thuê" />
        </div>
      ) : (
        <Field label="Ảnh phiếu giao giấy" required>
          <FilePick
            accept={RENTAL_RETURN_SCAN_ACCEPT}
            capture="environment"
            file={scan}
            onChange={setScan}
          />
        </Field>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? 'Đang lưu chữ ký…' : 'Xác nhận ký phiếu giao'}
      </Button>
    </form>
  );
}
