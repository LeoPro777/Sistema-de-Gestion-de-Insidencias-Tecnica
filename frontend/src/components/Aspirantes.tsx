import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { Usuario, Rol } from '../types';
import { useNotificationModal } from '../context/NotificationModalContext';
import { UserPlus, Scale, Check, X } from 'lucide-react';

export const Aspirantes: React.FC = () => {
  const { showAlert, showConfirm } = useNotificationModal();
  const [aspirantes, setAspirantes] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);
  const [selectedRol, setSelectedRol] = useState<Rol>('Soporte Técnico');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAspirantes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Usuario[]>('/api/v1/auth/users/pending');
      // Filtrar por si acaso el backend devuelve algo que no esté PENDIENTE
      setAspirantes(data.filter(u => u.estado === 'PENDIENTE'));
    } catch (err: any) {
      console.error(err);
      setError('No se pudo cargar la lista de aspirantes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAspirantes();
  }, []);

  const handleOpenEvaluate = (user: Usuario) => {
    setSelectedUser(user);
    setSelectedRol('Soporte Técnico');
    setActionError(null);
  };

  const handleCloseEvaluate = () => {
    setSelectedUser(null);
    setActionError(null);
  };

  const handleApprove = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await api.post(`/api/v1/auth/users/${selectedUser.id}/approve`, null, { rol: selectedRol });
      setAspirantes(prev => prev.filter(u => u.id !== selectedUser.id));
      handleCloseEvaluate();
      await showAlert('Aprobado', `Usuario aprobado exitosamente como ${selectedRol}.`);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setActionError(apiErr.data?.detail || 'Error al aprobar al usuario.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedUser) return;
    const confirmed = await showConfirm(
      'Rechazar Solicitud',
      `¿Está seguro de rechazar la solicitud de ${selectedUser.nombre} ${selectedUser.apellido}?`
    );
    if (!confirmed) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await api.post(`/api/v1/auth/users/${selectedUser.id}/reject`);
      setAspirantes(prev => prev.filter(u => u.id !== selectedUser.id));
      handleCloseEvaluate();
      await showAlert('Rechazado', 'Solicitud rechazada con éxito.');
    } catch (err: any) {
      const apiErr = err as ApiError;
      setActionError(apiErr.data?.detail || 'Error al rechazar al usuario.');
    } finally {
      setSubmitting(false);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', padding: '12px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserPlus size={24} /> Solicitudes de Aspirantes
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Evalúa las solicitudes de registro del personal técnico y asígnales sus roles operacionales correspondientes.
        </p>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '16px' }}>Nombre Completo</th>
              <th style={{ padding: '16px' }}>Cédula</th>
              <th style={{ padding: '16px' }}>Email Institucional</th>
              <th style={{ padding: '16px' }}>Estado</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {aspirantes.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No hay solicitudes pendientes de evaluación en este momento.
                </td>
              </tr>
            ) : (
              aspirantes.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '16px', fontWeight: '500' }}>
                    {user.nombre} {user.apellido}
                  </td>
                  <td style={{ padding: '16px' }}>{user.cedula || 'No especificada'}</td>
                  <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{user.email}</td>
                  <td style={{ padding: '16px' }}>
                    <span className="badge badge-media" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                      {user.estado}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '6px 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => handleOpenEvaluate(user)}
                    >
                      <Scale size={14} /> Evaluar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Evaluación */}
      {selectedUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="card card-primary-glow" style={{
            width: '100%',
            maxWidth: '500px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            background: 'var(--bg-sidebar)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Evaluar Registro de Postulante</h3>
              <button 
                onClick={handleCloseEvaluate}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center' }}
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </div>

            {actionError && (
              <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                {actionError}
              </div>
            )}

            {/* Detalles del postulante */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                <strong>Postulante:</strong> {selectedUser.nombre} {selectedUser.apellido}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                <strong>Cédula:</strong> {selectedUser.cedula}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                <strong>Email:</strong> {selectedUser.email}
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Asignar Rol de Personal</label>
              <select 
                className="form-select" 
                value={selectedRol} 
                onChange={(e) => setSelectedRol(e.target.value as Rol)}
                disabled={submitting}
              >
                <option value="Soporte Técnico">Soporte Técnico (Supervisor / Mesa de Ayuda)</option>
                <option value="Técnico Hardware">Técnico Hardware (Taller / Campo)</option>
                <option value="Técnico Software">Técnico Software (Taller / Campo)</option>
                <option value="Admin">Administrador (Control total y variables)</option>
              </select>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                El rol asignado determinará los accesos y tableros disponibles para el usuario una vez aprobado.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, padding: '10px', background: '#16A34A', borderColor: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={handleApprove}
                disabled={submitting}
              >
                {submitting ? 'Aprobando...' : <><Check size={16} /> Aprobar Postulante</>}
              </button>
              <button 
                className="btn btn-danger" 
                style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={handleReject}
                disabled={submitting}
              >
                {submitting ? 'Rechazando...' : <><X size={16} /> Rechazar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Aspirantes;
