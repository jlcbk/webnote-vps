import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, config.host, () => {
  console.log(`WebNote VPS is running at http://${config.host}:${config.port}`);
});
