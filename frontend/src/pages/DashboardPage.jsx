import React, { useRef, useState } from 'react'
import { userApi } from '../utils/api'
import Layout from '../components/Layout'
import { Button, Error } from '../components/UI'
import UserList from '../components/UserList'

const DashboardPage = () => {
  const fileInputRef = useRef(null)
  const [error, setError] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const handleExportCsv = async () => {
    setIsExporting(true)
    setError(null)
    try {
      const response = await userApi.exportCsv()
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'verified_users.csv')
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('Failed to export CSV')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportCsv = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setError(null)
    try {
      const response = await userApi.importCsv(file)
      setError(null)
      alert(`Successfully imported ${response.data.imported} users`)
      // Optionally refresh the user list
    } catch (err) {
      setError('Failed to import CSV')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImportClick}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Import CSV'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCsv}
            hidden
          />
        </div>

        {error && <Error message={error} />}

        {/* User List */}
        <UserList />
      </div>
    </Layout>
  )
}

export default DashboardPage
