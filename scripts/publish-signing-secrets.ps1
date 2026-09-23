[CmdletBinding()]
param(
  [string]$Repository = "DarilDivin/Listik"
)

# Ce script nécessite GitHub CLI (gh) déjà connecté. Il n’affiche jamais la
# clé privée ni le mot de passe : ils sont transmis directement à GitHub sous
# forme de secrets chiffrés, consommés seulement par le workflow de release.
if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) est requis. Installez-le, puis exécutez 'gh auth login' avant de relancer ce script."
}

$releaseDirectory = Join-Path $env:LOCALAPPDATA "Listik\release"
$keyPath = Join-Path $releaseDirectory "listik-updater.key"
$encryptedPasswordPath = Join-Path $releaseDirectory "listik-updater.password.dpapi"

if (!(Test-Path -LiteralPath $keyPath) -or !(Test-Path -LiteralPath $encryptedPasswordPath)) {
  throw "Clé de signature introuvable dans $releaseDirectory."
}

$securePassword = Get-Content -LiteralPath $encryptedPasswordPath -Raw | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  Get-Content -LiteralPath $keyPath -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo $Repository
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo $Repository
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

Write-Host "Les secrets de signature ont été ajoutés à $Repository."
Write-Host "Activez ensuite GitHub Pages avec la source 'GitHub Actions' dans Settings > Pages."
