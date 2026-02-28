import React, { useState, useEffect, useCallback } from 'react'
import { userApi } from '../utils/api'
import { Button, Input, Card, Loading, Empty, Error, Badge } from './UI'
import UserDetail from './UserDetail'
import { useWebSocket } from '../hooks/useWebSocket'

const UserList = () => {
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await userApi.getAll()
      setUsers(response.data)
      
      // Update selected user with fresh data if one is selected
      setSelectedUser(prevSelected => {
        if (!prevSelected) return null
        const updated = response.data.find(u => u._id === prevSelected._id)
        return updated || prevSelected
      })
    } catch (err) {
      setError('Failed to load users')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // WebSocket listener for real-time updates
  const handleWebSocketMessage = useCallback((eventType, data) => {
    if (eventType === 'users-updated') {
      // Refetch users when any update happens
      loadUsers()
    }
  }, [loadUsers])

  useWebSocket(handleWebSocketMessage)

  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase()
    return (
      user.discordTag?.toLowerCase().includes(term) ||
      user.discordId?.toLowerCase().includes(term) ||
      user.firstName?.toLowerCase().includes(term) ||
      user.lastName?.toLowerCase().includes(term)
    )
  })

  const handleUserSelect = (user) => {
    setSelectedUser(user)
  }

  const handleUserUpdate = (updatedUser) => {
    // Update user in list
    setUsers(users.map(u => u._id === updatedUser._id ? updatedUser : u))
    // Update selected user
    setSelectedUser(updatedUser)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* User List Panel */}
      <div className="lg:col-span-1">
        <Card className="flex flex-col h-full">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-100">Users</h2>
            <p className="text-xs text-slate-400 mt-1">{filteredUsers.length} users</p>
          </div>

          <div className="mb-4">
            <Input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {isLoading ? (
            <Loading />
          ) : error ? (
            <Error message={error} onRetry={loadUsers} />
          ) : filteredUsers.length === 0 ? (
            <Empty message="No users found" />
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredUsers.map(user => (
                <button
                  key={user._id}
                  onClick={() => handleUserSelect(user)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedUser?._id === user._id
                      ? 'bg-blue-600'
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <div className="font-medium text-sm text-slate-100">
                    {user.discordTag}
                  </div>
                  <div className="text-xs text-slate-400">
                    {user.discordId}
                  </div>
                  {user.warnings?.length > 0 && (
                    <Badge variant="warning" className="mt-1">
                      {user.warnings.length} warning{user.warnings.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* User Detail Panel */}
      <div className="lg:col-span-2">
        {selectedUser ? (
          <UserDetail user={selectedUser} onUserUpdate={handleUserUpdate} />
        ) : (
          <Card>
            <div className="text-center py-12 text-slate-400">
              <p className="text-lg mb-2">Select a user to view details</p>
              <p className="text-sm">Click on a user from the list to get started</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

export default UserList
