/**
 * Kho hồ sơ năng lực (Đợt 5 — 5C-1, migration 0208) — mẫu bố cục Danh sách.
 *
 * Ba phần, nhập một lần, gói thầu nào cũng gắn lại được:
 *  1. Giấy tờ có thời hạn của pháp nhân (pháp lý, báo cáo tài chính theo năm, chứng chỉ, thiết bị +
 *     kiểm định) — bảng `company_documents` dùng chung với Hành chính. Báo cáo tài chính là Mẫu D.
 *  2. Kinh nghiệm — ĐỌC từ hợp đồng đã ký + thư viện công trình mẫu (liên kết, không chép).
 *  3. Nhân sự chủ chốt — ĐỌC từ Nhân sự (họ tên, chức danh, chứng chỉ hành nghề + hạn).
 */

import { formatCurrency, formatDate } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import {
  CompanyDocumentsPanel,
  ExpiryTag,
  type DocumentCategory,
} from '@/components/company-docs/company-documents-panel';
import { EmptyState } from '@/components/ui/states';
import { useParameterNumber } from '@/hooks/use-company-documents';
import { useBidExperience, useBidKeyPersonnel } from '@/hooks/use-bid-extras';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { DaNav } from './da-nav';

export const CAPABILITY_CATEGORIES: readonly DocumentCategory[] = [
  { value: 'phap_ly', label: 'Pháp lý (đăng ký kinh doanh, chứng chỉ năng lực)' },
  { value: 'bao_cao_tai_chinh', label: 'Báo cáo tài chính', yearly: true },
  { value: 'chung_chi', label: 'Chứng chỉ (ISO, an toàn…)' },
  { value: 'thiet_bi', label: 'Thiết bị + kiểm định' },
];

export function CapabilityPage() {
  const canEdit = useCan('DA', 'edit');
  const scope = useCompanyScope();
  const companyId = scope.isAggregate ? null : scope.companyId;
  const { data: experience } = useBidExperience(companyId);
  const { data: people } = useBidKeyPersonnel(companyId);
  const { data: remindDays } = useParameterNumber('da.document_remind_days');

  return (
    <>
      <DaNav />
      <PageHeader
        title="Hồ sơ năng lực"
        description="Nhập một lần, gắn vào gói thầu bằng một bấm; giấy hết hạn trước ngày nộp bị báo đỏ."
        breadcrumbs={[{ label: 'Dự án – Đấu thầu' }, { label: 'Hồ sơ năng lực' }]}
      />

      <section className="space-y-3">
        <h2 className="font-semibold">Giấy tờ của pháp nhân</h2>
        <CompanyDocumentsPanel
          categories={CAPABILITY_CATEGORIES}
          remindParamKey="da.document_remind_days"
          canEdit={canEdit}
          emptyMessage="Chưa có giấy tờ năng lực nào. Thêm đăng ký kinh doanh, chứng chỉ năng lực, báo cáo tài chính để gắn vào gói thầu."
        />
      </section>

      {companyId === null ? (
        <p className="mt-6 text-fg-subtle">
          Chọn một pháp nhân ở bộ chọn góc trên bên trái để xem kinh nghiệm và nhân sự chủ chốt.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="font-semibold">Kinh nghiệm</h2>
            <p className="text-sm text-fg-subtle">
              Lấy từ hợp đồng đã ký và thư viện công trình mẫu — sửa ở hồ sơ gốc.
            </p>
            {(experience ?? []).length === 0 ? (
              <EmptyState message="Chưa có hợp đồng đã ký hay công trình mẫu đã xác nhận." />
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
                {(experience ?? []).map((x) => (
                  <li key={`${x.source}-${x.source_id}`} className="p-3 text-sm">
                    <p className="font-medium">{x.title}</p>
                    <p className="text-fg-subtle">
                      {x.source === 'hop_dong' ? 'Hợp đồng' : 'Công trình mẫu'}
                      {x.customer_name ? ` · ${x.customer_name}` : ''}
                      {x.year ? ` · ${x.year}` : ''}
                      {x.value ? ` · ${formatCurrency(x.value)}` : ''}
                      {x.location ? ` · ${x.location}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-semibold">Nhân sự chủ chốt</h2>
            <p className="text-sm text-fg-subtle">
              Lấy từ Nhân sự: người có chứng chỉ hành nghề — cập nhật ở phân hệ Nhân sự.
            </p>
            {(people ?? []).length === 0 ? (
              <EmptyState message="Chưa có nhân sự nào có chứng chỉ hành nghề trong hồ sơ Nhân sự." />
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
                {(people ?? []).map((p, i) => (
                  <li key={`${p.employee_id}-${i}`} className="p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">
                        {p.full_name} — {p.job_title}
                      </span>
                      <ExpiryTag expiry={p.certificate_expiry} remindDays={remindDays ?? null} />
                    </div>
                    <p className="text-fg-subtle">
                      {p.certificate}
                      {p.certificate_no ? ` · Số ${p.certificate_no}` : ''}
                      {p.certificate_expiry ? ` · hết hạn ${formatDate(p.certificate_expiry)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
