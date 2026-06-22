import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { AreaHospital } from '../types';

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

export const Reportes: React.FC = () => {
  const [areas, setAreas] = useState<AreaHospital[]>([]);
  const [traslados, setTraslados] = useState<TrasladoReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [ejecutorNombre, setEjecutorNombre] = useState(''); // Filtro por texto local
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [filtering, setFiltering] = useState(false);

  const fetchInitialData = async () => {
    try {
      const areasData = await api.get<AreaHospital[]>('/api/v1/devices/areas');
      setAreas(areasData);
      
      // Obtener traslados iniciales
      const trasladosData = await api.get<TrasladoReport[]>('/api/v1/reports/traslados');
      setTraslados(trasladosData);
    } catch (e) {
      console.error('Error fetching reports data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleApplyFilters = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFiltering(true);
    try {
      const params: Record<string, string> = {};
      if (origenId) params.area_origen_id = origenId;
      if (destinoId) params.area_destino_id = destinoId;
      if (fechaInicio) params.fecha_inicio = fechaInicio;
      if (fechaFin) params.fecha_fin = fechaFin;
      
      const data = await api.get<TrasladoReport[]>('/api/v1/reports/traslados', params);
      setTraslados(data);
    } catch (err) {
      console.error('Error applying filters', err);
    } finally {
      setFiltering(false);
    }
  };

  const handleClearFilters = () => {
    setOrigenId('');
    setDestinoId('');
    setEjecutorNombre('');
    setFechaInicio('');
    setFechaFin('');
    fetchInitialData();
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    const params = new URLSearchParams();
    if (origenId) params.append('area_origen_id', origenId);
    if (destinoId) params.append('area_destino_id', destinoId);
    if (fechaInicio) params.append('fecha_inicio', fechaInicio);
    if (fechaFin) params.append('fecha_fin', fechaFin);
    
    const token = localStorage.getItem('token');
    if (token) params.append('token', token); // For browser redirection auth if needed, or window.open
    
    // Invocamos directamente el endpoint del backend
    const url = `http://localhost:8000/api/v1/reports/export/${format}?${params.toString()}`;
    window.open(url, '_blank');
  };

  // Filtrado local adicional para el Ejecutor Administrador
  const filteredTraslados = traslados.filter(t => {
    if (!ejecutorNombre) return true;
    const fullName = (t.administrador || '').toLowerCase();
    return fullName.includes(ejecutorNombre.toLowerCase());
  });

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
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Motor Analítico y Reportes</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Consulte movimientos patrimoniales y descargue actas oficiales en PDF/Excel generadas en memoria del servidor.
        </p>
      </div>

      {/* Panel de Filtros */}
      <div className="card card-primary-glow">
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Filtros de Búsqueda</h3>
        <form onSubmit={handleApplyFilters} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
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

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={filtering}>
              {filtering ? 'Filtrando...' : '🔍 Buscar'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleClearFilters}>
              Limpiar
            </button>
          </div>
        </form>
      </div>

      {/* Listado de Resultados y Acciones de Exportación */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Movimientos Registrados ({filteredTraslados.length})</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="btn btn-success" 
              onClick={() => handleExport('excel')}
              disabled={filteredTraslados.length === 0}
              style={{ background: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              📊 Exportar Excel
            </button>
            <button 
              className="btn btn-danger" 
              onClick={() => handleExport('pdf')}
              disabled={filteredTraslados.length === 0}
              style={{ background: '#EF4444', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              📄 Exportar PDF
            </button>
          </div>
        </div>

        <div className="table-container">
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
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron traslados con los filtros especificados.</td>
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
                    <td data-label="Motivo" style={{ fontSize: '13px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.motivo_traslado}>
                      {t.motivo_traslado}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default Reportes;
