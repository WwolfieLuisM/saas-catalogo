# Recopila tarballs de todo el árbol de dependencias en vendor\flat\.
# Uso: powershell -ExecutionPolicy Bypass -File vendor-fetch.ps1
$ErrorActionPreference = 'Stop'
$frontend = Split-Path $PSScriptRoot -Parent
$vendor = Join-Path $frontend 'vendor'
$log = Join-Path $PSScriptRoot 'fetch-deps.log'
$doneMarker = Join-Path $PSScriptRoot 'fetch-done.marker'
Remove-Item $log, $doneMarker -ErrorAction SilentlyContinue
function Log([string]$m) { Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }

# Renombrar descargas del usuario a nombres planos sin colisiones
$copyMap = @{
  'node-26.6.5.tgz'                          = 'types-node-26.6.5.tgz'
  'react-19.3.0 (1).tgz'                     = 'types-react-19.3.0.tgz'
  'react-dom-19.3.0 (1).tgz'                 = 'types-react-dom-19.3.0.tgz'
  'swc-win32-x64-msvc-16.4.0.tgz'            = 'next-swc-win32-x64-msvc-16.4.0.tgz'
}
foreach ($k in $copyMap.Keys) {
  $src = Join-Path $vendor $k; $dst = Join-Path $vendor $copyMap[$k]
  if ((Test-Path $src) -and -not (Test-Path $dst)) { Copy-Item $src $dst }
}
# Copiar también los ya planos (react, react-dom, etc. ya tienen nombre correcto)

function Get-FlatName([string]$name, [string]$ver) {
  return ($name -replace '^@', '' -replace '/', '-') + '-' + $ver + '.tgz'
}

# ---------- semver mínimo ----------
function ParseVer([string]$v) {
  $core = ($v -replace '-.+$', '')
  $p = $core.Split('.')
  return [pscustomobject]@{ Maj = [int]$p[0]; Min = $(if ($p.Count -gt 1) { [int]$p[1] } else { 0 }); Pat = $(if ($p.Count -gt 2) { [int]$p[2] } else { 0 }) }
}
function CompareVer($a, $b) {
  if ($a.Maj -ne $b.Maj) { return $a.Maj - $b.Maj }
  if ($a.Min -ne $b.Min) { return $a.Min - $b.Min }
  return $a.Pat - $b.Pat
}
function Test-Comparator([string]$ver, [string]$tok) {
  if ($tok -match '^(?<op><=|>=|<|>|\^|~|=)?(?<v>.+)$') {
    $op = $Matches['op']; if (-not $op) { $op = '=' }
    $tv = $Matches['v'].Trim()
    $hasPre = $ver -match '-'
    if ($tv -eq '' -or $tv -match '[x*]') {
      $parts = ($tv -replace '[~^=]', '') -split '\.'
      $maj = $null; $min = $null
      if ($parts.Count -ge 1 -and $parts[0] -notin @('x', '*', '')) { $maj = [int]$parts[0] }
      if ($parts.Count -ge 2 -and $parts[1] -notin @('x', '*', '')) { $min = [int]$parts[1] }
      $v = ParseVer $ver
      if ($null -eq $maj) { return $true }
      if ($v.Maj -ne $maj) { return $false }
      if ($null -ne $min -and $v.Min -ne $min) { return $false }
      return $true
    }
    if ($hasPre -and $tv -notmatch '-') { return $false }
    $v = ParseVer $ver; $t = ParseVer $tv
    switch ($op) {
      '=' { return ((CompareVer $v $t) -eq 0) }
      '^' {
        if ($t.Maj -gt 0) { $next = [pscustomobject]@{ Maj = $t.Maj + 1; Min = 0; Pat = 0 } }
        elseif ($t.Min -gt 0) { $next = [pscustomobject]@{ Maj = 0; Min = $t.Min + 1; Pat = 0 } }
        else { $next = [pscustomobject]@{ Maj = 0; Min = 0; Pat = $t.Pat + 1 } }
        return ((CompareVer $v $t) -ge 0 -and (CompareVer $v $next) -lt 0)
      }
      '~' {
        $next = [pscustomobject]@{ Maj = $t.Maj; Min = $t.Min + 1; Pat = 0 }
        return ((CompareVer $v $t) -ge 0 -and (CompareVer $v $next) -lt 0)
      }
      '>=' { return ((CompareVer $v $t) -ge 0) }
      '<=' { return ((CompareVer $v $t) -le 0) }
      '>' { return ((CompareVer $v $t) -gt 0) }
      '<' { return ((CompareVer $v $t) -lt 0) }
    }
  }
  return $false
}
function Test-Range([string]$ver, [string]$range) {
  if ($null -eq $range) { return $true }
  $range = $range.Trim()
  if ($range -eq '' -or $range -eq '*') { return $true }
  if ($range -match '^(workspace|catalog|npm:|git\+|https?:|file:)') { return $false }
  foreach ($alt in ($range -split '\|\|')) {
    $a = $alt.Trim()
    if ($a -eq '') { return $true }
    if ($a -match '^(.+?)\s+-\s+(.+)$') {
      $lo = ParseVer ($Matches[1].Trim() -replace '[~^><=]', ''); $hi = ParseVer ($Matches[2].Trim() -replace '[~^><=]', '')
      $v = ParseVer $ver
      if ((CompareVer $v $lo) -ge 0 -and (CompareVer $v $hi) -le 0) { return $true }
      continue
    }
    $ok = $true
    foreach ($tok in ($a -split '\s+')) { if ($tok -ne '' -and -not (Test-Comparator $ver $tok)) { $ok = $false; break } }
    if ($ok) { return $true }
  }
  return $false
}

