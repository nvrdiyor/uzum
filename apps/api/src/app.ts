import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env } from './env.js';
import { attachUser } from './lib/auth.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

import authRoutes from './routes/auth.js';
import companyRoutes from './routes/company.js';
import uzumRoutes from './routes/uzum.js';
import syncRoutes from './routes/sync.js';
import analyticsRoutes from './routes/analytics.js';
import salesRoutes from './routes/sales.js';
import funnelRoutes from './routes/funnel.js';
import productsRoutes from './routes/products.js';
import stocksRoutes from './routes/stocks.js';
import plannerRoutes from './routes/planner.js';
import reportsRoutes from './routes/reports.js';
import financeRoutes from './routes/finance.js';
import unitRoutes from './routes/unit.js';
import marketingRoutes from './routes/marketing.js';
import warehouseRoutes from './routes/warehouse.js';
import reviewsRoutes from './routes/reviews.js';
import billingRoutes from './routes/billing.js';
import referralRoutes from './routes/referral.js';
import notificationsRoutes from './routes/notifications.js';
import exportRoutes from './routes/export.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();

  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const allowed = [env.webUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];
        if (allowed.includes(origin) || !env.isProd) return cb(null, true);
        cb(new Error('CORS: ruxsat etilmagan manba'));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  app.use(
    rateLimit({
      windowMs: env.rateLimit.windowMs,
      max: env.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'too_many_requests', message: 'Juda ko‘p so‘rov, birozdan keyin urinib ko‘ring' } },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'savdoiq-api', mode: env.uzum.mode, time: new Date().toISOString() });
  });

  const api = express.Router();
  api.use(attachUser);

  api.use('/auth', authRoutes);
  api.use('/company', companyRoutes);
  api.use('/uzum', uzumRoutes);
  api.use('/sync', syncRoutes);
  api.use('/analytics', analyticsRoutes);
  api.use('/sales', salesRoutes);
  api.use('/funnel', funnelRoutes);
  api.use('/products', productsRoutes);
  api.use('/stocks', stocksRoutes);
  api.use('/planner', plannerRoutes);
  api.use('/reports', reportsRoutes);
  api.use('/finance', financeRoutes);
  api.use('/unit', unitRoutes);
  api.use('/marketing', marketingRoutes);
  api.use('/warehouse', warehouseRoutes);
  api.use('/reviews', reviewsRoutes);
  api.use('/billing', billingRoutes);
  api.use('/referral', referralRoutes);
  api.use('/notifications', notificationsRoutes);
  api.use('/export', exportRoutes);
  api.use('/admin', adminRoutes);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
