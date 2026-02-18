import Konva from 'konva';

export interface FogOptions {
  width: number;
  height: number;
  onReveal?: (points: { x: number; y: number; radius: number }[]) => void;
}

export const useFog = (options: FogOptions) => {
  let fogLayer: Konva.Layer;
  let fogImage: Konva.Image;
  let fogCanvas: HTMLCanvasElement;
  let fogCtx: CanvasRenderingContext2D;
  let isDrawing = false;
  let revealBuffer: { x: number; y: number; radius: number }[] = [];
  const brushRadius = 30;
  let parentStage: Konva.Stage;

  const generateCloudPattern = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    ctx.fillStyle = 'rgba(40, 40, 50, 0.92)';
    ctx.fillRect(0, 0, width, height);

    const numClouds = 60;
    for (let i = 0; i < numClouds; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = 40 + Math.random() * 120;
      const alpha = 0.03 + Math.random() * 0.08;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(80, 80, 100, ${alpha})`);
      grad.addColorStop(0.5, `rgba(60, 60, 80, ${alpha * 0.5})`);
      grad.addColorStop(1, 'rgba(40, 40, 50, 0)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    const numWisps = 30;
    for (let i = 0; i < numWisps; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = 20 + Math.random() * 80;
      const alpha = 0.02 + Math.random() * 0.06;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(150, 150, 170, ${alpha})`);
      grad.addColorStop(1, 'rgba(40, 40, 50, 0)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
  };

  const eraseAt = (x: number, y: number, radius: number = brushRadius) => {
    if (!fogCtx) return;

    fogCtx.globalCompositeOperation = 'destination-out';

    const grad = fogCtx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.6)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    fogCtx.fillStyle = grad;
    fogCtx.beginPath();
    fogCtx.arc(x, y, radius, 0, Math.PI * 2);
    fogCtx.fill();

    fogCtx.globalCompositeOperation = 'source-over';

    // Force Konva to re-render the image from the updated canvas
    fogImage.image(fogCanvas);
    fogLayer.batchDraw();
  };

  const applyRevealPoints = (
    points: { x: number; y: number; radius: number }[],
  ) => {
    points.forEach((p) => eraseAt(p.x, p.y, p.radius));
  };

  const setInteractive = (interactive: boolean) => {
    if (fogLayer) {
      fogLayer.listening(interactive);
      fogImage.listening(interactive);
    }
  };

  const init = (
    stage: Konva.Stage,
    interactive: boolean = false,
  ): Konva.Layer => {
    parentStage = stage;

    fogCanvas = document.createElement('canvas');
    fogCanvas.width = options.width;
    fogCanvas.height = options.height;
    fogCtx = fogCanvas.getContext('2d')!;

    generateCloudPattern(fogCtx, options.width, options.height);

    // Always start with listening OFF — mode watcher will enable it
    fogLayer = new Konva.Layer({ listening: false });

    fogImage = new Konva.Image({
      x: 0,
      y: 0,
      image: fogCanvas,
      width: options.width,
      height: options.height,
      listening: false,
    });

    fogLayer.add(fogImage);
    stage.add(fogLayer);

    // Always set up drawing handlers if this is the master
    // They only fire when listening is enabled
    if (interactive) {
      setupDrawing(stage);
    }

    return fogLayer;
  };

  const setupDrawing = (stage: Konva.Stage) => {
    fogImage.on('mousedown touchstart', () => {
      isDrawing = true;
      revealBuffer = [];
      const pos = stage.getPointerPosition();
      if (pos) {
        const point = { x: pos.x, y: pos.y, radius: brushRadius };
        eraseAt(pos.x, pos.y);
        revealBuffer.push(point);
      }
    });

    fogImage.on('mousemove touchmove', () => {
      if (!isDrawing) return;
      const pos = stage.getPointerPosition();
      if (pos) {
        const point = { x: pos.x, y: pos.y, radius: brushRadius };
        eraseAt(pos.x, pos.y);
        revealBuffer.push(point);
      }
    });

    stage.on('mouseup touchend', () => {
      if (isDrawing && revealBuffer.length > 0 && options.onReveal) {
        options.onReveal(revealBuffer);
      }
      isDrawing = false;
      revealBuffer = [];
    });
  };

  const getSnapshotData = (): string => {
    return fogCanvas.toDataURL();
  };

  const loadSnapshot = (dataUrl: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        fogCtx.clearRect(0, 0, options.width, options.height);
        fogCtx.drawImage(img, 0, 0);
        fogImage.image(fogCanvas);
        fogLayer.batchDraw();
        resolve();
      };
      img.src = dataUrl;
    });
  };

  return {
    init,
    eraseAt,
    applyRevealPoints,
    getSnapshotData,
    loadSnapshot,
    setInteractive,
    brushRadius,
  };
};
