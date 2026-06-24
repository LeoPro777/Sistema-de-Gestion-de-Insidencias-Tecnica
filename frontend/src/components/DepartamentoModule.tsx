import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { InventarioItem, PrestamoHerramienta } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNotificationModal } from '../context/NotificationModalContext';
import { 
  Package, 
  Search, 
  Plus, 
  Lock, 
  RefreshCw, 
  AlertTriangle, 
  HelpCircle, 
  Edit2, 
  Save, 
  X,
  FileCheck,
  TrendingDown,
  Wrench,
  Boxes
} from 'lucide-react';

interface InventoryStats {
  bajo_stock: {
    id: number;
    nombre: string;
    stock: number;
    stock_minimo: number;
    tipo: string;
  } | null;
  mas_usado: {
    id: number;
    nombre: string;
    total_usado: number;
    es_herramienta?: boolean;
  } | null;
}

export const DepartamentoModule: React.FC = () => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useNotificationModal();

  // Permisos
  const isAdminOrSoporte = user?.rol === 'Admin' || user?.rol === 'Soporte Técnico';

  // Estados de Datos
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [loans, setLoans] = useState<PrestamoHerramienta[]>([]);
  const [stats, setStats] = useState<InventoryStats>({ bajo_stock: null, mas_usado: null });
  const [loading, setLoading] = useState(true);

  // Detalle y Modales
  const [selectedItem, setSelectedItem] = useState<InventarioItem | null>(null);
  
  // Estados de Edición de Stock (Admin/Soporte)
  const [isEditing, setIsEditing] = useState(false);
  const [editStock, setEditStock] = useState(0);
  const [editStockMin, setEditStockMin] = useState(0);
  const [editLoading, setEditLoading] = useState(false);

  // Estados de Creación de Préstamo (Solo Herramienta)
  const [beneficiarioCedula, setBeneficiarioCedula] = useState('');
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanLoading, setLoanLoading] = useState(false);

  // Creación de Nuevo Material/Herramienta
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'Consumible' | 'Herramienta'>('Consumible');
  const [newStock, setNewStock] = useState(10);
  const [newStockMin, setNewStockMin] = useState(5);
  const [createLoading, setCreateLoading] = useState(false);

  // Búsqueda y Multi Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStockStatus, setFilterStockStatus] = useState<string>('all');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const cardsPerPage = 6;

  const loadData = async () => {
    setLoading(true);
    try {
      const [invList, activeLoans, statsData] = await Promise.all([
        api.get<InventarioItem[]>('/api/v1/inventory/items'),
        api.get<PrestamoHerramienta[]>('/api/v1/inventory/prestamos'),
        api.get<InventoryStats>('/api/v1/inventory/stats')
      ]);
      setItems(invList);
      setLoans(activeLoans);
      setStats(statsData);
    } catch (e) {
      console.error('Error cargando inventario del departamento', e);
    } finally {
      setLoading(false);
    }
  };

  const reloadLoansAndStats = async () => {
    try {
      const [activeLoans, statsData] = await Promise.all([
        api.get<PrestamoHerramienta[]>('/api/v1/inventory/prestamos'),
        api.get<InventoryStats>('/api/v1/inventory/stats')
      ]);
      setLoans(activeLoans);
      setStats(statsData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Manejar apertura de detalles
  const handleOpenDetails = (item: InventarioItem) => {
    setSelectedItem(item);
    setIsEditing(false);
    setEditStock(item.stock);
    setEditStockMin(item.stock_minimo);
    setBeneficiarioCedula('');
    setLoanError(null);
  };

  // Guardar edición de stock
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setEditLoading(true);
    try {
      const updated = await api.put<InventarioItem>(`/api/v1/inventory/items/${selectedItem.id}`, null, {
        stock: editStock.toString(),
        stock_minimo: editStockMin.toString()
      });
      setSelectedItem(updated);
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      setIsEditing(false);
      await showAlert('Éxito', 'Stock e inventario actualizados con éxito.');
      reloadLoansAndStats();
    } catch (err: any) {
      await showAlert('Error', err.data?.detail || 'No se pudo actualizar el stock.');
    } finally {
      setEditLoading(false);
    }
  };

  // Crear Préstamo (Solo para Herramientas)
  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoanError(null);
    if (!selectedItem) return;
    if (!beneficiarioCedula) {
      setLoanError('Ingrese la cédula del beneficiario.');
      return;
    }
    setLoanLoading(true);
    try {
      await api.post('/api/v1/inventory/prestamos', {
        herramienta_id: selectedItem.id,
        beneficiario_cedula: beneficiarioCedula
      });
      await showAlert('Préstamo Autorizado', 'Herramienta firmada y entregada.');
      setBeneficiarioCedula('');
      
      // Refrescar item actual
      const itemsList = await api.get<InventarioItem[]>('/api/v1/inventory/items');
      setItems(itemsList);
      const currentUpdated = itemsList.find(x => x.id === selectedItem.id);
      if (currentUpdated) setSelectedItem(currentUpdated);

      reloadLoansAndStats();
    } catch (err: any) {
      const apiErr = err as ApiError;
      setLoanError(apiErr.data?.detail || 'Error al procesar el préstamo.');
    } finally {
      setLoanLoading(false);
    }
  };

  // Retornar Herramienta
  const handleReturnTool = async (loanId: number) => {
    try {
      await api.post(`/api/v1/inventory/prestamos/${loanId}/return`);
      await showAlert('Devuelto', 'Herramienta reintegrada al stock físico.');
      
      // Refrescar catálogo
      const itemsList = await api.get<InventarioItem[]>('/api/v1/inventory/items');
      setItems(itemsList);
      if (selectedItem) {
        const currentUpdated = itemsList.find(x => x.id === selectedItem.id);
        if (currentUpdated) setSelectedItem(currentUpdated);
      }
      
      reloadLoansAndStats();
    } catch (err) {
      console.error(err);
    }
  };

  // Reportar Siniestro de Herramienta (Dañado/Perdido)
  const handleReportIncident = async (loanId: number, status: 'Dañado' | 'Perdido') => {
    const confirmed = await showConfirm(
      'Reportar Siniestro',
      `¿Está seguro de reportar esta herramienta como ${status.toUpperCase()}? Se generará una alarma inmediata para el administrador.`
    );
    if (!confirmed) return;

    try {
      await api.post(`/api/v1/inventory/prestamos/${loanId}/report`, null, {
        nuevo_estado: status
      });
      await showAlert('Reportado', `Siniestro catalogado. Alerta encolada.`);
      
      // Refrescar catálogo
      const itemsList = await api.get<InventarioItem[]>('/api/v1/inventory/items');
      setItems(itemsList);
      if (selectedItem) {
        const currentUpdated = itemsList.find(x => x.id === selectedItem.id);
        if (currentUpdated) setSelectedItem(currentUpdated);
      }

      reloadLoansAndStats();
    } catch (err) {
      console.error(err);
    }
  };

  // Crear Nuevo Item en el Catálogo
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) {
      await showAlert('Nombre Requerido', 'Debe ingresar el nombre del nuevo ítem.');
      return;
    }
    setCreateLoading(true);
    try {
      const created = await api.post<InventarioItem>('/api/v1/inventory/items', {
        nombre: newName,
        tipo: newType,
        stock: newStock,
        stock_minimo: newStockMin
      });
      await showAlert('Éxito', `${newType} agregado al inventario.`);
      setIsCreateOpen(false);
      setNewName('');
      setNewStock(10);
      setNewStockMin(5);
      loadData();
    } catch (err: any) {
      await showAlert('Error', err.data?.detail || 'No se pudo crear el ítem.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Filtrado de Inventario en Cliente
  const filteredItems = items.filter(i => {
    const matchesSearch = i.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || i.tipo === filterType;
    
    let matchesStockStatus = true;
    if (filterStockStatus === 'low') {
      matchesStockStatus = i.stock <= i.stock_minimo;
    } else if (filterStockStatus === 'safe') {
      matchesStockStatus = i.stock > i.stock_minimo;
    }

    return matchesSearch && matchesType && matchesStockStatus;
  });

  // Cálculo de Paginación
  const totalPages = Math.ceil(filteredItems.length / cardsPerPage);
  const indexOfLastCard = currentPage * cardsPerPage;
  const indexOfFirstCard = indexOfLastCard - cardsPerPage;
  const currentCards = filteredItems.slice(indexOfFirstCard, indexOfLastCard);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Filtrar préstamos de esta herramienta en particular
  const toolLoans = selectedItem ? loans.filter(l => l.herramienta_id === selectedItem.id) : [];

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
            Inventario de Almacén
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Controle el almacén de consumibles y administre préstamos autorizados de herramientas.
          </p>
        </div>

        {/* Crear activo (Admin/Soporte) */}
        {isAdminOrSoporte && (
          <button onClick={() => setIsCreateOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Agregar Material
          </button>
        )}
      </div>

      {/* Tarjetas Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div className="card card-primary-glow" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'var(--primary-glow)', padding: '12px', borderRadius: 'var(--radius-md)', color: 'var(--primary)' }}>
            <FileCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Producto Más Usado</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff', marginTop: '4px' }}>
              {stats.mas_usado ? `${stats.mas_usado.nombre} (${stats.mas_usado.total_usado} ${stats.mas_usado.es_herramienta ? 'préstamos' : 'uds'})` : 'Sin registros de uso'}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: stats.bajo_stock ? 'var(--danger-glow)' : 'var(--success-glow)', padding: '12px', borderRadius: 'var(--radius-md)', color: stats.bajo_stock ? 'var(--danger)' : 'var(--success)' }}>
            <TrendingDown size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Mayor Alerta de Stock</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: stats.bajo_stock ? 'var(--danger)' : 'var(--success)', marginTop: '4px' }}>
              {stats.bajo_stock ? `${stats.bajo_stock.nombre} (Stock: ${stats.bajo_stock.stock} uds)` : 'Todo en stock seguro'}
            </div>
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
              placeholder="Buscar material o herramienta por nombre..."
              className="form-input"
              style={{ paddingLeft: '40px' }}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>

          {/* Filtro de tipo */}
          <div style={{ minWidth: '180px' }}>
            <select 
              className="form-select" 
              value={filterType} 
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">Todos los Tipos</option>
              <option value="Consumible">Consumibles (Repuestos)</option>
              <option value="Herramienta">Herramientas (Prestables)</option>
            </select>
          </div>

          {/* Filtro de alerta de stock */}
          <div style={{ minWidth: '180px' }}>
            <select 
              className="form-select" 
              value={filterStockStatus} 
              onChange={(e) => { setFilterStockStatus(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">Cualquier Existencia</option>
              <option value="low">Alerta / Bajo Stock</option>
              <option value="safe">Stock Seguro</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grilla de Catálogo */}
      {currentCards.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', borderStyle: 'dashed' }}>
          No se encontraron materiales en el catálogo con los filtros seleccionados.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {currentCards.map(i => {
              const isLow = i.stock <= i.stock_minimo;
              const isTool = i.tipo === 'Herramienta';
              
              return (
                <div 
                  key={i.id} 
                  className="card" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '160px'
                  }}
                  onClick={() => handleOpenDetails(i)}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className={`badge ${isTool ? 'badge-media' : 'badge-baja'}`}
                            style={isTool ? { background: 'rgba(10, 88, 255, 0.12)', color: 'var(--primary)' } : {}}>
                        {i.tipo}
                      </span>
                      {isLow ? (
                        <span className="badge badge-critica">Alerta Reposición</span>
                      ) : (
                        <span className="badge badge-media" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>Stock Seguro</span>
                      )}
                    </div>
                    
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
                      {i.nombre}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Existencias: </span>
                      <strong style={{ fontSize: '14px', color: isLow ? 'var(--danger)' : '#fff' }}>{i.stock} uds</strong>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600' }}>
                      Gestionar →
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

      {/* MODAL DETALLES DEL MATERIAL */}
      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div 
            className="modal-content" 
            style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }} 
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Header */}
            <div className="modal-header">
              <div>
                <span className="badge badge-media" style={{ marginBottom: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>ID: #{selectedItem.id}</span>
                <h3 className="modal-title">{selectedItem.nombre}</h3>
              </div>
              <button onClick={() => setSelectedItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Existencias & Edición */}
              <div className="card" style={{ background: 'rgba(255,255,255,0.01)', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Control de Existencias
                  </h4>
                  {isAdminOrSoporte && !isEditing && (
                    <button 
                      onClick={() => setIsEditing(true)} 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 8px', fontSize: '11px', height: 'auto' }}
                    >
                      <Edit2 size={12} style={{ marginRight: '4px' }} /> Editar Stock
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Unidades en Almacén</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={editStock}
                          onChange={(e) => setEditStock(Number(e.target.value))}
                        />
                      </div>
                      
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Stock Mínimo (Alerta)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={editStockMin}
                          onChange={(e) => setEditStockMin(Number(e.target.value))}
                        />
                      </div>
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
                        {editLoading ? 'Guardando...' : 'Guardar Stock'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Tipo de Material:</strong> {selectedItem.tipo}</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Existencias Físicas:</strong> {selectedItem.stock} unidades</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Límite de Alerta:</strong> {selectedItem.stock_minimo} unidades</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Registrado:</strong> {new Date(selectedItem.created_at).toLocaleDateString()}</div>
                  </div>
                )}
              </div>

              {/* PROCEDIMIENTO DE PRÉSTAMO (Solo si es Herramienta) */}
              {selectedItem.tipo === 'Herramienta' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                  
                  {/* Autorizar Préstamo (Formulario) */}
                  {isAdminOrSoporte && selectedItem.stock > 0 && (
                    <div className="card card-primary-glow" style={{ padding: '16px', background: 'rgba(10, 88, 255, 0.02)' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Lock size={14} /> Autorizar Nuevo Préstamo de Herramienta
                      </h4>

                      {loanError && (
                        <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '12px', marginBottom: '12px' }}>
                          {loanError}
                        </div>
                      )}

                      <form onSubmit={handleCreateLoan} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '200px' }}>
                          <label className="form-label">Cédula del Beneficiario</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="ej. V-11111111"
                            value={beneficiarioCedula}
                            onChange={(e) => setBeneficiarioCedula(e.target.value)}
                          />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ height: '43px', fontSize: '12px' }} disabled={loanLoading}>
                          {loanLoading ? 'Procesando...' : 'Firmar Préstamo'}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Historial de Préstamos de esta Herramienta */}
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Wrench size={14} /> Registro de Préstamos Activos & Historial
                    </h4>
                    
                    {toolLoans.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                        No se registran solicitudes de préstamos de esta herramienta.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                        {toolLoans.map(loan => {
                          const isActive = loan.estado === 'Activo' || loan.estado === 'Retrasado';
                          return (
                            <div 
                              key={loan.id}
                              style={{
                                padding: '12px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--border-color)',
                                fontSize: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                <div>
                                  <strong>Prestado a:</strong> {loan.beneficiario?.nombre} {loan.beneficiario?.apellido} ({loan.beneficiario_cedula})
                                </div>
                                <span className={`badge ${loan.estado === 'Devuelto' ? 'badge-media' : 'badge-critica'}`}
                                      style={loan.estado === 'Devuelto' ? { background: 'var(--success-glow)', color: 'var(--success)' } : {}}>
                                  {loan.estado}
                                </span>
                              </div>

                              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                <span>Fecha Préstamo: {new Date(loan.fecha_prestamo).toLocaleDateString()}</span>
                                {loan.fecha_devolucion_real && <span style={{ marginLeft: '12px' }}>Devuelto el: {new Date(loan.fecha_devolucion_real).toLocaleDateString()}</span>}
                              </div>

                              {/* Acciones de taller (Retornar, Siniestro) si está activo */}
                              {isActive && isAdminOrSoporte && (
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                  <button 
                                    onClick={() => handleReturnTool(loan.id)}
                                    className="btn btn-success"
                                    style={{ padding: '4px 8px', fontSize: '11px', height: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <RefreshCw size={10} /> Retornar
                                  </button>
                                  <button 
                                    onClick={() => handleReportIncident(loan.id, 'Dañado')}
                                    className="btn btn-secondary"
                                    style={{ padding: '4px 8px', fontSize: '11px', height: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <AlertTriangle size={10} /> Dañado
                                  </button>
                                  <button 
                                    onClick={() => handleReportIncident(loan.id, 'Perdido')}
                                    className="btn btn-secondary"
                                    style={{ padding: '4px 8px', fontSize: '11px', height: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <HelpCircle size={10} /> Perdido
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedItem(null)}>Cerrar Ficha</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR ITEM */}
      {isCreateOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Agregar Material al Inventario</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateItem}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nombre del Material *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="ej. Pasta térmica Noctua NT-H1"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tipo de Activo *</label>
                  <select 
                    className="form-select"
                    value={newType}
                    onChange={(e: any) => setNewType(e.target.value)}
                  >
                    <option value="Consumible">Consumible (Repuesto de Uso Directo)</option>
                    <option value="Herramienta">Herramienta (Prestable a Empleados)</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Existencias Iniciales</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={newStock}
                      onChange={(e) => setNewStock(Number(e.target.value))}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Stock Mínimo Alerta</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={newStockMin}
                      onChange={(e) => setNewStockMin(Number(e.target.value))}
                    />
                  </div>
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createLoading}>
                  {createLoading ? 'Creando...' : 'Agregar Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default DepartamentoModule;
