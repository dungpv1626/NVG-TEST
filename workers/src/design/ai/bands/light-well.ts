/**
 * Giếng trời là phần tử đứng cố định do CHƯƠNG TRÌNH giữ, như ô thang (handoff sửa lỗi đợt 3 mục 2). Lượt thật affaf12b:
 * mô hình tự khai giếng ở từng tầng — tầng 3 chiếm trọn cột cạnh thang, các tầng khác nửa sau cột — sinh lỗi giếng trời
 * ở lời gọi 1 và 4, kéo lời gọi 2 sửa sai; phần «giếng thừa» tầng 3 là một lỗ sàn có mái che, vô nghĩa.
 *
 * Mốc là ô giếng ở tầng THẤP NHẤT có giếng: cột của nó tính theo ô thang (cùng dải thang) và vị trí trong ô xếp chồng. Ở
 * mỗi tầng trên, trong dải thang:
 *  - `LW` hay một mã giếng trời khác → đúng mã giếng mốc;
 *  - ô cùng cột không có giếng (mô hình chỉ viết phòng còn lại, vd. `wc_2`) → chương trình chèn giếng vào đúng chỗ trong ô
 *    xếp chồng như tầng mốc (`wc_2/light_well_1`);
 *  - ô cùng cột CHỈ là giếng mà tầng mốc giếng chỉ chiếm một phần cột → phần còn lại thành một mẩu hành lang nối sảnh;
 *  - giếng mô hình đặt chỗ khác trên tầng trên → bỏ khỏi chỗ ấy (ô đứng riêng thành mẩu hành lang).
 * Mọi chỗ đổi ghi lại; KHÔNG báo lỗi cho mô hình. Giếng mốc không nằm trong dải thang thì chỉ đổi mã. Hàm thuần.
 */
import type { AiHouseBands } from '@nvg/shared/design';

type Storey = AiHouseBands['storeys'][number];
type Cell = Storey['bands'][number]['cells'][number];

export const LIGHT_WELL_TOKEN = 'LW';

const partsOf = (cell: Cell) => (cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id]);

export function pinLightWell(
  bands: AiHouseBands,
  typeOf: (id: string) => string | null,
  stairToken: string,
  corridorPrefix: string | null,
): { bands: AiHouseBands; notes: string[] } {
  const notes: string[] = [];
  const isWell = (id: string) => id === LIGHT_WELL_TOKEN || typeOf(id) === 'light_well';
  const levelNo = (s: Storey) =>
    /^\d+$/.test(s.level) ? Number(s.level) : Number.POSITIVE_INFINITY;
  const order = [...bands.storeys]
    .filter((s) => s.level !== 'roof')
    .sort((a, b) => levelNo(a) - levelNo(b));
  const stairAt = (storey: Storey) => {
    const b = storey.bands.findIndex((band) =>
      band.cells.some((cell) => partsOf(cell).includes(stairToken)),
    );
    const c =
      b >= 0 ? storey.bands[b]!.cells.findIndex((cell) => partsOf(cell).includes(stairToken)) : -1;
    return { b, c };
  };
  // Mốc: tầng thấp nhất có một mã giếng thật (không phải `LW`).
  type Anchor = { level: string; id: string; offset: number | null; parts: string[]; at: number };
  const found: { anchor: Anchor | null } = { anchor: null };
  for (const storey of order) {
    const stair = stairAt(storey);
    for (let b = 0; b < storey.bands.length && !found.anchor; b += 1) {
      const cells = storey.bands[b]!.cells;
      for (let c = 0; c < cells.length && !found.anchor; c += 1) {
        const parts = partsOf(cells[c]!);
        const at = parts.findIndex((id) => id !== LIGHT_WELL_TOKEN && typeOf(id) === 'light_well');
        if (at < 0) continue;
        found.anchor = {
          level: storey.level,
          id: parts[at]!,
          offset: b === stair.b && stair.c >= 0 ? c - stair.c : null,
          parts,
          at,
        };
      }
    }
    if (found.anchor) break;
  }
  const anchor = found.anchor;
  if (!anchor) return { bands, notes };
  const { level: baseLevel, id: wellId, offset, parts: baseParts, at: baseAt } = anchor;
  const ext = (level: string, n: number) =>
    corridorPrefix ? `${corridorPrefix}_lw${level}${n ? `_${n}` : ''}` : '.';

  const storeys = bands.storeys.map((storey) => {
    if (storey.level === 'roof' || levelNo(storey) <= levelNo({ level: baseLevel, bands: [] }))
      return storey;
    const stair = stairAt(storey);
    const target = offset !== null && stair.b >= 0 ? stair.c + offset : null;
    let extN = 0;
    const next: Storey = {
      ...storey,
      bands: storey.bands.map((band, b) => ({
        ...band,
        cells: band.cells.map((cell, c) => {
          const parts = partsOf(cell);
          const pinned = b === stair.b && c === target;
          if (!pinned) {
            if (!parts.some(isWell)) return cell;
            // Giếng mô hình đặt chỗ khác: bỏ khỏi chỗ ấy khi đã có cột mốc; không có cột mốc thì chỉ đổi mã.
            if (target === null) return renameWells(cell, isWell, wellId);
            notes.push(
              `Tầng ${storey.level}: giếng trời ngoài cột tầng ${baseLevel} — chương trình bỏ khỏi chỗ ấy.`,
            );
            const kept = parts.filter((id) => !isWell(id));
            if (kept.length)
              return {
                ...cell,
                id: kept.length === 1 && !cell.stack.length ? kept[0]! : '',
                stack: cell.stack.length ? cell.stack.filter((s) => !isWell(s.id)) : [],
              };
            return { ...cell, id: ext(storey.level, (extN += 1)), stack: [] };
          }
          const rooms = parts.filter((id) => !isWell(id) && id !== '.');
          // Dựng lại ô theo khuôn tầng mốc: giếng đúng vị trí, phần còn lại là phòng mô hình viết (hay mẩu hành lang).
          const rebuilt: string[] = [];
          let k = 0;
          baseParts.forEach((_, i) => {
            if (i === baseAt) rebuilt.push(wellId);
            else if (k < rooms.length) rebuilt.push(rooms[k++]!);
            else rebuilt.push(ext(storey.level, extN++));
          });
          while (k < rooms.length) rebuilt.push(rooms[k++]!);
          const same = rebuilt.length === parts.length && rebuilt.every((id, i) => id === parts[i]);
          if (same) return cell;
          notes.push(
            `Tầng ${storey.level}: giếng trời đặt đúng chỗ tầng ${baseLevel} (cột cạnh thang: ${rebuilt.join(' / ')}).`,
          );
          return rebuilt.length === 1
            ? { ...cell, id: rebuilt[0]!, stack: [] }
            : { ...cell, id: '', stack: rebuilt.map((id) => ({ id, d: 0 })) };
        }),
      })),
    };
    return next;
  });
  return { bands: { ...bands, storeys }, notes: [...new Set(notes)] };
}

function renameWells(cell: Cell, isWell: (id: string) => boolean, wellId: string): Cell {
  if (cell.stack.length)
    return { ...cell, stack: cell.stack.map((s) => (isWell(s.id) ? { ...s, id: wellId } : s)) };
  return isWell(cell.id) ? { ...cell, id: wellId } : cell;
}
