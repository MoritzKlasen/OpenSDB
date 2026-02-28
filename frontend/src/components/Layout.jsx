import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from './UI'

const Layout = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  const handleLogout = async () => {
    logout()
    navigate('/login')
  }

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Admin Dashboard</h1>
            <p className="text-sm text-slate-400">Moderation & Analytics</p>
          </div>

          <nav className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isActive('/dashboard')
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => navigate('/analytics')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isActive('/analytics')
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Analytics
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}

export default Layout
