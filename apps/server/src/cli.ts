import { buildServer } from './index.js';

void buildServer().then(({ app, configuration }) => {
  void app.listen({
    port: configuration.PORT,
    host: configuration.HOST,
  });
});
