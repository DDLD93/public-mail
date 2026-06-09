import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments } from '../db/schema.js';

const router = Router();

router.get('/:id', async (req, res, next) => {
  try {
    const rows = await db.select().from(attachments).where(eq(attachments.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).send('Not found');
    const a = rows[0];
    const filename = a.filename || 'attachment';
    res.setHeader('Content-Type', a.mimeType || 'application/octet-stream');
    const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${filename.replace(/"/g, '')}"`
    );
    if (a.sizeBytes) res.setHeader('Content-Length', a.sizeBytes);
    res.end(a.content);
  } catch (err) { next(err); }
});

export default router;
