export type Rol = 'Admin' | 'Soporte Técnico' | 'Técnico Hardware' | 'Técnico Software' | 'Aspirante';
export type EstadoUsuario = 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO';
export type EstadoOrden = 'PRE_ORDEN' | 'ASIGNADA' | 'EN_PROCESO' | 'RESUELTA' | 'RECHAZADA';
export type TipoItem = 'Consumible' | 'Herramienta';
export type EstadoPrestamo = 'Activo' | 'Devuelto' | 'Retrasado' | 'Dañado' | 'Perdido';
export type Urgencia = 'Crítica' | 'Alta' | 'Media' | 'Baja';

export interface Empleado {
  cedula: string;
  telegram_id?: string;
  nombre: string;
  apellido: string;
  estado: string;
  datos_contacto: {
    email: string;
    telefono: string;
  };
}

export interface Usuario {
  id: number;
  email: string;
  cedula?: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  estado: EstadoUsuario;
}

export interface AreaHospital {
  id: number;
  nombre: string;
  descripcion?: string;
  created_at: string;
}

export interface Dispositivo {
  id: number;
  codigo_activo: string;
  serial: string;
  mac_address?: string;
  ip_fija?: string;
  marca: string;
  area_id: number;
  descripcion?: string;
  estado_patrimonial: string;
  created_at: string;
  area?: AreaHospital;
}

export interface PreOrden {
  id: number;
  numero_reporte: string;
  telegram_id: string;
  tipo_requerimiento: string;
  area_id: number;
  urgencia: Urgencia;
  resumen: string;
  audio_path?: string;
  estado: EstadoOrden;
  device_id?: number;
  created_at: string;
  empleado?: Empleado;
  area?: AreaHospital;
  dispositivo?: Dispositivo;
}

export interface OrdenConsumible {
  consumible_id: number;
  cantidad: number;
  nombre?: string;
}

export interface Orden {
  id: number;
  pre_orden_id?: number;
  device_id: number;
  tecnico_id?: number;
  soporte_id: number;
  estado: EstadoOrden;
  diagnostico?: string;
  solucion_parametrica?: string;
  created_at: string;
  closed_at?: string;
  pre_orden?: PreOrden;
  dispositivo: Dispositivo;
  tecnico?: Usuario;
  soporte: Usuario;
  consumibles: OrdenConsumible[];
}

export interface InventarioItem {
  id: number;
  nombre: string;
  tipo: TipoItem;
  stock: number;
  stock_minimo: number;
  created_at: string;
}

export interface PrestamoHerramienta {
  id: number;
  herramienta_id: number;
  autorizador_id: number;
  beneficiario_cedula: string;
  fecha_prestamo: string;
  fecha_devolucion_estimada: string;
  fecha_devolucion_real?: string;
  estado: EstadoPrestamo;
  herramienta: InventarioItem;
  autorizador: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
  };
  beneficiario: {
    cedula: string;
    nombre: string;
    apellido: string;
  };
}

export interface ConfiguracionSistema {
  id: number;
  correo_bienes_institucional: string;
  smtp_server_config: {
    server: string;
    port: number;
    user: string;
    cipher: string;
  };
  tiempo_max_prestamo_herramientas: number;
  dias_retencion_audios: number;
  dias_retencion_auditoria: number;
  updated_at: string;
}

export interface AlertaSistema {
  id: number;
  mensaje: string;
  destinatario_rol: Rol;
  leida: boolean;
  created_at: string;
}

export interface AuditoriaLog {
  id: number;
  usuario_id?: number;
  rol_ejecutor: string;
  accion_ejecutada: string;
  tabla_afectada: string;
  registro_id: number;
  snapshot_cambio: Record<string, any>;
  timestamp: string;
}

export interface Traslado {
  id: number;
  device_id: number;
  area_origen_id: number;
  area_destino_id: number;
  motivo_traslado: string;
  ejecutor_id: number;
  tipo_movimiento: string;
  created_at: string;
  area_origen?: AreaHospital;
  area_destino?: AreaHospital;
  ejecutor?: Usuario;
}
