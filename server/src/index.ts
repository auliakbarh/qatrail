import { createServer } from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
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
import { startScheduler } from "./scheduler.js";
import { notifyDiscord, NOTIFIABLE } from "./discord.js";

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
// Security headers. CSP is disabled here (the API returns JSON, not HTML — the
// CSP belongs on the client host / nginx). CORP set cross-origin so the separate
// client origin can read responses. HSTS/noSniff/frameguard/etc. stay on.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
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
    // Broadcast successful project-domain mutations to Discord (fire-and-forget).
    {
      async requestDidStart() {
        return {
          async willSendResponse(rc: any) {
            try {
              if (rc.operation?.operation !== "mutation") return;
              if (rc.errors?.length) return;
              const actor = rc.contextValue?.userName ?? null;
              const vars = rc.request?.variables ?? {};
              const data = rc.response?.body?.singleResult?.data ?? {};
              for (const sel of rc.operation.selectionSet.selections) {
                const field = sel.name?.value;
                if (!field || !NOTIFIABLE.has(field)) continue;
                const input = vars.input ?? {};
                const name = input.title ?? input.name ?? null; // issue/testcase title or project/feature name
                const note = vars.reason ?? vars.note ?? null;
                // Deep-link when the mutation concerns an issue.
                const issueId = field.toLowerCase().includes("issue") ? (data[field]?.id ?? vars.id ?? null) : null;
                const url = issueId ? `${env.frontendBaseUrl}/issues/${issueId}` : null;
                const extra: { name: string; value: string }[] = [];
                // Dump the submitted form fields (skip name/title shown elsewhere,
                // mask secrets, summarize arrays). Cap to keep the embed sane.
                const SKIP = new Set(["name", "title", "testPassword"]);
                for (const [k, v] of Object.entries(input)) {
                  if (extra.length >= 12 || SKIP.has(k) || v == null || v === "") continue;
                  let val: string;
                  if (Array.isArray(v)) {
                    if (v.length === 0) continue;
                    val = `${v.length} item(s)`;
                  } else if (typeof v === "object") {
                    continue;
                  } else {
                    val = String(v);
                  }
                  extra.push({ name: k, value: val });
                }
                if (vars.jiraKey) extra.push({ name: "jiraKey", value: String(vars.jiraKey) });
                if (typeof vars.archived === "boolean") extra.push({ name: "archived", value: String(vars.archived) });
                void notifyDiscord(field, actor, { name, note, url, extra });
                // Persist the same event to the audit trail (fire-and-forget).
                void prisma.auditLog
                  .create({
                    data: {
                      action: field,
                      entityId: data[field]?.id ?? vars.id ?? null,
                      label: name,
                      actor,
                      actorId: rc.contextValue?.userId ?? null,
                    },
                  })
                  .catch(() => {});
              }
            } catch {
              /* never break the response */
            }
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
  startScheduler();
});
