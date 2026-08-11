from datetime import datetime
import io
from typing import Any, Dict, List, Optional

try:
    from database import get_case, get_case_readings
except ImportError:
    from backend.database import get_case, get_case_readings


def _calc_stats(values: List[float]) -> Dict[str, Optional[float]]:
    if not values:
        return {"min": None, "max": None, "avg": None}
    return {
        "min": round(min(values), 1),
        "max": round(max(values), 1),
        "avg": round(sum(values) / len(values), 1)
    }


def generate_report_html(case_id: str) -> str:
    """
    Generates a clean HTML string styled like a hospital anaesthesia chart.
    Includes case info, summary statistics (min/max/avg), and full readings log.
    """
    case_info = get_case(case_id) or {"case_id": case_id, "started_at": "--", "ended_at": "--", "status": "unknown"}
    readings = get_case_readings(case_id)

    def fmt_ts(iso_str: Optional[str]) -> str:
        if not iso_str or iso_str == "--":
            return "--"
        try:
            d = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
            return d.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return iso_str

    started_at_str = fmt_ts(case_info.get("started_at"))
    ended_at_str = fmt_ts(case_info.get("ended_at"))

    hrs = [r["heart_rate"] for r in readings if r.get("heart_rate") is not None]
    spo2s = [r["spo2"] for r in readings if r.get("spo2") is not None]
    sbps = [r["bp_systolic"] for r in readings if r.get("bp_systolic") is not None]
    dbps = [r["bp_diastolic"] for r in readings if r.get("bp_diastolic") is not None]
    etco2s = [r["etco2"] for r in readings if r.get("etco2") is not None]

    hr_stats = _calc_stats(hrs)
    spo2_stats = _calc_stats(spo2s)
    sbp_stats = _calc_stats(sbps)
    dbp_stats = _calc_stats(dbps)
    etco2_stats = _calc_stats(etco2s)

    rows_html = ""
    for idx, r in enumerate(readings, 1):
        ts = fmt_ts(r.get("timestamp"))
        hr = f"{int(round(r['heart_rate']))}" if r.get("heart_rate") is not None else "--"
        spo2 = f"{int(round(r['spo2']))}%" if r.get("spo2") is not None else "--"
        if r.get("bp_systolic") is not None and r.get("bp_diastolic") is not None:
            bp = f"{int(round(r['bp_systolic']))}/{int(round(r['bp_diastolic']))}"
        else:
            bp = "--"
        etco2 = f"{int(round(r['etco2']))}" if r.get("etco2") is not None else "--"

        rows_html += f"""
        <tr>
            <td style="text-align: center;">{idx}</td>
            <td>{ts}</td>
            <td style="color: #047857; font-weight: bold; text-align: center;">{hr}</td>
            <td style="color: #0284c7; font-weight: bold; text-align: center;">{spo2}</td>
            <td style="color: #b91c1c; font-weight: bold; text-align: center;">{bp}</td>
            <td style="color: #b45309; font-weight: bold; text-align: center;">{etco2}</td>
        </tr>
        """

    if not rows_html:
        rows_html = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No readings recorded for this case.</td></tr>'

    def fmt_stat(stat_dict, unit=""):
        if stat_dict["min"] is None:
            return "--"
        return f"Min: {stat_dict['min']}{unit} | Max: {stat_dict['max']}{unit} | Avg: {stat_dict['avg']}{unit}"

    bp_stat_str = "--"
    if sbp_stats["min"] is not None and dbp_stats["min"] is not None:
        bp_stat_str = f"SBP (Min: {sbp_stats['min']} | Max: {sbp_stats['max']} | Avg: {sbp_stats['avg']}) / DBP (Min: {dbp_stats['min']} | Max: {dbp_stats['max']} | Avg: {dbp_stats['avg']})"

    status_str = case_info.get("status", "active")

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Digital Anaesthesia Record - {case_id}</title>
    <style>
        @page {{
            size: A4;
            margin: 15mm;
        }}
        body {{
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1f2937;
            margin: 0;
            padding: 0;
            font-size: 12px;
            line-height: 1.4;
        }}
        .header-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 10px;
        }}
        .header-title {{
            font-size: 20px;
            font-weight: bold;
            color: #0284c7;
            margin: 0;
        }}
        .header-sub {{
            font-size: 11px;
            color: #6b7280;
            margin-top: 2px;
        }}
        .meta-box {{
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 20px;
        }}
        .meta-grid {{
            width: 100%;
            border-collapse: collapse;
        }}
        .meta-grid td {{
            padding: 4px 0;
            vertical-align: top;
        }}
        .meta-label {{
            font-weight: bold;
            color: #475569;
            width: 120px;
        }}
        .meta-val {{
            color: #0f172a;
        }}
        .status-badge {{
            display: inline-block;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            background-color: #e2e8f0;
            color: #334155;
        }}
        .status-ended {{
            background-color: #fee2e2;
            color: #991b1b;
        }}
        .status-active {{
            background-color: #dcfce7;
            color: #166534;
        }}
        .section-title {{
            font-size: 14px;
            font-weight: bold;
            color: #0f172a;
            margin-top: 15px;
            margin-bottom: 8px;
            border-left: 4px solid #0284c7;
            padding-left: 8px;
        }}
        .summary-card {{
            background-color: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 20px;
        }}
        .summary-item {{
            margin-bottom: 6px;
        }}
        .summary-item:last-child {{
            margin-bottom: 0;
        }}
        .summary-name {{
            font-weight: bold;
            color: #334155;
        }}
        .readings-table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }}
        .readings-table th {{
            background-color: #0f172a;
            color: #ffffff;
            font-weight: bold;
            text-align: left;
            padding: 8px;
            font-size: 11px;
        }}
        .readings-table td {{
            padding: 7px 8px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 11px;
        }}
        .readings-table tr:nth-child(even) {{
            background-color: #f8fafc;
        }}
        .footer {{
            margin-top: 30px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
        }}
    </style>
