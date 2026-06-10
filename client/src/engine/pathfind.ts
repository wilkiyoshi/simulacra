/**
 * pathfind.ts
 * -----------
 * Busca A* na grade de tiles, usada pelos digital twins para caminhar pelas
 * calçadas até um destino, respeitando colisões (não cruza prédios). O tile
 * de destino pode ser opcionalmente permitido mesmo se "bloqueado" — usado
 * para entrar no imóvel ao final do trajeto.
 */
import { cityMap, type Tile } from '../city/map';

const key = (x: number, y: number) => `${x},${y}`;

function passable(x: number, y: number, goal: Tile, allowGoal: boolean): boolean {
  if (allowGoal && x === goal.x && y === goal.y) return true;
  return cityMap.isWalkable(x, y);
}

/** Retorna a lista de tiles (excluindo o início) até o destino, ou null. */
export function findPath(start: Tile, goal: Tile, allowGoalBlocked = false): Tile[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];

  const open = new Set<string>([key(start.x, start.y)]);
  const cameFrom = new Map<string, string>();
  const g = new Map<string, number>([[key(start.x, start.y), 0]]);
  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const f = new Map<string, number>([[key(start.x, start.y), h(start.x, start.y)]]);

  let guard = 0;
  while (open.size > 0 && guard++ < 4000) {
    let curKey = '';
    let best = Infinity;
    for (const k of open) {
      const fv = f.get(k) ?? Infinity;
      if (fv < best) {
        best = fv;
        curKey = k;
      }
    }
    const [cx, cy] = curKey.split(',').map(Number);
    if (cx === goal.x && cy === goal.y) {
      const path: Tile[] = [];
      let k = curKey;
      while (cameFrom.has(k)) {
        const [px, py] = k.split(',').map(Number);
        path.push({ x: px, y: py });
        k = cameFrom.get(k)!;
      }
      path.reverse();
      return path;
    }
    open.delete(curKey);

    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!passable(nx, ny, goal, allowGoalBlocked)) continue;
      const nk = key(nx, ny);
      const stepCost = cityMap.isRoad(nx, ny) ? 4 : 1; // atravessar rua custa mais
      const tentative = (g.get(curKey) ?? Infinity) + stepCost;
      if (tentative < (g.get(nk) ?? Infinity)) {
        cameFrom.set(nk, curKey);
        g.set(nk, tentative);
        f.set(nk, tentative + h(nx, ny));
        open.add(nk);
      }
    }
  }
  return null;
}
