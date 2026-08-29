/**
 * Hàng chờ chú giải hồ sơ cũ (Mốc 3, Bước 3) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * Cột dẫn đầu là mã công trình; cột cố định là chất lượng trích xuất và trạng thái chú giải.
 * Bản ghi CHƯA chú giải xếp lên trước: công của kiến trúc sư là nguồn lực khan hiếm nhất
 * của bước này (10–15 phút mỗi công trình), nên màn hình phải nói ngay còn bao nhiêu việc.
 */

import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useKbRecords } from '@/hooks/use-kb-records';
import { TkNav } from './tk-nav';

interface KbRow extends EntityRow {
  buildingType: string;
  floors: number | null;
  quality: number | null;
  site: string;
  annotated: boolean;
  fewShot: boolean;
}

const BUILDING_TYPE_LABEL: Record<string, string> = {
  nha_pho: 'Nhà phố',
  biet_thu: 'Biệt thự',
  nha_vuon: 'Nhà vườn',
};

export function KbListPage() {
  const { data, isLoading, error, refetch } = useKbRecords();

  const rows: KbRow[] = (data ?? []).map((r) => ({
    id: r.id,
    code: r.project_code,
    title: BUILDING_TYPE_LABEL[r.building_type] ?? r.building_type,
    responsiblePerson: null,
    // Chưa chú giải là việc CÒN PHẢI LÀM, không phải lỗi — dùng "Đang xử lý", không dùng
    // "Quá hạn". Năm màu trạng thái chuẩn, không tạo màu mới (CLAUDE.md 5.4).
    status: r.has_rationale ? 'completed' : 'in_progress',
    deadline: null,
    companyId: r.company_id,
    createdAt: r.created_at,
    buildingType: BUILDING_TYPE_LABEL[r.building_type] ?? r.building_type,
    floors: r.floors,
    quality: r.quality_score,
    site:
      r.site_width_m && r.site_depth_m
        ? `${r.site_width_m} × ${r.site_depth_m} m`
        : 'Chưa xác định',
    annotated: r.has_rationale,
    fewShot: r.has_slicing_tree,
  }));

  const pending = rows.filter((r) => !r.annotated).length;

  return (
    <>
      <TkNav />
      <PageHeader
        title="Hồ sơ cũ đã số hoá"
        breadcrumbs={[{ label: 'Thiết kế' }, { label: 'Hồ sơ cũ đã số hoá' }]}
        description={
          rows.length > 0
            ? `${rows.length} hồ sơ trong kho, ${pending} hồ sơ còn chờ chú giải.`
            : undefined
        }
      />

      <EntityTable<KbRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/tk/ho-so-cu/${row.id}`}
        searchPlaceholder="Tìm theo mã công trình hoặc loại hình…"
        emptyMessage="Chưa có hồ sơ cũ nào được số hoá. Gửi bộ bản vẽ qua luồng số hoá để bắt đầu dựng kho tham chiếu."
        columns={[
          { key: 'floors', header: 'Số tầng', render: (r) => r.floors ?? '—' },
          { key: 'site', header: 'Lô đất', render: (r) => r.site },
          {
            key: 'quality',
            header: 'Chất lượng trích',
            render: (r) => (r.quality === null ? '—' : `${Math.round(r.quality * 100)}%`),
          },
          {
            key: 'fewshot',
            header: 'Dùng làm mẫu',
            render: (r) =>
              r.fewShot ? (
                'Có'
              ) : (
                // Không dựng được cây chia không gian thì bản ghi vẫn dùng cho thống kê,
                // nhưng không đưa vào prompt làm mẫu (mục 6.2).
                <span className="text-fg-subtle">Chỉ thống kê</span>
              ),
          },
          {
            key: 'annotated',
            header: 'Chú giải',
            // Chữ, không phải màu: cột trạng thái sẵn có của bảng đã mang màu, và màu không
            // bao giờ là cách DUY NHẤT truyền đạt thông tin (CLAUDE.md 5.4).
            render: (r) =>
              r.annotated ? 'Đã chú giải' : <span className="text-fg-subtle">Chờ chú giải</span>,
          },
        ]}
      />
    </>
  );
}
