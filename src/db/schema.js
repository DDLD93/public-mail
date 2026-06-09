import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const bytea = customType({
  dataType() {
    return 'bytea';
  },
});

const tsvector = customType({
  dataType() {
    return 'tsvector';
  },
});

export const mails = pgTable(
  'mails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull().unique(),
    subject: text('subject'),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    replyTo: text('reply_to'),
    html: text('html'),
    text: text('text'),
    snippet: text('snippet'),
    folder: text('folder').notNull().default('inbox'),
    status: text('status').notNull().default('unread'),
    starred: boolean('starred').notNull().default(false),
    important: boolean('important').notNull().default(false),
    labels: text('labels').array().notNull().default(sql`'{}'::text[]`),
    hasAttachments: boolean('has_attachments').notNull().default(false),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    searchTsv: tsvector('search_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(from_address,'') || ' ' || coalesce(from_name,'') || ' ' || coalesce(snippet,''))`,
      { mode: 'stored' }
    ),
  },
  (t) => ({
    folderReceivedIdx: index('mails_folder_received_idx').on(
      t.folder,
      t.receivedAt
    ),
    statusIdx: index('mails_status_idx').on(t.status),
    labelsIdx: index('mails_labels_gin').using('gin', t.labels),
    tsvIdx: index('mails_tsv_gin').using('gin', t.searchTsv),
  })
);

export const mailParticipants = pgTable(
  'mail_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mailId: uuid('mail_id')
      .notNull()
      .references(() => mails.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    address: text('address').notNull(),
    name: text('name'),
  },
  (t) => ({
    mailIdx: index('participants_mail_idx').on(t.mailId),
    addressIdx: index('participants_address_idx').on(t.address),
  })
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mailId: uuid('mail_id')
      .notNull()
      .references(() => mails.id, { onDelete: 'cascade' }),
    filename: text('filename'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    content: bytea('content'),
  },
  (t) => ({
    mailIdx: index('attachments_mail_idx').on(t.mailId),
  })
);
