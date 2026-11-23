import cds from '@sap/cds';

cds.on('bootstrap', (app) => {
  // CORS configuration for local development
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Direct REST Health Endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'UP',
      service: 'sria-cap-backend',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      components: {
        capService: {
          status: 'UP',
          profile: cds.env.profile || 'development'
        },
        database: {
          status: 'UP',
          dialect: 'sqlite'
        },
        dataProvider: {
          status: 'UP',
          mode: process.env.FINANCE_DATA_PROVIDER || 'mock'
        },
        aiEngine: {
          status: 'UP',
          provider: process.env.AI_RUNTIME_PROVIDER || 'mock'
        }
      }
    });
  });
});

export default cds.server;

