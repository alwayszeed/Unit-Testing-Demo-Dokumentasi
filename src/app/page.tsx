"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Script from "next/script";
import { parseDBML } from "@/lib/dbml";
import {
  generateSql,
  generateMermaidErd,
  copyToClipboard,
  exportSqlFile,
} from "@/lib/sql-generator";
import type { DBMLParseResult } from "@/lib/dbml";

type MermaidInstance = {
  initialize?: (opts: Record<string, unknown>) => void;
  render?: (
    id: string,
    text: string
  ) => Promise<{ svg: string } & Record<string, unknown>>;
};

declare global {
  interface Window {
    mermaid?: MermaidInstance;
  }
}

const DEFAULT_DBML = `Table users {
  id integer [pk, increment]
  username varchar(255) [not null, unique]
  email varchar(255) [unique]
  created_at timestamp
}

Table posts {
  id integer [pk]
  user_id integer [ref: > users.id]
  title varchar(255)
  body text [null]
}

Ref: posts.user_id > users.id
`;

type ValidationError = { message: string; hint?: string };

const SAMPLE_DBML = DEFAULT_DBML;

export default function SplitScreenEditor() {
  const [dbml, setDbml] = useState(SAMPLE_DBML);
  const [parsed, setParsed] = useState<DBMLParseResult | null>(null);
  const [sql, setSql] = useState("");
  const [mermaid, setMermaid] = useState("");
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [error, setError] = useState<ValidationError | null>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = window.mermaid;
    if (mermaidRef.current && mermaid && m?.initialize && m?.render) {
      m.initialize({ startOnLoad: false, theme: "base", securityLevel: "loose" } as Record<string, unknown>);
      m.render("mermaid-diagram", mermaid)
        .then(({ svg }) => {
          if (mermaidRef.current) mermaidRef.current.innerHTML = svg as string;
        })
        .catch((err: unknown) => {
          console.error("Mermaid render error", err);
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML =
              '<p class="text-slate-500 italic text-center mt-10">Diagram failed to render.</p>';
          }
        });
    }
  }, [mermaid]);

  const validate = useCallback((text: string): ValidationError | null => {
    const trimmed = text.trim();
    if (!trimmed) {
      return { message: "DBML is empty.", hint: "Write at least one Table block, e.g. Table users { id uuid }" };
    }
    if (!/table/i.test(trimmed)) {
      return { message: "No Table definition found.", hint: "The parser expects at least one 'Table <name> { ... }' block." };
    }
    return null;
  }, []);

  const handleParse = useCallback(() => {
    setError(null);
    const bad = validate(dbml);
    if (bad) {
      setError(bad);
      return;
    }
    try {
      const result = parseDBML(dbml);
      if (result.errors.length > 0) {
        const first = result.errors[0];
        setError({
          message: first.message,
          hint: first.line ? `Around line ${first.line}. Check table/column syntax` : undefined,
        });
      }
      setParsed(result);
      setSql(generateSql(result));
      setMermaid(generateMermaidErd(result));
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : "Parse failed",
        hint: "Visit /api/parse-dbml docs or reduce the input to isolate the issue.",
      });
    }
  }, [dbml, validate]);

  const handleCopySql = useCallback(async () => {
    if (!sql) return;
    try {
      await copyToClipboard(sql);
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }, [sql]);

  const handleExportSql = useCallback(() => {
    if (!sql) return;
    exportSqlFile(sql, "migration.sql");
  }, [sql]);

  const handleReset = useCallback(() => {
    setDbml("");
    setParsed(null);
    setSql("");
    setMermaid("");
    setError(null);
  }, []);

  const handleLoadSample = useCallback(() => {
    setDbml(SAMPLE_DBML);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <header className="flex items-center justify-between mb-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Interactive Split-Screen UI</h1>
          <p className="text-xs text-slate-500 mt-1">DBML → PostgreSQL SQL + ER diagram (Day 4: Unit Testing, Demo &amp; Dokumentasi)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleLoadSample} className="px-3 py-2 rounded text-sm border border-slate-300 bg-white hover:bg-slate-100 transition">
            Load sample
          </button>
          <button onClick={handleReset} className="px-3 py-2 rounded text-sm border border-slate-300 bg-white hover:bg-slate-100 transition">
            Clear
          </button>
          <button
            onClick={handleParse}
            disabled={loading}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {loading ? "Parsing..." : "Parse DBML → SQL"}
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="max-w-7xl mx-auto mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm"
        >
          <p className="font-medium">{error.message}</p>
          {error.hint && <p className="mt-1 text-xs text-red-600">{error.hint}</p>}
        </div>
      )}

      {!error && parsed?.errors?.length ? (
        <div
          role="status"
          className="max-w-7xl mx-auto mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm"
        >
          <p className="font-medium">{parsed.errors.length} parse warning(s) recorded in JSON output.</p>
        </div>
      ) : null}

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-160px)]">
        {/* Left: Editor */}
        <section className="flex flex-col h-full border border-slate-200 rounded-xl bg-white shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <span className="font-semibold text-slate-700">DBML Editor</span>
            <span className="text-xs text-slate-500">
              {dbml.length} chars · Ctrl+Enter to parse
            </span>
          </div>
          <div className="flex-1 relative min-h-0">
            <textarea
              aria-label="DBML editor"
              value={dbml}
              onChange={(e) => setDbml(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleParse();
                }
              }}
              className="w-full h-full font-mono text-sm p-4 resize-none outline-none border-0 bg-transparent"
              placeholder="Write DBML here..."
              spellCheck={false}
            />
          </div>
          <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
            Tip: define Table, Ref, and Enum blocks. Click Parse to generate SQL.
          </div>
        </section>

        {/* Right: SQL + Diagram */}
        <section className="flex flex-col h-full border border-slate-200 rounded-xl bg-white shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <span className="font-semibold text-slate-700">Output</span>
            <div className="flex gap-2">
              <button
                onClick={handleCopySql}
                disabled={!sql}
                data-action="copy-sql"
                aria-label="Copy generated SQL to clipboard"
                className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {copyState === "ok" ? "Copied!" : copyState === "fail" ? "Copy failed" : "Copy SQL"}
              </button>
              <button
                onClick={handleExportSql}
                disabled={!sql}
                aria-label="Download generated SQL as .sql file"
                className="px-3 py-1.5 rounded text-xs bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Export .sql
              </button>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 gap-0 min-h-0">
            {/* SQL Preview */}
            <div className="border-b border-slate-200 flex flex-col min-h-0">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Migration SQL</span>
                <span className="text-[10px] text-slate-400">{sql.length} chars</span>
              </div>
              <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed bg-slate-900 text-slate-200 relative min-h-0">
                {sql ? (
                  <pre className="m-0 whitespace-pre-wrap break-words">{sql}</pre>
                ) : (
                  <p className="text-slate-500 italic">Parsed SQL will appear here.</p>
                )}
              </div>
            </div>

            {/* ER Diagram */}
            <div className="flex flex-col min-h-0 border-t border-slate-200">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Table Diagram (ERD)</span>
              </div>
              <div className="flex-1 overflow-auto p-4 bg-white min-h-0" ref={mermaidRef}>
                {mermaid ? (
                  <div id="mermaid-diagram" className="text-slate-700"></div>
                ) : (
                  <p className="text-slate-500 italic text-center mt-10">Diagram preview will appear here.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Script
        strategy="afterInteractive"
        src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"
      />
    </div>
  );
}
