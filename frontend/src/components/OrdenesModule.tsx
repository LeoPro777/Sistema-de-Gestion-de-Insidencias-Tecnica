import React, { useState } from 'react';
import { PreOrdenes } from './PreOrdenes';
import { ActiveOrders } from './ActiveOrders';
import { Inbox, Kanban } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const OrdenesModule: React.FC = () => {
  const { user } = useAuth();
  
  // Si es Técnico de Hardware/Software, solo debe ver Órdenes (Kanban) y es su pestaña por defecto.
  const canViewPreOrdenes = user?.rol === 'Admin' || user?.rol === 'Soporte Técnico';
  const [activeTab, setActiveTab] = useState<'pre_ordenes' | 'ordenes'>(canViewPreOrdenes ? 'pre_ordenes' : 'ordenes');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Módulo de Órdenes
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Central de tickets e incidencias del hospital. Realice ingesta de reportes y haga seguimiento técnico en el tablero Kanban.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {canViewPreOrdenes && (
          <button
            onClick={() => setActiveTab('pre_ordenes')}
            className="btn btn-secondary"
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: activeTab === 'pre_ordenes' ? '700' : '500',
              background: activeTab === 'pre_ordenes' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
              borderColor: activeTab === 'pre_ordenes' ? 'var(--primary)' : 'var(--border-color)',
              color: activeTab === 'pre_ordenes' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Inbox size={16} />
            Pre-Órdenes
          </button>
        )}
        <button
          onClick={() => setActiveTab('ordenes')}
          className="btn btn-secondary"
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: activeTab === 'ordenes' ? '700' : '500',
            background: activeTab === 'ordenes' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
            borderColor: activeTab === 'ordenes' ? 'var(--primary)' : 'var(--border-color)',
            color: activeTab === 'ordenes' ? '#fff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Kanban size={16} />
          Órdenes
        </button>
      </div>

      <div>
        {activeTab === 'pre_ordenes' && canViewPreOrdenes && <PreOrdenes />}
        {activeTab === 'ordenes' && <ActiveOrders />}
      </div>
    </div>
  );
};
