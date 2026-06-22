import React, { createContext, useContext, useState, useRef } from 'react';

interface NotificationModalContextType {
  showAlert: (title: string, message: string) => Promise<void>;
  showConfirm: (title: string, message: string) => Promise<boolean>;
}

const NotificationModalContext = createContext<NotificationModalContextType | undefined>(undefined);

export const useNotificationModal = () => {
  const context = useContext(NotificationModalContext);
  if (!context) {
    throw new Error('useNotificationModal must be used within a NotificationModalProvider');
  }
  return context;
};

export const NotificationModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'alert' | 'confirm'>('alert');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  
  const resolverRef = useRef<((value: any) => void) | null>(null);

  const showAlert = (alertTitle: string, alertMessage: string): Promise<void> => {
    setTitle(alertTitle);
    setMessage(alertMessage);
    setType('alert');
    setIsOpen(true);
    return new Promise<void>((resolve) => {
      resolverRef.current = () => {
        resolve();
      };
    });
  };

  const showConfirm = (confirmTitle: string, confirmMessage: string): Promise<boolean> => {
    setTitle(confirmTitle);
    setMessage(confirmMessage);
    setType('confirm');
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = (value: boolean) => {
        resolve(value);
      };
    });
  };

  const handleClose = (value: boolean) => {
    setIsOpen(false);
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  };

  return (
    <NotificationModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {isOpen && (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <span className="modal-title">{title}</span>
            </div>
            <div className="modal-body" style={{ color: 'var(--text-primary)', fontSize: '15px' }}>
              {message}
            </div>
            <div className="modal-footer">
              {type === 'confirm' ? (
                <>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => handleClose(false)}
                  >
                    Cancelar
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => handleClose(true)}
                  >
                    Confirmar
                  </button>
                </>
              ) : (
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleClose(true)}
                >
                  Aceptar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </NotificationModalContext.Provider>
  );
};
