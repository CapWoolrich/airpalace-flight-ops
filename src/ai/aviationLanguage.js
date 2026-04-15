const ICAO_WORDS = {
  alpha: "A", bravo: "B", charlie: "C", delta: "D", echo: "E", foxtrot: "F", golf: "G", hotel: "H", india: "I",
  juliett: "J", juliet: "J", kilo: "K", lima: "L", mike: "M", november: "N", oscar: "O", papa: "P", quebec: "Q",
  romeo: "R", sierra: "S", tango: "T", uniform: "U", victor: "V", whiskey: "W", whisky: "W", xray: "X", "x-ray": "X", yankee: "Y", zulu: "Z",
};

const NUMBER_WORDS = {
  zero: "0", oh: "0", one: "1", uno: "1", two: "2", dos: "2", three: "3", tres: "3", four: "4", cuatro: "4", five: "5", cinco: "5",
  six: "6", seis: "6", seven: "7", siete: "7", eight: "8", ocho: "8", nine: "9", nueve: "9",
};

const ABBR_REPLACEMENTS = [
  [/\bmx\b/gi, "mantenimiento"],
  [/\bmaint\b/gi, "mantenimiento"],
  [/\betd\b/gi, "hora estimada de salida"],
  [/\beta\b/gi, "hora estimada de llegada"],
  [/\bete\b/gi, "tiempo estimado en ruta"],
  [/\bpax\b/gi, "pasajeros"],
  [/\brepo\b/gi, "reposicionamiento"],
  [/\bferry\b/gi, "vuelo ferry"],
  [/\bdep\b/gi, "salida"],
  [/\barr\b/gi, "llegada"],
];

function normalizeToken(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

function mapPhoneticToken(token) {
  if (ICAO_WORDS[token]) return ICAO_WORDS[token];
  if (NUMBER_WORDS[token]) return NUMBER_WORDS[token];
  if (/^[a-z]$/i.test(token)) return token.toUpperCase();
  if (/^\d$/.test(token)) return token;
  return null;
}

function collapsePhoneticRuns(input) {
  const parts = String(input || "").split(/(\s+)/);
  const out = [];
  let i = 0;
  while (i < parts.length) {
    const isSpace = /^\s+$/.test(parts[i]);
    if (isSpace) {
      out.push(parts[i]);
      i += 1;
      continue;
    }

    const runIdx = [];
    const runVals = [];
    let j = i;
    while (j < parts.length && !/^\s+$/.test(parts[j])) {
      const mapped = mapPhoneticToken(normalizeToken(parts[j]));
      if (!mapped) break;
      runIdx.push(j);
      runVals.push(mapped);
      j += 2; // skip token + space slot
    }

    const joined = runVals.join("");
    const looksTail = /^N[A-Z0-9]{3,5}$/.test(joined);
    const looksIcao = /^[A-Z]{4}$/.test(joined);
    if (runVals.length >= 4 && (looksTail || looksIcao)) {
      out.push(joined);
      i = runIdx[runIdx.length - 1] + 1;
      continue;
    }

    out.push(parts[i]);
    i += 1;
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

export function normalizeAviationInstruction(instruction) {
  let text = collapsePhoneticRuns(instruction);
  ABBR_REPLACEMENTS.forEach(([pattern, value]) => {
    text = text.replace(pattern, value);
  });
  return text;
}
