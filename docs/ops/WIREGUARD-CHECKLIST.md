# Checklist guiada (um teste por vez)

Repo no PC: `C:\Users\anjo_\OneDrive\Projetos-FabriaIA\beautyos`

**Ordem:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8  
Se falhar, **pare** e diga: `Teste N falhou` + cole a saída.

---

## TESTE 1 — Túnel WireGuard ativo

No app **WireGuard**: túnel `casa-server` = **Active**.

Ou PowerShell:

```powershell
Get-Service "WireGuardTunnel`$casa-server"
```

| Esperado | `Status : Running` |
|----------|--------------------|
| Status   | **PASS** (já estava Running) |

---

## TESTE 2 — Porta 51820 escutando

```powershell
Get-NetUDPEndpoint -LocalPort 51820 | Format-Table LocalAddress, LocalPort
```

| Esperado | linhas com porta `51820` |
|----------|--------------------------|
| Status   | **PASS** |

---

## TESTE 3 — Firewall Windows (precisa Admin)

Abra **PowerShell como Administrador** e rode:

```powershell
New-NetFirewallRule -DisplayName "WireGuard BeautyOS 51820" -Direction Inbound -Protocol UDP -LocalPort 51820 -Action Allow -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName "WireGuard BeautyOS 51820" | Format-Table DisplayName, Enabled, Action
```

| Esperado | `Enabled = True`, `Action = Allow` |
|----------|-------------------------------------|
| Status   | **VOCÊ FAZ AGORA** (sem Admin dá “Acesso negado”) |

Quando passar, responda: `Teste 3 ok`

---

## TESTE 4 — Proxy no PC consulta SEFAZ (Playwright)

A SEFAZ bloqueia `fetch` Node mesmo no seu IP. O proxy usa **Chromium**.

**Terminal A** (deixe aberto):

```powershell
cd C:\Users\anjo_\OneDrive\Projetos-FabriaIA\beautyos
$env:HOST="127.0.0.1"
$env:PORT="8787"
$env:TOKEN=""
node tools/nfce-proxy/server.mjs
```

Tem que aparecer: `nfce-proxy (playwright) em http://127.0.0.1:8787/lookup`

**Terminal B:**

```powershell
curl.exe -s http://127.0.0.1:8787/health
```

Esperado: `{"ok":true,...,"engine":"playwright"}`

Depois (mesmo Terminal B):

```powershell
[System.IO.File]::WriteAllText("$env:TEMP\nfce-req.json", '{"qr":"https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35240845543915098211650170000016801096369037|2|1|4|8994FCD60797644364394702B897B1839F040D3F"}')
curl.exe -s -X POST http://127.0.0.1:8787/lookup -H "Content-Type: application/json" --data-binary "@$env:TEMP\nfce-req.json" -o "$env:TEMP\nfce.html" -w "http=%{http_code} size=%{size_download}`n"
Select-String -Path "$env:TEMP\nfce.html" -Pattern "Request Rejected|HIPER|Qtde" | Select-Object -First 5
```

| Esperado | `http=200`, `size` ~20k, aparece `HIPER` ou `Qtde` (não Request Rejected) |
|----------|-----------------------------------------------------------------------------|
| Status   | **PASS** (validado neste PC com Playwright) |

Se o Terminal A não estiver rodando, o curl falha com conexão recusada.

---

## TESTE 5 — Roteador (UDP 51820 → seu PC)

1. IP local do PC (não use `10.66.66.1`):

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" } | Where-Object { $_.IPAddress -notlike "10.66.*" } | Format-Table InterfaceAlias, IPAddress
```

2. No roteador → Port Forward: **UDP 51820** → esse IP local, porta **51820**.

3. IP público:

```powershell
curl.exe -s https://api.ipify.org
```

Abra `tools\wireguard\keys\hetzner-beautyos.conf` e confira a linha `Endpoint = SEU_IP:51820`. Tem que ser o mesmo IP do `ipify`.

| Esperado | regra salva + Endpoint = ipify |
|----------|--------------------------------|
| Status   | **VOCÊ FAZ** → responda `Teste 5 ok` |

---

## TESTE 6 — Proxy na rede do túnel (`10.66.66.1`)

1. Ctrl+C no Terminal A (para o proxy do teste 4).  
2. Túnel WireGuard **Active**.  
3. Suba de novo:

```powershell
cd C:\Users\anjo_\OneDrive\Projetos-FabriaIA\beautyos
$env:HOST="10.66.66.1"
$env:PORT="8787"
$env:TOKEN="beleza-nfce-2026"
node tools/nfce-proxy/server.mjs
```

```powershell
curl.exe -s http://10.66.66.1:8787/health
```

| Esperado | health com `ok` |
|----------|-----------------|
| Status   | **depois do Teste 5** |

---

## TESTE 7 — Hetzner pinga o PC

SSH no **host** EasyPanel (não no container):

```bash
apt update && apt install -y wireguard
nano /etc/wireguard/wg0.conf
# cole o conteúdo de tools/wireguard/keys/hetzner-beautyos.conf
chmod 600 /etc/wireguard/wg0.conf
wg-quick up wg0
ping -c 3 10.66.66.1
curl -s http://10.66.66.1:8787/health
```

| Esperado | ping ok + health ok |
|----------|---------------------|
| Status   | **só depois do 6** |

---

## TESTE 8 — Env no BeautyOS

EasyPanel → app → env:

```env
NFCE_LOOKUP_URL=http://10.66.66.1:8787/lookup
NFCE_LOOKUP_TOKEN=beleza-nfce-2026
```

Redeploy. Teste “Ler no celular” com cupom real.

| Esperado | nota com **itens** |
|----------|-------------------|
| Status   | último |

---

## Onde você está agora

- Teste 1 PASS  
- Teste 2 PASS  
- Teste 4 PASS (proxy Playwright no PC)  
- **Próximo: Teste 3 (firewall Admin) → depois Teste 5 (roteador)**
