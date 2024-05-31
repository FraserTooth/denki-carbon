import { Elysia, Static, t } from "elysia";
import { db } from "./db";
import { users } from "./schema";

const dbGet = async () => {
  const result = await db.select().from(users);
  return result;
};

const postApiBodyValidator = t.Object({
  id: t.Number(),
  displayName: t.String(),
  email: t.String(),
});
type PostValidated = Static<typeof postApiBodyValidator>;

type NewUser = Required<typeof users.$inferInsert>;

const dbAdd = async (body: PostValidated) => {
  const newUser: NewUser = body;
  const result = await db.insert(users).values(newUser).returning();
  return result;
};

const app = new Elysia()
  .get("/", dbGet)
  .post("/", ({ body }) => dbAdd(body), { body: postApiBodyValidator })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
