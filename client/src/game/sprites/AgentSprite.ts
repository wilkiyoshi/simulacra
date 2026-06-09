/**
 * AgentSprite.ts
 * --------------
 * Encapsula a representação visual de uma persona no mapa: o sprite animado,
 * uma etiqueta com o nome, um emoji de ação e um balão de fala estilo RPG.
 *
 * É um `Phaser.GameObjects.Container`, então move tudo junto. As animações
 * (idle/walk nas 4 direções) são tocadas a partir de um spritesheet cujo nome
 * segue o padrão `char-<spriteKey>`. Trocar a arte por um sprite sheet real é
 * só registrar uma textura com esse nome e os mesmos frames — nenhuma mudança
 * aqui é necessária.
 */
import Phaser from 'phaser';
import type { Facing } from '../../types';

const TILE = 32;

export class AgentSprite extends Phaser.GameObjects.Container {
  private readonly charSprite: Phaser.GameObjects.Sprite;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private readonly emoji: Phaser.GameObjects.Text;
  private bubble: Phaser.GameObjects.Container | null = null;
  private readonly spriteKey: string;
  private facing: Facing = 'down';

  constructor(scene: Phaser.Scene, spriteKey: string, name: string, x: number, y: number) {
    super(scene, x, y);
    this.spriteKey = spriteKey;

    this.charSprite = scene.add.sprite(0, 0, `char-${spriteKey}`, 'down-0');
    this.charSprite.setOrigin(0.5, 0.8);

    this.emoji = scene.add
      .text(0, -28, '🙂', { fontSize: '16px' })
      .setOrigin(0.5);

    this.nameLabel = scene.add
      .text(0, 10, name, {
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);

    this.add([this.charSprite, this.emoji, this.nameLabel]);
    scene.add.existing(this);
    this.playAnim(false);
  }

  /** Move suavemente até a célula de destino (em pixels). */
  moveToPixel(px: number, py: number): void {
    this.scene.tweens.add({
      targets: this,
      x: px,
      y: py,
      duration: 600,
      ease: 'Sine.easeInOut',
    });
  }

  setFacing(facing: Facing): void {
    this.facing = facing;
  }

  setMoving(isMoving: boolean): void {
    this.playAnim(isMoving);
  }

  setEmoji(emoji: string): void {
    this.emoji.setText(emoji || '🙂');
  }

  /** Exibe (ou esconde) o balão de fala em quadrinhos sobre a cabeça. */
  setSpeech(text: string | null): void {
    this.bubble?.destroy();
    this.bubble = null;
    if (!text) return;
    this.bubble = this.createBubble(text);
    this.add(this.bubble);
  }

  private playAnim(moving: boolean): void {
    const state = moving ? 'walk' : 'idle';
    const key = `${this.spriteKey}-${state}-${this.facing}`;
    if (this.scene.anims.exists(key)) {
      this.charSprite.play(key, true);
    }
  }

  /** Desenha um balão branco com "rabicho", largura adaptada ao texto. */
  private createBubble(text: string): Phaser.GameObjects.Container {
    const padding = 6;
    const maxWidth = 160;
    const label = this.scene.add.text(0, 0, text, {
      fontSize: '11px',
      color: '#1a1b26',
      wordWrap: { width: maxWidth },
      align: 'center',
    });
    label.setOrigin(0.5);

    const w = Math.min(maxWidth, label.width) + padding * 2;
    const h = label.height + padding * 2;
    const bubbleY = -48 - h / 2;

    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.lineStyle(2, 0x1a1b26, 1);
    g.fillRoundedRect(-w / 2, bubbleY - h / 2, w, h, 6);
    g.strokeRoundedRect(-w / 2, bubbleY - h / 2, w, h, 6);
    // Rabicho apontando para o personagem.
    g.fillTriangle(-5, bubbleY + h / 2 - 1, 5, bubbleY + h / 2 - 1, 0, bubbleY + h / 2 + 8);

    label.setPosition(0, bubbleY);
    const container = this.scene.add.container(0, 0, [g, label]);
    container.setDepth(1000);
    return container;
  }

  /** Atualiza a profundidade para que sprites "mais abaixo" fiquem na frente. */
  refreshDepth(): void {
    this.setDepth(this.y);
  }

  /** Converte coordenada de tile em pixel (centro da célula). */
  static tileToPixel(tx: number, ty: number): { px: number; py: number } {
    return { px: tx * TILE + TILE / 2, py: ty * TILE + TILE / 2 };
  }
}
