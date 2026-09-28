import { app } from './app.js';
import { config } from './config.js';

// Vercel consume la aplicación como una Function; localmente seguimos
// levantando un servidor HTTP tradicional para desarrollo.
export default app;

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`SIGTI API disponible en http://localhost:${config.port}`);
  });
}
