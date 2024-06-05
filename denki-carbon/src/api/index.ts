import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { areaDataGetHandler, areaDataGetValidator } from "./get/areaData";

const app = new Elysia({ normalize: true })
  .use(
    swagger({
      path: "/docs",
    })
  )
  .get(
    "/v1/area_data",
    ({ query }) => areaDataGetHandler(query),
    areaDataGetValidator
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
