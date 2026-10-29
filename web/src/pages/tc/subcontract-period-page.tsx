/**
 * Một đợt xác nhận khối lượng tổ đội (T5, migration 0246) — dùng trên điện thoại tại công trường.
 *
 * Chỉ huy trưởng chọn hạng mục từ bảng đơn giá (không gõ lại), khối lượng kỳ này gợi ý sẵn phần còn
 * lại, căn cứ chọn từ biên bản nghiệm thu / mốc đã đạt. Không có căn cứ thì CSDL loại dòng kèm lý do —
 * phần chưa nghiệm thu không lên tiền. Tổ trưởng ký trên điện thoại hoặc quét bản giấy; Trưởng phòng
 * Thi công xác nhận kèm đánh giá chất lượng / an toàn của đợt. Đã xác nhận thì không sửa được, và
 * «Lập đề nghị thanh toán» lấy sẵn số còn lại của đợt.
 */

import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime, formatNumber, toMoney } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { DocumentScanner } from '@/components/scan/document-scanner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  PERIOD_STATUS_META,
  useConfirmPeriod,
  useCreatePaymentFromPeriod,
  useDeletePeriodLine,
  useEvidenceOptions,
  useLineProgress,
  usePeriodDocument,
  useSavePeriodLine,
  useSignPeriod,
  type PeriodDocument,
} from '@/hooks/use-subcontracts';
import { useCan } from '@/lib/auth';
import { parseDecimal } from './subcontract-selection-page';

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export function SubcontractPeriodPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = usePeriodDocument(id);
  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data)
    return (
      <RecordNotFound
        entity="đợt xác nhận khối lượng"
        listPath="/tc/cong-trinh"
        listLabel="Quay lại danh sách công trình"
      />
    );
  const meta = PERIOD_STATUS_META[data.status];
  return (
    <>
      <PageHeader
        title={`Đợt ${data.period_no} — ${data.subcontractor.name}`}
        breadcrumbs={[
          { label: 'Thi công & Ngân sách' },
          { label: data.site.code, to: `/tc/cong-trinh/${data.site.id}?tab=to-doi` },
          { label: data.subcontractor.name, to: `/tc/thau-phu/${data.subcontractor.id}` },
          { label: data.code ?? `Đợt ${data.period_no}` },
        ]}
        description={`${data.site.name} · tính tới ${formatDate(data.period_end)} · chỉ phần đã nghiệm thu được tính.`}
      />
      <div className="space-y-4">
        <section className="rounded-card bg-surface p-4">
          <StatusWithLabel status={meta.statusGroup} label={meta.label} />
          {data.return_note && data.status === 'nhap' && (
            <p className="mt-2 rounded-sm bg-status-disputed-bg px-3 py-2">
              Bị trả lại: {data.return_note}. Sửa rồi cho tổ trưởng ký lại.
            </p>
          )}
          <AmountSummary doc={data} />
        </section>
        <LinesSection doc={data} />
        {data.can_edit && data.lines.some((l) => !l.excluded) && <SignForm doc={data} />}
        {data.signed_at && (
          <p className="text-fg-subtle">
            Tổ trưởng {data.crew_signer_name}
            {data.crew_signer_title ? ` (${data.crew_signer_title})` : ''} ký lúc{' '}
            {formatDateTime(data.signed_at)}
            {data.paper_scan_path ? ' trên bản giấy — bản quét đã lưu' : ' trên điện thoại'}.
          </p>
        )}
        {data.can_confirm && <ConfirmForm doc={data} />}
        {data.status === 'da_xac_nhan' && <ConfirmedBlock doc={data} />}
      </div>
    </>
  );
}

function AmountSummary({ doc }: { doc: PeriodDocument }) {
  if (doc.gross_amount == null) {
    const draft = doc.lines.reduce((s, l) => s + toMoney(l.amount ?? 0), 0n);
    return (
      <p className="mt-2">
        Tạm tính phần được tính: <strong>{formatCurrency(draft)}</strong>{' '}
        <span className="text-fg-subtle">— số chốt khi tổ trưởng ký.</span>
      </p>
    );
  }
  const left = toMoney(doc.net_amount) - toMoney(doc.requested_amount);
  return (
    <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div>
        <dt className="text-xs text-fg-subtle">Giá trị khối lượng</dt>
        <dd className="font-semibold">{formatCurrency(doc.gross_amount)}</dd>
      </div>
      <div>
        <dt className="text-xs text-fg-subtle">
          Giữ lại bảo hành
          {doc.retention_rate_applied != null
            ? ` (${formatNumber(doc.retention_rate_applied)} %)`
            : ''}
        </dt>
        <dd className="font-semibold">{formatCurrency(doc.retention_amount ?? 0)}</dd>
      </div>
      <div>
        <dt className="text-xs text-fg-subtle">Được thanh toán</dt>
        <dd className="font-semibold">{formatCurrency(doc.net_amount)}</dd>
      </div>
      <div>
        <dt className="text-xs text-fg-subtle">Đã đề nghị</dt>
        <dd className="font-semibold">{formatCurrency(doc.requested_amount)}</dd>
      </div>
      <div>
        <dt className="text-xs text-fg-subtle">Còn đề nghị được</dt>
        <dd className="font-semibold">{formatCurrency(left)}</dd>
      </div>
    </dl>
  );
}

