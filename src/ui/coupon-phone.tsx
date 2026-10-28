"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { couponHost, couponUrl } from "@/catalog/coupon-qr";
import { sendCouponPhoto } from "@/catalog/coupon-bridge";

type Detector = { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> };

function grabFrame(video: HTMLVideoElement, maxSide = 1600) {
  const canvas = document.createElement("canvas");
  const longest = Math.max(video.videoWidth, video.videoHeight);
  const scale = longest > maxSide ? maxSide / longest : 1;
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, width: canvas.width, height: canvas.height };
}

function jsFromRegion(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  zoom = 1,
) {
  const w = Math.max(1, Math.round(sw * zoom));
  const h = Math.max(1, Math.round(sh * zoom));
  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  const cropCtx = crop.getContext("2d", { willReadFrequently: true });
  if (!cropCtx) return "";
  cropCtx.imageSmoothingEnabled = false;
  cropCtx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, w, h);
  const image = cropCtx.getImageData(0, 0, w, h);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? "";
}

function acceptQr(value: string) {
  const text = value.trim();
  return couponUrl(text) ? text : "";
}

async function readQr(video: HTMLVideoElement, detector: Detector | null) {
  if (detector) {
    try {
      const codes = await detector.detect(video);
      for (const item of codes) {
        const ok = acceptQr(item.rawValue ?? "");
        if (ok) return ok;
      }
    } catch {
      /* cai no jsQR */
    }
  }
  const frame = grabFrame(video);
  if (!frame) return "";
  const { ctx, width, height } = frame;
  const full = acceptQr(jsFromRegion(ctx, 0, 0, width, height, 1));
  if (full) return full;
  const cw = Math.round(width * 0.55);
  const ch = Math.round(height * 0.55);
  const cx = Math.round((width - cw) / 2);
  const cy = Math.round((height - ch) / 2);
  const center = acceptQr(jsFromRegion(ctx, cx, cy, cw, ch, 2.2));
  if (center) return center;
  const pads = [
    [0, 0],
    [width - cw, 0],
    [0, height - ch],
    [width - cw, height - ch],
  ] as const;
  for (const [x, y] of pads) {
    const hit = acceptQr(jsFromRegion(ctx, x, y, cw, ch, 2));
    if (hit) return hit;
  }
  return "";
}

export function CouponPhone({ token }: { token: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sent = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState("Aponte para o QR da NFC-e. O celular envia o link .gov.br ao balcão.");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let last = 0;
    let stopped = false;
    let detector: Detector | null = null;
    const DetectorCtor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }).BarcodeDetector;
    if (DetectorCtor) {
      try {
        detector = new DetectorCtor({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }

    const tick = (now: number) => {
      if (stopped || sent.current) return;
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && now - last > 220) {
        last = now;
        void readQr(video, detector).then((qr) => {
          if (stopped || sent.current || !qr) return;
          sent.current = true;
          stopped = true;
          const host = couponHost(qr);
          setHint(host ? `QR lido (${host}). Enviando o link…` : "QR lido. Enviando o link…");
          void deliver(qr);
        });
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then(async (next) => {
        stream = next;
        if (stopped) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = next;
        await video.play();
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!stopped) setBlocked(true);
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [token]);

  async function deliver(qr: string) {
    const video = videoRef.current;
    const stream = video?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    const result = await sendCouponPhoto(token, "", qr, "", "");
    if (!result.ok) {
      sent.current = false;
      setFailed(true);
      setHint("O link não chegou ao balcão. Gere outro código lá.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return <p className="ok banner">Link do QR no balcão. Pode fechar esta página.</p>;
  }

  return (
    <div className="coupon-phone">
      <video ref={videoRef} playsInline muted autoPlay />
      <p className="desk-hint">{hint}</p>
      {blocked ? <p className="error">A câmera do celular não abriu. Libere o acesso e recarregue.</p> : null}
      {failed ? <p className="error">O envio falhou. Gere outro código no balcão.</p> : null}
    </div>
  );
}
