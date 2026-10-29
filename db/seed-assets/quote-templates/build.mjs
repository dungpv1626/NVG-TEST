/**
 * Dựng bộ mẫu Word BÁO GIÁ mặc định cho ba pháp nhân (migration 0239). Mẫu DEMO — NVG thay bằng mẫu chính thức
 * (tải lên ở trang Mẫu hợp đồng, loại «Báo giá»).
 *
 * Chạy: `node db/seed-assets/quote-templates/build.mjs` rồi `npm run db:seed`. Tệp ra cùng thư mục
 * (`<MÃ>/<MÃ>-BG-01_Bao_gia.docx` + `manifest.json`); `sha` = băm nội dung văn bản → seed đặt tên tệp theo băm,
 * đổi mẫu thì ngừng bản cũ, nạp bản mới (như bộ mẫu hợp đồng 0185).
 *
 * Chỗ trống theo `QUOTE_TEMPLATE_FIELDS` (shared/src/quote-items.ts); bảng lặp `{#hang_muc}…{/hang_muc}`.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import PizZip from 'pizzip';

const HERE = new URL('./', import.meta.url);
const LOGO = readFileSync(new URL('../../../web/public/brand/nvg-logo.png', import.meta.url));
const FIXED_DATE = new Date('2026-10-29T00:00:00Z');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function run(text, o = {}) {
  const pr = [
    o.bold ? '<w:b/>' : '',
    o.italic ? '<w:i/>' : '',
    o.color ? `<w:color w:val="${o.color}"/>` : '',
    o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : '',
  ].join('');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/** `parts`: chuỗi hoặc [chuỗi, kiểu]. */
function para(parts, o = {}) {
  const runs = (Array.isArray(parts) ? parts : [parts])
    .map((p) => (Array.isArray(p) ? run(p[0], { ...o.run, ...p[1] }) : run(p, o.run)))
    .join('');
  const pPr = [
    o.align ? `<w:jc w:val="${o.align}"/>` : '',
    o.after !== undefined ? `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after}"/>` : '',
    o.rule
      ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="1F5C3A"/></w:pBdr>'
      : '',
    o.keepNext ? '<w:keepNext/>' : '',
  ].join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
}

function cell(content, o = {}) {
  const shade = o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : '';
  const borders = o.noBorder
    ? '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>'
    : '';
  const span = o.span ? `<w:gridSpan w:val="${o.span}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${o.w ?? 0}" w:type="${o.w ? 'dxa' : 'auto'}"/>${span}${borders}${shade}<w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`;
}

const BORDERS =
  '<w:tblBorders>' +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="8A9A90"/>`)
    .join('') +
  '</w:tblBorders>';

function table(widths, rows, o = {}) {
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const borders = o.noBorder
    ? '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>'
    : BORDERS;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid}${rows.join('')}</w:tbl>`;
}

const row = (cells, o = {}) =>
  `<w:tr>${o.header ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells.join('')}</w:tr>`;

const LOGO_DRAWING =
  '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
  '<wp:extent cx="1296000" cy="727200"/><wp:docPr id="1" name="Logo NVG"/>' +
  '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
  '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
  '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
  '<pic:nvPicPr><pic:cNvPr id="1" name="nvg-logo.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
  '<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
  '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1296000" cy="727200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
  '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

