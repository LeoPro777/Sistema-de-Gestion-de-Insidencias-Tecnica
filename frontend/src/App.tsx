import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationModalProvider } from './context/NotificationModalContext';
import { useWebSocket } from './hooks/useWebSocket';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { UsuariosModule } from './components/UsuariosModule';
import { OrdenesModule } from './components/OrdenesModule';
import { InventarioModule } from './components/InventarioModule';
import { Configuracion } from './components/Configuracion';
import { Areas } from './components/Areas';
import { Reportes } from './components/Reportes';
import { Auditoria } from './components/Auditoria';
import { api } from './services/api';
import { AlertaSistema } from './types';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Kanban, 
  Package, 
  FileText, 
  History, 
  Settings, 
  LogOut,
  Hospital,
  Bell,
  Menu,
  X,
  Check,
  Laptop,
  Boxes
} from 'lucide-react';

// --- SUBFORMULARIO: REGISTRO INICIAL DE ASPIRANTE ---
const AspiranteRegisterForm: React.FC = () => {
  const { registerAspirante, logout, user } = useAuth();
  const [cedula, setCedula] = useState('');
  const [nombre, setNombre] = useState(user?.nombre || '');
  const [apellido, setApellido] = useState(user?.apellido || '');
  const [regError, setRegError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cedula || !nombre || !apellido) {
      setRegError('Complete todos los campos del formulario.');
      return;
    }
    setSubmitting(true);
    setRegError(null);
    try {
      await registerAspirante(cedula, nombre, apellido);
    } catch (err: any) {
      setRegError(err.data?.detail || 'No se pudo registrar la solicitud. Verifique que su cédula esté registrada en RRHH.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lock-screen">
      <div className="card lock-card card-primary-glow" style={{ padding: '32px', textAlign: 'left' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Registro de Postulante de Soporte
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
          Su correo institucional no tiene un rol asignado. Complete su postulación vinculando su Cédula registrada en nómina de RRHH.
        </p>

        {regError && (
          <div style={{ background: 'var(--danger-glow)', border: '1px solid var(--danger)', color: 'hsl(346, 84%, 60%)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: '16px' }}>
            {regError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Cédula del Empleado</label>
            <input
              type="text"
              className="form-input"
              placeholder="ej. V-11111111"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre</label>
              <input
                type="text"
                className="form-input"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Apellido</label>
              <input
                type="text"
                className="form-input"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={submitting}>
              {submitting ? 'Procesando...' : 'Enviar Postulación'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={logout} style={{ flex: 1 }} disabled={submitting}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- CONTENEDOR PRINCIPAL DEL CLIENTE ---
const MainApp: React.FC = () => {
  const { user, token, logout, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Alertas / Notificaciones
  const [alerts, setAlerts] = useState<AlertaSistema[]>([]);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fetchAlerts = async () => {
    if (!token || !user) return;
    try {
      const data = await api.get<AlertaSistema[]>('/api/v1/system/alerts');
      setAlerts(data);
    } catch (e) {
      console.error('Error fetching system alerts', e);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [token, user]);

  // Activar WebSocket del taller técnico
  const { connected, reconnecting } = useWebSocket((msg) => {
    // Al recibir cualquier evento, refrescar las alertas
    fetchAlerts();
    
    // Toast en consola o alertas nativas de prioridad
    if (msg.event === 'new_pre_orden') {
      console.log(`WebSocket: Nueva incidencia [${msg.urgencia.toUpperCase()}] en ${msg.area}`);
    } else if (msg.event === 'admin_alert') {
      console.log(`WebSocket: Alarma Admin: ${msg.mensaje}`);
    }
  });

  const handleMarkRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post(`/api/v1/system/alerts/${id}/read`);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="lock-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  // 1. Redirección si no está logueado
  if (!token || !user) {
    return <Login />;
  }

  // 2. Redirección si es Aspirante Nuevo sin Cédula registrada
  if (user.estado === 'PENDIENTE' && !user.cedula) {
    return <AspiranteRegisterForm />;
  }

  // 3. Redirección si está PENDIENTE de aprobación (Lock Screen)
  if (user.estado === 'PENDIENTE') {
    return (
      <div className="lock-screen">
        <div className="card lock-card card-primary-glow" style={{ padding: '40px' }}>
          <div className="spinner"></div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
            Solicitud de Acceso en Trámite
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
            Su solicitud de acceso para el taller de soporte informático se encuentra en proceso de validación por la administración del hospital.
          </p>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'left' }}>
            <strong>Usuario registrado:</strong> {user.email} <br />
            <strong>Cédula asociada:</strong> {user.cedula} <br />
            <strong>Estado actual:</strong> PENDIENTE DE APROBACIÓN
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Esta pantalla se actualizará automáticamente en tiempo real una vez sea aprobado.
          </div>
          <button className="btn btn-secondary" onClick={logout} style={{ marginTop: '12px' }}>
            Salir de la Cuenta
          </button>
        </div>
      </div>
    );
  }

  // 4. Redirección si fue rechazado
  if (user.estado === 'RECHAZADO') {
    return (
      <div className="lock-screen">
        <div className="card lock-card" style={{ padding: '40px', borderColor: 'var(--danger)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'hsl(346, 84%, 60%)' }}>
            Acceso Denegado / Rechazado
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Su solicitud de soporte ha sido rechazada o su sesión ha sido suspendida por la administración.
          </p>
          <button className="btn btn-primary" onClick={logout}>
            Entrar con otra Cuenta
          </button>
        </div>
      </div>
    );
  }

  // Helper para verificar roles permitidos en pestañas
  const isAllowed = (roles: string[]) => roles.includes(user.rol);

  // Renderizar la pestaña seleccionada
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return isAllowed(['Admin', 'Soporte Técnico']) ? <Dashboard /> : <OrdenesModule />;
      case 'areas':
        return isAllowed(['Admin']) ? <Areas /> : <div>Acceso denegado</div>;
      case 'ordenes':
        return <OrdenesModule />;
      case 'inventario':
        return <InventarioModule />;
      case 'reportes':
        return isAllowed(['Admin', 'Soporte Técnico']) ? <Reportes /> : <div>Acceso denegado</div>;
      case 'auditoria':
        return isAllowed(['Admin']) ? <Auditoria /> : <div>Acceso denegado</div>;
      case 'configuracion':
        return isAllowed(['Admin']) ? <Configuracion /> : <div>Acceso denegado</div>;
      case 'usuarios':
        return isAllowed(['Admin']) ? <UsuariosModule /> : <div>Acceso denegado</div>;
      default:
        return <Dashboard />;
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsSidebarOpen(false); // Cerrar sidebar en dispositivos móviles
    setIsAlertsOpen(false);  // Cerrar panel de alertas al navegar
    setIsSettingsOpen(false); // Cerrar panel de configuración al navegar
  };

  return (
    <div className="app-container">
      {/* Overlay para móviles */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Barra de navegación lateral (Sidebar) */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Hospital size={20} /> MONOLITO INFRA
            </h1>
            {/* Cerrar Sidebar en Móvil */}
            <button 
              className="hamburger-btn" 
              onClick={() => setIsSidebarOpen(false)}
              style={{ display: 'none' }} // Sobrescrito por media queries
            >
              <X size={20} />
            </button>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>
            Rol: {user.rol}
          </span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
          {isAllowed(['Admin', 'Soporte Técnico']) && (
            <button
              className="btn btn-secondary"
              onClick={() => handleTabChange('dashboard')}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: activeTab === 'dashboard' ? 'var(--primary-glow)' : 'transparent',
                borderColor: activeTab === 'dashboard' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'dashboard' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              <LayoutDashboard size={18} color={activeTab === 'dashboard' ? 'var(--primary)' : 'var(--text-secondary)'} />
              Dashboard
            </button>
          )}

          {isAllowed(['Admin']) && (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => handleTabChange('areas')}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: activeTab === 'areas' ? 'var(--primary-glow)' : 'transparent',
                  borderColor: activeTab === 'areas' ? 'var(--primary)' : 'transparent',
                  color: activeTab === 'areas' ? '#fff' : 'var(--text-secondary)'
                }}
              >
                <Building2 size={18} color={activeTab === 'areas' ? 'var(--primary)' : 'var(--text-secondary)'} />
                Áreas
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleTabChange('usuarios')}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: activeTab === 'usuarios' ? 'var(--primary-glow)' : 'transparent',
                  borderColor: activeTab === 'usuarios' ? 'var(--primary)' : 'transparent',
                  color: activeTab === 'usuarios' ? '#fff' : 'var(--text-secondary)'
                }}
              >
                <Users size={18} color={activeTab === 'usuarios' ? 'var(--primary)' : 'var(--text-secondary)'} />
                Usuarios
              </button>
            </>
          )}

          <button
            className="btn btn-secondary"
            onClick={() => handleTabChange('ordenes')}
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: activeTab === 'ordenes' ? 'var(--primary-glow)' : 'transparent',
              borderColor: activeTab === 'ordenes' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'ordenes' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            <Kanban size={18} color={activeTab === 'ordenes' ? 'var(--primary)' : 'var(--text-secondary)'} />
            Órdenes
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => handleTabChange('inventario')}
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: activeTab === 'inventario' ? 'var(--primary-glow)' : 'transparent',
              borderColor: activeTab === 'inventario' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'inventario' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            <Package size={18} color={activeTab === 'inventario' ? 'var(--primary)' : 'var(--text-secondary)'} />
            Inventario
          </button>

          {isAllowed(['Admin', 'Soporte Técnico']) && (
            <button
              className="btn btn-secondary"
              onClick={() => handleTabChange('reportes')}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: activeTab === 'reportes' ? 'var(--primary-glow)' : 'transparent',
                borderColor: activeTab === 'reportes' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'reportes' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              <FileText size={18} color={activeTab === 'reportes' ? 'var(--primary)' : 'var(--text-secondary)'} />
              Reportes
            </button>
          )}

          {isAllowed(['Admin']) && (
            <button
              className="btn btn-secondary"
              onClick={() => handleTabChange('auditoria')}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: activeTab === 'auditoria' ? 'var(--primary-glow)' : 'transparent',
                borderColor: activeTab === 'auditoria' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'auditoria' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              <History size={18} color={activeTab === 'auditoria' ? 'var(--primary)' : 'var(--text-secondary)'} />
              Auditoría
            </button>
          )}


        </nav>

        {/* Footer Sidebar */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: '500' }}>
              {user.nombre} {user.apellido[0]}.
            </span>
            {/* Indicador de WebSocket Red */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span 
                className={`pulse-warning`} 
                style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: reconnecting ? 'var(--warning)' : (connected ? '#10B981' : 'var(--danger)')
                }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {reconnecting ? 'Reconectando...' : (connected ? 'Online' : 'Offline')}
              </span>
            </div>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={logout} 
            style={{ 
              width: '100%', 
              borderColor: 'var(--danger)', 
              color: 'hsl(346, 84%, 60%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </aside>

      {/* Contenedor Principal */}
      <main className="main-content">
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Botón Hamburguesa en Móvil */}
            <button 
              className="hamburger-btn" 
              onClick={() => setIsSidebarOpen(true)}
              style={{ display: 'flex' }}
            >
              <Menu size={20} />
            </button>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Hospital General Informática
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Centro de Notificaciones Alertas (Módulo 9) */}
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => {
                  setIsAlertsOpen(!isAlertsOpen);
                  setIsSettingsOpen(false);
                }} 
                className="btn btn-secondary"
                style={{ 
                  padding: '8px 12px', 
                  position: 'relative',
                  background: isAlertsOpen ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderColor: isAlertsOpen ? 'var(--primary)' : 'var(--border-color)'
                }}
                title="Alertas del Sistema"
              >
                <Bell size={18} />
                {alerts.length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: 'var(--danger)',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: '700',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {alerts.length}
                  </span>
                )}
              </button>

              {/* Dropdown de Alertas */}
              {isAlertsOpen && (
                <div style={{
                  position: 'absolute',
                  top: '120%',
                  right: 0,
                  width: '320px',
                  maxHeight: '400px',
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 300,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: '700', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Notificaciones ({alerts.length})</span>
                    <button 
                      onClick={() => setIsAlertsOpen(false)} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                    >
                      Cerrar
                    </button>
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {alerts.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        No tienes alertas pendientes de leer.
                      </div>
                    ) : (
                      alerts.map(a => (
                        <div 
                          key={a.id} 
                          style={{ 
                            padding: '12px 16px', 
                            borderBottom: '1px solid rgba(255,255,255,0.04)', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '6px',
                            background: 'rgba(255,255,255,0.01)'
                          }}
                        >
                          <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.4', wordBreak: 'break-word' }}>
                            {a.mensaje}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {new Date(a.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <button 
                              onClick={(e) => handleMarkRead(a.id, e)}
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '10px', height: 'auto', background: 'rgba(22, 163, 74, 0.1)', color: '#10B981', borderColor: 'transparent' }}
                            >
                              <Check size={12} style={{ marginRight: '4px' }} /> Archivar
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Menú Desplegable de Configuración */}
            {isAllowed(['Admin']) && (
              <div style={{ position: 'relative' }}>
                <button 
                  onClick={() => {
                    setIsSettingsOpen(!isSettingsOpen);
                    setIsAlertsOpen(false);
                  }} 
                  className="btn btn-secondary"
                  style={{ 
                    padding: '8px 12px', 
                    position: 'relative',
                    background: isSettingsOpen ? 'rgba(255,255,255,0.06)' : 'transparent',
                    borderColor: isSettingsOpen ? 'var(--primary)' : 'var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Configuración"
                >
                  <Settings size={18} color={isSettingsOpen ? 'var(--primary)' : 'var(--text-secondary)'} />
                </button>

                {/* Dropdown de Configuración */}
                {isSettingsOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '120%',
                    right: 0,
                    width: '220px',
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 300,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    padding: '8px'
                  }}>
                    <div style={{ 
                      padding: '8px 12px 12px 12px', 
                      borderBottom: '1px solid var(--border-color)', 
                      fontWeight: '700', 
                      fontSize: '12px', 
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>Opciones</span>
                      <button 
                        onClick={() => setIsSettingsOpen(false)} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}
                      >
                        Cerrar
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      <button
                        onClick={() => handleTabChange('configuracion')}
                        className="btn btn-secondary"
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: activeTab === 'configuracion' ? 'var(--primary-glow)' : 'transparent',
                          borderColor: activeTab === 'configuracion' ? 'var(--primary)' : 'transparent',
                          color: activeTab === 'configuracion' ? '#fff' : 'var(--text-secondary)',
                          padding: '10px 12px',
                          fontSize: '13px'
                        }}
                      >
                        <Settings size={16} color={activeTab === 'configuracion' ? 'var(--primary)' : 'var(--text-secondary)'} />
                        Configuración
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'none' }} className="header-date">
              {new Date().toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Renderizado de vistas */}
        <div style={{ minHeight: 'calc(100vh - 180px)' }}>
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <NotificationModalProvider>
        <MainApp />
      </NotificationModalProvider>
    </AuthProvider>
  );
};
export default App;
