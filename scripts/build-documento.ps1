<#
    Genera la documentacion entregable de AURORA.

      1. Renderiza los diagramas PlantUML (.puml -> .png)
      2. Convierte los capitulos Markdown a un unico HTML con estilos de Word
      3. Antepone la portada
      4. Abre el HTML en Word y lo guarda como .docx y como .pdf

    Uso:   powershell -ExecutionPolicy Bypass -File scripts\build-documento.ps1
           ... -SoloDiagramas      solo renderiza los .puml
           ... -SinPdf             omite la exportacion a PDF
#>

param(
    [switch]$SoloDiagramas,
    [switch]$SinPdf
)

$ErrorActionPreference = 'Stop'

$raiz      = Split-Path -Parent $PSScriptRoot
$docs      = Join-Path $raiz 'docs'
$documento = Join-Path $docs  'documento'
$diagSrc   = Join-Path $docs  'diagramas\src'
$diagPng   = Join-Path $docs  'diagramas\png'
$salida    = Join-Path $raiz  'entregable'
$plantuml  = Join-Path $PSScriptRoot 'plantuml.jar'

New-Item -ItemType Directory -Force -Path $salida  | Out-Null
New-Item -ItemType Directory -Force -Path $diagPng | Out-Null

# --- 1. Diagramas ----------------------------------------------------------
Write-Host "`n[1/4] Renderizando diagramas UML..." -ForegroundColor Cyan

if (-not (Test-Path $plantuml)) {
    throw "No se encontro plantuml.jar en $plantuml"
}

$fuentes = Get-ChildItem -Path $diagSrc -Filter *.puml -ErrorAction SilentlyContinue
if ($fuentes.Count -eq 0) {
    Write-Host "      (sin diagramas que renderizar)" -ForegroundColor DarkGray
} else {
    & java -jar $plantuml -tpng -charset UTF-8 -o $diagPng "$diagSrc\*.puml"
    if ($LASTEXITCODE -ne 0) { throw "PlantUML fallo con codigo $LASTEXITCODE" }
    $generados = (Get-ChildItem -Path $diagPng -Filter *.png).Count
    Write-Host "      $generados diagramas generados" -ForegroundColor Green
}

if ($SoloDiagramas) { Write-Host "`nListo (solo diagramas).`n"; exit 0 }

# --- 2. Markdown -> HTML ---------------------------------------------------
Write-Host "`n[2/4] Convirtiendo capitulos a HTML..." -ForegroundColor Cyan

# El orden de los capitulos lo define el prefijo numerico del nombre.
$capitulos = Get-ChildItem -Path $documento -Filter *.md | Sort-Object Name
if ($capitulos.Count -eq 0) { throw "No hay capitulos .md en $documento" }

$cuerpoHtml = Join-Path $salida '_cuerpo.html'
$rutas = $capitulos | ForEach-Object { $_.FullName }
& node (Join-Path $PSScriptRoot 'md-a-html.mjs') $cuerpoHtml @rutas
if ($LASTEXITCODE -ne 0) { throw "La conversion Markdown fallo" }

# --- 3. Portada + cuerpo ---------------------------------------------------
Write-Host "`n[3/4] Ensamblando el documento..." -ForegroundColor Cyan

$portada = Join-Path $documento '00-portada.html'
$html    = Get-Content $cuerpoHtml -Raw -Encoding UTF8

if (Test-Path $portada) {
    $fragmentoPortada = Get-Content $portada -Raw -Encoding UTF8
    # se inserta inmediatamente despues de <body>
    $html = $html -replace '(?s)(<body>)', "`$1`n$fragmentoPortada"
}

$htmlFinal = Join-Path $salida 'AURORA-Parcial1.html'
[System.IO.File]::WriteAllText($htmlFinal, $html, (New-Object System.Text.UTF8Encoding $true))
Write-Host "      $htmlFinal" -ForegroundColor Green

# --- 4. HTML -> DOCX / PDF -------------------------------------------------
Write-Host "`n[4/4] Generando Word y PDF..." -ForegroundColor Cyan

$docx = Join-Path $salida 'AURORA-Parcial1.docx'
$pdf  = Join-Path $salida 'AURORA-Parcial1.pdf'

$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $doc = $word.Documents.Open($htmlFinal, [ref]$false, [ref]$false)

    # wdFormatDocumentDefault = 16
    $doc.SaveAs2($docx, 16)
    Write-Host "      $docx" -ForegroundColor Green

    if (-not $SinPdf) {
        # wdFormatPDF = 17
        $doc.SaveAs2($pdf, 17)
        Write-Host "      $pdf" -ForegroundColor Green
    }

    $doc.Close(0)
}
finally {
    if ($word) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
}

Remove-Item $cuerpoHtml -ErrorAction SilentlyContinue

Write-Host "`nDocumento generado en: $salida`n" -ForegroundColor Cyan
Write-Host "Recorda abrir el .docx y generar el indice automatico:" -ForegroundColor Yellow
Write-Host "  Referencias -> Tabla de contenido -> Tabla automatica`n" -ForegroundColor Yellow
