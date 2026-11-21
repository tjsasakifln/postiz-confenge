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
  style: { y: number; size: number; weight: number; color: string; maxHeight: number },
) {
  let size = style.size;
  let rows: string[];
  do {
    ctx.font = `${style.weight} ${size}px "CONFENGE Archivo"`;
    rows = lines(ctx, value, 920);
    if (rows.length * size * 1.08 <= style.maxHeight &&
        rows.every(row => ctx.measureText(row).width <= 920)) break;
    size -= 2;
  } while (size >= 24);
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'top';
  rows.forEach((row, index) => ctx.fillText(row, 80, style.y + index * size * 1.08, 920));
  return style.y + rows.length * size * 1.08;
}

function grid(ctx: CanvasRenderingContext2D, top: number, height: number, dark: boolean, offset: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(80, top, 920, height);
  ctx.clip();
  ctx.fillStyle = dark ? '#0a294b' : '#e8edea';
  ctx.fillRect(80, top, 920, height);
  ctx.strokeStyle = dark ? '#325171' : '#cdd8d5';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let column = 80; column < 1000; column += 44) {
    ctx.moveTo(column, top);
    ctx.lineTo(column, top + height);
  }
  for (let row = top; row < top + height; row += 44) {
    ctx.moveTo(80, row);
    ctx.lineTo(1000, row);
  }
  ctx.stroke();
  ctx.strokeStyle = dark ? brand.lime : '#2d6f2d';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(80, top + height * 0.7);
  ctx.lineTo(334 + offset, top + height * 0.29);
  ctx.lineTo(580, top + height * 0.55);
  ctx.lineTo(1000, top + height * 0.16);
  ctx.stroke();
  for (const [x, y] of [[334 + offset, 0.29], [580, 0.55]]) {
    ctx.beginPath();
    ctx.arc(x, top + height * y, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
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
  const cover = index === 0;
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
  const bodyEnd = text(ctx, scene.narration, {
    y: titleEnd + 32, size: 42, weight: 470,
    color: dark ? '#dfe8f2' : brand.ink, maxHeight: 172,
  });
  const graphicTop = Math.max(bodyEnd + 54, height * 0.55);
  const graphicHeight = height - graphicTop - 134;
  if (cover) {
    // The right-hand crop of the site's sharing image holds the construction photo.
    const sourceHeight = 540 * graphicHeight / 920;
    ctx.drawImage(photo, 660, 374 - sourceHeight / 2, 540, sourceHeight, 80, graphicTop, 920, graphicHeight);
  } else if (last) {
    ctx.fillStyle = brand.navy;
    ctx.fillRect(80, graphicTop, 920, graphicHeight);
    ctx.fillStyle = brand.white;
    ctx.font = '650 44px "CONFENGE Archivo"';
    ctx.fillText('confenge.com.br', 124, graphicTop + graphicHeight / 2 - 24);
    ctx.fillStyle = brand.lime;
    ctx.fillText('↗', 912, graphicTop + graphicHeight / 2 - 24);
  } else {
    grid(ctx, graphicTop, graphicHeight, dark, index * 76);
  }
  ctx.fillStyle = dark ? '#b8c9d9' : brand.muted;
  ctx.font = '600 23px "CONFENGE Archivo"';
  if (!last) ctx.fillText('confenge.com.br', 80, height - 88);
  if (count > 1) {
    ctx.textAlign = 'right';
    ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`, 1000, height - 88);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG.')), 'image/png')
  );
}
