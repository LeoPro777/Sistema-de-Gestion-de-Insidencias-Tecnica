import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Dispositivo, AreaHospital, Traslado } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNotificationModal } from '../context/NotificationModalContext';
import { SearchSelectModal } from './SearchSelectModal';
import { 
  Laptop, 
  Search, 
  Plus, 
  RefreshCw, 
  AlertTriangle, 
  ShieldAlert,
  Play, 
  Edit2, 
  Save, 
  X, 
  ArrowLeftRight, 
  History, 
  Check, 
  FileText,
  Activity
} from 'lucide-react';

interface DeviceStats {
  totales: number;
  activos: number;
  averiados: number;
  en_linea: number;
}

interface IncidentHistoryItem {
  id: number;
  estado: string;
  created_at: string;
  closed_at: string | null;
  diagnostico: string;
  urgencia: string;
  tipo_requerimiento: string;
  resumen: string;
  tecnico: string;
  soporte: string;
}

export const DispositivosModule: React.FC = () => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useNotificationModal();

  // Permisos
  const isAdmin = user?.rol === 'Admin';
  const isAdminOrSoporte = user?.rol === 'Admin' || user?.rol === 'Soporte Técnico';

  // Estados de datos
  const [devices, setDevices] = useState<Dispositivo[]>([]);
  const [areas, setAreas] = useState<AreaHospital[]>([]);
  const [stats, setStats] = useState<DeviceStats>({ totales: 0, activos: 0, averiados: 0, en_linea: 0 });
  const [loading, setLoading] = useState(true);
  
  // Detalle y Modales
  const [selectedDevice, setSelectedDevice] = useState<Dispositivo | null>(null);
  const [incidents, setIncidents] = useState<IncidentHistoryItem[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [pingStatus, setPingStatus] = useState<any | null>(null);
  const [pingLoading, setPingLoading] = useState(false);

  // Estados de Edición
  const [isEditing, setIsEditing] = useState(false);
  const [editIp, setEditIp] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Estados de Reubicación (Traslado)
  const [showRelocateForm, setShowRelocateForm] = useState(false);
  const [destAreaId, setDestAreaId] = useState<number>(0);
  const [relocateReason, setRelocateReason] = useState('');
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);

  // Estados de Baja (Retiro)
  const [showRetireForm, setShowRetireForm] = useState(false);
  const [retireMotiveType, setRetireMotiveType] = useState<'Avería' | 'Desaparición'>('Avería');
  const [retireReasonDetails, setRetireReasonDetails] = useState('');

  // Creación de Dispositivo
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCodigo, setNewCodigo] = useState('');
  const [newSerial, setNewSerial] = useState('');
  const [newMac, setNewMac] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newMarca, setNewMarca] = useState('');
  const [newAreaId, setNewAreaId] = useState<number>(0);
  const [newDesc, setNewDesc] = useState('');
  const [newEstado, setNewEstado] = useState('Activo');
  const [createLoading, setCreateLoading] = useState(false);

  // Búsqueda y Multi-Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterEstado, setFilterEstado] = useState<string>('all');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const cardsPerPage = 6;

  const loadData = async () => {
    setLoading(true);
    try {
      const [devsList, areasList, statsData] = await Promise.all([
        api.get<Dispositivo[]>('/api/v1/devices'),
        api.get<AreaHospital[]>('/api/v1/devices/areas'),
        api.get<DeviceStats>('/api/v1/devices/stats')
      ]);
      setDevices(devsList);
      setAreas(areasList);
      setStats(statsData);
    } catch (e) {
      console.error('Error cargando catálogo de dispositivos', e);
    } finally {
      setLoading(false);
    }
  };

  const reloadStatsOnly = async () => {
    try {
      const statsData = await api.get<DeviceStats>('/api/v1/devices/stats');
      setStats(statsData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Manejar click en tarjeta para ver detalles
  const handleOpenDetails = async (dev: Dispositivo) => {
    setSelectedDevice(dev);
    setPingStatus(null);
    setIsEditing(false);
    setShowRelocateForm(false);
    setShowRetireForm(false);
    setEditIp(dev.ip_fija || '');
    setEditDesc(dev.descripcion || '');

    // Cargar historial de incidencias
    setIncidentsLoading(true);
    try {
      const incList = await api.get<IncidentHistoryItem[]>(`/api/v1/devices/${dev.id}/incidents`);
      setIncidents(incList);
    } catch (err) {
      console.error(err);
      setIncidents([]);
    } finally {
      setIncidentsLoading(false);
    }
  };

  // Comprobar ping
  const handlePing = async () => {
    if (!selectedDevice) return;
    setPingLoading(true);
    setPingStatus(null);
    try {
      const res = await api.get<any>(`/api/v1/devices/${selectedDevice.id}/ping`);
      setPingStatus(res);
      // Refrescar estadísticas en paralelo
      reloadStatsOnly();
    } catch {
      setPingStatus({ status: 'offline', message: 'Tiempo de espera agotado. El activo se encuentra inaccesible en la LAN.' });
    } finally {
      setPingLoading(false);
    }
  };

  // Guardar edición
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    setEditLoading(true);
    try {
      const updated = await api.put<Dispositivo>(`/api/v1/devices/${selectedDevice.id}`, {
        ip_fija: editIp || null,
        descripcion: editDesc || null
      });
      setSelectedDevice(updated);
      setDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
      setIsEditing(false);
      await showAlert('Guardado', 'Información del dispositivo actualizada.');
    } catch (err: any) {
      await showAlert('Error', err.data?.detail || 'No se pudo actualizar el dispositivo.');
    } finally {
      setEditLoading(false);
    }
  };

  // Trasladar
  const handleRelocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !destAreaId || !relocateReason) {
      await showAlert('Campos Incompletos', 'Seleccione un área destino y especifique el motivo.');
      return;
    }
    try {
      await api.post(`/api/v1/devices/${selectedDevice.id}/relocate`, {
        area_destino_id: destAreaId,
        motivo_traslado: relocateReason
      });
      await showAlert('Traslado Éxitoso', 'El dispositivo ha sido reubicado y se ha encolado el acta.');
      setShowRelocateForm(false);
      setDestAreaId(0);
      setRelocateReason('');
      setSelectedDevice(null); // Cerrar modal
      loadData();
    } catch (err: any) {
      await showAlert('Error de Traslado', err.data?.detail || 'No se pudo procesar el traslado.');
    }
  };

  // Dar de baja
  const handleRetire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !retireReasonDetails) {
      await showAlert('Falta Justificación', 'Debe especificar el motivo de la baja patrimonial.');
      return;
    }

    const confirmed = await showConfirm(
      'Confirmar Baja Patrimonial',
      `¿Está seguro de dar de baja este dispositivo definitivamente por ${retireMotiveType.toUpperCase()}? Esta acción es irreversible.`
    );
    if (!confirmed) return;

    try {
      const fullMotive = `${retireMotiveType}: ${retireReasonDetails}`;
      await api.post(`/api/v1/devices/${selectedDevice.id}/retire`, null, {
        motivo: fullMotive
      });
      await showAlert('Baja Procesada', 'Activo desincorporado lógicamente y acta de baja encolada.');
      setShowRetireForm(false);
      setRetireReasonDetails('');
      setSelectedDevice(null); // Cerrar modal
      loadData();
    } catch (err: any) {
      await showAlert('Error en Baja', err.data?.detail || 'No se pudo retirar el activo.');
    }
  };

  // Crear Dispositivo
  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCodigo || !newSerial || !newMarca || !newAreaId) {
      await showAlert('Campos obligatorios', 'Complete el código de activo, serial, marca y área.');
      return;
    }
    setCreateLoading(true);
    try {
      const created = await api.post<Dispositivo>('/api/v1/devices', {
        codigo_activo: newCodigo,
        serial: newSerial,
        mac_address: newMac || null,
        ip_fija: newIp || null,
        marca: newMarca,
        area_id: newAreaId,
        descripcion: newDesc || null,
        estado_patrimonial: newEstado
      });
      await showAlert('Creado', 'El dispositivo ha sido catalogado con éxito.');
      setIsCreateOpen(false);
      // Reset campos
      setNewCodigo('');
      setNewSerial('');
      setNewMac('');
      setNewIp('');
      setNewMarca('');
      setNewAreaId(0);
      setNewDesc('');
      setNewEstado('Activo');
      loadData();
    } catch (err: any) {
      await showAlert('Error', err.data?.detail || 'No se pudo registrar el dispositivo.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Filtrado de Dispositivos en Cliente
  const filteredDevices = devices.filter(d => {
    const matchesSearch = 
      d.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.codigo_activo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.descripcion && d.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesArea = filterArea === 'all' || d.area_id.toString() === filterArea;
    const matchesEstado = filterEstado === 'all' || d.estado_patrimonial === filterEstado;

    return matchesSearch && matchesArea && matchesEstado;
  });

  // Cálculo de Paginación
  const totalPages = Math.ceil(filteredDevices.length / cardsPerPage);
  const indexOfLastCard = currentPage * cardsPerPage;
  const indexOfFirstCard = indexOfLastCard - cardsPerPage;
  const currentCards = filteredDevices.slice(indexOfFirstCard, indexOfLastCard);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Catálogo de Dispositivos
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Administre y audite la infraestructura tecnológica del hospital de forma inmutable.
          </p>
        </div>
        
        {/* Crear activo (Admin/Soporte) */}
        {isAdminOrSoporte && (
          <button onClick={() => setIsCreateOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Catalogar Equipo
          </button>
        )}
      </div>

      {/* Tarjetas Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="card card-primary-glow" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'var(--primary-glow)', padding: '12px', borderRadius: 'var(--radius-md)', color: 'var(--primary)' }}>
            <Laptop size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Equipos Totales</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#fff' }}>{stats.totales}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'var(--success-glow)', padding: '12px', borderRadius: 'var(--radius-md)', color: 'var(--success)' }}>
            <Check size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Activos</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--success)' }}>{stats.activos}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'var(--danger-glow)', padding: '12px', borderRadius: 'var(--radius-md)', color: 'var(--danger)' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Averiados</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--danger)' }}>{stats.averiados}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: 'var(--radius-md)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={24} className="pulse-warning" style={{ color: '#10B981', animationDuration: '3s' }} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>En Línea LAN</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#10B981' }}>{stats.en_linea}</div>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Multi Filtros */}
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Campo búsqueda */}
          <div style={{ flex: '1', minWidth: '260px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '14px', top: '13px', color: 'var(--text-muted)' }}>
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar por marca, serial, código de activo..."
              className="form-input"
              style={{ paddingLeft: '40px' }}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>

          {/* Filtro de área */}
          <div style={{ minWidth: '180px' }}>
            <select 
              className="form-select" 
              value={filterArea} 
              onChange={(e) => { setFilterArea(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">Todas las Áreas</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>

          {/* Filtro de estado */}
          <div style={{ minWidth: '180px' }}>
            <select 
              className="form-select" 
              value={filterEstado} 
              onChange={(e) => { setFilterEstado(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">Todos los Estados</option>
              <option value="Activo">Activos</option>
              <option value="Averiado">Averiados</option>
              <option value="Desincorporado">Desincorporados (Bajas)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grilla de Equipos (Mobile Responsive & Cards Paginadas) */}
      {currentCards.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', borderStyle: 'dashed' }}>
          No se encontraron dispositivos informáticos con los filtros seleccionados.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {currentCards.map(d => {
              const isOffline = d.estado_patrimonial === 'Desincorporado';
              const isBroken = d.estado_patrimonial === 'Averiado';
              
              return (
                <div 
                  key={d.id} 
                  className="card" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer',
                    opacity: isOffline ? 0.55 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '180px'
                  }}
                  onClick={() => handleOpenDetails(d)}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary)', letterSpacing: '0.05em' }}>
                        {d.codigo_activo}
                      </span>
                      <span className={`badge ${isOffline || isBroken ? 'badge-critica' : 'badge-media'}`}
                            style={d.estado_patrimonial === 'Activo' ? { background: 'var(--success-glow)', color: 'var(--success)' } : {}}>
                        {d.estado_patrimonial}
                      </span>
                    </div>
                    
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
                      {d.marca}
                    </h3>
                    
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong>Ubicación:</strong> {d.area?.nombre || 'Sin Dependencia'}
                    </p>
                    
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      S/N: {d.serial}
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {d.ip_fija ? `IP: ${d.ip_fija}` : 'IP: DHCP Dinámico'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600' }}>
                      Ficha →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
              <button 
                onClick={() => handlePageChange(currentPage - 1)} 
                disabled={currentPage === 1}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Anterior
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: 'var(--text-secondary)', padding: '0 8px' }}>
                Pág. {currentPage} de {totalPages}
              </div>

              <button 
                onClick={() => handlePageChange(currentPage + 1)} 
                disabled={currentPage === totalPages}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      {/* MODAL DETALLES DEL DISPOSITIVO */}
      {selectedDevice && (
        <div className="modal-overlay" onClick={() => setSelectedDevice(null)}>
          <div 
            className="modal-content" 
            style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }} 
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Header del Modal */}
            <div className="modal-header">
              <div>
                <span className="badge badge-media" style={{ marginBottom: '6px' }}>{selectedDevice.codigo_activo}</span>
                <h3 className="modal-title">{selectedDevice.marca}</h3>
              </div>
              <button onClick={() => setSelectedDevice(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Body del Modal */}
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Sección Características / Edición */}
              <div className="card" style={{ background: 'rgba(255,255,255,0.01)', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Expediente del Activo
                  </h4>
                  {isAdminOrSoporte && !isEditing && (
                    <button 
                      onClick={() => setIsEditing(true)} 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 8px', fontSize: '11px', height: 'auto' }}
                    >
                      <Edit2 size={12} style={{ marginRight: '4px' }} /> Editar
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Dirección IP LAN Fija</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={editIp}
                        onChange={(e) => setEditIp(e.target.value)}
                        placeholder="ej. 192.168.1.10"
                      />
                    </div>
                    
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Descripción / Observaciones</label>
                      <textarea 
                        className="form-input" 
                        rows={2}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Detalles sobre hardware, periféricos asignados..."
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button 
                        type="button" 
                        onClick={() => setIsEditing(false)} 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit" 
                        className="btn btn-primary" 
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        disabled={editLoading}
                      >
                        <Save size={12} style={{ marginRight: '4px' }} />
                        {editLoading ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '13px' }}>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Serial:</strong> {selectedDevice.serial}</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Dirección MAC:</strong> {selectedDevice.mac_address || 'Sin registrar'}</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>IP LAN Fija:</strong> {selectedDevice.ip_fija || 'DHCP Dinámico'}</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Ubicación Física:</strong> {selectedDevice.area?.nombre}</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Estado Patrimonial:</strong> {selectedDevice.estado_patrimonial}</div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <strong style={{ color: 'var(--text-secondary)' }}>Notas/Descripción:</strong> {selectedDevice.descripcion || 'Sin observaciones registradas.'}
                    </div>
                  </div>
                )}
              </div>

              {/* Botón de Ping LAN */}
              {selectedDevice.estado_patrimonial === 'Activo' && (
                <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Comprobación LAN en Tiempo Real</h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Envía una trama ICMP rápida para comprobar conectividad.</p>
                  </div>
                  
                  <button 
                    onClick={handlePing}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                    disabled={pingLoading}
                  >
                    {pingLoading ? 'Pinguando...' : 'Realizar Ping'}
                  </button>

                  {pingStatus && (
                    <div style={{ 
                      width: '100%', 
                      padding: '10px 14px', 
                      borderRadius: 'var(--radius-sm)', 
                      fontSize: '12px',
                      background: pingStatus.status === 'online' ? 'var(--success-glow)' : 'var(--danger-glow)',
                      border: `1px solid ${pingStatus.status === 'online' ? 'var(--success)' : 'var(--danger)'}`,
                      color: pingStatus.status === 'online' ? '#fff' : 'hsl(346, 84%, 65%)'
                    }}>
                      <strong>Resultado:</strong> {pingStatus.message} {pingStatus.ip ? `(${pingStatus.ip})` : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Acciones de Control Patrimonial (Admin Only) */}
              {isAdmin && selectedDevice.estado_patrimonial !== 'Desincorporado' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Procedimientos Patrimoniales
                  </h4>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => { setShowRelocateForm(!showRelocateForm); setShowRetireForm(false); }}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
                    >
                      <ArrowLeftRight size={14} style={{ marginRight: '6px' }} /> Trasladar
                    </button>
                    
                    <button 
                      onClick={() => { setShowRetireForm(!showRetireForm); setShowRelocateForm(false); }}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '8px 12px', fontSize: '12px', color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}
                    >
                      <ShieldAlert size={14} style={{ marginRight: '6px' }} /> Dar de Baja
                    </button>
                  </div>

                  {/* Formulario de Traslado */}
                  {showRelocateForm && (
                    <form onSubmit={handleRelocate} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.01)', borderColor: 'var(--primary)' }}>
                      <h5 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)' }}>Asignar Nueva Ubicación</h5>
                      
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Área Hospitalaria Destino</label>
                        <button 
                          type="button"
                          className="form-select" 
                          style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onClick={() => setIsAreaModalOpen(true)}
                        >
                          {destAreaId 
                            ? (() => {
                                const a = areas.find(x => x.id === destAreaId);
                                return a ? a.nombre : '-- Seleccione Destino --';
                              })()
                            : '-- Seleccione Destino --'}
                          <span><Search size={14} /></span>
                        </button>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Justificación del Traslado</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="ej. Traslado por ampliación de camas o falla del equipo anterior"
                          value={relocateReason}
                          onChange={(e) => setRelocateReason(e.target.value)}
                        />
                      </div>

                      <button type="submit" className="btn btn-primary" style={{ width: '100%', fontSize: '12px', padding: '8px' }}>
                        Confirmar y Encolar Acta Oficial
                      </button>
                    </form>
                  )}

                  {/* Formulario de Baja */}
                  {showRetireForm && (
                    <form onSubmit={handleRetire} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.01)', borderColor: 'var(--danger)' }}>
                      <h5 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--danger)' }}>Confirmar Baja Patrimonial</h5>
                      
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Motivo de Desincorporación</label>
                        <select 
                          className="form-select" 
                          value={retireMotiveType}
                          onChange={(e: any) => setRetireMotiveType(e.target.value)}
                        >
                          <option value="Avería">Baja por Avería severa (Inoperante)</option>
                          <option value="Desaparición">Baja por Desaparición / Robo</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Detalles / Justificación de la Baja</label>
                        <textarea 
                          className="form-input" 
                          rows={2}
                          placeholder="Describa el diagnóstico técnico que justifica el descarte patrimonial..."
                          value={retireReasonDetails}
                          onChange={(e) => setRetireReasonDetails(e.target.value)}
                        />
                      </div>

                      <button type="submit" className="btn btn-danger" style={{ width: '100%', fontSize: '12px', padding: '8px' }}>
                        Desincorporar Activo del Inventario
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Historial Clínico de Incidencias */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={14} /> Historial Técnico de Incidencias
                </h4>

                {incidentsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                    <div className="spinner" style={{ width: '24px', height: '24px' }}></div>
                  </div>
                ) : incidents.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    Este dispositivo no registra órdenes de servicio ni incidencias.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {incidents.map(inc => (
                      <div 
                        key={inc.id}
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-sm)',
                          borderLeft: `3px solid ${inc.estado === 'RESUELTA' ? 'var(--success)' : 'var(--warning)'}`,
                          background: 'rgba(255,255,255,0.02)',
                          fontSize: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                          <span style={{ color: 'var(--text-primary)' }}>{inc.tipo_requerimiento}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{new Date(inc.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          <strong>Falla Reportada:</strong> {inc.resumen}
                        </div>
                        <div style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                          <strong>Solución/Diagnóstico:</strong> {inc.diagnostico}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: '4px' }}>
                          <span>Técnico: {inc.tecnico}</span>
                          <span>Estado: {inc.estado}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Footer del Modal */}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedDevice(null)}>Cerrar Expediente</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR DISPOSITIVO */}
      {isCreateOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Catalogar Nuevo Activo Fijo</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateDevice}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Código de Activo *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="ej. HOSP-102"
                      required
                      value={newCodigo}
                      onChange={(e) => setNewCodigo(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Serial *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="ej. SN77329"
                      required
                      value={newSerial}
                      onChange={(e) => setNewSerial(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Marca/Modelo *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="ej. HP ProDesk 400"
                      required
                      value={newMarca}
                      onChange={(e) => setNewMarca(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Área Hospitalaria *</label>
                    <select 
                      className="form-select"
                      required
                      value={newAreaId || ''}
                      onChange={(e) => setNewAreaId(Number(e.target.value))}
                    >
                      <option value="">-- Seleccionar --</option>
                      {areas.map(a => (
                        <option key={a.id} value={a.id}>{a.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Dirección MAC</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="ej. 00:1A:2B:3C:4D:5E"
                      value={newMac}
                      onChange={(e) => setNewMac(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Dirección IP LAN Fija</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="ej. 192.168.1.50"
                      value={newIp}
                      onChange={(e) => setNewIp(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Estado Patrimonial Inicial</label>
                  <select 
                    className="form-select" 
                    value={newEstado} 
                    onChange={(e) => setNewEstado(e.target.value)}
                  >
                    <option value="Activo">Activo (Operando)</option>
                    <option value="Averiado">Averiado (Esperando Reparación)</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Descripción</label>
                  <textarea 
                    className="form-input" 
                    rows={2}
                    placeholder="Detalles sobre periféricos, uso o estado..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createLoading}>
                  {createLoading ? 'Procesando...' : 'Registrar Activo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SEARCH SELECT ÁREA (DENTRO DE TRASLADO) */}
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
        onSelect={(a) => setDestAreaId(a.id)}
      />

    </div>
  );
};
export default DispositivosModule;
