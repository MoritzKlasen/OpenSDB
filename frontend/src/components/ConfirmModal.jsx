import React from 'react'
import { Modal, Button } from './UI'

const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
  isDanger = false,
  onConfirm,
  onCancel
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-slate-300">{message}</p>
    </Modal>
  )
}

export default ConfirmModal
