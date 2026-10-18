import { NextResponse } from "next/server";
import { parseDBML } from "@/lib/dbml";

interface ParseRequest {
  input?: unknown;
}

const MAX_INPUT_LENGTH = 500_000;

function buildErrorResponse(message: string, status: number, hint?: string) {
  return NextResponse.json({ error: message, hint }, { status });
}

export async function POST(request: Request) {
  try {
    let body: ParseRequest;
    try {
      body = (await request.json()) as ParseRequest;
    } catch {
      return buildErrorResponse("Request body must be valid JSON.", 400, 'Send { "input": "<dbml>" }');
    }

    if (typeof body.input !== "string") {
      return buildErrorResponse('"input" must be a string of DBML content.', 400);
    }
    if (body.input.trim() === "") {
      return buildErrorResponse("DBML input is empty.", 400, "Provide DBML text with at least one Table block.");
    }
    if (body.input.length > MAX_INPUT_LENGTH) {
      return buildErrorResponse(`DBML input exceeds the ${MAX_INPUT_LENGTH} character limit.`, 413);
    }

    const result = parseDBML(body.input);

    if (!result.tables.length && !result.enums.length) {
      return NextResponse.json(
        {
          error: "No tables or enums recognised.",
          hint: "Check that blocks look like 'Table users { id uuid [pk] }'.",
          detail: result.errors.length ? result.errors[0].message : undefined,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("parse-dbml failed", err);
    return buildErrorResponse(
      err instanceof Error ? err.message : "Unexpected server error",
      500
    );
  }
}
