// @ts-ignore - nicefox-graphdb is imported from TypeScript source
import { NiceFoxGraphDB } from 'nicefox-graphdb/packages/client/src/index.ts'

let graph: NiceFoxGraphDB | null = null

export function getGraph(): NiceFoxGraphDB {
  if (!graph) {
    const url = process.env.GRAPHDB_URL || 'https://graphdb.nicefox.net'
    const project = process.env.GRAPHDB_PROJECT || 'bulgare'
    const apiKey = process.env.GRAPHDB_API_KEY || ''
    const env = process.env.NODE_ENV === 'production' ? 'production' : 'test'

    graph = new NiceFoxGraphDB({
      url,
      project,
      env,
      apiKey,
    })
  }
  return graph
}

export async function verifyConnection(): Promise<boolean> {
  try {
    await getGraph().health()
    console.log('Connected to NiceFox GraphDB')
    return true
  } catch (error) {
    console.error('Failed to connect to NiceFox GraphDB:', error)
    return false
  }
}

export async function closeConnection(): Promise<void> {
  graph = null
}

export async function runQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  return getGraph().query<T>(cypher, params)
}

export async function runSingleQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T | null> {
  const results = await runQuery<T>(cypher, params)
  return results[0] || null
}
