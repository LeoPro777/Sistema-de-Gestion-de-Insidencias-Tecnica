import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { Orden, InventarioItem } from '../types';
import { useNotificationModal } from '../context/NotificationModalContext';
import { SearchSelectModal } from './SearchSelectModal';
import { RefreshCw, Pin, Zap, CheckCircle, XCircle, Wrench, CornerUpLeft, Flag, FileEdit, X, AlertTriangle, Save, Plus, Search, Trash2, Check } from 'lucide-react';

export const ActiveOrders: React.FC = () => {
  const { showAlert, showConfirm } = useNotificationModal();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [consumibles, setConsumibles] = useState<InventarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeColTab, setActiveColTab] = useState<'ASIGNADA' | 'EN_PROCESO' | 'RESUELTA' | 'RECHAZADA'>('ASIGNADA');
  
  // Modales y estados de formularios
  const [selectedOrden, setSelectedOrden] = useState<Orden | null>(null);
  const [diagnostico, setDiagnostico] = useState('');
  const [solucionParametrica, setSolucionParametrica] = useState('Mantenimiento correctivo químico y soldadura de componentes de hardware');
  const [consumiblesElegidos, setConsumiblesElegidos] = useState<Array<{ consumible_id: number; cantidad: number }>>([]);
  
  // Conflictos de stock (Borrador técnico)
  const [stockConflict, setStockConflict] = useState<any | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Selector de consumibles en modal de búsqueda
  const [activeConsumibleIdx, setActiveConsumibleIdx] = useState<number | null>(null);
  const [isConsumibleModalOpen, setIsConsumibleModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const ords = await api.get<Orden[]>('/api/v1/incidencias/active');
      const items = await api.get<InventarioItem[]>('/api/v1/inventory/items');
      setOrdenes(ords);
      setConsumibles(items.filter(i => i.tipo === 'Consumible'));
    } catch (e) {
      console.error('Error cargando órdenes activas', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Verificar si una orden excede los límites de envejecimiento (Aging)
  const isAgingAlert = (createdAt: string, urgencia: string) => {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (urgencia === 'Crítica') return diffHours > 1; // 1 Hora
    if (urgencia === 'Alta') return diffHours > 4;    // 4 Horas
    if (urgencia === 'Media') return diffHours > 24;  // 24 Horas
    if (urgencia === 'Baja') return diffHours > 48;   // 48 Horas
    return false;
  };

  const handleUpdateStatus = async (ordenId: number, nextStatus: 'EN_PROCESO') => {
    try {
      setOrdenes(prev => prev.map(o => o.id === ordenId ? { ...o, estado: nextStatus } : o));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRevert = async (ordenId: number) => {
    const confirmed = await showConfirm(
      'Devolver Orden',
      '¿Está seguro de devolver esta orden a la bandeja de Soporte Técnico? Se marcará como Rechazada y volverá al buzón de entrada.'
    );
    if (!confirmed) return;
    try {
      await api.post(`/api/v1/incidencias/active/${ordenId}/revert`);
      setOrdenes(prev => prev.filter(o => o.id !== ordenId));
      await showAlert('Devuelto', 'Ticket devuelto exitosamente a Soporte.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenCloseModal = (orden: Orden) => {
    setSelectedOrden(orden);
    setStockConflict(null);
    
    // Comprobar si hay un borrador guardado localmente para esta orden
    const draftStr = localStorage.getItem(`draft_orden_${orden.id}`);
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        setDiagnostico(draft.diagnostico);
        setSolucionParametrica(draft.solucion_parametrica);
        setConsumiblesElegidos(draft.consumibles_utilizados);
        setHasDraft(true);
      } catch {
        setDiagnostico('');
        setConsumiblesElegidos([]);
        setHasDraft(false);
      }
    } else {
      setDiagnostico('');
      setSolucionParametrica('Mantenimiento correctivo de soldaduras y pines');
      setConsumiblesElegidos([]);
      setHasDraft(false);
    }
  };

  const handleAddConsumible = () => {
    setConsumiblesElegidos(prev => [...prev, { consumible_id: consumibles[0]?.id || 0, cantidad: 1 }]);
  };

  const handleRemoveConsumible = (idx: number) => {
    setConsumiblesElegidos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateConsumibleItem = (idx: number, field: string, val: any) => {
    setConsumiblesElegidos(prev => prev.map((item, i) => {
      if (i === idx) {
        return { ...item, [field]: val };
      }
      return item;
    }));
  };

  const handleCloseOrderSubmit = async () => {
    if (!selectedOrden) return;
    setStockConflict(null);

    const payload = {
      diagnostico,
      solucion_parametrica: solucionParametrica,
      consumibles_utilizados: consumiblesElegidos
    };

    try {
      await api.put(`/api/v1/incidencias/active/${selectedOrden.id}/close`, payload);
      
      // Quitar de la lista local
      setOrdenes(prev => prev.filter(o => o.id !== selectedOrden.id));
      // Limpiar borrador si existía
      localStorage.removeItem(`draft_orden_${selectedOrden.id}`);
      setSelectedOrden(null);
      await showAlert('Éxito', 'Orden de servicio cerrada y archivada con éxito.');
    } catch (err: any) {
      const apiErr = err as ApiError;
      
      // Capturar conflicto de stock (HTTP 409)
      if (apiErr.status === 409) {
        setStockConflict(apiErr.data?.detail || apiErr.data);
      } else {
        await showAlert('Error', apiErr.message || 'Error al cerrar el ticket');
      }
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedOrden) return;
    
    const draftPayload = {
      diagnostico,
      solucion_parametrica: solucionParametrica,
      consumibles_utilizados: consumiblesElegidos
    };

    localStorage.setItem(`draft_orden_${selectedOrden.id}`, JSON.stringify(draftPayload));
    await showAlert('Borrador Guardado', 'Borrador técnico guardado con éxito en caché local. Puede reintentar el cierre cuando se reponga el almacén.');
    setSelectedOrden(null);
  };

  // Clasificar órdenes en las 4 columnas Kanban
  const getColOrders = (statusName: string) => {
    return ordenes.filter(o => o.estado === statusName);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Taller Técnico (Kanban)</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Despacho de incidencias asignadas. El parpadeo de tarjetas indica tickets excedidos en su tiempo operativo (Aging).
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><RefreshCw size={14} /> Refrescar Tablero</button>
      </div>

      {/* Selector de pestañas móvil para el Kanban */}
      <div className="mobile-kanban-tabs" style={{ display: 'none', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
        <button 
          className="btn" 
          onClick={() => setActiveColTab('ASIGNADA')}
          style={{ 
            flex: 1, 
            background: activeColTab === 'ASIGNADA' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
            borderColor: activeColTab === 'ASIGNADA' ? 'var(--primary)' : 'var(--border-color)',
            color: '#fff',
            fontSize: '12px',
            whiteSpace: 'nowrap'
          }}
        >
          <Pin size={12} /> Asignadas ({getColOrders('ASIGNADA').length})
        </button>
        <button 
          className="btn" 
          onClick={() => setActiveColTab('EN_PROCESO')}
          style={{ 
            flex: 1, 
            background: activeColTab === 'EN_PROCESO' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
            borderColor: activeColTab === 'EN_PROCESO' ? 'var(--primary)' : 'var(--border-color)',
            color: '#fff',
            fontSize: '12px',
            whiteSpace: 'nowrap'
          }}
        >
          <Zap size={12} /> En Proceso ({getColOrders('EN_PROCESO').length})
        </button>
        <button 
          className="btn" 
          onClick={() => setActiveColTab('RESUELTA')}
          style={{ 
            flex: 1, 
            background: activeColTab === 'RESUELTA' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
            borderColor: activeColTab === 'RESUELTA' ? 'var(--primary)' : 'var(--border-color)',
            color: '#fff',
            fontSize: '12px',
            whiteSpace: 'nowrap'
          }}
        >
          <CheckCircle size={12} /> Cerradas ({getColOrders('RESUELTA').length})
        </button>
        <button 
          className="btn" 
          onClick={() => setActiveColTab('RECHAZADA')}
          style={{ 
            flex: 1, 
            background: activeColTab === 'RECHAZADA' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
            borderColor: activeColTab === 'RECHAZADA' ? 'var(--primary)' : 'var(--border-color)',
            color: '#fff',
            fontSize: '12px',
            whiteSpace: 'nowrap'
          }}
        >
          <XCircle size={12} /> Rechazadas ({getColOrders('RECHAZADA').length})
        </button>
      </div>

      {/* Tablero Kanban */}
      <div className="kanban-board" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', minHeight: '600px', alignItems: 'start' }}>
        
        {/* COLUMNA: ASIGNADA */}
        <div className={`card kanban-col ${activeColTab === 'ASIGNADA' ? 'active' : ''}`} style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}><Pin size={14} /> Asignadas</h4>
            <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>
              {getColOrders('ASIGNADA').length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '400px' }}>
            {getColOrders('ASIGNADA').map(o => {
              const isAging = isAgingAlert(o.created_at, o.pre_orden?.urgencia || 'Media');
              return (
                <div 
                  key={o.id} 
                  className={`card ${isAging ? 'pulse-warning' : ''}`}
                  style={{ 
                    padding: '16px', 
                    background: 'rgba(16, 20, 35, 0.9)', 
                    borderColor: isAging ? 'var(--danger)' : 'var(--border-color)' 
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className={`badge badge-${(o.pre_orden?.urgencia || 'Media').toLowerCase()}`}>{o.pre_orden?.urgencia || 'Media'}</span>
                    {isAging && <span className="badge badge-critica" style={{ fontSize: '9px' }}>Aging Excedido</span>}
                  </div>

                  <h5 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '6px' }}>
                    {o.dispositivo.codigo_activo} ({o.dispositivo.marca})
                  </h5>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {o.pre_orden?.resumen || 'Reporte manual'}
                  </p>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={() => handleUpdateStatus(o.id, 'EN_PROCESO')} style={{ flex: 1, padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Wrench size={12} /> Iniciar
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleRevert(o.id)} style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <CornerUpLeft size={12} /> Devolver
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA: EN PROCESO */}
        <div className={`card kanban-col ${activeColTab === 'EN_PROCESO' ? 'active' : ''}`} style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={14} /> En Proceso</h4>
            <span style={{ background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>
              {getColOrders('EN_PROCESO').length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '400px' }}>
            {getColOrders('EN_PROCESO').map(o => {
              const isAging = isAgingAlert(o.created_at, o.pre_orden?.urgencia || 'Media');
              const hasLocalDraft = localStorage.getItem(`draft_orden_${o.id}`) !== null;
              return (
                <div 
                  key={o.id} 
                  className={`card ${isAging ? 'pulse-warning' : ''}`}
                  style={{ 
                    padding: '16px', 
                    background: 'rgba(16, 20, 35, 0.9)', 
                    borderColor: hasLocalDraft ? 'var(--warning)' : (isAging ? 'var(--danger)' : 'var(--border-color)') 
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className={`badge badge-${(o.pre_orden?.urgencia || 'Media').toLowerCase()}`}>{o.pre_orden?.urgencia || 'Media'}</span>
                    {hasLocalDraft && <span className="badge badge-alta" style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '2px' }}><FileEdit size={10} /> Borrador</span>}
                  </div>

                  <h5 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '6px' }}>
                    {o.dispositivo.codigo_activo} ({o.dispositivo.marca})
                  </h5>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {o.pre_orden?.resumen || 'Reporte manual'}
                  </p>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-success" onClick={() => handleOpenCloseModal(o)} style={{ flex: 1, padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Flag size={12} /> Cerrar
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleRevert(o.id)} style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <CornerUpLeft size={12} /> Devolver
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA: RESUELTA */}
        <div className={`card kanban-col ${activeColTab === 'RESUELTA' ? 'active' : ''}`} style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={14} /> Resueltas</h4>
            <span style={{ background: 'var(--success-glow)', color: 'var(--success)', padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>
              {getColOrders('RESUELTA').length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '400px' }}>
            {getColOrders('RESUELTA').map(o => (
              <div key={o.id} className="card" style={{ padding: '14px', background: 'rgba(34, 197, 94, 0.02)', borderColor: 'rgba(34, 197, 94, 0.2)' }}>
                <h5 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{o.dispositivo.codigo_activo}</h5>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{o.solucion_parametrica}</p>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Cerrado: {new Date(o.closed_at || '').toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* COLUMNA: RECHAZADA */}
        <div className={`card kanban-col ${activeColTab === 'RECHAZADA' ? 'active' : ''}`} style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}><XCircle size={14} /> Rechazadas</h4>
            <span style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>
              {getColOrders('RECHAZADA').length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '400px' }}>
            {getColOrders('RECHAZADA').map(o => (
              <div key={o.id} className="card" style={{ padding: '14px', background: 'rgba(239, 68, 68, 0.02)', borderColor: 'rgba(239, 68, 68, 0.15)' }}>
                <h5 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>{o.dispositivo.codigo_activo}</h5>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Devuelto / Cancelado</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* MODAL DE CIERRE TÉCNICO */}
      {selectedOrden && (
        <div className="lock-screen" style={{ zIndex: 500 }}>
          <div className="card card-primary-glow" style={{ maxWidth: '600px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>
                Formulario de Cierre: {selectedOrden.dispositivo.codigo_activo}
              </h3>
              <button className="btn btn-secondary" onClick={() => setSelectedOrden(null)} style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}><X size={12} /> Cerrar</button>
            </div>

            {stockConflict && (
              <div style={{ 
                background: 'var(--danger-glow)', 
                border: '1px solid var(--danger)', 
                color: 'hsl(346, 84%, 60%)', 
                padding: '16px', 
                borderRadius: 'var(--radius-md)', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px',
                textAlign: 'left'
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> Desabastecimiento en Almacén</h4>
                <p style={{ fontSize: '13px' }}>
                  El material <strong>{stockConflict.details?.nombre_solicitado || 'solicitado'}</strong> no posee stock suficiente.
                </p>
                <div style={{ fontSize: '12px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
                  <li>Stock Disponible: {stockConflict.details?.stock_disponible} uds</li>
                  <li>Solicitado para Cierre: {stockConflict.details?.cantidad_solicitada} uds</li>
                </div>
                <button className="btn btn-primary" onClick={handleSaveDraft} style={{ background: 'var(--warning)', color: '#000', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Save size={14} /> Guardar como Borrador Técnico
                </button>
              </div>
            )}

            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Diagnóstico de Falla Encontrado</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Describa el estado del equipo y la falla de campo encontrada..."
                  value={diagnostico}
                  onChange={(e) => setDiagnostico(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Solución Paramétrica Aplicada</label>
                <select className="form-select" value={solucionParametrica} onChange={(e) => setSolucionParametrica(e.target.value)}>
                  <option value="Mantenimiento correctivo químico y soldadura de componentes de hardware">Mantenimiento correctivo químico y soldadura de componentes de hardware</option>
                  <option value="Reemplazo de conector RJ45 y ponchado de cables UTP">Reemplazo de conector RJ45 y ponchado de cables UTP</option>
                  <option value="Limpieza y cambio de pasta térmica en procesador">Limpieza y cambio de pasta térmica en procesador</option>
                  <option value="Formateo e instalación de Sistema Operativo institucional">Formateo e instalación de Sistema Operativo institucional</option>
                </select>
              </div>

              {/* Sección de consumibles */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700' }}>Repuestos / Consumibles Utilizados</h4>
                  <button className="btn btn-secondary" onClick={handleAddConsumible} style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={12} /> Añadir Material
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {consumiblesElegidos.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button 
                        type="button"
                        className="form-select"
                        style={{ flex: 2, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onClick={() => {
                          setActiveConsumibleIdx(idx);
                          setIsConsumibleModalOpen(true);
                        }}
                      >
                        {item.consumible_id 
                          ? (() => {
                              const c = consumibles.find(x => x.id === item.consumible_id);
                              return c ? `${c.nombre} (Stock: ${c.stock})` : '-- Seleccionar Material --';
                            })()
                          : '-- Seleccionar Material --'}
                        <span><Search size={14} /></span>
                      </button>
                      
                      <input 
                        type="number" 
                        className="form-input" 
                        value={item.cantidad} 
                        onChange={(e) => handleUpdateConsumibleItem(idx, 'cantidad', Number(e.target.value))}
                        style={{ flex: 1, textAlign: 'center' }}
                        min={1}
                      />

                      <button className="btn btn-danger" onClick={() => handleRemoveConsumible(idx)} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button className="btn btn-success" onClick={handleCloseOrderSubmit} style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Check size={16} /> Confirmar Cierre de Incidencia
                </button>
                {hasDraft && (
                  <button className="btn btn-secondary" onClick={async () => {
                    localStorage.removeItem(`draft_orden_${selectedOrden.id}`);
                    setHasDraft(false);
                    await showAlert('Descartado', 'Borrador local descartado.');
                  }}>
                    Borrar Borrador
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      <SearchSelectModal
        isOpen={isConsumibleModalOpen}
        onClose={() => {
          setIsConsumibleModalOpen(false);
          setActiveConsumibleIdx(null);
        }}
        title="Seleccionar Material / Consumible"
        placeholder="Buscar por nombre..."
        items={consumibles}
        searchFields={(c) => [c.nombre]}
        renderItem={(c) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{c.nombre}</strong>
            <span style={{ fontSize: '13px', color: 'var(--success)' }}>Stock: {c.stock} uds</span>
          </div>
        )}
        onSelect={(c) => {
          if (activeConsumibleIdx !== null) {
            handleUpdateConsumibleItem(activeConsumibleIdx, 'consumible_id', c.id);
          }
        }}
      />
    </div>
  );
};
export default ActiveOrders;
