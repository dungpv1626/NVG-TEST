/**
 * Hiển thị và in báo cáo tuần / tháng của công trường (T4, migration 0242).
 *
 * Một bộ số liệu (`SiteReportData`, CSDL dựng) — hai cách thể hiện: trên màn hình (`SiteReportView`) và
 * bản in (`printSiteReport`, mẫu tiêu đề pháp nhân như các văn bản in khác). Ô chưa có dữ liệu hiện
 * «Chưa đủ dữ liệu», không hiện 0 (CLAUDE.md 5.2). Báo cáo không có tiền.
 */

import type { ReactNode } from 'react';
import {
  SITE_CHANGE_STATUS_META,
  SITE_PLAN_STATUS_LABELS,
  formatDate,
  formatNumber,
  planProgressPercent,
  type SiteReportData,
  type SiteReportPlanRow,
} from '@nvg/shared';
import { escapeHtml, openPrintReport } from '@/lib/print-report';

export const NOT_ENOUGH = 'Chưa đủ dữ liệu';

const REQUEST_KIND_LABELS: Record<string, string> = {
  purchase_requests: 'Đề nghị vật tư',
  payment_requests: 'Đề nghị thanh toán',
  rfis: 'Yêu cầu làm rõ',
  site_change_proposals: 'Đề xuất phát sinh',
};

export interface ReportComments {
  highlights: string | null;
  problems: string | null;
  next_plan: string | null;
}

export function periodLabel(d: Pick<SiteReportData, 'kind' | 'period_start' | 'period_end'>) {
  return d.kind === 'thang'
    ? `tháng ${d.period_start.slice(5, 7)}/${d.period_start.slice(0, 4)}`
    : `tuần ${formatDate(d.period_start)} – ${formatDate(d.period_end)}`;
}

export function reportTitle(d: SiteReportData) {
  return `Báo cáo ${periodLabel(d)} — ${d.site.code}`;
}

function qty(v: number | null, unit: string | null) {
  if (v == null) return null;
  return `${formatNumber(Number(v), 3)}${unit ? ` ${unit}` : ''}`;
}

