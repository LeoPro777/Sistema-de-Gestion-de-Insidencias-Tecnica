import React, { useState } from 'react';
import { DispositivosModule } from './DispositivosModule';
import { DepartamentoModule } from './DepartamentoModule';
import { Laptop, Boxes } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const InventarioModule: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'dispositivos' | 'departamento'>('dispositivos');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Módulo de Inventario
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Administre el catálogo de dispositivos informáticos y controle el almacén de consumibles y herramientas.
        </p>
      </div>

      {/* Pill-like Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <button
          onClick={() => setActiveTab('dispositivos')}
          className="btn btn-secondary"
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: activeTab === 'dispositivos' ? '700' : '500',
            background: activeTab === 'dispositivos' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
            borderColor: activeTab === 'dispositivos' ? 'var(--primary)' : 'var(--border-color)',
            color: activeTab === 'dispositivos' ? '#fff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Laptop size={16} />
          Dispositivos
        </button>
        <button
          onClick={() => setActiveTab('departamento')}
          className="btn btn-secondary"
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: activeTab === 'departamento' ? '700' : '500',
            background: activeTab === 'departamento' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
            borderColor: activeTab === 'departamento' ? 'var(--primary)' : 'var(--border-color)',
            color: activeTab === 'departamento' ? '#fff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Boxes size={16} />
          Departamento
        </button>
      </div>

      {/* Content Rendering */}
      <div>
        {activeTab === 'dispositivos' && <DispositivosModule />}
        {activeTab === 'departamento' && <DepartamentoModule />}
      </div>
    </div>
  );
};
export default InventarioModule;
