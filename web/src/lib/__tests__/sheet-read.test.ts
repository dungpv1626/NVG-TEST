import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { parseCsv, parseXlsx } from '../sheet-read';

function xlsx(sheet: string, shared: string[]): Uint8Array {
  const zip = new PizZip();
  zip.file(
    'xl/workbook.xml',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Đầu mối" sheetId="1" r:id="rId7"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Target="worksheets/dau-moi.xml"/></Relationships>',
  );
  zip.file(
    'xl/sharedStrings.xml',
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t>${s}</t></si>`).join('')}<si><r><t>Trần </t></r><r><t>Bình</t></r></si></sst>`,
  );
  zip.file(
    'xl/worksheets/dau-moi.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`,
  );
  return zip.generate({ type: 'uint8array' });
}

describe('Đọc bảng tính', () => {
  it('xlsx: trang tính đầu theo quan hệ, chuỗi dùng chung / có định dạng / tại chỗ, số, ô trống giữa dòng', () => {
    const data = xlsx(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>912345678</v></c></row>' +
        '<row r="4"><c r="A4" t="inlineStr"><is><t>Lê Cường</t></is></c><c r="B4" t="b"><v>1</v></c></row>',
      ['Họ tên', 'SĐT'],
    );
    expect(parseXlsx(data)).toEqual([
      ['Họ tên', 'SĐT'],
      ['Trần Bình', '', '912345678'],
      [],
      ['Lê Cường', 'TRUE'],
    ]);
  });

  it('csv: dấu chấm phẩy của Excel tiếng Việt, nháy kép, xuống dòng trong ô, BOM', () => {
    expect(parseCsv('﻿Họ tên;SĐT\r\n"Nguyễn ""An""";0912\n"Dòng\nhai";\n')).toEqual([
      ['Họ tên', 'SĐT'],
      ['Nguyễn "An"', '0912'],
      ['Dòng\nhai', ''],
    ]);
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
