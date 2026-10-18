export interface DBMLPosition {
  table: string;
  schema?: string;
  column: string;
}

export interface DBMLColumn {
  name: string;
  type: string;
  pk?: boolean;
  notNull?: boolean;
  unique?: boolean;
  increment?: boolean;
  nullable?: boolean;
  default?: string;
  note?: string;
  ref?: {
    type: string; // ">", "<", "-", "<>"
    table: string;
    schema?: string;
    column: string;
  };
}

export interface DBMLIndex {
  raw: string;
}

export interface DBMLTable {
  name: string;
  schema?: string;
  alias?: string;
  columns: DBMLColumn[];
  indexes: DBMLIndex[];
  note?: string;
}

export interface DBMLRef {
  name?: string;
  from: { table: string; schema?: string; column: string };
  to: { table: string; schema?: string; column: string };
  type: string;
}

export interface DBMLEnumValue {
  name: string;
  note?: string;
}

export interface DBMLEnum {
  name: string;
  schema?: string;
  values: DBMLEnumValue[];
}

export interface DBMLTableGroup {
  name: string;
  tables: string[];
}

export interface DBMLParseError {
  message: string;
  line?: number;
}

export interface DBMLParseResult {
  tables: DBMLTable[];
  refs: DBMLRef[];
  enums: DBMLEnum[];
  tableGroups: DBMLTableGroup[];
  errors: DBMLParseError[];
}