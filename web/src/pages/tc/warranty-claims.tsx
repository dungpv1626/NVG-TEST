/**
 * Phiếu bảo hành (Đợt 2 — 2F, migration 0193).
 *
 * Khách báo → người tiếp nhận NÓI lời khách (ghi âm → chữ) hoặc gõ nhanh, kèm ảnh hiện trạng →
 * phiếu tự giao chỉ huy trưởng của công trình (đổi được), hạn xử lý → «Bắt đầu xử lý» →
 * «Hoàn tất» cần kết quả + ảnh sau sửa; «Không thuộc bảo hành» cần lý do. Quy tắc nằm ở CSDL
 * (`warranty_claims_guard`) — màn hình chỉ dẫn người dùng đi đúng thứ tự, không thay CSDL kiểm.
 *
 * Hạn mặc định lấy từ tham số `tc.warranty_response_days`; NVG chưa đặt thì phiếu không có hạn
 * trừ khi người tiếp nhận tự đặt — màn hình nói rõ, không tự điền số.
 */

import { useState, type FormEvent } from 'react';
import { Mic } from 'lucide-react';
import {
  WARRANTY_CLAIM_STATUS_META,
  formatCurrency,
  formatDate,
  formatDateTime,
  toNvgDateInput,
} from '@nvg/shared';
import { VoiceRecorder } from '@/components/media/voice-recorder';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useSaveWarrantyClaim, type WarrantyClaimRecord } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { siteLogAudioUrl, uploadSiteLogAudio } from '@/hooks/use-site-log-voice';
import { uploadConstructionPhotos } from '@/hooks/use-site-photos';
import { useAiStatus } from '@/hooks/use-site-surveys';
import { draftSiteLog } from '@/lib/ai-api';
import { useCommanderCandidates } from './site-prep-card';
import { PhotoStrip, SitePhotoPicker } from './site-photo-picker';

const TODAY = () => toNvgDateInput(new Date());

export function claimOverdue(c: WarrantyClaimRecord): boolean {
  return (
    (c.status === 'tiep_nhan' || c.status === 'dang_xu_ly') &&
    c.due_date !== null &&
    c.due_date < TODAY()
  );
}

