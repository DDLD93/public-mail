import 'dotenv/config';
import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import webhookRouter from './routes/webhook.js';
import mailRouter from './routes/mail.js';
import attachmentsRouter from './routes/attachments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/webhook', webhookRouter);
app.use('/attachments', attachmentsRouter);
app.use('/', mailRouter);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send('Internal error');
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`public-mail listening on http://localhost:${port}`);
});
