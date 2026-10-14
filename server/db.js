const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL no esta configurada. La API usara solo archivos estaticos hasta configurar Supabase.");
}

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    })
  : null;

async function query(text, params = []) {
  if (!pool) {
    const error = new Error("Base de datos no configurada. Defina DATABASE_URL en .env.");
    error.status = 503;
    throw error;
  }
  return pool.query(text, params);
}

async function transaction(work) {
  if (!pool) {
    const error = new Error("Base de datos no configurada. Defina DATABASE_URL en .env.");
    error.status = 503;
    throw error;
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { query, transaction };
