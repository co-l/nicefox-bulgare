export interface AuthUser {
  id: string
  email: string
  role: 'user' | 'admin'
}

export interface TokenPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
  iat: number
  exp: number
}
