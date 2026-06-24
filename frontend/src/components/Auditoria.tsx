import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { AuditoriaLog } from '../types';
import { Search, User, Calendar } from 'lucide-react';

export const Auditoria: React.FC = () => {
  const [logs, setLogs] = useState<AuditoriaLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [tabla, setTabla] = useState('');
  const [accion, setAccion] = useState('');
  const [filtering, setFiltering] = useState(false);

  // Registro de IDs expandidos
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const fetchLogs = async (tableFilter = '', actionFilter = '') => {
    try {
      const params: Record<string, string> = {};
      if (tableFilter) params.tabla = tableFilter;
      if (actionFilter) params.accion = actionFilter;
      
      const data = await api.get<AuditoriaLog[]>('/api/v1/system/audit/logs', params);
      setLogs(data);
    } catch (e) {
      console.error('Error loading audit trail', e);
    } finally {
      setLoading(false);
      setFiltering(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFiltering(true);
    fetchLogs(tabla, accion);
  };

  const handleClearFilters = () => {
    setTabla('');
    setAccion('');
    setFiltering(true);
    fetchLogs('', '');
  };

  const toggleExpandLog = (id: number) => {
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  // Helper para renderizar los valores de los diffs
  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Helper para traducir nombres de tablas a algo más legible
  const formatTableName = (tbl: string): string => {
    const mappings: Record<string, string> = {
      'areas_hospital': 'Áreas Hospitalarias',
      'empleados': 'Nómina Empleados',
      'usuarios': 'Usuarios del Portal',
      'dispositivos': 'Inventario Activos (Equipos)',
      'pre_ordenes': 'Búfer de Pre-Órdenes',
      'ordenes': 'Órdenes de Servicio',
      'inventario_departamento': 'Inventario Almacén',
      'prestamos_herramientas': 'Préstamos Herramientas',
      'traslados': 'Traslados Patrimoniales',
      'configuraciones_sistema': 'Configuración Global'
    };
    return mappings[tbl] || tbl;
  };

  if (loading && !filtering) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Bitácora de Auditoría Maestra</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Registro inmutable de seguridad cibernética. Monitoree de forma forense las mutaciones y diferencias (Diffs) de registros en base de datos.
        </p>
      </div>

      {/* Formulario de Filtros */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '14px' }}>Filtros Forenses</h3>
        <form onSubmit={handleFilterSubmit} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '180px' }}>
            <label className="form-label">Tabla Afectada</label>
            <select className="form-select" value={tabla} onChange={(e) => setTabla(e.target.value)}>
              <option value="">-- Todas las Tablas --</option>
              <option value="areas_hospital">Áreas Hospitalarias</option>
              <option value="empleados">Nómina Empleados</option>
              <option value="usuarios">Usuarios</option>
              <option value="dispositivos">Dispositivos (Activos)</option>
              <option value="pre_ordenes">Búfer Pre-Órdenes</option>
              <option value="ordenes">Órdenes Activas</option>
              <option value="inventario_departamento">Inventario Almacén</option>
              <option value="prestamos_herramientas">Préstamos Herramientas</option>
              <option value="traslados">Traslados Patrimoniales</option>
              <option value="configuraciones_sistema">Configuración Global</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
            <label className="form-label">Acción</label>
            <select className="form-select" value={accion} onChange={(e) => setAccion(e.target.value)}>
              <option value="">-- Todas --</option>
              <option value="INSERT">INSERT (Crear)</option>
              <option value="UPDATE">UPDATE (Modificar)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-primary" disabled={filtering} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {filtering ? 'Filtrando...' : <><Search size={16} /> Filtrar</>}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleClearFilters}>
              Restablecer
            </button>
          </div>
        </form>
      </div>

      {/* Historial de Logs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {logs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No se encontraron logs de auditoría registrados.
          </div>
        ) : (
          logs.map(log => {
            const isExpanded = expandedLogId === log.id;
            const isInsert = log.accion_ejecutada === 'INSERT';
            const snapshot = log.snapshot_cambio;

            return (
              <div 
                key={log.id} 
                className={`card ${isExpanded ? 'card-primary-glow' : ''}`}
                style={{ 
                  padding: '16px 20px', 
                  cursor: 'pointer',
                  borderLeft: `4px solid ${isInsert ? 'var(--success)' : 'var(--primary)'}` 
                }}
                onClick={() => toggleExpandLog(log.id)}
              >
                {/* Cabecera del Log (Resumen) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span 
                      className="badge" 
                      style={{ 
                        background: isInsert ? 'var(--success-glow)' : 'var(--primary-glow)',
                        color: isInsert ? 'var(--success)' : 'var(--primary)'
                      }}
                    >
                      {log.accion_ejecutada}
                    </span>
                    <span style={{ fontWeight: '700', fontSize: '14px' }}>
                      {formatTableName(log.tabla_afectada)} 
                      <span style={{ fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                        (Ref ID: {log.registro_id})
                      </span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={14} /> {log.rol_ejecutor} 
                      <span style={{ color: 'var(--text-muted)' }}> (User ID: {log.usuario_id || 'Sistema'})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} /> {new Date(log.timestamp).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '16px' }}>
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </div>
                </div>

                {/* Detalles (Diff Viewer) */}
                {isExpanded && (
                  <div 
                    style={{ 
                      marginTop: '20px', 
                      paddingTop: '16px', 
                      borderTop: '1px solid var(--border-color)',
                      cursor: 'default'
                    }}
                    onClick={(e) => e.stopPropagation()} // Evitar colapsar al hacer clic adentro
                  >
                    <h4 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                      Visor de Cambios y Estructura de Datos (Diff JSONB)
                    </h4>

                    {isInsert ? (
                      // Render de inserción completa
                      <div className="table-container" style={{ background: 'rgba(255,255,255,0.01)' }}>
                        <table className="table" style={{ fontSize: '13px' }}>
                          <thead>
                            <tr>
                              <th>Campo</th>
                              <th>Valor Inyectado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshot.new ? (
                              Object.entries(snapshot.new).map(([field, val]) => (
                                <tr key={field}>
                                  <td style={{ fontWeight: '600', color: 'var(--text-secondary)', width: '30%' }}>{field}</td>
                                  <td style={{ color: '#10B981', fontFamily: 'monospace', fontWeight: '500' }}>
                                    {formatValue(val)}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={2} style={{ color: 'var(--text-muted)' }}>No hay datos detallados en el snapshot.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      // Render de diferencias de campos (UPDATE)
                      <div className="table-container" style={{ background: 'rgba(255,255,255,0.01)' }}>
                        <table className="table" style={{ fontSize: '13px' }}>
                          <thead>
                            <tr>
                              <th>Campo Modificado</th>
                              <th>Valor Anterior (OLD)</th>
                              <th>Valor Nuevo (NEW)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(snapshot).length === 0 ? (
                              <tr>
                                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                  No hubo cambios de valor reales en los campos de la tabla.
                                </td>
                              </tr>
                            ) : (
                              Object.entries(snapshot).map(([field, val]) => (
                                <tr key={field}>
                                  <td style={{ fontWeight: '600', color: 'var(--text-secondary)', width: '25%' }}>{field}</td>
                                  <td style={{ 
                                    color: 'hsl(346, 84%, 60%)', 
                                    textDecoration: 'line-through',
                                    background: 'rgba(239, 68, 68, 0.05)',
                                    fontFamily: 'monospace',
                                    padding: '10px 16px'
                                  }}>
                                    {formatValue(val?.old)}
                                  </td>
                                  <td style={{ 
                                    color: '#10B981', 
                                    fontWeight: '700',
                                    background: 'rgba(22, 163, 74, 0.05)',
                                    fontFamily: 'monospace',
                                    padding: '10px 16px'
                                  }}>
                                    {formatValue(val?.new)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
export default Auditoria;
