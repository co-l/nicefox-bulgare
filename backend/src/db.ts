import { GraphDB, type GraphDBClient } from 'nicefox-graphdb'

let db: GraphDBClient | null = null

/**
 * Get or create the GraphDB client.
 * In development mode (NODE_ENV=development), uses local SQLite.
 * In production, connects to the remote GraphDB server.
 */
export async function getDb(): Promise<GraphDBClient> {
  if (!db) {
    db = await GraphDB({
      project: process.env.GRAPHDB_PROJECT || 'bulgare',
      // url, apiKey, env are auto-read from GRAPHDB_* env vars
      // In dev mode (NODE_ENV=development), uses local SQLite automatically
    })
  }
  return db
}

export async function verifyConnection(): Promise<boolean> {
  try {
    const client = await getDb()
    await client.health()
    console.log('Connected to NiceFox GraphDB')
    return true
  } catch (error) {
    console.error('Failed to connect to NiceFox GraphDB:', error)
    return false
  }
}

export async function closeConnection(): Promise<void> {
  if (db) {
    db.close()
    db = null
  }
}

export async function runQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const client = await getDb()
  return client.query<T>(cypher, params)
}

export async function runSingleQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T | null> {
  const results = await runQuery<T>(cypher, params)
  return results[0] || null
}
