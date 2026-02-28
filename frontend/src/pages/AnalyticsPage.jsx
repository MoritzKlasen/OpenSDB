import React, { useState, useCallback, useEffect } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { analyticsApi } from '../utils/api'
import Layout from '../components/Layout'
import { Card, Loading, Error, Empty } from '../components/UI'
import { useWebSocket } from '../hooks/useWebSocket'

const AnalyticsPage = () => {
  const [userGrowthData, setUserGrowthData] = useState(null)
  const [warningActivityData, setWarningActivityData] = useState(null)
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [isLoadingWarnings, setIsLoadingWarnings] = useState(true)
  const [userError, setUserError] = useState(null)
  const [warningError, setWarningError] = useState(null)

  const loadAnalytics = useCallback(async () => {
    const fetchUserGrowth = async () => {
      setIsLoadingUsers(true)
      setUserError(null)
      try {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - 90) // Last 90 days
        const response = await analyticsApi.getUsersGrowth(
          from.toISOString(),
          to.toISOString()
        )
        setUserGrowthData(response.data)
      } catch (err) {
        setUserError('Failed to load user growth data')
      } finally {
        setIsLoadingUsers(false)
      }
    }

    const fetchWarningActivity = async () => {
      setIsLoadingWarnings(true)
      setWarningError(null)
      try {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - 90) // Last 90 days
        const response = await analyticsApi.getWarningsActivity(
          from.toISOString(),
          to.toISOString()
        )
        setWarningActivityData(response.data)
      } catch (err) {
        setWarningError('Failed to load warning activity data')
      } finally {
        setIsLoadingWarnings(false)
      }
    }

    await Promise.all([fetchUserGrowth(), fetchWarningActivity()])
  }, [])

  // Initial load
  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  // WebSocket listener for real-time updates
  const handleWebSocketMessage = useCallback((eventType, data) => {
    if (eventType === 'analytics-updated') {
      // Refetch analytics when data changes
      loadAnalytics()
    }
  }, [loadAnalytics])

  useWebSocket(handleWebSocketMessage)

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const chartHeight = 300

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Analytics Overview</h2>
          <p className="text-slate-400">Monitor user growth and moderation activity • Real-time updates via WebSocket</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-1">Total Users</p>
              <p className="text-3xl font-bold text-blue-400">
                {userGrowthData && userGrowthData.length > 0
                  ? userGrowthData[userGrowthData.length - 1].cumulative
                  : '—'}
              </p>
            </div>
          </Card>

          <Card>
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-1">Users This Month</p>
              <p className="text-3xl font-bold text-green-400">
                {userGrowthData
                  ? userGrowthData
                      .slice(-30)
                      .reduce((sum, d) => sum + d.daily, 0)
                  : '—'}
              </p>
            </div>
          </Card>

          <Card>
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-1">Warnings This Month</p>
              <p className="text-3xl font-bold text-yellow-400">
                {warningActivityData
                  ? warningActivityData
                      .slice(-30)
                      .reduce((sum, d) => sum + d.count, 0)
                  : '—'}
              </p>
            </div>
          </Card>
        </div>

        {/* User Growth Chart */}
        <Card>
          <div className="card-header">
            <h3 className="text-lg font-bold text-slate-100">User Growth</h3>
            <p className="text-xs text-slate-400 mt-1">Cumulative users over time</p>
          </div>

          {isLoadingUsers ? (
            <Loading />
          ) : userError ? (
            <Error message={userError} />
          ) : userGrowthData && userGrowthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={userGrowthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="ts"
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  tickFormatter={formatDate}
                  interval={Math.floor(userGrowthData.length / 12)}
                />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  formatter={(value) => value.toLocaleString()}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#3b82f6"
                  dot={false}
                  isAnimationActive={false}
                  name="Cumulative Users"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty message="No data available" />
          )}
        </Card>

        {/* Warning Activity Chart */}
        <Card>
          <div className="card-header">
            <h3 className="text-lg font-bold text-slate-100">Warning Activity</h3>
            <p className="text-xs text-slate-400 mt-1">Warnings issued over time</p>
          </div>

          {isLoadingWarnings ? (
            <Loading />
          ) : warningError ? (
            <Error message={warningError} />
          ) : warningActivityData && warningActivityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={warningActivityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="ts"
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  tickFormatter={formatDate}
                  interval={Math.floor(warningActivityData.length / 12)}
                />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Legend />
                <Bar
                  dataKey="count"
                  fill="#eab308"
                  name="Warnings"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty message="No data available" />
          )}
        </Card>
      </div>
    </Layout>
  )
}

export default AnalyticsPage
