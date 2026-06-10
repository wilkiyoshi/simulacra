/**
 * build.ts (Three.js)
 * -------------------
 * Constrói a cidade 3D a partir do mapa lógico (`city/map.ts`). Lojas e casas
 * são "salas sem teto" (dollhouse) com mobília/eletrodomésticos próprios de
 * cada tipo de espaço — assim dá para ver o interior de cima e quando um
 * personagem entra. Prédios altos permanecem sólidos. Inclui ruas, calçadas,
 * praça, semáforos, postes e faixas de pedestre.
 */
import * as THREE from 'three';
import { cityMap, worldPos, SHOPS, DIR_YAW, TILE, FLOOR_H, GRID_W, GRID_H, type Dir } from '../../city/map';

const facadeCache = new Map<number, { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture }>();
const buildingMatCache = new Map<string, THREE.Material[]>();
const signCache = new Map<number, THREE.CanvasTexture>();
const awningCache = new Map<number, THREE.CanvasTexture>();
const colorMatCache = new Map<number, THREE.MeshStandardMaterial>();
const awningMatCache = new Map<number, THREE.Material>();
const signMatCache = new Map<number, THREE.Material>();

function solidMat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  const cached = colorMatCache.get(color);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({ color, roughness });
  colorMatCache.set(color, m);
  return m;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
const bulbGeo = new THREE.SphereGeometry(0.08, 12, 12);

function box(g: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const m = new THREE.Mesh(unitBox, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  g.add(m);
  return m;
}
function cyl(g: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, r: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(unitCyl, mat);
  m.position.set(x, y, z);
  m.scale.set(r * 2, h, r * 2);
  g.add(m);
  return m;
}

function facadeBase(variant: number): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const cached = facadeCache.get(variant);
  if (cached) return cached;
  const size = 128;
  const hue = (variant * 53 + 200) % 360;
  const map = document.createElement('canvas');
  const emis = document.createElement('canvas');
  map.width = map.height = emis.width = emis.height = size;
  const mc = map.getContext('2d')!;
  const ec = emis.getContext('2d')!;
  mc.fillStyle = `hsl(${hue}, 16%, ${34 + (variant % 3) * 5}%)`;
  mc.fillRect(0, 0, size, size);
  ec.fillStyle = '#000';
  ec.fillRect(0, 0, size, size);
  const cols = 4, rows = 4, pad = 10, gap = 7;
  const w = (size - pad * 2 - gap * (cols - 1)) / cols;
  const h = (size - pad * 2 - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (variant + r * 7 + c * 13) % 5 < 2;
      const px = pad + c * (w + gap);
      const py = pad + r * (h + gap);
      mc.fillStyle = lit ? 'hsl(45, 85%, 66%)' : 'hsl(210, 40%, 24%)';
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

function buildingMaterials(variant: number, floors: number): THREE.Material[] {
  const cacheKey = `${variant}-${floors}`;
  const cached = buildingMatCache.get(cacheKey);
  if (cached) return cached;
  const base = facadeBase(variant);
  const map = base.map.clone();
  const emissive = base.emissive.clone();
  map.needsUpdate = emissive.needsUpdate = true;
  map.repeat.set(2, floors);
  emissive.repeat.set(2, floors);
  const wall = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: new THREE.Color(0xffd27a), emissiveIntensity: 0.5, roughness: 0.75, metalness: 0.08 });
  const roof = solidMat(0x2b2f38, 0.9);
  const mats = [wall, wall, roof, roof, wall, wall];
  buildingMatCache.set(cacheKey, mats);
  return mats;
}

function signTexture(shopIdx: number): THREE.CanvasTexture {
  const cached = signCache.get(shopIdx);
  if (cached) return cached;
  const shop = SHOPS[shopIdx];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fbf3df';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#26201a';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 90);
  ctx.textBaseline = 'middle';
  ctx.font = '54px serif';
  ctx.fillText(shop.emoji, 14, 50);
  ctx.fillStyle = '#26201a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(shop.name, 84, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  signCache.set(shopIdx, tex);
  return tex;
}

