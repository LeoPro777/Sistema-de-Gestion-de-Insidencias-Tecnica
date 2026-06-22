from typing import Dict, Any, Optional
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Mapea conexiones activas a la información de su sesión (usuario_id, email, rol)
        self.connections: Dict[WebSocket, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, user_info: Dict[str, Any]):
        await websocket.accept()
        self.connections[websocket] = user_info

    def disconnect(self, websocket: WebSocket):
        if websocket in self.connections:
            del self.connections[websocket]

    async def broadcast(self, message: Dict[str, Any], role: Optional[str] = None):
        """
        Envía un mensaje en broadcast a todos los usuarios conectados.
        Si se especifica un rol, filtra los destinatarios basándose en su rol de seguridad.
        El rol "Soporte Técnico" incluye también al "Admin".
        """
        for connection, info in self.connections.items():
            conn_rol = info.get("rol")
            
            # Determinar si califica para recibir el broadcast
            should_send = False
            if role is None:
                should_send = True
            elif role == "Soporte Técnico" and conn_rol in ("Admin", "Soporte Técnico"):
                should_send = True
            elif conn_rol == role:
                should_send = True

            if should_send:
                try:
                    await connection.send_json(message)
                except Exception:
                    # Prevenir fallas si la conexión se cortó bruscamente
                    pass

    async def send_personal_message(self, message: Dict[str, Any], user_id: int):
        """
        Envía un mensaje privado a todas las pestañas activas de un usuario específico.
        """
        for connection, info in self.connections.items():
            if info.get("usuario_id") == user_id:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()
