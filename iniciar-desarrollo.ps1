param()

$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDirectory

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker no esta instalado o no esta disponible en PATH."
}

if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
  throw "pnpm no esta instalado. Ejecute: npm install --global pnpm@11.9.0"
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop no esta iniciado. Abralo y espere a que el motor quede listo."
}

if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  Write-Host "Se creo .env a partir de .env.example."
}

Write-Host "Deteniendo frontend y backend de Docker para liberar los puertos de desarrollo..."
docker compose stop frontend backend
if ($LASTEXITCODE -ne 0) {
  throw "No se pudieron detener los servicios web de Docker."
}

Write-Host "Iniciando PostgreSQL y aplicando migraciones pendientes..."
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL no pudo iniciarse."
}

docker compose run --rm migrate
if ($LASTEXITCODE -ne 0) {
  throw "Las migraciones no pudieron aplicarse."
}

if (-not (Test-Path -LiteralPath "node_modules")) {
  Write-Host "Instalando dependencias del monorepositorio..."
  pnpm.cmd install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm no pudo instalar las dependencias."
  }
}

Get-Content -LiteralPath ".env" | ForEach-Object {
  if ($_ -match "^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
  }
}
$env:NODE_ENV = "development"

Write-Host ""
Write-Host "Modo desarrollo:"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  API:      http://localhost:4000/api"
Write-Host "  Usuario:  admin@scm.local"
Write-Host "  Clave:    SCM2026!"
Write-Host ""
Write-Host "Presione Ctrl+C para detener frontend y backend de desarrollo."
Write-Host "Para volver al modo Docker completo ejecute .\iniciar-scm.ps1"
Write-Host ""

pnpm.cmd dev
