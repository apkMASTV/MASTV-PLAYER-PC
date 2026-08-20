# install-cert.ps1
# Ejecutar como ADMINISTRADOR en las PCs donde instalarás MASTV Player
# Esto hace que Windows confíe en el certificado autofirmado
# y el instalador no muestre advertencias de SmartScreen.

param(
    [string]$CertPath = "$PSScriptRoot\mastv-cert.cer"
)

if (-not (Test-Path $CertPath)) {
    Write-Error "No se encontró el archivo: $CertPath"
    exit 1
}

$store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
    [System.Security.Cryptography.X509Certificates.StoreName]::Root,
    [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
)
$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
$cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CertPath)
$store.Add($cert)
$store.Close()

Write-Host ""
Write-Host "Certificado MASTV instalado correctamente." -ForegroundColor Green
Write-Host "Ahora puedes instalar MASTV Player sin advertencias de Windows." -ForegroundColor Green
Write-Host ""
