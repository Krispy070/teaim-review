import { customType, sql } from "drizzle-orm/pg-core";

export const vector = (name: string, dimensions: number) =>
  customType<{ data: unknown; driverData: unknown }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver() {
      return sql.raw("NULL");
    },
  })(name);
