import React from 'react'
import { Button } from './UI'

const WarningCard = ({ warning, index, onDelete, formatDate }) => {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <div className="mb-2">
            <p className="text-sm text-slate-400 font-semibold">REASON</p>
            <p className="text-slate-100 font-medium">{warning.reason || 'No reason provided'}</p>
          </div>

          <div className="mb-2">
            <p className="text-sm text-slate-400 font-semibold">ISSUED BY</p>
            <p className="text-slate-100">{warning.issuedBy || 'Unknown'}</p>
          </div>

          <div>
            <p className="text-sm text-slate-400 font-semibold">DATE</p>
            <p className="text-slate-100 text-sm">{formatDate(warning.date)}</p>
          </div>
        </div>

        <Button
          variant="danger"
          size="sm"
          onClick={() => onDelete(index)}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}

export default WarningCard
