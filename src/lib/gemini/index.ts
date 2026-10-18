import { GoogleGenerativeAI } from "@google/generative-ai";
import { DBMLParseResult } from "@/lib/dbml";
import { GeminiGenerateInput, GeminiGenerateResult } from "./types";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

function schemaSummary(input: GeminiGenerateInput): unknown {
  const parsed = input.parsed;
  const tables = input.tables ?? parsed?.tables ?? [];
  return {
    dbml: input.dbml ?? input.context,
    tables: tables.map((t) => ({
      name: t.name,
      schema: t.schema,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type,
        pk: c.pk ?? false,
        notNull: c.notNull ?? false,
        unique: c.unique ?? false,
        increment: c.increment ?? false,
        default: c.default,
        note: c.note,
        ref: c.ref,
      })),
      indexes: t.indexes,
      note: t.note,
    })),
    refs: parsed?.refs ?? [],
    enums: parsed?.enums ?? [],
    tableGroups: parsed?.tableGroups ?? [],
  };
}

export async function generateSqlAndRls(input: GeminiGenerateInput): Promise<GeminiGenerateResult> {
  const apiKey = input.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured (env or request body).");
  }

  const modelId = input.model || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const prompt = [
    "You are an expert PostgreSQL / Supabase database engineer.",
    "Given the database schema JSON below, generate:",
    "1. migrationSql: a complete PostgreSQL migration script (CREATE TABLE, constraints, FKs).",
    "   Map DBML types to sensible PostgreSQL types. Keep integer types as-is when provided.",
    "2. rlsSql: Supabase Row Level Security. For EVERY table: ALTER TABLE ... ENABLE ROW LEVEL SECURITY.",
    "   Create policies for SELECT, INSERT, UPDATE, DELETE using auth.uid() when an owner/user column is obvious.",
    "   If no owner column exists, restrict to authenticated users.",
    "3. notes: short explanation.",
    "",
    "Return ONLY valid JSON with exactly these keys: migrationSql, rlsSql, notes.",
    "No markdown, no extra commentary.",
    "",
    "Schema JSON:",
    JSON.stringify(schemaSummary(input), null, 2),
  ].join("\n");

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsedText = extractJson(raw);

  let migrationSql = "";
  let rlsSql = "";
  let notes = "";

  try {
    const json = JSON.parse(parsedText);
    migrationSql = typeof json.migrationSql === "string" ? json.migrationSql : "";
    rlsSql = typeof json.rlsSql === "string" ? json.rlsSql : "";
    notes = typeof json.notes === "string" ? json.notes : "";
  } catch {
    // Fall back: store raw in migrationSql so nothing is lost.
    migrationSql = raw;
    notes = "Model did not return valid JSON; raw response stored in migrationSql.";
  }

  return { migrationSql, rlsSql, notes, raw, model: modelId };
}