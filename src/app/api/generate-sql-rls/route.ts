import { NextResponse } from "next/server";
import { parseDBML } from "@/lib/dbml";
import { generateSqlAndRls } from "@/lib/gemini";

interface GenerateRequest {
  input?: unknown;
  parsed?: unknown;
  apiKey?: unknown;
  model?: unknown;
}

const MAX_MODEL_HEADER = 80;

function buildErrorResponse(message: string, status: number, hint?: string) {
  return NextResponse.json({ error: message, hint }, { status });
}

export async function POST(request: Request) {
  try {
    let body: GenerateRequest;
    try {
      body = (await request.json()) as GenerateRequest;
    } catch {
      return buildErrorResponse("Request body must be valid JSON.", 400, 'Send { "input": "<dbml>", "apiKey": "..." }');
    }

    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined;
    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim().slice(0, MAX_MODEL_HEADER)
        : undefined;

    let parsed = body.parsed;
    if (typeof body.input === "string" && body.input.trim()) {
      if (body.input.length > 500_000) {
        return buildErrorResponse("DBML input exceeds the 500,000 character limit.", 413);
      }
      parsed = parseDBML(body.input);
    }

    if (!parsed || typeof parsed !== "object") {
      return buildErrorResponse(
        "A parsed DBML schema or `input` DBML string is required.",
        400,
        'Send { "input": "Table users { id uuid }" } or the output of /api/parse-dbml.'
      );
    }

    const result = await generateSqlAndRls({
      parsed: parsed as Parameters<typeof generateSqlAndRls>[0]["parsed"],
      apiKey,
      model,
      dbml: typeof body.input === "string" ? body.input : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    const status = /API key/i.test(message) ? 401 : 500;
    console.error("generate-sql-rls failed", err);
    return buildErrorResponse(message, status);
  }
}
