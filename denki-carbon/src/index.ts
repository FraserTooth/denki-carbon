import { Elysia, Static, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { db } from "./db";
import { users } from "./schema";

type NewUser = typeof users.$inferInsert;
type User = typeof users.$inferSelect;

const dbGet = async (): Promise<User[]> => {
  const result = await db.select().from(users);
  return result;
};

const postApiBodyValidator = t.Object({
  id: t.Number(),
  displayName: t.String(),
  email: t.String(),
});
type PostValidated = Static<typeof postApiBodyValidator>;

const dbAdd = async (body: PostValidated): Promise<User[]> => {
  const newUser: NewUser = {
    displayName: body.displayName,
    email: body.email,
  };
  const result = await db.insert(users).values(newUser).returning();
  return result;
};

const app = new Elysia()
  .use(
    swagger({
      path: "/docs",
    })
  )
  .get("/test", dbGet)
  .post("/test", ({ body }) => dbAdd(body), { body: postApiBodyValidator })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
