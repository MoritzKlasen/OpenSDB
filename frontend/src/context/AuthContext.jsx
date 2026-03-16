import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authCheckClient = axios.create({
          baseURL: '',
          withCredentials: true,
        })

        await authCheckClient.get('/api/verified-users')
        setIsAuthenticated(true)
      } catch (error) {
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
    } catch (err) { }
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
