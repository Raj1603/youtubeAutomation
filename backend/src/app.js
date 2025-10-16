import express from 'express';
import clipRoutes from './routes/clipRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import { setupSwagger } from './utils/swagger.js';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.use('/api', healthRoutes);
app.use('/api/clips', clipRoutes);

// Setup Swagger after routes are defined
setupSwagger(app, process.env.PORT || 3000);

export default app;