function body() {
  const W = 9638; // khổ A4 trừ lề 2 cm hai bên, đơn vị twip
  const head = table(
    [2200, W - 2200],
    [
      row([
        cell(`<w:p>${LOGO_DRAWING}</w:p>`, { w: 2200, noBorder: true }),
        cell(
          [
            para([['{nvg_ten}', { bold: true, size: 26, color: '1F5C3A' }]], { after: 40 }),
            para('Địa chỉ: {nvg_dia_chi}', { after: 20, run: { size: 20 } }),
            para('Mã số thuế: {nvg_ma_so_thue} · Điện thoại: {nvg_dien_thoai}', {
              after: 20,
              run: { size: 20 },
            }),
            para('Email: {nvg_email}', { after: 0, run: { size: 20 } }),
          ].join(''),
          { w: W - 2200, noBorder: true },
        ),
      ]),
    ],
    { noBorder: true },
  );
  const items = table(
    [600, 3700, 900, 1200, 1500, 1738],
    [
      row(
        ['STT', 'Hạng mục', 'Đơn vị', 'Khối lượng', 'Đơn giá (đồng)', 'Thành tiền (đồng)'].map(
          (h) =>
            cell(para([[h, { bold: true, color: 'FFFFFF' }]], { align: 'center', after: 0 }), {
              fill: '1F5C3A',
            }),
        ),
        { header: true },
      ),
      row([
        cell(para('{#hang_muc}{stt}', { align: 'center', after: 0 })),
        cell(para('{noi_dung}', { after: 0 })),
        cell(para('{don_vi}', { align: 'center', after: 0 })),
        cell(para('{khoi_luong}', { align: 'right', after: 0 })),
        cell(para('{don_gia}', { align: 'right', after: 0 })),
        cell(para('{thanh_tien}{/hang_muc}', { align: 'right', after: 0 })),
      ]),
    ],
  );
  const sumRow = (label, value, strong = false) =>
    row([
      cell(para([[label, { bold: strong }]], { align: 'right', after: 0 }), { w: 6400, span: 1 }),
      cell(para([[value, { bold: strong }]], { align: 'right', after: 0 }), {
        w: W - 6400,
        fill: strong ? 'E8F0EA' : undefined,
      }),
    ]);
  const sums = table(
    [6400, W - 6400],
    [
      sumRow('Tổng các hạng mục', '{tong_hang_muc}'),
      sumRow('Giảm giá', '{giam_gia}'),
      sumRow('Thuế giá trị gia tăng ({thue_suat})', '{tien_thue}'),
      sumRow('Tổng cộng', '{tong_cong}', true),
    ],
  );
  const signer = table(
    [W / 2, W / 2],
    [
      row([
        cell(
          [
            para([['Người lập báo giá', { bold: true }]], { align: 'center', after: 900 }),
            para([['{nguoi_lap}', { bold: true }]], { align: 'center', after: 0 }),
            para('Điện thoại: {nguoi_lap_dien_thoai}', {
              align: 'center',
              after: 0,
              run: { size: 20 },
            }),
          ].join(''),
          { w: W / 2, noBorder: true },
        ),
        cell(
          [
            para([['Đại diện {nvg_ten_ngan}', { bold: true }]], { align: 'center', after: 0 }),
            para([['{chuc_vu_ky}', {}]], { align: 'center', after: 0 }),
            para([['(Ký, ghi rõ họ tên, đóng dấu)', { italic: true, size: 20 }]], {
              align: 'center',
              after: 700,
            }),
            para([['{nguoi_ky}', { bold: true }]], { align: 'center', after: 0 }),
          ].join(''),
          { w: W / 2, noBorder: true },
        ),
      ]),
    ],
    { noBorder: true },
  );
  return [
    head,
    para('', { rule: true, after: 120 }),
    para([['BẢNG BÁO GIÁ', { bold: true, size: 34, color: '1F5C3A' }]], {
      align: 'center',
      after: 40,
    }),
    para('Số: {so_bao_gia} (phiên bản {phien_ban}) — Ngày {ngay_bao_gia}', {
      align: 'center',
      after: 200,
    }),
    para([['Kính gửi: ', { bold: true }], '{khach_ten_day_du}'], { after: 40 }),
    para('Địa chỉ: {khach_dia_chi}', { after: 40 }),
    para('Điện thoại: {khach_dien_thoai} · Email: {khach_email}', { after: 40 }),
    para([['Công trình / nội dung: ', { bold: true }], '{ten_cong_trinh}'], { after: 160 }),
    para('{gioi_thieu}', { after: 120 }),
    items,
    para('', { after: 60 }),
    sums,
    para(
      [
        ['Bằng chữ: ', { bold: true }],
        ['{tong_cong_bang_chu}.', { italic: true }],
      ],
      { before: 80, after: 40 },
    ),
    para([['{ghi_chu_thue}', { italic: true, size: 20 }]], { after: 160 }),
    para([['Phạm vi và điều kiện', { bold: true, color: '1F5C3A' }]], {
      after: 40,
      keepNext: true,
    }),
    para('{dieu_kien}', { after: 120 }),
    para([['Điều kiện thanh toán', { bold: true, color: '1F5C3A' }]], {
      after: 40,
      keepNext: true,
    }),
    para('{dieu_khoan_thanh_toan}', { after: 120 }),
    para([['Thời gian thực hiện', { bold: true, color: '1F5C3A' }]], { after: 40, keepNext: true }),
    para('{thoi_gian_thuc_hien}', { after: 120 }),
    para([['Hiệu lực báo giá', { bold: true, color: '1F5C3A' }]], { after: 40, keepNext: true }),
    para(
      'Báo giá có hiệu lực đến hết ngày {hieu_luc}. Sau thời hạn này, đơn giá có thể được điều chỉnh theo thị trường.',
      { after: 120 },
    ),
    para('{ghi_chu_cuoi}', { after: 240 }),
    signer,
  ].join('');
}

