import { quickFormats, type QuickFormat } from '@gitroom/helpers/studio/studio.quick';
import type { StudioScene } from '@gitroom/helpers/studio/studio.types';

const brand = {
  navy: '#061a33',
  ink: '#071a31',
  muted: '#405367',
  lime: '#ced62a',
  paper: '#f5f7f4',
  white: '#ffffff',
};

const loadImage = async (name: string) => {
  const image = new Image();
  image.src = `/confenge-studio/${name}`;
  await image.decode();
  return image;
};

async function loadBrand() {
  const type = new FontFace('CONFENGE Archivo', 'url(/confenge-studio/archivo.woff2)', {
    weight: '100 900',
  });
  const [logo, white, photo] = await Promise.all([
    loadImage('logo.png'), loadImage('logo-white.png'), loadImage('obra.jpg'),
    type.load(),
  ]);
  const fonts = document.fonts as FontFaceSet & { add(face: FontFace): FontFaceSet };
  fonts.add(type);
  return { logo, white, photo };
}

let brandAssets: ReturnType<typeof loadBrand> | undefined;

function lines(ctx: CanvasRenderingContext2D, value: string, width: number) {
  const rows: string[] = [];
  let row = '';
  for (const word of value.trim().split(/\s+/)) {
    const candidate = row ? `${row} ${word}` : word;
    if (ctx.measureText(candidate).width > width && row) {
      rows.push(row);
      row = word;
    } else {
      row = candidate;
    }
  }
  rows.push(row);
  return rows;
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  style: { y: number; size: number; weight: number; color: string; maxHeight: number; x?: number; width?: number },
) {
  const { x = 80, width = 920 } = style;
  const paragraphs = value.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  const textBlocks = [...paragraphs.slice(0, 2), paragraphs.slice(2).join(' ')].filter(Boolean);
  let size = style.size;
  let rows: string[];
  do {
    ctx.font = `${style.weight} ${size}px "CONFENGE Archivo"`;
    rows = textBlocks.flatMap(row => lines(ctx, row, width));
    if (rows.length * size * 1.18 <= style.maxHeight &&
        rows.every(row => ctx.measureText(row).width <= width)) break;
    size -= 2;
  } while (size >= 24);
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'top';
  rows.forEach((row, index) => ctx.fillText(row, x, style.y + index * size * 1.18, width));
  return style.y + rows.length * size * 1.18;
}

export async function renderQuickCard(scene: StudioScene, index: number, format: QuickFormat): Promise<Blob> {
  brandAssets ??= loadBrand().catch(error => { brandAssets = undefined; throw error; });
  const { logo, white, photo } = await brandAssets;
  const { width, height, count } = quickFormats[format];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A prévia de imagem não está disponível neste navegador.');
  const cover = index === 0 && count > 1;
  const last = count > 1 && index === count - 1;
  const dark = cover || index === 2;
  ctx.fillStyle = dark ? brand.navy : last ? brand.lime : brand.paper;
  ctx.fillRect(0, 0, width, height);
  const mark = dark ? white : logo;
  ctx.drawImage(mark, 80, 68, 272, 272 * mark.naturalHeight / mark.naturalWidth);
  ctx.fillStyle = dark ? brand.lime : brand.navy;
  ctx.fillRect(80, 178, 62, 8);
  const titleEnd = text(ctx, scene.visual, {
    y: 217, size: cover ? 98 : 88, weight: 790,
    color: dark ? brand.white : brand.ink, maxHeight: 322,
  });
  if (cover) {
    const bodyEnd = text(ctx, scene.narration, {
      y: titleEnd + 32, size: 42, weight: 470, color: '#dfe8f2', maxHeight: 172,
    });
    const graphicTop = Math.max(bodyEnd + 54, height * 0.55);
    const graphicHeight = height - graphicTop - 134;
    // The right-hand crop of the site's sharing image holds the construction photo.
    const sourceHeight = 540 * graphicHeight / 920;
    ctx.drawImage(photo, 660, 374 - sourceHeight / 2, 540, sourceHeight, 80, graphicTop, 920, graphicHeight);
  } else {
    const panelTop = Math.max(titleEnd + 38, 440);
    const panelHeight = height - panelTop - 134;
    ctx.fillStyle = last ? brand.navy : dark ? '#0a294b' : '#e8edea';
    ctx.fillRect(80, panelTop, 920, panelHeight);
    ctx.fillStyle = dark || last ? brand.lime : brand.navy;
    ctx.fillRect(80, panelTop, 8, panelHeight);
    text(ctx, scene.narration, {
      x: 132, width: 816, y: panelTop + 54, size: 60, weight: 550,
      color: dark || last ? brand.white : brand.ink, maxHeight: panelHeight - 108,
    });
  }
  ctx.fillStyle = dark ? '#b8c9d9' : brand.muted;
  ctx.font = '600 23px "CONFENGE Archivo"';
  ctx.fillText('confenge.com.br', 80, height - 88);
  if (count > 1) {
    ctx.textAlign = 'right';
    ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`, 1000, height - 88);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG.')), 'image/png')
  );
}