</head>
<body>
    <table class="header-table">
        <tr>
            <td>
                <div class="header-title">Digital Anaesthesia Record</div>
                <div class="header-sub">Automated Patient Vital Signs Charting Report</div>
            </td>
            <td style="text-align: right; vertical-align: bottom;">
                <span class="status-badge status-{status_str}">{status_str.upper()}</span>
            </td>
        </tr>
    </table>

    <div class="meta-box">
        <table class="meta-grid">
            <tr>
                <td class="meta-label">Case ID:</td>
                <td class="meta-val"><strong>{case_info.get('case_id')}</strong></td>
                <td class="meta-label">Total Readings:</td>
                <td class="meta-val"><strong>{len(readings)} cycles</strong></td>
            </tr>
            <tr>
                <td class="meta-label">Start Time:</td>
                <td class="meta-val">{started_at_str}</td>
                <td class="meta-label">End Time:</td>
                <td class="meta-val">{ended_at_str}</td>
            </tr>
        </table>
    </div>

    <div class="section-title">Case Vital Signs Statistical Summary</div>
    <div class="summary-card">
        <div class="summary-item"><span class="summary-name" style="color: #047857;">Heart Rate (bpm):</span> {fmt_stat(hr_stats, " bpm")}</div>
        <div class="summary-item"><span class="summary-name" style="color: #0284c7;">SpO2 (%):</span> {fmt_stat(spo2_stats, "%")}</div>
        <div class="summary-item"><span class="summary-name" style="color: #b91c1c;">Blood Pressure (mmHg):</span> {bp_stat_str}</div>
        <div class="summary-item"><span class="summary-name" style="color: #b45309;">EtCO2 (mmHg):</span> {fmt_stat(etco2_stats, " mmHg")}</div>
    </div>

    <div class="section-title">Detailed Time-Series Vitals Log</div>
    <table class="readings-table">
        <thead>
            <tr>
                <th style="width: 35px; text-align: center;">#</th>
                <th style="width: 140px;">Timestamp</th>
                <th style="text-align: center;">Heart Rate (bpm)</th>
                <th style="text-align: center;">SpO2 (%)</th>
                <th style="text-align: center;">Blood Pressure (mmHg)</th>
                <th style="text-align: center;">EtCO2 (mmHg)</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>

    <div class="footer">
        Generated by Digital Anaesthesia Digitizer System &bull; Confidential Medical Chart
    </div>
