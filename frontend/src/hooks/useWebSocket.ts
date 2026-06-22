import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const useWebSocket = (onMessageCallback?: (data: any) => void) => {
  const { token, logout } = useAuth();
  const [connected, setConnected] = useState<boolean>(false);
  const [reconnecting, setReconnecting] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const delayRef = useRef<number>(1000);
  const timeoutRef = useRef<any>(null);
  
  const connect = () => {
    if (!token) return;
    
    // Limpiar cualquier conexión previa
    if (wsRef.current) {
      wsRef.current.onclose = null; // Evitar callbacks
      wsRef.current.close();
    }
    
    const wsUrl = `ws://localhost:8000/api/v1/auth/ws/status?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('[useWebSocket] Conexión del taller abierta exitosamente.');
      setConnected(true);
      setReconnecting(false);
      delayRef.current = 1000; // Resetear delay
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        if (onMessageCallback) {
          onMessageCallback(data);
        }
      } catch (err) {
        console.error('[useWebSocket] Error al deserializar payload recibido:', err);
      }
    };
    
    ws.onclose = (event) => {
      setConnected(false);
      
      // Código de cierre 1008: Violación de política (cuenta inactiva o expulsada)
      if (event.code === 1008) {
        console.warn('[useWebSocket] Sesión híbrida revocada por administración.');
        logout();
        return;
      }
      
      // Activar el estado de reconexión (Alarma amarilla en UI)
      setReconnecting(true);
      console.log(`[useWebSocket] Canal cerrado. Reconectando en ${delayRef.current}ms...`);
      
      timeoutRef.current = setTimeout(() => {
        // Respaldo exponencial: duplicar tiempo de espera hasta tope de 30 segundos
        delayRef.current = Math.min(delayRef.current * 2, 30000);
        connect();
      }, delayRef.current);
    };
    
    ws.onerror = (err) => {
      console.error('[useWebSocket] Falla en conexión de red (LAN):', err);
      ws.close();
    };
  };
  
  const sendMessage = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[useWebSocket] No se pudo enviar mensaje: canal desconectado.');
    }
  };
  
  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [token]);
  
  return { connected, reconnecting, lastMessage, sendMessage };
};
export default useWebSocket;
