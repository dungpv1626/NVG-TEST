/** Loại nhà suy từ đầu bài (T116, Haan chốt 04/10/2026). */
import { describe, expect, it } from 'vitest';
import { houseProfile, houseProfileLabel, type HouseProfileInput } from '../design/house-profile';

const pho = (
  site: HouseProfileInput['site'],
  extra: Partial<HouseProfileInput> = {},
): HouseProfileInput => ({
  building_type: 'nha_pho',
  site,
  ...extra,
});
const NEIGHBOURS = {
  left: 'nha_hang_xom',
  right: 'nha_hang_xom',
  back: 'nha_hang_xom',
  front: 'duong_lon',
};

describe('houseProfile', () => {
  it('nhà ống demo 5 × 18 m, lùi sau 1,5 m: khối 5 × 16,5 m, hai bên giáp nhà → nhà ống', () => {
    const r = houseProfile(
      pho({ width_m: 5, depth_m: 18, adjacent: NEIGHBOURS, setback_required_m: { back: 1.5 } }),
    );
    expect(r).toMatchObject({
      profile: 'ong',
      kd: false,
      source: 'auto',
      block: { width_m: 5, depth_m: 16.5 },
    });
  });

  it('xét theo KHỐI XÂY, không theo lô: lô 7 m lùi hai bên 0,6 m còn 5,8 m → nhà ống', () => {
    expect(
      houseProfile(
        pho({
          width_m: 7,
          depth_m: 20,
          adjacent: { left: 'nha_hang_xom' },
          setback_required_m: { left: 0.6, right: 0.6 },
        }),
      ).profile,
    ).toBe('ong');
    expect(houseProfile(pho({ width_m: 8, depth_m: 20, adjacent: NEIGHBOURS })).profile).toBe(
      'pho',
    );
  });

  it('khối 5 m mà sâu dưới 2 lần bề rộng → nhà phố', () => {
    expect(houseProfile(pho({ width_m: 5, depth_m: 9, adjacent: NEIGHBOURS })).profile).toBe('pho');
  });

  it('lô góc hẹp (một bên hẻm, một bên nhà) vẫn là nhà ống; hai bên đều giáp đường thì không', () => {
    expect(
      houseProfile(
        pho({ width_m: 5, depth_m: 15, adjacent: { left: 'hem_3m', right: 'nha_hang_xom' } }),
      ).profile,
    ).toBe('ong');
    expect(
      houseProfile(
        pho({ width_m: 5, depth_m: 15, adjacent: { left: 'hem_3m', right: 'duong_lon' } }),
      ).profile,
    ).toBe('pho');
  });

  it('chưa khai mặt bên mà xây sát ranh → tính là kín', () => {
    expect(houseProfile(pho({ width_m: 4, depth_m: 16 })).profile).toBe('ong');
  });

  it('KTS ghi đè thắng mọi suy diễn; giá trị lạ bị bỏ qua', () => {
    const tube = pho({ width_m: 5, depth_m: 18, adjacent: NEIGHBOURS });
    expect(houseProfile({ ...tube, house_profile_override: 'pho' })).toMatchObject({
      profile: 'pho',
      source: 'override',
    });
    expect(houseProfile({ ...tube, house_profile_override: 'xyz' }).profile).toBe('ong');
  });

  it('kinh doanh mặt tiền ghép với loại nhà; biệt thự, nhà vườn theo loại hình', () => {
    const r = houseProfile(
      pho(
        { width_m: 5, depth_m: 18, adjacent: NEIGHBOURS },
        { household: { home_business: { mode: 'cua_hang_mat_tien' } } },
      ),
    );
    expect(r).toMatchObject({ profile: 'ong', kd: true });
    expect(houseProfileLabel(r)).toBe('Nhà ống, kết hợp kinh doanh');
    expect(
      houseProfile({ building_type: 'biet_thu', site: { width_m: 5, depth_m: 30 } }).profile,
    ).toBe('bt');
    expect(houseProfile({ building_type: 'nha_vuon' }).profile).toBe('vuon');
  });
});
