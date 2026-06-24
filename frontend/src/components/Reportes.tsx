import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { AreaHospital, Usuario, InventarioItem } from '../types';
import { 
  ClipboardList, 
  RefreshCw, 
  Wrench, 
  AlertTriangle, 
  TrendingUp, 
  Zap, 
  Trash2, 
  Building, 
  Plug, 
  Users,
  Search,
  BarChart2,
  File
} from 'lucide-react';

// Interfaces para Reportes
export interface IncidentReport {
  id: number;
  numero_reporte?: string;
  tipo_requerimiento?: string;
  urgencia?: string;
  estado: string;
  codigo_activo: string;
  dispositivo: string;
  area: string;
  tecnico?: string;
  soporte: string;
  created_at: string;
  closed_at?: string;
  resolucion_horas?: number;
}

export interface TrasladoReport {
  id: number;
  codigo_activo: string;
  serial: string;
  marca: string;
  area_origen: string;
  area_destino: string;
  motivo_traslado: string;
  tipo_movimiento: string;
  administrador: string;
  created_at: string;
}

export interface InventoryMovementReport {
  orden_id?: number;
  prestamo_id?: number;
  item_nombre: string;
  item_tipo: string;
  cantidad: number;
  fecha_movimiento: string;
  ejecutor: string;
  beneficiario?: string;
  tipo_operacion: string;
  estado_prestamo?: string;
  fecha_devolucion_real?: string;
}

export interface PerformanceReport {
  id: number;
  nombre: string;
  apellido: string;
  rol: string;
  asignados_tecnico: number;
  resueltos_tecnico: number;
  mttr_tecnico: number;
  gestionados_soporte: number;
}

