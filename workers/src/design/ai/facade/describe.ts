/**
 * Ý tưởng mặt đứng nói bằng CHỮ tiếng Việt — nhãn lấy từ `kb/facade_vocabulary.yaml`.
 *
 * Tờ mặt đứng là bản vẽ đơn sắc, nên vật liệu và màu phải ghi bằng chữ: một dòng ghi chú in dưới
 * tờ SVG và trong tệp DXF. Mã không có trong danh mục (danh mục vừa sửa, artifact cũ) thì in
 * nguyên mã — thà lộ mã còn hơn in trống.
 */

import type { AiFacadeBrief, AiFacadeConcept } from '@nvg/shared/design';
import type { FacadeVocabulary } from '../../kb/facade-vocabulary';

type Materials = AiFacadeConcept['materials'];

function label(table: Record<string, { label_vi: string }>, code: unknown): string {
  return typeof code === 'string' ? (table[code]?.label_vi ?? code) : '';
}

/** «Sơn nước ngoại thất, trắng kem» — vật liệu kèm màu, màu viết thường. */
export function materialPhrase(
  vocab: FacadeVocabulary,
  material: unknown,
  colour: unknown,
  table: Record<string, { label_vi: string }> = vocab.materials,
): string {
  const colourText = label(vocab.colours, colour);
  return [label(table, material), colourText.toLocaleLowerCase('vi')].filter(Boolean).join(', ');
}

export interface LegendEntry {
  /** Mã của dòng — vùng vật liệu (`body`, `main_door`…), `roof`, `railing_type` hay kiểu cửa. */
  key: string;
  label: string;
  value: string;
}

/**
 * Bảng vật liệu: mái, rồi từng vùng theo thứ tự mô hình khai, cuối cùng lan can ban công. Tờ SVG in
 * mỗi mục thành một ô khung tên; tệp DXF in mỗi mục thành một dòng dưới hình.
 */
export function facadeLegend(concept: AiFacadeConcept, vocab: FacadeVocabulary): LegendEntry[] {
  const roofType = vocab.roofTypes[concept.roof.type] ?? concept.roof.type;
  const roof = materialPhrase(
    vocab,
    concept.roof.material,
    concept.roof.colour,
    vocab.roofMaterials,
  ).toLocaleLowerCase('vi');
  const railing = concept.balconies?.find((b) => b.railing)?.railing;
  return [
    { key: 'roof', label: 'Mái', value: `${roofType}, ${roof}` },
    ...zoneEntries(concept.materials, vocab),
    ...openingStyleEntries(concept, vocab),
    ...(railing
      ? [{ key: 'railing_type', label: 'Lan can ban công', value: label(vocab.railings, railing) }]
      : []),
  ];
}

/** Bảng vật liệu gộp một dòng — «Mái: mái bằng, … · Thân nhà: …». */
export function facadeNote(concept: AiFacadeConcept, vocab: FacadeVocabulary): string {
  return facadeLegend(concept, vocab)
    .map((entry) => `${entry.label}: ${entry.value.toLocaleLowerCase('vi')}`)
    .join(' · ');
}

/** Vùng cửa lấy nhãn vật liệu từ nhóm `door_materials`. */
const DOOR_ZONES = new Set(['main_door', 'side_door', 'window', 'garage_door']);

function zoneEntries(materials: Materials, vocab: FacadeVocabulary): LegendEntry[] {
  return materials.map((m) => ({
    key: m.where,
    label: vocab.zones[m.where] ?? m.where,
    value: materialPhrase(
      vocab,
      m.material,
      m.colour,
      DOOR_ZONES.has(m.where) ? vocab.doorMaterials : vocab.materials,
    ),
  }));
}

/** Kiểu cửa theo phiếu yêu cầu — mỗi mục đã chọn một dòng. */
function openingStyleEntries(concept: AiFacadeConcept, vocab: FacadeVocabulary): LegendEntry[] {
  const style = concept.openings_style;
  if (!style) return [];
  const rows: Array<
    [string, string, Record<string, { label_vi: string }>, string | null | undefined]
  > = [
    ['main_door_type', 'Kiểu cửa chính', vocab.doorTypes, style.main_door_type],
    ['side_door_type', 'Kiểu cửa phụ', vocab.doorTypes, style.side_door_type],
    ['glass', 'Kính cửa sổ', vocab.glassTypes, style.glass],
    ['garage_door_type', 'Kiểu cửa để xe', vocab.garageDoorTypes, style.garage_door_type],
  ];
  return rows
    .filter(([, , , code]) => Boolean(code))
    .map(([key, title, table, code]) => ({ key, label: title, value: label(table, code) }));
}

/**
 * Dòng nào của bảng vật liệu do KỸ SƯ chọn trong phiếu (chương trình đã áp thẳng) — để màn hình tách
 * «theo yêu cầu kỹ sư» khỏi «AI đề xuất». Một dòng tính là của kỹ sư khi phiếu điền ít nhất một phần.
 */
export function briefKeys(brief: AiFacadeBrief | null): Set<string> {
  const keys = new Set<string>();
  if (!brief) return keys;
  const any = (...values: unknown[]) => values.some((v) => v !== null && v !== undefined);
  if (any(brief.roof.type, brief.roof.material, brief.roof.colour)) keys.add('roof');
  for (const zone of ['body', 'base', 'accent', 'trim'] as const) {
    if (any(brief.surfaces[zone].material, brief.surfaces[zone].colour)) keys.add(zone);
  }
  if (any(brief.main_door.material, brief.main_door.colour)) keys.add('main_door');
  if (any(brief.side_door.material, brief.side_door.colour)) keys.add('side_door');
  if (any(brief.window.material, brief.window.colour)) keys.add('window');
  if (any(brief.garage_door.material, brief.garage_door.colour)) keys.add('garage_door');
  if (any(brief.balcony.colour) || any(brief.balcony.material)) keys.add('railing');
  if (any(brief.balcony.railing)) keys.add('railing_type');
  if (any(brief.gate.material, brief.gate.colour)) keys.add('gate');
  if (any(brief.fence.material, brief.fence.colour)) keys.add('fence');
  if (any(brief.main_door.type)) keys.add('main_door_type');
  if (any(brief.side_door.type)) keys.add('side_door_type');
  if (any(brief.window.glass)) keys.add('glass');
  if (any(brief.garage_door.type)) keys.add('garage_door_type');
  return keys;
}
