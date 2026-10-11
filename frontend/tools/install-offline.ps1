# Instalador offline: extrae vendor/*.tgz a node_modules con anidacion correcta.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-offline.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deps-lib.ps1')

$Frontend = Split-Path $PSScriptRoot -Parent
$VendorDir = Join-Path $Frontend 'vendor'
$NodeModules = Join-Path $Frontend 'node_modules'

Write-Output '== Limpiando node_modules =='
if (Test-Path $NodeModules) { Remove-Item $NodeModules -Recurse -Force }
New-Item -ItemType Directory -Path $NodeModules | Out-Null

# Indexar tarballs: name@version -> file (dedupe por nombre+version)
$index = @{}
foreach ($f in Get-ChildItem $VendorDir -Filter '*.tgz') {
  $pj = $null
  try { $pj = Get-TarballPackageJson $f.FullName } catch { $pj = $null }
  if (-not $pj -or -not $pj.name -or -not $pj.version) { continue }
  $key = $pj.name + '@' + $pj.version
  if (-not $index.ContainsKey($key)) { $index[$key] = @{ File = $f.FullName; Pj = $pj } }
}
$byName = @{}
foreach ($key in $index.Keys) {
  $n = $key.Substring(0, $key.LastIndexOf('@'))
  if (-not $byName.ContainsKey($n)) { $byName[$n] = @() }
  $byName[$n] += $index[$key]
}
Write-Output ("Tarballs indexados: {0} ({1} paquetes)" -f $index.Count, $byName.Count)

function Test-PjPlatform($pj) {
  if ($pj.os -and @($pj.os) -notcontains 'win32') { return $false }
  if ($pj.cpu -and @($pj.cpu) -notcontains 'x64') { return $false }
  return $true
}
function Install-One($entry, $parentDir) {
  # parentDir = carpeta que CONTIENE node_modules\
  $pj = $entry.Pj
  $tmp = Join-Path $env:TEMP ('npmx-' + [guid]::NewGuid().ToString('n'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    tar -xf $entry.File -C $tmp
    $rootItem = Get-ChildItem $tmp | Select-Object -First 1
    if (-not $rootItem) { throw "tarball vacio: $($entry.File)" }
    $dest = Join-Path $parentDir ('node_modules\' + ($pj.name -replace '/', '\'))
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    $destParent = Split-Path $dest -Parent
    New-Item -ItemType Directory -Path $destParent -Force | Out-Null
    Move-Item -LiteralPath $rootItem.FullName -Destination $dest
  }
  finally { if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force } }
}
function Find-InChain([string]$startDir, [string]$name, [string]$range) {
  $d = $startDir
  $stop = Split-Path $Frontend -Parent
  while ($d -and $d -ne $stop) {
    $leaf = Split-Path $d -Leaf
    if ($leaf -eq 'node_modules') { $cand = Join-Path $d ($name -replace '/', '\') }
    else { $cand = Join-Path $d ('node_modules\' + ($name -replace '/', '\')) }
    if (Test-Path (Join-Path $cand 'package.json')) {
      $cpj = Get-Content (Join-Path $cand 'package.json') -Raw | ConvertFrom-Json
      if (Test-Range $cpj.version $range) { return $true }
    }
    $d = Split-Path $d -Parent
  }
  return $false
}
function Select-Best([string]$name, [string]$range) {
  if (-not $byName.ContainsKey($name)) { return $null }
  $best = $null
  foreach ($e in $byName[$name]) {
    if (-not (Test-PjPlatform $e.Pj)) { continue }
    if (-not (Test-Range $e.Pj.version $range)) { continue }
    if ($null -eq $best) { $best = $e; continue }
    $c = CompareVer (ParseVer $e.Pj.version) (ParseVer $best.Pj.version)
    if ($c -gt 0) { $best = $e }
  }
  return $best
}

# Nivel 0: una copia por nombre (la version mas alta) en node_modules/
$queue = New-Object System.Collections.Queue
$installedTop = @{}
$missing = @()
foreach ($name in ($byName.Keys | Sort-Object)) {
  $best = $null
  foreach ($e in $byName[$name]) {
    if (-not (Test-PjPlatform $e.Pj)) { continue }
    if ($null -eq $best) { $best = $e; continue }
    $c = CompareVer (ParseVer $e.Pj.version) (ParseVer $best.Pj.version)
    if ($c -gt 0) { $best = $e }
  }
  if (-not $best) { continue }
  Install-One $best $Frontend
  $installedTop[$name] = $best.Pj.version
  $queue.Enqueue(@{ Dir = $NodeModules; Pj = $best.Pj })
}
Write-Output ("Instalados en raiz: {0}" -f $installedTop.Count)

# BFS: anidar lo que no resuelve en la cadena
$steps = 0
while ($queue.Count -gt 0) {
  $item = $queue.Dequeue()
  $pj = $item.Pj
  $dir = $item.Dir
  $specs = [ordered]@{}
  if ($pj.dependencies) { $pj.dependencies.PSObject.Properties | ForEach-Object { $specs[$_.Name] = [pscustomobject]@{ Range = $_.Value; Opt = $false } } }
  if ($pj.optionalDependencies) { $pj.optionalDependencies.PSObject.Properties | ForEach-Object { if (-not $specs.Contains($_.Name)) { $specs[$_.Name] = [pscustomobject]@{ Range = $_.Value; Opt = $true } } } }
  foreach ($depName in $specs.Keys) {
    $dep = $specs[$depName]
    $steps++
    if (Find-InChain $dir $depName $dep.Range) { continue }
    $pick = Select-Best $depName $dep.Range
    if (-not $pick) {
      if ($dep.Opt) { continue }
      $missing += ('{0}@{1} requerido por {2}@{3}' -f $depName, $dep.Range, $pj.name, $pj.version)
      continue
    }
    Install-One $pick $dir
    $queue.Enqueue(@{ Dir = (Join-Path $dir ('node_modules\' + ($depName -replace '/', '\'))); Pj = $pick.Pj })
  }
}

Write-Output ("Dependencias evaluadas: {0}" -f $steps)
if ($missing.Count -gt 0) {
  Write-Output 'FALTAN:'
  $missing | ForEach-Object { Write-Output ('  ' + $_) }
  exit 1
}
Write-Output '== Instalacion offline completa =='
