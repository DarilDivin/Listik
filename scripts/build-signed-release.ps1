[CmdletBinding()]
param()

# Construit les installateurs localement sans entrer la clé dans Git ni dans
# un fichier .env. Le mot de passe est chiffré avec DPAPI pour le compte
# Windows qui a créé la clé.
$releaseDirectory = Join-Path $env:LOCALAPPDATA "Listik\release"
$keyPath = Join-Path $releaseDirectory "listik-updater.key"
$encryptedPasswordPath = Join-Path $releaseDirectory "listik-updater.password.dpapi"

if (!(Test-Path -LiteralPath $keyPath) -or !(Test-Path -LiteralPath $encryptedPasswordPath)) {
  throw "Clé de signature introuvable. Créez-la d’abord avec la commande Tauri signer generate."
}

$securePassword = Get-Content -LiteralPath $encryptedPasswordPath -Raw | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  # Le serveur de développement peut rester ouvert : ses caches et artefacts
  # sont isolés de ceux de la construction de release.
  $env:NEXT_DIST_DIR = ".next-release"
  $env:CARGO_TARGET_DIR = Join-Path (Get-Location) "src-tauri\target-release"
  pnpm tauri build
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
}
