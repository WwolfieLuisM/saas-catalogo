param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Spec = '*'
)
. (Join-Path $PSScriptRoot 'deps-lib.ps1')
Add-NpmPackage -Name $Name -Spec $Spec
