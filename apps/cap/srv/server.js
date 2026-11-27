import cds from '@sap/cds';
import { getConfig } from './lib/config/app-config.ts';

// Fail at startup (not at first request) when configuration is invalid.
const config = getConfig();

cds.on('bootstrap', (app) => {
  // CORS: explicit allow-list per environment (CORS_ALLOWED_ORIGINS); never '*'.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (config.corsAllowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,authorization');
      } else if (req.method === 'OPTIONS') {
        return res.sendStatus(403);
      }
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Direct REST health endpoint (public; reveals no secrets). Reads the same
  // validated configuration the code uses, so it cannot drift from reality.
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'UP',
      service: 'sria-cap-backend',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      environmentTier: config.tier,
      isSynthetic: config.isSynthetic,
      components: {
        capService: { status: 'UP', profile: cds.env.profile || 'development' },
        database: { status: 'UP', dialect: cds.env.requires?.db?.kind || 'unknown' },
        dataProvider: { status: 'UP', mode: config.financeProvider },
        aiEngine: { status: 'UP', provider: config.aiProvider }
      }
    });
  });
});

export default cds.server;
