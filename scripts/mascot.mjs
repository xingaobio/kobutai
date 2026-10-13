// Shared drawing code for the generated blob mascots (built-in packs, library packs, icons).

export const W = 192;
export const H = 208;
export const FRAMES = 8;
export const ROWS = ['idle', 'playing', 'paused', 'appear', 'click'];


function prop(kind, c, t) {
  switch (kind) {
    case 'mic':
      return `<g transform="translate(132 ${118 - 6 * Math.sin(t)}) rotate(-25)"><rect x="-4" y="0" width="8" height="34" rx="3" fill="#444"/><circle cx="0" cy="-4" r="10" fill="${c.accent}" stroke="#333" stroke-width="2"/></g>`;
    case 'guitar':
      return `<g transform="translate(96 150) rotate(${-20 + 8 * Math.sin(t)})"><ellipse cx="0" cy="0" rx="26" ry="18" fill="${c.accent}"/><rect x="18" y="-4" width="48" height="8" fill="#7a4b2a"/><circle cx="0" cy="0" r="6" fill="#111"/></g>`;
    case 'headphones':
      return `<path d="M52 92 Q96 26 140 92" fill="none" stroke="${c.accent}" stroke-width="9" stroke-linecap="round"/><rect x="42" y="86" width="18" height="30" rx="8" fill="${c.accent}"/><rect x="132" y="86" width="18" height="30" rx="8" fill="${c.accent}"/>`;
    case 'glasses':
      return `<g fill="none" stroke="${c.accent}" stroke-width="4"><circle cx="80" cy="104" r="13"/><circle cx="114" cy="104" r="13"/><path d="M93 104 h8"/></g>`;
    default:
      return '';
  }
}

function eyes(state, blink) {
  if (state === 'paused' || blink) {
    return `<path d="M72 104 q8 6 16 0 M106 104 q8 6 16 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
  return `<circle cx="80" cy="104" r="7" fill="#222"/><circle cx="114" cy="104" r="7" fill="#222"/><circle cx="82" cy="101" r="2.5" fill="#fff"/><circle cx="116" cy="101" r="2.5" fill="#fff"/>`;
}

export function frame(c, state, i) {
  const t = (i / FRAMES) * Math.PI * 2;
  let dy = 0, sx = 1, sy = 1, rot = 0, extra = '', mouth = '<path d="M88 124 q9 8 18 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>';
  let arm = '';
  switch (state) {
    case 'idle':
      sy = 1 + 0.03 * Math.sin(t);
      sx = 1 - 0.02 * Math.sin(t);
      break;
    case 'playing':
      dy = -14 * Math.abs(Math.sin(t));
      rot = 8 * Math.sin(t);
      mouth = `<ellipse cx="97" cy="126" rx="9" ry="${4 + 4 * Math.abs(Math.sin(t * 2))}" fill="#222"/>`;
      extra = `<text x="${150 + 6 * Math.sin(t)}" y="${50 - 10 * ((i % 4) / 4)}" font-size="26" fill="${c.accent}" stroke="#333" stroke-width="1">♪</text><text x="${24 - 6 * Math.sin(t)}" y="${70 - 10 * (((i + 2) % 4) / 4)}" font-size="22" fill="${c.accent}" stroke="#333" stroke-width="1">♫</text>`;
      break;
    case 'paused':
      sy = 0.96 + 0.02 * Math.sin(t);
      mouth = '<path d="M90 126 h14" stroke="#222" stroke-width="4" stroke-linecap="round"/>';
      extra = `<text x="${140 + i * 2}" y="${60 - i * 3}" font-size="${18 + i}" fill="#555" opacity="${1 - i / 10}">z</text>`;
      break;
    case 'appear':
      dy = 30 * (1 - i / (FRAMES - 1));
      sy = 0.6 + 0.4 * (i / (FRAMES - 1));
      arm = `<path d="M150 130 q20 ${-30 - 12 * Math.sin(t * 2)} 30 -40" stroke="${c.body}" stroke-width="14" stroke-linecap="round" fill="none"/>`;
      break;
    case 'click':
      sy = i < 3 ? 1 - 0.12 * i : 1;
      dy = i >= 3 ? -26 * Math.sin(((i - 3) / 4) * Math.PI) : 0;
      extra = i >= 3 ? `<text x="140" y="56" font-size="28">✨</text>` : '';
      break;
  }
  const blink = state === 'idle' && i === 5;
  return `<g transform="translate(0 ${dy.toFixed(1)})"><g transform="translate(96 196) rotate(${rot.toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-96 -196)">
<ellipse cx="96" cy="200" rx="54" ry="6" fill="#000" opacity="0.15"/>
<path d="M36 196 Q30 70 96 64 Q162 70 156 196 Z" fill="${c.body}" stroke="#333" stroke-width="3"/>
<circle cx="66" cy="122" r="8" fill="#ff6b8b" opacity="0.4"/><circle cx="128" cy="122" r="8" fill="#ff6b8b" opacity="0.4"/>
${eyes(state, blink)}${mouth}${arm}${prop(c.prop, c, t)}</g>${extra}</g>`;
}

export function sheet(c) {
  const cells = [];
  ROWS.forEach((state, r) => {
    for (let i = 0; i < FRAMES; i++) {
      cells.push(`<g transform="translate(${i * W} ${r * H})"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="hidden">${frame(c, state, i)}</svg></g>`);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * FRAMES}" height="${H * ROWS.length}" viewBox="0 0 ${W * FRAMES} ${H * ROWS.length}">${cells.join('\n')}</svg>\n`;
}


export function packJson(c, src) {
  const states = {};
  ROWS.forEach((state, row) => {
    const once = state === 'appear' || state === 'click';
    states[state] = { kind: 'sprite', src, frames: FRAMES, cols: FRAMES, row, fps: state === 'playing' ? 10 : 6, ...(once ? { loop: false } : {}) };
  });
  return { id: c.id, name: c.name, author: 'Kobutai', license: 'MIT', tags: c.tags, size: { w: W, h: H }, states };
}
