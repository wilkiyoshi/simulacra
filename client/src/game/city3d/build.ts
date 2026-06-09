/**
 * build.ts
 * --------
 * Geração procedural da pequena cidade 3D (estática): layout de quarteirões e
 * ruas, prédios com fachadas/janelas, calçadas e árvores. Tudo é construído
 * uma vez como um THREE.Group e inserido na cena via <primitive>.
 *
 * Mantém o mesmo sistema de coordenadas em "tiles" do motor cognitivo
 * (grade 25x18), então as personas continuam usando suas posições de grade.
 */
import * as THREE from 'three';

// --- Constantes de mundo ----------------------------------------------------
export const TILE = 2; // unidades 3D por tile
export const GRID_W = 25;
export const GRID_H = 18;
export const FLOOR_H = 1.4;

/** Converte coordenada de tile (x,y) para posição de mundo (X,Z) centralizada. */
export function worldPos(x: number, y: number): [number, number] {
  return [(x - (GRID_W - 1) / 2) * TILE, (y - (GRID_H - 1) / 2) * TILE];
}

/** Avenidas a cada 5 tiles formam a malha de ruas. */
export function isRoad(x: number, y: number): boolean {
  return x % 5 === 0 || y % 5 === 0;
}

/** Bloco central reservado como praça/parque (sem prédios). */
function isPark(x: number, y: number): boolean {
  return x >= 11 && x <= 14 && y >= 6 && y <= 9;
}

function hash(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h;
}

export interface BuildingInfo {
  x: number;
  y: number;
  floors: number;
  variant: number;
}

export interface CityLayout {
  buildings: BuildingInfo[];
  occupied: Set<string>;
  parks: { x: number; y: number }[];
}

const keyOf = (x: number, y: number) => `${x},${y}`;

/** Gera o layout determinístico da cidade. */
export function generateLayout(): CityLayout {
  const buildings: BuildingInfo[] = [];
  const occupied = new Set<string>();
  const parks: { x: number; y: number }[] = [];

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (isRoad(x, y)) continue;
      if (isPark(x, y)) {
        parks.push({ x, y });
        continue;
      }
      const h = hash(x, y);
      // ~72% dos tiles internos viram prédios; o resto é praça aberta/árvore.
      if (h % 100 < 72) {
        buildings.push({ x, y, floors: 2 + (h % 7), variant: h % FACADE_VARIANTS });
        occupied.add(keyOf(x, y));
      } else if (h % 7 === 0) {
        parks.push({ x, y });
      }
    }
  }
  return { buildings, occupied, parks };
}

/**
 * Para um tile ocupado por prédio, encontra o tile aberto mais próximo — assim
 * as personas são renderizadas nas ruas/praças, nunca dentro de prédios.
 */
export function nearestOpen(
  occupied: Set<string>,
  x: number,
  y: number,
): [number, number] {
  if (!occupied.has(keyOf(x, y))) return [x, y];
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        if (!occupied.has(keyOf(nx, ny))) return [nx, ny];
      }
    }
  }
  return [x, y];
}

// --- Texturas de fachada ----------------------------------------------------

const FACADE_VARIANTS = 6;
const facadeCache = new Map<number, { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture }>();
const materialCache = new Map<string, THREE.Material[]>();

function facadeBase(variant: number): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const cached = facadeCache.get(variant);
  if (cached) return cached;

  const size = 128;
  const hue = (variant * 53 + 200) % 360;

  // Canvas da cor + canvas de emissão (apenas janelas acesas brilham).
  const map = document.createElement('canvas');
  const emis = document.createElement('canvas');
  map.width = map.height = emis.width = emis.height = size;
  const mc = map.getContext('2d')!;
  const ec = emis.getContext('2d')!;

  mc.fillStyle = `hsl(${hue}, 14%, ${26 + (variant % 3) * 5}%)`;
  mc.fillRect(0, 0, size, size);
  ec.fillStyle = '#000';
  ec.fillRect(0, 0, size, size);

  const cols = 4;
  const rows = 4;
  const pad = 10;
  const gap = 7;
  const w = (size - pad * 2 - gap * (cols - 1)) / cols;
  const h = (size - pad * 2 - gap * (rows - 1)) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (variant + r * 7 + c * 13) % 5 < 2;
      const px = pad + c * (w + gap);
      const py = pad + r * (h + gap);
      mc.fillStyle = lit ? 'hsl(45, 85%, 66%)' : 'hsl(210, 40%, 20%)';
      mc.fillRect(px, py, w, h);
      mc.strokeStyle = 'rgba(0,0,0,0.4)';
      mc.lineWidth = 2;
      mc.strokeRect(px, py, w, h);
      if (lit) {
        ec.fillStyle = '#ffd27a';
        ec.fillRect(px, py, w, h);
      }
    }
  }

  const mapTex = new THREE.CanvasTexture(map);
  const emisTex = new THREE.CanvasTexture(emis);
  for (const t of [mapTex, emisTex]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  const result = { map: mapTex, emissive: emisTex };
  facadeCache.set(variant, result);
  return result;
}

