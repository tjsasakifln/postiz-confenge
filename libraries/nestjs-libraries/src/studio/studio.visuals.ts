import sharp from 'sharp';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[
        character
      ]!)
  );
const fonts = {
  sans: 'DejaVu Sans',
  serif: 'DejaVu Serif',
  mono: 'DejaVu Sans Mono',
};
const contrast = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#132128' : '#ffffff';
};
export function studioBrand(document: StudioDocument) {
  const identity = document.identity;
  const legacyColors = identity.visualStyle.match(/#[a-fA-F0-9]{6}\b/g) || [];
  const color = (value: string | undefined, fallback: string) =>
    value && /^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
  return {
    name: (identity.brandName || identity.positioning).trim().slice(0, 80),
    primary: color(identity.primaryColor, legacyColors[0] || '#f9733d'),
    secondary: color(identity.secondaryColor, legacyColors[1] || '#132128'),
    font: fonts[identity.fontFamily || 'sans'] || fonts.sans,
  };
}

/** Original geometric marks, with no imported logo, font or image assets. */
export async function studioBrandImage(
  document: StudioDocument,
  name: string,
  role: 'logo' | 'avatar' | 'banner' | 'watermark',
  variant: number,
  destination: string
) {
  const brand = studioBrand(document);
  const sizes = {
    logo: [1200, 320],
    avatar: [800, 800],
    banner: [2560, 1440],
    watermark: [150, 150],
  };
  const [width, height] = sizes[role];
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0])
    .join('')
    .toUpperCase();
  const mark = (cx: number, cy: number, radius: number) => {
    const shape =
      variant === 1
        ? `<path d="M ${cx} ${cy - radius} L ${cx + radius} ${cy} L ${cx} ${
            cy + radius
          } L ${cx - radius} ${cy} Z" fill="${brand.primary}"/>`
        : variant === 2
        ? `<rect x="${cx - radius}" y="${cy - radius}" width="${
            2 * radius
          }" height="${2 * radius}" rx="${radius / 3}" fill="${
            brand.primary
          }"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${brand.primary}"/>`;
    return `${shape}<text x="${cx}" y="${
      cy + radius * 0.24
    }" text-anchor="middle" fill="${contrast(brand.primary)}" font-family="${
      brand.font
    }" font-size="${radius * 0.72}" font-weight="bold">${escapeXml(
      initials
    )}</text>`;
  };
  let content: string;
  if (role === 'avatar' || role === 'watermark') {
    content =
      (role === 'avatar'
        ? `<rect width="100%" height="100%" fill="${brand.secondary}"/>`
        : '') + mark(width / 2, height / 2, width * 0.36);
  } else {
    const isBanner = role === 'banner';
    // Keep all text and mark inside a conservative 1235 x 338 central rectangle,
    // smaller than the scaled safe area on a 2560 x 1440 YouTube banner.
    const x = isBanner ? 662 : 45;
    const baseline = isBanner ? 720 : 160;
    const markRadius = 100;
    const labelX = x + 240;
    const labelWidth = isBanner ? 900 : 820;
    const fontSize = Math.min(
      76,
      Math.max(10, Math.floor(labelWidth / Math.max([...name].length * 0.7, 1)))
    );
    content =
      (isBanner
        ? `<rect width="100%" height="100%" fill="${brand.secondary}"/>`
        : '') +
      mark(x + markRadius, baseline, markRadius) +
      `<text x="${labelX}" y="${baseline + fontSize * 0.33}" font-family="${
        brand.font
      }" font-size="${fontSize}" font-weight="bold" fill="${
        isBanner ? contrast(brand.secondary) : brand.secondary
      }">${escapeXml(name)}</text>`;
  }
  await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`
    )
  )
    .png()
    .toFile(destination);
}

export async function studioFrameCover(
  framePath: string,
  destination: string,
  document: StudioDocument,
  title: string,
  format: 'vertical' | 'horizontal'
) {
  const [width, height] = format === 'vertical' ? [1080, 1920] : [1920, 1080];
  const brand = studioBrand(document);
  const words = title
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((word) =>
      [...word].length > 36 ? [...word].slice(0, 35).join('') + '…' : word
    );
  const longest = Math.max(...words.map((word) => [...word].length), 1);
  const fontSize = Math.min(
    format === 'vertical' ? 112 : 124,
    Math.floor((width - 200) / (longest * 0.75))
  );
  const lineHeight = fontSize * 1.2;
  const blockHeight = Math.min(
    height * 0.58,
    Math.max(lineHeight * words.length + 180, height * 0.3)
  );
  const top = Math.floor(height - blockHeight);
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect y="${top}" width="${width}" height="${
    height - top
  }" fill="#08131e" opacity="0.86"/><rect x="88" y="${
    top + 48
  }" width="100" height="10" fill="${brand.primary}"/>${words
    .map(
      (word, i) =>
        `<text x="88" y="${
          top + 180 + i * lineHeight
        }" fill="#ffffff" font-family="${
          brand.font
        }" font-size="${fontSize}" font-weight="bold">${escapeXml(word)}</text>`
    )
    .join('')}</svg>`;
  await sharp(framePath)
    .resize(width, height, { fit: 'cover' })
    .composite([{ input: Buffer.from(overlay) }])
    .png()
    .toFile(destination);
}
