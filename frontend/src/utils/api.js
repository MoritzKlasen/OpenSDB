import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

export const authApi = {
  login: (username, password) => api.post('/api/login', { username, password }),
  logout: () => api.get('/logout'),
}

export const userApi = {
  getAll: () => api.get('/api/verified-users'),
  updateComment: (discordId, comment) =>
    api.put(`/api/update-comment/${discordId}`, { comment }),
  removeWarning: (discordId, index) =>
    api.delete(`/api/remove-warning/${discordId}/${index}`),
  exportCsv: () =>
    api.get('/api/export-users', { responseType: 'blob' }),
  importCsv: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/import-users', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const analyticsApi = {
  getUsersGrowth: (from, to) =>
    api.get('/api/dashboard/users-growth', {
      params: { from, to },
    }),
  getWarningsActivity: (from, to) =>
    api.get('/api/dashboard/warnings-activity', {
      params: { from, to },
    }),
}

export default api