/** Materiais (6 faces) de um prédio: paredes com janelas + topo/base lisos. */
function buildingMaterials(variant: number, floors: number): THREE.Material[] {
  const cacheKey = `${variant}-${floors}`;
  const cached = materialCache.get(cacheKey);
  if (cached) return cached;

  const base = facadeBase(variant);
  const map = base.map.clone();
  const emissive = base.emissive.clone();
  map.needsUpdate = emissive.needsUpdate = true;
  map.repeat.set(2, floors);
  emissive.repeat.set(2, floors);

  const wall = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: emissive,
    emissive: new THREE.Color(0xffd27a),
    emissiveIntensity: 0.5,
    roughness: 0.75,
    metalness: 0.08,
  });
  const roofHue = (variant * 53 + 200) % 360;
  const roof = new THREE.MeshStandardMaterial({
    color: new THREE.Color(`hsl(${roofHue}, 10%, 30%)`),
    roughness: 0.9,
  });

  // Ordem de faces da BoxGeometry: +x, -x, +y(topo), -y, +z, -z
  const mats = [wall, wall, roof, roof, wall, wall];
  materialCache.set(cacheKey, mats);
  return mats;
}

// --- Construção da cidade (THREE.Group) -------------------------------------

export function buildCity(layout: CityLayout): THREE.Group {
  const city = new THREE.Group();

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);

  // Chão (grama).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_W * TILE + 8, GRID_H * TILE + 8),
    new THREE.MeshStandardMaterial({ color: 0x6f9e57, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  city.add(ground);

  // Ruas (asfalto) + faixa central.
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x33373f, roughness: 0.95 });
  const laneMat = new THREE.MeshStandardMaterial({ color: 0xc9c987, roughness: 0.8 });
  for (let x = 0; x < GRID_W; x++) {
    if (x % 5 !== 0) continue;
    const [wx] = worldPos(x, 0);
    const road = new THREE.Mesh(plane, asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(wx, 0, 0);
    road.scale.set(TILE, GRID_H * TILE + 8, 1);
    road.receiveShadow = true;
    city.add(road);
    const lane = new THREE.Mesh(plane, laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(wx, 0.01, 0);
    lane.scale.set(0.12, GRID_H * TILE + 8, 1);
    city.add(lane);
  }
  for (let y = 0; y < GRID_H; y++) {
    if (y % 5 !== 0) continue;
    const [, wz] = worldPos(0, y);
    const road = new THREE.Mesh(plane, asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, wz);
    road.scale.set(GRID_W * TILE + 8, TILE, 1);
    road.receiveShadow = true;
    city.add(road);
    const lane = new THREE.Mesh(plane, laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.01, wz);
    lane.scale.set(GRID_W * TILE + 8, 0.12, 1);
    city.add(lane);
  }

  // Calçadas sob os prédios.
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.95 });
  for (const b of layout.buildings) {
    const [wx, wz] = worldPos(b.x, b.y);
    const sw = new THREE.Mesh(plane, sidewalkMat);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(wx, 0.0, wz);
    sw.scale.set(TILE, TILE, 1);
    sw.receiveShadow = true;
    city.add(sw);
  }

  // Prédios.
  for (const b of layout.buildings) {
    const [wx, wz] = worldPos(b.x, b.y);
    const height = b.floors * FLOOR_H;
    const footprint = TILE * 0.8;
    const mesh = new THREE.Mesh(unitBox, buildingMaterials(b.variant, b.floors));
    mesh.scale.set(footprint, height, footprint);
    mesh.position.set(wx, height / 2, wz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    city.add(mesh);

    // Detalhe de topo (casa de máquinas / telhado).
    const cap = new THREE.Mesh(
      unitBox,
      new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.9 }),
    );
    cap.scale.set(footprint * 0.5, FLOOR_H * 0.5, footprint * 0.5);
    cap.position.set(wx, height + FLOOR_H * 0.25, wz);
    cap.castShadow = true;
    city.add(cap);
  }

  // Árvores nas praças/parques.
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
  const leafGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 1, flatShading: true });
  for (const p of layout.parks) {
    if (hash(p.x, p.y) % 3 !== 0) continue; // espaça as árvores
    const [wx, wz] = worldPos(p.x, p.y);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(wx, 0.5, wz);
    trunk.castShadow = true;
    city.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(wx, 1.4, wz);
    leaf.scale.setScalar(0.9 + (hash(p.x, p.y) % 5) * 0.08);
    leaf.castShadow = true;
    city.add(leaf);
  }

  return city;
}

// --- Rotas dos carros (decorativos) ----------------------------------------

export interface CarRoute {
  axis: 'x' | 'z';
  /** linha fixa (em coordenada de mundo) da rua onde o carro anda. */
  fixed: number;
  /** deslocamento lateral para a "mão" da via. */
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
    routes.push({
      axis: 'x',
      fixed: wz,
      side: 0.5,
      dir: i % 2 === 0 ? 1 : -1,
      speed: 3 + i,
      offset: i * 7,
      color: colors[i % colors.length],
    });
  });
  roadCols.forEach((x, i) => {
    const [wx] = worldPos(x, 0);
    routes.push({
      axis: 'z',
      fixed: wx,
      side: 0.5,
      dir: i % 2 === 0 ? -1 : 1,
      speed: 3 + (i % 3),
      offset: i * 5,
      color: colors[(i + 3) % colors.length],
    });
  });
  return routes;
}

export const WORLD_SPAN_X = GRID_W * TILE + 8;
export const WORLD_SPAN_Z = GRID_H * TILE + 8;
