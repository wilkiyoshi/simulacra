/**
 * CityScene.ts
 * ------------
 * A cena principal do jogo. Responsável por:
 *   1. Gerar proceduralmente a arte em pixel (chão, caminhos, água, árvores)
 *      e os spritesheets dos personagens — sem depender de arquivos externos.
 *   2. Definir as animações (idle/walk nas 4 direções).
 *   3. Sincronizar os sprites com o snapshot do mundo (zustand store),
 *      criando, movendo e removendo personas conforme o backend manda.
 *
 * Para usar arte real: substitua `generateTileTextures` / `ensureCharacterTexture`
 * por `this.load.image(...)` no preload e `this.load.spritesheet('char-<key>', ...)`.
 * Os nomes de textura/frame/animção foram mantidos estáveis para facilitar isso.
 */
import Phaser from 'phaser';
import { useWorldStore } from '../../store/useWorldStore';
import { AgentSprite } from '../sprites/AgentSprite';
import type { WorldSnapshot } from '../../types';

const TILE = 32;
const FRAME_W = 24;
const FRAME_H = 32;
const DIRS = ['down', 'left', 'right', 'up'] as const;

export class CityScene extends Phaser.Scene {
  private readonly sprites = new Map<string, AgentSprite>();
  private readyCharKeys = new Set<string>();

  constructor() {
    super('CityScene');
  }

  create(): void {
    this.generateTileTextures();
    this.buildMap();

    // Reage a cada novo snapshot do mundo.
    useWorldStore.subscribe((s) => {
      if (s.snapshot) this.syncWorld(s.snapshot);
    });
    const current = useWorldStore.getState().snapshot;
    if (current) this.syncWorld(current);
  }

  // -------------------------------------------------------------------------
  //  Geração procedural de texturas de cenário (pixel art)
  // -------------------------------------------------------------------------

  private generateTileTextures(): void {
    this.makeTile('tile-grass', (ctx) => {
      ctx.fillStyle = '#5a9e4b';
      ctx.fillRect(0, 0, TILE, TILE);
      // textura granulada
      ctx.fillStyle = '#52923f';
      for (let i = 0; i < 18; i++) {
        ctx.fillRect(rnd(TILE), rnd(TILE), 2, 2);
      }
    });

    this.makeTile('tile-path', (ctx) => {
      ctx.fillStyle = '#caa472';
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = '#b8915f';
      for (let i = 0; i < 14; i++) ctx.fillRect(rnd(TILE), rnd(TILE), 3, 2);
    });

    this.makeTile('tile-water', (ctx) => {
      ctx.fillStyle = '#3a6ea5';
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.strokeStyle = '#5b8fc7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, 10);
      ctx.lineTo(TILE - 2, 14);
      ctx.moveTo(2, 22);
      ctx.lineTo(TILE - 2, 26);
      ctx.stroke();
    });

    this.makeTile('tile-tree', (ctx) => {
      ctx.fillStyle = '#5a9e4b';
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = '#6b4a2b'; // tronco
      ctx.fillRect(TILE / 2 - 2, TILE - 12, 4, 12);
      ctx.fillStyle = '#2f6d3a'; // copa
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2 - 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a854a';
      ctx.beginPath();
      ctx.arc(TILE / 2 - 3, TILE / 2 - 4, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private makeTile(key: string, draw: (ctx: CanvasRenderingContext2D) => void): void {
    if (this.textures.exists(key)) return;
    const canvas = this.textures.createCanvas(key, TILE, TILE);
    if (!canvas) return;
    draw(canvas.context);
    canvas.refresh();
  }

  /** Constrói um mapa determinístico: grama, uma praça/caminho e um laguinho. */
  private buildMap(): void {
    const W = 25;
    const H = 18;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let key = 'tile-grass';
        // Caminho cruzando a praça central.
        if (y === Math.floor(H / 2) || x === Math.floor(W / 2)) key = 'tile-path';
        // Laguinho no canto.
        if (x >= 2 && x <= 5 && y >= 2 && y <= 4) key = 'tile-water';
        // Algumas árvores nas bordas (determinístico via paridade).
        if ((x % 7 === 0 && y % 5 === 0 && key === 'tile-grass')) key = 'tile-tree';
        this.add.image(x * TILE, y * TILE, key).setOrigin(0, 0);
      }
    }
  }

  // -------------------------------------------------------------------------
  //  Geração procedural de personagens + animações
  // -------------------------------------------------------------------------

  /**
   * Garante que o spritesheet `char-<key>` e suas animações existam.
   * Layout do sheet: 4 linhas (down,left,right,up) x 2 colunas (frames de passo).
   */
  private ensureCharacterTexture(spriteKey: string): void {
    if (this.readyCharKeys.has(spriteKey)) return;
    const texKey = `char-${spriteKey}`;
    const cols = 2;
    const rows = DIRS.length;

    if (!this.textures.exists(texKey)) {
      const canvas = this.textures.createCanvas(texKey, FRAME_W * cols, FRAME_H * rows);
      if (!canvas) return;
      const ctx = canvas.context;
      const palette = colorFromKey(spriteKey);

      DIRS.forEach((dir, row) => {
        for (let frame = 0; frame < cols; frame++) {
          drawCharacter(ctx, frame * FRAME_W, row * FRAME_H, dir, frame, palette);
          // Registra o frame nomeado (ex.: "down-0").
          canvas.add(`${dir}-${frame}`, 0, frame * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H);
        }
      });
      canvas.refresh();
    }

    // Animações idle (frame parado) e walk (alterna os 2 frames).
    for (const dir of DIRS) {
      const idleKey = `${spriteKey}-idle-${dir}`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: [{ key: texKey, frame: `${dir}-0` }],
          frameRate: 1,
        });
      }
      const walkKey = `${spriteKey}-walk-${dir}`;
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: [
            { key: texKey, frame: `${dir}-0` },
            { key: texKey, frame: `${dir}-1` },
          ],
          frameRate: 6,
          repeat: -1,
        });
      }
    }

    this.readyCharKeys.add(spriteKey);
  }

  // -------------------------------------------------------------------------
  //  Sincronização com o mundo
  // -------------------------------------------------------------------------

  private syncWorld(snapshot: WorldSnapshot): void {
    const seen = new Set<string>();

    for (const agent of snapshot.agents) {
      seen.add(agent.id);
      this.ensureCharacterTexture(agent.core.spriteKey);

      const { px, py } = AgentSprite.tileToPixel(agent.position.x, agent.position.y);
      let sprite = this.sprites.get(agent.id);

      if (!sprite) {
        sprite = new AgentSprite(this, agent.core.spriteKey, agent.core.name, px, py);
        this.sprites.set(agent.id, sprite);
      } else {
        sprite.moveToPixel(px, py);
      }

      sprite.setFacing(agent.facing);
      sprite.setMoving(agent.isMoving);
      sprite.setEmoji(agent.actionEmoji);
      sprite.setSpeech(agent.speech);
      sprite.refreshDepth();
    }

    // Remove sprites de agentes que não existem mais.
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }

  }
}

