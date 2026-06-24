from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
import io
import xlsxwriter
from datetime import datetime, timedelta
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from app.core.database import get_db
from app.models.auth import Usuario
from app.models.devices import Dispositivo, Traslado, AreaHospital
from app.models.incidents import Orden
from app.routers.auth import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


# --- INDICADORES ANALÍTICOS (METRICAS ORIGINALES) ---

@router.get("/metrics")
async def get_dashboard_metrics(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Calcula nativamente en base de datos los indicadores hospitalarios (MTTR global, MTTR por áreas,
    y lista de activos con fatiga crítica de hardware).
    """
    # 1. MTTR Global (horas)
    mttr_query = text("""
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600), 0) AS mttr_global
        FROM ordenes
        WHERE estado = 'RESUELTA'
    """)
    res_mttr = await db.execute(mttr_query)
    mttr_global = res_mttr.scalar()

    # 2. MTTR por Área
    mttr_area_query = text("""
        SELECT 
            a.nombre AS area,
            COALESCE(AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at)) / 3600), 0) AS mttr_horas,
            COUNT(o.id) AS total_resoluciones
        FROM ordenes o
        JOIN dispositivos d ON o.device_id = d.id
        JOIN areas_hospital a ON d.area_id = a.id
        WHERE o.estado = 'RESUELTA'
        GROUP BY a.nombre
        ORDER BY mttr_horas DESC
    """)
    res_mttr_area = await db.execute(mttr_area_query)
    mttr_by_area = [dict(row._mapping) for row in res_mttr_area.fetchall()]

    # 3. Identificación de Fatiga Crítica de Hardware (Índice de Recurrencia >= 3 fallas)
    fatigue_query = text("""
        SELECT 
            d.codigo_activo,
            d.serial,
            d.marca,
            a.nombre AS area_custodia,
            COUNT(o.id) AS total_fallas,
            COALESCE(AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at)) / 3600), 0) AS mttr_individual
        FROM ordenes o
        JOIN dispositivos d ON o.device_id = d.id
        JOIN areas_hospital a ON d.area_id = a.id
        GROUP BY d.codigo_activo, d.serial, d.marca, a.nombre
        HAVING COUNT(o.id) >= 3
        ORDER BY total_fallas DESC
    """)
    res_fatigue = await db.execute(fatigue_query)
    hardware_fatigue = [dict(row._mapping) for row in res_fatigue.fetchall()]

    # 4. Totalizadores rápidos
    counts_query = text("""
        SELECT 
            (SELECT COUNT(*) FROM pre_ordenes WHERE estado = 'PRE_ORDEN') AS pre_ordenes_pendientes,
            (SELECT COUNT(*) FROM ordenes WHERE estado IN ('ASIGNADA', 'EN_PROCESO')) AS ordenes_activas,
            (SELECT COUNT(*) FROM dispositivos WHERE estado_patrimonial = 'Activo') AS dispositivos_activos,
            (SELECT COUNT(*) FROM inventario_departamento WHERE stock <= stock_minimo) AS insumos_en_alerta
    """)
    res_counts = await db.execute(counts_query)
    counts = dict(res_counts.fetchone()._mapping)

    return {
        "kpis": {
            "mttr_global_horas": round(mttr_global, 2),
            **counts
        },
        "mttr_by_area": mttr_by_area,
        "hardware_fatigue": hardware_fatigue
    }


# --- REPORTE 1: INCIDENCIAS ---

async def query_incidencias_data(
    db: AsyncSession,
    fecha_inicio: Optional[str],
    fecha_fin: Optional[str],
    urgencia: Optional[str],
    estado: Optional[str],
    tipo_requerimiento: Optional[str],
    tecnico_id: Optional[int]
) -> List[dict]:
    params = {}
    sql = """
        SELECT 
            o.id,
            po.numero_reporte,
            po.tipo_requerimiento,
            po.urgencia,
            o.estado,
            d.codigo_activo,
            d.marca || ' (' || d.serial || ')' AS dispositivo,
            a.nombre AS area,
            ut.nombre || ' ' || ut.apellido AS tecnico,
            us.nombre || ' ' || us.apellido AS soporte,
            o.created_at,
            o.closed_at,
            CASE 
                WHEN o.closed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (o.closed_at - o.created_at)) / 3600
                ELSE NULL
            END AS resolucion_horas
        FROM ordenes o
        LEFT JOIN pre_ordenes po ON o.pre_orden_id = po.id
        JOIN dispositivos d ON o.device_id = d.id
        JOIN areas_hospital a ON d.area_id = a.id
        LEFT JOIN usuarios ut ON o.tecnico_id = ut.id
        JOIN usuarios us ON o.soporte_id = us.id
        WHERE 1 = 1
    """

    if fecha_inicio:
        sql += " AND o.created_at >= :fecha_inicio"
        params["fecha_inicio"] = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    if fecha_fin:
        sql += " AND o.created_at <= :fecha_fin"
        params["fecha_fin"] = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)
    if urgencia:
        sql += " AND po.urgencia = :urgencia"
        params["urgencia"] = urgencia
    if estado:
        sql += " AND o.estado = :estado"
        params["estado"] = estado
    if tipo_requerimiento:
        sql += " AND po.tipo_requerimiento = :tipo_requerimiento"
        params["tipo_requerimiento"] = tipo_requerimiento
    if tecnico_id:
        sql += " AND o.tecnico_id = :tecnico_id"
        params["tecnico_id"] = tecnico_id

    sql += " ORDER BY o.created_at DESC"
    res = await db.execute(text(sql), params)
    return [dict(row._mapping) for row in res.fetchall()]


@router.get("/incidencias")
async def get_incidencias_report(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    urgencia: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    tipo_requerimiento: Optional[str] = Query(None),
    tecnico_id: Optional[int] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    return await query_incidencias_data(db, fecha_inicio, fecha_fin, urgencia, estado, tipo_requerimiento, tecnico_id)


@router.get("/incidencias/metrics")
async def get_incidencias_metrics(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    params = {}
    date_filter = ""
    if fecha_inicio:
        date_filter += " AND created_at >= :fecha_inicio"
        params["fecha_inicio"] = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    if fecha_fin:
        date_filter += " AND created_at <= :fecha_fin"
        params["fecha_fin"] = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)

    # MTTR Promedio en el rango
    mttr_sql = f"""
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600), 0) AS mttr
        FROM ordenes
        WHERE estado = 'RESUELTA' {date_filter}
    """
    res_mttr = await db.execute(text(mttr_sql), params)
    mttr = res_mttr.scalar()

    # Totales por Estado
    status_sql = f"""
        SELECT estado, COUNT(*) as cantidad
        FROM ordenes
        WHERE 1=1 {date_filter}
        GROUP BY estado
    """
    res_status = await db.execute(text(status_sql), params)
    status_counts = {row._mapping["estado"]: row._mapping["cantidad"] for row in res_status.fetchall()}

    # Totales por Urgencia
    urgency_sql = f"""
        SELECT po.urgencia, COUNT(o.id) as cantidad
        FROM ordenes o
        JOIN pre_ordenes po ON o.pre_orden_id = po.id
        WHERE 1=1 {date_filter.replace('created_at', 'o.created_at')}
        GROUP BY po.urgencia
    """
    res_urgency = await db.execute(text(urgency_sql), params)
    urgency_counts = {row._mapping["urgencia"]: row._mapping["cantidad"] for row in res_urgency.fetchall()}

    # Total General
    total_sql = f"SELECT COUNT(*) FROM ordenes WHERE 1=1 {date_filter}"
    res_total = await db.execute(text(total_sql), params)
    total = res_total.scalar()

    return {
        "total": total,
        "mttr_promedio": round(mttr, 2) if mttr else 0,
        "por_estado": status_counts,
        "por_urgencia": urgency_counts
    }


@router.get("/incidencias/export/excel")
async def export_incidencias_excel(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    urgencia: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    tipo_requerimiento: Optional[str] = Query(None),
    tecnico_id: Optional[int] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    data = await query_incidencias_data(db, fecha_inicio, fecha_fin, urgencia, estado, tipo_requerimiento, tecnico_id)

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    worksheet = workbook.add_sheet("Reporte Incidencias")

    # Formatos estéticos
    title_format = workbook.add_format({
        'bold': True, 'font_size': 14, 'align': 'center', 'valign': 'vcenter', 'font_color': '#ffffff', 'bg_color': '#1E3A8A'
    })
    header_format = workbook.add_format({
        'bold': True, 'align': 'left', 'valign': 'vcenter', 'bg_color': '#F3F4F6', 'border': 1
    })
    cell_format = workbook.add_format({'align': 'left', 'valign': 'vcenter', 'border': 1})
    date_format = workbook.add_format({'num_format': 'yyyy-mm-dd hh:mm:ss', 'align': 'left', 'valign': 'vcenter', 'border': 1})
    number_format = workbook.add_format({'num_format': '0.0', 'align': 'right', 'valign': 'vcenter', 'border': 1})

    worksheet.merge_range("A1:K1", "REPORTE DE INCIDENCIAS Y ÓRDENES DE SERVICIO", title_format)
    worksheet.set_row(0, 30)

    headers = [
        "ID", "Código Activo", "Dispositivo", "Área", "Tipo Requerimiento",
        "Urgencia", "Estado", "Técnico", "Soporte Creador", "Fecha Creación", "Fecha Cierre"
    ]
    
    for col_num, header in enumerate(headers):
        worksheet.write(2, col_num, header, header_format)
    worksheet.set_row(2, 20)

    for row_num, row_data in enumerate(data, start=3):
        worksheet.write(row_num, 0, row_data["id"], cell_format)
        worksheet.write(row_num, 1, row_data["codigo_activo"], cell_format)
        worksheet.write(row_num, 2, row_data["dispositivo"], cell_format)
        worksheet.write(row_num, 3, row_data["area"], cell_format)
        worksheet.write(row_num, 4, row_data["tipo_requerimiento"] or "N/A", cell_format)
        worksheet.write(row_num, 5, row_data["urgencia"] or "N/A", cell_format)
        worksheet.write(row_num, 6, row_data["estado"], cell_format)
        worksheet.write(row_num, 7, row_data["tecnico"] or "No Asignado", cell_format)
        worksheet.write(row_num, 8, row_data["soporte"], cell_format)
        
        worksheet.write_datetime(row_num, 9, row_data["created_at"], date_format)
        if row_data["closed_at"]:
            worksheet.write_datetime(row_num, 10, row_data["closed_at"], date_format)
        else:
            worksheet.write(row_num, 10, "Abierto", cell_format)
        
        worksheet.set_row(row_num, 18)

    worksheet.set_column("A:A", 6)
    worksheet.set_column("B:C", 18)
    worksheet.set_column("D:D", 15)
    worksheet.set_column("E:E", 20)
    worksheet.set_column("F:G", 12)
    worksheet.set_column("H:I", 20)
    worksheet.set_column("J:K", 20)

    workbook.close()
    output.seek(0)

    filename = f"reporte_incidencias_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/incidencias/export/pdf")
async def export_incidencias_pdf(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    urgencia: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    tipo_requerimiento: Optional[str] = Query(None),
    tecnico_id: Optional[int] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    data = await query_incidencias_data(db, fecha_inicio, fecha_fin, urgencia, estado, tipo_requerimiento, tecnico_id)

    output = io.BytesIO()
    # Usar landscape para reportes de incidencias porque tiene muchas columnas
    doc = SimpleDocTemplate(
        output,
        pagesize=landscape(letter),
        rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=16,
        leading=20, textColor=colors.HexColor('#1E3A8A'), alignment=1, spaceAfter=15
    )
    body_style = ParagraphStyle('TableText', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10)
    header_style = ParagraphStyle('TableHeader', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white)

    story = []
    story.append(Paragraph("REPORTE OFICIAL DE INCIDENCIAS Y ÓRDENES DE SERVICIO", title_style))
    story.append(Spacer(1, 10))

    table_data = [[
        Paragraph("ID", header_style),
        Paragraph("Código Activo", header_style),
        Paragraph("Dispositivo", header_style),
        Paragraph("Área", header_style),
        Paragraph("Urgencia", header_style),
        Paragraph("Estado", header_style),
        Paragraph("Técnico", header_style),
        Paragraph("Fecha Creación", header_style),
        Paragraph("Fecha Cierre", header_style)
    ]]

    for row in data:
        closed_date_str = row["closed_at"].strftime("%Y-%m-%d %H:%M") if row["closed_at"] else "Abierta"
        table_data.append([
            Paragraph(str(row["id"]), body_style),
            Paragraph(row["codigo_activo"], body_style),
            Paragraph(row["dispositivo"], body_style),
            Paragraph(row["area"], body_style),
            Paragraph(row["urgencia"] or "Media", body_style),
            Paragraph(row["estado"], body_style),
            Paragraph(row["tecnico"] or "No Asignado", body_style),
            Paragraph(row["created_at"].strftime("%Y-%m-%d %H:%M"), body_style),
            Paragraph(closed_date_str, body_style)
        ])

    col_widths = [30, 80, 110, 90, 60, 60, 100, 90, 90] # Total 710 ptos (hoja carta apaisada es 792)
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F9FAFB')]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,1), (-1,-1), 4),
        ('TOPPADDING', (0,1), (-1,-1), 4),
    ]))

    story.append(t)
    doc.build(story)
    output.seek(0)

    filename = f"reporte_incidencias_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# --- REPORTE 2: MOVIMIENTOS DE DISPOSITIVOS ---

async def query_traslados_data(
    db: AsyncSession,
    area_origen_id: Optional[int],
    area_destino_id: Optional[int],
    ejecutor_id: Optional[int],
    fecha_inicio: Optional[str],
    fecha_fin: Optional[str]
) -> List[dict]:
    """
    Consulta dinámica y filtrada de traslados con índices compuestos optimizados.
    """
    conditions = []
    params = {}

    sql = """
        SELECT 
            t.id,
            d.codigo_activo,
            d.serial,
            d.marca,
            ao.nombre AS area_origen,
            ad.nombre AS area_destino,
            t.motivo_traslado,
            t.tipo_movimiento,
            u.nombre || ' ' || u.apellido AS administrador,
            t.created_at
        FROM traslados t
        JOIN dispositivos d ON t.device_id = d.id
        JOIN areas_hospital ao ON t.area_origen_id = ao.id
        JOIN areas_hospital ad ON t.area_destino_id = ad.id
        JOIN usuarios u ON t.ejecutor_id = u.id
        WHERE 1 = 1
    """

    if area_origen_id:
        sql += " AND t.area_origen_id = :area_origen_id"
        params["area_origen_id"] = area_origen_id
    if area_destino_id:
        sql += " AND t.area_destino_id = :area_destino_id"
        params["area_destino_id"] = area_destino_id
    if ejecutor_id:
        sql += " AND t.ejecutor_id = :ejecutor_id"
        params["ejecutor_id"] = ejecutor_id
    if fecha_inicio:
        sql += " AND t.created_at >= :fecha_inicio"
        params["fecha_inicio"] = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    if fecha_fin:
        sql += " AND t.created_at <= :fecha_fin"
        params["fecha_fin"] = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)

    sql += " ORDER BY t.created_at DESC"
    res = await db.execute(text(sql), params)
    return [dict(row._mapping) for row in res.fetchall()]


@router.get("/traslados")
async def get_traslados_report(
    area_origen_id: Optional[int] = Query(None),
    area_destino_id: Optional[int] = Query(None),
    ejecutor_id: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    return await query_traslados_data(db, area_origen_id, area_destino_id, ejecutor_id, fecha_inicio, fecha_fin)


@router.get("/traslados/metrics")
async def get_traslados_metrics(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    params = {}
    date_filter = ""
    if fecha_inicio:
        date_filter += " AND created_at >= :fecha_inicio"
        params["fecha_inicio"] = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    if fecha_fin:
        date_filter += " AND created_at <= :fecha_fin"
        params["fecha_fin"] = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)

    # Total traslados/movimientos
    total_sql = f"SELECT COUNT(*) FROM traslados WHERE 1=1 {date_filter}"
    res_total = await db.execute(text(total_sql), params)
    total = res_total.scalar()

    # Bajas patrimoniales
    bajas_sql = f"SELECT COUNT(*) FROM traslados WHERE tipo_movimiento = 'Baja Patrimonial' {date_filter}"
    res_bajas = await db.execute(text(bajas_sql), params)
    bajas = res_bajas.scalar()

    # Traslados de ubicación
    traslados_normales_sql = f"SELECT COUNT(*) FROM traslados WHERE tipo_movimiento != 'Baja Patrimonial' {date_filter}"
    res_traslados_normales = await db.execute(text(traslados_normales_sql), params)
    traslados_normales = res_traslados_normales.scalar()

    # Áreas más activas origen
    areas_origen_sql = f"""
        SELECT ao.nombre AS area, COUNT(*) as cantidad
        FROM traslados t
        JOIN areas_hospital ao ON t.area_origen_id = ao.id
        WHERE 1=1 {date_filter.replace('created_at', 't.created_at')}
        GROUP BY ao.nombre
        ORDER BY cantidad DESC
        LIMIT 3
    """
    res_areas_origen = await db.execute(text(areas_origen_sql), params)
    areas_origen = [dict(row._mapping) for row in res_areas_origen.fetchall()]

    return {
        "total": total,
        "bajas": bajas,
        "traslados_normales": traslados_normales,
        "areas_origen_mas_activas": areas_origen
    }


@router.get("/export/excel")
async def export_to_excel(
    area_origen_id: Optional[int] = Query(None),
    area_destino_id: Optional[int] = Query(None),
    ejecutor_id: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    data = await query_traslados_data(db, area_origen_id, area_destino_id, ejecutor_id, fecha_inicio, fecha_fin)

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    worksheet = workbook.add_sheet("Traslados Patrimoniales")

    title_format = workbook.add_format({
        'bold': True, 'font_size': 14, 'align': 'center', 'valign': 'vcenter', 'font_color': '#ffffff', 'bg_color': '#1E3A8A'
    })
    header_format = workbook.add_format({
        'bold': True, 'align': 'left', 'valign': 'vcenter', 'bg_color': '#F3F4F6', 'border': 1
    })
    cell_format = workbook.add_format({'align': 'left', 'valign': 'vcenter', 'border': 1})
    date_format = workbook.add_format({'num_format': 'yyyy-mm-dd hh:mm:ss', 'align': 'left', 'valign': 'vcenter', 'border': 1})

    worksheet.merge_range("A1:J1", "REPORTE DE MOVIMIENTOS PATRIMONIALES Y BAJAS", title_format)
    worksheet.set_row(0, 30)

    headers = [
        "ID", "Código Activo", "Serial", "Marca", "Origen", 
        "Destino", "Motivo", "Tipo Movimiento", "Administrador", "Fecha"
    ]
    
    for col_num, header in enumerate(headers):
        worksheet.write(2, col_num, header, header_format)
    worksheet.set_row(2, 20)

    for row_num, row_data in enumerate(data, start=3):
        worksheet.write(row_num, 0, row_data["id"], cell_format)
        worksheet.write(row_num, 1, row_data["codigo_activo"], cell_format)
        worksheet.write(row_num, 2, row_data["serial"], cell_format)
        worksheet.write(row_num, 3, row_data["marca"], cell_format)
        worksheet.write(row_num, 4, row_data["area_origen"], cell_format)
        worksheet.write(row_num, 5, row_data["area_destino"], cell_format)
        worksheet.write(row_num, 6, row_data["motivo_traslado"], cell_format)
        worksheet.write(row_num, 7, row_data["tipo_movimiento"], cell_format)
        worksheet.write(row_num, 8, row_data["administrador"], cell_format)
        
        dt = row_data["created_at"]
        worksheet.write_datetime(row_num, 9, dt, date_format)
        worksheet.set_row(row_num, 18)

    worksheet.set_column("A:A", 5)
    worksheet.set_column("B:D", 15)
    worksheet.set_column("E:F", 20)
    worksheet.set_column("G:G", 30)
    worksheet.set_column("H:I", 18)
    worksheet.set_column("J:J", 20)

    workbook.close()
    output.seek(0)

    filename = f"reporte_traslados_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/pdf")
async def export_to_pdf(
    area_origen_id: Optional[int] = Query(None),
    area_destino_id: Optional[int] = Query(None),
    ejecutor_id: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    data = await query_traslados_data(db, area_origen_id, area_destino_id, ejecutor_id, fecha_inicio, fecha_fin)

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=letter,
        rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=16,
        leading=20, textColor=colors.HexColor('#1E3A8A'), alignment=1, spaceAfter=15
    )
    body_style = ParagraphStyle('TableText', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10)
    header_style = ParagraphStyle('TableHeader', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white)

    story = []
    story.append(Paragraph("REPORTE OFICIAL DE TRASLADOS Y BAJAS PATRIMONIALES", title_style))
    story.append(Spacer(1, 10))

    table_data = [[
        Paragraph("Código Activo", header_style),
        Paragraph("Origen", header_style),
        Paragraph("Destino", header_style),
        Paragraph("Tipo", header_style),
        Paragraph("Administrador", header_style),
        Paragraph("Fecha", header_style)
    ]]

    for row in data:
        table_data.append([
            Paragraph(row["codigo_activo"], body_style),
            Paragraph(row["area_origen"], body_style),
            Paragraph(row["area_destino"], body_style),
            Paragraph(row["tipo_movimiento"], body_style),
            Paragraph(row["administrador"], body_style),
            Paragraph(row["created_at"].strftime("%Y-%m-%d %H:%M"), body_style)
        ])

    col_widths = [80, 100, 100, 80, 110, 80]
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F9FAFB')]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,1), (-1,-1), 4),
        ('TOPPADDING', (0,1), (-1,-1), 4),
    ]))

    story.append(t)
    doc.build(story)
    output.seek(0)

    filename = f"reporte_patrimonial_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# --- REPORTE 3: INVENTARIO (MOVIMIENTOS Y BAJO STOCK) ---

async def query_consumos_data(
    db: AsyncSession,
    fecha_inicio: Optional[str],
    fecha_fin: Optional[str],
    item_id: Optional[int]
) -> List[dict]:
    params = {}
    sql = """
        SELECT 
            oc.orden_id,
            idep.nombre AS item_nombre,
            idep.tipo AS item_tipo,
            oc.cantidad,
            o.closed_at AS fecha_movimiento,
            ut.nombre || ' ' || ut.apellido AS ejecutor,
            'Consumo por Orden' AS tipo_operacion
        FROM orden_consumibles oc
        JOIN ordenes o ON oc.orden_id = o.id
        JOIN inventario_departamento idep ON oc.consumible_id = idep.id
        LEFT JOIN usuarios ut ON o.tecnico_id = ut.id
        WHERE o.estado = 'RESUELTA'
    """
    if fecha_inicio:
        sql += " AND o.closed_at >= :fecha_inicio"
        params["fecha_inicio"] = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    if fecha_fin:
        sql += " AND o.closed_at <= :fecha_fin"
        params["fecha_fin"] = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)
    if item_id:
        sql += " AND oc.consumible_id = :item_id"
        params["item_id"] = item_id

    sql += " ORDER BY o.closed_at DESC"
    res = await db.execute(text(sql), params)
    return [dict(row._mapping) for row in res.fetchall()]


async def query_prestamos_data(
    db: AsyncSession,
    fecha_inicio: Optional[str],
    fecha_fin: Optional[str],
    item_id: Optional[int]
) -> List[dict]:
    params = {}
    sql = """
        SELECT 
            ph.id AS prestamo_id,
            idep.nombre AS item_nombre,
            idep.tipo AS item_tipo,
            1 AS cantidad,
            ph.fecha_prestamo AS fecha_movimiento,
            e.nombre || ' ' || e.apellido AS beneficiario,
            ua.nombre || ' ' || ua.apellido AS ejecutor,
            'Préstamo de Herramienta' AS tipo_operacion,
            ph.estado AS estado_prestamo,
            ph.fecha_devolucion_real
        FROM prestamos_herramientas ph
        JOIN inventario_departamento idep ON ph.herramienta_id = idep.id
        JOIN empleados e ON ph.beneficiario_cedula = e.cedula
        JOIN usuarios ua ON ph.autorizador_id = ua.id
        WHERE 1 = 1
    """
    if fecha_inicio:
        sql += " AND ph.fecha_prestamo >= :fecha_inicio"
        params["fecha_inicio"] = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    if fecha_fin:
        sql += " AND ph.fecha_prestamo <= :fecha_fin"
        params["fecha_fin"] = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)
    if item_id:
        sql += " AND ph.herramienta_id = :item_id"
        params["item_id"] = item_id

    sql += " ORDER BY ph.fecha_prestamo DESC"
    res = await db.execute(text(sql), params)
    return [dict(row._mapping) for row in res.fetchall()]


@router.get("/inventario/movimientos")
async def get_inventario_movimientos(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    item_tipo: Optional[str] = Query(None),  # 'Consumible' o 'Herramienta'
    item_id: Optional[int] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    consumos = []
    prestamos = []

    if not item_tipo or item_tipo == "Consumible":
        consumos = await query_consumos_data(db, fecha_inicio, fecha_fin, item_id)
    if not item_tipo or item_tipo == "Herramienta":
        prestamos = await query_prestamos_data(db, fecha_inicio, fecha_fin, item_id)

    return {
        "consumos": consumos,
        "prestamos": prestamos
    }


@router.get("/inventario/movimientos/metrics")
async def get_inventario_movimientos_metrics(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    params = {}
    date_filter_o = ""
    date_filter_ph = ""
    if fecha_inicio:
        date_filter_o += " AND o.closed_at >= :fecha_inicio"
        date_filter_ph += " AND ph.fecha_prestamo >= :fecha_inicio"
        params["fecha_inicio"] = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    if fecha_fin:
        date_filter_o += " AND o.closed_at <= :fecha_fin"
        date_filter_ph += " AND ph.fecha_prestamo <= :fecha_fin"
        params["fecha_fin"] = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)

    # 1. Total Consumibles Consumidos (unidades)
    consumo_sql = f"""
        SELECT COALESCE(SUM(oc.cantidad), 0)
        FROM orden_consumibles oc
        JOIN ordenes o ON oc.orden_id = o.id
        WHERE o.estado = 'RESUELTA' {date_filter_o}
    """
    res_consumo = await db.execute(text(consumo_sql), params)
    total_consumido = res_consumo.scalar()

    # 2. Total Préstamos de Herramientas
    prestamos_sql = f"""
        SELECT COUNT(*)
        FROM prestamos_herramientas ph
        WHERE 1 = 1 {date_filter_ph}
    """
    res_prestamos = await db.execute(text(prestamos_sql), params)
    total_prestamos = res_prestamos.scalar()

    # 3. Préstamos Activos y Retrasados
    prestamos_estados_sql = f"""
        SELECT ph.estado, COUNT(*) as cantidad
        FROM prestamos_herramientas ph
        WHERE 1 = 1 {date_filter_ph}
        GROUP BY ph.estado
    """
    res_prestamos_estados = await db.execute(text(prestamos_estados_sql), params)
    estados_prestamos = {row._mapping["estado"]: row._mapping["cantidad"] for row in res_prestamos_estados.fetchall()}

    # 4. Consumibles Más Usados
    mas_usados_sql = f"""
        SELECT idep.nombre, SUM(oc.cantidad) as cantidad
        FROM orden_consumibles oc
        JOIN ordenes o ON oc.orden_id = o.id
        JOIN inventario_departamento idep ON oc.consumible_id = idep.id
        WHERE o.estado = 'RESUELTA' {date_filter_o}
        GROUP BY idep.nombre
        ORDER BY cantidad DESC
        LIMIT 3
    """
    res_mas_usados = await db.execute(text(mas_usados_sql), params)
    mas_usados = [dict(row._mapping) for row in res_mas_usados.fetchall()]

    return {
        "total_consumibles_consumidos": total_consumido,
        "total_prestamos": total_prestamos,
        "prestamos_por_estado": estados_prestamos,
        "consumibles_mas_usados": mas_usados
    }


@router.get("/inventario/bajo-stock")
async def get_bajo_stock(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    sql = """
        SELECT 
            id,
            nombre,
            tipo,
            stock,
            stock_minimo
        FROM inventario_departamento
        WHERE stock <= stock_minimo
        ORDER BY stock ASC
    """
    res = await db.execute(text(sql))
    return [dict(row._mapping) for row in res.fetchall()]


@router.get("/inventario/export/movimientos/excel")
async def export_inventario_movimientos_excel(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    item_tipo: Optional[str] = Query(None),
    item_id: Optional[int] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})

    # Formatos estéticos
    title_format = workbook.add_format({
        'bold': True, 'font_size': 14, 'align': 'center', 'valign': 'vcenter', 'font_color': '#ffffff', 'bg_color': '#1E3A8A'
    })
    header_format = workbook.add_format({
        'bold': True, 'align': 'left', 'valign': 'vcenter', 'bg_color': '#F3F4F6', 'border': 1
    })
    cell_format = workbook.add_format({'align': 'left', 'valign': 'vcenter', 'border': 1})
    date_format = workbook.add_format({'num_format': 'yyyy-mm-dd hh:mm:ss', 'align': 'left', 'valign': 'vcenter', 'border': 1})

    if not item_tipo or item_tipo == "Consumible":
        consumos = await query_consumos_data(db, fecha_inicio, fecha_fin, item_id)
        worksheet = workbook.add_sheet("Consumos")
        worksheet.merge_range("A1:F1", "REPORTE DE CONSUMO DE INSUMOS", title_format)
        worksheet.set_row(0, 30)

        headers = ["Orden ID", "Insumo", "Tipo", "Cantidad Consumida", "Fecha Movimiento", "Técnico Ejecutor"]
        for col, h in enumerate(headers):
            worksheet.write(2, col, h, header_format)
        worksheet.set_row(2, 20)

        for row_num, row_data in enumerate(consumos, start=3):
            worksheet.write(row_num, 0, row_data["orden_id"], cell_format)
            worksheet.write(row_num, 1, row_data["item_nombre"], cell_format)
            worksheet.write(row_num, 2, row_data["item_tipo"], cell_format)
            worksheet.write(row_num, 3, row_data["cantidad"], cell_format)
            worksheet.write_datetime(row_num, 4, row_data["fecha_movimiento"], date_format)
            worksheet.write(row_num, 5, row_data["ejecutor"] or "N/A", cell_format)
            worksheet.set_row(row_num, 18)

        worksheet.set_column("A:A", 10)
        worksheet.set_column("B:B", 25)
        worksheet.set_column("C:D", 15)
        worksheet.set_column("E:F", 20)

    if not item_tipo or item_tipo == "Herramienta":
        prestamos = await query_prestamos_data(db, fecha_inicio, fecha_fin, item_id)
        worksheet = workbook.add_sheet("Préstamos")
        worksheet.merge_range("A1:I1", "REPORTE DE PRÉSTAMOS DE HERRAMIENTAS", title_format)
        worksheet.set_row(0, 30)

        headers = ["Préstamo ID", "Herramienta", "Tipo", "Cantidad", "Fecha Préstamo", "Beneficiario", "Autorizador", "Estado", "Fecha Devolución Real"]
        for col, h in enumerate(headers):
            worksheet.write(2, col, h, header_format)
        worksheet.set_row(2, 20)

        for row_num, row_data in enumerate(prestamos, start=3):
            worksheet.write(row_num, 0, row_data["prestamo_id"], cell_format)
            worksheet.write(row_num, 1, row_data["item_nombre"], cell_format)
            worksheet.write(row_num, 2, row_data["item_tipo"], cell_format)
            worksheet.write(row_num, 3, row_data["cantidad"], cell_format)
            worksheet.write_datetime(row_num, 4, row_data["fecha_movimiento"], date_format)
            worksheet.write(row_num, 5, row_data["beneficiario"], cell_format)
            worksheet.write(row_num, 6, row_data["ejecutor"], cell_format)
            worksheet.write(row_num, 7, row_data["estado_prestamo"], cell_format)
            if row_data["fecha_devolucion_real"]:
                worksheet.write_datetime(row_num, 8, row_data["fecha_devolucion_real"], date_format)
            else:
                worksheet.write(row_num, 8, "No devuelto", cell_format)
            worksheet.set_row(row_num, 18)

        worksheet.set_column("A:A", 12)
        worksheet.set_column("B:B", 25)
        worksheet.set_column("C:D", 12)
        worksheet.set_column("E:G", 20)
        worksheet.set_column("H:I", 18)

    workbook.close()
    output.seek(0)

    filename = f"reporte_movimientos_inventario_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/inventario/export/movimientos/pdf")
async def export_inventario_movimientos_pdf(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    item_tipo: Optional[str] = Query(None),
    item_id: Optional[int] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=letter,
        rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=16,
        leading=20, textColor=colors.HexColor('#1E3A8A'), alignment=1, spaceAfter=15
    )
    section_style = ParagraphStyle(
        'SectionHeader', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=12,
        leading=14, textColor=colors.HexColor('#1E3A8A'), spaceBefore=10, spaceAfter=8
    )
    body_style = ParagraphStyle('TableText', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10)
    header_style = ParagraphStyle('TableHeader', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white)

    story = []
    story.append(Paragraph("REPORTE HISTÓRICO DE MOVIMIENTOS DE INVENTARIO", title_style))
    story.append(Spacer(1, 10))

    if not item_tipo or item_tipo == "Consumible":
        consumos = await query_consumos_data(db, fecha_inicio, fecha_fin, item_id)
        story.append(Paragraph("Consumo de Insumos (Consumibles)", section_style))
        
        table_data = [[
            Paragraph("Orden ID", header_style),
            Paragraph("Insumo", header_style),
            Paragraph("Cantidad", header_style),
            Paragraph("Fecha Movimiento", header_style),
            Paragraph("Técnico Ejecutor", header_style)
        ]]

        for row in consumos:
            table_data.append([
                Paragraph(str(row["orden_id"]), body_style),
                Paragraph(row["item_nombre"], body_style),
                Paragraph(str(row["cantidad"]), body_style),
                Paragraph(row["fecha_movimiento"].strftime("%Y-%m-%d %H:%M"), body_style),
                Paragraph(row["ejecutor"] or "N/A", body_style)
            ])

        col_widths = [60, 180, 60, 110, 140] # Total 550
        t = Table(table_data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F9FAFB')]),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('TOPPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t)
        story.append(Spacer(1, 20))

    if not item_tipo or item_tipo == "Herramienta":
        prestamos = await query_prestamos_data(db, fecha_inicio, fecha_fin, item_id)
        story.append(Paragraph("Préstamos de Herramientas", section_style))

        table_data = [[
            Paragraph("ID", header_style),
            Paragraph("Herramienta", header_style),
            Paragraph("Fecha Préstamo", header_style),
            Paragraph("Beneficiario", header_style),
            Paragraph("Estado", header_style)
        ]]

        for row in prestamos:
            table_data.append([
                Paragraph(str(row["prestamo_id"]), body_style),
                Paragraph(row["item_nombre"], body_style),
                Paragraph(row["fecha_movimiento"].strftime("%Y-%m-%d %H:%M"), body_style),
                Paragraph(row["beneficiario"], body_style),
                Paragraph(row["estado_prestamo"], body_style)
            ])

        col_widths = [50, 180, 110, 130, 80] # Total 550
        t = Table(table_data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F9FAFB')]),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('TOPPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t)

    doc.build(story)
    output.seek(0)

    filename = f"reporte_movimientos_inventario_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/inventario/export/bajo-stock/excel")
async def export_bajo_stock_excel(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    sql = """
        SELECT 
            id,
            nombre,
            tipo,
            stock,
            stock_minimo
        FROM inventario_departamento
        WHERE stock <= stock_minimo
        ORDER BY stock ASC
    """
    res = await db.execute(text(sql))
    data = [dict(row._mapping) for row in res.fetchall()]

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    worksheet = workbook.add_sheet("Bajo Stock")

    title_format = workbook.add_format({
        'bold': True, 'font_size': 14, 'align': 'center', 'valign': 'vcenter', 'font_color': '#ffffff', 'bg_color': '#DC2626'
    })
    header_format = workbook.add_format({
        'bold': True, 'align': 'left', 'valign': 'vcenter', 'bg_color': '#F3F4F6', 'border': 1
    })
    cell_format = workbook.add_format({'align': 'left', 'valign': 'vcenter', 'border': 1})
    alert_cell_format = workbook.add_format({'align': 'left', 'valign': 'vcenter', 'border': 1, 'font_color': '#DC2626', 'bold': True})

    worksheet.merge_range("A1:E1", "ALERTAS DE CRÍTICAS DE BAJO STOCK EN ALMACÉN", title_format)
    worksheet.set_row(0, 30)

    headers = ["ID", "Nombre de Item", "Tipo", "Stock Actual", "Stock Mínimo Autorizado"]
    for col, h in enumerate(headers):
        worksheet.write(2, col, h, header_format)
    worksheet.set_row(2, 20)

    for row_num, row_data in enumerate(data, start=3):
        worksheet.write(row_num, 0, row_data["id"], cell_format)
        worksheet.write(row_num, 1, row_data["nombre"], cell_format)
        worksheet.write(row_num, 2, row_data["tipo"], cell_format)
        worksheet.write(row_num, 3, row_data["stock"], alert_cell_format)
        worksheet.write(row_num, 4, row_data["stock_minimo"], cell_format)
        worksheet.set_row(row_num, 18)

    worksheet.set_column("A:A", 8)
    worksheet.set_column("B:B", 35)
    worksheet.set_column("C:E", 18)

    workbook.close()
    output.seek(0)

    filename = f"bajo_stock_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/inventario/export/bajo-stock/pdf")
async def export_bajo_stock_pdf(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    sql = """
        SELECT 
            id,
            nombre,
            tipo,
            stock,
            stock_minimo
        FROM inventario_departamento
        WHERE stock <= stock_minimo
        ORDER BY stock ASC
    """
    res = await db.execute(text(sql))
    data = [dict(row._mapping) for row in res.fetchall()]

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=letter,
        rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=16,
        leading=20, textColor=colors.HexColor('#DC2626'), alignment=1, spaceAfter=15
    )
    body_style = ParagraphStyle('TableText', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=11)
    body_style_red = ParagraphStyle('TableTextRed', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=11, textColor=colors.HexColor('#DC2626'))
    header_style = ParagraphStyle('TableHeader', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=11, textColor=colors.white)

    story = []
    story.append(Paragraph("REPORTE DE ALERTAS DE STOCK CRÍTICO", title_style))
    story.append(Spacer(1, 10))

    table_data = [[
        Paragraph("ID ID", header_style),
        Paragraph("Nombre del Item", header_style),
        Paragraph("Tipo", header_style),
        Paragraph("Stock Actual", header_style),
        Paragraph("Stock Mínimo", header_style)
    ]]

    for row in data:
        table_data.append([
            Paragraph(str(row["id"]), body_style),
            Paragraph(row["nombre"], body_style),
            Paragraph(row["tipo"], body_style),
            Paragraph(str(row["stock"]), body_style_red),
            Paragraph(str(row["stock_minimo"]), body_style)
        ])

    col_widths = [50, 240, 100, 80, 80] # Total 550
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#DC2626')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#FFF5F5')]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
    ]))

    story.append(t)
    doc.build(story)
    output.seek(0)

    filename = f"bajo_stock_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# --- REPORTE 4: RENDIMIENTO TÉCNICO ---

async def query_rendimiento_data(
    db: AsyncSession,
    fecha_inicio: Optional[str],
    fecha_fin: Optional[str]
) -> List[dict]:
    fecha_inicio_parsed = None
    fecha_fin_parsed = None
    if fecha_inicio:
        fecha_inicio_parsed = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    if fecha_fin:
        fecha_fin_parsed = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)

    params = {
        "fecha_inicio_parsed": fecha_inicio_parsed,
        "fecha_fin_parsed": fecha_fin_parsed
    }

    # Subconsultas para evitar Cartesian product y asegurar conteos correctos
    # Se agrega CAST a TIMESTAMP para que asyncpg/PostgreSQL infiera correctamente el tipo de parámetro
    sql = """
        SELECT 
            u.id,
            u.nombre,
            u.apellido,
            u.rol,
            (
                SELECT COUNT(*) 
                FROM ordenes o 
                WHERE o.tecnico_id = u.id
                  AND (CAST(:fecha_inicio_parsed AS TIMESTAMP) IS NULL OR o.created_at >= :fecha_inicio_parsed)
                  AND (CAST(:fecha_fin_parsed AS TIMESTAMP) IS NULL OR o.created_at <= :fecha_fin_parsed)
            ) AS asignados_tecnico,
            (
                SELECT COUNT(*) 
                FROM ordenes o 
                WHERE o.tecnico_id = u.id 
                  AND o.estado = 'RESUELTA'
                  AND (CAST(:fecha_inicio_parsed AS TIMESTAMP) IS NULL OR o.created_at >= :fecha_inicio_parsed)
                  AND (CAST(:fecha_fin_parsed AS TIMESTAMP) IS NULL OR o.created_at <= :fecha_fin_parsed)
            ) AS resueltos_tecnico,
            (
                SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at)) / 3600), 0)
                FROM ordenes o 
                WHERE o.tecnico_id = u.id 
                  AND o.estado = 'RESUELTA'
                  AND (CAST(:fecha_inicio_parsed AS TIMESTAMP) IS NULL OR o.created_at >= :fecha_inicio_parsed)
                  AND (CAST(:fecha_fin_parsed AS TIMESTAMP) IS NULL OR o.created_at <= :fecha_fin_parsed)
            ) AS mttr_tecnico,
            (
                SELECT COUNT(*) 
                FROM ordenes o 
                WHERE o.soporte_id = u.id
                  AND (CAST(:fecha_inicio_parsed AS TIMESTAMP) IS NULL OR o.created_at >= :fecha_inicio_parsed)
                  AND (CAST(:fecha_fin_parsed AS TIMESTAMP) IS NULL OR o.created_at <= :fecha_fin_parsed)
            ) AS gestionados_soporte
        FROM usuarios u
        WHERE u.rol IN ('Admin', 'Soporte Técnico', 'Técnico Hardware', 'Técnico Software')
        ORDER BY resueltos_tecnico DESC, gestionados_soporte DESC
    """
    res = await db.execute(text(sql), params)
    return [dict(row._mapping) for row in res.fetchall()]


@router.get("/rendimiento")
async def get_rendimiento_report(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    return await query_rendimiento_data(db, fecha_inicio, fecha_fin)


@router.get("/rendimiento/metrics")
async def get_rendimiento_metrics(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    data = await query_rendimiento_data(db, fecha_inicio, fecha_fin)

    total_usuarios = len(data)
    total_resueltos = sum(row["resueltos_tecnico"] for row in data)
    total_asignados = sum(row["asignados_tecnico"] for row in data)
    
    tasa_resolucion_global = 0
    if total_asignados > 0:
        tasa_resolucion_global = round((total_resueltos / total_asignados) * 100, 2)

    # Filtrar técnicos con resolución y promediar su MTTR
    tecnicos_con_mttr = [row["mttr_tecnico"] for row in data if row["resueltos_tecnico"] > 0]
    mttr_promedio_equipo = 0
    if tecnicos_con_mttr:
        mttr_promedio_equipo = round(sum(tecnicos_con_mttr) / len(tecnicos_con_mttr), 2)

    # Identificar el técnico más eficiente (mayor número de resueltos y menor MTTR)
    top_tecnico = "Ninguno"
    max_resueltas = 0
    for row in data:
        if row["resueltos_tecnico"] > max_resueltas:
            max_resueltas = row["resueltos_tecnico"]
            top_tecnico = f"{row['nombre']} {row['apellido']} ({row['rol']})"

    return {
        "total_usuarios_soporte": total_usuarios,
        "total_ordenes_resueltas": total_resueltos,
        "tasa_resolucion_global_porcentaje": tasa_resolucion_global,
        "mttr_promedio_equipo_horas": mttr_promedio_equipo,
        "top_tecnico_eficiencia": top_tecnico
    }


@router.get("/rendimiento/export/excel")
async def export_rendimiento_excel(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    data = await query_rendimiento_data(db, fecha_inicio, fecha_fin)

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    worksheet = workbook.add_sheet("Rendimiento Personal")

    title_format = workbook.add_format({
        'bold': True, 'font_size': 14, 'align': 'center', 'valign': 'vcenter', 'font_color': '#ffffff', 'bg_color': '#1E3A8A'
    })
    header_format = workbook.add_format({
        'bold': True, 'align': 'left', 'valign': 'vcenter', 'bg_color': '#F3F4F6', 'border': 1
    })
    cell_format = workbook.add_format({'align': 'left', 'valign': 'vcenter', 'border': 1})
    number_format = workbook.add_format({'num_format': '0.0', 'align': 'right', 'valign': 'vcenter', 'border': 1})

    worksheet.merge_range("A1:G1", "REPORTE DE DESEMPEÑO DEL EQUIPO DE SOPORTE TÉCNICO", title_format)
    worksheet.set_row(0, 30)

    headers = [
        "Usuario ID", "Nombre y Apellido", "Rol", 
        "Asignadas (Técnico)", "Resueltas (Técnico)", "Tasa de Resolución (%)", "MTTR Promedio (Horas)"
    ]
    for col, h in enumerate(headers):
        worksheet.write(2, col, h, header_format)
    worksheet.set_row(2, 20)

    for row_num, row_data in enumerate(data, start=3):
        tasa = 0.0
        if row_data["asignados_tecnico"] > 0:
            tasa = (row_data["resueltos_tecnico"] / row_data["asignados_tecnico"]) * 100.0

        worksheet.write(row_num, 0, row_data["id"], cell_format)
        worksheet.write(row_num, 1, f"{row_data['nombre']} {row_data['apellido']}", cell_format)
        worksheet.write(row_num, 2, row_data["rol"], cell_format)
        worksheet.write(row_num, 3, row_data["asignados_tecnico"], cell_format)
        worksheet.write(row_num, 4, row_data["resueltos_tecnico"], cell_format)
        worksheet.write(row_num, 5, round(tasa, 2), number_format)
        worksheet.write(row_num, 6, round(row_data["mttr_tecnico"], 2), number_format)
        worksheet.set_row(row_num, 18)

    worksheet.set_column("A:A", 12)
    worksheet.set_column("B:B", 25)
    worksheet.set_column("C:C", 18)
    worksheet.set_column("D:G", 15)

    workbook.close()
    output.seek(0)

    filename = f"rendimiento_personal_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/rendimiento/export/pdf")
async def export_rendimiento_pdf(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    data = await query_rendimiento_data(db, fecha_inicio, fecha_fin)

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=letter,
        rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=16,
        leading=20, textColor=colors.HexColor('#1E3A8A'), alignment=1, spaceAfter=15
    )
    body_style = ParagraphStyle('TableText', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10)
    header_style = ParagraphStyle('TableHeader', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white)

    story = []
    story.append(Paragraph("REPORTE DE DESEMPEÑO DEL EQUIPO TÉCNICO", title_style))
    story.append(Spacer(1, 10))

    table_data = [[
        Paragraph("Usuario ID", header_style),
        Paragraph("Especialista", header_style),
        Paragraph("Rol de Soporte", header_style),
        Paragraph("Asignadas", header_style),
        Paragraph("Resueltas", header_style),
        Paragraph("Tasa (%)", header_style),
        Paragraph("MTTR Prom (hrs)", header_style)
    ]]

    for row in data:
        tasa = 0.0
        if row["asignados_tecnico"] > 0:
            tasa = (row["resueltos_tecnico"] / row["asignados_tecnico"]) * 100.0

        table_data.append([
            Paragraph(str(row["id"]), body_style),
            Paragraph(f"{row['nombre']} {row['apellido']}", body_style),
            Paragraph(row["rol"], body_style),
            Paragraph(str(row["asignados_tecnico"]), body_style),
            Paragraph(str(row["resueltos_tecnico"]), body_style),
            Paragraph(f"{tasa:.1f}%", body_style),
            Paragraph(f"{row['mttr_tecnico']:.1f} hrs", body_style)
        ])

    col_widths = [60, 140, 100, 60, 60, 60, 70] # Total 550
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F9FAFB')]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
    ]))

    story.append(t)
    doc.build(story)
    output.seek(0)

    filename = f"rendimiento_personal_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