</body>
</html>
"""
    return html_content


def _generate_pdf_reportlab(case_id: str) -> bytes:
    """ReportLab fallback generator to guarantee a valid downloadable PDF."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0284c7'),
        fontName='Helvetica-Bold'
    )
    sub_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=12,
        textColor=colors.HexColor('#6b7280'),
        fontName='Helvetica'
    )
    section_style = ParagraphStyle(
        'SecTitle',
        parent=styles['Heading2'],
        fontSize=12,
        leading=15,
        textColor=colors.HexColor('#0f172a'),
        fontName='Helvetica-Bold',
        spaceBefore=10,
        spaceAfter=6
    )

    story.append(Paragraph("Digital Anaesthesia Record", title_style))
    story.append(Paragraph("Automated Patient Vital Signs Charting Report", sub_style))
    story.append(Spacer(1, 10))

    case_info = get_case(case_id) or {"case_id": case_id, "started_at": "--", "ended_at": "--", "status": "unknown"}
    readings = get_case_readings(case_id)

    meta_data = [
        [Paragraph(f"<b>Case ID:</b> {case_info.get('case_id')}", styles['Normal']), Paragraph(f"<b>Status:</b> {case_info.get('status', '').upper()}", styles['Normal'])],
        [Paragraph(f"<b>Start Time:</b> {case_info.get('started_at', '--')}", styles['Normal']), Paragraph(f"<b>End Time:</b> {case_info.get('ended_at', '--')}", styles['Normal'])],
        [Paragraph(f"<b>Total Readings:</b> {len(readings)} cycles", styles['Normal']), Paragraph("", styles['Normal'])]
    ]
    meta_table = Table(meta_data, colWidths=[270, 270])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Case Vital Signs Statistical Summary", section_style))

    hrs = [r["heart_rate"] for r in readings if r.get("heart_rate") is not None]
    spo2s = [r["spo2"] for r in readings if r.get("spo2") is not None]
    sbps = [r["bp_systolic"] for r in readings if r.get("bp_systolic") is not None]
    dbps = [r["bp_diastolic"] for r in readings if r.get("bp_diastolic") is not None]
    etco2s = [r["etco2"] for r in readings if r.get("etco2") is not None]

    hr_s = _calc_stats(hrs)
    spo2_s = _calc_stats(spo2s)
    sbp_s = _calc_stats(sbps)
    dbp_s = _calc_stats(dbps)
    etco2_s = _calc_stats(etco2s)

    def s_str(s, unit=""):
        return f"Min: {s['min']}{unit} | Max: {s['max']}{unit} | Avg: {s['avg']}{unit}" if s['min'] is not None else "--"

    bp_s_str = "--"
    if sbp_s['min'] is not None and dbp_s['min'] is not None:
        bp_s_str = f"SBP ({s_str(sbp_s)}) / DBP ({s_str(dbp_s)})"

    sum_data = [
        [Paragraph("<b>Heart Rate (bpm):</b>", styles['Normal']), Paragraph(s_str(hr_s, " bpm"), styles['Normal'])],
        [Paragraph("<b>SpO2 (%):</b>", styles['Normal']), Paragraph(s_str(spo2_s, "%"), styles['Normal'])],
        [Paragraph("<b>Blood Pressure:</b>", styles['Normal']), Paragraph(bp_s_str, styles['Normal'])],
        [Paragraph("<b>EtCO2 (mmHg):</b>", styles['Normal']), Paragraph(s_str(etco2_s, " mmHg"), styles['Normal'])]
    ]
    sum_table = Table(sum_data, colWidths=[140, 400])
    sum_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#ffffff')),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(sum_table)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Detailed Time-Series Vitals Log", section_style))

    table_data = [["#", "Timestamp", "Heart Rate", "SpO2", "Blood Pressure", "EtCO2"]]
    for idx, r in enumerate(readings, 1):
        ts = r.get("timestamp", "--")[:19].replace("T", " ")
        hr = f"{int(round(r['heart_rate']))}" if r.get("heart_rate") is not None else "--"
        spo2 = f"{int(round(r['spo2']))}%" if r.get("spo2") is not None else "--"
        bp = f"{int(round(r['bp_systolic']))}/{int(round(r['bp_diastolic']))}" if r.get("bp_systolic") is not None and r.get("bp_diastolic") is not None else "--"
        etco2 = f"{int(round(r['etco2']))}" if r.get("etco2") is not None else "--"
        table_data.append([str(idx), ts, hr, spo2, bp, etco2])

    if len(table_data) == 1:
        table_data.append(["-", "--", "--", "--", "--", "--"])

    t = Table(table_data, colWidths=[30, 130, 95, 95, 100, 90])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t)

    doc.build(story)
    return buffer.getvalue()


def generate_report_pdf(case_id: str) -> bytes:
    """
    Generates PDF bytes for case_id using WeasyPrint if available,
    falling back to ReportLab.
    """
    try:
        from weasyprint import HTML
        html_str = generate_report_html(case_id)
        return HTML(string=html_str).write_pdf()
    except Exception as e:
        return _generate_pdf_reportlab(case_id)
