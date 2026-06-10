/**
 * map.ts (puro — sem Three.js)
 * ----------------------------
 * Modelo lógico da cidade, compartilhado pelo renderizador 3D e pelo motor
 * cognitivo. Define a grade (25x18), classifica cada tile e expõe regras de
 * caminhabilidade/colisão:
 *
 *   - 'road'     : centro da rua (carros). Atravessável só para cruzar.
 *   - 'sidewalk' : calçada — onde os personagens andam.
 *   - 'building' : casa/loja/prédio — BLOQUEADO (não se atravessa).
 *   - 'park'     : praça — caminhável; árvores/bancos são bloqueados.
 *
 * `isWalkable` é a regra de física: nunca se entra em um tile bloqueado.
 */

export const TILE = 2;
export const GRID_W = 25;
export const GRID_H = 18;
export const FLOOR_H = 1.4;
export const WORLD_SPAN_X = GRID_W * TILE + 8;
export const WORLD_SPAN_Z = GRID_H * TILE + 8;

export function worldPos(x: number, y: number): [number, number] {
  return [(x - (GRID_W - 1) / 2) * TILE, (y - (GRID_H - 1) / 2) * TILE];
}

export function isRoad(x: number, y: number): boolean {
  return x % 5 === 0 || y % 5 === 0;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

function isParkRegion(x: number, y: number): boolean {
  return x >= 11 && x <= 14 && y >= 6 && y <= 9;
}

function hash(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h;
}

const keyOf = (x: number, y: number) => `${x},${y}`;

function adjToRoad(x: number, y: number): boolean {
  return (
    (inBounds(x + 1, y) && isRoad(x + 1, y)) ||
    (inBounds(x - 1, y) && isRoad(x - 1, y)) ||
    (inBounds(x, y + 1) && isRoad(x, y + 1)) ||
    (inBounds(x, y - 1) && isRoad(x, y - 1))
  );
}

// --- Catálogo de lojas ------------------------------------------------------

export interface ShopType {
  name: string;
  emoji: string;
  color: number;
}

export const SHOPS: ShopType[] = [
  { name: 'Padaria', emoji: '🥖', color: 0xe8a33d },
  { name: 'Restaurante', emoji: '🍝', color: 0xc0392b },
  { name: 'Lanchonete', emoji: '🍔', color: 0xe67e22 },
  { name: 'Sorveteria', emoji: '🍦', color: 0xff6fae },
  { name: 'Oficina', emoji: '🔧', color: 0x5d6d7e },
  { name: 'Roupas', emoji: '👕', color: 0x8e44ad },
  { name: 'Livraria', emoji: '📚', color: 0x2e86c1 },
  { name: 'Farmácia', emoji: '💊', color: 0x27ae60 },
  { name: 'Flores', emoji: '🌸', color: 0xff8fb1 },
  { name: 'Café', emoji: '☕', color: 0x8b5a2b },
  { name: 'Mercado', emoji: '🛒', color: 0xf1c40f },
  { name: 'Pet Shop', emoji: '🐾', color: 0x16a085 },
];

export type Dir = 'n' | 's' | 'e' | 'w';
export const DIR_YAW: Record<Dir, number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

export type StructKind = 'house' | 'shop' | 'building';
export interface BuildingStruct {
  x: number;
  y: number;
  kind: StructKind;
  floors: number;
  variant: number;
  shop: number;
  dir: Dir; // fachada voltada para a rua
  /** Tile de calçada em frente (porta de entrada). */
  entrance?: Tile;
}

const DELTA: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export type ParkKind = 'tree' | 'bench' | 'open';
export interface ParkCell {
  x: number;
  y: number;
  kind: ParkKind;
  rot: number;
}

export interface Tile {
  x: number;
  y: number;
}

export interface CityMap {
  structures: BuildingStruct[];
  sidewalks: Tile[];
  park: ParkCell[];
  /** Imóveis em que se pode entrar (lojas e casas), com entrada definida. */
  pois: BuildingStruct[];
  /** Tiles bloqueados (prédios, árvores, bancos). */
  blocked: Set<string>;
  isWalkable(x: number, y: number): boolean;
  isRoad(x: number, y: number): boolean;
  isSidewalk(x: number, y: number): boolean;
  /** Tile de loja/casa em que um personagem pode entrar. */
  isEnterable(x: number, y: number): boolean;
  structAt(x: number, y: number): BuildingStruct | undefined;
  /** Tile de calçada aleatório (ponto de spawn seguro). */
  randomSpawn(): Tile;
  /** Converte posição de mundo (X,Z) para coordenada de tile. */
  tileFromWorld(wx: number, wz: number): Tile;
}

/** Direção da rua mais próxima (para orientar a fachada). */
function nearestRoadDir(x: number, y: number): Dir {
  for (let r = 1; r <= 6; r++) {
    const cand: [number, number, Dir][] = [
      [x, y - r, 'n'],
      [x, y + r, 's'],
      [x - r, y, 'w'],
      [x + r, y, 'e'],
    ];
    for (const [cx, cy, dir] of cand) {
      if (inBounds(cx, cy) && isRoad(cx, cy)) return dir;
    }
  }
  return 's';
}

function createCityMap(): CityMap {
  const structures: BuildingStruct[] = [];
  const sidewalks: Tile[] = [];
  const park: ParkCell[] = [];
  const blocked = new Set<string>();
  const sidewalkSet = new Set<string>();

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (isRoad(x, y)) continue;

      if (isParkRegion(x, y)) {
        const h = hash(x, y);
        const m = h % 3;
        const kind: ParkKind = m === 0 ? 'tree' : m === 1 ? 'bench' : 'open';
        park.push({ x, y, kind, rot: ((h >> 3) % 4) * (Math.PI / 2) });
        if (kind !== 'open') blocked.add(keyOf(x, y));
        continue;
      }

      if (adjToRoad(x, y)) {
        sidewalks.push({ x, y });
        sidewalkSet.add(keyOf(x, y));
        continue;
      }

      // Núcleo do quarteirão -> imóvel (bloqueado).
      const h = hash(x, y);
      const kind: StructKind = h % 100 < 50 ? 'shop' : h % 100 < 80 ? 'house' : 'building';
      structures.push({
        x,
        y,
        kind,
        floors: kind === 'building' ? 2 + (h % 3) : 1 + (h % 2),
        variant: h % 6,
        shop: h % SHOPS.length,
        dir: nearestRoadDir(x, y),
      });
      blocked.add(keyOf(x, y));
    }
  }

  // Indexa imóveis por tile e calcula a entrada (calçada em frente).
  const structTiles = new Map<string, BuildingStruct>();
  const pois: BuildingStruct[] = [];
  for (const s of structures) {
    structTiles.set(keyOf(s.x, s.y), s);
    const [dx, dy] = DELTA[s.dir];
    const ex = s.x + dx;
    const ey = s.y + dy;
    if (sidewalkSet.has(keyOf(ex, ey))) {
      s.entrance = { x: ex, y: ey };
      if (s.kind !== 'building') pois.push(s);
    }
  }

  const isEnterable = (x: number, y: number): boolean => {
    const s = structTiles.get(keyOf(x, y));
    return !!s && s.kind !== 'building';
  };

  return {
    structures,
    sidewalks,
    park,
    pois,
    blocked,
    isWalkable: (x, y) => inBounds(x, y) && !blocked.has(keyOf(x, y)),
    isRoad,
    isSidewalk: (x, y) => sidewalkSet.has(keyOf(x, y)),
    isEnterable,
    structAt: (x, y) => structTiles.get(keyOf(x, y)),
    randomSpawn: () => {
      if (sidewalks.length === 0) return { x: 1, y: 1 };
      return { ...sidewalks[Math.floor(Math.random() * sidewalks.length)] };
    },
    tileFromWorld: (wx, wz) => ({
      x: Math.max(0, Math.min(GRID_W - 1, Math.round(wx / TILE + (GRID_W - 1) / 2))),
      y: Math.max(0, Math.min(GRID_H - 1, Math.round(wz / TILE + (GRID_H - 1) / 2))),
    }),
  };
}

/** Instância única e determinística usada por todo o app. */
export const cityMap: CityMap = createCityMap();

// --- Rotas dos carros (decorativos) ----------------------------------------

export interface CarRoute {
  axis: 'x' | 'z';
  fixed: number;
  side: number;
  dir: 1 | -1;
  speed: number;
  offset: number;
  color: number;
}

export function generateCarRoutes(): CarRoute[] {
  const colors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xecf0f1, 0x9b59b6];
  const routes: CarRoute[] = [];
  const roadCols = [5, 10, 15, 20];
  const roadRows = [5, 10, 15];

  roadRows.forEach((y, i) => {
    const [, wz] = worldPos(0, y);
    routes.push({ axis: 'x', fixed: wz, side: 0.5, dir: i % 2 === 0 ? 1 : -1, speed: 3 + i, offset: i * 7, color: colors[i % colors.length] });
  });
  roadCols.forEach((x, i) => {
    const [wx] = worldPos(x, 0);
    routes.push({ axis: 'z', fixed: wx, side: 0.5, dir: i % 2 === 0 ? -1 : 1, speed: 3 + (i % 3), offset: i * 5, color: colors[(i + 3) % colors.length] });
  });
  return routes;
}
