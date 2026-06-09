/**
 * PhaserGame.tsx
 * --------------
 * Componente React que monta/desmonta a instância do Phaser e a conecta ao
 * stream do mundo via Socket.IO. O Phaser controla o canvas; o React controla
 * o ciclo de vida.
 */
import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { CityScene } from './scenes/CityScene';
import { connectWorld } from '../api/client';
import { useWorldStore } from '../store/useWorldStore';

export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 25 * 32,
      height: 18 * 32,
      parent: containerRef.current,
      pixelArt: true, // nearest-neighbor: visual "crocante" de pixel art
      backgroundColor: '#16161e',
      scene: [CityScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    // Stream do mundo -> store -> cena reage.
    const disconnect = connectWorld((snap) => {
      useWorldStore.getState().setSnapshot(snap);
    });

    return () => {
      disconnect();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-night rounded-lg overflow-hidden border border-panel"
    />
  );
}
