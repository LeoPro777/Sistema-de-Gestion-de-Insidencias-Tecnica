import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { ConfiguracionSistema, AlertaSistema, AreaHospital } from '../types';
import { useNotificationModal } from '../context/NotificationModalContext';
import { Save, Check, BarChart2, File } from 'lucide-react';

export const Configuracion: React.FC = () => {
  const { showAlert } = useNotificationModal();
  const [config, setConfig] = useState<ConfiguracionSistema | null>(null);
  const [alerts, setAlerts] = useState<AlertaSistema[]>([]);
  const [areas, setAreas] = useState<AreaHospital[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulario Config
  const [correoBienes, setCorreoBienes] = useState('');
  const [smtpServer, setSmtpServer] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  
  const [timeMaxTools, setTimeMaxTools] = useState(24);
  const [retentionAudios, setRetentionAudios] = useState(30);
  const [retentionAuditoria, setRetentionAuditoria] = useState(365);
  const [configError, setConfigError] = useState<string | null>(null);

  // Filtros Reportes Export
  const [areaOrigenId, setAreaOrigenId] = useState<number>(0);
  const [areaDestinoId, setAreaDestinoId] = useState<number>(0);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const cfg = await api.get<ConfiguracionSistema>('/api/v1/system/config');
      const alts = await api.get<AlertaSistema[]>('/api/v1/system/alerts');
      const ars = await api.get<AreaHospital[]>('/api/v1/devices/areas');

      setConfig(cfg);
      setAlerts(alts);
      setAreas(ars);

      // Cargar campos formulario
      setCorreoBienes(cfg.correo_bienes_institucional);
      setSmtpServer(cfg.smtp_server_config.server);
      setSmtpPort(cfg.smtp_server_config.port);
      setSmtpUser(cfg.smtp_server_config.user);
      setSmtpPass(cfg.smtp_server_config.cipher); // Cipher u otro
      setTimeMaxTools(cfg.tiempo_max_prestamo_herramientas);
      setRetentionAudios(cfg.dias_retencion_audios);
      setRetentionAuditoria(cfg.dias_retencion_auditoria);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError(null);
    try {
      const updated = await api.put<ConfiguracionSistema>('/api/v1/system/config', {
        correo_bienes_institucional: correoBienes,
        smtp_server_config: {
          server: smtpServer,
          port: smtpPort,
          user: smtpUser,
          cipher: smtpPass
        },
        tiempo_max_prestamo_herramientas: timeMaxTools,
        dias_retencion_audios: retentionAudios,
        dias_retencion_auditoria: retentionAuditoria
      });
      setConfig(updated);
      await showAlert('Configuración Guardada', 'Configuración global del sistema guardada exitosamente.');
    } catch (err: any) {
      const apiErr = err as ApiError;
      setConfigError(apiErr.data?.detail || 'Error al guardar configuración.');
    }
  };

  const handleArchiveAlert = async (alertId: number) => {
    try {
      await api.post(`/api/v1/system/alerts/${alertId}/read`);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.error(err);
    }
  };

  // Rutas de descargas streaming directas con token
  const getDownloadUrl = (format: 'excel' | 'pdf') => {
    const token = localStorage.getItem('token');
    let url = `http://${window.location.hostname}:8000/api/v1/reports/export/${format}?token=${token}`;
    if (areaOrigenId) url += `&area_origen_id=${areaOrigenId}`;
    if (areaDestinoId) url += `&area_destino_id=${areaDestinoId}`;
    if (fechaInicio) url += `&fecha_inicio=${fechaInicio}`;
    if (fechaFin) url += `&fecha_fin=${fechaFin}`;
    return url;
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
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Configuración Global del Sistema</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Configuración de pasarelas SMTP, límites de retención y centro de alertas operativas.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr', gap: '30px', alignItems: 'start' }}>
        
        {/* Formulario de Configuración (Admin Only) */}
        <div className="card card-primary-glow" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Variables Operacionales de Red</h3>
          
          {configError && (
            <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
              {configError}
            </div>
          )}

          <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Correo de Bienes Nacionales</label>
              <input
                type="email"
                className="form-input"
                value={correoBienes}
                onChange={(e) => setCorreoBienes(e.target.value)}
              />
            </div>

            <div style={{ border: '1px solid var(--border-color)', padding: '16px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <span className="form-label" style={{ color: 'var(--primary)' }}>Servidor de Correo SMTP</span>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Servidor SMTP</label>
                  <input type="text" className="form-input" value={smtpServer} onChange={(e) => setSmtpServer(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Puerto</label>
                  <input type="number" className="form-input" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Usuario SMTP</label>
                  <input type="text" className="form-input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Clave/Cifrado</label>
                  <input type="password" className="form-input" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Límite Préstamo (Horas)</label>
                <input type="number" className="form-input" value={timeMaxTools} onChange={(e) => setTimeMaxTools(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Retención Audios (Días)</label>
                <input type="number" className="form-input" value={retentionAudios} onChange={(e) => setRetentionAudios(Number(e.target.value))} />
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Retención de Auditoría (Días)</label>
              <input type="number" className="form-input" value={retentionAuditoria} onChange={(e) => setRetentionAuditoria(Number(e.target.value))} />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Save size={16} /> Guardar Configuración del Servidor
            </button>
          </form>
        </div>

        {/* Panel de alertas del entorno */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Centro de Alertas */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Centro de Notificaciones y Alertas
              <span className="badge badge-critica">{alerts.length}</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No hay alertas operativas pendientes de archivar.
                </div>
              ) : (
                alerts.map(a => (
                  <div 
                    key={a.id} 
                    style={{ 
                      background: 'rgba(239, 68, 68, 0.03)', 
                      border: '1px solid rgba(239, 68, 68, 0.2)', 
                      borderRadius: 'var(--radius-md)', 
                      padding: '12px',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <p style={{ color: 'var(--text-primary)' }}>{a.mensaje}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => handleArchiveAlert(a.id)}
                        style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Check size={12} /> Archivar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Generador de Reportes XLS/PDF */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Exportación de Actas Patrimoniales</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Seleccione los filtros para compilar y descargar actas estructuradas directas en Excel y PDF en memoria de servidor.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Origen</label>
                <select className="form-select" value={areaOrigenId} onChange={(e) => setAreaOrigenId(Number(e.target.value))}>
                  <option value={0}>Cualquiera</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Destino</label>
                <select className="form-select" value={areaDestinoId} onChange={(e) => setAreaDestinoId(Number(e.target.value))}>
                  <option value={0}>Cualquiera</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '10px' }}>
              <a 
                href={getDownloadUrl('excel')} 
                className="btn btn-secondary" 
                style={{ flex: 1, textDecoration: 'none' }}
                target="_blank" 
                rel="noreferrer"
              >
                <BarChart2 size={16} /> Exportar Excel
              </a>
              
              <a 
                href={getDownloadUrl('pdf')} 
                className="btn btn-primary" 
                style={{ flex: 1, textDecoration: 'none' }}
                target="_blank" 
                rel="noreferrer"
              >
                <File size={16} /> Exportar PDF
              </a>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
export default Configuracion;
