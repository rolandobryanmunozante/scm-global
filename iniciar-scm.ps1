param(
  [switch]$Build,
  [switch]$OmitirVerificacionBase
)

$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDirectory

function Invoke-Compose {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )

  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

function Show-SupportDiagnostics {
  Write-Host ""
  Write-Host "Diagnostico automatico de la instalacion" -ForegroundColor Yellow
  & docker compose ps -a
  $diagnosticLogs = (& docker compose logs --no-color --tail 120 postgres migrate backend 2>&1 | Out-String)
  Write-Host $diagnosticLogs

  if ($diagnosticLogs -match "password authentication failed|role .* does not exist") {
    Write-Warning "PostgreSQL conserva un volumen creado con credenciales diferentes a las de .env."
    Write-Warning "Si es una instalacion de demostracion sin informacion importante, consulte la recuperacion de base local en docs/GUIA_INSTALACION.md."
    Write-Warning "Si existen datos importantes, no elimine el volumen: haga una copia y recupere las credenciales."
  }

  Write-Host "Registros completos: docker compose logs postgres migrate backend" -ForegroundColor Yellow
}

try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker no esta instalado o no esta disponible en PATH."
  }

  & docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop no esta iniciado. Abralo y espere a que el motor este listo."
  }

  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose v2 no esta disponible. Actualice Docker Desktop."
  }

  if (-not (Test-Path -LiteralPath ".env")) {
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
    Write-Host "Se creo .env a partir de .env.example."
  }

  Invoke-Compose -Arguments @("config", "--quiet") -FailureMessage "La configuracion de Docker Compose o el archivo .env no son validos."

  if ($Build) {
    Write-Host "Construyendo e iniciando SCM Global desde el codigo local..."
    Invoke-Compose -Arguments @("up", "-d", "--build", "--wait") -FailureMessage "Docker Compose no pudo construir o iniciar el sistema."
  } else {
    Write-Host "Descargando las imagenes publicadas de SCM Global..."
    Invoke-Compose -Arguments @("pull") -FailureMessage "No se pudieron descargar las imagenes publicadas."
    Write-Host "Iniciando SCM Global y aplicando migraciones pendientes..."
    Invoke-Compose -Arguments @("up", "-d", "--no-build", "--wait") -FailureMessage "Docker Compose no pudo iniciar el sistema."
  }

  if (-not $OmitirVerificacionBase) {
    Write-Host "Verificando integridad de la base de datos..."
    & docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /database/verify.sql'
    if ($LASTEXITCODE -ne 0) {
      throw "La base de datos inicio, pero no supero la verificacion de integridad."
    }
  }

  Write-Host ""
  & docker compose ps
  $webBinding = (& docker compose port frontend 80 | Select-Object -First 1)
  $backendBinding = (& docker compose port backend 4000 | Select-Object -First 1)
  $webPublishedPort = ($webBinding -split ":")[-1]
  $backendPublishedPort = ($backendBinding -split ":")[-1]
  Write-Host ""
  Write-Host "SCM Global esta disponible en http://localhost:$webPublishedPort" -ForegroundColor Green
  Write-Host "API y comprobacion de salud: http://localhost:$backendPublishedPort/api/health"
  Write-Host "Telemetria demostrativa: activa automaticamente cada 15 segundos"
  Write-Host "Usuario: admin@scm.local"
  Write-Host "Contrasena: SCM2026!"
} catch {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    Show-SupportDiagnostics
  }
  throw
}
