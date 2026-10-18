import { tokenize, Token } from "./tokenizer";
import {
  DBMLParseResult,
  DBMLTable,
  DBMLColumn,
  DBMLRef,
  DBMLEnum,
  DBMLEnumValue,
  DBMLTableGroup,
  DBMLParseError,
} from "./types";

const TOP_LEVEL = new Set(["table", "enum", "ref", "tablegroup", "project", "note"]);

function isIdent(tok: Token | null, value?: string): boolean {
  if (!tok || tok.type !== "ident") return false;
  if (value !== undefined) return tok.value.toLowerCase() === value.toLowerCase();
  return true;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) || (t.startsWith("`") && t.endsWith("`"))) {
    return t.slice(1, -1);
  }
  return t;
}

function splitQualifiedName(q: string): { schema?: string; name: string } {
  const v = stripQuotes(q);
  const parts = v.split(".");
  if (parts.length > 1) {
    return { schema: parts.slice(0, -1).join("."), name: parts[parts.length - 1] };
  }
  return { name: v };
}

function splitQualifiedColumn(q: string): { schema?: string; table: string; column: string } {
  const v = stripQuotes(q);
  const parts = v.split(".");
  if (parts.length >= 3) {
    return { schema: parts.slice(0, -2).join("."), table: parts[parts.length - 2], column: parts[parts.length - 1] };
  }
  if (parts.length === 2) {
    return { table: parts[0], column: parts[1] };
  }
  return { table: "", column: parts[0] };
}

function parseAttributes(raw: string): Omit<DBMLColumn, "name" | "type"> & { refDef?: { type: string; table: string; schema?: string; column: string } } {
  const result: any = {};
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return result;

  // split top-level commas
  const items: string[] = [];
  let depth = 0;
  let buf = "";
  let inStr = false;
  let quote = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      buf += ch;
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = true;
      quote = ch;
      buf += ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      buf += ch;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      buf += ch;
    } else if (ch === "," && depth === 0) {
      items.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) items.push(buf);

  for (const item of items) {
    let s = item.trim();
    if (!s) continue;
    // Normalize spacing around the first top-level colon so keys like
    // "ref : > users.id" become "ref: > users.id".
    let colonIdx = -1;
    let depth = 0;
    let inStr = false;
    let q = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (ch === q) inStr = false;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        inStr = true;
        q = ch;
      } else if (ch === "(" || ch === "[" || ch === "{") {
        depth++;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        depth--;
      } else if (ch === ":" && depth === 0) {
        colonIdx = i;
        break;
      }
    }
    if (colonIdx > -1) {
      const key = s.slice(0, colonIdx).trim().replace(/\\s+/g, " ").toLowerCase();
      const val = s.slice(colonIdx + 1).trim();
      s = key + ": " + val;
    }
    const low = s.toLowerCase();
    if (low === "pk" || low === "primary key") {
      result.pk = true;
    } else if (low === "not null") {
      result.notNull = true;
      result.nullable = false;
    } else if (low === "null") {
      result.nullable = true;
    } else if (low === "unique") {
      result.unique = true;
    } else if (low === "increment" || low === "autoincrement" || low === "auto increment") {
      result.increment = true;
    } else if (low.startsWith("default:")) {
      result.default = s.slice(s.toLowerCase().indexOf("default:") + 8).trim();
    } else if (low.startsWith("default =") || low.startsWith("default=")) {
      result.default = s.slice(s.toLowerCase().indexOf("=") + 1).trim();
    } else if (low.startsWith("note:")) {
      result.note = stripQuotes(s.slice(s.toLowerCase().indexOf("note:") + 5).trim());
    } else if (low.startsWith("ref:")) {
      const refPart = s.slice(s.toLowerCase().indexOf("ref:") + 4).trim();
      // form: [op] target  OR target
      const m = refPart.match(/^([<>-]|<>)\s*(.+)$/);
      let type = ">";
      let target = refPart;
      if (m) {
        type = m[1];
        target = m[2].trim();
      }
      const q = splitQualifiedColumn(target);
      result.refDef = { type, table: q.table, schema: q.schema, column: q.column };
    } else {
      // unknown attribute, keep as note-like default? ignore
    }
  }

  if (result.refDef) {
    result.ref = {
      type: result.refDef.type,
      table: result.refDef.table,
      schema: result.refDef.schema,
      column: result.refDef.column,
    };
  }
  delete result.refDef;
  return result;
}

