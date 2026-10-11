# Librería para descarga uno-a-uno de tarballs. Dot-source en vendor-add.ps1
$ErrorActionPreference = 'Stop'
$VendorDir = 'D:\Desarrollo\Saas Catalogo\frontend\vendor'
$StateFile = 'D:\Desarrollo\Saas Catalogo\frontend\tools\state.json'

function Get-FlatName([string]$name, [string]$ver) {
  return ($name -replace '^@', '' -replace '/', '-') + '-' + $ver + '.tgz'
}
function Get-TarballPackageJson([string]$file) {
  $first = (tar -tf $file | Select-Object -First 1)
  if (-not $first) { return $null }
  $root = ($first -split '/')[0]
  $raw = tar -xOf $file "$root/package.json" 2>$null
  if (-not $raw) { return $null }
  return (($raw | Out-String) | ConvertFrom-Json)
}
function Read-State {
  if (Test-Path $StateFile) { return (Get-Content $StateFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { @{ $_.Name = $_.Value } } | ForEach-Object -Begin { $h = @{} } -Process { $h += $_ } -End { $h } }
  return @{}
}
function Write-State($state) {
  $sorted = [ordered]@{}
  foreach ($k in ($state.Keys | Sort-Object)) { $sorted[$k] = $state[$k] }
  $sorted | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
}
function ParseVer([string]$v) {
  $hasPre = $false; $pre = ''
  if ($v -match '-') { $hasPre = $true; $pre = ($v -replace '^[^-]+-', ''); $v = ($v -replace '-.+$', '') }
  $p = $v.Split('.')
  return [pscustomobject]@{ Maj = [int]$p[0]; Min = $(if ($p.Count -gt 1) { [int]$p[1] } else { 0 }); Pat = $(if ($p.Count -gt 2) { [int]$p[2] } else { 0 }); HasPre = $hasPre; Pre = $pre }
}
function CompareVer($a, $b) {
  if ($a.Maj -ne $b.Maj) { return $a.Maj - $b.Maj }
  if ($a.Min -ne $b.Min) { return $a.Min - $b.Min }
  if ($a.Pat -ne $b.Pat) { return $a.Pat - $b.Pat }
  if (-not $a.HasPre -and -not $b.HasPre) { return 0 }
  if (-not $a.HasPre) { return 1 }
  if (-not $b.HasPre) { return -1 }
  $ia = $a.Pre -split '\.'; $ib = $b.Pre -split '\.'
  $max = [Math]::Max($ia.Count, $ib.Count)
  for ($i = 0; $i -lt $max; $i++) {
    $xa = if ($i -lt $ia.Count) { $ia[$i] } else { $null }
    $xb = if ($i -lt $ib.Count) { $ib[$i] } else { $null }
    if ($null -eq $xa) { return -1 }
    if ($null -eq $xb) { return 1 }
    $na = 0; $nb = 0
    $aNum = [int]::TryParse($xa, [ref]$na); $bNum = [int]::TryParse($xb, [ref]$nb)
    if ($aNum -and $bNum) { if ($na -ne $nb) { return ($na - $nb) } }
    elseif ($aNum) { return -1 }
    elseif ($bNum) { return 1 }
    else { $c = [string]::CompareOrdinal($xa, $xb); if ($c -ne 0) { return $c } }
  }
  return 0
}
function Test-Comparator([string]$ver, [string]$tok) {
  if ($tok -match '^(?<op><=|>=|<|>|\^|~|=)?(?<v>.+)$') {
    $op = $Matches['op']; if (-not $op) { $op = '=' }
    $tv = $Matches['v'].Trim()
    $hasPre = $ver -match '-'
    if ($tv -eq '' -or ($tv -split '\.' | Where-Object { $_ -in @('x', '*') })) {
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
$script:PackumentCache = @{}
function Get-Packument([string]$name) {
  if ($script:PackumentCache.ContainsKey($name)) { return $script:PackumentCache[$name] }
  $url = 'https://registry.npmjs.org/' + ($name -replace '/', '%2f')
  for ($i = 1; $i -le 5; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $url -Headers @{ Accept = 'application/vnd.npm.install-v1+json' } -TimeoutSec 40
      $content = $r.Content
      if ($content -is [byte[]]) { $content = [System.Text.Encoding]::UTF8.GetString($content) }
      $j = $content | ConvertFrom-Json
      $script:PackumentCache[$name] = $j
      return $j
    }
    catch {
      if ($i -eq 5) { throw "packument fallo $name : $($_.Exception.Message)" }
      Start-Sleep -Seconds 2
    }
  }
}
function Test-PkgPlatform($pkg) {
  if ($pkg.os -and @($pkg.os) -notcontains 'win32') { return $false }
  if ($pkg.cpu -and @($pkg.cpu) -notcontains 'x64') { return $false }
  return $true
}
function Resolve-Version([string]$name, [string]$spec) {
  if ($spec -eq 'latest' -or [string]::IsNullOrEmpty($spec)) { $spec = '*' }
  $pm = Get-Packument $name
  $best = $null
  foreach ($prop in $pm.versions.PSObject.Properties) {
    $vo = $prop.Value
    if (-not (Test-PkgPlatform $vo)) { continue }
    if (-not (Test-Range $vo.version $spec)) { continue }
    if ($null -eq $best) { $best = $vo; continue }
    $c = CompareVer (ParseVer $vo.version) (ParseVer $best.version)
    if ($c -gt 0) { $best = $vo }
    elseif ($c -eq 0 -and ($best.version -match '-') -and ($vo.version -notmatch '-')) { $best = $vo }
  }
  return $best
}
function Add-NpmPackage([string]$Name, [string]$Spec = '*') {
  $state = Read-State
  # Atajo: si el spec es una versión exacta y el tarball ya está en disco, sin red.
  if ($Spec -match '^\d+\.\d+\.\d+$') {
    $exactFlat = Get-FlatName $Name $Spec
    $exactFile = Join-Path $VendorDir $exactFlat
    if (Test-Path $exactFile) {
      $pjE = Get-TarballPackageJson $exactFile
      if ($pjE -and $pjE.name -eq $Name) {
        if (-not $state.ContainsKey($Name)) { $state[$Name] = $Spec; Write-State $state }
        Write-Output ("SKIP {0}@{1}" -f $Name, $Spec)
        Write-Deps $pjE
        return
      }
    }
  }
  if ($state.ContainsKey($Name) -and (Test-Range $state[$Name] $Spec)) {
    $ver = $state[$Name]
    $flat = Get-FlatName $Name $ver
    if (Test-Path (Join-Path $VendorDir $flat)) {
      $pj = Get-TarballPackageJson (Join-Path $VendorDir $flat)
      Write-Output ("SKIP {0}@{1}" -f $Name, $ver)
      Write-Deps $pj
      return
    }
  }
  $vo = Resolve-Version $Name $Spec
  if (-not $vo) { Write-Output ("ERROR {0} sin version para {1}" -f $Name, $Spec); return }
  $ver = $vo.version
  $flat = Get-FlatName $Name $ver
  $file = Join-Path $VendorDir $flat
  if (-not (Test-Path $file)) {
    $tb = $vo.dist.tarball
    $ok = $false
    for ($i = 1; $i -le 4; $i++) {
      try {
        Write-Output ("DESCARGANDO {0}@{1} ..." -f $Name, $ver)
        Invoke-WebRequest -UseBasicParsing -Uri $tb -OutFile $file -TimeoutSec 180
        $ok = $true; break
      }
      catch {
        if ($i -eq 4) { Write-Output ("ERROR download {0}@{1}: {2}" -f $Name, $ver, $_.Exception.Message); return }
        Start-Sleep -Seconds 2
      }
    }
  }
  $mb = [math]::Round((Get-Item $file).Length / 1MB, 2)
  Write-Output ("OK {0}@{1}  {2} MB" -f $Name, $ver, $mb)
  $state[$Name] = $ver
  Write-State $state
  $pj = Get-TarballPackageJson $file
  Write-Deps $pj
}
function Write-Deps($pj) {
  $skip = @('sharp')
  $parts = @()
  if ($pj.dependencies) {
    foreach ($p in $pj.dependencies.PSObject.Properties) {
      if ($skip -contains $p.Name) { continue }
      $parts += ('{0}@{1}' -f $p.Name, $p.Value)
    }
  }
  if ($pj.optionalDependencies) {
    foreach ($p in $pj.optionalDependencies.PSObject.Properties) {
      if ($skip -contains $p.Name) { continue }
      if ($p.Name -like '@next/swc-*' -and $p.Name -ne '@next/swc-win32-x64-msvc') { continue }
      $parts += ('{0}@{1} (opt)' -f $p.Name, $p.Value)
    }
  }
  if ($parts.Count -gt 0) { Write-Output ("  deps: " + ($parts -join ' ; ')) }
}
