const db = require('./src/database');

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const swaggerUi   = require('swagger-ui-express');
const swaggerSpec = require('./src/swagger');

const authRoutes     = require('./src/routes/auth');
const citizenRoutes  = require('./src/routes/citizens');
const locationRoutes = require('./src/routes/locations');
const complaintRoutes= require('./src/routes/complaints');
const { citizenDocRouter, docRouter } = require('./src/routes/documents');

const app  = express();
const PORT = process.env.PORT || 3000;

async function startServer() {
  // ── Initialize database schema ─────────────────────────────────────────────
  await db.init();
  console.log('  ✓ Database initialized');

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Rate Limiting ──────────────────────────────────────────────────────────
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000, max: 200,
    message: { success: false, error: 'Too many requests. Please try again after 15 minutes.' }
  }));
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000, max: 20,
    message: { success: false, error: 'Too many login attempts. Please try again after 15 minutes.' }
  }));

  // ── API Routes ─────────────────────────────────────────────────────────────
  app.use('/api/auth',      authRoutes);
  app.use('/api/citizens',  citizenRoutes);
  app.use('/api/citizens/:nid/documents', citizenDocRouter);
  app.use('/api/citizens/:nid/location',  locationRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/documents',  docRouter);

  // ── Swagger UI ─────────────────────────────────────────────────────────────
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: `
      .swagger-ui .topbar { background: linear-gradient(135deg, #1a1a2e, #16213e); }
      .swagger-ui .topbar-wrapper img { display: none; }
      .swagger-ui .topbar-wrapper::before {
        content: '🇱🇰 SLBFE API Documentation';
        color: #e2e8f0; font-size: 1.2rem; font-weight: 700; padding: 10px;
      }
    `,
    customSiteTitle: 'SLBFE API Docs'
  }));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

  // ── Health Check ───────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => res.json({
    success: true, status: 'healthy', service: 'SLBFE API', version: '1.0.0', timestamp: new Date().toISOString()
  }));

  // ── Client Web App ─────────────────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, '../client')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../client/index.html'));
    }
  });

  // ── Error Handler ──────────────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: 'File too large. Maximum size is 5MB.' });
    if (err.message?.includes('Only PDF'))  return res.status(400).json({ success: false, error: err.message });
    console.error('Server error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(45));
    console.log('  🇱🇰  SLBFE RESTful API Server');
    console.log('='.repeat(45));
    console.log(`  Client App:  http://localhost:${PORT}`);
    console.log(`  API Base:    http://localhost:${PORT}/api`);
    console.log(`  Swagger UI:  http://localhost:${PORT}/api-docs`);
    console.log(`  Health:      http://localhost:${PORT}/api/health`);
    console.log('='.repeat(45) + '\n');
  });
}

startServer().catch(err => { console.error('Startup failed:', err); process.exit(1); });

module.exports = app;
