import neo4j, { Driver } from 'neo4j-driver'

let driver: Driver | null = null

export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687'
    const user = process.env.NEO4J_USER || 'neo4j'
    const password = process.env.NEO4J_PASSWORD || ''

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      disableLosslessIntegers: true,
      encrypted: 'ENCRYPTION_OFF',
    })
  }
  return driver
}

export async function verifyConnection(): Promise<boolean> {
  try {
    const session = getDriver().session()
    try {
      await session.run('RETURN 1')
      console.log('Connected to Neo4j')
      return true
    } finally {
      await session.close()
    }
  } catch (error) {
    console.error('Failed to connect to Neo4j:', error)
    return false
  }
}

export async function closeConnection(): Promise<void> {
  if (driver) {
    await driver.close()
    driver = null
  }
}

export async function runQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session = getDriver().session()
  try {
    const result = await session.run(cypher, params)
    return result.records.map((record) => record.toObject() as T)
  } finally {
    await session.close()
  }
}

export async function runSingleQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T | null> {
  const results = await runQuery<T>(cypher, params)
  return results[0] || null
}
