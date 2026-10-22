/**
 * Bộ kết quả AI Design — danh sách tệp và cách đặt tên của gói `.zip` (Đợt 5B, bước 4).
 *
 * Phần thuần (không mạng, không DOM) để có phép thử: tên gói theo MÃ HỒ SƠ thiết kế, mọi tệp bên
 * trong mang tiền tố mã hồ sơ — tách khỏi thư mục vẫn biết của hồ sơ nào. Gói chỉ chứa thứ ĐÃ CÓ (tờ
 * vector, DXF, ảnh đã vẽ); không dựng gì mới, không gọi mô hình.
 */

import { fileSlug } from './variant-name';

export interface BundleFile {
  /** Đường dẫn trong gói. */
  path: string;
  /** Tuyến Worker trả byte của tệp. */
  url: string;
  /** Nhóm hiển thị. */
  group: 'mat-bang' | 'mat-dung' | 'phoi-canh';
  /** `true` = tệp có thể chưa có (ảnh do mô hình ảnh vẽ) — 404 thì bỏ qua, không phải lỗi. */
  optional: boolean;
  /** Đuôi mặc định khi máy chủ không nói loại tệp. */
  ext: string;
}

/** Mã hồ sơ thành tiền tố tên tệp: giữ chữ số / chữ / gạch nối, bỏ ký tự lạ. */
export function codePrefix(code: string | null | undefined): string {
  const slug = (code ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'ho-so';
}

export function bundleZipName(code: string | null | undefined, planName: string): string {
  return `${codePrefix(code)}_AI-Design_${fileSlug(planName)}.zip`;
}

export interface BundleInput {
  projectId: string;
  code: string | null | undefined;
  plan: {
    artifactId: string;
    name: string;
    /** Tầng có tờ vẽ, kể cả tờ mái. */
    levels: Array<{ level: number; name: string; roof?: boolean }>;
  };
  facade: { artifactId: string; name: string } | null;
  imageSet: {
    artifactId: string;
    name: string;
    views: Array<{ view: string; label: string }>;
  } | null;
}

export function bundleFiles(input: BundleInput): BundleFile[] {
  const pre = codePrefix(input.code);
  const pid = encodeURIComponent(input.projectId);
  const plan = input.plan;
  const pa = fileSlug(plan.name);
  const planQs = `artifactId=${encodeURIComponent(plan.artifactId)}`;
  const files: BundleFile[] = [];
  for (const level of plan.levels) {
    const slug = fileSlug(level.name) || `tang-${level.level}`;
    files.push({
      path: `mat-bang/${pre}_${pa}_${slug}.svg`,
      url: `/design/ai/plan/${pid}/sheet?${planQs}&level=${level.level}`,
      group: 'mat-bang',
      optional: false,
      ext: 'svg',
    });
  }
  files.push({
    path: `mat-bang/${pre}_${pa}_ca-nha.dxf`,
    url: `/design/ai/plan/${pid}/dxf?${planQs}`,
    group: 'mat-bang',
    optional: false,
    ext: 'dxf',
  });
  for (const level of plan.levels) {
    if (level.roof) continue;
    const slug = fileSlug(level.name) || `tang-${level.level}`;
    files.push({
      path: `mat-bang/${pre}_${pa}_${slug}_noi-that`,
      url: `/design/ai/plan/${pid}/sheet-image?${planQs}&level=${level.level}`,
      group: 'mat-bang',
      optional: true,
      ext: 'png',
    });
  }
  if (input.facade) {
    const md = fileSlug(input.facade.name);
    const qs = `artifactId=${encodeURIComponent(input.facade.artifactId)}`;
    files.push(
      {
        path: `mat-dung/${pre}_${md}.svg`,
        url: `/design/ai/facade/${pid}/sheet?${qs}`,
        group: 'mat-dung',
        optional: false,
        ext: 'svg',
      },
      {
        path: `mat-dung/${pre}_${md}.dxf`,
        url: `/design/ai/facade/${pid}/dxf?${qs}`,
        group: 'mat-dung',
        optional: false,
        ext: 'dxf',
      },
      {
        path: `mat-dung/${pre}_${md}_vat-lieu`,
        url: `/design/ai/facade/${pid}/image?${qs}`,
        group: 'mat-dung',
        optional: true,
        ext: 'png',
      },
    );
  }
  if (input.imageSet) {
    const set = fileSlug(input.imageSet.name);
    const qs = `artifactId=${encodeURIComponent(input.imageSet.artifactId)}`;
    for (const view of input.imageSet.views) {
      files.push({
        path: `phoi-canh/${pre}_${set}_${fileSlug(view.label) || fileSlug(view.view)}`,
        url: `/design/ai/perspective/${pid}/view/${encodeURIComponent(view.view)}?${qs}`,
        group: 'phoi-canh',
        optional: true,
        ext: 'png',
      });
    }
  }
  return files;
}

/** Đuôi tệp theo loại máy chủ trả; tệp đã có đuôi thì giữ. */
export function withExtension(path: string, contentType: string | null, fallback: string): string {
  if (/\.(svg|dxf|png|jpe?g|webp)$/i.test(path)) return path;
  const type = (contentType ?? '').toLowerCase();
  const ext = type.includes('jpeg')
    ? 'jpg'
    : type.includes('webp')
      ? 'webp'
      : type.includes('png')
        ? 'png'
        : type.includes('svg')
          ? 'svg'
          : fallback;
  return `${path}.${ext}`;
}

/** Tờ «Đọc trước» đặt ở gốc gói — nói gói là gì, gồm gì, và không phải là gì. */
export function bundleReadme(input: {
  code: string | null | undefined;
  projectName: string | null | undefined;
  planName: string;
  facadeName: string | null;
  imageSetName: string | null;
  scoreLine: string | null;
  deductions: string[];
  files: string[];
  skipped: string[];
  createdAt: string;
  noCodeCheck: string;
}): string {
  const lines = [
    `Bộ kết quả AI Design — hồ sơ ${input.code ?? '(chưa có mã)'}`,
    input.projectName ? `Hồ sơ thiết kế: ${input.projectName}` : null,
    `Tải lúc: ${input.createdAt}`,
    '',
    'Đây là BẢN PHÁC THAM KHẢO do công cụ AI Design đề xuất, không phải hồ sơ phát hành. Mọi kích thước',
    'trên tờ vector đo được; ảnh do mô hình ảnh vẽ chỉ để trình bày, không đo được.',
    input.noCodeCheck,
    '',
    `Mặt bằng: ${input.planName}`,
    input.scoreLine ? `Điểm: ${input.scoreLine}` : null,
    ...(input.deductions.length
      ? ['Ba lý do trừ điểm lớn nhất:', ...input.deductions.map((d, i) => `  ${i + 1}. ${d}`)]
      : []),
    `Mặt đứng: ${input.facadeName ?? 'chưa có'}`,
    `Phối cảnh: ${input.imageSetName ?? 'chưa có'}`,
    '',
    'Các tệp trong gói:',
    ...input.files.map((f) => `  - ${f}`),
    ...(input.skipped.length
      ? ['', 'Chưa có, không đưa vào gói:', ...input.skipped.map((f) => `  - ${f}`)]
      : []),
    '',
  ];
  return lines.filter((l): l is string => l !== null).join('\r\n');
}
