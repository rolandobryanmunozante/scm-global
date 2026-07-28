$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDirectory

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker no está instalado o no está disponible en PATH."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop no está iniciado. Ábralo y vuelva a ejecutar este archivo."
}

if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  Write-Host "Se creó .env a partir de .env.example."
}

Write-Host "Construyendo e iniciando SCM Global..."
docker compose up -d --build --wait
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose no pudo iniciar el sistema."
}

Write-Host ""
docker compose ps
Write-Host ""
Write-Host "SCM Global está disponible en http://localhost:8080"
Write-Host "API y comprobación de salud: http://localhost:4000/api/health"
Write-Host "Usuario: admin@scm.local"
Write-Host "Contraseña: SCM2026!"
