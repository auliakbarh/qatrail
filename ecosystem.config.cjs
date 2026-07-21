// PM2 process config. See docs/DEPLOY.md.
//   pm2 start ecosystem.config.cjs
//
// - qar-server: the GraphQL API (reads server/.env via dotenv).
// - qar-client: serves the built client (client/dist) as an SPA. Omit this app
//   if you serve the static build through nginx instead (recommended in prod).
module.exports = {
  apps: [
    {
      name: "qar-server",
      cwd: "./server",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        // Other vars come from server/.env (loaded by the app via dotenv).
      },
    },
    {
      name: "qar-client",
      script: "npx",
      args: "serve -s client/dist -l 5173",
      autorestart: true,
      // Alternative without `serve`: pm2 serve client/dist 5173 --spa --name qar-client
    },
  ],
};
