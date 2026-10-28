# WireGuard: Hetzner → PC casa (IP fixo BR)

Objetivo: a VPS na Hetzner continua servindo o site. Só a **consulta SEFAZ/NFC-e** sai pelo IP fixo do PC.

```
[Celular QR] → [BeautyOS na Hetzner] → túnel WG → [PC casa + nfce-proxy] → SEFAZ
                      ↑
              usuários acessam o site aqui (não passa pela casa)
```

## 1. No PC (Windows) — servidor WireGuard

1. Instale o [WireGuard](https://www.wireguard.com/install/).
2. Gere chaves e confs (PowerShell **Admin** na pasta do repo):

```powershell
cd tools/wireguard
.\generate-keys.ps1
```

3. Importe `casa-server.conf` no app WireGuard → **Ativar**.
4. No roteador: encaminhar **UDP 51820** → IP local do PC (reserva DHCP ajuda).
5. Suba o proxy NFC-e (só escuta na rede do túnel):

```powershell
cd tools\nfce-proxy
$env:HOST="10.66.66.1"
$env:PORT="8787"
$env:TOKEN="troque-por-um-segredo"
node server.mjs
```

Deixe o PC ligado (ou agende iniciar com o Windows).

## 2. Na VPS Hetzner (host EasyPanel — não dentro do container Next)

O WireGuard sobe no **host** Linux da Hetzner. O app Docker chama o proxy pelo IP do túnel.

1. No host: `apt update && apt install -y wireguard`
2. Copie `keys/hetzner-beautyos.conf` → `/etc/wireguard/wg0.conf` (`chmod 600`).
3. Confirme `Endpoint = SEU_IP_FIXO:51820`.
4. `wg-quick up wg0` e `systemctl enable wg-quick@wg0`.
5. Teste no host: `ping -c2 10.66.66.1` e `curl -s http://10.66.66.1:8787/health`.
6. Para o **container** alcançar `10.66.66.1`, no host (uma vez):

```bash
# encaminha a porta do host para o proxy via WG (ajuste se já usar 8787)
iptables -t nat -A PREROUTING -p tcp --dport 8787 -j DNAT --to-destination 10.66.66.1:8787
iptables -t nat -A POSTROUTING -d 10.66.66.1 -p tcp --dport 8787 -j MASQUERADE
# ou, mais simples no EasyPanel: NFCE_LOOKUP_URL=http://172.17.0.1:8787/lookup
# com socat no host: socat TCP-LISTEN:8787,fork,reuseaddr TCP:10.66.66.1:8787
```

Caminho mais simples no EasyPanel: no host rode  
`socat TCP-LISTEN:8787,bind=172.17.0.1,fork,reuseaddr TCP:10.66.66.1:8787`  
e no app:

```env
NFCE_LOOKUP_URL=http://172.17.0.1:8787/lookup
NFCE_LOOKUP_TOKEN=troque-por-um-segredo
```

7. Redeploy do app.

## 3. Outras Hetzner (opcional)

Gere mais peers em `generate-keys.ps1` (`.3`, `.4`…) e repita o conf de cliente. Só quem precisar de IP BR entra no túnel.

## Segurança

- Não use `0.0.0.0/0` no cliente Hetzner (isso mandaria **todo** o tráfego da VPS pela casa).
- O proxy escuta só em `10.66.66.1` (rede WG), não na LAN/internet.
- Troque o `TOKEN`. Porta 51820 só UDP WireGuard no roteador.

## Se o ping WG falhar

- IP fixo certo no `Endpoint`?
- UDP 51820 liberado no roteador/firewall do Windows?
- Túnel **Ativo** no app WireGuard do PC?
