import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { Usuario, Rol, EstadoUsuario } from '../types';
import { useNotificationModal } from '../context/NotificationModalContext';
import { SearchSelectModal } from './SearchSelectModal';

export const GestionUsuarios: React.FC = () => {
  const { showAlert, showConfirm } = useNotificationModal();
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros y búsquedas
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Procesamiento
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reactivación con modal de búsqueda y selección
  const [selectedUserForReactivate, setSelectedUserForReactivate] = useState<Usuario | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const rolesList: Rol[] = ['Admin', 'Soporte Técnico', 'Técnico Hardware', 'Técnico Software'];

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Usuario[]>('/api/v1/auth/users');
      setUsers(data);
    } catch (err: any) {
      console.error(err);
      setError('No se pudo cargar la lista de personal del sistema.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: number, newRol: Rol) => {
    setSubmittingId(userId);
    setActionError(null);
    try {
      await api.post(`/api/v1/auth/users/${userId}/approve`, null, { rol: newRol });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, rol: newRol, estado: 'ACEPTADO' } : u));
      await showAlert('Rol Actualizado', 'Rol de usuario actualizado con éxito.');
    } catch (err: any) {
      const apiErr = err as ApiError;
      setActionError(apiErr.data?.detail || 'Error al cambiar de rol.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleSuspend = async (userId: number) => {
    const confirmed = await showConfirm(
      'Suspender Usuario',
      '¿Está seguro de suspender esta cuenta? Esto revocará de inmediato todas sus sesiones activas.'
    );
    if (!confirmed) return;

    setSubmittingId(userId);
    setActionError(null);
    try {
      await api.post(`/api/v1/auth/users/${userId}/suspend`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, estado: 'RECHAZADO' as EstadoUsuario } : u));
      await showAlert('Usuario Suspendido', 'Usuario suspendido y sesiones terminadas.');
    } catch (err: any) {
      const apiErr = err as ApiError;
      setActionError(apiErr.data?.detail || 'Error al suspender al usuario.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleReactivateClick = (user: Usuario) => {
    setSelectedUserForReactivate(user);
    setIsRoleModalOpen(true);
  };

  const handleRoleSelectedForReactivate = async (newRol: Rol) => {
    if (!selectedUserForReactivate) return;
    const user = selectedUserForReactivate;
    setSubmittingId(user.id);
    setActionError(null);
    try {
      await api.post(`/api/v1/auth/users/${user.id}/approve`, null, { rol: newRol });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, rol: newRol, estado: 'ACEPTADO' } : u));
      await showAlert('Usuario Reactivado', 'Usuario reactivado con éxito.');
    } catch (err: any) {
      const apiErr = err as ApiError;
      setActionError(apiErr.data?.detail || 'Error al reactivar al usuario.');
    } finally {
      setSubmittingId(null);
      setSelectedUserForReactivate(null);
    }
  };

  // Filtrado lógico
  const filteredUsers = users.filter(user => {
    const fullName = `${user.nombre} ${user.apellido}`.toLowerCase();
    const email = user.email.toLowerCase();
    const cedula = (user.cedula || '').toLowerCase();
    const searchMatch = fullName.includes(searchTerm.toLowerCase()) || 
                        email.includes(searchTerm.toLowerCase()) ||
                        cedula.includes(searchTerm.toLowerCase());

    const roleMatch = roleFilter === 'todos' || user.rol === roleFilter;
    const statusMatch = statusFilter === 'todos' || user.estado === statusFilter;

    return searchMatch && roleMatch && statusMatch;
  });

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
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>👤 Gestión de Usuarios</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Administra el personal activo del taller hospitalario, reasigna roles, y suspende o reactiva cuentas de usuario.
        </p>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {actionError && (
        <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '14px' }}>
          {actionError}
        </div>
      )}

      {/* Panel de Filtros */}
      <div className="card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px 20px', alignItems: 'center' }}>
        <div style={{ flex: 2, minWidth: '200px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por nombre, email o cédula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ margin: 0 }}
          />
        </div>

        <div style={{ flex: 1, minWidth: '150px' }}>
          <select 
            className="form-select" 
            value={roleFilter} 
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ margin: 0 }}
          >
            <option value="todos">Filtrar por Rol: Todos</option>
            <option value="Admin">Admin</option>
            <option value="Soporte Técnico">Soporte Técnico</option>
            <option value="Técnico Hardware">Técnico Hardware</option>
            <option value="Técnico Software">Técnico Software</option>
            <option value="Aspirante">Aspirante</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '150px' }}>
          <select 
            className="form-select" 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ margin: 0 }}
          >
            <option value="todos">Filtrar por Estado: Todos</option>
            <option value="ACEPTADO">ACEPTADO (Activo)</option>
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="RECHAZADO">RECHAZADO (Suspendido)</option>
          </select>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '16px' }}>Usuario</th>
              <th style={{ padding: '16px' }}>Cédula</th>
              <th style={{ padding: '16px' }}>Email</th>
              <th style={{ padding: '16px' }}>Rol Actual</th>
              <th style={{ padding: '16px' }}>Estado</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No se encontraron usuarios con los criterios de búsqueda provistos.
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => {
                const isUserActive = user.estado === 'ACEPTADO';
                const isPending = user.estado === 'PENDIENTE';
                const isSubmitting = submittingId === user.id;

                return (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)', background: isPending ? 'rgba(59, 130, 246, 0.01)' : 'transparent' }}>
                    <td style={{ padding: '16px', fontWeight: '500' }}>
                      {user.nombre} {user.apellido}
                    </td>
                    <td style={{ padding: '16px' }}>{user.cedula || 'No asociada'}</td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{user.email}</td>
                    <td style={{ padding: '16px' }}>
                      {isUserActive ? (
                        <select
                          className="form-select"
                          value={user.rol}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as Rol)}
                          disabled={isSubmitting}
                          style={{
                            margin: 0,
                            padding: '4px 8px',
                            fontSize: '13px',
                            background: 'rgba(255,255,255,0.02)',
                            width: 'auto'
                          }}
                        >
                          <option value="Admin">Admin</option>
                          <option value="Soporte Técnico">Soporte Técnico</option>
                          <option value="Técnico Hardware">Técnico Hardware</option>
                          <option value="Técnico Software">Técnico Software</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{user.rol}</span>
                      )}
                    </td>
                    <td style={{ padding: '16px' }}>
                      {user.estado === 'ACEPTADO' && (
                        <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                          ACTIVO
                        </span>
                      )}
                      {user.estado === 'PENDIENTE' && (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                          PENDIENTE
                        </span>
                      )}
                      {user.estado === 'RECHAZADO' && (
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                          SUSPENDIDO
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        {isUserActive ? (
                          <button
                            className="btn btn-danger"
                            onClick={() => handleSuspend(user.id)}
                            disabled={isSubmitting}
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            ⚠️ Suspender
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleReactivateClick(user)}
                            disabled={isSubmitting}
                            style={{ padding: '6px 12px', fontSize: '12px', background: '#16A34A', color: '#fff', borderColor: 'transparent' }}
                          >
                            ⚡ Reactivar / Aprobar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SearchSelectModal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedUserForReactivate(null);
        }}
        title="Seleccionar Rol de Usuario"
        placeholder="Buscar rol por nombre..."
        items={rolesList}
        searchFields={(r) => [r]}
        renderItem={(r) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{r}</strong>
          </div>
        )}
        onSelect={(r) => handleRoleSelectedForReactivate(r)}
      />
    </div>
  );
};

export default GestionUsuarios;
