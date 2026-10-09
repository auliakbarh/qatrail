import { type Context, requireAuth } from "../context.js";
import { presignUpload } from "../s3.js";

export const uploadResolvers = {
  Mutation: {
    // VIEWER and maintenance are refused by the guards in index.ts.
    async createUploadUrl(_: unknown, args: { fileName: string; contentType: string; size: number }, ctx: Context) {
      requireAuth(ctx);
      return presignUpload(args.fileName, args.contentType || "application/octet-stream", args.size);
    },
  },
};
