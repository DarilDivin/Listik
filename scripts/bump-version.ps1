[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidatePattern('^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$')]
  [string]$Version
)

# Les trois fichiers sont la source de version pour l’interface npm, le
# package Rust et le paquet Tauri. Les garder alignés rend les releases
# reproductibles et permet au workflow de refuser un tag incohérent.
$packagePath = Join-Path (Get-Location) "package.json"
$tauriConfigPath = Join-Path (Get-Location) "src-tauri\tauri.conf.json"
$cargoPath = Join-Path (Get-Location) "src-tauri\Cargo.toml"

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$package.version = $Version
$package | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $packagePath

$tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
$tauriConfig.version = $Version
$tauriConfig | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $tauriConfigPath

$cargo = Get-Content -LiteralPath $cargoPath -Raw
$cargo = [regex]::Replace($cargo, '(?m)^version = "[^"]+"', "version = `"$Version`"", 1)
Set-Content -LiteralPath $cargoPath -Value $cargo -NoNewline

Write-Host "Version $Version appliquée. Vérifiez les changements, puis créez le tag v$Version."
