/**
 * Phiếu khảo sát riêng từng pháp nhân (chủ dự án 18/10/2026: «phiếu riêng cho các công ty»).
 *
 * Sáu mục báo cáo chung (`SURVEY_REPORT_FIELDS`) giữ nguyên cho cả ba công ty — Ban Giám đốc duyệt
 * theo đúng sáu mục đó. Mỗi pháp nhân thêm một nhóm «Thông tin hiện trường» lưu ở
 * `site_surveys.site_details` (jsonb, khoá = `key` dưới đây). Cùng một danh sách dùng cho ô nhập
 * trên màn hình, phiếu giấy in trống, biên bản in và hộp duyệt — sửa ở đây là đổi cả bốn chỗ.
 *
 * Nguồn của từng danh sách:
 *  - NVO — hồ sơ khảo sát, Ban Giám đốc mục 3 bước 3 (đo đạc, số tầng, công năng, pháp lý…) và
 *    Phòng Thiết kế mục 6 (vị trí, kích thước, hiện trạng khu đất, số người dùng, vật liệu).
 *  - NVC — hồ sơ khảo sát, Ban Giám đốc mục 3 (điều kiện thi công, nhà máy đang hoạt động, giao
 *    thông, điện nước, thời gian được phép thi công) và Phòng Thiết kế (dây chuyền, tải trọng máy,
 *    nhịp, chiều cao, nền công nghiệp, PCCC, điện công suất lớn).
 *  - NVS — hồ sơ khảo sát CHƯA mô tả khảo sát cho thuê giàn giáo; danh sách là đề xuất của Claude Code,
 *    anh Dũng chấp nhận 27/10/2026 (câu 22). Kinh doanh NVS sửa ở đây khi cần.
 *
 * Bỏ một ô thì đơn giản xoá dòng: dữ liệu cũ vẫn nằm trong jsonb và vẫn hiện (nhãn = khoá) ở
 * biên bản đã lưu. Đổi `key` của ô đã dùng thì dữ liệu cũ mất nhãn — đổi nhãn, đừng đổi khoá.
 */

export interface SurveySiteField {
  key: string;
  label: string;
  /** Gợi ý in mờ / chữ gợi ý trong ô. */
  hint?: string;
  /** Số dòng kẻ trên phiếu giấy; > 1 thì ô nhập trên màn hình là ô nhiều dòng. */
  lines?: number;
}

export interface SurveySiteForm {
  /** Tiêu đề nhóm trên phiếu và màn hình. */
  title: string;
  fields: readonly SurveySiteField[];
}

