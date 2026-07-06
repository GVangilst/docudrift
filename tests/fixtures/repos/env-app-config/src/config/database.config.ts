// Real application runtime config (NestJS idiom) — reads env the app needs.
export const dbConfig = {
  url: process.env.DATABASE_URL,
};
