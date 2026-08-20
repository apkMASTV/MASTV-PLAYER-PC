# sign-appx.ps1 — Firma el .appx con signtool del SDK de Windows
# Requiere: Windows SDK instalado (signtool.exe)
# Si no tienes el SDK: instálalo desde https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
# O sube el .appx sin firma al Microsoft Partner Center (ellos lo firman).

param(
    [string]$AppxPath = "C:\mastv-release\MASTV Player 1.1.0.appx",
    [string]$CertPath = $(if ($env:CSC_LINK) { $env:CSC_LINK } else { "$PSScriptRoot\..\certs\mastv-cert.pfx" }),
    [string]$CertPassword = $env:CSC_KEY_PASSWORD,
    [string]$TimestampServer = "http://timestamp.digicert.com"
)

if (-not $CertPassword) {
    Write-Error "Falta la contrasena del certificado. Definela antes de firmar, por ejemplo:`n  `$env:CSC_KEY_PASSWORD = 'tu-password'"
    exit 1
}

# Buscar signtool.exe del Windows SDK
$signtoolPaths = @(
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe"
)
$signtoolPaths += (Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -ExpandProperty FullName)
$signtoolPaths += (Get-ChildItem "C:\Program Files\Microsoft Visual Studio" -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -ExpandProperty FullName)

$signtool = $signtoolPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $signtool) {
    Write-Warning "No se encontró signtool.exe. Opciones:"
    Write-Warning "  1. Instala Windows SDK: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
    Write-Warning "  2. Sube el .appx SIN firmar al Microsoft Partner Center (ellos lo firman automáticamente)"
    exit 1
}

if (-not (Test-Path $AppxPath)) {
    Write-Error "No se encontró: $AppxPath. Ejecuta primero: npm run dist:msix"
    exit 1
}

Write-Host "Usando signtool: $signtool"
Write-Host "Firmando: $AppxPath"

& $signtool sign `
    /fd sha256 `
    /td sha256 `
    /tr $TimestampServer `
    /f $CertPath `
    /p $CertPassword `
    $AppxPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "APPX firmado correctamente." -ForegroundColor Green
} else {
    Write-Error "Error al firmar el APPX. Código: $LASTEXITCODE"
}