function awningTexture(color: number): THREE.CanvasTexture {
  const cached = awningCache.get(color);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const hex = '#' + color.toString(16).padStart(6, '0');
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? hex : '#f7f7f7';
    ctx.fillRect(i * 16, 0, 16, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  awningCache.set(color, tex);
  return tex;
}

export function buildCity(): THREE.Group {
  const city = new THREE.Group();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W * TILE + 8, GRID_H * TILE + 8), solidMat(0x6f9e57, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  city.add(ground);

  const asphalt = solidMat(0x33373f, 0.95);
  const laneMat = solidMat(0xc9c987, 0.8);
  for (let x = 0; x < GRID_W; x++) {
    if (x % 5 !== 0) continue;
    const [wx] = worldPos(x, 0);
    addGroundPlane(city, asphalt, wx, 0, 0, TILE, GRID_H * TILE + 8, true);
    addGroundPlane(city, laneMat, wx, 0.01, 0, 0.12, GRID_H * TILE + 8, false);
  }
  for (let y = 0; y < GRID_H; y++) {
    if (y % 5 !== 0) continue;
    const [, wz] = worldPos(0, y);
    addGroundPlane(city, asphalt, 0, 0, wz, GRID_W * TILE + 8, TILE, true);
    addGroundPlane(city, laneMat, 0, 0.01, wz, GRID_W * TILE + 8, 0.12, false);
  }

  const sidewalkMat = solidMat(0x9aa0a6, 0.95);
  for (const s of cityMap.sidewalks) {
    const [wx, wz] = worldPos(s.x, s.y);
    addGroundPlane(city, sidewalkMat, wx, 0.0, wz, TILE, TILE, true);
  }

  const houseWalls = [0xf2e2c4, 0xe7d3b3, 0xd9e3ec, 0xf0d8d8, 0xd8ecd9];
  const shopWalls = [0xf6efe2, 0xeae1cf, 0xe8eef2];
  for (const s of cityMap.structures) {
    const [wx, wz] = worldPos(s.x, s.y);
    const h = Math.abs((s.x * 73856093) ^ (s.y * 19349663));
    addGroundPlane(city, sidewalkMat, wx, 0.0, wz, TILE, TILE, true);

    if (s.kind === 'building') {
      const height = s.floors * FLOOR_H;
      const fp = TILE * 0.8;
      const mesh = new THREE.Mesh(unitBox, buildingMaterials(s.variant, s.floors));
      mesh.scale.set(fp, height, fp);
      mesh.position.set(wx, height / 2, wz);
      mesh.castShadow = mesh.receiveShadow = true;
      city.add(mesh);
      const cap = new THREE.Mesh(unitBox, solidMat(0x2b2f38, 0.9));
      cap.scale.set(fp * 0.5, FLOOR_H * 0.4, fp * 0.5);
      cap.position.set(wx, height + FLOOR_H * 0.2, wz);
      cap.castShadow = true;
      city.add(cap);
      continue;
    }

    const room = new THREE.Group();
    room.position.set(wx, 0, wz);
    room.rotation.y = DIR_YAW[s.dir];
    const fp = TILE * 0.92;
    const roomH = 1.7;
    const wallColor = s.kind === 'shop' ? shopWalls[h % shopWalls.length] : houseWalls[h % houseWalls.length];
    const gap = s.kind === 'shop' ? fp * 0.6 : 0.7;
    addRoom(room, fp, roomH, wallColor, 0xece5d8, gap);
    if (s.kind === 'shop') furnishShop(room, SHOPS[s.shop].name, fp);
    else furnishHouse(room, fp);
    city.add(room);

    if (s.kind === 'shop') addShopFront(city, wx, wz, s.dir, s.shop, roomH);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1, 6);
  const trunkMat = solidMat(0x6b4a2b, 1);
  const leafGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 1, flatShading: true });
  for (const p of cityMap.park) {
    const [wx, wz] = worldPos(p.x, p.y);
    if (p.kind === 'tree') {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(wx, 0.5, wz);
      trunk.castShadow = true;
      city.add(trunk);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(wx, 1.4, wz);
      leaf.scale.setScalar(0.95);
      leaf.castShadow = true;
      city.add(leaf);
    } else if (p.kind === 'bench') {
      addBench(city, wx, wz, p.rot);
    }
  }

  addStreetProps(city);
  return city;
}

