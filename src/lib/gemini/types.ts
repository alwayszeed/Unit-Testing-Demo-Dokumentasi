import { DBMLParseResult, DBMLTable } from "@/lib/dbml";

export interface GeminiGenerateInput {
  parsed?: DBMLParseResult;
  tables?: DBMLTable[];
  dbml?: string;
  apiKey?: string;
  model?: string;
  context?: string;
}

export interface GeminiGenerateResult {
  migrationSql: string;
  rlsSql: string;
  notes: string;
  raw: string;
  model: string;
}