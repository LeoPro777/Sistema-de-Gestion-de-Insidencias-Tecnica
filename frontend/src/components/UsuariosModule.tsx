import React, { useState } from 'react';
import { GestionUsuarios } from './GestionUsuarios';
import { Aspirantes } from './Aspirantes';
import { Users, UserCheck } from 'lucide-react';

export const UsuariosModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'aspirantes'>('usuarios');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Módulo de Usuarios
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Gestione los usuarios del sistema, revise las solicitudes de los aspirantes y asigne roles técnicos o administrativos.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <button
          onClick={() => setActiveTab('usuarios')}
          className="btn btn-secondary"
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: activeTab === 'usuarios' ? '700' : '500',
            background: activeTab === 'usuarios' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
            borderColor: activeTab === 'usuarios' ? 'var(--primary)' : 'var(--border-color)',
            color: activeTab === 'usuarios' ? '#fff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Users size={16} />
          Gestión de Usuarios
        </button>
        <button
          onClick={() => setActiveTab('aspirantes')}
          className="btn btn-secondary"
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: activeTab === 'aspirantes' ? '700' : '500',
            background: activeTab === 'aspirantes' ? 'var(--primary-glow)' : 'rgba(255,255,255,0.02)',
            borderColor: activeTab === 'aspirantes' ? 'var(--primary)' : 'var(--border-color)',
            color: activeTab === 'aspirantes' ? '#fff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <UserCheck size={16} />
          Aspirantes
        </button>
      </div>

      <div>
        {activeTab === 'usuarios' && <GestionUsuarios />}
        {activeTab === 'aspirantes' && <Aspirantes />}
      </div>
    </div>
  );
};
