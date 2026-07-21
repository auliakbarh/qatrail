import { createServer } from "http";
import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers/index.js";
import { buildContext, contextFromAuthHeader } from "./context.js";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";

process.on("uncaughtException", (err) => logger.fatal({ err }, "uncaughtException"));
process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "unhandledRejection"));

const schema = makeExecutableSchema({ typeDefs, resolvers });

// Origin allow-list shared by HTTP CORS and the WebSocket handshake.
function originAllowed(origin?: string | null): boolean {
  if (!env.isProd) return true;
  if (!origin) return true;
  return env.corsOrigins.includes(origin);
}

if (env.isProd && env.corsOrigins.length === 0) {
  logger.warn("CORS_ORIGINS is empty in production — browser cross-origin requests will be blocked.");
}

const app = express();
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
const httpServer = createServer(app);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
  verifyClient: ({ origin }, done) => done(originAllowed(origin)),
});
const wsCleanup = useServer(
  {
    schema,
    context: (ctx) => {
      const params = (ctx.connectionParams ?? {}) as Record<string, unknown>;
      const header = (params.authorization || params.Authorization) as string | undefined;
      return contextFromAuthHeader(header);
    },
  },
  wsServer,
);

const server = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await wsCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();

const gqlMiddleware = expressMiddleware(server, {
  context: async ({ req }) => buildContext({ req: { headers: req.headers as any } }),
});
const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (originAllowed(origin)) cb(null, true);
    else cb(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
};
app.use(["/graphql", "/"], cors<cors.CorsRequest>(corsOptions), express.json({ limit: "2mb" }), gqlMiddleware);

async function shutdown() {
  await server.stop();
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
}
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void shutdown());

httpServer.listen(env.port, () => {
  logger.info({ port: env.port }, `QA Reporting GraphQL ready at http://localhost:${env.port}/graphql`);
});
