import { config } from "dotenv";
import { SQL } from "bun";

config({ override: true });

const url =
  process.env.NODE_ENV === "test"
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

export const db = new SQL({ url });