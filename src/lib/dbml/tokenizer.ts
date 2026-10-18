export type TokenType = "ident" | "string" | "number" | "punct";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}

function stripComments(input: string): string {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    if (input[i] === "/" && input[i + 1] === "/") {
      while (i < n && input[i] !== "\n") i++;
    } else if (input[i] === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < n && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
    } else {
      out += input[i];
      i++;
    }
  }
  return out;
}

export function tokenize(input: string): Token[] {
  const src = stripComments(input);
  const tokens: Token[] = [];
  const n = src.length;
  let i = 0;
  let line = 1;

  while (i < n) {
    const c = src[i];

    if (/\s/.test(c)) {
      if (c === "\n") line++;
      i++;
      continue;
    }

    if (c === "#") {
      let j = i + 1;
      while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
      tokens.push({ type: "ident", value: src.slice(i, j), line });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_\.]/.test(src[j])) j++;
      tokens.push({ type: "ident", value: src.slice(i, j), line });
      i = j;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      let str = "";
      while (j < n && src[j] !== quote) {
        if (src[j] === "\\") {
          str += src[j];
          j++;
          if (j < n) {
            str += src[j];
            j++;
          }
        } else {
          if (src[j] === "\n") line++;
          str += src[j];
          j++;
        }
      }
      j++; // skip closing
      tokens.push({ type: "string", value: str, line });
      i = j;
      continue;
    }

    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9\.]/.test(src[j])) j++;
      tokens.push({ type: "number", value: src.slice(i, j), line });
      i = j;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (two === "<>" || two === ">=" || two === "<=" || two === "->") {
      tokens.push({ type: "punct", value: two, line });
      i += 2;
      continue;
    }

    if ("{}[](),:><-.=".includes(c)) {
      tokens.push({ type: "punct", value: c, line });
      i++;
      continue;
    }

    // skip unknown character
    i++;
  }

  return tokens;
}