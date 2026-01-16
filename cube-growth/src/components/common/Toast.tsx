/**
 * Toast - A notification component that displays temporary messages.
 *
 * Shows notifications that automatically dismiss after a configurable duration.
 * Supports different notification types with appropriate styling.
 */

import React, { useEffect } from 'react';
import { useCube } from '../../context/CubeContext';
import type { NotificationType } from '../../context/cubeReducer';

const TOAST_DURATION = 3000; // 3 seconds

/**
 * Style configuration for different notification types.
 */
const typeStyles: Record<NotificationType, React.CSSProperties> = {
  info: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  success: {
    backgroundColor: '#16a34a',
    borderColor: '#15803d',
  },
  warning: {
    backgroundColor: '#d97706',
    borderColor: '#b45309',
  },
  error: {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    maxWidth: '400px',
    width: '90%',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 500,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    animation: 'slideUp 0.3s ease-out',
  },
  message: {
    flex: 1,
    marginRight: '12px',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 4px',
    opacity: 0.8,
    transition: 'opacity 0.2s',
  },
};

/**
 * Toast component that displays the current notification from state.
 * Auto-dismisses after TOAST_DURATION milliseconds.
 */
export function Toast() {
  const { state, dispatch } = useCube();
  const { notification } = state;

  useEffect(() => {
    if (!notification) return;

    const timer = setTimeout(() => {
      dispatch({ type: 'CLEAR_NOTIFICATION', payload: notification.id });
    }, TOAST_DURATION);

    return () => clearTimeout(timer);
  }, [notification, dispatch]);

  if (!notification) return null;

  const toastStyle = {
    ...styles.toast,
    ...typeStyles[notification.type],
  };

  const handleClose = () => {
    dispatch({ type: 'CLEAR_NOTIFICATION', payload: notification.id });
  };

  return (
    <div style={styles.container}>
      <div style={toastStyle} role="alert" aria-live="polite">
        <span style={styles.message}>{notification.message}</span>
        <button
          style={styles.closeButton}
          onClick={handleClose}
          aria-label="Dismiss notification"
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; }}
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export default Toast;
