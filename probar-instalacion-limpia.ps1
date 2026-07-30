param(
  [switch]$Build,
  [switch]$Conservar
)

$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDirectory

function Get-FreeTcpPort {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

$suffix = ([Guid]::NewGuid().ToString("N")).Substring(0, 8)
$projectName = "scm-clean-$suffix"
$postgresPort = Get-FreeTcpPort
$backendPort = Get-FreeTcpPort
$webPort = Get-FreeTcpPort

$env:COMPOSE_PROJECT_NAME = $projectName
$env:POSTGRES_PORT = [string]$postgresPort
$env:BACKEND_PORT = [string]$backendPort
$env:WEB_PORT = [string]$webPort
$env:WEB_ORIGIN = "http://localhost:$webPort,http://127.0.0.1:$webPort"

Write-Host "Prueba aislada: $projectName"
Write-Host "Puertos temporales: web=$webPort api=$backendPort db=$postgresPort"

try {
  if ($Build) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File ".\iniciar-scm.ps1" -Build
  } else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File ".\iniciar-scm.ps1"
  }
  if ($LASTEXITCODE -ne 0) {
    throw "El iniciador devolvio un error en la instalacion aislada."
  }

  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$webPort/api/health" -Method Get
  if ($health.status -ne "ok") {
    throw "La API no informo un estado saludable."
  }

  $loginBody = @{
    email = "admin@scm.local"
    password = "SCM2026!"
  } | ConvertTo-Json
  $login = Invoke-RestMethod `
    -Uri "http://127.0.0.1:$webPort/api/seguridad/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $loginBody
  if (-not $login.token -or $login.user.role -ne "ADMIN") {
    throw "La cuenta administrativa inicial no pudo autenticarse."
  }

  $driverQuery = @'
SELECT COUNT(*)
FROM users user_account
JOIN roles role_record ON role_record.id=user_account.role_id
WHERE role_record.code='DRIVER'
  AND user_account.active
  AND user_account.license_expiry>=CURRENT_DATE
  AND NOT EXISTS (
    SELECT 1
    FROM shipments shipment
    WHERE shipment.driver_id=user_account.id
      AND shipment.status IN (
        'ASIGNADO','EN_TRANSITO','EN_ADUANA','RETRASADO',
        'INCIDENCIA','PENDIENTE_RECEPCION'
      )
  );
'@
  $availableDrivers = $driverQuery |
    & docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'
  if ($LASTEXITCODE -ne 0 -or [int]$availableDrivers -lt 5) {
    throw "La instalacion no dejo una reserva minima de cinco transportistas disponibles."
  }

  $vehicleQuery = @'
SELECT COUNT(*)
FROM vehicles vehicle
WHERE vehicle.active
  AND NOT EXISTS (
    SELECT 1
    FROM shipments shipment
    WHERE shipment.vehicle_id=vehicle.id
      AND shipment.status IN (
        'ASIGNADO','EN_TRANSITO','EN_ADUANA','RETRASADO',
        'INCIDENCIA','PENDIENTE_RECEPCION'
      )
  );
'@
  $availableVehicles = $vehicleQuery |
    & docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'
  if ($LASTEXITCODE -ne 0 -or [int]$availableVehicles -lt 8) {
    throw "La instalacion no dejo una reserva minima de ocho vehiculos disponibles."
  }

  Write-Host ""
  Write-Host "INSTALACION LIMPIA APROBADA" -ForegroundColor Green
  Write-Host "API, autenticacion, migraciones, integridad y recursos disponibles funcionan."
  Write-Host "Transportistas libres: $availableDrivers"
  Write-Host "Vehiculos libres: $availableVehicles"
} finally {
  if ($Conservar) {
    Write-Warning "Se conservo el entorno $projectName para inspeccion."
    Write-Host "Para eliminarlo: docker compose -p $projectName down -v --remove-orphans"
  } else {
    Write-Host "Eliminando unicamente el entorno aislado $projectName..."
    & docker compose -p $projectName down -v --remove-orphans
  }
}
