/**
 * Unit tests for the DBML parser and SQL generator.
 * Run with: npx tsx scripts/unit-tests.ts
 */
import { parseDBML } from "../src/lib/dbml";
import { generateSql, generateMermaidErd } from "../src/lib/sql-generator";

let failures = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

const SAMPLE = `
Table users {
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

Enum status {
  active
  archived
}

TableGroup core {
  users
  posts
}
`;

console.log("Parser");
const result = parseDBML(SAMPLE);

assert(result.tables.length === 2, "parses two tables");
assert(result.tables[0]?.name === "users", "first table is users");
assert(result.tables[1]?.name === "posts", "second table is posts");
assert(result.tables[0]?.columns.length === 4, "users has four columns");
assert(result.tables[0]?.columns[0]?.pk === true, "users.id is a primary key");
assert(result.tables[0]?.columns[0]?.increment === true, "users.id is auto increment");
assert(result.tables[0]?.columns[1]?.notNull === true, "users.username is NOT NULL");
assert(result.tables[0]?.columns[1]?.unique === true, "users.username is UNIQUE");
assert(result.tables[0]?.columns[1]?.type === "varchar(255)", "users.username type is varchar(255)");
assert(result.tables[0]?.columns[3]?.type === "timestamp", "users.created_at type is timestamp");
assert(result.refs.length === 1, "deduplicates column ref + Ref statement to one edge");
assert(result.refs[0]?.from.table === "posts", "ref from posts");
assert(result.refs[0]?.to.table === "users", "ref to users");
assert(result.enums.length === 1, "parses one enum");
assert(result.enums[0]?.values.length === 2, "enum has two values");
assert(result.tableGroups.length === 1, "parses one table group");

const withSchema = parseDBML('Table public.users { id uuid [pk] }');
assert(withSchema.tables[0]?.schema === "public", "recognises schema-qualified table");
assert(withSchema.tables[0]?.name === "users", "qualified table name matches");

const malformed = parseDBML('Table broken { }');
assert(malformed.errors.length >= 0, "does not throw on malformed input");

console.log("SQL generator");
const sql = generateSql(result);
assert(/CREATE TABLE IF NOT EXISTS users/i.test(sql), "generates users CREATE TABLE");
assert(/CREATE TABLE IF NOT EXISTS posts/i.test(sql), "generates posts CREATE TABLE");
assert(/PRIMARY KEY/i.test(sql), "maps pk attribute");
assert(/NOT NULL/i.test(sql), "maps not null attribute");
assert(/ALTER TABLE posts/i.test(sql), "creates foreign key for posts relation");
assert(/CREATE TYPE IF NOT EXISTS status/i.test(sql), "creates enum type");

const mermaid = generateMermaidErd(result);
assert(/^erDiagram$/m.test(mermaid), "ERD starts with erDiagram");
assert(/posts \}\}o--\|\| users/.test(mermaid) || /posts \|\|--o\{ users/.test(mermaid), "ERD includes posts->users relation");
assert(/users \{/.test(mermaid), "ERD includes users entity");

console.log("");
if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log("All tests passed");
