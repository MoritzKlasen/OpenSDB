import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from './UI'
import Icon from './Icon'

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
      <header className="bg-slate-900 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Admin Dashboard</h1>
            <p className="text-sm text-slate-400">Moderation, Analytics & Settings</p>
          </div>

          <nav className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${isActive('/dashboard')
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
                }`}
            >
              <Icon name="users" className="w-4 h-4" />
              Users
            </button>
            <button
              onClick={() => navigate('/analytics')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${isActive('/analytics')
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
                }`}
            >
              <Icon name="chart" className="w-4 h-4" />
              Analytics
            </button>
            <button
              onClick={() => navigate('/settings')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${isActive('/settings')
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
                }`}
            >
              <Icon name="settings" className="w-4 h-4" />
              Settings
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <Icon name="logout" className="w-4 h-4" />
              Logout
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}

export default Layout
