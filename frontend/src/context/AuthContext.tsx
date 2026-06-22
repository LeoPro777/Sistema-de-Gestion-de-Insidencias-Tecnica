import React, { createContext, useContext, useState, useEffect } from 'react';
import { Usuario, Rol, EstadoUsuario } from '../types';
import { api, ApiError } from '../services/api';

interface AuthContextType {
  user: Usuario | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  loginSSO: (email: string) => Promise<void>;
  loginBypass: (email: string) => Promise<void>;
  registerAspirante: (cedula: string, nombre: string, apellido: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<Usuario | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Inicializar cargando desde LocalStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  const handleLoginResponse = (res: any) => {
    if (res.access_token) {
      localStorage.setItem('token', res.access_token);
      localStorage.setItem('user', JSON.stringify(res.usuario));
      setToken(res.access_token);
      setUser(res.usuario);
      setError(null);
    }
  };

  const loginSSO = async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<any>('/api/v1/auth/login-sso', { credential: email });
      handleLoginResponse(res);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.data?.detail || 'Error en inicio de sesión por SSO');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginBypass = async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<any>('/api/v1/auth/login-bypass', { email });
      handleLoginResponse(res);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.data?.detail || 'Error en inicio de sesión por bypass');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const registerAspirante = async (cedula: string, nombre: string, apellido: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<Usuario>('/api/v1/auth/register-aspirante', {
        cedula,
        nombre,
        apellido
      });
      // Actualizar el estado de usuario local
      localStorage.setItem('user', JSON.stringify(res));
      setUser(res);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.data?.detail || 'Error al completar el formulario de aspirante');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const updatedUser = await api.get<Usuario>('/api/v1/auth/me');
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (err) {
      console.error('Error al actualizar perfil de usuario', err);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setError(null);
    window.location.href = '/login';
  };

  // Monitoreo WebSocket en tiempo real si el usuario tiene estado PENDIENTE
  useEffect(() => {
    if (!token || !user || user.estado !== 'PENDIENTE') return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let delay = 1000;

    const connectWS = () => {
      // Conectar al endpoint ws/status pasando el token
      const wsUrl = `ws://localhost:8000/api/v1/auth/ws/status?token=${token}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[AuthContext WS] Conectado para monitoreo de aprobación.');
        delay = 1000; // Reset
      };

      ws.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          
          if (payload.event === 'account_approved') {
            console.log('[AuthContext WS] ¡Cuenta aprobada por administrador!');
            // Actualizar datos del usuario para quitar el bloqueo de interfaz
            await refreshUser();
          } else if (payload.event === 'account_rejected' || payload.event === 'session_terminated') {
            console.log('[AuthContext WS] Cuenta rechazada o sesión finalizada.');
            logout();
          }
        } catch (e) {
          console.error('[AuthContext WS] Error procesando mensaje de WebSocket', e);
        }
      };

      ws.onclose = (e) => {
        if (e.code === 1008) {
          console.log('[AuthContext WS] Conexión denegada por políticas de seguridad.');
          logout();
          return;
        }
        console.log('[AuthContext WS] Desconectado. Reintentando en...', delay);
        reconnectTimeout = setTimeout(() => {
          delay = Math.min(delay * 2, 30000); // Backoff
          connectWS();
        }, delay);
      };

      ws.onerror = (err) => {
        console.error('[AuthContext WS] Error en canal WebSocket', err);
        ws?.close();
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [token, user?.estado]);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      error,
      loginSSO,
      loginBypass,
      registerAspirante,
      logout,
      refreshUser,
      setUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe utilizarse dentro de un AuthProvider');
  }
  return context;
};
