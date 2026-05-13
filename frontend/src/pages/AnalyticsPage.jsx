import React, { useState, useCallback, useEffect, useMemo } from 'react'
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
import Icon from '../components/Icon'

const AnalyticsPage = () => {
  const [userGrowthData, setUserGrowthData] = useState(null)
  const [warningActivityData, setWarningActivityData] = useState(null)
  const [alertsActivityData, setAlertsActivityData] = useState(null)
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [isLoadingWarnings, setIsLoadingWarnings] = useState(true)
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true)
  const [userError, setUserError] = useState(null)
  const [warningError, setWarningError] = useState(null)
  const [alertsError, setAlertsError] = useState(null)
  const [userGrowthTimeRange, setUserGrowthTimeRange] = useState('overall')
  const [warningTimeRange, setWarningTimeRange] = useState('overall')
  const [alertsTimeRange, setAlertsTimeRange] = useState('overall')

  const loadAnalytics = useCallback(async () => {
    const fetchUserGrowth = async () => {
      setIsLoadingUsers(true)
      setUserError(null)
      try {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - 365)
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
        from.setDate(from.getDate() - 365)
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

    const fetchAlertsActivity = async () => {
      setIsLoadingAlerts(true)
      setAlertsError(null)
      try {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - 365)
        const response = await analyticsApi.getAlertsActivity(
          from.toISOString(),
          to.toISOString()
        )
        setAlertsActivityData(response.data)
      } catch (err) {
        setAlertsError('Failed to load alerts activity data')
      } finally {
        setIsLoadingAlerts(false)
      }
    }

    await Promise.all([fetchUserGrowth(), fetchWarningActivity(), fetchAlertsActivity()])
  }, [])

  useEffect(() => {
    loadAnalytics()
    const interval = setInterval(loadAnalytics, 15000)
    return () => clearInterval(interval)
  }, [loadAnalytics])

  const handleWebSocketMessage = useCallback((eventType, data) => {
    if (eventType === 'analytics-updated') {
      loadAnalytics()
    }
  }, [loadAnalytics])

  useWebSocket(handleWebSocketMessage)

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getAvailableMonths = (data) => {
    if (!data || data.length === 0) return []

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const earliest = new Date(data[0].ts)
    const now = new Date()

    const available = []
    let currentDate = new Date(earliest)

    while (currentDate <= now) {
      available.push({
        month: months[currentDate.getMonth()],
        year: currentDate.getFullYear(),
        monthIndex: currentDate.getMonth(),
        yearValue: currentDate.getFullYear(),
        key: `${currentDate.getFullYear()}-${currentDate.getMonth()}`
      })
      currentDate.setMonth(currentDate.getMonth() + 1)
    }

    return available
  }

  const getMonthOptions = () => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return months
  }

  const filterDataByTimeRange = (data, timeRange) => {
    if (!data) return data
    if (timeRange === 'overall') return data

    const now = new Date()
    let startDate

    if (timeRange === 'current') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (timeRange.startsWith('since-')) {
      const [, yearStr, monthStr] = timeRange.split('-')
      const year = parseInt(yearStr)
      const month = parseInt(monthStr)
      startDate = new Date(year, month, 1)
    } else {
      return data
    }

    const startIso = startDate.toISOString()
    return data.filter(d => d.ts >= startIso)
  }

  const TimeRangeControls = ({ timeRange, onTimeRangeChange, availableMonths = [] }) => (
    <div className="flex gap-2 mb-4 flex-wrap items-center">
      <button
        onClick={() => onTimeRangeChange('overall')}
        className={`px-3 py-1 text-sm rounded ${timeRange === 'overall'
          ? 'bg-blue-600 text-slate-100'
          : 'bg-slate-700 hover:bg-slate-600 text-slate-100'
          }`}
      >
        Overall
      </button>
      <button
        onClick={() => onTimeRangeChange('current')}
        className={`px-3 py-1 text-sm rounded ${timeRange === 'current'
          ? 'bg-blue-600 text-slate-100'
          : 'bg-slate-700 hover:bg-slate-600 text-slate-100'
          }`}
      >
        This Month
      </button>
      {availableMonths.length > 0 && (
        <select
          value={timeRange}
          onChange={(e) => onTimeRangeChange(e.target.value)}
          className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-100 cursor-pointer"
        >
          <option value="overall" disabled>Since month...</option>
          {availableMonths.map((item) => (
            <option key={item.key} value={`since-${item.yearValue}-${item.monthIndex}`}>
              Since {item.month} {item.year}
            </option>
          ))}
        </select>
      )}
    </div>
  )

  const filteredUserGrowth = useMemo(() => filterDataByTimeRange(userGrowthData, userGrowthTimeRange), [userGrowthData, userGrowthTimeRange])
  const filteredWarningActivity = useMemo(() => filterDataByTimeRange(warningActivityData, warningTimeRange), [warningActivityData, warningTimeRange])
  const filteredAlertsActivity = useMemo(() => filterDataByTimeRange(alertsActivityData, alertsTimeRange), [alertsActivityData, alertsTimeRange])

  const usersThisMonth = useMemo(() => {
    if (!userGrowthData) return null
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    return userGrowthData.filter(d => d.ts >= monthStart).reduce((sum, d) => sum + d.daily, 0)
  }, [userGrowthData])

  const warningsThisMonth = useMemo(() => {
    if (!warningActivityData) return null
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    return warningActivityData.filter(d => d.ts >= monthStart).reduce((sum, d) => sum + d.count, 0)
  }, [warningActivityData])

  const alertsThisMonth = useMemo(() => {
    if (!alertsActivityData) return null
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    return alertsActivityData.filter(d => d.ts >= monthStart).reduce((sum, d) => sum + d.count, 0)
  }, [alertsActivityData])

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Analytics Overview</h2>
          <p className="text-slate-400">Monitor user growth and moderation activity • Real-time updates via WebSocket</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="userGroup" className="w-5 h-5 text-blue-400" />
                <p className="text-sm text-slate-400">Total Users</p>
              </div>
              <p className="text-3xl font-bold text-blue-400">
                {userGrowthData && userGrowthData.length > 0
                  ? userGrowthData[userGrowthData.length - 1].cumulative
                  : '—'}
              </p>
            </div>
          </Card>

          <Card>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="trendingUp" className="w-5 h-5 text-green-400" />
                <p className="text-sm text-slate-400">Users This Month</p>
              </div>
              <p className="text-3xl font-bold text-green-400">
                {usersThisMonth ?? '—'}
              </p>
            </div>
          </Card>

          <Card>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="exclamation" className="w-5 h-5 text-yellow-400" />
                <p className="text-sm text-slate-400">Warnings This Month</p>
              </div>
              <p className="text-3xl font-bold text-yellow-400">
                {warningsThisMonth ?? '—'}
              </p>
            </div>
          </Card>

          <Card>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="shield" className="w-5 h-5 text-red-400" />
                <p className="text-sm text-slate-400">Scam Alerts This Month</p>
              </div>
              <p className="text-3xl font-bold text-red-400">
                {alertsThisMonth ?? '—'}
              </p>
            </div>
          </Card>
        </div>

        <Card>
          <div className="card-header">
            <h3 className="text-lg font-bold text-slate-100">User Growth</h3>
            <p className="text-xs text-slate-400 mt-1">Cumulative users over time</p>
          </div>

          <TimeRangeControls
            timeRange={userGrowthTimeRange}
            onTimeRangeChange={setUserGrowthTimeRange}
            availableMonths={getAvailableMonths(userGrowthData)}
          />

          {isLoadingUsers ? (
            <Loading />
          ) : userError ? (
            <Error message={userError} />
          ) : userGrowthData && userGrowthData.length > 0 ? (
            <div className="overflow-x-auto" style={{ overflowY: 'visible' }}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={filteredUserGrowth} margin={{ right: 30, left: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="ts"
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                    tickFormatter={formatDate}
                    interval={!filteredUserGrowth || filteredUserGrowth.length === 0 ? 0 : Math.max(1, Math.floor(filteredUserGrowth.length / 12))}
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
            </div>
          ) : (
            <Empty message="No data available" />
          )}
        </Card>

        <Card>
          <div className="card-header">
            <h3 className="text-lg font-bold text-slate-100">Warning Activity</h3>
            <p className="text-xs text-slate-400 mt-1">Warnings issued over time</p>
          </div>

          <TimeRangeControls
            timeRange={warningTimeRange}
            onTimeRangeChange={setWarningTimeRange}
            availableMonths={getAvailableMonths(warningActivityData)}
          />

          {isLoadingWarnings ? (
            <Loading />
          ) : warningError ? (
            <Error message={warningError} />
          ) : warningActivityData && warningActivityData.length > 0 ? (
            <div className="overflow-x-auto" style={{ overflowY: 'visible' }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={filteredWarningActivity} margin={{ right: 30, left: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="ts"
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                    tickFormatter={formatDate}
                    interval={
                      !filteredWarningActivity || filteredWarningActivity.length === 0
                        ? 1
                        : Math.max(1, Math.floor(filteredWarningActivity.length / 12))
                    }
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
            </div>
          ) : (
            <Empty message="No data available" />
          )}
        </Card>

        <Card>
          <div className="card-header">
            <h3 className="text-lg font-bold text-slate-100">Scam Detection Alerts</h3>
            <p className="text-xs text-slate-400 mt-1">Anti-scam alerts sent over time</p>
          </div>

          <TimeRangeControls
            timeRange={alertsTimeRange}
            onTimeRangeChange={setAlertsTimeRange}
            availableMonths={getAvailableMonths(alertsActivityData)}
          />

          {isLoadingAlerts ? (
            <Loading />
          ) : alertsError ? (
            <Error message={alertsError} />
          ) : alertsActivityData && alertsActivityData.length > 0 ? (
            <div className="overflow-x-auto" style={{ overflowY: 'visible' }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={filteredAlertsActivity} margin={{ right: 30, left: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="ts"
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                    tickFormatter={formatDate}
                    interval={
                      filteredAlertsActivity?.length > 0
                        ? Math.max(1, Math.floor(filteredAlertsActivity.length / 12))
                        : 1
                    }
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Legend />
                  <Bar
                    dataKey="count"
                    fill="#ef4444"
                    name="Alerts"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty message="No data available" />
          )}
        </Card>
      </div>
    </Layout>
  )
}

export default AnalyticsPage
