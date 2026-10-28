"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { pullCouponShot, startCouponLink } from "@/catalog/coupon-bridge";

export function CouponScan({
  busy,
  onShot,
}: {
  busy: boolean;
  onShot: (shot: { qr: string; photo: string }) => void;
}) {
  const [token, setToken] = useState("");
  const [svg, setSvg] = useState("");

  useEffect(() => {
    if (!token) return;
    let stop = false;
    const timer = setInterval(() => {
      void pullCouponShot(token).then((shot) => {
        if (stop || !shot) return;
        stop = true;
        clearInterval(timer);
        setToken("");
        setSvg("");
        onShot(shot);
      });
    }, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [token, onShot]);

  async function open() {
    const next = await startCouponLink();
    const url = `${window.location.origin}/cupom/${next}`;
    const markup = await QRCode.toString(url, { type: "svg", margin: 1, width: 220 });
    setSvg(markup.replace(/<\?xml[^>]*>/, ""));
    setToken(next);
  }

  if (!token) {
    return (
      <button className="btn teal" type="button" disabled={busy} onClick={() => void open()}>
        Ler no celular
      </button>
    );
  }

  return (
    <div className="coupon-pair">
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="desk-hint">Escaneie no celular. Depois aponte para o QR da NFC-e — o link .gov.br chega aqui (a foto é só apoio).</p>
      <button className="btn quiet" type="button" onClick={() => { setToken(""); setSvg(""); }}>
        Fechar
      </button>
    </div>
  );
}
