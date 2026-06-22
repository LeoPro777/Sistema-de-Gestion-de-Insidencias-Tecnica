from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
import io
import xlsxwriter
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from app.core.database import get_db
from app.models.auth import Usuario
from app.models.devices import Dispositivo, Traslado, AreaHospital
from app.models.incidents import Orden
from app.routers.auth import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

# --- INDICADORES ANALÍTICOS (METRICAS) ---

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


# --- REPORTES FILTRADOS Y EXPORTACIÓN EN MEMORIA ---

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
        # Sumar 1 día para incluir todo el día final
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
    """
    Obtiene los traslados y desincorporaciones filtradas dinámicamente.
    """
    return await query_traslados_data(db, area_origen_id, area_destino_id, ejecutor_id, fecha_inicio, fecha_fin)

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
    """
    Genera en memoria un libro Excel (.xlsx) estructurado con los traslados patrimoniales filtrados.
    """
    data = await query_traslados_data(db, area_origen_id, area_destino_id, ejecutor_id, fecha_inicio, fecha_fin)

    # BytesIO buffer
    output = io.BytesIO()
    
    # Crear libro de trabajo en memoria
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    worksheet = workbook.add_sheet("Traslados Patrimoniales")

    # Formatos estéticos
    title_format = workbook.add_format({
        'bold': True, 'font_size': 14, 'align': 'center', 'valign': 'vcenter', 'font_color': '#ffffff', 'bg_color': '#1E3A8A'
    })
    header_format = workbook.add_format({
        'bold': True, 'align': 'left', 'valign': 'vcenter', 'bg_color': '#F3F4F6', 'border': 1
    })
    cell_format = workbook.add_format({'align': 'left', 'valign': 'vcenter', 'border': 1})
    date_format = workbook.add_format({'num_format': 'yyyy-mm-dd hh:mm:ss', 'align': 'left', 'valign': 'vcenter', 'border': 1})

    # Fila de Título
    worksheet.merge_range("A1:J1", "REPORTE DE MOVIMIENTOS PATRIMONIALES Y BAJAS", title_format)
    worksheet.set_row(0, 30)

    # Encabezados
    headers = [
        "ID", "Código Activo", "Serial", "Marca", "Origen", 
        "Destino", "Motivo", "Tipo Movimiento", "Administrador", "Fecha"
    ]
    
    for col_num, header in enumerate(headers):
        worksheet.write(2, col_num, header, header_format)
    worksheet.set_row(2, 20)

    # Inyección de datos
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
        
        # Fecha formateada
        dt = row_data["created_at"]
        worksheet.write_datetime(row_num, 9, dt, date_format)
        worksheet.set_row(row_num, 18)

    # Ajustar anchos
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
    """
    Genera en memoria un documento PDF oficial (.pdf) con los traslados y bajas patrimoniales filtradas.
    """
    data = await query_traslados_data(db, area_origen_id, area_destino_id, ejecutor_id, fecha_inicio, fecha_fin)

    # BytesIO buffer
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=letter,
        rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30
    )

    styles = getSampleStyleSheet()
    
    # Crear estilos personalizados
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#1E3A8A'),
        alignment=1, # Centrado
        spaceAfter=15
    )
    
    body_style = ParagraphStyle(
        'TableText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10
    )
    
    header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    story = []
    
    # Título del PDF
    story.append(Paragraph("REPORTE OFICIAL DE TRASLADOS Y BAJAS PATRIMONIALES", title_style))
    story.append(Spacer(1, 10))

    # Formatear la tabla
    # Columnas cortadas para caber en una hoja carta horizontal/vertical:
    # Codigo, Origen, Destino, Movimiento, Administrador, Fecha
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

    # Construir tabla PDF
    col_widths = [80, 100, 100, 80, 110, 80] # Total 550 ptos (hoja carta son 612 ancho)
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