class Parser {
  tokens: Token[];
  pos = 0;
  result: DBMLParseResult;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.result = { tables: [], refs: [], enums: [], tableGroups: [], errors: [] };
  }

  peek(offset = 0): Token | null {
    return this.tokens[this.pos + offset] ?? null;
  }

  next(): Token | null {
    return this.tokens[this.pos++] ?? null;
  }

  // consume tokens until a balanced close; returns collected tokens including delimiters
  consumeBalanced(open: string, close: string): Token[] {
    const collected: Token[] = [];
    const first = this.next();
    if (!first || first.value !== open) {
      if (first) this.pos--;
      return collected;
    }
    collected.push(first);
    let depth = 1;
    while (this.pos < this.tokens.length && depth > 0) {
      const t = this.next();
      if (!t) break;
      collected.push(t);
      if (t.value === open) depth++;
      else if (t.value === close) depth--;
    }
    return collected;
  }

  readName(): string {
    const t = this.next();
    if (!t) throw new Error("Expected name");
    return stripQuotes(t.value);
  }

  readQualifiedName(): string {
    const first = this.readSingleNameToken();
    const parts = [stripQuotes(first)];
    while (this.peek()?.value === ".") {
      this.next(); // .
      const next = this.readSingleNameToken();
      parts.push(stripQuotes(next));
    }
    return parts.join(".");
  }

  readSingleNameToken(): string {
    const t = this.next();
    if (!t) throw new Error("Expected name");
    if (t.type === "string" || t.type === "ident") return t.value;
    // fallback for numbers etc.
    return t.value;
  }

  parse(): DBMLParseResult {
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (!t) break;
      if (t.type === "ident" && TOP_LEVEL.has(t.value.toLowerCase())) {
        const kw = t.value.toLowerCase();
        if (kw === "table") this.parseTable();
        else if (kw === "enum") this.parseEnum();
        else if (kw === "ref") this.parseRef();
        else if (kw === "tablegroup") this.parseTableGroup();
        else if (kw === "project") this.skipBlock();
        else if (kw === "note") this.skipStatement();
      } else {
        this.next();
      }
    }
    return this.result;
  }

  parseTable() {
    this.next(); // Table
    const qName = this.readQualifiedName();
    const { schema, name } = splitQualifiedName(qName);

    let alias: string | undefined;
    if (isIdent(this.peek(), "as")) {
      this.next();
      alias = this.readName();
    }

    let attrTable: string | undefined;
    if (this.peek()?.value === "[") {
      const toks = this.consumeBalanced("[", "]");
      attrTable = toks.map((t) => t.value).join(" ");
    }

    const table: DBMLTable = {
      name,
      schema,
      alias,
      columns: [],
      indexes: [],
    };
    if (attrTable) {
      // store raw as note fallback (not used further)
    }

    if (this.peek()?.value !== "{") {
      this.result.errors.push({ message: `Expected '{' for table ${name}`, line: this.peek()?.line });
      return;
    }
    this.next(); // {

    while (this.pos < this.tokens.length) {
      const p = this.peek();
      if (!p || p.value === "}") break;

      if (isIdent(p, "indexes")) {
        this.next();
        const toks = this.consumeBalanced("{", "}");
        table.indexes.push({ raw: toks.map((t) => t.value).join(" ") });
        continue;
      }

      if (isIdent(p, "note")) {
        this.next();
        if (this.peek()?.value === ":") this.next();
        const val = this.peek();
        if (val && val.type === "string") {
          table.note = stripQuotes(val.value);
          this.next();
        } else if (val && val.value === "{") {
          const toks = this.consumeBalanced("{", "}");
          table.note = toks.map((t) => t.value).join(" ");
        }
        continue;
      }

      // Column
      try {
        const col = this.parseColumn();
        if (col) table.columns.push(col);
      } catch (e) {
        this.result.errors.push({ message: (e as Error).message, line: this.peek()?.line });
        // skip one token to recover
        this.next();
      }
    }

    if (this.peek()?.value === "}") this.next();
    this.result.tables.push(table);
  }

  parseColumn(): DBMLColumn | null {
    const nameTok = this.peek();
    if (!nameTok || nameTok.type !== "ident" && nameTok.type !== "string") return null;
    const name = this.readName();

    // type
    const typeTok = this.next();
    if (!typeTok) throw new Error(`Missing type for column ${name}`);
    let type = typeTok.value;
    if (this.peek()?.value === "(") {
      const toks = this.consumeBalanced("(", ")");
      type += toks.map((t) => t.value).join("");
    }

    const col: DBMLColumn = { name, type };

    if (this.peek()?.value === "[") {
      const toks = this.consumeBalanced("[", "]");
      const raw = toks.map((t) => t.value).join(" ");
      const attrs = parseAttributes(raw);
      Object.assign(col, attrs);

      // if column-level ref, register in refs
      if (attrs.ref && this.result.tables.length) {
        // find owning table: last table in result is current? Actually table not pushed yet.
        // We'll attach ref later? Instead, we can't resolve owner. We'll store on a temp list.
        // Simpler: push a ref immediately with table name placeholder; fix after table pushed?
        // Better: collect pending; but to keep simple, we add ref during table finalization? 
        // We'll handle by adding ref with owner resolved at end: push a marker into a pending list on result.
      }
    }

    // If attrs.ref present, we need owner table name. We'll stash ref onto column and later, after table push, collect refs.
    return col;
  }

  parseEnum() {
    this.next(); // Enum
    const qName = this.readQualifiedName();
    const { name, schema } = { ...splitQualifiedName(qName) };

    let eSchema: string | undefined = schema;
    let eName = name;

    if (this.peek()?.value === "[") {
      this.consumeBalanced("[", "]");
    }

    if (this.peek()?.value !== "{") {
      this.result.errors.push({ message: `Expected '{' for enum ${eName}`, line: this.peek()?.line });
      return;
    }
    this.next();

    const values: DBMLEnumValue[] = [];
    while (this.pos < this.tokens.length) {
      const p = this.peek();
      if (!p || p.value === "}") break;

      if (p.type === "ident" || p.type === "string") {
        const valName = this.readName();
        const v: DBMLEnumValue = { name: valName };
        if (this.peek()?.value === "[") {
          const toks = this.consumeBalanced("[", "]");
          const raw = toks.map((t) => t.value).join(" ");
          const attrs = parseAttributes(raw);
          if (attrs.note) v.note = attrs.note;
        }
        values.push(v);
      } else {
        this.next();
      }
    }

    if (this.peek()?.value === "}") this.next();
    const en: DBMLEnum = { name: eName, values };
    if (eSchema) en.schema = eSchema;
    this.result.enums.push(en);
  }

  parseRef() {
    this.next(); // Ref
    let name: string | undefined;
    const p = this.peek();
    if (p && p.type === "ident") {
      const p2 = this.tokens[this.pos + 1];
      if (p2 && (p2.value === ":" || p2.value === "{")) {
        name = this.readName();
      }
    }
    if (this.peek()?.value === ":") this.next();

    let fromStr = "";
    let op = ">";
    let toStr = "";

    if (this.peek()?.value === "{") {
      const toks = this.consumeBalanced("{", "}");
      const idents = toks.filter((t) => t.type === "ident" && t.value.includes("."));
      const opTok = toks.find((t) => t.type === "punct" && [">", "<", "-", "<>"].includes(t.value));
      fromStr = idents[0]?.value ?? "";
      toStr = idents[1]?.value ?? "";
      if (opTok) op = opTok.value;
    } else {
      const fromTok = this.next();
      fromStr = fromTok?.value ?? "";
      const opTok = this.next();
      op = opTok?.value ?? ">";
      const toTok = this.next();
      toStr = toTok?.value ?? "";
    }

    const f = splitQualifiedColumn(fromStr);
    const t = splitQualifiedColumn(toStr);
    const ref: DBMLRef = {
      name,
      from: { table: f.table, schema: f.schema, column: f.column },
      to: { table: t.table, schema: t.schema, column: t.column },
      type: op,
    };
    this.result.refs.push(ref);
  }

  parseTableGroup() {
    this.next(); // TableGroup
    const name = this.readQualifiedName();
    const grp: DBMLTableGroup = { name, tables: [] };
    if (this.peek()?.value === "[") this.consumeBalanced("[", "]");
    if (this.peek()?.value === "{") {
      const toks = this.consumeBalanced("{", "}");
      for (const t of toks) {
        if (t.type === "ident" && TOP_LEVEL.has(t.value.toLowerCase()) === false) {
          // collect identifiers (table names) but avoid keywords 'as'
          if (t.value.toLowerCase() !== "as") grp.tables.push(stripQuotes(t.value));
        }
        if (t.type === "string") grp.tables.push(stripQuotes(t.value));
      }
      // dedupe and remove group name? Keep as is (may include noise; acceptable basic)
    }
    this.result.tableGroups.push(grp);
  }

  skipBlock() {
    this.next(); // keyword
    // consume optional name
    // if next is not brace, consume until brace
    while (this.pos < this.tokens.length && this.peek()?.value !== "{") this.next();
    if (this.peek()?.value === "{") this.consumeBalanced("{", "}");
    // consume optional attributes
    if (this.peek()?.value === "[") this.consumeBalanced("[", "]");
  }

  skipStatement() {
    this.next(); // keyword
    while (this.pos < this.tokens.length && this.peek()?.value !== "}") this.next();
    // don't consume brace here to avoid crosstalk; just next
  }
}

export function parseDBML(input: string): DBMLParseResult {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const result = parser.parse();

  // Collect column-level refs now that tables are parsed.
  for (const table of result.tables) {
    for (const col of table.columns) {
      if (col.ref) {
        result.refs.push({
          from: { table: table.name, schema: table.schema, column: col.name },
          to: { table: col.ref.table, schema: col.ref.schema, column: col.ref.column },
          type: col.ref.type,
        });
      }
    }
  }

  // Deduplicate identical refs.
  const seen = new Set<string>();
  result.refs = result.refs.filter((r) => {
    const key = `${r.from.schema ?? ""}.${r.from.table}.${r.from.column}->${r.to.schema ?? ""}.${r.to.table}.${r.to.column}:${r.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Schema for enums if stored separately (normalize).
  return result;
}