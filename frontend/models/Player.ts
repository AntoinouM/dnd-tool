import { Character } from './Character';

export class Player extends Character {
  constructor(name: string, x?: number, y?: number, color?: string) {
    super(name, x, y, color);
  }
}
