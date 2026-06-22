import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

interface DashboardMetrics {
  kpis: {
    mttr_global_horas: number;
    pre_ordenes_pendientes: number;
    ordenes_activas: number;
    dispositivos_activos: number;
    insumos_en_alerta: number;
  };
  mttr_by_area: Array<{
    area: string;
    mttr_horas: number;
    total_resoluciones: number;
  }>;
  hardware_fatigue: Array<{
    codigo_activo: string;
    serial: string;
    marca: string;
    area_custodia: string;
    total_fallas: number;
    mttr_individual: number;
  }>;
}

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const data = await api.get<DashboardMetrics>('/api/v1/reports/metrics');
      setMetrics(data);
    } catch (e) {
      console.error('Error fetching dashboard metrics', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const kpis = metrics?.kpis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Métricas de Operación Hospitalaria</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Monitoreo de tiempos de respuesta, fatiga de hardware y alertas de almacén.
        </p>
      </div>

      {/* Grid de KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="card card-primary-glow">
          <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>MTTR Global</div>
          <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '12px', color: 'var(--primary)' }}>
            {kpis?.mttr_global_horas} hrs
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Tiempo medio de resolución de incidencias</p>
        </div>

        <div className="card">
          <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Búfer Pre-Órdenes</div>
          <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '12px', color: 'var(--warning)' }}>
            {kpis?.pre_ordenes_pendientes}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Tickets entrantes sin promover</p>
        </div>

        <div className="card">
          <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Órdenes Activas</div>
          <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '12px', color: '#10B981' }}>
            {kpis?.ordenes_activas}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Tickets asignados/en proceso en el taller</p>
        </div>

        <div className="card">
          <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Insumos en Alerta</div>
          <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '12px', color: 'var(--danger)' }}>
            {kpis?.insumos_en_alerta}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Materiales con existencias mínimas</p>
        </div>
      </div>

      <div className="grid-two-cols">
        {/* MTTR por Áreas */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Rendimiento MTTR por Área Geográfica</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Área</th>
                  <th>MTTR Promedio</th>
                  <th>Atendidos</th>
                </tr>
              </thead>
              <tbody className="table-responsive-cards">
                {metrics?.mttr_by_area.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Sin órdenes resueltas históricamente.</td>
                  </tr>
                ) : (
                  metrics?.mttr_by_area.map((area, idx) => (
                    <tr key={idx}>
                      <td data-label="Área" style={{ fontWeight: '500' }}>{area.area}</td>
                      <td data-label="MTTR Promedio" style={{ color: 'var(--primary)' }}>{Number(area.mttr_horas).toFixed(2)} hrs</td>
                      <td data-label="Atendidos">{area.total_resoluciones} casos</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Fatiga de Hardware */}
        <div className="card card-primary-glow" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Máquinas con Fatiga Crítica</h3>
            <span className="badge badge-critica pulse-warning">Alerta</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Activos informáticos que registran <strong>3 o más fallas repetitivas</strong>. Requieren desincorporación o reubicación patrimonial.
          </p>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Fallas</th>
                  <th>Área</th>
                  <th>MTTR</th>
                </tr>
              </thead>
              <tbody className="table-responsive-cards">
                {metrics?.hardware_fatigue.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No se registran equipos con fatiga recurrente.</td>
                  </tr>
                ) : (
                  metrics?.hardware_fatigue.map((dev, idx) => (
                    <tr key={idx} style={{ background: 'rgba(239, 68, 68, 0.02)' }}>
                      <td data-label="Activo" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        {dev.codigo_activo}
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '400' }}>{dev.marca}</div>
                      </td>
                      <td data-label="Fallas" style={{ color: 'var(--danger)', fontWeight: '700' }}>{dev.total_fallas} fallas</td>
                      <td data-label="Área" style={{ fontSize: '13px' }}>{dev.area_custodia}</td>
                      <td data-label="MTTR">{Number(dev.mttr_individual).toFixed(2)}h</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
