import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const WORD = "SLOWPOKE";
const OUTPUT_URL = new URL("../public/wordmark.svg", import.meta.url);

const TILE_WIDTH = 30;
const TILE_HEIGHT = 60;
const LETTER_GAP = 40;
const START_X = 60;
const START_Y = 80;
const NEAR_ECHO_OFFSET = 12;
const FAR_ECHO_OFFSET = 22;
const CANVAS_HEIGHT = 470;
const RIGHT_PADDING = 60;

const TEXT_COLOR = "#0a0a0a";
const TILE_SEAM_COLOR = "#343434";

const GLYPHS = {
  S: ["111111", "110000", "111111", "000011", "111111"],
  L: ["110000", "110000", "110000", "110000", "111111"],
  O: ["011110", "110011", "110011", "110011", "011110"],
  W: ["11000011", "11000011", "11000011", "11011011", "01100110"],
  P: ["111110", "110011", "111110", "110000", "110000"],
  K: ["110011", "110110", "111100", "110110", "110011"],
  E: ["111111", "110000", "111110", "110000", "111111"],
};

function getGlyphWidth(letter) {
  return GLYPHS[letter][0].length * TILE_WIDTH;
}

function createGlyphPath(rows) {
  const segments = [];

  rows.forEach((row, rowIndex) => {
    let column = 0;

    while (column < row.length) {
      if (row[column] === "0") {
        column += 1;
        continue;
      }

      const startColumn = column;

      while (column < row.length && row[column] === "1") {
        column += 1;
      }

      const x = startColumn * TILE_WIDTH;
      const y = rowIndex * TILE_HEIGHT;
      const width = (column - startColumn) * TILE_WIDTH;

      segments.push(`M${x} ${y}H${x + width}V${y + TILE_HEIGHT}H${x}Z`);
    }
  });

  return segments.join(" ");
}

function createGlyphDefinitions() {
  return [...new Set(WORD)]
    .map(
      (letter) =>
        `    <g id="glyph-${letter.toLowerCase()}"><path d="${createGlyphPath(GLYPHS[letter])}"/></g>`,
    )
    .join("\n");
}

function createLetterPlacements() {
  let x = START_X;

  return [...WORD].map((letter) => {
    const placement = {
      href: `#glyph-${letter.toLowerCase()}`,
      x,
    };

    x += getGlyphWidth(letter) + LETTER_GAP;
    return placement;
  });
}

function createUses(placements, indentation = "    ") {
  return placements
    .map(
      ({ href, x }) => `${indentation}<use href="${href}" transform="translate(${x} ${START_Y})"/>`,
    )
    .join("\n");
}

function createSvg() {
  const placements = createLetterPlacements();
  const lastPlacement = placements.at(-1);
  const canvasWidth =
    lastPlacement.x + getGlyphWidth(WORD.at(-1)) + FAR_ECHO_OFFSET + RIGHT_PADDING;
  const uses = createUses(placements);

  return `<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${canvasWidth} ${CANVAS_HEIGHT}"
     role="img"
     aria-labelledby="title description">
  <title id="title">Slowpoke modular wordmark</title>
  <desc id="description">
    The word Slowpoke rendered in black modular lettering with two offset outline echoes on a transparent background.
  </desc>

  <defs>
    <pattern id="brick-fill"
             width="${TILE_WIDTH}"
             height="${TILE_HEIGHT}"
             patternUnits="userSpaceOnUse">
      <rect width="${TILE_WIDTH}" height="${TILE_HEIGHT}" fill="${TEXT_COLOR}"/>
      <path d="M0.5 0.5H${TILE_WIDTH - 0.5}V${TILE_HEIGHT - 0.5}H0.5Z"
            fill="none"
            stroke="${TILE_SEAM_COLOR}"
            stroke-width="1"
            opacity="0.58"/>
    </pattern>

    <filter id="exterior-outline"
            x="-12%"
            y="-12%"
            width="140%"
            height="140%"
            color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha"
                    operator="dilate"
                    radius="2.5"
                    result="expanded"/>
      <feComposite in="expanded"
                   in2="SourceAlpha"
                   operator="out"
                   result="ring"/>
      <feFlood flood-color="${TEXT_COLOR}" result="outline-color"/>
      <feComposite in="outline-color"
                   in2="ring"
                   operator="in"/>
    </filter>

${createGlyphDefinitions()}
  </defs>

  <g transform="translate(${FAR_ECHO_OFFSET} ${FAR_ECHO_OFFSET})"
     filter="url(#exterior-outline)"
     opacity="0.98">
${uses}
  </g>

  <g transform="translate(${NEAR_ECHO_OFFSET} ${NEAR_ECHO_OFFSET})"
     filter="url(#exterior-outline)"
     opacity="0.98">
${uses}
  </g>

  <g fill="url(#brick-fill)">
${uses}
  </g>
</svg>
`;
}

await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(OUTPUT_URL, createSvg(), "utf8");

console.log(`Generated ${fileURLToPath(OUTPUT_URL)}`);