function LinesSection({ doc }: { doc: PeriodDocument }) {
  const lumpSum = doc.subcontractor.pricing_method === 'khoan_gon';
  const del = useDeletePeriodLine();
  const qtyText = (q: number) =>
    lumpSum ? `${formatNumber(Number(q) * 100, 1)} %` : formatNumber(q, 3);

  return (
    <section className="space-y-2" aria-label="Khối lượng kỳ này">
      <h2 className="font-semibold">Khối lượng kỳ này</h2>
      {doc.lines.length === 0 ? (
        <EmptyState message="Chưa có hạng mục nào trong đợt. Chọn hạng mục đã nghiệm thu bên dưới." />
      ) : (
        <ul className="space-y-2">
          {doc.lines.map((l) => {
            const cumulative = Number(l.previous_quantity) + (l.excluded ? 0 : Number(l.quantity));
            return (
              <li key={l.id} className="rounded-card bg-surface p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{l.item}</p>
                  <p className="font-semibold">{formatCurrency(l.amount ?? 0)}</p>
                </div>
                <p className="text-fg-subtle">
                  Kỳ này {qtyText(l.quantity)} {lumpSum ? '' : l.unit} · luỹ kế{' '}
                  {qtyText(cumulative)} / {qtyText(l.contract_quantity)} · đơn giá{' '}
                  {formatCurrency(l.unit_price_applied ?? 0)}
                </p>
                {l.excluded ? (
                  <p className="mt-1 rounded-sm bg-status-overdue-bg px-2 py-1 text-status-overdue">
                    Không tính: {l.exclusion_reason}
                  </p>
                ) : (
                  <p className="mt-1 text-status-completed">
                    Căn cứ:{' '}
                    {l.acceptance_code
                      ? `biên bản ${l.acceptance_code} — ${l.acceptance_stage}`
                      : `mốc «${l.milestone_label}» đã đạt`}
                  </p>
                )}
                {doc.can_edit && (
                  <Button
                    variant="subtle"
                    size="sm"
                    className="mt-1"
                    disabled={del.isPending}
                    onClick={() => void del.mutateAsync({ periodId: doc.id, rowId: l.id })}
                  >
                    Bỏ dòng này
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {doc.can_edit && <AddLineForm doc={doc} />}
    </section>
  );
}

function AddLineForm({ doc }: { doc: PeriodDocument }) {
  const lumpSum = doc.subcontractor.pricing_method === 'khoan_gon';
  const { data: lines } = useLineProgress(doc.subcontractor.id);
  const { data: evidence } = useEvidenceOptions(doc.site.id, doc.subcontractor.id);
  const save = useSavePeriodLine();
  const used = new Set(doc.lines.map((l) => l.line_id));
  const candidates = (lines ?? []).filter((l) => !used.has(l.line_id));
  const [lineId, setLineId] = useState('');
  const [qty, setQty] = useState('');
  const [basis, setBasis] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) return null;
  const picked = candidates.find((l) => l.line_id === lineId);
  const remaining = picked
    ? Number(picked.contract_quantity) -
      Number(picked.confirmed_quantity) -
      Number(picked.pending_quantity)
    : null;

  function pick(id: string) {
    setLineId(id);
    const l = candidates.find((c) => c.line_id === id);
    if (!l) return;
    const r =
      Number(l.contract_quantity) - Number(l.confirmed_quantity) - Number(l.pending_quantity);
    // Gợi ý phần còn lại — người lập sửa theo khối lượng đã nghiệm thu thật.
    setQty(r > 0 ? formatNumber(lumpSum ? r * 100 : r, 3) : '');
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = parseDecimal(qty);
    if (!lineId || n == null || n <= 0) {
      setError(
        lumpSum
          ? 'Chọn hạng mục và ghi phần trăm hoàn thành kỳ này.'
          : 'Chọn hạng mục và ghi khối lượng kỳ này.',
      );
      return;
    }
    const [kind, evId] = basis.split(':');
    try {
      await save.mutateAsync({
        periodId: doc.id,
        values: {
          line_id: lineId,
          quantity: lumpSum ? n / 100 : n,
          acceptance_record_id: kind === 'bb' ? (evId ?? null) : null,
          site_milestone_id: kind === 'moc' ? (evId ?? null) : null,
          excluded: false,
          exclusion_reason: null,
        },
      });
      setLineId('');
      setQty('');
      setBasis('');
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    }
  }

  return (
    <form onSubmit={(e) => void add(e)} noValidate className="rounded-card bg-surface p-3">
      <h3 className="mb-2 font-semibold">Thêm hạng mục</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Hạng mục" required>
          <select value={lineId} onChange={(e) => pick(e.target.value)} className={SELECT_CLASS}>
            <option value="">Chọn hạng mục</option>
            {candidates.map((l) => (
              <option key={l.line_id} value={l.line_id}>
                {l.item}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            lumpSum
              ? 'Hoàn thành kỳ này (%)'
              : `Khối lượng kỳ này${picked ? ` (${picked.unit})` : ''}`
          }
          hint={
            remaining != null
              ? `Còn ${lumpSum ? `${formatNumber(remaining * 100, 1)} %` : formatNumber(remaining, 3)} chưa xác nhận.`
              : undefined
          }
          required
        >
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Căn cứ nghiệm thu" hint="Không có căn cứ thì dòng bị loại, không lên tiền.">
          <select value={basis} onChange={(e) => setBasis(e.target.value)} className={SELECT_CLASS}>
            <option value="">Chưa có căn cứ</option>
            {(evidence?.acceptances ?? []).map((a) => (
              <option key={a.id} value={`bb:${a.id}`}>
                Biên bản {a.code} — {a.stage_name}
                {a.signed ? '' : ' (chưa ký)'}
              </option>
            ))}
            {(evidence?.milestones ?? []).map((m) => (
              <option key={m.id} value={`moc:${m.id}`}>
                Mốc «{m.label}» đã đạt
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        className="mt-3 w-full sm:w-auto"
        disabled={save.isPending}
      >
        Thêm vào đợt
      </Button>
    </form>
  );
}

type SignMethod = 'man_hinh' | 'ban_giay';
const SIGN_METHOD_LABELS: Record<SignMethod, string> = {
  man_hinh: 'Ký trên màn hình',
  ban_giay: 'Quét bản giấy đã ký',
};

function SignForm({ doc }: { doc: PeriodDocument }) {
  const sign = useSignPeriod();
  const crewPad = useRef<SignaturePadHandle>(null);
  const nvgPad = useRef<SignaturePadHandle>(null);
  const [method, setMethod] = useState<SignMethod>('man_hinh');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('Tổ trưởng');
  const [scan, setScan] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Ghi họ tên tổ trưởng ký xác nhận.');
      return;
    }
    try {
      const base = {
        siteId: doc.site.id,
        periodId: doc.id,
        crewName: name.trim(),
        crewTitle: title.trim() || null,
      };
      if (method === 'man_hinh') {
        const crewSignature = await crewPad.current?.toBlob();
        const nvgSignature = await nvgPad.current?.toBlob();
        if (!crewSignature || !nvgSignature) {
          setError('Cần đủ chữ ký của tổ trưởng và người lập trong hai khung ký.');
          return;
        }
        await sign.mutateAsync({ ...base, method, crewSignature, nvgSignature });
      } else {
        if (!scan) {
          setError('Quét bản giấy đã có chữ ký trước khi xác nhận.');
          return;
        }
        await sign.mutateAsync({ ...base, method, paperScan: scan });
      }
    } catch (err) {
      setError(toUserMessage(err, 'edit'));
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="space-y-3 rounded-card bg-surface p-4"
      aria-label="Tổ trưởng ký xác nhận khối lượng"
    >
      <h2 className="font-semibold">Tổ trưởng ký xác nhận</h2>
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Họ tên tổ trưởng" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={128} />
        </Field>
        <Field label="Chức vụ">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={128} />
        </Field>
      </div>
      <SegmentedControl
        options={['man_hinh', 'ban_giay'] as const}
        value={method}
        onChange={setMethod}
        getLabel={(m) => SIGN_METHOD_LABELS[m]}
      />
      {method === 'man_hinh' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SignaturePad ref={crewPad} label="Chữ ký tổ trưởng" />
          <SignaturePad ref={nvgPad} label="Chữ ký người lập (Nhà Việt)" />
        </div>
      ) : (
        <div className="space-y-2">
          <Button type="button" variant="secondary" onClick={() => setScanning(true)}>
            <ScanLine />
            {scan ? 'Quét lại bản giấy' : 'Quét bản giấy đã ký'}
          </Button>
          {scan && <p className="text-sm text-status-completed">Đã quét: {scan.name}</p>}
        </div>
      )}
      <p className="rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
        Ký xong số tiền và tỷ lệ giữ lại bảo hành được chốt, đợt chuyển Trưởng phòng Thi công xác
        nhận.
      </p>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full sm:w-auto"
        disabled={sign.isPending}
      >
        {sign.isPending ? 'Đang lưu chữ ký…' : 'Xác nhận ký'}
      </Button>
      {scanning && (
        <DocumentScanner
          title="Quét bảng khối lượng đã ký"
          fileName={`khoi-luong-${doc.code ?? doc.id}.pdf`}
          onCancel={() => setScanning(false)}
          onDone={(file) => {
            setScan(file);
            setScanning(false);
          }}
        />
      )}
    </form>
  );
}

function RatingPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-fg-subtle">{label}</legend>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            type="button"
            variant={value === n ? 'primary' : 'secondary'}
            className="size-10 px-0"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
          >
            {n}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function ConfirmForm({ doc }: { doc: PeriodDocument }) {
  const confirm = useConfirmPeriod();
  const [quality, setQuality] = useState<number | null>(null);
  const [safety, setSafety] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function act(approve: boolean) {
    setError(null);
    if (approve && quality == null) {
      setError('Chấm chất lượng của đợt (1–5) trước khi xác nhận.');
      return;
    }
    if (!approve && !note.trim()) {
      setError('Ghi rõ chỗ chưa đúng để Ban công trường sửa.');
      return;
    }
    try {
      await confirm.mutateAsync({
        periodId: doc.id,
        approve,
        quality,
        safety,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(toUserMessage(err, 'edit'));
    }
  }

  return (
    <section className="space-y-3 rounded-card bg-surface p-4" aria-label="Xác nhận khối lượng">
      <h2 className="font-semibold">Xác nhận khối lượng và đánh giá đợt</h2>
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <RatingPicker label="Chất lượng (bắt buộc)" value={quality} onChange={setQuality} />
      <RatingPicker label="An toàn" value={safety} onChange={setSafety} />
      <Field label="Nhận xét / chỗ cần sửa">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={confirm.isPending} onClick={() => void act(true)}>
          Xác nhận khối lượng
        </Button>
        <Button variant="secondary" disabled={confirm.isPending} onClick={() => void act(false)}>
          Trả lại để sửa
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">Đã xác nhận thì đợt không sửa được nữa.</p>
    </section>
  );
}

function ConfirmedBlock({ doc }: { doc: PeriodDocument }) {
  const canPay = useCan('KT', 'create');
  const create = useCreatePaymentFromPeriod();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const left = toMoney(doc.net_amount) - toMoney(doc.requested_amount);

  return (
    <section className="space-y-2 rounded-card bg-surface p-4">
      <p>
        Đã xác nhận lúc {formatDateTime(doc.confirmed_at)} bởi {doc.confirmed_by_name}. Chất lượng{' '}
        {doc.quality_rating}/5{doc.safety_rating != null ? ` · an toàn ${doc.safety_rating}/5` : ''}
        {doc.evaluation_notes ? ` — ${doc.evaluation_notes}` : ''}.
      </p>
      {doc.payments.length > 0 && (
        <ul className="text-fg-subtle">
          {doc.payments.map((p) => (
            <li key={p.id}>
              <Link to={`/kt/de-nghi-thanh-toan/${p.id}`} className="text-brand hover:underline">
                {p.code}
              </Link>{' '}
              — {formatCurrency(p.amount)}
            </li>
          ))}
        </ul>
      )}
      {canPay && left > 0n && (
        <Button
          variant="primary"
          disabled={create.isPending}
          onClick={() => {
            setError(null);
            create
              .mutateAsync({ periodId: doc.id, dueDate: null })
              .then((pid) => navigate(`/kt/de-nghi-thanh-toan/${pid}`))
              .catch((err: unknown) => setError(toUserMessage(err, 'create')));
          }}
        >
          Lập đề nghị thanh toán {formatCurrency(left)}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
    </section>
  );
}