/** Lập phiếu: nói hoặc gõ lời khách, ảnh hiện trạng, người phụ trách, hạn. */
export function WarrantyClaimForm({
  siteId,
  companyId,
  warrantyId,
  onDone,
}: {
  siteId: string;
  companyId: string;
  warrantyId: string;
  onDone: () => void;
}) {
  const save = useSaveWarrantyClaim();
  const { data: ai } = useAiStatus();
  const { data: candidates } = useCommanderCandidates(companyId);
  const canSpeak = ai !== undefined && ai.transcribe !== 'off';
  const [form, setForm] = useState({
    description: '',
    reportedDate: TODAY(),
    reportedBy: '',
    assignee: '',
    dueDate: '',
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<{ path: string; transcript: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSpoken(blob: Blob, seconds: number | null) {
    setError(null);
    const path = await uploadSiteLogAudio(siteId, blob);
    setVoice({ path, transcript: null });
    const res = await draftSiteLog({ siteId, audioPath: path, seconds, purpose: 'transcript' });
    setVoice({ path, transcript: res.transcript });
    setForm((f) => ({
      ...f,
      description: f.description.trim()
        ? `${f.description.trim()}\n${res.transcript}`
        : res.transcript,
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.description.trim()) {
      setError('Ghi hoặc nói nội dung khách hàng phản ánh.');
      return;
    }
    setBusy(true);
    try {
      const before =
        photos.length > 0 ? await uploadConstructionPhotos(siteId, 'bao-hanh', photos) : [];
      await save.mutateAsync({
        siteId,
        companyId,
        values: {
          warranty_id: warrantyId,
          description: form.description.trim(),
          reported_date: form.reportedDate,
          reported_by: form.reportedBy.trim() || null,
          assigned_user_id: form.assignee || null,
          due_date: form.dueDate || null,
          ...(before.length > 0 ? { before_photo_paths: before } : {}),
          ...(voice ? { voice_path: voice.path, voice_transcript: voice.transcript } : {}),
        },
      });
      onDone();
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 space-y-3 border-t border-border pt-3">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      {canSpeak && (
        <div className="rounded-sm bg-surface-sunken p-3">
          <p className="mb-2 text-sm">
            <span className="font-medium">Nói lời khách báo</span>
            <span className="text-fg-subtle"> — máy chép vào ô bên dưới để đọc lại.</span>
          </p>
          <VoiceRecorder disabled={busy} onRecorded={onSpoken} />
          {voice?.transcript === null && (
            <p role="status" className="mt-2 text-sm text-fg-subtle">
              Máy đang chép lời…
            </p>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Khách hàng phản ánh" required className="sm:col-span-2">
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2"
            placeholder="Hiện tượng, vị trí, từ khi nào."
          />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-medium">Ảnh hiện trạng</p>
          <SitePhotoPicker files={photos} onChange={setPhotos} disabled={busy} />
        </div>
        <Field label="Ngày tiếp nhận">
          <DateInput
            value={form.reportedDate}
            max={TODAY()}
            onChange={(v) => setForm((f) => ({ ...f, reportedDate: v }))}
          />
        </Field>
        <Field label="Người phản ánh">
          <Input
            value={form.reportedBy}
            onChange={(e) => setForm((f) => ({ ...f, reportedBy: e.target.value }))}
            placeholder="Chủ nhà"
          />
        </Field>
        <Field label="Người phụ trách xử lý" hint="Để mặc định thì giao chỉ huy trưởng công trình.">
          <select
            value={form.assignee}
            onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
            className="h-10 w-full rounded-sm border border-border bg-surface px-3"
          >
            <option value="">Chỉ huy trưởng công trình (mặc định)</option>
            {(candidates ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Hạn xử lý"
          hint="Để trống thì theo số ngày Quản trị đặt ở Tham số hệ thống; chưa đặt thì phiếu không có hạn."
        >
          <DateInput
            value={form.dueDate}
            min={form.reportedDate}
            onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lập phiếu bảo hành'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

/** Một phiếu: thông tin, ảnh, và bước tiếp theo theo trạng thái. */
export function WarrantyClaimItem({
  claim: c,
  siteId,
  companyId,
  readOnly,
}: {
  claim: WarrantyClaimRecord;
  siteId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const save = useSaveWarrantyClaim();
  const [mode, setMode] = useState<'xem' | 'hoan_tat' | 'tu_choi'>('xem');
  const [form, setForm] = useState({ rootCause: '', resolution: '', cost: '', confirmedBy: '' });
  const [after, setAfter] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const open = c.status === 'tiep_nhan' || c.status === 'dang_xu_ly';
  const overdue = claimOverdue(c);

  async function update(values: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      await save.mutateAsync({ id: c.id, siteId, companyId, values });
      setMode('xem');
    } catch (err) {
      setError(toUserMessage(err, 'edit'));
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    if (!form.resolution.trim()) {
      setError('Ghi kết quả xử lý.');
      return;
    }
    if (after.length === 0) {
      setError('Chụp ít nhất một ảnh sau khi sửa xong để xác nhận.');
      return;
    }
    setBusy(true);
    let paths: string[];
    try {
      paths = await uploadConstructionPhotos(siteId, 'bao-hanh', after);
    } catch (err) {
      setError(toUserMessage(err, 'create'));
      setBusy(false);
      return;
    }
    await update({
      status: 'da_xu_ly',
      root_cause: form.rootCause.trim() || null,
      resolution: form.resolution.trim(),
      cost: form.cost || null,
      customer_confirmed_by: form.confirmedBy.trim() || null,
      after_photo_paths: paths,
    });
  }

  return (
    <li className="border-l-2 border-border pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusLozenge
          status={overdue ? 'overdue' : WARRANTY_CLAIM_STATUS_META[c.status].statusGroup}
        />
        <span className="text-xs text-fg-subtle">
          {WARRANTY_CLAIM_STATUS_META[c.status].label}
          {c.code && ` · ${c.code}`} · tiếp nhận {formatDate(c.reported_date)}
          {c.reported_by && ` · ${c.reported_by} phản ánh`}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap">{c.description}</p>
      <p className="mt-1 text-sm text-fg-subtle">
        Phụ trách: {c.assignee?.full_name ?? 'chưa giao'}
        {c.due_date ? (
          <span className={overdue ? 'font-semibold text-status-overdue' : undefined}>
            {' '}
            · hạn {formatDate(c.due_date)}
            {overdue && ' — quá hạn'}
          </span>
        ) : (
          open && ' · chưa đặt hạn'
        )}
        {c.started_at && ` · bắt đầu xử lý ${formatDateTime(c.started_at)}`}
      </p>
      {c.voice_path && (
        <div className="mt-1 text-sm">
          {audioSrc ? (
            <audio controls src={audioSrc} className="w-full" />
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-brand underline"
              onClick={() => void siteLogAudioUrl(c.voice_path!).then(setAudioSrc, () => undefined)}
            >
              <Mic className="size-4" aria-hidden />
              Nghe lời khách báo
            </button>
          )}
        </div>
      )}
      {(c.before_photo_paths ?? []).length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-fg-subtle">Ảnh hiện trạng</p>
          <PhotoStrip paths={c.before_photo_paths ?? []} />
        </div>
      )}
      {c.root_cause && <p className="mt-1 text-fg-subtle">Nguyên nhân: {c.root_cause}</p>}
      {c.resolution && (
        <p className="text-fg-subtle">
          {c.status === 'tu_choi' ? 'Lý do không bảo hành' : 'Kết quả'}: {c.resolution}
          {c.cost != null && ` · chi phí ${formatCurrency(c.cost)}`}
        </p>
      )}
      {(c.after_photo_paths ?? []).length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-fg-subtle">Ảnh sau khi sửa</p>
          <PhotoStrip paths={c.after_photo_paths ?? []} />
        </div>
      )}
      {c.resolved_at && (
        <p className="mt-1 text-xs text-fg-subtle">
          Đóng phiếu {formatDateTime(c.resolved_at)}
          {c.resolver && ` — ${c.resolver.full_name}`}
          {c.customer_confirmed_by && ` · khách xác nhận: ${c.customer_confirmed_by}`}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}

      {!readOnly && open && mode === 'xem' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {c.status === 'tiep_nhan' && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void update({ status: 'dang_xu_ly' })}
            >
              Bắt đầu xử lý
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => setMode('hoan_tat')}>
            Hoàn tất
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setMode('tu_choi')}>
            Không thuộc bảo hành
          </Button>
        </div>
      )}

      {mode === 'hoan_tat' && (
        <form
          onSubmit={finish}
          noValidate
          className="mt-2 space-y-3 rounded-sm bg-surface-sunken p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nguyên nhân">
              <Input
                value={form.rootCause}
                onChange={(e) => setForm((f) => ({ ...f, rootCause: e.target.value }))}
              />
            </Field>
            <Field label="Chi phí xử lý">
              <MoneyInput value={form.cost} onChange={(v) => setForm((f) => ({ ...f, cost: v }))} />
            </Field>
            <Field label="Kết quả xử lý" required className="sm:col-span-2">
              <textarea
                value={form.resolution}
                onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                rows={2}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1 text-sm font-medium">
                Ảnh sau khi sửa <span className="text-status-overdue">*</span>
              </p>
              <SitePhotoPicker files={after} onChange={setAfter} disabled={busy} />
            </div>
            <Field
              label="Người phía khách xác nhận"
              hint="Họ tên người kiểm tra cùng lúc bàn giao lại."
            >
              <Input
                value={form.confirmedBy}
                onChange={(e) => setForm((f) => ({ ...f, confirmedBy: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Xác nhận hoàn tất'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setMode('xem')}>
              Để sau
            </Button>
          </div>
        </form>
      )}

      {mode === 'tu_choi' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.resolution.trim()) {
              setError('Ghi lý do không thuộc phạm vi bảo hành.');
              return;
            }
            void update({ status: 'tu_choi', resolution: form.resolution.trim() });
          }}
          noValidate
          className="mt-2 space-y-3 rounded-sm bg-surface-sunken p-3"
        >
          <Field label="Lý do không thuộc bảo hành" required>
            <textarea
              value={form.resolution}
              onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
              rows={2}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              placeholder="Ngoài phạm vi hợp đồng, do người dùng làm hỏng…"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={busy}>
              Xác nhận
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setMode('xem')}>
              Để sau
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
