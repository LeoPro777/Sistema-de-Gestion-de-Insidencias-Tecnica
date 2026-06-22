import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { loginSSO, loginBypass, error } = useAuth();
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSSO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setLoading(true);
    try {
      await loginSSO(emailInput);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBypass = async (email: string) => {
    setLoading(true);
    try {
      await loginBypass(email);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lock-screen" style={{ padding: '16px' }}>
      <div className="card lock-card card-primary-glow" style={{ width: '100%', maxWidth: '440px', padding: 'var(--card-padding, 32px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '0.05em', textAlign: 'center' }}>
            🏥 INFO-SOPORTE
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', lineHeight: '1.5' }}>
            Sistema Unificado de Incidencias, Control de Almacén y Control Patrimonial Hospitalario
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--danger-glow)',
            border: '1px solid var(--danger)',
            color: 'hsl(346, 84%, 60%)',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            textAlign: 'left',
            marginBottom: '16px'
          }}>
            <strong>Error:</strong> {typeof error === 'object' ? JSON.stringify(error) : error}
          </div>
        )}

        {/* Formulario SSO */}
        <form onSubmit={handleSSO} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '11px' }}>Correo Institucional SSO</label>
            <input
              id="sso-email-input"
              type="text"
              className="form-input"
              placeholder="ej. nombre.apellido@hospital.local"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              disabled={loading}
              style={{ fontSize: '14px', padding: '12px 16px' }}
            />
          </div>
          <button
            id="sso-submit-btn"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px 16px', fontSize: '14px', fontWeight: '600' }}
            disabled={loading}
          >
            {loading ? 'Procesando...' : 'Iniciar Sesión con Google SSO'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            O bypass de desarrollo
          </span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
        </div>

        {/* Botones de Bypass */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }} className="grid-two-cols">
          <button
            id="bypass-admin"
            className="btn btn-secondary"
            onClick={() => handleBypass('admin.soporte@hospital.local')}
            disabled={loading}
            style={{ padding: '10px 8px', fontSize: '12px', display: 'flex', justifyContent: 'flex-start' }}
          >
            🔑 Admin General
          </button>
          <button
            id="bypass-soporte"
            className="btn btn-secondary"
            onClick={() => handleBypass('freddy.perez@hospital.local')}
            disabled={loading}
            style={{ padding: '10px 8px', fontSize: '12px', display: 'flex', justifyContent: 'flex-start' }}
          >
            🛡️ Soporte Técnico
          </button>
          <button
            id="bypass-hw"
            className="btn btn-secondary"
            onClick={() => handleBypass('maria.gomez@hospital.local')}
            disabled={loading}
            style={{ padding: '10px 8px', fontSize: '12px', display: 'flex', justifyContent: 'flex-start' }}
          >
            🔧 Técnico Hardware
          </button>
          <button
            id="bypass-sw"
            className="btn btn-secondary"
            onClick={() => handleBypass('juan.rodriguez@hospital.local')}
            disabled={loading}
            style={{ padding: '10px 8px', fontSize: '12px', display: 'flex', justifyContent: 'flex-start' }}
          >
            💻 Técnico Software
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            id="bypass-new-user"
            className="btn btn-secondary"
            style={{ width: '100%', background: 'rgba(255, 255, 255, 0.02)', padding: '10px', fontSize: '12px', fontWeight: '500' }}
            onClick={() => handleBypass(`nuevo.aspirante.${Date.now()}@hospital.local`)}
            disabled={loading}
          >
            ✨ Simular Registro de Nuevo Aspirante
          </button>
        </div>
      </div>
    </div>
  );
};