const FOOTER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  para(
    [
      [
        'Mẫu văn bản DEMO của hệ thống — NVG thay bằng mẫu chính thức. ',
        { size: 16, color: '8A9A90' },
      ],
      ['Báo giá {so_bao_gia}', { size: 16, color: '8A9A90' }],
    ],
    { align: 'center', after: 0 },
  ) +
  '</w:ftr>';

function buildDocx() {
  const zip = new PizZip();
  const add = (name, data) => zip.file(name, data, { date: FIXED_DATE });
  add(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '</Types>',
  );
  add(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  add(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/nvg-logo.png"/>' +
      '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      '</Relationships>',
  );
  add('word/media/nvg-logo.png', LOGO);
  add(
    'word/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
      '<w:color w:val="1D2A22"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults></w:styles>',
  );
  add('word/footer1.xml', FOOTER);
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    `<w:body>${body()}<w:sectPr><w:footerReference w:type="default" r:id="rIdFtr"/>` +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1000" w:right="1134" w:bottom="1000" w:left="1134" w:header="567" w:footer="500" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';
  add('word/document.xml', xml);
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return {
    buffer,
    sha: createHash('sha256')
      .update(xml + FOOTER)
      .digest('hex')
      .slice(0, 16),
    xml,
  };
}

const TAGS = (() => {
  const keys = [
    'nvg_ten',
    'nvg_ten_ngan',
    'nvg_dia_chi',
    'nvg_ma_so_thue',
    'nvg_dien_thoai',
    'nvg_email',
    'so_bao_gia',
    'phien_ban',
    'ngay_bao_gia',
    'khach_ten_day_du',
    'khach_dia_chi',
    'khach_dien_thoai',
    'khach_email',
    'ten_cong_trinh',
    'tong_hang_muc',
    'giam_gia',
    'thue_suat',
    'tien_thue',
    'tong_cong',
    'tong_cong_bang_chu',
    'ghi_chu_thue',
    'dieu_kien',
    'dieu_khoan_thanh_toan',
    'hieu_luc',
    'nguoi_lap',
    'gioi_thieu',
    'thoi_gian_thuc_hien',
    'ghi_chu_cuoi',
    'nguoi_ky',
    'chuc_vu_ky',
    'nguoi_lap_dien_thoai',
  ];
  const tags = Object.fromEntries(keys.map((k) => [k, {}]));
  tags.hang_muc = {
    stt: {},
    noi_dung: {},
    don_vi: {},
    khoi_luong: {},
    don_gia: {},
    thanh_tien: {},
  };
  return tags;
})();

for (const code of ['NVC', 'NVO', 'NVS']) {
  const dir = new URL(`${code}/`, HERE);
  mkdirSync(dir, { recursive: true });
  const { buffer, sha } = buildDocx();
  const file = `${code}-BG-01_Bao_gia.docx`;
  writeFileSync(new URL(file, dir), buffer);
  // Bản ví dụ cho trang Mẫu hợp đồng («Tải mẫu báo giá ví dụ», 0240) — cùng nội dung ba pháp nhân.
  if (code === 'NVC') {
    const sampleDir = new URL('../../../web/public/mau/', import.meta.url);
    mkdirSync(sampleDir, { recursive: true });
    writeFileSync(new URL('bao-gia-vi-du.docx', sampleDir), buffer);
  }
  const manifest = [
    {
      file,
      code: `${code}-BG-01`,
      title: `${code}-BG-01 — Báo giá gửi khách (mẫu DEMO)`,
      contract_type: null,
      document_kind: 'bao_gia',
      tags: TAGS,
      free_fields: [],
      options: [],
      sha,
      notes: 'Mẫu DEMO do hệ thống dựng (0239) — NVG thay bằng mẫu báo giá chính thức.',
    },
  ];
  writeFileSync(new URL('manifest.json', dir), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${code}: ${file} (${buffer.length} byte, sha ${sha})`);
}
