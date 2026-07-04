import { config } from "dotenv";
import { SQL } from "bun";

config({ override: true });

export const db = new SQL({
  url: process.env.DATABASE_URL
});