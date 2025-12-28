import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the NiceFoxGraphDB client
const mockQuery = vi.fn()
const mockExecute = vi.fn()
const mockHealth = vi.fn()

vi.mock('nicefox-graphdb/packages/client/src/index.ts', () => {
  return {
    NiceFoxGraphDB: class MockNiceFoxGraphDB {
      constructor(public config: unknown) {}
      query = mockQuery
      execute = mockExecute
      health = mockHealth
    },
  }
})

describe('db module', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getGraph', () => {
    it('should create a NiceFoxGraphDB instance with correct config', async () => {
      process.env.GRAPHDB_URL = 'https://test.graphdb.net'
      process.env.GRAPHDB_PROJECT = 'test-project'
      process.env.GRAPHDB_API_KEY = 'test-api-key'
      process.env.NODE_ENV = 'test'

      const { getGraph } = await import('./db.js')
      const graph = getGraph()

      expect((graph as unknown as { config: unknown }).config).toEqual({
        url: 'https://test.graphdb.net',
        project: 'test-project',
        env: 'test',
        apiKey: 'test-api-key',
      })
    })

    it('should use default values when env vars are not set', async () => {
      delete process.env.GRAPHDB_URL
      delete process.env.GRAPHDB_PROJECT
      delete process.env.GRAPHDB_API_KEY
      process.env.NODE_ENV = 'development'

      const { getGraph } = await import('./db.js')
      const graph = getGraph()

      expect((graph as unknown as { config: unknown }).config).toEqual({
        url: 'https://graphdb.nicefox.net',
        project: 'bulgare',
        env: 'test',
        apiKey: '',
      })
    })

    it('should reuse existing graph instance', async () => {
      const { getGraph } = await import('./db.js')
      const graph1 = getGraph()
      const graph2 = getGraph()

      expect(graph1).toBe(graph2)
    })
  })

  describe('runQuery', () => {
    it('should execute a cypher query and return results', async () => {
      const mockResults = [
        { u: { id: '1', email: 'test@example.com' } },
        { u: { id: '2', email: 'test2@example.com' } },
      ]
      mockQuery.mockResolvedValue(mockResults)

      const { runQuery } = await import('./db.js')
      const results = await runQuery('MATCH (u:User) RETURN u')

      expect(mockQuery).toHaveBeenCalledWith('MATCH (u:User) RETURN u', {})
      expect(results).toEqual(mockResults)
    })

    it('should pass parameters to the query', async () => {
      const mockResults = [{ u: { id: '1', email: 'test@example.com' } }]
      mockQuery.mockResolvedValue(mockResults)

      const { runQuery } = await import('./db.js')
      await runQuery('MATCH (u:User {id: $id}) RETURN u', { id: '123' })

      expect(mockQuery).toHaveBeenCalledWith('MATCH (u:User {id: $id}) RETURN u', { id: '123' })
    })
  })

  describe('runSingleQuery', () => {
    it('should return the first result from a query', async () => {
      const mockResults = [
        { u: { id: '1', email: 'test@example.com' } },
        { u: { id: '2', email: 'test2@example.com' } },
      ]
      mockQuery.mockResolvedValue(mockResults)

      const { runSingleQuery } = await import('./db.js')
      const result = await runSingleQuery('MATCH (u:User) RETURN u')

      expect(result).toEqual({ u: { id: '1', email: 'test@example.com' } })
    })

    it('should return null when no results', async () => {
      mockQuery.mockResolvedValue([])

      const { runSingleQuery } = await import('./db.js')
      const result = await runSingleQuery('MATCH (u:User) RETURN u')

      expect(result).toBeNull()
    })
  })

  describe('verifyConnection', () => {
    it('should return true when health check succeeds', async () => {
      mockHealth.mockResolvedValue({ status: 'healthy' })

      const { verifyConnection } = await import('./db.js')
      const result = await verifyConnection()

      expect(result).toBe(true)
    })

    it('should return false when health check fails', async () => {
      mockHealth.mockRejectedValue(new Error('Connection failed'))

      const { verifyConnection } = await import('./db.js')
      const result = await verifyConnection()

      expect(result).toBe(false)
    })
  })

  describe('closeConnection', () => {
    it('should reset the graph instance', async () => {
      const { getGraph, closeConnection } = await import('./db.js')
      
      // Create instance
      const graph1 = getGraph()

      // Close connection
      await closeConnection()

      // Get graph again - should create new instance
      const graph2 = getGraph()

      // Should be different instances
      expect(graph1).not.toBe(graph2)
    })
  })
})
