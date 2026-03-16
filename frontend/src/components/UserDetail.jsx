import React, { useState, useEffect } from 'react'
import { userApi } from '../utils/api'
import { Button, Card, Input, Modal, Loading, Error } from './UI'
import WarningCard from './WarningCard'
import ConfirmModal from './ConfirmModal'

const UserDetail = ({ user, onUserUpdate }) => {
  const [localComment, setLocalComment] = useState(user.comment || '')
  const [isCommentEditing, setIsCommentEditing] = useState(false)
  const [isCommentSaving, setIsCommentSaving] = useState(false)
  const [warningToDelete, setWarningToDelete] = useState(null)
  const [isDeletingWarning, setIsDeletingWarning] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isCommentEditing) {
      setLocalComment(user.comment || '')
    }
  }, [user.comment, isCommentEditing])

  const handleSaveComment = async () => {
    setIsCommentSaving(true)
    setError(null)
    try {
      await userApi.updateComment(user.discordId, localComment)
      onUserUpdate({ ...user, comment: localComment })
      setIsCommentEditing(false)
    } catch (err) {
      setError('Failed to save comment')
    } finally {
      setIsCommentSaving(false)
    }
  }

  const handleDeleteWarning = async () => {
    if (!warningToDelete) return

    setIsDeletingWarning(true)
    setError(null)
    try {
      await userApi.removeWarning(user.discordId, warningToDelete.index)
      const updatedUser = {
        ...user,
        warnings: user.warnings.filter((_, idx) => idx !== warningToDelete.index)
      }
      onUserUpdate(updatedUser)
      setWarningToDelete(null)
    } catch (err) {
      setError('Failed to delete warning')
    } finally {
      setIsDeletingWarning(false)
    }
  }

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date))
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="card-header">
          <h2 className="text-lg font-bold text-slate-100">User Information</h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Username</label>
            <p className="text-slate-100">{user.discordTag}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Discord ID</label>
            <p className="text-slate-100 font-mono">{user.discordId}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Name</label>
            <p className="text-slate-100">
              {user.firstName || '-'} {user.lastName || '-'}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Verified Date</label>
            <p className="text-slate-100">
              {user.verifiedAt ? formatDate(user.verifiedAt) : 'Not verified'}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="card-header">
          <h2 className="text-lg font-bold text-slate-100">Comment</h2>
        </div>

        {error && <Error message={error} />}

        {isCommentEditing ? (
          <div className="space-y-3">
            <textarea
              value={localComment}
              onChange={(e) => setLocalComment(e.target.value)}
              placeholder="Add a comment..."
              className="input w-full min-h-24 resize-none"
              disabled={isCommentSaving}
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveComment}
                disabled={isCommentSaving}
              >
                {isCommentSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLocalComment(user.comment || '')
                  setIsCommentEditing(false)
                }}
                disabled={isCommentSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-slate-300 mb-3 min-h-20">
              {localComment || <span className="text-slate-500">No comment yet</span>}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCommentEditing(true)}
            >
              Edit Comment
            </Button>
          </div>
        )}
      </Card>

      {user.warnings && user.warnings.length > 0 ? (
        <Card>
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-100">
              Warnings ({user.warnings.length})
            </h2>
          </div>

          <div className="space-y-3">
            {user.warnings.map((warning, idx) => (
              <WarningCard
                key={idx}
                warning={warning}
                index={idx}
                onDelete={() => setWarningToDelete({ ...warning, index: idx })}
                formatDate={formatDate}
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="text-center py-8 text-slate-400">
            <p className="text-lg">No warnings</p>
            <p className="text-sm">This user has a clean record</p>
          </div>
        </Card>
      )}

      <ConfirmModal
        isOpen={!!warningToDelete}
        title="Delete Warning"
        message="Are you sure you want to delete this warning? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep"
        isLoading={isDeletingWarning}
        onConfirm={handleDeleteWarning}
        onCancel={() => setWarningToDelete(null)}
        isDanger
      />
    </div>
  )
}

export default UserDetail
