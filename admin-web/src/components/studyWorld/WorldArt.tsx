import { useEffect, useMemo, useRef } from 'react';
import {
  DEFAULT_LOOK,
  GRID_H,
  GRID_W,
  OY,
  buildAvatar,
  buildPet,
  drawEffectsBehind,
  drawEffectsFront,
  paintGrid,
  type AvatarLook,
} from '../../vendor/study-world/avatar';
import { createWorldMap, isMapId } from '../../vendor/study-world/maps';

/** Draws an avatar exactly as the website does (same code, copied in src/vendor). */
export function AvatarArt({ look, scale = 4, animate = true }: { look: AvatarLook; scale?: number; animate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const petRoom = look.pet !== 'none' ? 12 : 0;
  const width = (GRID_W + petRoom) * scale;
  const height = (GRID_H + 2) * scale;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const sprite = document.createElement('canvas');
    sprite.width = GRID_W;
    sprite.height = GRID_H;
    const pet = document.createElement('canvas');
    pet.width = 14;
    pet.height = 14;
    let raf = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const blink = animate && t % 3200 < 120;
      drawEffectsBehind(ctx, look, 0, scale, scale, t);
      paintGrid(buildAvatar(look, t, 1, blink, 'f'), sprite);
      ctx.drawImage(sprite, 0, 0, GRID_W, GRID_H, 0, scale, GRID_W * scale, GRID_H * scale);
      drawEffectsFront(ctx, look, 0, scale, scale, t);
      if (petRoom) {
        const floaty = look.pet === 'dragon' || look.pet === 'ghost';
        const bob = floaty ? Math.round(Math.sin(t / 300) * 2) - 3 : 0;
        paintGrid(buildPet(look.pet, t), pet);
        ctx.drawImage(pet, 0, 0, 14, 14, (GRID_W - 3) * scale, (OY + 20 + bob) * scale, 14 * scale, 14 * scale);
      }
      if (animate) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [look, scale, animate, petRoom]);

  return <canvas ref={ref} width={width} height={height} style={{ width, height, imageRendering: 'pixelated' }} />;
}

/**
 * A still picture of a whole map: the website's own map builder paints the
 * ground, furniture and tree tops, scaled down to fit.
 */
export function MapPreview({ mapKey, className }: { mapKey: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const map = useMemo(() => {
    if (!isMapId(mapKey)) return null;
    try {
      return createWorldMap(mapKey);
    } catch {
      return null;
    }
  }, [mapKey]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !map) return;
    canvas.width = map.base.width;
    canvas.height = map.base.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = map.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(map.base, 0, 0);
    ctx.drawImage(map.over, 0, 0);
  }, [map]);

  if (!map) {
    return (
      <div className={`grid place-items-center bg-slate-100 text-xs font-bold text-slate-400 dark:bg-slate-800 ${className ?? ''}`}>
        No map built in the website yet
      </div>
    );
  }
  return (
    <canvas
      ref={ref}
      className={`w-full object-contain ${className ?? ''}`}
      style={{ imageRendering: 'pixelated', background: map.bg }}
    />
  );
}

const LOOK_FIELD: Record<string, keyof AvatarLook> = {
  hair: 'hair', eyes: 'eyes', top: 'top', bottom: 'bottom', shoes: 'shoes',
  head: 'head', face: 'face', back: 'back', pet: 'pet', effect: 'effect', hair_dye: 'hairColor',
};

/**
 * The part of the avatar each kind of item sits on, in avatar grid pixels
 * [x, y, width, height] (measured from the website's drawing code). Pictures
 * zoom to that part so, say, three eye shapes look different at a glance.
 * Back items and effects show the whole body.
 */
const FOCUS: Record<string, [number, number, number, number]> = {
  hair: [1, 0, 26, 26],
  hair_dye: [1, 0, 26, 26],
  head: [3, -1, 22, 19],
  eyes: [6, 9, 16, 11],
  face: [6, 9, 16, 11],
  top: [3, 17, 22, 14],
  bottom: [5, 25, 18, 12],
  shoes: [6, 30, 16, 8],
  back: [0, -1, 28, 39],
  effect: [0, -1, 28, 39],
};

/** One pet on its own, big. */
function PetArt({ type, scale }: { type: string; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    const draw = (t: number) => {
      paintGrid(buildPet(type, t), canvas);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [type]);
  return <canvas ref={ref} width={14} height={14} style={{ width: 14 * scale, height: 14 * scale, imageRendering: 'pixelated' }} />;
}

/**
 * A shop item's picture, drawn by the website's own code and zoomed to the
 * part of the body it changes: a hat shows the head, shoes show the feet, a
 * pet shows the pet. Café items show their emoji. Keys the website can't
 * draw yet show a placeholder.
 */
export function ItemPicture({
  category,
  itemKey,
  emoji,
  drawn,
  size = 112,
  animate = false,
  whole = false,
}: {
  category: string;
  itemKey: string;
  emoji?: string | null;
  drawn: boolean;
  /** Square box in CSS pixels. */
  size?: number;
  animate?: boolean;
  /** Show the whole avatar instead of zooming to the item's part. */
  whole?: boolean;
}) {
  const field = LOOK_FIELD[category];
  const look = useMemo(
    () => (field ? { ...DEFAULT_LOOK, [field]: itemKey } : DEFAULT_LOOK),
    [field, itemKey],
  );
  const box = { width: size, height: size };

  if (!field) {
    return <div className="grid place-items-center" style={box}><span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{emoji || '🍽️'}</span></div>;
  }
  if (!drawn || !itemKey) {
    return <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 text-center text-[11px] font-bold leading-tight text-slate-400 dark:border-slate-700" style={box}>No picture<br />yet</div>;
  }
  if (category === 'pet') {
    if (itemKey === 'none') return <div className="grid place-items-center text-xs font-bold text-slate-400" style={box}>No pet</div>;
    return <div className="grid place-items-center" style={box}><PetArt type={itemKey} scale={Math.max(1, Math.floor(size / 14))} /></div>;
  }

  const [x, y, w, h] = whole ? FOCUS.back : (FOCUS[category] ?? FOCUS.back);
  const zoom = Math.max(1, Math.floor(Math.min(size / w, size / h)));
  // AvatarArt draws the body one grid row down (room for halos and effects).
  return (
    <div className="grid place-items-center" style={box}>
      <div className="overflow-hidden" style={{ width: w * zoom, height: h * zoom }}>
        <div style={{ marginLeft: -x * zoom, marginTop: -(y + 1) * zoom }}>
          <AvatarArt look={look} scale={zoom} animate={animate || category === 'effect' || category === 'hair_dye'} />
        </div>
      </div>
    </div>
  );
}
