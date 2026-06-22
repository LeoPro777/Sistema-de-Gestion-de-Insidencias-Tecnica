import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Dispositivo, AreaHospital, Traslado, AuditoriaLog } from '../types';
import { useNotificationModal } from '../context/NotificationModalContext';
import { SearchSelectModal } from './SearchSelectModal';

export const Traslados: React.FC = () => {
  const { showAlert, showConfirm } = useNotificationModal();
  const [devices, setDevices] = useState<Dispositivo[]>([]);
  const [areas, setAreas] = useState<AreaHospital[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditoriaLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);

  // Perfil seleccionado
  const [selectedDevice, setSelectedDevice] = useState<Dispositivo | null>(null);
  const [pingStatus, setPingStatus] = useState<any | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [timeline, setTimeline] = useState<Traslado[]>([]);

  // Formularios Administrativos
  const [areaDestinoId, setAreaDestinoId] = useState<number>(0);
  const [motivoTraslado, setMotivoTraslado] = useState('');
  const [motivoRetiro, setMotivoRetiro] = useState('');
  const [errorAdmin, setErrorAdmin] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const devs = await api.get<Dispositivo[]>('/api/v1/devices');
      const ars = await api.get<AreaHospital[]>('/api/v1/devices/areas');
      
      // Intentar cargar logs de auditoría si es Admin
      try {
        const logs = await api.get<AuditoriaLog[]>('/api/v1/system/audit/logs');
        setAuditLogs(logs);
      } catch {
        // Ignorar si el rol del usuario no tiene permisos
      }
      
      setDevices(devs);
      setAreas(ars);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenProfile = async (dev: Dispositivo) => {
    setSelectedDevice(dev);
    setPingStatus(null);
    setAreaDestinoId(0);
    setMotivoTraslado('');
    setMotivoRetiro('');
    setErrorAdmin(null);

    // Cargar historial de traslados (Timeline)
    try {
      const history = await api.get<Traslado[]>(`/api/v1/devices/${dev.id}/traslados`);
      setTimeline(history);
    } catch {
      setTimeline([]);
    }
  };

  const handlePingCheck = async () => {
    if (!selectedDevice) return;
    setPingLoading(true);
    setPingStatus(null);
    try {
      const res = await api.get<any>(`/api/v1/devices/${selectedDevice.id}/ping`);
      setPingStatus(res);
    } catch {
      setPingStatus({ status: 'offline', message: 'No se pudo alcanzar el equipo en la red LAN.' });
    } finally {
      setPingLoading(false);
    }
  };

  const handleRelocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    if (!areaDestinoId) {
      setErrorAdmin('Seleccione un área de destino.');
      return;
    }
    if (!motivoTraslado) {
      setErrorAdmin('Indique el motivo del traslado.');
      return;
    }

    try {
      await api.post(`/api/v1/devices/${selectedDevice.id}/relocate`, {
        area_destino_id: areaDestinoId,
        motivo_traslado: motivoTraslado
      });
      await showAlert('Reubicado', 'Relocalización guardada. Acta patrimonial encolada en Outbox.');
      setSelectedDevice(null);
      fetchData();
    } catch (err: any) {
      setErrorAdmin(err.message || 'Error al procesar traslado.');
    }
  };

  const handleRetireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    if (!motivoRetiro) {
      setErrorAdmin('Debe justificar la desincorporación definitiva del activo.');
      return;
    }
    const confirmed = await showConfirm(
      'Confirmar Baja',
      '¿Está seguro de dar de BAJA este dispositivo? Esta acción es irreversible patrimonialmente.'
    );
    if (!confirmed) return;

    try {
      // Retirar
      await api.post(`/api/v1/devices/${selectedDevice.id}/retire`, null, {
        motivo: motivoRetiro
      });
      await showAlert('Baja Procesada', 'Activo desincorporado del inventario de forma lógica. Acta encolada.');
      setSelectedDevice(null);
      fetchData();
    } catch (err: any) {
      setErrorAdmin(err.message || 'Error al retirar el activo.');
    }
  };

  // Renderizador de Diffs JSON para logs de auditoría
  const renderJsonDiff = (diff: Record<string, any>) => {
    // Si es un insert, muestra el snapshot nuevo completo en verde
    if (diff.new && !diff.old) {
      return (
        <pre style={{ fontSize: '11px', color: '#10B981', overflowX: 'auto', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px' }}>
          {JSON.stringify(diff.new, null, 2)}
        </pre>
      );
    }

    // Si es una modificación, renderiza los campos cambiados comparando old y new
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px' }}>
        {Object.entries(diff).map(([key, val]: [string, any]) => {
          if (val && typeof val === 'object' && 'old' in val) {
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '4px' }}>
                <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{key}:</span>
                <span style={{ color: '#EF4444', textDecoration: 'line-through' }}>- {JSON.stringify(val.old)}</span>
                <span style={{ color: '#10B981' }}>+ {JSON.stringify(val.new)}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Control Patrimonial e Intervenciones</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Ficha técnica de dispositivos, historial patrimonial (traslados/bajas) y visores de auditoría inmutable.
        </p>
      </div>

      <div className="grid-two-cols" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '30px', alignItems: 'start' }}>
        
        {/* Activos listado */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Inventario de Dispositivos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
            {devices.map(d => (
              <div
                key={d.id}
                className="card"
                style={{
                  padding: '16px',
                  cursor: 'pointer',
                  background: selectedDevice?.id === d.id ? 'var(--bg-card-hover)' : 'rgba(255,255,255,0.02)',
                  borderColor: selectedDevice?.id === d.id ? 'var(--primary)' : 'var(--border-color)',
                  opacity: d.estado_patrimonial === 'Desincorporado' ? 0.5 : 1
                }}
                onClick={() => handleOpenProfile(d)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>{d.codigo_activo}</span>
                  <span className={`badge ${d.estado_patrimonial === 'Activo' ? 'badge-media' : 'badge-critica'}`}
                        style={d.estado_patrimonial === 'Activo' ? { background: 'var(--success-glow)', color: 'var(--success)' } : {}}>
                    {d.estado_patrimonial}
                  </span>
                </div>
                <h4 style={{ fontSize: '14px', fontWeight: '600' }}>{d.marca}</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ubicación: {d.area?.nombre}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Expediente Técnico / Formulario */}
        {selectedDevice ? (
          <div className="card card-primary-glow" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="badge badge-media">{selectedDevice.codigo_activo}</span>
                <h3 style={{ fontSize: '18px', fontWeight: '800', marginTop: '6px' }}>{selectedDevice.marca}</h3>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedDevice(null)}>Cerrar</button>
            </div>

            {errorAdmin && (
              <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                {errorAdmin}
              </div>
            )}

            {/* PESTAÑA 1: Ficha técnica & Ping */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ficha de Características</h4>
              
              <div className="grid-two-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px', marginBottom: '20px' }}>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Serial:</strong> {selectedDevice.serial}</div>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Dirección MAC:</strong> {selectedDevice.mac_address || 'Sin Configurar'}</div>
                <div><strong style={{ color: 'var(--text-secondary)' }}>IP LAN:</strong> {selectedDevice.ip_fija || 'DCHP Dinámico'}</div>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Estado Patrimonial:</strong> {selectedDevice.estado_patrimonial}</div>
              </div>

              {/* Botón de Ping */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>Ping bajo demanda</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Valida conectividad LAN en tiempo real.</div>
                </div>
                
                <button 
                  className="btn btn-secondary" 
                  onClick={handlePingCheck} 
                  disabled={pingLoading || !selectedDevice.ip_fija}
                >
                  {pingLoading ? 'Comprobando...' : '🔌 Test Red Actual'}
                </button>
              </div>

              {pingStatus && (
                <div style={{ 
                  marginTop: '12px', 
                  padding: '12px', 
                  borderRadius: 'var(--radius-sm)', 
                  background: pingStatus.status === 'online' ? 'var(--success-glow)' : 'var(--danger-glow)',
                  border: `1px solid ${pingStatus.status === 'online' ? 'var(--success)' : 'var(--danger)'}`,
                  fontSize: '13px'
                }}>
                  <strong>Resultado:</strong> {pingStatus.message}
                </div>
              )}
            </div>

            {/* PESTAÑA 2: Relocalización / Traslado (Admin Only) */}
            {selectedDevice.estado_patrimonial !== 'Desincorporado' && (
              <div className="grid-two-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                
                {/* Formulario Traslado */}
                <form onSubmit={handleRelocateSubmit} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(255,255,255,0.01)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)' }}>🔄 Reubicar Activo</h4>
                  
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Área Destino</label>
                    <button 
                      type="button"
                      className="form-select" 
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onClick={() => setIsAreaModalOpen(true)}
                    >
                      {areaDestinoId 
                        ? (() => {
                            const a = areas.find(x => x.id === areaDestinoId);
                            return a ? a.nombre : '-- Seleccione --';
                          })()
                        : '-- Seleccione --'}
                      <span>🔍</span>
                    </button>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Motivo de Reubicación</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="ej. Requerimiento por ampliación de shock room"
                      value={motivoTraslado}
                      onChange={(e) => setMotivoTraslado(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    Guardar Traslado
                  </button>
                </form>

                {/* Formulario Desincorporación */}
                <form onSubmit={handleRetireSubmit} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(255,255,255,0.01)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--danger)' }}>⚠️ Desincorporación (Baja)</h4>
                  
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Justificación de la Baja</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Indique fallas de fatiga severa, daño físico total o descarte..."
                      value={motivoRetiro}
                      onChange={(e) => setMotivoRetiro(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn btn-danger" style={{ width: '100%', marginTop: 'auto' }}>
                    Confirmar Baja Patrimonial
                  </button>
                </form>

              </div>
            )}

            {/* PESTAÑA 3: Línea de tiempo de intervenciones patrimoniales */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '700' }}>Historial Patrimonial de Movimientos</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {timeline.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin movimientos patrimoniales registrados en esta máquina.</div>
                ) : (
                  timeline.map(t => (
                    <div 
                      key={t.id} 
                      style={{ 
                        padding: '12px', 
                        borderRadius: 'var(--radius-sm)', 
                        background: 'rgba(255,255,255,0.02)', 
                        borderLeft: `3px solid ${t.tipo_movimiento === 'Baja Patrimonial' ? 'var(--danger)' : 'var(--primary)'}`,
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                        <span>{t.tipo_movimiento.toUpperCase()}</span>
                        <span>{new Date(t.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {t.tipo_movimiento === 'Traslado' ? `De ${t.area_origen?.nombre} a ${t.area_destino?.nombre}` : `Retirado desde ${t.area_origen?.nombre}`}
                      </div>
                      <div style={{ fontStyle: 'italic', marginTop: '2px', color: 'var(--text-muted)' }}>
                        Motivo: "{t.motivo_traslado}"
                      </div>
                      <div style={{ fontSize: '10px', marginTop: '4px', color: 'var(--text-muted)' }}>
                        Ejecutado por: {t.ejecutor?.nombre} {t.ejecutor?.apellido}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px', color: 'var(--text-muted)', borderStyle: 'dashed' }}>
            Seleccione un dispositivo informático para desplegar su ficha de control patrimonial.
          </div>
        )}
      </div>

      {/* SECCIÓN DE BITÁCORA DE SEGURIDAD (ADMIN GENERAL) */}
      {auditLogs.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Visor de Seguridad de Auditoría Inmutable (Diff Logs)</h3>
          
          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Operador</th>
                  <th>Rol</th>
                  <th>Acción</th>
                  <th>Tabla</th>
                  <th>Registro</th>
                  <th>Diferencias Mutadas (JSONB Diff)</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: '500' }}>
                      {log.usuario_id ? `ID: ${log.usuario_id}` : 'Sistema / Trigger'}
                    </td>
                    <td>{log.rol_ejecutor}</td>
                    <td>
                      <span className={`badge ${log.accion_ejecutada === 'INSERT' ? 'badge-media' : 'badge-alta'}`}
                            style={log.accion_ejecutada === 'INSERT' ? { background: 'var(--success-glow)', color: 'var(--success)' } : {}}>
                        {log.accion_ejecutada}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.tabla_afectada}</td>
                    <td>{log.registro_id}</td>
                    <td style={{ minWidth: '300px' }}>
                      {renderJsonDiff(log.snapshot_cambio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <SearchSelectModal
        isOpen={isAreaModalOpen}
        onClose={() => setIsAreaModalOpen(false)}
        title="Seleccionar Área del Hospital"
        placeholder="Buscar área por nombre o descripción..."
        items={areas.filter(a => selectedDevice ? a.id !== selectedDevice.area_id : true)}
        searchFields={(a) => [a.nombre, a.descripcion || '']}
        renderItem={(a) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{a.nombre}</strong>
            {a.descripcion && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{a.descripcion}</div>}
          </div>
        )}
        onSelect={(a) => setAreaDestinoId(a.id)}
      />
    </div>
  );
};
export default Traslados;
