import { Elysia, t } from "elysia";
import { db } from "./db";
import { users } from "./schema";

const dbGet = async () => {
  const result = await db.select().from(users);
  return result;
};

type NewUser = typeof users.$inferInsert;
const dbAdd = async ({ body }: { body: any }) => {
  const newUser: NewUser = {
    id: body.id,
    displayName: body.displayName,
    email: body.email,
  };
  const result = await db.insert(users).values(newUser).returning();
  return result;
};

const app = new Elysia()
  .get("/", dbGet)
  .post("/", dbAdd, {
    body: t.Object({
      id: t.Number(),
      displayName: t.String(),
      email: t.String(),
    }),
  })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
