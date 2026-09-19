/**
 * Đo đường đi trong nhà (`ai/circulation.ts`) và luật chặn đường vòng (T48, 16/09/2026).
 *
 * Ca gốc là mặt bằng Haan chấm «chưa đạt» ở lượt đo 58d9ff66: từ phòng khách muốn tới WC chung phải đi
 * qua sảnh ngoài rồi xuyên gara. Bộ kiểm cũ cho qua vì phòng nào cũng có cửa và phòng nào cũng tới được
 * từ lối vào — nên hai câu hỏi mới là «mấy cửa» và «có đường nào KHÔNG qua khu phục vụ không».
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFloorPlan } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { routesFrom } from '../ai/circulation';
import { planGraph } from '../ai/plan-check';
import { parseVocabulary, passageRules } from '../kb/vocabulary';
import { everydayRouteViolations } from '../ai/tree/passage';
import { TOWNHOUSE_PLAN } from './ai-plan-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const passage = passageRules(vocabulary)!;

describe('kb/room_vocabulary.yaml — luật đường đi hằng ngày', () => {
  it('khai đủ ba danh sách, và gara không bao giờ là đường đi trong nhà', () => {
    expect(passage.notARoute.has('garage')).toBe(true);
    expect(passage.notARoute.has('porch')).toBe(true);
    expect(passage.everyday.has('wc')).toBe(true);
    // Chỗ xuất phát là nơi cả nhà ngồi — KHÔNG phải hành lang, vì hành lang là đường, không phải chỗ ở.
    expect(passage.everydayFrom.has('living')).toBe(true);
    expect(passage.everydayFrom.has('circulation')).toBe(false);
  });
});

describe('routesFrom — mấy cửa, mấy mét', () => {
  const graph = planGraph(TOWNHOUSE_PLAN as AiFloorPlan);
  const living = (TOWNHOUSE_PLAN as AiFloorPlan).levels[0]!.rooms.find(
    (room) => room.type === 'living',
  )!;

  it('phòng xuất phát cách chính nó 0 cửa, 0 mét', () => {
    const routes = routesFrom(graph, [living.id]);
    expect(routes.get(living.id)).toMatchObject({ doors: 0, metres: 0 });
  });

  it('mọi phòng tới được đều có số cửa ≥ 1 và quãng đường > 0, đường đi kể cả hai đầu', () => {
    const routes = routesFrom(graph, [living.id]);
    for (const [id, route] of routes) {
      if (id === living.id) continue;
      expect(route.doors, id).toBeGreaterThanOrEqual(1);
      expect(route.metres, id).toBeGreaterThan(0);
      expect(route.via[0]).toBe(living.id);
      expect(route.via[route.via.length - 1]).toBe(id);
    }
  });

  it('cấm đi qua một phòng thì đường qua phòng ấy biến mất', () => {
    const routes = routesFrom(graph, [living.id]);
    const far = [...routes.entries()].sort((p, q) => q[1].metres - p[1].metres)[0]!;
    const middle = far[1].via[1]!;
    const blocked = routesFrom(graph, [living.id], { forbidden: new Set([middle]) });
    expect(blocked.has(middle)).toBe(false);
    const after = blocked.get(far[0]);
    if (after) expect(after.metres).toBeGreaterThanOrEqual(far[1].metres);
  });

  it('tất định: gọi hai lần ra đúng một kết quả', () => {
    expect(JSON.stringify([...routesFrom(graph, [living.id])])).toBe(
      JSON.stringify([...routesFrom(graph, [living.id])]),
    );
  });
});

describe('everydayRouteViolations — đường tới WC không được xuyên gara', () => {
  /** Tôpô của tầng 1 lượt đo 58d9ff66: khách → sảnh → thang → gara → hành lang → WC chung. */
  const base = {
    starts: ['porch_1'],
    entries: new Set(['porch_1', 'garage_1']),
    typesOf: new Map([
      ['porch_1', new Set(['porch'])],
      ['living_1', new Set(['living'])],
      ['stair_1', new Set(['stair'])],
      ['garage_1', new Set(['garage'])],
      ['circulation_1', new Set(['circulation'])],
      ['wc_1', new Set(['wc'])],
    ]),
    parentOf: new Map<string, string>(),
    noDoorRequired: new Set<string>(),
    rules: passage,
    shared: passage.everydayFrom,
  };
  const links: [string, string][] = [
    ['porch_1', 'living_1'],
    ['porch_1', 'stair_1'],
    ['stair_1', 'garage_1'],
    ['garage_1', 'circulation_1'],
    ['circulation_1', 'wc_1'],
  ];

  it('bắt đúng WC chung chỉ tới được bằng cách đi xuyên gara', () => {
    const found = everydayRouteViolations({ ...base, links });
    expect(found.map((entry) => entry.room)).toContain('wc_1');
    expect(found.find((entry) => entry.room === 'wc_1')?.via).toBe('garage_1');
  });

  it('nối hành lang vào phòng khách và vào thang thì hết lỗi', () => {
    const fixed = everydayRouteViolations({
      ...base,
      links: [...links, ['living_1', 'circulation_1'], ['circulation_1', 'stair_1']],
    });
    expect(fixed).toEqual([]);
  });

  it('chỉ nối hành lang vào phòng khách thì WC hết lỗi nhưng THANG vẫn kẹt sau gara', () => {
    const half = everydayRouteViolations({
      ...base,
      links: [...links, ['living_1', 'circulation_1']],
    });
    expect(half.map((entry) => entry.room)).toEqual(['stair_1']);
  });

  it('WC khép kín của phòng ngủ không bị xét — đi qua phòng mẹ là đúng', () => {
    const ensuite = everydayRouteViolations({
      ...base,
      typesOf: new Map([...base.typesOf, ['bedroom_1', new Set(['bedroom'])]]),
      parentOf: new Map([['wc_1', 'bedroom_1']]),
      links: [...links, ['living_1', 'bedroom_1'], ['bedroom_1', 'wc_1']],
    });
    expect(ensuite.map((entry) => entry.room)).not.toContain('wc_1');
  });

  it('tầng không có khu phục vụ nào thì không xét gì', () => {
    const noService = everydayRouteViolations({
      ...base,
      typesOf: new Map([
        ['living_1', new Set(['living'])],
        ['wc_1', new Set(['wc'])],
      ]),
      links: [['living_1', 'wc_1']],
    });
    expect(noService).toEqual([]);
  });
});
