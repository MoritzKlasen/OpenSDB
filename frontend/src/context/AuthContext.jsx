import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Create isolated axios instance for auth check (no interceptors)
        const authCheckClient = axios.create({
          baseURL: '',
          withCredentials: true,
        })
        
        // Try to access a protected endpoint to verify authentication
        await authCheckClient.get('/api/verified-users')
        setIsAuthenticated(true)
      } catch (error) {
        // Any error (including 401) means not authenticated
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = () => {
    setIsAuthenticated(true)
  }

  const logout = async () => {
    try {
      const logoutClient = axios.create({
        baseURL: '',
        withCredentials: true,
      })
      await logoutClient.get('/logout')
    } catch (err) {
      // Logout error - silently fail
    }
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
