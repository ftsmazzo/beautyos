"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

function readCode(source: CanvasImageSource, width: number, height: number, inversion: "dontInvert" | "attemptBoth") {
  const regions = [
    [0, 0, width, height],
    [0, Math.round(height * 0.4), width, Math.round(height * 0.6)],
  ];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  for (const [sx, sy, sw, sh] of regions) {
    const longest = Math.max(sw, sh);
    const scale = longest > 1400 ? 1400 / longest : 1;
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(image.data, image.width, image.height, { inversionAttempts: inversion });
    if (found?.data) return found.data;
  }
  return "";
}

export function CouponScan({ busy, onCode }: { busy: boolean; onCode: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!live) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let last = 0;
    let stopped = false;
    const tick = (now: number) => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && now - last > 280) {
        last = now;
        const code = readCode(video, video.videoWidth, video.videoHeight, "dontInvert");
        if (code) {
          stopped = true;
          setLive(false);
          onCode(code);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
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
        if (stopped) return;
        setBlocked(true);
        setLive(false);
      });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [live, onCode]);

  async function onFile(file: File) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = () => reject(new Error("foto"));
        next.src = url;
      });
      onCode(readCode(image, image.naturalWidth, image.naturalHeight, "attemptBoth"));
    } catch {
      onCode("");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="coupon-scan">
      <button className="btn teal" type="button" disabled={busy} onClick={() => setLive((current) => !current)}>
        {live ? "Fechar câmera" : "Câmera do cupom"}
      </button>
      <label>
        Foto do cupom
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </label>
      {live ? <video ref={videoRef} className="coupon-cam" playsInline muted autoPlay /> : null}
      {blocked ? <p className="desk-alert">A câmera não abriu. Use a foto do cupom.</p> : null}
    </div>
  );
}
