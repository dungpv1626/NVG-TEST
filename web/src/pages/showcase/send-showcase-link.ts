/**
 * Đường dẫn «Gửi mẫu công trình» từ đầu mối / cơ hội sang thư viện mẫu (`/mau-cong-trinh`).
 *
 * Thư viện đã nhận `?dau-moi=` / `?co-hoi=` (link gắn với hồ sơ, tạo xong ghi nhật ký chăm sóc), `?cho=` (tên khách
 * trên tiêu đề link) và `?loai=` (lọc sẵn loại mẫu). Loại công trình của hồ sơ đổi sang loại mẫu khi khớp rõ ràng;
 * không khớp thì để trống — người gửi tự lọc, máy không đoán.
 */

import type { ShowcaseKind } from '@nvg/shared';

const KIND_BY_PROJECT_TYPE: Readonly<Record<string, ShowcaseKind>> = {
  'Nhà phố': 'nha_pho',
  'Biệt thự': 'biet_thu',
  'Nhà ở nông thôn': 'nha_nong_thon',
  'Nhà xưởng công nghiệp': 'nha_xuong',
  'Cải tạo nhà máy': 'nha_xuong',
  'Cải tạo nhà ở': 'cai_tao',
  'Giàn giáo — bán': 'san_pham_nvs',
  'Giàn giáo — cho thuê': 'san_pham_nvs',
  'Kết cấu thép': 'san_pham_nvs',
};

export function showcaseSendPath(input: {
  leadId?: string;
  opportunityId?: string;
  name: string | null;
  projectType: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.leadId) params.set('dau-moi', input.leadId);
  if (input.opportunityId) params.set('co-hoi', input.opportunityId);
  if (input.name) params.set('cho', input.name);
  const kind = input.projectType ? KIND_BY_PROJECT_TYPE[input.projectType] : undefined;
  if (kind) params.set('loai', kind);
  return `/mau-cong-trinh?${params.toString()}`;
}