function planDone(r: SiteReportPlanRow): string {
  const done = qty(r.done_quantity, r.unit);
  const pct = planProgressPercent(r);
  if (done == null)
    return r.days_worked > 0 ? `${r.days_worked} ngày làm, chưa ghi khối lượng` : NOT_ENOUGH;
  return `${done}${pct != null ? ` (${pct}%)` : ''}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-subtle">{children}</p>;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-[8rem]">
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

export function SiteReportView({
  data,
  comments,
}: {
  data: SiteReportData;
  comments?: ReportComments | null;
}) {
  const weeks = new Set(data.plan.map((p) => p.week_start)).size;
  return (
    <div className="space-y-3">
      {comments && (comments.highlights || comments.problems || comments.next_plan) && (
        <Section title="Nhận định của chỉ huy trưởng">
          <dl className="space-y-2 text-sm">
            {(
              [
                ['Kết quả nổi bật', comments.highlights],
                ['Vướng mắc cần văn phòng xử lý', comments.problems],
                ['Kế hoạch kỳ tới', comments.next_plan],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-fg-subtle">{k}</dt>
                  <dd className="whitespace-pre-wrap">{v}</dd>
                </div>
              ))}
          </dl>
        </Section>
      )}

      <Section title="Kế hoạch và đã làm">
        {data.plan.length === 0 ? (
          <Muted>{NOT_ENOUGH} — kỳ này chưa lập đầu việc ở tab «Kế hoạch tuần».</Muted>
        ) : (
          <ul className="divide-y divide-border">
            {data.plan.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-sm">{SITE_PLAN_STATUS_LABELS[r.status]}</span>
                </div>
                <p className="text-sm text-fg-subtle">
                  {[
                    weeks > 1 ? `Tuần ${formatDate(r.week_start)}` : null,
                    r.crew ?? r.assignee ?? 'Chưa giao',
                    r.milestone ? `Mốc: ${r.milestone}` : null,
                    r.carried_over ? 'Chép từ tuần trước' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-sm">
                  Mục tiêu: {qty(r.target_quantity, r.unit) ?? 'không đặt'} · Đã làm: {planDone(r)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Nhật ký công trường">
        {data.logs.days_logged === 0 ? (
          <Muted>{NOT_ENOUGH} — kỳ này chưa có mục nhật ký nào.</Muted>
        ) : (
          <>
            <p className="mb-2 text-sm">
              Đã ghi {data.logs.days_logged} / {data.logs.days_in_period} ngày ({data.logs.entries}{' '}
              mục).
            </p>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {data.logs.days.map((d) => (
                <li key={d.date}>
                  <span className="font-medium">{formatDate(d.date)}</span>
                  {' — '}
                  {d.workforce != null ? `${d.workforce} người` : 'chưa ghi quân số'}
                  {d.weather ? ` · ${d.weather}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Mốc thi công">
        {data.milestones.total === 0 ? (
          <Muted>{NOT_ENOUGH} — công trình chưa có bộ mốc.</Muted>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-4">
              <Stat
                label="Đã đạt"
                value={`${data.milestones.passed_total} / ${data.milestones.total}`}
              />
              <Stat label="Đạt trong kỳ" value={data.milestones.passed_in_period.length} />
              <Stat label="Chờ kiểm kỹ thuật" value={data.milestones.waiting_technical} />
            </div>
            {data.milestones.passed_in_period.map((m) => (
              <p key={m.label}>
                Đạt: {m.label}
                {m.passed_date ? ` (${formatDate(m.passed_date)})` : ''}
              </p>
            ))}
            {data.milestones.pending[0] && (
              <p>
                Mốc tiếp theo: {data.milestones.pending[0].label}
                {data.milestones.pending[0].planned_end_date
                  ? ` — hạn ${formatDate(data.milestones.pending[0].planned_end_date)}`
                  : ''}
                {data.milestones.pending[0].overdue ? ' — Quá hạn' : ''}
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="Đề nghị đang chờ">
        {data.requests.open === 0 ? (
          <Muted>Không có đề nghị nào đang mở.</Muted>
        ) : (
          <>
            <p className="mb-2 text-sm">
              {data.requests.open} đề nghị đang mở
              {data.requests.overdue > 0 ? `, ${data.requests.overdue} quá ngày cần` : ''}.
            </p>
            <ul className="space-y-1 text-sm">
              {data.requests.items.map((r, i) => (
                <li key={`${r.code}-${i}`}>
                  <span className="font-medium">
                    {REQUEST_KIND_LABELS[r.entity_type] ?? 'Đề nghị'}
                  </span>{' '}
                  {r.code ? `${r.code} — ` : ''}
                  {r.title}
                  <span className="text-fg-subtle">
                    {' · Đang chờ: '}
                    {r.holder_names?.length
                      ? r.holder_names.join(', ')
                      : (r.holder_label ?? 'chưa rõ')}
                    {r.needed_date ? ` · cần ngày ${formatDate(r.needed_date)}` : ''}
                    {r.overdue ? ' · Quá hạn' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Tồn tại cần khắc phục">
        <div className="mb-2 flex flex-wrap gap-4 text-sm">
          <Stat label="Ghi trong kỳ" value={data.issues.opened_in_period} />
          <Stat label="Đóng trong kỳ" value={data.issues.closed_in_period} />
          <Stat label="Đang mở" value={data.issues.open_now} />
          <Stat label="Quá hạn" value={data.issues.overdue_now} />
        </div>
        <ul className="space-y-1 text-sm">
          {data.issues.items.map((i, k) => (
            <li key={`${i.code}-${k}`}>
              {i.code ? `${i.code} — ` : ''}
              {i.work_item ? `${i.work_item}: ` : ''}
              {i.description}
              <span className="text-fg-subtle">
                {' · '}
                {i.assignee ?? 'chưa giao'}
                {i.due_date ? ` · hạn ${formatDate(i.due_date)}` : ''}
                {i.overdue ? ' · Quá hạn' : ''}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Điểm danh tổ đội">
        {data.attendance.length === 0 ? (
          <Muted>{NOT_ENOUGH} — kỳ này chưa có phiếu điểm danh tổ đội.</Muted>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.attendance.map((a) => (
              <li key={a.crew}>
                <span className="font-medium">{a.crew}</span> — {a.days} ngày điểm danh ·{' '}
                {a.workdays != null ? `${formatNumber(Number(a.workdays), 2)} công` : NOT_ENOUGH} ·
                đông nhất {a.max_people ?? 0} người / ngày
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Đề xuất phát sinh">
        {data.changes.length === 0 ? (
          <Muted>Không có đề xuất phát sinh nào mở hoặc lập trong kỳ.</Muted>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.changes.map((c, i) => (
              <li key={`${c.code}-${i}`}>
                {c.code ? `${c.code} — ` : ''}
                {c.description}
                <span className="text-fg-subtle">
                  {' · '}
                  {SITE_CHANGE_STATUS_META[c.display_status]?.label ?? c.display_status}
                  {c.holder_label && !c.is_closed ? ` · đang ở: ${c.holder_label}` : ''}
                  {c.is_emergency ? ' · khẩn cấp, đã làm trước' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.kind === 'thang' && (
        <Section title="Nhận định các báo cáo tuần trong tháng">
          {data.weekly_reports.length === 0 ? (
            <Muted>{NOT_ENOUGH} — tháng này chưa gửi báo cáo tuần nào.</Muted>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.weekly_reports.map((w) => (
                <li key={w.code}>
                  <p className="font-medium">
                    Tuần {formatDate(w.period_start)} – {formatDate(w.period_end)} ({w.code})
                  </p>
                  {w.highlights && <p className="whitespace-pre-wrap">Nổi bật: {w.highlights}</p>}
                  {w.problems && <p className="whitespace-pre-wrap">Vướng mắc: {w.problems}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bản in
// ---------------------------------------------------------------------------

const e = (v: string | null | undefined) => escapeHtml(v ?? '');

export function printSiteReport(
  data: SiteReportData,
  comments: ReportComments | null,
  meta: { code?: string | null; sentAt?: string | null; sender?: string | null } = {},
) {
  const c = data.company;
  const letterhead = `
<div class="letterhead">
  <div><strong>${e(c.legal_name ?? c.short_name)}</strong>${e(c.address)}${c.phone ? `<br/>Điện thoại: ${e(c.phone)}` : ''}</div>
  <div style="text-align:right">${meta.code ? `Số: ${e(meta.code)}<br/>` : 'Bản xem trước — chưa gửi<br/>'}${
    meta.sentAt ? `Gửi ngày ${e(formatDate(meta.sentAt))}` : ''
  }</div>
</div>`;

  const plan =
    data.plan.length === 0
      ? `<p class="muted">${NOT_ENOUGH}.</p>`
      : `<table><thead><tr><th>Đầu việc</th><th>Tổ đội / người</th><th>Mốc</th><th class="num">Mục tiêu</th><th class="num">Đã làm</th><th>Trạng thái</th></tr></thead><tbody>${data.plan
          .map(
            (
              r,
            ) => `<tr><td>${e(r.name)}${r.carried_over ? ' <span class="muted">(chép từ tuần trước)</span>' : ''}</td>
<td>${e(r.crew ?? r.assignee ?? 'Chưa giao')}</td><td>${e(r.milestone)}</td>
<td class="num">${e(qty(r.target_quantity, r.unit) ?? '—')}</td><td class="num">${e(planDone(r))}</td>
<td>${e(SITE_PLAN_STATUS_LABELS[r.status])}</td></tr>`,
          )
          .join('')}</tbody></table>`;

  const logs =
    data.logs.days_logged === 0
      ? `<p class="muted">${NOT_ENOUGH}.</p>`
      : `<p>Đã ghi ${data.logs.days_logged} / ${data.logs.days_in_period} ngày (${data.logs.entries} mục).</p>
<table><thead><tr><th>Ngày</th><th class="num">Quân số</th><th>Thời tiết</th></tr></thead><tbody>${data.logs.days
          .map(
            (d) =>
              `<tr><td>${e(formatDate(d.date))}</td><td class="num">${d.workforce ?? '—'}</td><td>${e(d.weather)}</td></tr>`,
          )
          .join('')}</tbody></table>`;

  const ms = data.milestones;
  const milestones =
    ms.total === 0
      ? `<p class="muted">${NOT_ENOUGH}.</p>`
      : `<p>Đã đạt ${ms.passed_total} / ${ms.total} mốc · đạt trong kỳ ${ms.passed_in_period.length} · chờ kiểm kỹ thuật ${ms.waiting_technical}.</p>
${ms.passed_in_period.map((m) => `<p>Đạt: ${e(m.label)}${m.passed_date ? ` (${e(formatDate(m.passed_date))})` : ''}</p>`).join('')}
${ms.pending[0] ? `<p>Mốc tiếp theo: ${e(ms.pending[0].label)}${ms.pending[0].planned_end_date ? ` — hạn ${e(formatDate(ms.pending[0].planned_end_date))}` : ''}${ms.pending[0].overdue ? ' — Quá hạn' : ''}</p>` : ''}`;

  const requests =
    data.requests.open === 0
      ? '<p class="muted">Không có đề nghị nào đang mở.</p>'
      : `<table><thead><tr><th>Loại</th><th>Nội dung</th><th>Đang chờ</th><th>Ngày cần</th></tr></thead><tbody>${data.requests.items
          .map(
            (
              r,
            ) => `<tr><td>${e(REQUEST_KIND_LABELS[r.entity_type] ?? 'Đề nghị')}</td><td>${e(r.code ? `${r.code} — ${r.title}` : r.title)}</td>
<td>${e(r.holder_names?.length ? r.holder_names.join(', ') : r.holder_label)}</td>
<td>${e(r.needed_date ? formatDate(r.needed_date) : '')}${r.overdue ? ' <strong>Quá hạn</strong>' : ''}</td></tr>`,
          )
          .join('')}</tbody></table>`;

  const iss = data.issues;
  const issues = `<p>Ghi trong kỳ ${iss.opened_in_period} · đóng trong kỳ ${iss.closed_in_period} · đang mở ${iss.open_now} · quá hạn ${iss.overdue_now}.</p>
${
  iss.items.length
    ? `<table><thead><tr><th>Tồn tại</th><th>Người xử lý</th><th>Hạn</th></tr></thead><tbody>${iss.items
        .map(
          (
            i,
          ) => `<tr><td>${e([i.code, i.work_item, i.description].filter(Boolean).join(' — '))}</td><td>${e(i.assignee ?? 'Chưa giao')}</td>
<td>${e(i.due_date ? formatDate(i.due_date) : '')}${i.overdue ? ' <strong>Quá hạn</strong>' : ''}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : ''
}`;

  const attendance =
    data.attendance.length === 0
      ? `<p class="muted">${NOT_ENOUGH}.</p>`
      : `<table><thead><tr><th>Tổ đội</th><th class="num">Ngày điểm danh</th><th class="num">Công</th><th class="num">Đông nhất / ngày</th></tr></thead><tbody>${data.attendance
          .map(
            (a) =>
              `<tr><td>${e(a.crew)}</td><td class="num">${a.days}</td><td class="num">${a.workdays != null ? e(formatNumber(Number(a.workdays), 2)) : NOT_ENOUGH}</td><td class="num">${a.max_people ?? '—'}</td></tr>`,
          )
          .join('')}</tbody></table>`;

  const changes =
    data.changes.length === 0
      ? '<p class="muted">Không có.</p>'
      : `<table><thead><tr><th>Đề xuất</th><th>Trạng thái</th></tr></thead><tbody>${data.changes
          .map(
            (ch) =>
              `<tr><td>${e([ch.code, ch.description].filter(Boolean).join(' — '))}${ch.is_emergency ? ' <span class="muted">(khẩn cấp, đã làm trước)</span>' : ''}</td>
<td>${e(SITE_CHANGE_STATUS_META[ch.display_status]?.label ?? ch.display_status)}${ch.holder_label && !ch.is_closed ? ` — đang ở: ${e(ch.holder_label)}` : ''}</td></tr>`,
          )
          .join('')}</tbody></table>`;

  const weekly =
    data.kind === 'thang'
      ? `<h2>Nhận định các báo cáo tuần</h2>${
          data.weekly_reports.length === 0
            ? `<p class="muted">${NOT_ENOUGH}.</p>`
            : data.weekly_reports
                .map(
                  (w) =>
                    `<div class="block"><strong>Tuần ${e(formatDate(w.period_start))} – ${e(formatDate(w.period_end))}</strong>${w.highlights ? `<p>Nổi bật: ${e(w.highlights)}</p>` : ''}${w.problems ? `<p>Vướng mắc: ${e(w.problems)}</p>` : ''}</div>`,
                )
                .join('')
        }`
      : '';

  const cm = comments ?? { highlights: null, problems: null, next_plan: null };
  const body = `
<dl>
  <div><dt>Công trình</dt><dd>${e(`${data.site.code} — ${data.site.name}`)}</dd></div>
  ${data.site.address ? `<div><dt>Địa điểm</dt><dd>${e(data.site.address)}</dd></div>` : ''}
  <div><dt>Chỉ huy trưởng</dt><dd>${e(data.site.commander ?? 'Chưa phân công')}</dd></div>
  <div><dt>Kỳ báo cáo</dt><dd>${e(`${formatDate(data.period_start)} – ${formatDate(data.period_end)}`)}</dd></div>
</dl>
<h2>1. Nhận định của chỉ huy trưởng</h2>
<div class="block"><strong>Kết quả nổi bật</strong><p>${e(cm.highlights ?? 'Không ghi.')}</p></div>
<div class="block"><strong>Vướng mắc cần văn phòng xử lý</strong><p>${e(cm.problems ?? 'Không ghi.')}</p></div>
<div class="block"><strong>Kế hoạch kỳ tới</strong><p>${e(cm.next_plan ?? 'Không ghi.')}</p></div>
<h2>2. Kế hoạch và đã làm</h2>${plan}
<h2>3. Nhật ký công trường</h2>${logs}
<h2>4. Mốc thi công</h2>${milestones}
<h2>5. Đề nghị đang chờ</h2>${requests}
<h2>6. Tồn tại cần khắc phục</h2>${issues}
<h2>7. Điểm danh tổ đội</h2>${attendance}
<h2>8. Đề xuất phát sinh</h2>${changes}
${weekly}
<table style="margin-top:32px">
  <tr><th style="width:50%">Người lập báo cáo</th><th>Trưởng phòng Thi công</th></tr>
  <tr><td style="height:80px"></td><td></td></tr>
  <tr><td>${e(meta.sender ?? data.site.commander ?? '(Ký, ghi rõ họ tên)')}</td><td>(Ký, ghi rõ họ tên)</td></tr>
</table>
<p class="muted">Số liệu do hệ thống tổng hợp từ nhật ký, kế hoạch tuần, mốc, đề nghị, tồn tại và điểm danh đã ghi${
    meta.sentAt ? ' — chụp lúc gửi, không đổi về sau' : ''
  }. Báo cáo không gồm số tiền.</p>`;
  openPrintReport(reportTitle(data), body, letterhead);
}
