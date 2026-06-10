/**
 * useView.ts
 * ----------
 * Estado da câmera/visualização: observador (3ª pessoa) ou 1ª pessoa
 * controlando um personagem. Guarda a posição/direção livres do modo 1ª pessoa.
 */
import { create } from 'zustand';
import { simulation } from '../engine/simulation';
import { cityMap, worldPos } from '../city/map';
import type { Facing } from '../types';

const HEADING: Record<Facing, number> = { down: 0, up: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };

interface ViewState {
  mode: 'observer' | 'fp';
  controlledId: string | null;
  controlledName: string | null;
  fp: { x: number; z: number; heading: number };
  enterFp: (id: string, name: string, tile: { x: number; y: number }, facing: Facing) => void;
  exitFp: () => void;
}

export const useView = create<ViewState>((set, get) => ({
  mode: 'observer',
  controlledId: null,
  controlledName: null,
  fp: { x: 0, z: 0, heading: 0 },

  enterFp: (id, name, tile, facing) => {
    const [x, z] = worldPos(tile.x, tile.y);
    simulation.setControlled(id, true);
    set({ mode: 'fp', controlledId: id, controlledName: name, fp: { x, z, heading: HEADING[facing] } });
  },

  exitFp: () => {
    const { controlledId, fp } = get();
    if (controlledId) {
      const tile = cityMap.tileFromWorld(fp.x, fp.z);
      simulation.placeAgent(controlledId, tile);
      simulation.setControlled(controlledId, false);
    }
    set({ mode: 'observer', controlledId: null, controlledName: null });
  },
}));