function addGroundPlane(city: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, sx: number, sz: number, receive: boolean): void {
  const m = new THREE.Mesh(unitPlane, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.scale.set(sx, sz, 1);
  m.receiveShadow = receive;
  city.add(m);
}

/** Sala sem teto: piso + 3 paredes + frente com abertura (porta/vitrine). */
function addRoom(g: THREE.Group, fp: number, height: number, wallColor: number, floorColor: number, gap: number): void {
  const t = 0.08;
  const wall = solidMat(wallColor, 0.9);
  const floor = box(g, solidMat(floorColor, 0.95), 0, 0.02, 0, fp, 0.04, fp);
  floor.receiveShadow = true;
  box(g, wall, 0, height / 2, -fp / 2, fp, height, t);
  box(g, wall, -fp / 2, height / 2, 0, t, height, fp);
  box(g, wall, fp / 2, height / 2, 0, t, height, fp);
  const seg = (fp - gap) / 2;
  if (seg > 0.02) {
    box(g, wall, -(gap / 2 + seg / 2), height / 2, fp / 2, seg, height, t);
    box(g, wall, gap / 2 + seg / 2, height / 2, fp / 2, seg, height, t);
  }
}

// --- Mobília (coordenadas locais: frente = +Z) ------------------------------

const WOOD = 0x9a6b3f;
const PRODUCTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0xff8fb1, 0x9b59b6, 0xe67e22];

function fTable(g: THREE.Group, x: number, z: number): void {
  cyl(g, solidMat(WOOD), x, 0.5, z, 0.26, 0.05);
  box(g, solidMat(0x7a5230), x, 0.25, z, 0.06, 0.5, 0.06);
}
function fChair(g: THREE.Group, x: number, z: number): void {
  box(g, solidMat(0x5a4633), x, 0.26, z, 0.26, 0.05, 0.26);
  box(g, solidMat(0x5a4633), x, 0.42, z - 0.1, 0.26, 0.3, 0.05);
}
function fCounter(g: THREE.Group, x: number, z: number, w: number, color = 0x8a5a32): void {
  box(g, solidMat(color), x, 0.45, z, w, 0.9, 0.32);
  box(g, solidMat(0xb98a55), x, 0.92, z, w + 0.04, 0.06, 0.36);
}
function fShelf(g: THREE.Group, x: number, z: number, w: number, palette: number[]): void {
  box(g, solidMat(0xb9a07a), x, 0.7, z, w, 1.4, 0.22);
  for (let row = 0; row < 2; row++) {
    const cy = 0.55 + row * 0.55;
    for (let k = 0; k < 3; k++) {
      box(g, solidMat(palette[(row * 3 + k) % palette.length]), x - w / 2 + 0.18 + k * (w / 3), cy, z + 0.14, w / 4.2, 0.3, 0.12);
    }
  }
}
function fAppliance(g: THREE.Group, x: number, z: number, w: number, hgt: number, color: number): void {
  box(g, solidMat(color), x, hgt / 2, z, w, hgt, 0.3);
  box(g, solidMat(0x222831), x, hgt + 0.06, z, w * 0.5, 0.12, 0.18);
}
function fRack(g: THREE.Group, x: number, z: number): void {
  box(g, solidMat(0x6b7178), x, 1.1, z, 0.7, 0.04, 0.04);
  box(g, solidMat(0x6b7178), x - 0.33, 0.6, z, 0.04, 1.0, 0.04);
  box(g, solidMat(0x6b7178), x + 0.33, 0.6, z, 0.04, 1.0, 0.04);
  for (let i = 0; i < 4; i++) box(g, solidMat(PRODUCTS[i % PRODUCTS.length]), x - 0.27 + i * 0.18, 0.8, z, 0.12, 0.45, 0.06);
}
function fBed(g: THREE.Group, x: number, z: number): void {
  box(g, solidMat(0x6d4c7d), x, 0.22, z, 0.7, 0.18, 1.0);
  box(g, solidMat(0xf0f0f0), x, 0.34, z - 0.35, 0.6, 0.12, 0.25);
}
function fSofa(g: THREE.Group, x: number, z: number): void {
  box(g, solidMat(0x3b6e8f), x, 0.28, z, 0.9, 0.3, 0.4);
  box(g, solidMat(0x3b6e8f), x, 0.5, z - 0.16, 0.9, 0.4, 0.1);
}
function fCar(g: THREE.Group, x: number, z: number): void {
  box(g, solidMat(0xc0392b), x, 0.25, z, 0.5, 0.25, 0.9);
  box(g, solidMat(0x16202c), x, 0.45, z - 0.05, 0.42, 0.2, 0.45);
  box(g, solidMat(0x3a3f47), x, 0.05, z, 0.62, 0.1, 1.0);
}

