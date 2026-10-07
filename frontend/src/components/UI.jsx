import React from 'react'

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  ...props
}) => {
  const baseClasses = 'btn font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  )
}

export const Input = ({
  placeholder = '',
  value,
  onChange,
  type = 'text',
  className = '',
  ...props
}) => {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`input ${className}`}
      {...props}
    />
  )
}

export const Card = ({ children, className = '', ...props }) => {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  )
}

export const Badge = ({ children, variant = 'info', className = '' }) => {
  const variantClasses = {
    warning: 'badge-warning',
    success: 'badge-success',
    info: 'badge-info',
  }

  return (
    <span className={`badge ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  )
}

export const Modal = ({ isOpen, onClose, title, children, actions }) => {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          {title && (
            <h2 className="text-xl font-bold mb-4 text-slate-100">{title}</h2>
          )}
          {children}
          {actions && (
            <div className="mt-6 flex gap-2 justify-end">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const Loading = () => (
  <div className="flex items-center justify-center py-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
)

export const Empty = ({ message = 'No data available' }) => (
  <div className="flex items-center justify-center py-8 text-slate-400">
    {message}
  </div>
)

export const Error = ({ message, onRetry }) => (
  <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200">
    <div className="font-semibold">{message}</div>
    {onRetry && (
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
        Retry
      </Button>
    )}
  </div>
)
