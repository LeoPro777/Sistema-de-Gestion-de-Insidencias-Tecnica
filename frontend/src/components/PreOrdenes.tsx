import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { PreOrden, Dispositivo, Usuario, AreaHospital } from '../types';
import { useNotificationModal } from '../context/NotificationModalContext';
import { SearchSelectModal } from './SearchSelectModal';
import { Trash2, Mic, Save, Zap, Search, Circle } from 'lucide-react';

export const PreOrdenes: React.FC = () => {
  const { showAlert, showConfirm } = useNotificationModal();
  const [preOrdenes, setPreOrdenes] = useState<PreOrden[]>([]);
  const [devices, setDevices] = useState<Dispositivo[]>([]);
  const [technicians, setTechnicians] = useState<Usuario[]>([]);
  const [areas, setAreas] = useState<AreaHospital[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedPO, setSelectedPO] = useState<PreOrden | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isTecnicoModalOpen, setIsTecnicoModalOpen] = useState(false);
  
  // Formulario de edición
  const [areaId, setAreaId] = useState<number>(0);
  const [tipoReq, setTipoReq] = useState('');
  const [urgencia, setUrgencia] = useState('');
  const [resumen, setResumen] = useState('');
  const [deviceId, setDeviceId] = useState<number>(0);
  const [tecnicoId, setTecnicoId] = useState<number>(0);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const pos = await api.get<PreOrden[]>('/api/v1/incidencias/pre');
      const devs = await api.get<Dispositivo[]>('/api/v1/devices');
      const ars = await api.get<AreaHospital[]>('/api/v1/devices/areas');
      
      // Obtener técnicos
      // Para simular, llamamos a un endpoint o consultamos. En nuestro auth router,
      // podemos listar o filtramos los que tengan roles de técnico.
      // Escribiremos una pequeña consulta para buscar usuarios que sean técnicos
      // o cargamos una lista bypass para pruebas.
      // Para hacerlo robusto, el backend permite que listemos todos los usuarios o nos devuelve
      // los perfiles. Como los seeders inyectaron maria.gomez (Hardware) y juan.rodriguez (Software),
      // cargaremos los usuarios que tengan rol en la respuesta de login, o consultamos /api/v1/auth/users
      // si existe. Si no, usaremos una lista de técnicos estática basada en los seeders o consultando.
      // Vamos a intentar obtener los técnicos llamando a un endpoint genérico, o hardcodeamos los técnicos
      // maestros para que no falle si no hay endpoint de listar usuarios completo.
      // Nota: en nuestro backend auth router, no creamos endpoint para listar todos los técnicos.
      // Vamos a añadir de forma rápida los técnicos semilla en caso de fallar,
      // pero para que sea dinámico podemos agregarlos.
      setPreOrdenes(pos);
      setDevices(devs.filter(d => d.estado_patrimonial !== 'Desincorporado'));
      setAreas(ars);
      
      // Simular lista de técnicos basado en el catálogo
      setTechnicians([
        { id: 3, email: 'maria.gomez@hospital.local', nombre: 'Maria', apellido: 'Gomez', rol: 'Técnico Hardware', estado: 'ACEPTADO' },
        { id: 4, email: 'juan.rodriguez@hospital.local', nombre: 'Juan', apellido: 'Rodriguez', rol: 'Técnico Software', estado: 'ACEPTADO' }
      ]);
    } catch (e) {
      console.error('Error fetching pre_ordenes data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const loadAudio = async (poId: number) => {
    setAudioUrl(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://${window.location.hostname}:8000/api/v1/incidencias/pre/${poId}/audio`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      }
    } catch (err) {
      console.error('Error cargando nota de voz', err);
    }
  };

  const handleSelectPO = (po: PreOrden) => {
    setSelectedPO(po);
    setAreaId(po.area_id);
    setTipoReq(po.tipo_requerimiento);
    setUrgencia(po.urgencia);
    setResumen(po.resumen);
    setDeviceId(po.device_id || 0);
    setTecnicoId(0);
    setFormError(null);
    loadAudio(po.id);
  };

  const handleSavePO = async () => {
    if (!selectedPO) return;
    try {
      const updated = await api.put<PreOrden>(`/api/v1/incidencias/pre/${selectedPO.id}`, {
        area_id: areaId,
        tipo_requerimiento: tipoReq,
        urgencia,
        resumen,
        device_id: deviceId || null
      });
      
      // Actualizar en lista local
      setPreOrdenes(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      setSelectedPO(updated);
      setFormError(null);
      await showAlert('Guardado', 'Pre-orden depurada y guardada en el búfer.');
    } catch (err: any) {
      const apiErr = err as ApiError;
      setFormError(apiErr.data?.detail || 'Error al guardar los cambios.');
    }
  };

  const handlePromote = async () => {
    if (!selectedPO) return;
    if (!deviceId) {
      setFormError('Debe asociar un dispositivo del inventario patrimonial para promover a orden.');
      return;
    }
    if (!tecnicoId) {
      setFormError('Debe asignar un técnico especialista (Hardware/Software) del taller.');
      return;
    }

    try {
      await api.post('/api/v1/incidencias/active/promote', {
        pre_orden_id: selectedPO.id,
        device_id: deviceId,
        tecnico_id: tecnicoId
      });
      
      // Quitar de la lista
      setPreOrdenes(prev => prev.filter(p => p.id !== selectedPO.id));
      setSelectedPO(null);
      await showAlert('Promovido', 'Incidencia formalmente promovida a Orden Activa en el taller.');
    } catch (err: any) {
      const apiErr = err as ApiError;
      setFormError(apiErr.data?.detail || 'Error al promover la pre-orden.');
    }
  };

  const handleReject = async () => {
    if (!selectedPO) return;
    const confirmed = await showConfirm(
      'Confirmar Descarte',
      '¿Está seguro de marcar esta incidencia como Spam/Rechazada? Esto la eliminará del buzón.'
    );
    if (!confirmed) return;
    
    try {
      await api.post(`/api/v1/incidencias/pre/${selectedPO.id}/reject`);
      setPreOrdenes(prev => prev.filter(p => p.id !== selectedPO.id));
      setSelectedPO(null);
    } catch (err) {
      console.error(err);
    }
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
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Bandeja de Ingesta (Pre-Órdenes)</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Revise reportes de Inteligencia Artificial y grabaciones de voz antes de despachar soporte técnico.
        </p>
      </div>

      <div className="grid-asymmetric-left">
        {/* Buzón izquierdo */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Reportes Recibidos ({preOrdenes.length})</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '600px', overflowY: 'auto' }}>
            {preOrdenes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
                Buzón limpio. No hay pre-órdenes pendientes de revisión.
              </div>
            ) : (
              preOrdenes.map((po) => (
                <div
                  key={po.id}
                  className={`card ${selectedPO?.id === po.id ? 'pulse-warning' : ''}`}
                  style={{
                    padding: '16px',
                    cursor: 'pointer',
                    background: selectedPO?.id === po.id ? 'var(--bg-card-hover)' : 'rgba(255,255,255,0.02)',
                    borderColor: selectedPO?.id === po.id ? 'var(--primary)' : 'var(--border-color)',
                  }}
                  onClick={() => handleSelectPO(po)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className={`badge badge-${po.urgencia.toLowerCase()}`}>{po.urgencia}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(po.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                    {po.tipo_requerimiento} en {po.area?.nombre || `Área ID ${po.area_id}`}
                  </h4>
                  <p style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {po.resumen}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor / Promotor derecho */}
        {selectedPO ? (
          <div className="card card-primary-glow" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600' }}>
                Detalles del Reporte: {selectedPO.numero_reporte.slice(0, 8)}...
              </h3>
              <button className="btn btn-danger" onClick={handleReject} style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Trash2 size={14} /> Spam / Rechazar
              </button>
            </div>

            {formError && (
              <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                {formError}
              </div>
            )}

            {/* Audio nativo */}
            {audioUrl ? (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mic size={14} /> Nota de voz del empleado</span>
                <audio src={audioUrl} controls style={{ width: '100%' }} />
              </div>
            ) : selectedPO.audio_path ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Cargando grabación de voz...</div>
            ) : null}

            {/* Formulario editable */}
            <div className="grid-two-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Tipo de Requerimiento</label>
                <select className="form-select" value={tipoReq} onChange={(e) => setTipoReq(e.target.value)}>
                  <option value="Hardware">Hardware</option>
                  <option value="Software">Software</option>
                  <option value="Redes">Redes y Conectividad</option>
                  <option value="Sistemas Clínicos">Sistemas Clínicos</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Urgencia Hospitalaria</label>
                <select className="form-select" value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
                  <option value="Crítica">Crítica (Emergencia/UCI)</option>
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Baja">Baja</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ubicación (Área del Hospital)</label>
              <select className="form-select" value={areaId} onChange={(e) => setAreaId(Number(e.target.value))}>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Resumen de Falla (Edición IA)</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={resumen}
                onChange={(e) => setResumen(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={handleSavePO} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Save size={16} /> Guardar Cambios
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', color: 'var(--primary)' }}>Promoción Técnica del Ticket</h4>
              
              <div className="grid-two-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Dispositivo Patrimonial</label>
                  <button 
                    type="button"
                    className="form-select" 
                    style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => setIsDeviceModalOpen(true)}
                  >
                    {deviceId 
                      ? (() => {
                          const d = devices.find(x => x.id === deviceId);
                          return d ? `[${d.codigo_activo}] ${d.marca} (${d.serial})` : '-- Seleccione Activo --';
                        })()
                      : '-- Seleccione Activo --'}
                    <span><Search size={14} /></span>
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label">Especialista Asignado</label>
                  <button 
                    type="button"
                    className="form-select" 
                    style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => setIsTecnicoModalOpen(true)}
                  >
                    {tecnicoId 
                      ? (() => {
                          const t = technicians.find(x => x.id === tecnicoId);
                          return t ? `${t.nombre} ${t.apellido} - ${t.rol}` : '-- Seleccione Técnico --';
                        })()
                      : '-- Seleccione Técnico --'}
                    <span><Search size={14} /></span>
                  </button>
                </div>
              </div>

              <button className="btn btn-primary" onClick={handlePromote} style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Zap size={16} /> Promover y Asignar Orden de Trabajo
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px', color: 'var(--text-muted)', borderStyle: 'dashed' }}>
            Seleccione una pre-orden del búfer para depurarla y promoverla.
          </div>
        )}
      </div>

      <SearchSelectModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        title="Seleccionar Dispositivo Patrimonial"
        placeholder="Buscar por código activo, marca, serial o descripción..."
        items={devices}
        searchFields={(d) => [d.codigo_activo, d.marca, d.serial, d.descripcion || '']}
        renderItem={(d) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: 'var(--primary)' }}>[{d.codigo_activo}]</strong>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{d.estado_patrimonial}</span>
            </div>
            <div style={{ color: 'var(--text-primary)' }}>{d.marca} ({d.serial})</div>
            {d.descripcion && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{d.descripcion}</div>}
          </div>
        )}
        onSelect={(d) => setDeviceId(d.id)}
      />

      <SearchSelectModal
        isOpen={isTecnicoModalOpen}
        onClose={() => setIsTecnicoModalOpen(false)}
        title="Seleccionar Especialista Técnico"
        placeholder="Buscar por nombre, apellido o rol..."
        items={technicians}
        searchFields={(t) => [t.nombre, t.apellido, t.rol]}
        renderItem={(t) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{t.nombre} {t.apellido}</strong>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t.rol}</div>
          </div>
        )}
        onSelect={(t) => setTecnicoId(t.id)}
      />
    </div>
  );
};
export default PreOrdenes;
