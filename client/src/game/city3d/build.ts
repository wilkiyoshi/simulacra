/**
 * build.ts (Three.js)
 * -------------------
 * Constrói a cidade 3D (estática) a partir do mapa lógico puro (`city/map.ts`):
 * calçadas onde os personagens andam, imóveis (casas/lojas/prédios), praça com
 * árvores e bancos, ruas com faixas, semáforos e postes. Tudo num THREE.Group.
 */
import * as THREE from 'three';
import {
  cityMap,
  worldPos,
  SHOPS,
  DIR_YAW,
  TILE,
  FLOOR_H,
  GRID_W,
  GRID_H,
} from '../../city/map';

// --- Texturas / materiais em cache -----------------------------------------

const facadeCache = new Map<number, { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture }>();
const buildingMatCache = new Map<string, THREE.Material[]>();
const signCache = new Map<number, THREE.CanvasTexture>();
const awningCache = new Map<number, THREE.CanvasTexture>();
const colorMatCache = new Map<number, THREE.MeshStandardMaterial>();
const awningMatCache = new Map<number, THREE.Material>();
const signMatCache = new Map<number, THREE.Material>();
let glassMat: THREE.Material | null = null;

function solidMat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  const cached = colorMatCache.get(color);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({ color, roughness });
  colorMatCache.set(color, m);
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
  const wall = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: emissive,
    emissive: new THREE.Color(0xffd27a),
    emissiveIntensity: 0.5,
    roughness: 0.75,
    metalness: 0.08,
  });
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

// --- Geometrias compartilhadas ---------------------------------------------

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const pyramid = new THREE.ConeGeometry(0.95, 1, 4);
const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
const bulbGeo = new THREE.SphereGeometry(0.08, 12, 12);

// --- Construção -------------------------------------------------------------

export function buildCity(): THREE.Group {
  const city = new THREE.Group();

  // Chão (grama).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W * TILE + 8, GRID_H * TILE + 8), solidMat(0x6f9e57, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  city.add(ground);

  // Ruas + faixa central.
  const asphalt = solidMat(0x33373f, 0.95);
  const laneMat = solidMat(0xc9c987, 0.8);
  for (let x = 0; x < GRID_W; x++) {
    if (x % 5 !== 0) continue;
    const [wx] = worldPos(x, 0);
    addPlane(city, asphalt, wx, 0, 0, TILE, GRID_H * TILE + 8, true);
    addPlane(city, laneMat, wx, 0.01, 0, 0.12, GRID_H * TILE + 8, false);
  }
  for (let y = 0; y < GRID_H; y++) {
    if (y % 5 !== 0) continue;
    const [, wz] = worldPos(0, y);
    addPlane(city, asphalt, 0, 0, wz, GRID_W * TILE + 8, TILE, true);
    addPlane(city, laneMat, 0, 0.01, wz, GRID_W * TILE + 8, 0.12, false);
  }

  // Calçadas (onde os personagens andam).
  const sidewalkMat = solidMat(0x9aa0a6, 0.95);
  for (const s of cityMap.sidewalks) {
    const [wx, wz] = worldPos(s.x, s.y);
    addPlane(city, sidewalkMat, wx, 0.0, wz, TILE, TILE, true);
  }

  // Imóveis.
  const houseWalls = [0xf2e2c4, 0xe7d3b3, 0xd9e3ec, 0xf0d8d8, 0xd8ecd9];
  const shopWalls = [0xf6efe2, 0xeae1cf, 0xe8eef2];
  const roofCols = [0xb5532e, 0x9c4733, 0x7d563b, 0x55606b];
  for (const s of cityMap.structures) {
    const [wx, wz] = worldPos(s.x, s.y);
    const h = (s.x * 73856093) ^ (s.y * 19349663);
    addPlane(city, solidMat(0x9aa0a6, 0.95), wx, 0.0, wz, TILE, TILE, true); // calçadinha base

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
    } else if (s.kind === 'house') {
      const fp = TILE * 0.8;
      const bodyH = 1.4 + (Math.abs(h) % 2) * 0.4;
      const body = new THREE.Mesh(unitBox, solidMat(houseWalls[Math.abs(h) % houseWalls.length]));
      body.scale.set(fp, bodyH, fp);
      body.position.set(wx, bodyH / 2, wz);
      body.castShadow = body.receiveShadow = true;
      city.add(body);
      const roofH = 0.95;
      const roof = new THREE.Mesh(pyramid, solidMat(roofCols[Math.abs(h) % roofCols.length], 0.95));
      roof.scale.set(fp * 0.62, roofH, fp * 0.62);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(wx, bodyH + roofH / 2, wz);
      roof.castShadow = true;
      city.add(roof);
      addHouseFront(city, wx, wz, s.dir, fp);
    } else {
      const fp = TILE * 0.85;
      const bodyH = 2.2 + (Math.abs(h) % 2) * 1.2;
      const body = new THREE.Mesh(unitBox, solidMat(shopWalls[Math.abs(h) % shopWalls.length]));
      body.scale.set(fp, bodyH, fp);
      body.position.set(wx, bodyH / 2, wz);
      body.castShadow = body.receiveShadow = true;
      city.add(body);
      const slab = new THREE.Mesh(unitBox, solidMat(0x40454d, 0.9));
      slab.scale.set(fp * 1.02, 0.16, fp * 1.02);
      slab.position.set(wx, bodyH + 0.08, wz);
      slab.castShadow = true;
      city.add(slab);
      addStorefront(city, wx, wz, s.dir, s.shop);
    }
  }

  // Praça: árvores e bancos.
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