// ---------------------------------------------------------------------------
//  Helpers de desenho de personagem (estilo Stardew/EarthBound simplificado)
// ---------------------------------------------------------------------------

interface Palette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  dir: (typeof DIRS)[number],
  frame: number,
  p: Palette,
): void {
  const cx = ox + FRAME_W / 2;
  const legSwing = frame === 0 ? 0 : 2;

  // Pernas (calça)
  ctx.fillStyle = p.pants;
  ctx.fillRect(cx - 5, oy + 22, 4, 8 - legSwing);
  ctx.fillRect(cx + 1, oy + 22, 4, 8 + (frame === 0 ? 0 : -legSwing));

  // Corpo (camisa)
  ctx.fillStyle = p.shirt;
  ctx.fillRect(cx - 6, oy + 12, 12, 11);

  // Cabeça
  ctx.fillStyle = p.skin;
  ctx.fillRect(cx - 5, oy + 2, 10, 10);

  // Cabelo / rosto por direção
  ctx.fillStyle = p.hair;
  if (dir === 'up') {
    ctx.fillRect(cx - 5, oy + 1, 10, 6);
  } else {
    ctx.fillRect(cx - 5, oy + 1, 10, 4);
    // Olhos
    ctx.fillStyle = '#1a1b26';
    if (dir === 'down') {
      ctx.fillRect(cx - 3, oy + 7, 2, 2);
      ctx.fillRect(cx + 1, oy + 7, 2, 2);
    } else if (dir === 'left') {
      ctx.fillRect(cx - 4, oy + 7, 2, 2);
    } else if (dir === 'right') {
      ctx.fillRect(cx + 2, oy + 7, 2, 2);
    }
  }
}

/** Deriva uma paleta estável a partir do spriteKey. */
function colorFromKey(key: string): Palette {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    skin: '#e7b48f',
    hair: `hsl(${hue}, 45%, 30%)`,
    shirt: `hsl(${(hue + 120) % 360}, 55%, 50%)`,
    pants: `hsl(${(hue + 200) % 360}, 30%, 35%)`,
  };
}

function rnd(max: number): number {
  return Math.floor(Math.random() * max);
}