# ---------- packuments ----------
$packumentCache = @{}
function Get-Packument([string]$name) {
  if ($packumentCache.ContainsKey($name)) { return $packumentCache[$name] }
  $url = 'https://registry.npmjs.org/' + ($name -replace '/', '%2f')
  for ($i = 1; $i -le 4; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $url -Headers @{ Accept = 'application/vnd.npm.install-v1+json' } -TimeoutSec 45
      $j = $r.Content | ConvertFrom-Json
      $packumentCache[$name] = $j
      return $j
    }
    catch {
      Log ("  packument retry {0}/4 {1}: {2}" -f $i, $name, $_.Exception.Message)
      Start-Sleep -Seconds 2
    }
  }
  throw "NO PACKUMENT: $name"
}
function Test-PkgPlatform($pkg) {
  if ($pkg.os -and @($pkg.os) -notcontains 'win32') { return $false }
  if ($pkg.cpu -and @($pkg.cpu) -notcontains 'x64') { return $false }
  return $true
}
function Resolve-Version([string]$name, [string]$spec) {
  $pm = Get-Packument $name
  $versions = $pm.versions.PSObject.Properties | ForEach-Object { $_.Value } | Where-Object {
    (Test-PkgPlatform $_) -and (Test-Range $_.version $spec)
  }
  $best = $null
  foreach ($v in $versions) {
    if ($null -eq $best) { $best = $v; continue }
    $c = CompareVer (ParseVer $v.version) (ParseVer $best.version)
    if ($c -gt 0) { $best = $v }
    elseif ($c -eq 0 -and ($best.version -match '-') -and ($v.version -notmatch '-')) { $best = $v }
  }
  return $best
}

# ---------- BFS ----------
$roots = @(
  @{ n = 'next'; v = '16.4.0' }
  @{ n = 'react'; v = '19.3.0' }
  @{ n = 'react-dom'; v = '19.3.0' }
  @{ n = 'typescript'; v = '7.0.2' }
  @{ n = 'eslint'; v = '10.12.0' }
  @{ n = 'eslint-config-next'; v = '16.4.0' }
  @{ n = '@types/node'; v = '26.6.5' }
  @{ n = '@types/react'; v = '19.3.0' }
  @{ n = '@types/react-dom'; v = '19.3.0' }
  @{ n = '@next/swc-win32-x64-msvc'; v = '16.4.0' }
)
$skipAlways = @('sharp') # omitimos sharp (opcional, pesado); next funciona sin él en MVP
$queue = New-Object System.Collections.Queue
$resolved = @{}   # name -> version
$conflicts = @()
foreach ($r in $roots) { $resolved[$r.n] = $r.v; $queue.Enqueue(@($r.n, $r.v)) }
Log "inicio BFS raices=$($roots.Count)"

