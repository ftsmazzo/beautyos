# Gera chaves e confs WireGuard: PC casa (server) + Hetzner BeautyOS (client).
# Uso: .\generate-keys.ps1
#      .\generate-keys.ps1 -IpFixo 200.x.x.x
# Nao commite a pasta keys/.

param(
  [string]$IpFixo = ""
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$wg = "C:\Program Files\WireGuard\wg.exe"
if (-not (Test-Path $wg)) { throw "WireGuard nao encontrado em $wg. Instale e rode de novo." }

$keys = Join-Path $here "keys"
New-Item -ItemType Directory -Force -Path $keys | Out-Null

function New-WgKeyPair([string]$name) {
  $priv = (& $wg genkey).Trim()
  $pub = ($priv | & $wg pubkey).Trim()
  Set-Content -Path (Join-Path $keys "$name.priv") -Value $priv -NoNewline
  Set-Content -Path (Join-Path $keys "$name.pub") -Value $pub -NoNewline
  [pscustomobject]@{ Name = $name; Private = $priv; Public = $pub }
}

if (-not $IpFixo) {
  try {
    $IpFixo = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10).Trim()
    Write-Host "IP publico detectado: $IpFixo"
  } catch {
    $IpFixo = "SEU_IP_FIXO"
    Write-Host "Nao deu para detectar o IP. Ajuste o Endpoint depois."
  }
}

$casa = New-WgKeyPair "casa"
$hz = New-WgKeyPair "hetzner-beautyos"

$server = @"
[Interface]
PrivateKey = $($casa.Private)
Address = 10.66.66.1/24
ListenPort = 51820

# Peer: BeautyOS na Hetzner
[Peer]
PublicKey = $($hz.Public)
AllowedIPs = 10.66.66.2/32
"@

$client = @"
[Interface]
PrivateKey = $($hz.Private)
Address = 10.66.66.2/24

[Peer]
PublicKey = $($casa.Public)
Endpoint = ${IpFixo}:51820
AllowedIPs = 10.66.66.1/32
PersistentKeepalive = 25
"@

Set-Content -Path (Join-Path $keys "casa-server.conf") -Value $server
Set-Content -Path (Join-Path $keys "hetzner-beautyos.conf") -Value $client

Write-Host ""
Write-Host "OK. Arquivos em $keys"
Write-Host "1) Importe casa-server.conf no WireGuard do Windows e Ative."
Write-Host "2) No roteador: UDP 51820 -> este PC."
Write-Host "3) Na Hetzner: use hetzner-beautyos.conf como /etc/wireguard/wg0.conf"
Write-Host "4) Proxy: HOST=10.66.66.1 PORT=8787 node tools/nfce-proxy/server.mjs"
Write-Host "5) EasyPanel: NFCE_LOOKUP_URL=http://10.66.66.1:8787/lookup"
