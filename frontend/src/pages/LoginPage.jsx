import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Button, Input, Card, Error } from '../components/UI'
import Icon from '../components/Icon'

const LoginPage = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await authApi.login(username, password)
      if (response.data.success) {
        login()
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <Icon name="shield" className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Admin Dashboard</h1>
          <p className="text-slate-400">Moderation, Analytics & Settings</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Error message={error} />}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Username
            </label>
            <Input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              disabled={isLoading}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Password
            </label>
            <Input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2"
          >
            <Icon name="lock" className="w-5 h-5" />
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default LoginPage
