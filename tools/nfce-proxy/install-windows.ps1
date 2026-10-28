# Instala o proxy NFC-e para subir sozinho no login (sem janela de terminal).
# Rode UMA vez no PowerShell (pode ser sem Admin):
#   powershell -ExecutionPolicy Bypass -File tools\nfce-proxy\install-windows.ps1

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cmd = Join-Path $PSScriptRoot "start-proxy.cmd"
$task = "BeautyOS-NFCe-Proxy"

if (-not (Test-Path $cmd)) { throw "Faltou start-proxy.cmd" }

# Garante Chromium do Playwright
Push-Location $repo
try {
  npx playwright install chromium | Out-Null
} finally {
  Pop-Location
}

cmd /c "schtasks /Delete /TN $task /F >nul 2>&1"
$create = cmd /c "schtasks /Create /TN $task /SC ONLOGON /RL LIMITED /TR `"\`"$cmd\`"`" /F"
if ($LASTEXITCODE -ne 0) { throw "schtasks create falhou: $create" }

# Tailscale Funnel = URL HTTPS fixa na sua conta (sem cloudflared, sem porta no roteador)
tailscale funnel reset 2>$null | Out-Null
tailscale serve reset 2>$null | Out-Null
tailscale funnel --bg 8787

Write-Host ""
Write-Host "OK. Proxy vai subir no login via tarefa: $task"
Write-Host "Subindo agora tambem..."
Start-Process -FilePath $cmd -WindowStyle Hidden

Start-Sleep 2
tailscale funnel status
Write-Host ""
Write-Host "Deixe o Tailscale conectado. Pode fechar terminais do cloudflared/node."
Write-Host "Copie a URL HTTPS do funnel status e use em NFCE_LOOKUP_URL=URL/lookup"
