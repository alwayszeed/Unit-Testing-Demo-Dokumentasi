import type { DBMLParseResult, DBMLTable, DBMLColumn, DBMLRef } from "@/lib/dbml";

const TYPE_MAP: Record<string, string> = {
  integer: "INTEGER",
  int: "INTEGER",
  bigint: "BIGINT",
  smallint: "SMALLINT",
  varchar: "VARCHAR",
  character: "CHARACTER",
  text: "TEXT",
  boolean: "BOOLEAN",
  bool: "BOOLEAN",
  timestamp: "TIMESTAMP",
  datetime: "TIMESTAMP",
  date: "DATE",
  time: "TIME",
  decimal: "DECIMAL",
  numeric: "NUMERIC",
  float: "FLOAT",
  double: "DOUBLE PRECISION",
  real: "REAL",
  serial: "SERIAL",
  bigserial: "BIGSERIAL",
  uuid: "UUID",
  json: "JSONB",
  jsonb: "JSONB",
  bytea: "BYTEA",
};

function pgType(col: DBMLColumn): string {
  const t = col.type.toLowerCase();
  const base = TYPE_MAP[t] ?? t.toUpperCase();
  // preserve explicit size like varchar(255)
  if (col.type.match(/\(\d+\)/)) {
    return col.type.toLowerCase().startsWith("varchar") || col.type.toLowerCase().startsWith("character")
      ? col.type
      : col.type;
  }
  return base;
}

export function generateSql(parsed: DBMLParseResult): string {
  const lines: string[] = [];
  lines.push("-- Auto-generated migration from DBML");
  lines.push("-- Tables:");
  for (const t of parsed.tables) lines.push(`--   - ${t.schema ? t.schema + "." : ""}${t.name}`);
  lines.push("");

  // Enums
  for (const e of parsed.enums) {
    const values = e.values.map((v) => `'${v.name}'`).join(", ");
    lines.push(`CREATE TYPE IF NOT EXISTS ${e.schema ? e.schema + "." : ""}${e.name} AS ENUM (${values});`);
    lines.push("");
  }

  // Tables
  for (const t of parsed.tables) {
    const fullName = t.schema ? `${t.schema}.${t.name}` : t.name;
    lines.push(`CREATE TABLE IF NOT EXISTS ${fullName} (`);
    const colLines: string[] = [];
    for (const c of t.columns) {
      const parts: string[] = [];
      parts.push(`  "${c.name}" ${pgType(c)}`);
      if (c.pk) parts.push("PRIMARY KEY");
      if (c.increment) parts.push("GENERATED ALWAYS AS IDENTITY");
      if (c.notNull || !c.nullable) parts.push("NOT NULL");
      if (c.unique) parts.push("UNIQUE");
      if (c.default !== undefined) parts.push(`DEFAULT ${c.default}`);
      colLines.push(parts.join(" "));
    }
    lines.push(colLines.join(",\n"));
    lines.push(");");
    lines.push("");
  }

  // Foreign keys from refs
  for (const r of parsed.refs) {
    const from = r.from.schema ? `${r.from.schema}.${r.from.table}` : r.from.table;
    const to = r.to.schema ? `${r.to.schema}.${r.to.table}` : r.to.table;
    lines.push(
      `ALTER TABLE ${from} ADD CONSTRAINT fk_${from.replace(/\./g, "_")}_${r.from.column} ` +
      `FOREIGN KEY ("${r.from.column}") REFERENCES ${to}("${r.to.column}");`
    );
  }

  return lines.join("\n").trim() + "\n";
}

export function generateMermaidErd(parsed: DBMLParseResult): string {
  const lines: string[] = [];
  lines.push("erDiagram");

  // relationships
  for (const r of parsed.refs) {
    const from = r.from.table;
    const to = r.to.table;
    const type = r.type === ">" ? "||--o{" : r.type === "<" ? "}o--||" : r.type === "-" ? "||--||" : "||--o{";
    lines.push(`  ${from} ${type} ${to} : "${r.from.column} --> ${r.to.column}"`);
  }

  // entities
  for (const t of parsed.tables) {
    lines.push(`  ${t.name} {`);
    for (const c of t.columns) {
      const pk = c.pk ? "PK " : "";
      const nn = c.notNull ? "NOT NULL " : "";
      lines.push(`    ${pk}${pgType(c)} "${c.name}" ${nn}`.trimEnd());
    }
    lines.push("  }");
  }

  return lines.join("\n");
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function exportSqlFile(sql: string, filename = "migration.sql"): void {
  const blob = new Blob([sql], { type: "text/sql" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
