/**
 * Giấy tờ pháp nhân (Đợt 5 — 5F, migration 0206): giấy phép, bảo hiểm, đăng kiểm phương tiện /
 * thiết bị của công ty — khác «Giấy tờ» (của từng nhân sự, NS-10). Hành chính nhập một lần, hệ
 * thống báo người phụ trách khi đã hết hạn (và trước hạn khi NVG đặt số ngày).
 */

import { PageHeader } from '@/components/layout/app-shell';
import {
  CompanyDocumentsPanel,
  type DocumentCategory,
} from '@/components/company-docs/company-documents-panel';
import { useCan } from '@/lib/auth';
import { NsNav } from './ns-nav';

export const HC_DOCUMENT_CATEGORIES: readonly DocumentCategory[] = [
  { value: 'giay_phep', label: 'Giấy phép' },
  { value: 'bao_hiem', label: 'Bảo hiểm' },
  { value: 'dang_kiem', label: 'Đăng kiểm phương tiện, thiết bị' },
  { value: 'hanh_chinh_khac', label: 'Giấy tờ hành chính khác' },
];

export function CompanyDocumentPage() {
  const canEdit = useCan('NS', 'edit');
  return (
    <>
      <NsNav />
      <PageHeader
        title="Giấy tờ pháp nhân"
        description="Giấy phép, bảo hiểm, đăng kiểm của công ty — hệ thống nhắc người phụ trách khi hết hạn."
        breadcrumbs={[{ label: 'Hành chính – Nhân sự' }, { label: 'Giấy tờ pháp nhân' }]}
      />
      <CompanyDocumentsPanel
        categories={HC_DOCUMENT_CATEGORIES}
        remindParamKey="hc.document_remind_days"
        canEdit={canEdit}
        emptyMessage="Chưa theo dõi giấy tờ nào của pháp nhân. Thêm giấy phép, hợp đồng bảo hiểm, giấy đăng kiểm để hệ thống nhắc khi hết hạn."
      />
    </>
  );
}
