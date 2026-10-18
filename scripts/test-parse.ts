import { parseDBML } from "../src/lib/dbml";

const sample = `
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
  active [note: 'live']
  archived
}
`;

console.log(JSON.stringify(parseDBML(sample), null, 2));
