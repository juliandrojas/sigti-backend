import { app } from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`SIGTI API disponible en http://localhost:${config.port}`);
});
