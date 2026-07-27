$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDirectory

docker compose down
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose no pudo detener el sistema."
}

Write-Host "SCM Global fue detenido. Los datos permanecen guardados en el volumen de PostgreSQL."
