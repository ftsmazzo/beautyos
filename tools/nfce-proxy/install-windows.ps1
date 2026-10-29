# Instala o proxy NFC-e para subir sozinho no login (sem janela de terminal).
# Rode UMA vez no PowerShell (pode ser sem Admin):
#   powershell -ExecutionPolicy Bypass -File tools\nfce-proxy\install-windows.ps1

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cmd = Join-Path $PSScriptRoot "start-proxy.cmd"
$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$lnkPath = Join-Path $startup "BeautyOS-NFCe-Proxy.lnk"

if (-not (Test-Path $cmd)) { throw "Faltou start-proxy.cmd" }

# Garante Chromium do Playwright
Push-Location $repo
try {
  npx playwright install chromium | Out-Null
} finally {
  Pop-Location
}

# Atalho no Startup (não precisa Admin; schtasks costuma negar Access denied)
New-Item -ItemType Directory -Force -Path $startup | Out-Null
$w = New-Object -ComObject WScript.Shell
$lnk = $w.CreateShortcut($lnkPath)
$lnk.TargetPath = $cmd
$lnk.WorkingDirectory = $repo
$lnk.WindowStyle = 7
$lnk.Description = "BeautyOS NFC-e proxy (Playwright)"
$lnk.Save()

# Tailscale Funnel = URL HTTPS fixa (sem cloudflared, sem porta no roteador)
tailscale funnel reset 2>$null | Out-Null
tailscale serve reset 2>$null | Out-Null
tailscale funnel --bg 8787

# Mata proxy antigo na 8787 e sobe o atual
Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
Start-Process -FilePath $cmd -WindowStyle Hidden
Start-Sleep 2

Write-Host ""
Write-Host "OK. Atalho Startup: $lnkPath"
tailscale funnel status
Write-Host ""
Write-Host "Deixe o Tailscale conectado. Pode fechar terminais do cloudflared/node."
Write-Host "No EasyPanel: NFCE_LOOKUP_URL=<url-https-do-funnel>/lookup"
Write-Host "              NFCE_LOOKUP_TOKEN=igual ao TOKEN de start-proxy.cmd"
