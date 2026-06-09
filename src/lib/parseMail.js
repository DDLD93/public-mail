import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { mails, mailParticipants, attachments } from '../db/schema.js';

const participantSchema = z.object({
  address: z.string().min(1),
  name: z.string().nullish(),
});

const attachmentSchema = z.object({
  filename: z.string().nullish(),
  mimeType: z.string().nullish(),
  content: z.string().nullish(), // base64
});

export const webhookPayloadSchema = z.object({
  messageId: z.string().min(1),
  from: participantSchema,
  to: z.array(participantSchema).default([]),
  cc: z.array(participantSchema).default([]),
  bcc: z.array(participantSchema).default([]),
  subject: z.string().nullish(),
  html: z.string().nullish(),
  text: z.string().nullish(),
  replyTo: z.string().nullish(),
  attachments: z.array(attachmentSchema).default([]),
});

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSnippet(text, html) {
  const base = (text && text.trim()) || stripHtml(html);
  if (!base) return '';
  return base.length > 160 ? base.slice(0, 157) + '…' : base;
}

function normalizeParticipant(p) {
  return {
    address: (p.address || '').trim().toLowerCase(),
    name: p.name ? p.name.trim() : null,
  };
}

export function parseMail(rawPayload) {
  const payload = webhookPayloadSchema.parse(rawPayload);
  const from = normalizeParticipant(payload.from);
  const to = (payload.to || []).map(normalizeParticipant);
  const cc = (payload.cc || []).map(normalizeParticipant);
  const bcc = (payload.bcc || []).map(normalizeParticipant);

  return {
    messageId: payload.messageId,
    subject: payload.subject || null,
    from,
    to,
    cc,
    bcc,
    replyTo: payload.replyTo || null,
    html: payload.html || null,
    text: payload.text || null,
    attachments: (payload.attachments || []).map((a) => ({
      filename: a.filename || null,
      mimeType: a.mimeType || null,
      content: a.content || null,
    })),
    folder: 'inbox',
    status: 'unread',
    labels: [],
  };
}

export async function persistMail(db, parsed) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: mails.id })
      .from(mails)
      .where(eq(mails.messageId, parsed.messageId))
      .limit(1);

    if (existing.length) {
      return { id: existing[0].id, duplicate: true };
    }

    const snippet = makeSnippet(parsed.text, parsed.html);
    const hasAttachments = parsed.attachments.length > 0;

    const inserted = await tx
      .insert(mails)
      .values({
        messageId: parsed.messageId,
        subject: parsed.subject,
        fromAddress: parsed.from.address,
        fromName: parsed.from.name,
        replyTo: parsed.replyTo,
        html: parsed.html,
        text: parsed.text,
        snippet,
        folder: parsed.folder,
        status: parsed.status,
        labels: parsed.labels,
        hasAttachments,
      })
      .returning({ id: mails.id });

    const mailId = inserted[0].id;

    const participantRows = [];
    for (const p of parsed.to)
      participantRows.push({ mailId, kind: 'to', address: p.address, name: p.name });
    for (const p of parsed.cc)
      participantRows.push({ mailId, kind: 'cc', address: p.address, name: p.name });
    for (const p of parsed.bcc)
      participantRows.push({ mailId, kind: 'bcc', address: p.address, name: p.name });
    if (participantRows.length) {
      await tx.insert(mailParticipants).values(participantRows);
    }

    if (hasAttachments) {
      const attRows = parsed.attachments.map((a) => {
        let buf = null;
        let size = 0;
        if (a.content) {
          try {
            buf = Buffer.from(a.content, 'base64');
            size = buf.length;
          } catch {
            buf = null;
          }
        }
        return {
          mailId,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: size,
          content: buf,
        };
      });
      await tx.insert(attachments).values(attRows);
    }

    return { id: mailId, duplicate: false };
  });
}
