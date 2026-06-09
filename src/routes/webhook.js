import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { parseMail, persistMail } from '../lib/parseMail.js';

const router = Router();

function checkSecret(req) {
  const expected = process.env.INCOMING_API_BEARER;
  if (!expected) return false;
  const auth = req.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const given = auth.slice(7);
  if (given.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post('/mail', async (req, res) => {
  if (!checkSecret(req)) {
    return res.status(401).json({ error: 'invalid_secret' });
  }
  try {
    const parsed = parseMail(req.body);
    const result = await persistMail(db, parsed);
    res.status(result.duplicate ? 200 : 201).json({
      id: result.id,
      messageId: parsed.messageId,
      duplicate: result.duplicate,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_payload', issues: err.issues });
    }
    console.error('webhook error', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
