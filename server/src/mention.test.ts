import { describe, it, expect } from "vitest";
import { findMentions } from "./resolvers/comment.js";

const users = [{ id: "1", name: "Ana Lee" }, { id: "2", name: "Ana" }, { id: "3", name: "Budi" }];
const ids = (body: string) => findMentions(users, body).map((u) => u.id).sort();

describe("findMentions", () => {
  it("matches a name with a space", () => expect(ids("cek ini @Ana Lee ya")).toEqual(["1"]));
  it("matches the short name on its own", () => expect(ids("@Ana cek")).toEqual(["2"]));
  it("is case-insensitive", () => expect(ids("@budi tolong")).toEqual(["3"]));
  it("ignores a name without @", () => expect(ids("Budi sudah cek")).toEqual([]));
  it("matches every mention in one body", () => expect(ids("@Ana Lee + @Budi")).toEqual(["1", "3"]));
});
