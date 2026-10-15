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
import { LOOK_FIELD } from './look';
import { TILE } from '../../vendor/study-world/maps/kit';
import { createDormMap, dormFloor, furnitureOf } from '../../vendor/study-world/maps/dorm';
import { ENTRANCE_MS, EMOTE_PACKS, drawBubble, drawEntrance, drawNameFrame } from '../../vendor/study-world/showoff';
import { FISH_GRID_H, FISH_GRID_W, buildFish, drawFishGlow, hasGlow, type FishArtKey } from '../../vendor/study-world/fish-art';

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
        // Same list as the website's AvatarCanvas: these pets hover above the ground.
        const floaty = ['dragon', 'ghost', 'drone', 'phoenix', 'robobuddy', 'parrot'].includes(look.pet);
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

  if (SHOWOFF_KINDS.has(category)) {
    if (!drawn || !itemKey) {
      return <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 text-center text-[11px] font-bold leading-tight text-slate-400 dark:border-slate-700" style={box}>No picture<br />yet</div>;
    }
    return <ShowoffArt category={category} itemKey={itemKey} size={size} />;
  }
  if (category === 'furniture' || category === 'room_theme') {
    if (!drawn || !itemKey) {
      return <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 text-center text-[11px] font-bold leading-tight text-slate-400 dark:border-slate-700" style={box}>No picture<br />yet</div>;
    }
    return <DormArt category={category} itemKey={itemKey} size={size} />;
  }
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

/** A fish, drawn by the website's own fish code. Ultra rare fish glow and shimmer. */
export function FishArt({ species, scale = 3, animate = false }: { species: string; scale?: number; animate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const known = species in FISH_KEYS;
  const pad = 4;
  const width = (FISH_GRID_W + pad * 2) * scale;
  const height = (FISH_GRID_H + pad * 2) * scale;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !known) return;
    const key = species as FishArtKey;
    const sprite = document.createElement('canvas');
    sprite.width = FISH_GRID_W;
    sprite.height = FISH_GRID_H;
    let raf = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      if (hasGlow(key)) drawFishGlow(ctx, key, width / 2, height / 2, (FISH_GRID_W / 2 + pad) * scale, t);
      paintGrid(buildFish(key, t), sprite);
      ctx.drawImage(sprite, 0, 0, FISH_GRID_W, FISH_GRID_H, pad * scale, pad * scale, FISH_GRID_W * scale, FISH_GRID_H * scale);
      if (animate) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [species, scale, animate, known, width, height]);

  if (!known) return <div className="grid place-items-center text-2xl" style={{ width, height }}>🐟</div>;
  return <canvas ref={ref} width={width} height={height} style={{ width, height, imageRendering: 'pixelated' }} />;
}

const FISH_KEYS: Record<FishArtKey, true> = {
  minnow: true, tilapia: true, carp: true, koi: true, toman: true, gourami: true, starkoi: true, thunder: true, dragon: true,
};

/**
 * Show-off items drawn with the website's own code: a name frame around a
 * sample name, a chat bubble with a sample line, an entrance effect playing
 * around the default avatar, or an emote pack's emojis.
 */
function ShowoffArt({ category, itemKey, size }: { category: string; itemKey: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pack = category === 'emote_pack' ? EMOTE_PACKS.find((p) => p.id === itemKey) : undefined;

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || category === 'emote_pack') return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const sprite = document.createElement('canvas');
    sprite.width = GRID_W;
    sprite.height = GRID_H;
    paintGrid(buildAvatar(DEFAULT_LOOK, 0, 1, false, 'f'), sprite);
    const s = Math.max(1, Math.floor(size / 48));
    let raf = 0;
    const draw = (t: number) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      g.imageSmoothingEnabled = false;
      const cx = size / 2;
      if (category === 'name_frame' || category === 'chat_bubble') {
        const text = category === 'name_frame' ? 'Izwan' : 'Jom study!';
        const fontPx = Math.round(size / 9);
        g.font = `700 ${fontPx}px system-ui, sans-serif`;
        const w = g.measureText(text).width + fontPx * 1.4;
        const h = fontPx * 1.7;
        const y = size / 2 - h / 2;
        const colour = category === 'name_frame'
          ? drawNameFrame(g, itemKey, cx, y, w, h, t, '#ffffff')
          : drawBubble(g, itemKey, cx, y, w, h, t);
        g.fillStyle = colour;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, cx, y + h / 2 + 1);
      } else if (category === 'entrance') {
        const w = GRID_W * s;
        const h = GRID_H * s;
        const fy = size / 2 + h / 2;
        g.drawImage(sprite, 0, 0, GRID_W, GRID_H, cx - w / 2, fy - h, w, h);
        drawEntrance(g, itemKey, cx, fy, s, t % (ENTRANCE_MS + 700));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [category, itemKey, size]);

  if (category === 'emote_pack') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-1" style={{ width: size, height: size, fontSize: size / 4.5 }}>
        {pack ? pack.emotes.map((e) => <span key={e.key} title={e.label}>{e.emoji}</span>) : '🎭'}
      </div>
    );
  }
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

const SHOWOFF_KINDS = new Set(['name_frame', 'chat_bubble', 'entrance', 'emote_pack']);

/**
 * Dorm pieces drawn by the website's own room builder: a furniture piece is
 * placed alone in a small test room and zoomed in; a theme shows the whole
 * empty room in that look.
 */
function DormArt({ category, itemKey, size }: { category: string; itemKey: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const floor = dormFloor('small');
    const piece = category === 'furniture' ? furnitureOf(itemKey) : undefined;
    let map;
    try {
      map = createDormMap({
        size: 'small',
        theme: category === 'room_theme' ? itemKey : 'cozy',
        items: piece ? [{ id: 'preview', item: itemKey, x: floor.x0 + 1, y: floor.y0 + 1 }] : [],
      });
    } catch {
      return;
    }
    // Crop: the piece plus one tile round it (and a tile above for tall things), or the whole room.
    const [sx, sy, sw, sh] = piece
      ? [(floor.x0) * TILE, (floor.y0 - 1) * TILE, (piece.w + 2) * TILE, (piece.h + 2) * TILE]
      : [0, 0, map.base.width, map.base.height];
    canvas.width = sw;
    canvas.height = sh;
    g.imageSmoothingEnabled = false;
    g.fillStyle = map.bg;
    g.fillRect(0, 0, sw, sh);
    g.drawImage(map.base, sx, sy, sw, sh, 0, 0, sw, sh);
    g.drawImage(map.over, sx, sy, sw, sh, 0, 0, sw, sh);
  }, [category, itemKey]);
  return (
    <div className="grid place-items-center" style={{ width: size, height: size }}>
      <canvas ref={ref} className="max-h-full max-w-full" style={{ imageRendering: 'pixelated', width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
}
