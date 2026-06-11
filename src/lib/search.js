import { and, or, eq, desc, lt, sql, ilike, arrayContains } from 'drizzle-orm';
import { mails } from '../db/schema.js';

export function buildMailFilters({ folder, q, label, domain, unread, starred, attachments }) {
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
        ilike(mails.snippet, like),
        sql`exists (
          select 1 from mail_participants mp
          where mp.mail_id = ${mails.id}
            and mp.kind = 'to'
            and (mp.address ilike ${like} or mp.name ilike ${like})
        )`
      )
    );
  }

  if (label) {
    clauses.push(arrayContains(mails.labels, [label]));
  }
  if (domain) {
    clauses.push(
      sql`exists (
        select 1 from mail_participants mp
        where mp.mail_id = ${mails.id}
          and mp.kind = 'to'
          and lower(split_part(mp.address, '@', 2)) = ${domain.toLowerCase()}
      )`
    );
  }
  if (unread) clauses.push(eq(mails.status, 'unread'));
  if (starred) clauses.push(eq(mails.starred, true));
  if (attachments) clauses.push(eq(mails.hasAttachments, true));

  return clauses.length ? and(...clauses) : undefined;
}

async function attachPrimaryRecipients(db, items) {
  if (!items.length) return items;

  const ids = items.map((m) => m.id);
  const rows = await db.execute(sql`
    select distinct on (mail_id) mail_id, address, name
    from mail_participants
    where mail_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      and kind = 'to'
    order by mail_id, id
  `);
  const participantRows = rows.rows || rows;
  const byMailId = new Map();
  for (const row of participantRows) {
    byMailId.set(row.mail_id, { address: row.address, name: row.name });
  }

  return items.map((mail) => ({
    ...mail,
    primaryTo: byMailId.get(mail.id) || null,
  }));
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
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const items = await attachPrimaryRecipients(db, slice);
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

export async function domainCounts(db, limit = 20) {
  const rows = await db.execute(sql`
    select domain, count(*)::int as total,
      sum(case when status='unread' then 1 else 0 end)::int as unread
    from (
      select lower(split_part(mp.address, '@', 2)) as domain, m.status
      from mail_participants mp
      join mails m on m.id = mp.mail_id
      where mp.kind = 'to' and m.folder <> 'trash'
    ) x
    where domain <> ''
    group by domain
    order by total desc, domain asc
    limit ${limit}
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
