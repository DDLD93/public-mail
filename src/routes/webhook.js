import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { parseMail, persistMail } from '../lib/parseMail.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const log = createLogger('webhook');

function summarizePayload(body) {
  if (!body || typeof body !== 'object') return { bodyType: typeof body };
  return {
    messageId: body.messageId,
    from: body.from?.address,
    toCount: Array.isArray(body.to) ? body.to.length : 0,
    ccCount: Array.isArray(body.cc) ? body.cc.length : 0,
    bccCount: Array.isArray(body.bcc) ? body.bcc.length : 0,
    attachmentCount: Array.isArray(body.attachments) ? body.attachments.length : 0,
    subject: body.subject ? String(body.subject).slice(0, 80) : null,
    hasHtml: Boolean(body.html),
    hasText: Boolean(body.text),
  };
}

function checkSecret(req) {
  const expected = process.env.INCOMING_API_BEARER;
  if (!expected) {
    log.error(null, 'INCOMING_API_BEARER is not configured');
    return false;
  }
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
  const reqId = crypto.randomUUID().slice(0, 8);

  log.debug(reqId, 'incoming mail webhook', {
    ip: req.ip,
    contentType: req.get('content-type'),
    contentLength: req.get('content-length'),
    ...summarizePayload(req.body),
  });

  if (!checkSecret(req)) {
    log.warn(reqId, 'webhook auth failed', {
      ip: req.ip,
      hasAuthorization: Boolean(req.get('authorization')),
    });
    return res.status(401).json({ error: 'invalid_secret' });
  }

  try {
    const parsed = parseMail(req.body);
    log.debug(reqId, 'payload parsed', {
      messageId: parsed.messageId,
      from: parsed.from.address,
      to: parsed.to.map((p) => p.address),
      ccCount: parsed.cc.length,
      bccCount: parsed.bcc.length,
      attachmentCount: parsed.attachments.length,
    });

    const result = await persistMail(db, parsed, reqId);
    const status = result.duplicate ? 200 : 201;

    log.info(reqId, result.duplicate ? 'duplicate mail ignored' : 'mail ingested', {
      id: result.id,
      messageId: parsed.messageId,
      duplicate: result.duplicate,
      status,
    });

    res.status(status).json({
      id: result.id,
      messageId: parsed.messageId,
      duplicate: result.duplicate,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      log.warn(reqId, 'invalid webhook payload', {
        issues: err.issues,
        payload: summarizePayload(req.body),
      });
      return res.status(400).json({ error: 'invalid_payload', issues: err.issues });
    }

    log.error(reqId, 'webhook ingest failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