function furnishShop(g: THREE.Group, name: string, fp: number): void {
  const back = -fp / 2 + 0.32;
  const front = fp / 2 - 0.5;
  switch (name) {
    case 'Café':
      fCounter(g, 0, back, fp * 0.7);
      fAppliance(g, -0.35, back, 0.26, 0.32, 0x9aa0a6);
      fTable(g, -0.4, front);
      fChair(g, -0.4, front - 0.42);
      fTable(g, 0.45, front - 0.1);
      fChair(g, 0.45, front - 0.52);
      break;
    case 'Padaria':
      fCounter(g, 0.2, front, fp * 0.6);
      fAppliance(g, -0.4, back, 0.4, 0.5, 0xb0b6bd);
      fShelf(g, fp / 2 - 0.3, 0, 0.7, [0xc98a3d, 0xa56a2a, 0xe0b870]);
      break;
    case 'Restaurante':
      fTable(g, -0.4, -0.2); fChair(g, -0.4, -0.6);
      fTable(g, 0.45, -0.1); fChair(g, 0.45, -0.5);
      fTable(g, 0, front); fChair(g, 0, front - 0.42);
      break;
    case 'Lanchonete':
      fCounter(g, 0, back, fp * 0.7);
      fAppliance(g, 0.4, back, 0.3, 0.3, 0x7f8c8d);
      fChair(g, -0.3, back + 0.6); fChair(g, 0.1, back + 0.6);
      break;
    case 'Sorveteria':
      fCounter(g, 0, back, fp * 0.7, 0xf7c6dd);
      fAppliance(g, -0.4, back, 0.3, 0.35, 0xeaf2f6);
      fChair(g, -0.2, front); fChair(g, 0.25, front);
      break;
    case 'Oficina':
      fCar(g, 0, 0);
      fShelf(g, -fp / 2 + 0.25, -0.2, 0.6, [0x5d6d7e, 0x95a5a6, 0x34495e]);
      break;
    case 'Roupas':
      fRack(g, -0.35, -0.1);
      fRack(g, 0.35, -0.1);
      fTable(g, 0, front);
      break;
    case 'Livraria':
      fShelf(g, -fp / 2 + 0.25, 0, 0.7, PRODUCTS);
      fShelf(g, fp / 2 - 0.25, 0, 0.7, PRODUCTS);
      fCounter(g, 0, front, 0.7);
      break;
    case 'Farmácia':
      fCounter(g, 0, front, fp * 0.6);
      fShelf(g, -fp / 2 + 0.25, -0.1, 0.6, [0x2ecc71, 0xffffff, 0x27ae60]);
      fShelf(g, fp / 2 - 0.25, -0.1, 0.6, [0x2ecc71, 0xffffff, 0x27ae60]);
      break;
    case 'Flores':
      fShelf(g, -fp / 2 + 0.25, 0, 0.6, [0xff6fae, 0xff8fb1, 0xf1c40f, 0xe74c3c]);
      fShelf(g, fp / 2 - 0.25, 0, 0.6, [0xff6fae, 0x9b59b6, 0x2ecc71]);
      fShelf(g, 0, back, 0.7, [0xff6fae, 0xf1c40f]);
      break;
    case 'Mercado':
      fShelf(g, -0.4, -0.2, 0.7, PRODUCTS);
      fShelf(g, 0.4, -0.2, 0.7, PRODUCTS);
      fCounter(g, 0, front, fp * 0.5);
      break;
    case 'Pet Shop':
      fShelf(g, -fp / 2 + 0.25, -0.1, 0.6, [0x16a085, 0xf1c40f, 0xe67e22]);
      fCounter(g, 0, front, 0.6);
      box(g, solidMat(0x8a5a32), 0.4, 0.15, 0, 0.5, 0.3, 0.5);
      break;
    default:
      fCounter(g, 0, back, fp * 0.6);
      fShelf(g, fp / 2 - 0.25, 0, 0.6, PRODUCTS);
  }
}

function furnishHouse(g: THREE.Group, fp: number): void {
  fBed(g, -fp / 2 + 0.45, -fp / 2 + 0.6);
  fSofa(g, fp / 2 - 0.4, 0.1);
  fTable(g, 0, fp / 2 - 0.55);
  fChair(g, -0.3, fp / 2 - 0.55);
  fChair(g, 0.3, fp / 2 - 0.55);
}

