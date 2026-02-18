import { v4 as uuidv4 } from 'uuid';

export class Character {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;

  constructor(
    name: string,
    x: number = 100,
    y: number = 100,
    color: string = '#ff0000',
  ) {
    this.id = uuidv4().slice(0, 8);
    this.name = name;
    this.x = x;
    this.y = y;
    this.color = color;
  }

  toConfig() {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      color: this.color,
    };
  }

  static fromConfig(config: {
    id: string;
    name: string;
    x: number;
    y: number;
    color: string;
  }): Character {
    const c = new Character(config.name, config.x, config.y, config.color);
    c.id = config.id;
    return c;
  }
}