$downloaded = 0; $processed = 0
while ($queue.Count -gt 0) {
  $item = $queue.Dequeue()
  $name = $item[0]; $ver = $item[1]
  $processed++
  $flat = Get-FlatName $name $ver
  $file = Join-Path $vendor $flat
  if (-not (Test-Path $file)) {
    $pm = Get-Packument $name
    $vo = $pm.versions.PSObject.Properties | Where-Object { $_.Name -eq $ver } | Select-Object -First 1
    if (-not $vo) { Log "ERROR version $name@$ver no existe"; continue }
    $tb = $vo.Value.dist.tarball
    $ok = $false
    for ($i = 1; $i -le 4; $i++) {
      try {
        Invoke-WebRequest -UseBasicParsing -Uri $tb -OutFile $file -TimeoutSec 120
        $ok = $true; break
      }
      catch { Log ("  tarball retry {0}/4 {1}@{2}: {3}" -f $i, $name, $ver, $_.Exception.Message); Start-Sleep -Seconds 2 }
    }
    if (-not $ok) { Log "ERROR download $name@$ver"; continue }
    $downloaded++
    Log ("  + {0}" -f $flat)
  }
  $pjRaw = tar -xOf $file package/package.json
  if (-not $pjRaw) { Log "ERROR leer package.json de $flat"; continue }
  $pj = ($pjRaw | Out-String) | ConvertFrom-Json
  $depSpecs = @()
  if ($pj.dependencies) { foreach ($p in $pj.dependencies.PSObject.Properties) { $depSpecs += , @($p.Name, $p.Value, $false) } }
  if ($pj.optionalDependencies) { foreach ($p in $pj.optionalDependencies.PSObject.Properties) { $depSpecs += , @($p.Name, $p.Value, $true) } }
  foreach ($d in $depSpecs) {
    $dn = $d[0]; $spec = $d[1]; $isOpt = $d[2]
    if ($skipAlways -contains $dn) { Log "  omit $dn (skip list)"; continue }
    if ($isOpt -and $dn -like '@next/swc-*' -and $dn -ne '@next/swc-win32-x64-msvc') { continue }
    try { $vo = Resolve-Version $dn $spec } catch { Log "ERROR resolve $dn ($spec): $($_.Exception.Message)"; continue }
    if (-not $vo) { Log "ERROR sin version satisfactoria para $dn@$spec"; continue }
    if ($resolved.ContainsKey($dn)) {
      if ($resolved[$dn] -ne $vo.version) {
        $bothOk = (Test-Range $resolved[$dn] $spec) -and (Test-Range $vo.version ($spec))
        # ¿la versión ya resuelta satisface el nuevo spec?
        if (Test-Range $resolved[$dn] $spec) { Log ("  ok  {0}: ya resuelta {1} satisface {2}" -f $dn, $resolved[$dn], $spec); continue }
        $conflicts += "$($dn): $($resolved[$dn]) vs $($vo.version) (spec $spec en $name)"
        Log ("  CONFLICTO {0}: quedan {1}; {2} pide {3}" -f $dn, $resolved[$dn], $name, $spec)
        continue
      }
      continue
    }
    $resolved[$dn] = $vo.version
    $queue.Enqueue(@($dn, $vo.version))
  }
}
Log "fin processed=$processed downloaded=$downloaded resolved=$($resolved.Count) conflicts=$($conflicts.Count)"
foreach ($c in $conflicts) { Log "  !! $c" }
# listar tgz planos
$flatFiles = Get-ChildItem $vendor -Filter '*.tgz' | Where-Object { $_.Name -notmatch ' \(1\)|^node-26|^swc-win32' }
Log ("tgz listos para install: {0}" -f ($flatFiles.Name -join '; '))
Set-Content -LiteralPath $doneMarker -Value 'ok'