function addShopFront(city: THREE.Group, wx: number, wz: number, dir: Dir, shopIdx: number, roomH: number): void {
  const fp = TILE * 0.92;
  const g = new THREE.Group();
  g.position.set(wx, 0, wz);
  g.rotation.y = DIR_YAW[dir];
  const zf = fp / 2;

  const color = SHOPS[shopIdx].color;
  let awnMat = awningMatCache.get(color);
  if (!awnMat) {
    awnMat = new THREE.MeshStandardMaterial({ map: awningTexture(color), roughness: 0.8 });
    awningMatCache.set(color, awnMat);
  }
  const awn = new THREE.Mesh(unitBox, awnMat);
  awn.position.set(0, roomH - 0.08, zf + 0.22);
  awn.rotation.x = -0.35;
  awn.scale.set(fp * 0.98, 0.07, 0.5);
  awn.castShadow = true;
  g.add(awn);

  let signMat = signMatCache.get(shopIdx);
  if (!signMat) {
    const tex = signTexture(shopIdx);
    signMat = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(0xffffff), emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.6 });
    signMatCache.set(shopIdx, signMat);
  }
  const sign = new THREE.Mesh(unitPlane, signMat);
  sign.position.set(0, roomH + 0.32, zf + 0.02);
  sign.scale.set(fp * 0.9, 0.5, 1);
  g.add(sign);

  city.add(g);
}

function addBench(city: THREE.Group, x: number, z: number, rotY: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const wood = solidMat(0x7a5230, 0.9);
  const seat = box(g, wood, 0, 0.35, 0, 0.9, 0.08, 0.34);
  seat.castShadow = true;
  box(g, wood, 0, 0.55, -0.14, 0.9, 0.3, 0.07);
  box(g, solidMat(0x40454d), -0.38, 0.17, 0, 0.07, 0.35, 0.3);
  box(g, solidMat(0x40454d), 0.38, 0.17, 0, 0.07, 0.35, 0.3);
  city.add(g);
}

function addStreetProps(city: THREE.Group): void {
  const white = solidMat(0xeaeaea, 0.7);
  const poleMat = solidMat(0x2c2f36, 0.6);
  const cols = [5, 10, 15, 20];
  const rows = [5, 10, 15];
  for (const ix of cols) {
    for (const iy of rows) {
      const [wx, wz] = worldPos(ix, iy);
      const barLen = TILE * 0.9;
      const gap = 0.18;
      for (const sgn of [1, -1]) {
        for (let k = 0; k < 3; k++) {
          addGroundPlane(city, white, wx, 0.012, wz + sgn * (TILE * 0.7 + k * gap), barLen, 0.12, false);
          addGroundPlane(city, white, wx + sgn * (TILE * 0.7 + k * gap), 0.012, wz, 0.12, barLen, false);
        }
      }
      addTrafficLight(city, poleMat, wx + TILE / 2 + 0.35, wz + TILE / 2 + 0.35);
      addLampPost(city, poleMat, wx - TILE / 2 - 0.35, wz - TILE / 2 - 0.35);
    }
  }
}

function addTrafficLight(city: THREE.Group, poleMat: THREE.Material, x: number, z: number): void {
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.scale.set(1, 2.6, 1);
  pole.position.set(x, 1.3, z);
  pole.castShadow = true;
  city.add(pole);
  const boxm = new THREE.Mesh(unitBox, solidMat(0x1b1f26));
  boxm.scale.set(0.28, 0.72, 0.22);
  boxm.position.set(x, 2.65, z);
  boxm.castShadow = true;
  city.add(boxm);
  const bulbs = [
    { c: 0xff3b30, e: 0.25, y: 2.86 },
    { c: 0xffcc00, e: 0.25, y: 2.65 },
    { c: 0x34c759, e: 1.1, y: 2.44 },
  ];
  for (const b of bulbs) {
    const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshStandardMaterial({ color: b.c, emissive: b.c, emissiveIntensity: b.e }));
    bulb.scale.setScalar(0.85);
    bulb.position.set(x, b.y, z + 0.12);
    city.add(bulb);
  }
}

function addLampPost(city: THREE.Group, poleMat: THREE.Material, x: number, z: number): void {
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.scale.set(1, 2.4, 1);
  pole.position.set(x, 1.2, z);
  pole.castShadow = true;
  city.add(pole);
  const arm = new THREE.Mesh(unitBox, poleMat);
  arm.scale.set(0.5, 0.06, 0.06);
  arm.position.set(x + 0.2, 2.35, z);
  city.add(arm);
  const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshStandardMaterial({ color: 0xfff1c2, emissive: 0xfff1c2, emissiveIntensity: 1.1 }));
  bulb.scale.setScalar(1.5);
  bulb.position.set(x + 0.42, 2.3, z);
  city.add(bulb);
}
