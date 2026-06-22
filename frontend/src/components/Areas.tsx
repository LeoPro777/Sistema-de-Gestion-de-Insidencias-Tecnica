import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { AreaHospital } from '../types';
import { useNotificationModal } from '../context/NotificationModalContext';

export const Areas: React.FC = () => {
  const { showAlert } = useNotificationModal();
  const [areas, setAreas] = useState<AreaHospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingArea, setEditingArea] = useState<AreaHospital | null>(null);

  // Form fields
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAreas = async () => {
    try {
      const data = await api.get<AreaHospital[]>('/api/v1/devices/areas');
      setAreas(data);
    } catch (e) {
      console.error('Error fetching areas', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAreas();
  }, []);

  const handleEditClick = (area: AreaHospital) => {
    setEditingArea(area);
    setNombre(area.nombre);
    setDescripcion(area.descripcion || '');
    setFormError(null);
  };

  const handleCancelEdit = () => {
    setEditingArea(null);
    setNombre('');
    setDescripcion('');
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setFormError('El nombre del área es requerido.');
      return;
    }
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingArea) {
        // Actualizar
        const updated = await api.put<AreaHospital>(`/api/v1/devices/areas/${editingArea.id}`, {
          nombre: nombre.trim(),
          descripcion: descripcion.trim()
        });
        setAreas(prev => prev.map(a => a.id === updated.id ? updated : a));
        await showAlert('Éxito', 'Área hospitalaria actualizada con éxito.');
        handleCancelEdit();
      } else {
        // Crear
        const created = await api.post<AreaHospital>('/api/v1/devices/areas', {
          nombre: nombre.trim(),
          descripcion: descripcion.trim()
        });
        setAreas(prev => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        await showAlert('Éxito', 'Área hospitalaria registrada con éxito.');
        setNombre('');
        setDescripcion('');
      }
    } catch (err: any) {
      setFormError(err.data?.detail || 'Error al procesar la solicitud.');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Áreas Hospitalarias</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Gestión centralizada del catálogo de dependencias y áreas del hospital.
        </p>
      </div>

      <div className="grid-asymmetric-right">
        {/* Listado de Áreas */}
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Áreas Registradas</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th>Fecha Registro</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody className="table-responsive-cards">
                {areas.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay áreas hospitalarias registradas.</td>
                  </tr>
                ) : (
                  areas.map(area => (
                    <tr key={area.id}>
                      <td data-label="Nombre" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{area.nombre}</td>
                      <td data-label="Descripción">{area.descripcion || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin descripción</span>}</td>
                      <td data-label="Registro" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {new Date(area.created_at).toLocaleDateString()}
                      </td>
                      <td data-label="Acciones" style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleEditClick(area)}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          ✏️ Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Formulario de Registro / Edición */}
        <div className="card card-primary-glow">
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
            {editingArea ? 'Editar Área Hospitalaria' : 'Nueva Área Hospitalaria'}
          </h3>

          {formError && (
            <div style={{
              background: 'var(--danger-glow)',
              border: '1px solid var(--danger)',
              color: 'hsl(346, 84%, 60%)',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: '16px'
            }}>
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre del Departamento</label>
              <input
                type="text"
                className="form-input"
                placeholder="ej. Emergencia Adultos, UCI..."
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Descripción</label>
              <textarea
                className="form-textarea"
                rows={4}
                placeholder="Describa el alcance físico, ubicación o criticidad..."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: editingArea ? 1.5 : 1 }}
                disabled={submitting}
              >
                {editingArea ? '💾 Guardar Cambios' : '➕ Registrar Área'}
              </button>
              {editingArea && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancelEdit}
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
export default Areas;
