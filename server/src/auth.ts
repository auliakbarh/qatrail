import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { env } from "./env.js";

export interface TokenPayload {
  userId: string;
  email: string;
  name?: string;
  // Session id of this login. Must match the row's sessionId, else superseded
  // by a newer login elsewhere (single active session).
  sid?: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}