export const SURVEY_SITE_FORMS: Readonly<Record<string, SurveySiteForm>> = {
  NVO: {
    title: 'Thông tin khu đất và nhà ở',
    fields: [
      {
        key: 'land_size',
        label: 'Kích thước khu đất',
        hint: 'Mặt tiền × chiều sâu (m), diện tích (m²); đất méo thì ghi các cạnh',
      },
      { key: 'orientation', label: 'Hướng mặt tiền' },
      {
        key: 'current_state',
        label: 'Hiện trạng',
        hint: 'Đất trống / nhà cũ phá dỡ / cải tạo — mấy tầng, kết cấu gì',
      },
      {
        key: 'road',
        label: 'Đường trước nhà',
        hint: 'Bề rộng, xe tải / xe bê tông vào được không',
      },
      {
        key: 'neighbors',
        label: 'Nhà liền kề',
        hint: 'Hai bên và phía sau: có nhà không, cao mấy tầng, tình trạng',
      },
      {
        key: 'legal',
        label: 'Pháp lý',
        hint: 'Sổ đỏ, giấy phép xây dựng, chỉ giới, mật độ cho phép',
      },
      { key: 'scale', label: 'Quy mô mong muốn', hint: 'Số tầng, tum, tầng hầm, diện tích sàn' },
      { key: 'occupants', label: 'Người ở', hint: 'Số người, mấy thế hệ, người già / trẻ nhỏ' },
      {
        key: 'functions',
        label: 'Công năng chính',
        hint: 'Số phòng ngủ, phòng thờ, gara, kinh doanh tại nhà…',
        lines: 3,
      },
      { key: 'style', label: 'Phong cách, vật liệu mong muốn', lines: 2 },
      { key: 'utilities', label: 'Điện, nước, thoát nước hiện có' },
    ],
  },
  NVC: {
    title: 'Thông tin nhà xưởng và điều kiện thi công',
    fields: [
      { key: 'area', label: 'Diện tích', hint: 'Khu đất / xây dựng (m²)' },
      {
        key: 'frame',
        label: 'Khẩu độ, bước cột, chiều cao nhà',
        hint: 'Theo yêu cầu chủ đầu tư hoặc hiện trạng (m)',
      },
      { key: 'production', label: 'Ngành sản xuất, dây chuyền, tải trọng máy', lines: 2 },
      { key: 'crane', label: 'Cầu trục', hint: 'Có / không, sức nâng (tấn), cao độ ray' },
      {
        key: 'ground',
        label: 'Nền và địa chất',
        hint: 'Hiện trạng đất, đã có khảo sát địa chất chưa, tải trọng nền yêu cầu',
      },
      {
        key: 'operating',
        label: 'Nhà máy đang hoạt động',
        hint: 'Có / không; giờ được phép thi công, khu vực cấm',
      },
      { key: 'access', label: 'Giao thông, lối xe vào, bãi tập kết vật tư' },
      {
        key: 'utilities',
        label: 'Điện, nước, phòng cháy chữa cháy hiện có',
        hint: 'Công suất trạm điện, nguồn nước, hệ thống PCCC',
      },
      { key: 'safety', label: 'Quy định an toàn, nội quy nhà máy', lines: 2 },
      {
        key: 'owner_docs',
        label: 'Hồ sơ chủ đầu tư đã có',
        hint: 'Bản vẽ, bảng khối lượng, khảo sát địa chất, giấy phép',
      },
    ],
  },
  NVS: {
    title: 'Thông tin giàn giáo và kết cấu thép',
    fields: [
      {
        key: 'request_type',
        label: 'Loại yêu cầu',
        hint: 'Thuê giàn giáo / mua / gia công kết cấu thép',
      },
      { key: 'project_item', label: 'Công trình, hạng mục cần dùng' },
      { key: 'height_area', label: 'Chiều cao cần dựng, diện tích mặt dựng', hint: 'm, m²' },
      {
        key: 'scaffold_type',
        label: 'Loại giàn giáo và phụ kiện',
        hint: 'Khung, nêm, chống, sàn thao tác, cầu thang…',
      },
      { key: 'quantity', label: 'Khối lượng ước tính' },
      {
        key: 'period',
        label: 'Thời gian thuê dự kiến',
        hint: 'Từ ngày – đến ngày, có thể gia hạn không',
      },
      { key: 'delivery', label: 'Địa điểm giao, lối xe vào, giờ nhận hàng' },
      { key: 'base', label: 'Nền đặt chân giàn, neo giằng vào công trình' },
      { key: 'installation', label: 'Bên lắp dựng / tháo dỡ', hint: 'NVS hay khách tự làm' },
    ],
  },
};

/** Phiếu của một pháp nhân — mã khác ba công ty (ví dụ «NVG») thì không có nhóm riêng. */
export function surveySiteForm(companyCode: string | null | undefined): SurveySiteForm | null {
  return (companyCode && SURVEY_SITE_FORMS[companyCode]) || null;
}

/** Các ô đã điền theo thứ tự của phiếu; ô có trong dữ liệu mà phiếu đã bỏ thì xếp cuối, nhãn = khoá. */
export function filledSiteDetails(
  companyCode: string | null | undefined,
  details: Record<string, unknown> | null | undefined,
): { key: string; label: string; value: string }[] {
  if (!details) return [];
  const form = surveySiteForm(companyCode);
  const known = new Set(form?.fields.map((f) => f.key) ?? []);
  const out: { key: string; label: string; value: string }[] = [];
  for (const f of form?.fields ?? []) {
    const v = details[f.key];
    if (typeof v === 'string' && v.trim())
      out.push({ key: f.key, label: f.label, value: v.trim() });
  }
  for (const [k, v] of Object.entries(details)) {
    if (!known.has(k) && typeof v === 'string' && v.trim())
      out.push({ key: k, label: k, value: v.trim() });
  }
  return out;
}
