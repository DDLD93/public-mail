import { Router } from 'express';
import { eq, sql, and, inArray, desc, asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mails, mailParticipants, attachments } from '../db/schema.js';
import { listMails, folderCounts, labelCounts, starredCount } from '../lib/search.js';
import { sanitizeMailHtml } from '../lib/sanitize.js';
import { relativeTimeStr, fullTime, initials, avatarColor, fmtBytes, displayName, escapeHtml } from '../lib/format.js';

const router = Router();

const SYSTEM_FOLDERS = ['inbox', 'archive', 'trash', 'spam'];

async function getSidebar() {
  const [counts, labels, starred] = await Promise.all([
    folderCounts(db),
    labelCounts(db),
    starredCount(db),
  ]);
  return { counts, labels, starred };
}

function commonLocals() {
  return { relativeTimeStr, fullTime, initials, avatarColor, fmtBytes, displayName, escapeHtml };
}

router.get('/', async (req, res, next) => {
  try {
    const folder = (req.query.folder || 'inbox').toString();
    const q = (req.query.q || '').toString();
    const label = (req.query.label || '').toString() || null;
    const unread = req.query.unread === '1';
    const starred = req.query.starred === '1';
    const attachmentsOnly = req.query.attachments === '1';
    const cursor = req.query.cursor || null;

    const [{ items, nextCursor }, sidebar] = await Promise.all([
      listMails(db, {
        folder,
        q,
        label,
        unread,
        starred,
        attachments: attachmentsOnly,
        cursor,
        limit: 40,
      }),
      getSidebar(),
    ]);

    res.render('inbox', {
      ...commonLocals(),
      title: 'Inbox · public-mail',
      view: 'inbox',
      folder,
      q,
      label,
      unread,
      starred,
      attachmentsOnly,
      items,
      nextCursor,
      sidebar,
      selected: null,
      systemFolders: SYSTEM_FOLDERS,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/mail/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(mails).where(eq(mails.id, id)).limit(1);
    if (!rows.length) return res.status(404).render('inbox', {
      ...commonLocals(),
      title: 'Not found',
      view: 'inbox',
      folder: 'inbox', q: '', label: null, unread: false, starred: false, attachmentsOnly: false,
      items: [], nextCursor: null,
      sidebar: await getSidebar(),
      selected: null, systemFolders: SYSTEM_FOLDERS,
      notFound: true,
    });

    const mail = rows[0];

    if (mail.status === 'unread') {
      await db.update(mails).set({ status: 'read' }).where(eq(mails.id, id));
      mail.status = 'read';
    }

    const [participants, atts] = await Promise.all([
      db.select().from(mailParticipants).where(eq(mailParticipants.mailId, id)),
      db.select({
        id: attachments.id,
        filename: attachments.filename,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
      }).from(attachments).where(eq(attachments.mailId, id)),
    ]);

    const sanitizedHtml = mail.html ? sanitizeMailHtml(mail.html) : '';

    res.render('mail', {
      ...commonLocals(),
      title: (mail.subject || '(no subject)') + ' · public-mail',
      view: 'mail',
      mail,
      participants,
      attachments: atts,
      sanitizedHtml,
      sidebar: await getSidebar(),
      systemFolders: SYSTEM_FOLDERS,
    });
  } catch (err) {
    next(err);
  }
});

async function applyAction(ids, action, value) {
  if (!ids.length) return;
  const set = {};
  switch (action) {
    case 'star': set.starred = true; break;
    case 'unstar': set.starred = false; break;
    case 'read': set.status = 'read'; break;
    case 'unread': set.status = 'unread'; break;
    case 'archive': set.folder = 'archive'; break;
    case 'trash': set.folder = 'trash'; break;
    case 'spam': set.folder = 'spam'; break;
    case 'inbox': set.folder = 'inbox'; break;
    case 'important': set.important = true; break;
    case 'unimportant': set.important = false; break;
    case 'label-add': {
      if (!value) return;
      await db.execute(sql`
        update mails set labels = (
          select array_agg(distinct x) from unnest(array_append(labels, ${value})) as x
        ) where id = any(${ids}::uuid[])
      `);
      return;
    }
    case 'label-remove': {
      if (!value) return;
      await db.execute(sql`
        update mails set labels = array_remove(labels, ${value})
        where id = any(${ids}::uuid[])
      `);
      return;
    }
    default: return;
  }
  await db.update(mails).set(set).where(inArray(mails.id, ids));
}

router.post('/mail/:id/actions', async (req, res, next) => {
  try {
    const { action, value } = req.body || {};
    await applyAction([req.params.id], action, value);
    if (req.get('accept')?.includes('application/json') || req.xhr) {
      return res.json({ ok: true });
    }
    res.redirect(req.get('referer') || '/');
  } catch (err) { next(err); }
});

router.post('/mail/bulk', async (req, res, next) => {
  try {
    const { ids = [], action, value } = req.body || {};
    await applyAction(ids, action, value);
    res.json({ ok: true, count: ids.length });
  } catch (err) { next(err); }
});

export default router;
