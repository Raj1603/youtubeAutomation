import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

export const setupSwagger = (app, PORT) => {
  const options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Video Clip Transcription API',
        version: '1.0.0',
        description: 'API for processing and transcribing video clips via Cloudinary and n8n',
      },
      servers: [{ url: `http://localhost:${PORT}` }],
    },
    apis: ['./routes/*.js', './src/routes/*.js'],
  };

  const specs = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
};
