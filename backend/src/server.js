import app from './app.js';
import 'dotenv/config';
import { setupSwagger } from './utils/swagger.js';

const PORT = process.env.PORT || 3000;
setupSwagger(app, PORT);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📘 Swagger docs: http://localhost:${PORT}/api-docs`);
});
