param(
  [switch]$Reiniciar,
  [switch]$Build,
  [switch]$SinAbrir,
  [switch]$Detener
)

$ErrorActionPreference = "Stop"
$projectName = "scm-global-demo"
$demoUrl = "http://localhost:8081"

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "No se encontro '$Name'. Instale Docker Desktop y vuelva a intentarlo."
  }
}

try {
  if (-not (Test-Path -LiteralPath ".\docker-compose.yml")) {
    throw "Ejecute este script desde la carpeta raiz de SCM Global."
  }
  Assert-Command "docker"
  docker compose version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose no esta disponible."
  }

  $env:COMPOSE_PROJECT_NAME = $projectName
  $env:POSTGRES_DB = "scm_global_demo"
  $env:POSTGRES_PORT = "5436"
  $env:BACKEND_PORT = "4001"
  $env:WEB_PORT = "8081"
  $env:WEB_ORIGIN = "http://localhost:8081,http://127.0.0.1:8081"
  $env:DEMO_MODE = "true"
  $env:JWT_SECRET = "scm-live-demo-isolated-secret-2026"

  if ($Detener) {
    Write-Output "Deteniendo la demo operativa y conservando su base aislada..."
    docker compose down --remove-orphans
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo detener el entorno de demostracion."
    }
    Write-Output "Demo detenida. El sistema normal y los datos de la demo no fueron eliminados."
    exit 0
  }

  if ($Reiniciar) {
    Write-Output "Reiniciando unicamente la base aislada '$projectName'..."
    docker compose down --volumes --remove-orphans
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo limpiar el entorno de demostracion."
    }
  }

  docker compose config --quiet
  if ($LASTEXITCODE -ne 0) {
    throw "La configuracion Docker de la demo no es valida."
  }

  if ($Build) {
    Write-Output "Construyendo la demo desde el codigo local..."
    docker compose up -d --build --wait
  } else {
    Write-Output "Descargando las imagenes publicadas mas recientes..."
    docker compose pull
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudieron descargar las imagenes Docker."
    }
    docker compose up -d --wait
  }
  if ($LASTEXITCODE -ne 0) {
    throw "La demo no pudo iniciar todos sus servicios."
  }

  $health = Invoke-RestMethod -Uri "http://localhost:4001/api/health" -TimeoutSec 20
  if ($health.status -ne "ok" -or -not $health.database) {
    throw "La API de demostracion no confirmo la conexion con su base aislada."
  }

  Write-Output ""
  Write-Output "DEMO OPERATIVA LISTA"
  Write-Output "Web: $demoUrl"
  Write-Output "API: http://localhost:4001/api/health"
  Write-Output "Base aislada: ${projectName}_scm_postgres_data"
  Write-Output "Usuario: admin@scm.local"
  Write-Output "Contrasena: SCM2026!"
  Write-Output ""
  Write-Output "Entre a 'Demo operativa' y pulse 'Iniciar flujo completo'."
  Write-Output "Para comenzar desde una base vacia repita el comando con -Reiniciar."

  if (-not $SinAbrir) {
    Start-Process $demoUrl
  }
} catch {
  Write-Error $_
  Write-Output ""
  Write-Output "Estado del entorno de demostracion:"
  docker compose ps 2>$null
  Write-Output ""
  Write-Output "Ultimos registros:"
  docker compose logs --tail 80 --no-color 2>$null
  exit 1
}
