import mysql from "mysql2/promise";

export class DatabaseUnavailableError extends Error {
  constructor(message = "Database is not configured.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

function envValue(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function isDatabaseConfigured(): boolean {
  return Boolean(
    envValue("DB_HOST") && envValue("DB_USER") && envValue("DB_PASSWORD") && envValue("DB_NAME"),
  );
}

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!isDatabaseConfigured()) {
    throw new DatabaseUnavailableError(
      "Database is not configured. Set it on the server. Saves will not use in-memory data.",
    );
  }
  if (!pool) {
    pool = mysql.createPool({
      host: envValue("DB_HOST"),
      port: Number(envValue("DB_PORT") || 3306),
      user: envValue("DB_USER"),
      password: envValue("DB_PASSWORD"),
      database: envValue("DB_NAME"),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function pingDatabase(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    const connection = await getPool().getConnection();
    await connection.query("SELECT 1");
    connection.release();
    return true;
  } catch {
    return false;
  }
}

export function toSqlDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace("T", " ");
}

export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    if (value.includes("T")) return new Date(value).toISOString();
    return new Date(`${value.replace(" ", "T")}Z`).toISOString();
  }
  return new Date().toISOString();
}

export function asBool(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}
