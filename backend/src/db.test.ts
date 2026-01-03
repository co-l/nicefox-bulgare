import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { GraphDB, type GraphDBClient } from 'nicefox-graphdb'

describe('db module with :memory: database', () => {
  let db: GraphDBClient

  beforeAll(async () => {
    process.env.NODE_ENV = 'development'
    db = await GraphDB({
      project: 'test',
      dataPath: ':memory:',
    })
  })

  afterAll(() => {
    db.close()
  })

  beforeEach(async () => {
    // Clean up all nodes before each test
    await db.execute('MATCH (n) DETACH DELETE n')
  })

  describe('basic operations', () => {
    it('should create and query nodes', async () => {
      await db.execute('CREATE (u:User {name: $name, email: $email})', {
        name: 'Alice',
        email: 'alice@example.com',
      })

      const users = await db.query<{ name: string; email: string }>(
        'MATCH (u:User) RETURN u.name AS name, u.email AS email'
      )

      expect(users).toEqual([{ name: 'Alice', email: 'alice@example.com' }])
    })

    it('should return empty array when no results', async () => {
      const users = await db.query<{ name: string }>('MATCH (u:User) RETURN u.name AS name')
      expect(users).toEqual([])
    })

    it('should support query parameters', async () => {
      await db.execute('CREATE (u:User {id: $id, name: $name})', { id: '123', name: 'Bob' })
      await db.execute('CREATE (u:User {id: $id, name: $name})', { id: '456', name: 'Carol' })

      const result = await db.query<{ name: string }>(
        'MATCH (u:User {id: $id}) RETURN u.name AS name',
        { id: '123' }
      )

      expect(result).toEqual([{ name: 'Bob' }])
    })

    it('should support relationships', async () => {
      await db.execute(`
        CREATE (a:User {name: 'Alice'})-[:FOLLOWS]->(b:User {name: 'Bob'})
      `)

      const result = await db.query<{ follower: string; followed: string }>(
        'MATCH (a:User)-[:FOLLOWS]->(b:User) RETURN a.name AS follower, b.name AS followed'
      )

      expect(result).toEqual([{ follower: 'Alice', followed: 'Bob' }])
    })
  })

  describe('health check', () => {
    it('should return healthy status', async () => {
      const health = await db.health()
      expect(health.status).toBe('ok')
    })
  })
})
