import { useCallback, useEffect, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { PenLine, Eraser } from "lucide-react";

const HEIGHT = 150;

export function SignatureField({
  onChange,
  onCapture,
  error,
}: {
  onChange: (hasSignature: boolean) => void;
  /** Receives the signature as a PNG data URL (or null when cleared). */
  onCapture?: (dataUrl: string | null) => void;
  error?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<SignatureCanvas | null>(null);
  const widthRef = useRef(0);

  // Keep the latest callback in a ref so the resize effect stays stable and
  // never re-runs (which would wipe an existing signature).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const captureRef = useRef(onCapture);
  captureRef.current = onCapture;

  const report = useCallback(() => {
    const pad = padRef.current;
    const has = Boolean(pad && !pad.isEmpty());
    onChangeRef.current(has);
    captureRef.current?.(has && pad ? pad.toDataURL("image/png") : null);
  }, []);

  // Keep the canvas bitmap in sync with its rendered size so strokes land
  // exactly under the finger on any screen width.
  useEffect(() => {
    const resize = () => {
      const wrap = wrapRef.current;
      const pad = padRef.current;
      const canvas = pad?.getCanvas();
      if (!wrap || !pad || !canvas) return;
      const width = wrap.clientWidth;
      if (!width || width === widthRef.current) return;
      widthRef.current = width;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = width * ratio;
      canvas.height = HEIGHT * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${HEIGHT}px`;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      onChangeRef.current(false);
      captureRef.current?.(null);
    };

    resize();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="block text-sm font-semibold text-foreground">חתימה דיגיטלית</span>
        <button
          type="button"
          onClick={() => {
            padRef.current?.clear();
            onChangeRef.current(false);
            captureRef.current?.(null);
          }}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-blue-100"
        >
          <Eraser className="size-3.5" />
          נקה חתימה
        </button>
      </div>

      <div
        ref={wrapRef}
        onPointerUp={report}
        onMouseUp={report}
        onTouchEnd={report}
        className={`relative w-full overflow-hidden rounded-md border-2 border-dashed bg-slate-50 ${
          error ? "border-danger" : "border-blue-300"
        }`}
        style={{ height: HEIGHT }}
      >
        <SignatureCanvas
          ref={(instance) => {
            padRef.current = instance;
          }}
          penColor="#0b1140"
          canvasProps={{ className: "absolute inset-0 touch-none" }}
          onEnd={report}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <PenLine className="size-3.5" />
          אנא חתמו כאן (ציור על המסך)
        </span>
      </div>

      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}

export default SignatureField;