export const Reportes: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'incidencias' | 'traslados' | 'inventario' | 'bajo_stock' | 'rendimiento'>('incidencias');
  
  // Catálogos
  const [areas, setAreas] = useState<AreaHospital[]>([]);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventarioItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Filtros Generales y Específicos
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  
  // Filtros Incidencias
  const [urgencia, setUrgencia] = useState('');
  const [estadoIncidencia, setEstadoIncidencia] = useState('');
  const [tipoReq, setTipoReq] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');

  // Filtros Traslados
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [ejecutorNombre, setEjecutorNombre] = useState(''); // Filtro por texto local original

  // Filtros Inventario
  const [itemTipo, setItemTipo] = useState('');
  const [itemId, setItemId] = useState('');
  const [inventorySubTab, setInventorySubTab] = useState<'consumos' | 'prestamos'>('consumos');

  // Datos de Reportes y Métricas
  const [incidencias, setIncidencias] = useState<IncidentReport[]>([]);
  const [incidenciasMetrics, setIncidenciasMetrics] = useState<any>({ total: 0, mttr_promedio: 0, por_estado: {}, por_urgencia: {} });

  const [traslados, setTraslados] = useState<TrasladoReport[]>([]);
  const [trasladosMetrics, setTrasladosMetrics] = useState<any>({ total: 0, bajas: 0, traslados_normales: 0, areas_origen_mas_activas: [] });

  const [inventarioMovimientos, setInventarioMovimientos] = useState<{ consumos: InventoryMovementReport[], prestamos: InventoryMovementReport[] }>({ consumos: [], prestamos: [] });
  const [inventarioMetrics, setInventarioMetrics] = useState<any>({ total_consumibles_consumidos: 0, total_prestamos: 0, prestamos_por_estado: {}, consumibles_mas_usados: [] });

  const [bajoStock, setBajoStock] = useState<any[]>([]);

  const [rendimiento, setRendimiento] = useState<PerformanceReport[]>([]);
  const [rendimientoMetrics, setRendimientoMetrics] = useState<any>({ total_usuarios_soporte: 0, total_ordenes_resueltas: 0, tasa_resolucion_global_porcentaje: 0, mttr_promedio_equipo_horas: 0, top_tecnico_eficiencia: '' });

  const [loadingData, setLoadingData] = useState(false);

  // Inicializar Catálogos
  const fetchCatalogos = async () => {
    try {
      const areasData = await api.get<AreaHospital[]>('/api/v1/devices/areas');
      setAreas(areasData);

      // Cargar items de inventario para filtros
      try {
        const invData = await api.get<InventarioItem[]>('/api/v1/inventory/items');
        setInventoryItems(invData);
      } catch (err) {
        console.warn("No se pudo cargar el catálogo de inventario.", err);
      }

      // Cargar lista de usuarios (con fallback seguro en caso de 403 Forbidden para Soporte)
      let usersList: Usuario[] = [];
      try {
        usersList = await api.get<Usuario[]>('/api/v1/auth/users');
      } catch (err) {
        console.warn("Uso de fallback de personal técnico debido a restricciones de rol.", err);
        usersList = [
          { id: 1, email: 'admin@hospital.local', nombre: 'Admin', apellido: 'Hospital', rol: 'Admin', estado: 'ACEPTADO' },
          { id: 2, email: 'soporte@hospital.local', nombre: 'Soporte', apellido: 'Técnico', rol: 'Soporte Técnico', estado: 'ACEPTADO' },
          { id: 3, email: 'maria.gomez@hospital.local', nombre: 'Maria', apellido: 'Gomez', rol: 'Técnico Hardware', estado: 'ACEPTADO' },
          { id: 4, email: 'juan.rodriguez@hospital.local', nombre: 'Juan', apellido: 'Rodriguez', rol: 'Técnico Software', estado: 'ACEPTADO' }
        ];
      }
      setUsers(usersList);
    } catch (e) {
      console.error('Error cargando catálogos iniciales', e);
    } finally {
      setLoadingInitial(false);
    }
  };

  // Cargar datos del reporte seleccionado
  const fetchReportData = async () => {
    setLoadingData(true);
    try {
      const params: Record<string, string> = {};
      if (fechaInicio) params.fecha_inicio = fechaInicio;
      if (fechaFin) params.fecha_fin = fechaFin;

      switch (activeTab) {
        case 'incidencias':
          if (urgencia) params.urgencia = urgencia;
          if (estadoIncidencia) params.estado = estadoIncidencia;
          if (tipoReq) params.tipo_requerimiento = tipoReq;
          if (tecnicoId) params.tecnico_id = tecnicoId;

          const incData = await api.get<IncidentReport[]>('/api/v1/reports/incidencias', params);
          setIncidencias(incData);

          const incMetrics = await api.get<any>('/api/v1/reports/incidencias/metrics', {
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin
          });
          setIncidenciasMetrics(incMetrics);
          break;

        case 'traslados':
          if (origenId) params.area_origen_id = origenId;
          if (destinoId) params.area_destino_id = destinoId;

          const trasData = await api.get<TrasladoReport[]>('/api/v1/reports/traslados', params);
          setTraslados(trasData);

          const trasMetrics = await api.get<any>('/api/v1/reports/traslados/metrics', {
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin
          });
          setTrasladosMetrics(trasMetrics);
          break;

        case 'inventario':
          if (itemTipo) params.item_tipo = itemTipo;
          if (itemId) params.item_id = itemId;

          const invMov = await api.get<any>('/api/v1/reports/inventario/movimientos', params);
          setInventarioMovimientos({
            consumos: invMov.consumos || [],
            prestamos: invMov.prestamos || []
          });

          const invMetrics = await api.get<any>('/api/v1/reports/inventario/movimientos/metrics', {
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin
          });
          setInventarioMetrics(invMetrics);
          break;

        case 'bajo_stock':
          const stockAlerts = await api.get<any[]>('/api/v1/reports/inventario/bajo-stock');
          setBajoStock(stockAlerts);
          break;

        case 'rendimiento':
          const perfData = await api.get<PerformanceReport[]>('/api/v1/reports/rendimiento', params);
          setRendimiento(perfData);

          const perfMetrics = await api.get<any>('/api/v1/reports/rendimiento/metrics', {
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin
          });
          setRendimientoMetrics(perfMetrics);
          break;
      }
    } catch (e) {
      console.error(`Error cargando datos para reporte: ${activeTab}`, e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [activeTab]);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReportData();
  };

  const handleClearFilters = () => {
    setFechaInicio('');
    setFechaFin('');
    setUrgencia('');
    setEstadoIncidencia('');
    setTipoReq('');
    setTecnicoId('');
    setOrigenId('');
    setDestinoId('');
    setEjecutorNombre('');
    setItemTipo('');
    setItemId('');
    
    // Ejecutar consulta limpia
    setTimeout(() => {
      fetchReportData();
    }, 50);
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    const params = new URLSearchParams();
    if (fechaInicio) params.append('fecha_inicio', fechaInicio);
    if (fechaFin) params.append('fecha_fin', fechaFin);

    let exportPath = '';

    switch (activeTab) {
      case 'incidencias':
        if (urgencia) params.append('urgencia', urgencia);
        if (estadoIncidencia) params.append('estado', estadoIncidencia);
        if (tipoReq) params.append('tipo_requerimiento', tipoReq);
        if (tecnicoId) params.append('tecnico_id', tecnicoId);
        exportPath = `/api/v1/reports/incidencias/export/${format}`;
        break;

      case 'traslados':
        if (origenId) params.append('area_origen_id', origenId);
        if (destinoId) params.append('area_destino_id', destinoId);
        exportPath = `/api/v1/reports/export/${format}`; // Mantiene la ruta original del backend
        break;

      case 'inventario':
        if (itemTipo) params.append('item_tipo', itemTipo);
        if (itemId) params.append('item_id', itemId);
        exportPath = `/api/v1/reports/inventario/export/movimientos/${format}`;
        break;

      case 'bajo_stock':
        exportPath = `/api/v1/reports/inventario/export/bajo-stock/${format}`;
        break;

      case 'rendimiento':
        exportPath = `/api/v1/reports/rendimiento/export/${format}`;
        break;
    }

    const token = localStorage.getItem('token');
    if (token) params.append('token', token);
    
    const url = `http://${window.location.hostname}:8000${exportPath}?${params.toString()}`;
    window.open(url, '_blank');
  };

  // Filtrado local para el Ejecutor del Administrador en la pestaña de Traslados (Original)
  const filteredTraslados = traslados.filter(t => {
    if (!ejecutorNombre) return true;
    const fullName = (t.administrador || '').toLowerCase();
    return fullName.includes(ejecutorNombre.toLowerCase());
  });

  // Lista de Especialistas Técnicos para filtros
  const técnicos = users.filter(u => u.rol.includes('Técnico'));

  if (loadingInitial) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header del Módulo */}
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Motor Analítico y Reportes de Gestión
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Consulte estadísticas globales del hospital, audite flujos de trabajo e imprima actas oficiales y reportes ejecutivos en PDF/Excel.
        </p>
      </div>

      {/* Tabs de Selección de Reporte */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {[
          { id: 'incidencias', label: 'Incidencias y Tickets', icon: <ClipboardList size={16} /> },
          { id: 'traslados', label: 'Traslado de Activos', icon: <RefreshCw size={16} /> },
          { id: 'inventario', label: 'Flujo de Inventario', icon: <Wrench size={16} /> },
          { id: 'bajo_stock', label: 'Alertas Bajo Stock', icon: <AlertTriangle size={16} /> },
          { id: 'rendimiento', label: 'Rendimiento Personal', icon: <TrendingUp size={16} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className="btn btn-secondary"
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? '700' : '500',
              background: activeTab === tab.id ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
              borderColor: activeTab === tab.id ? 'var(--primary)' : 'var(--border-color)',
              color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <span style={{ marginRight: '6px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* RENDERIZADO DEL DASHBOARD DE DATOS CLAVE */}
      <div className="grid-three-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
        
        {/* KPI Dashboard - Pestaña Incidencias */}
        {activeTab === 'incidencias' && (
          <>
            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Total Tickets</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><ClipboardList size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: '#fff' }}>{incidenciasMetrics.total}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Tickets generados en el rango</p>
            </div>
            
            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Tasa de Resolución</span>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: `conic-gradient(var(--success) ${
                    incidenciasMetrics.total > 0 
                      ? ((incidenciasMetrics.por_estado?.RESUELTA || 0) / incidenciasMetrics.total) * 100 
                      : 0
                  }%, rgba(255,255,255,0.05) 0)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700' }}>
                    {incidenciasMetrics.total > 0 ? Math.round(((incidenciasMetrics.por_estado?.RESUELTA || 0) / incidenciasMetrics.total) * 100) : 0}%
                  </div>
                </div>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--success)' }}>
                {incidenciasMetrics.por_estado?.RESUELTA || 0}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Tickets resueltos con éxito</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>MTTR Promedio</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Zap size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--warning)' }}>
                {incidenciasMetrics.mttr_promedio} <span style={{ fontSize: '14px', fontWeight: '500' }}>hrs</span>
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Tiempo medio de reparación</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Tickets Críticos</span>
                <span style={{ fontSize: '12px', background: 'var(--danger-glow)', color: 'var(--danger)', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>Urgencia</span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--danger)' }}>
                {incidenciasMetrics.por_urgencia?.Crítica || 0}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Pendientes en UCI o áreas críticas</p>
            </div>
          </>
        )}

        {/* KPI Dashboard - Pestaña Traslados */}
        {activeTab === 'traslados' && (
          <>
            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Total Movimientos</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><RefreshCw size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: '#fff' }}>{trasladosMetrics.total}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Movimientos en el rango seleccionado</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Bajas Patrimoniales</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Trash2 size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--danger)' }}>{trasladosMetrics.bajas}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Dispositivos desincorporados del hospital</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Traslados de Ubicación</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Building size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--primary)' }}>{trasladosMetrics.traslados_normales}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Reubicaciones físicas exitosas</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Área Origen Más Activa</span>
                <span style={{ fontSize: '12px', color: 'var(--warning)', fontWeight: '700' }}>Top 1</span>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginTop: '20px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {trasladosMetrics.areas_origen_mas_activas?.[0]?.area || 'Ninguna'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {trasladosMetrics.areas_origen_mas_activas?.[0]?.cantidad || 0} movimientos reportados
              </p>
            </div>
          </>
        )}

        {/* KPI Dashboard - Pestaña Inventario */}
        {activeTab === 'inventario' && (
          <>
            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Consumibles Consumidos</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Plug size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: '#fff' }}>{inventarioMetrics.total_consumibles_consumidos}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Unidades egresadas del almacén</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Préstamos Registrados</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Wrench size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--primary)' }}>{inventarioMetrics.total_prestamos}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Servicios de préstamo de herramientas</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Herramientas en Uso</span>
                <span style={{ fontSize: '12px', background: 'var(--warning-glow)', color: 'var(--warning)', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>Activas</span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--warning)' }}>
                {inventarioMetrics.prestamos_por_estado?.Activo || 0}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Pendientes por devolver</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Más Consumido</span>
                <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: '700' }}>Top 1</span>
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginTop: '20px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {inventarioMetrics.consumibles_mas_usados?.[0]?.nombre || 'Ninguno'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {inventarioMetrics.consumibles_mas_usados?.[0]?.cantidad || 0} unidades consumidas
              </p>
            </div>
          </>
        )}

        {/* KPI Dashboard - Pestaña Bajo Stock */}
        {activeTab === 'bajo_stock' && (
          <>
            <div className="card card-primary-glow" style={{ padding: '20px', borderColor: 'var(--danger)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Alertas Críticas</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><AlertTriangle size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--danger)' }}>{bajoStock.length}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Items con stock por debajo del mínimo</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Insumos Críticos</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Plug size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: '#fff' }}>
                {bajoStock.filter(x => x.tipo === 'Consumible').length}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Consumibles en peligro de agotarse</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Herramientas Críticas</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Wrench size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: '#fff' }}>
                {bajoStock.filter(x => x.tipo === 'Herramienta').length}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Herramientas del taller sin disponibilidad</p>
            </div>
          </>
        )}

        {/* KPI Dashboard - Pestaña Rendimiento */}
        {activeTab === 'rendimiento' && (
          <>
            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Personal Evaluado</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Users size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: '#fff' }}>{rendimientoMetrics.total_usuarios_soporte}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Miembros en el equipo de soporte</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Tasa de Resolución</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><TrendingUp size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--success)' }}>
                {rendimientoMetrics.tasa_resolucion_global_porcentaje}%
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Porcentaje global de finalización</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Equipo MTTR</span>
                <span style={{ display: 'flex', alignItems: 'center' }}><Zap size={20} /></span>
              </div>
              <h3 style={{ fontSize: '28px', fontWeight: '800', marginTop: '12px', color: 'var(--warning)' }}>
                {rendimientoMetrics.mttr_promedio_equipo_horas} <span style={{ fontSize: '14px', fontWeight: '500' }}>hrs</span>
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Tiempo medio de resolución grupal</p>
            </div>

            <div className="card card-primary-glow" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Especialista Estrella</span>
                <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: '700' }}>Líder</span>
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginTop: '22px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rendimientoMetrics.top_tecnico_eficiencia}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Mayor eficiencia de resolución</p>
            </div>
          </>
        )}

      </div>

      {/* PANEL DE FILTROS DE BÚSQUEDA */}
      {activeTab !== 'bajo_stock' && (
        <div className="card card-primary-glow">
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Filtros de Búsqueda</h3>
          <form onSubmit={handleApplyFilters} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'end' }}>
            
            {/* Fechas para todos los reportes */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Desde</label>
              <input
                type="date"
                className="form-input"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Hasta</label>
              <input
                type="date"
                className="form-input"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>

            {/* Filtros específicos de Incidencias */}
            {activeTab === 'incidencias' && (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Urgencia</label>
                  <select className="form-select" value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
                    <option value="">-- Todas --</option>
                    <option value="Crítica">Crítica</option>
                    <option value="Alta">Alta</option>
                    <option value="Media">Media</option>
                    <option value="Baja">Baja</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Estado</label>
                  <select className="form-select" value={estadoIncidencia} onChange={(e) => setEstadoIncidencia(e.target.value)}>
                    <option value="">-- Todos --</option>
                    <option value="ASIGNADA">Asignada</option>
                    <option value="EN_PROCESO">En Proceso</option>
                    <option value="RESUELTA">Resuelta</option>
                    <option value="RECHAZADA">Rechazada</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tipo Requerimiento</label>
                  <select className="form-select" value={tipoReq} onChange={(e) => setTipoReq(e.target.value)}>
                    <option value="">-- Todos --</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Redes">Redes</option>
                    <option value="Sistemas Clínicos">Sistemas Clínicos</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Técnico Asignado</label>
                  <select className="form-select" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                    <option value="">-- Todos --</option>
                    {técnicos.map(t => (
                      <option key={t.id} value={t.id}>{t.nombre} {t.apellido}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Filtros específicos de Traslados */}
            {activeTab === 'traslados' && (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Área Origen</label>
                  <select className="form-select" value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
                    <option value="">-- Todas --</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Área Destino</label>
                  <select className="form-select" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                    <option value="">-- Todas --</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Administrador Ejecutor</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Buscar por nombre..."
                    value={ejecutorNombre}
                    onChange={(e) => setEjecutorNombre(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Filtros específicos de Inventario */}
            {activeTab === 'inventario' && (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tipo Item</label>
                  <select className="form-select" value={itemTipo} onChange={(e) => setItemTipo(e.target.value)}>
                    <option value="">-- Todos --</option>
                    <option value="Consumible">Consumible</option>
                    <option value="Herramienta">Herramienta</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Item Específico</label>
                  <select className="form-select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                    <option value="">-- Todos --</option>
                    {inventoryItems
                      .filter(x => !itemTipo || x.tipo === itemTipo)
                      .map(x => (
                        <option key={x.id} value={x.id}>[{x.tipo.slice(0,4)}] {x.nombre}</option>
                      ))
                    }
                  </select>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Search size={16} /> Filtrar
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleClearFilters}>
                Limpiar
              </button>
            </div>

          </form>
        </div>
      )}

      {/* RENDERIZADO DE TABLAS Y ACCIONES DE DESCARGA */}
      <div className="card">
        
        {/* Acciones del Reporte */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600' }}>
              {activeTab === 'incidencias' && `Tickets de Incidencias (${incidencias.length})`}
              {activeTab === 'traslados' && `Movimientos Patrimoniales (${filteredTraslados.length})`}
              {activeTab === 'inventario' && (
                inventorySubTab === 'consumos' 
                  ? `Consumo de Insumos (${inventarioMovimientos.consumos.length})` 
                  : `Préstamos Realizados (${inventarioMovimientos.prestamos.length})`
              )}
              {activeTab === 'bajo_stock' && `Alertas de Stock Crítico (${bajoStock.length})`}
              {activeTab === 'rendimiento' && `Desempeño del Equipo de Soporte (${rendimiento.length})`}
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="btn btn-success" 
              onClick={() => handleExport('excel')}
              style={{ background: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <BarChart2 size={16} /> Exportar Excel
            </button>
            <button 
              className="btn btn-danger" 
              onClick={() => handleExport('pdf')}
              style={{ background: '#EF4444', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <File size={16} /> Exportar PDF
            </button>
          </div>

        </div>

        {/* Sub-pestañas especiales para Inventario */}
        {activeTab === 'inventario' && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
            <button
              onClick={() => setInventorySubTab('consumos')}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                background: inventorySubTab === 'consumos' ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderColor: inventorySubTab === 'consumos' ? 'var(--primary)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <Plug size={14} /> Consumos de Insumos
            </button>
            <button
              onClick={() => setInventorySubTab('prestamos')}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                background: inventorySubTab === 'prestamos' ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderColor: inventorySubTab === 'prestamos' ? 'var(--primary)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <Wrench size={14} /> Préstamos de Herramientas
            </button>
          </div>
        )}

        {/* Tablas en Línea */}
        {loadingData ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <div className="spinner"></div>
          </div>
        ) : (
          <div className="table-container">
            
            {/* TABLA 1: INCIDENCIAS */}
            {activeTab === 'incidencias' && (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Código Activo</th>
                    <th>Dispositivo</th>
                    <th>Área</th>
                    <th>Requerimiento</th>
                    <th>Urgencia</th>
                    <th>Estado</th>
                    <th>Especialista</th>
                    <th>Creado</th>
                    <th>Resol. (Hrs)</th>
                  </tr>
                </thead>
                <tbody className="table-responsive-cards">
                  {incidencias.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No se registraron incidencias.</td>
                    </tr>
                  ) : (
                    incidencias.map((inc) => (
                      <tr key={inc.id}>
                        <td data-label="ID" style={{ fontWeight: '600' }}>#{inc.id}</td>
                        <td data-label="Código Activo" style={{ fontWeight: '700', color: 'var(--primary)' }}>{inc.codigo_activo}</td>
                        <td data-label="Dispositivo" style={{ fontSize: '13px' }}>{inc.dispositivo}</td>
                        <td data-label="Área">{inc.area}</td>
                        <td data-label="Requerimiento">{inc.tipo_requerimiento || 'N/A'}</td>
                        <td data-label="Urgencia">
                          <span className={`badge badge-${(inc.urgencia || 'Media').toLowerCase()}`}>
                            {inc.urgencia || 'Media'}
                          </span>
                        </td>
                        <td data-label="Estado">
                          <span className={`badge ${inc.estado === 'RESUELTA' ? 'badge-media' : (inc.estado === 'RECHAZADA' ? 'badge-critica' : 'badge-alta')}`}>
                            {inc.estado}
                          </span>
                        </td>
                        <td data-label="Especialista" style={{ fontWeight: '500' }}>{inc.tecnico || 'No Asignado'}</td>
                        <td data-label="Creado" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {new Date(inc.created_at).toLocaleString()}
                        </td>
                        <td data-label="Resolución" style={{ textAlign: 'right', fontWeight: '700', color: 'var(--success)' }}>
                          {inc.resolucion_horas !== null ? `${inc.resolucion_horas?.toFixed(1)} h` : '--'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TABLA 2: TRASLADOS */}
            {activeTab === 'traslados' && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Código Activo</th>
                    <th>Dispositivo</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Tipo Movimiento</th>
                    <th>Autorizado Por</th>
                    <th>Fecha</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody className="table-responsive-cards">
                  {filteredTraslados.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron traslados.</td>
                    </tr>
                  ) : (
                    filteredTraslados.map(t => (
                      <tr key={t.id}>
                        <td data-label="Código Activo" style={{ fontWeight: '700', color: 'var(--primary)' }}>
                          {t.codigo_activo}
                        </td>
                        <td data-label="Dispositivo">
                          <div style={{ fontWeight: '500' }}>{t.marca}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>S/N: {t.serial}</div>
                        </td>
                        <td data-label="Origen">{t.area_origen || 'N/A'}</td>
                        <td data-label="Destino">{t.area_destino || 'N/A'}</td>
                        <td data-label="Tipo">
                          <span className={`badge ${t.tipo_movimiento === 'Baja Patrimonial' ? 'badge-critica' : 'badge-media'}`}>
                            {t.tipo_movimiento}
                          </span>
                        </td>
                        <td data-label="Autorizado Por">
                          <div style={{ fontWeight: '500' }}>{t.administrador || 'N/A'}</div>
                        </td>
                        <td data-label="Fecha" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {new Date(t.created_at).toLocaleString()}
                        </td>
                        <td data-label="Motivo" style={{ fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.motivo_traslado}>
                          {t.motivo_traslado}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TABLA 3: INVENTARIO (CONSUMOS) */}
            {activeTab === 'inventario' && inventorySubTab === 'consumos' && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Orden ID</th>
                    <th>Nombre Insumo</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Fecha Consumo</th>
                    <th>Técnico Ejecutor</th>
                  </tr>
                </thead>
                <tbody className="table-responsive-cards">
                  {inventarioMovimientos.consumos.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No se registraron egresos.</td>
                    </tr>
                  ) : (
                    inventarioMovimientos.consumos.map((c, idx) => (
                      <tr key={idx}>
                        <td data-label="Orden ID" style={{ fontWeight: '700' }}>#{c.orden_id}</td>
                        <td data-label="Nombre Insumo" style={{ fontWeight: '600', color: 'var(--primary)' }}>{c.item_nombre}</td>
                        <td data-label="Tipo"><span className="badge badge-baja">{c.item_tipo}</span></td>
                        <td data-label="Cantidad" style={{ fontWeight: '700' }}>{c.cantidad} uds</td>
                        <td data-label="Fecha" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {new Date(c.fecha_movimiento).toLocaleString()}
                        </td>
                        <td data-label="Técnico" style={{ fontWeight: '500' }}>{c.ejecutor}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TABLA 4: INVENTARIO (PRÉSTAMOS) */}
            {activeTab === 'inventario' && inventorySubTab === 'prestamos' && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Préstamo ID</th>
                    <th>Herramienta</th>
                    <th>Fecha Préstamo</th>
                    <th>Beneficiario</th>
                    <th>Autorizador</th>
                    <th>Estado</th>
                    <th>Devolución</th>
                  </tr>
                </thead>
                <tbody className="table-responsive-cards">
                  {inventarioMovimientos.prestamos.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No se registraron préstamos.</td>
                    </tr>
                  ) : (
                    inventarioMovimientos.prestamos.map((p, idx) => (
                      <tr key={idx}>
                        <td data-label="Préstamo ID" style={{ fontWeight: '700' }}>#{p.prestamo_id}</td>
                        <td data-label="Herramienta" style={{ fontWeight: '600', color: 'var(--primary)' }}>{p.item_nombre}</td>
                        <td data-label="Fecha" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {new Date(p.fecha_movimiento).toLocaleString()}
                        </td>
                        <td data-label="Beneficiario" style={{ fontWeight: '500' }}>{p.beneficiario}</td>
                        <td data-label="Autorizador" style={{ fontWeight: '500' }}>{p.ejecutor}</td>
                        <td data-label="Estado">
                          <span className={`badge ${p.estado_prestamo === 'Devuelto' ? 'badge-media' : (p.estado_prestamo === 'Retrasado' ? 'badge-critica' : 'badge-alta')}`}>
                            {p.estado_prestamo}
                          </span>
                        </td>
                        <td data-label="Devolución" style={{ fontSize: '13px' }}>
                          {p.fecha_devolucion_real ? new Date(p.fecha_devolucion_real).toLocaleString() : <span style={{ color: 'var(--danger)', fontWeight: '600' }}>Pendiente</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TABLA 5: BAJO STOCK */}
            {activeTab === 'bajo_stock' && (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre de Insumo/Herramienta</th>
                    <th>Tipo</th>
                    <th>Stock Mínimo</th>
                    <th>Stock Disponible Actual</th>
                    <th>Nivel Crítico</th>
                  </tr>
                </thead>
                <tbody className="table-responsive-cards">
                  {bajoStock.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--success)', fontWeight: '600', padding: '40px' }}>
                        ¡Todo en orden! No hay insumos en alerta de bajo stock actualmente.
                      </td>
                    </tr>
                  ) : (
                    bajoStock.map((item) => (
                      <tr key={item.id}>
                        <td data-label="ID" style={{ fontWeight: '600' }}>#{item.id}</td>
                        <td data-label="Nombre" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{item.nombre}</td>
                        <td data-label="Tipo"><span className="badge badge-baja">{item.tipo}</span></td>
                        <td data-label="Mínimo" style={{ color: 'var(--text-secondary)' }}>{item.stock_minimo} unidades</td>
                        <td data-label="Actual" style={{ color: 'var(--danger)', fontWeight: '800', fontSize: '15px' }}>{item.stock} unidades</td>
                        <td data-label="Crítico" style={{ width: '150px' }}>
                          <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ background: 'var(--danger)', width: `${Math.max(10, (item.stock / item.stock_minimo) * 100)}%`, height: '100%' }}></div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TABLA 6: RENDIMIENTO */}
            {activeTab === 'rendimiento' && (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Especialista</th>
                    <th>Rol</th>
                    <th>Tickets Asignados</th>
                    <th>Tickets Resueltos</th>
                    <th>Tasa de Resolución</th>
                    <th>MTTR Promedio</th>
                    <th>Cargados/Creados</th>
                  </tr>
                </thead>
                <tbody className="table-responsive-cards">
                  {rendimiento.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron registros de rendimiento.</td>
                    </tr>
                  ) : (
                    rendimiento.map((perf) => {
                      const tasa = perf.asignados_tecnico > 0 
                        ? (perf.resueltos_tecnico / perf.asignados_tecnico) * 100 
                        : 0;
                      return (
                        <tr key={perf.id}>
                          <td data-label="ID" style={{ fontWeight: '600' }}>#{perf.id}</td>
                          <td data-label="Especialista" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{perf.nombre} {perf.apellido}</td>
                          <td data-label="Rol"><span className="badge badge-baja">{perf.rol}</span></td>
                          <td data-label="Asignados" style={{ fontWeight: '600' }}>{perf.asignados_tecnico} tickets</td>
                          <td data-label="Resueltos" style={{ fontWeight: '600', color: 'var(--success)' }}>{perf.resueltos_tecnico} resueltos</td>
                          <td data-label="Tasa">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                              <span style={{ fontWeight: '700' }}>{tasa.toFixed(1)}%</span>
                              <div style={{ width: '60px', background: 'rgba(255,255,255,0.03)', height: '6px', borderRadius: '4px', overflow: 'hidden', display: 'none' }} className="header-date">
                                <div style={{ background: tasa > 80 ? 'var(--success)' : (tasa > 50 ? 'var(--warning)' : 'var(--danger)'), width: `${tasa}%`, height: '100%' }}></div>
                              </div>
                            </div>
                          </td>
                          <td data-label="MTTR" style={{ fontWeight: '700', color: 'var(--warning)' }}>
                            {perf.mttr_tecnico > 0 ? `${perf.mttr_tecnico.toFixed(1)} hrs` : 'N/A'}
                          </td>
                          <td data-label="Creados" style={{ color: 'var(--text-secondary)' }}>{perf.gestionados_soporte} órdenes</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

          </div>
        )}

      </div>

    </div>
  );
};

export default Reportes;
