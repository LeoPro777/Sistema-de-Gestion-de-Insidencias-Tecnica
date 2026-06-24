import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { InventarioItem, PrestamoHerramienta } from '../types';
import { useNotificationModal } from '../context/NotificationModalContext';
import { SearchSelectModal } from './SearchSelectModal';
import { Lock, Search, Plus, RefreshCw, AlertTriangle, HelpCircle } from 'lucide-react';

export const Almacen: React.FC = () => {
  const { showAlert, showConfirm } = useNotificationModal();
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [loans, setLoans] = useState<PrestamoHerramienta[]>([]);
  const [loading, setLoading] = useState(true);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);

  // Formulario de Préstamos
  const [toolId, setToolId] = useState<number>(0);
  const [beneficiarioCedula, setBeneficiarioCedula] = useState('');
  const [loanError, setLoanError] = useState<string | null>(null);

  // Formulario de Agregar Ítem
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState('Consumible');
  const [newItemStock, setNewItemStock] = useState(10);
  const [newItemStockMin, setNewItemStockMin] = useState(5);

  const fetchData = async () => {
    setLoading(true);
    try {
      const inventory = await api.get<InventarioItem[]>('/api/v1/inventory/items');
      const activeLoans = await api.get<PrestamoHerramienta[]>('/api/v1/inventory/prestamos');
      setItems(inventory);
      setLoans(activeLoans);
    } catch (e) {
      console.error('Error cargando almacén', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName) return;
    try {
      const created = await api.post<InventarioItem>('/api/v1/inventory/items', {
        nombre: newItemName,
        tipo: newItemType,
        stock: newItemStock,
        stock_minimo: newItemStockMin
      });
      setItems(prev => [...prev, created].sort((a,b) => a.nombre.localeCompare(b.nombre)));
      setNewItemName('');
      setNewItemStock(10);
      await showAlert('Éxito', 'Ítem agregado exitosamente al catálogo.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoanError(null);
    if (!toolId) {
      setLoanError('Seleccione una herramienta.');
      return;
    }
    if (!beneficiarioCedula) {
      setLoanError('Ingrese la cédula del beneficiario.');
      return;
    }

    try {
      await api.post('/api/v1/inventory/prestamos', {
        herramienta_id: toolId,
        beneficiario_cedula: beneficiarioCedula
      });
      
      await showAlert('Éxito', 'Préstamo autorizado con éxito.');
      setToolId(0);
      setBeneficiarioCedula('');
      fetchData();
    } catch (err: any) {
      const apiErr = err as ApiError;
      setLoanError(apiErr.data?.detail || 'Error al procesar el préstamo.');
    }
  };

  const handleReturnTool = async (loanId: number) => {
    try {
      await api.post(`/api/v1/inventory/prestamos/${loanId}/return`);
      await showAlert('Devuelto', 'Herramienta devuelta al almacén.');
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReportIncident = async (loanId: number, status: 'Dañado' | 'Perdido') => {
    const confirmed = await showConfirm(
      'Reportar Siniestro',
      `¿Está seguro de reportar esta herramienta como ${status.toUpperCase()}?`
    );
    if (!confirmed) return;

    try {
      await api.post(`/api/v1/inventory/prestamos/${loanId}/report`, null, { 
        nuevo_estado: status 
      });
      await showAlert('Reportado', `Siniestro reportado. Alarma enviada de inmediato a la terminal del administrador.`);
      fetchData();
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

  // Separar Consumibles y Herramientas
  const consumibles = items.filter(i => i.tipo === 'Consumible');
  const herramientas = items.filter(i => i.tipo === 'Herramienta');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Control de Almacén e Inventario</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Gestión de existencias de consumibles técnicos y préstamos de herramientas con asignación dual.
        </p>
      </div>

      <div className="grid-asymmetric-right">
        {/* Catálogo de Inventario */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {/* Consumibles */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Consumibles Técnicos (Repuestos)</h3>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Existencias</th>
                    <th>Mínimo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody className="table-responsive-cards">
                  {consumibles.map(c => {
                    const isLow = c.stock <= c.stock_minimo;
                    return (
                      <tr key={c.id}>
                        <td data-label="Material" style={{ fontWeight: '500' }}>{c.nombre}</td>
                        <td data-label="Existencias" style={{ 
                          fontWeight: '700', 
                          color: isLow ? 'var(--danger)' : '#10B981' 
                        }}>{c.stock} uds</td>
                        <td data-label="Mínimo">{c.stock_minimo} uds</td>
                        <td data-label="Estado">
                          {isLow ? (
                            <span className="badge badge-critica">Alerta Reposición</span>
                          ) : (
                            <span className="badge badge-media" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>Stock Seguro</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Herramientas */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Herramientas del Taller</h3>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Herramienta</th>
                    <th>En Almacén</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody className="table-responsive-cards">
                  {herramientas.map(h => (
                    <tr key={h.id}>
                      <td data-label="Herramienta" style={{ fontWeight: '500' }}>{h.nombre}</td>
                      <td data-label="En Almacén" style={{ fontWeight: '700' }}>{h.stock} uds</td>
                      <td data-label="Estado">
                        {h.stock === 0 ? (
                          <span className="badge badge-critica" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>Prestada / Agotada</span>
                        ) : (
                          <span className="badge badge-media" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>Disponible</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Registro y Préstamos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Formulario de Préstamos */}
          <div className="card card-primary-glow">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Autorizar Préstamo de Herramienta</h3>
            
            {loanError && (
              <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: '16px' }}>
                {loanError}
              </div>
            )}

            <form onSubmit={handleLoanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Herramienta Solicitada</label>
                <button 
                  type="button"
                  className="form-select" 
                  style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onClick={() => setIsToolModalOpen(true)}
                >
                  {toolId 
                    ? (() => {
                        const h = herramientas.find(x => x.id === toolId);
                        return h ? `${h.nombre} (Disponibles: {h.stock} uds)` : '-- Seleccione Herramienta --';
                      })()
                    : '-- Seleccione Herramienta --'}
                  <span><Search size={14} /></span>
                </button>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Cédula del Empleado Recibidor</label>
                <input
                  id="beneficiario-cedula-input"
                  type="text"
                  className="form-input"
                  placeholder="ej. V-11111111"
                  value={beneficiarioCedula}
                  onChange={(e) => setBeneficiarioCedula(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Lock size={16} /> Firmar y Entregar Herramienta
              </button>
            </form>
          </div>

          {/* Formulario Agregar Ítem */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Agregar Nuevo Material</h3>
            <form onSubmit={handleCreateItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nombre del Ítem</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ej. Alicates de Corte"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tipo de Ítem</label>
                <select className="form-select" value={newItemType} onChange={(e) => setNewItemType(e.target.value)}>
                  <option value="Consumible">Consumible (Repuesto)</option>
                  <option value="Herramienta">Herramienta (Prestable)</option>
                </select>
              </div>

              <div className="grid-two-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Existencias</label>
                  <input
                    type="number"
                    className="form-input"
                    value={newItemStock}
                    onChange={(e) => setNewItemStock(Number(e.target.value))}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mínimo Alerta</label>
                  <input
                    type="number"
                    className="form-input"
                    value={newItemStockMin}
                    onChange={(e) => setNewItemStockMin(Number(e.target.value))}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Plus size={16} /> Agregar al Catálogo
              </button>
            </form>
          </div>

        </div>
      </div>

      {/* Histórico de préstamos */}
      <div className="card">
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Registro de Préstamos Emitidos</h3>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Herramienta</th>
                <th>Entrega / Devolución</th>
                <th>Beneficiario</th>
                <th>Autorizado Por</th>
                <th>Estado</th>
                <th>Acciones de Taller</th>
              </tr>
            </thead>
            <tbody className="table-responsive-cards">
              {loans.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No se registran préstamos en el historial.</td>
                </tr>
              ) : (
                loans.map(loan => (
                  <tr key={loan.id}>
                    <td data-label="ID">{loan.id}</td>
                    <td data-label="Herramienta" style={{ fontWeight: '500' }}>{loan.herramienta?.nombre || 'Herramienta'}</td>
                    <td data-label="Entrega / Devolución" style={{ fontSize: '13px' }}>
                      <div>Prestado: {new Date(loan.fecha_prestamo).toLocaleDateString()}</div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Retorno: {loan.fecha_devolucion_real ? new Date(loan.fecha_devolucion_real).toLocaleDateString() : new Date(loan.fecha_devolucion_estimada).toLocaleDateString()}
                      </div>
                    </td>
                    <td data-label="Beneficiario">
                      <div style={{ fontWeight: '500' }}>{loan.beneficiario?.nombre} {loan.beneficiario?.apellido}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Cédula: {loan.beneficiario_cedula}</div>
                    </td>
                    <td data-label="Autorizado Por" style={{ fontSize: '13px' }}>
                      {loan.autorizador?.nombre} {loan.autorizador?.apellido}
                    </td>
                    <td data-label="Estado">
                      <span className={`badge badge-${loan.estado === 'Devuelto' ? 'media' : (loan.estado === 'Activo' ? 'alta' : 'critica')}`}
                            style={loan.estado === 'Devuelto' ? { background: 'var(--success-glow)', color: 'var(--success)' } : {}}>
                        {loan.estado}
                      </span>
                    </td>
                    <td data-label="Acciones">
                      {loan.estado === 'Activo' || loan.estado === 'Retrasado' ? (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button className="btn btn-success" onClick={() => handleReturnTool(loan.id)} style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw size={12} /> Retornar
                          </button>
                          <button className="btn btn-secondary" onClick={() => handleReportIncident(loan.id, 'Dañado')} style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={12} /> Dañado
                          </button>
                          <button className="btn btn-secondary" onClick={() => handleReportIncident(loan.id, 'Perdido')} style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <HelpCircle size={12} /> Perdido
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cerrado</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <SearchSelectModal
        isOpen={isToolModalOpen}
        onClose={() => setIsToolModalOpen(false)}
        title="Seleccionar Herramienta"
        placeholder="Buscar herramienta por nombre..."
        items={herramientas.filter(h => h.stock > 0)}
        searchFields={(h) => [h.nombre]}
        renderItem={(h) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{h.nombre}</strong>
            <span style={{ fontSize: '13px', color: 'var(--success)' }}>Disponibles: {h.stock} uds</span>
          </div>
        )}
        onSelect={(h) => setToolId(h.id)}
      />
    </div>
  );
};
export default Almacen;