function addPlane(
  city: THREE.Group,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sz: number,
  receive: boolean,
): void {
  const m = new THREE.Mesh(unitPlane, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.scale.set(sx, sz, 1);
  m.receiveShadow = receive;
  city.add(m);
}

function addHouseFront(city: THREE.Group, wx: number, wz: number, dir: keyof typeof DIR_YAW, fp: number): void {
  const front = new THREE.Group();
  front.position.set(wx, 0, wz);
  front.rotation.y = DIR_YAW[dir];
  const zf = fp / 2;
  const door = new THREE.Mesh(unitBox, solidMat(0x6b4a2b, 0.9));
  door.position.set(-fp * 0.2, 0.42, zf + 0.02);
  door.scale.set(0.32, 0.8, 0.06);
  front.add(door);
  const win = new THREE.Mesh(unitPlane, solidMat(0x9bd3e6, 0.3));
  win.position.set(fp * 0.2, 0.85, zf + 0.02);
  win.scale.set(0.42, 0.42, 1);
  front.add(win);
  city.add(front);
}

function addStorefront(city: THREE.Group, wx: number, wz: number, dir: keyof typeof DIR_YAW, shopIdx: number): void {
  const fp = TILE * 0.85;
  const front = new THREE.Group();
  front.position.set(wx, 0, wz);
  front.rotation.y = DIR_YAW[dir];
  const zf = fp / 2;

  if (!glassMat) glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2530, roughness: 0.2, metalness: 0.6 });
  const glass = new THREE.Mesh(unitPlane, glassMat);
  glass.position.set(0, 0.65, zf + 0.01);
  glass.scale.set(fp * 0.78, 1.0, 1);
  front.add(glass);

  const door = new THREE.Mesh(unitBox, solidMat(0x3a2c20, 0.9));
  door.position.set(fp * 0.28, 0.45, zf + 0.02);
  door.scale.set(0.34, 0.9, 0.06);
  front.add(door);

  const color = SHOPS[shopIdx].color;
  let awnMat = awningMatCache.get(color);
  if (!awnMat) {
    awnMat = new THREE.MeshStandardMaterial({ map: awningTexture(color), roughness: 0.8 });
    awningMatCache.set(color, awnMat);
  }
  const awn = new THREE.Mesh(unitBox, awnMat);
  awn.position.set(0, 1.28, zf + 0.22);
  awn.rotation.x = -0.35;
  awn.scale.set(fp * 0.98, 0.07, 0.5);
  awn.castShadow = true;
  front.add(awn);

  let signMat = signMatCache.get(shopIdx);
  if (!signMat) {
    const tex = signTexture(shopIdx);
    signMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: tex,
      emissiveIntensity: 0.25,
      roughness: 0.6,
    });
    signMatCache.set(shopIdx, signMat);
  }
  const sign = new THREE.Mesh(unitPlane, signMat);
  sign.position.set(0, 1.92, zf + 0.02);
  sign.scale.set(fp * 0.9, 0.5, 1);
  front.add(sign);

  city.add(front);
}

function addBench(city: THREE.Group, x: number, z: number, rotY: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const wood = solidMat(0x7a5230, 0.9);
  const seat = new THREE.Mesh(unitBox, wood);
  seat.scale.set(0.9, 0.08, 0.34);
  seat.position.set(0, 0.35, 0);
  seat.castShadow = true;
  g.add(seat);
  const back = new THREE.Mesh(unitBox, wood);
  back.scale.set(0.9, 0.3, 0.07);
  back.position.set(0, 0.55, -0.14);
  g.add(back);
  for (const sx of [-0.38, 0.38]) {
    const leg = new THREE.Mesh(unitBox, solidMat(0x40454d));
    leg.scale.set(0.07, 0.35, 0.3);
    leg.position.set(sx, 0.17, 0);
    g.add(leg);
  }
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
          addPlane(city, white, wx, 0.012, wz + sgn * (TILE * 0.7 + k * gap), barLen, 0.12, false);
          addPlane(city, white, wx + sgn * (TILE * 0.7 + k * gap), 0.012, wz, 0.12, barLen, false);
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
  const box = new THREE.Mesh(unitBox, solidMat(0x1b1f26));
  box.scale.set(0.28, 0.72, 0.22);
  box.position.set(x, 2.65, z);
  box.castShadow = true;
  city.add(box);
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
