import { and, or, eq, desc, lt, sql, ilike, arrayContains } from 'drizzle-orm';
import { mails } from '../db/schema.js';

export function buildMailFilters({ folder, q, label, unread, starred, attachments }) {
  const clauses = [];

  if (folder && folder !== 'all') {
    clauses.push(eq(mails.folder, folder));
  } else {
    // 'all' excludes trash
    clauses.push(sql`${mails.folder} <> 'trash'`);
  }

  if (q && q.trim()) {
    const term = q.trim();
    const like = `%${term}%`;
    clauses.push(
      or(
        sql`${mails.searchTsv} @@ plainto_tsquery('english', ${term})`,
        ilike(mails.subject, like),
        ilike(mails.fromAddress, like),
        ilike(mails.fromName, like),
        ilike(mails.snippet, like)
      )
    );
  }

  if (label) {
    clauses.push(arrayContains(mails.labels, [label]));
  }
  if (unread) clauses.push(eq(mails.status, 'unread'));
  if (starred) clauses.push(eq(mails.starred, true));
  if (attachments) clauses.push(eq(mails.hasAttachments, true));

  return clauses.length ? and(...clauses) : undefined;
}

export async function listMails(db, opts) {
  const { cursor, limit = 50 } = opts;
  const where = buildMailFilters(opts);
  const conds = [where];
  if (cursor) {
    conds.push(lt(mails.receivedAt, new Date(cursor)));
  }
  const finalWhere = conds.filter(Boolean).length
    ? and(...conds.filter(Boolean))
    : undefined;

  const rows = await db
    .select()
    .from(mails)
    .where(finalWhere)
    .orderBy(desc(mails.receivedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].receivedAt.toISOString() : null;
  return { items, nextCursor };
}

export async function folderCounts(db) {
  const rows = await db
    .select({
      folder: mails.folder,
      unread: sql`sum(case when ${mails.status} = 'unread' then 1 else 0 end)::int`,
      total: sql`count(*)::int`,
    })
    .from(mails)
    .groupBy(mails.folder);
  const byFolder = {};
  for (const r of rows) byFolder[r.folder] = r;
  return byFolder;
}

export async function labelCounts(db) {
  const rows = await db.execute(sql`
    select label, count(*)::int as total,
      sum(case when status='unread' then 1 else 0 end)::int as unread
    from (select unnest(labels) as label, status from mails where folder <> 'trash') x
    group by label order by label
  `);
  return rows.rows || rows;
}

export async function starredCount(db) {
  const rows = await db
    .select({ c: sql`count(*)::int` })
    .from(mails)
    .where(and(eq(mails.starred, true), sql`${mails.folder} <> 'trash'`));
  return rows[0]?.c || 0;
}
