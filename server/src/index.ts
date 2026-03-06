import express from 'express';
import cors from 'cors';
import paymentsRouter from './routes/payments';
import webhooksRouter from './routes/webhooks';
import emailsRouter from './routes/emails';
import notificationsRouter from './routes/notifications';

const app = express();
const port = process.env.PORT ?? 3001;

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:8081', 'http://localhost:19006'],
}));

// JSON parser global — sauf /api/webhooks qui utilise raw body
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/stripe') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Routes
app.use('/api/payments', paymentsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/notifications', notificationsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Tournesol API running on port ${port}`);
});
