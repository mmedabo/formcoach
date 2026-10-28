"""
Beach Volleyball Live Overlay — step 1
======================================
Inputs : a live camera (USB index or phone stream URL) or a video file,
         from a fixed camera angle.
Output : a live window with
         (1) a ring on the sand under each player's feet
         (2) a name tag above each player
         (3) a court-map inset with every player's position
         Optional: record the overlay to an .mp4 with --out.

Reuses the court calibration from bv_tracker_v1 (click the 4 corners on
the first frame). Players are tracked with pretrained YOLO + ByteTrack.

Run:
    python bv_live.py 0                                # webcam 0
    python bv_live.py http://<phone-ip>:8080/video     # phone stream
    python bv_live.py clip.mp4 --names Ana,Bo,Cy,Dee --out overlay.mp4

Press q to quit.
"""

import argparse
import time

import cv2
import numpy as np
from ultralytics import YOLO

from bv_tracker_v1 import COURT_W, COURT_H, PERSON_CLS, calibrate_court, to_court

RING_RADIUS = 0.6      # metres, drawn on the court plane
SMOOTH = 0.5           # EMA weight of the newest position (1 = no smoothing)
MAP_SCALE = 20         # court-map pixels per metre
MAP_PAD = 16           # court-map margin in pixels
PALETTE = [(255, 200, 0), (90, 220, 90), (0, 170, 255), (230, 120, 230),
           (255, 255, 255), (0, 90, 255)]                       # BGR


# ----------------------------------------------------------------------
# 1. DRAWING
# ----------------------------------------------------------------------
def ring_pixels(H_inv, cx, cy, r=RING_RADIUS, n=48):
    """A circle of radius r on the court, projected into the image.
       It gets the same perspective as the court lines."""
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    circle = np.stack([cx + r * np.cos(a), cy + r * np.sin(a)], axis=1)
    pts = cv2.perspectiveTransform(np.float32(circle)[None], H_inv)[0]
    return pts.astype(np.int32)


def draw_rings(frame, players, H_inv):
    """Soft glow pass first, then a sharp ring on top."""
    glow = frame.copy()
    for p in players:
        cv2.polylines(glow, [ring_pixels(H_inv, *p["pos"])], True, p["color"], 10,
                      cv2.LINE_AA)
    cv2.addWeighted(glow, 0.35, frame, 0.65, 0, dst=frame)
    for p in players:
        cv2.polylines(frame, [ring_pixels(H_inv, *p["pos"])], True, p["color"], 2,
                      cv2.LINE_AA)
        cv2.polylines(frame, [ring_pixels(H_inv, *p["pos"], r=RING_RADIUS * 0.6)],
                      True, p["color"], 1, cv2.LINE_AA)


def draw_tag(frame, p):
    """Dark label with the player name and a colour bar, above the head."""
    x1, y1, x2, _ = p["box"]
    font, scale, thick = cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1
    (tw, th), _ = cv2.getTextSize(p["name"], font, scale, thick)
    w, h = tw + 16, th + 14
    x = int((x1 + x2) / 2 - w / 2)
    y = max(int(y1) - h - 10, 0)
    roi = frame[y:y + h, max(x, 0):x + w]
    roi[:] = (roi * 0.35).astype(np.uint8)                      # dim background
    cv2.putText(frame, p["name"], (x + 8, y + th + 5), font, scale,
                (255, 255, 255), thick, cv2.LINE_AA)
    cv2.rectangle(frame, (x, y + h - 3), (x + w, y + h), p["color"], -1)
    cx = int((x1 + x2) / 2)                                     # pointer
    cv2.fillPoly(frame, [np.int32([[cx - 5, y + h], [cx + 5, y + h],
                                   [cx, y + h + 6]])], p["color"])


def draw_court_map(frame, players):
    """Top-down court in the bottom-right corner. Net = dashed centre line.
       The near sideline is at the bottom, as in the camera view."""
    mw = int(COURT_W * MAP_SCALE) + 2 * MAP_PAD
    mh = int(COURT_H * MAP_SCALE) + 2 * MAP_PAD
    fh, fw = frame.shape[:2]
    x0, y0 = fw - mw - 12, fh - mh - 12
    if x0 < 0 or y0 < 0:
        return                                                  # frame too small
    roi = frame[y0:y0 + mh, x0:x0 + mw]
    roi[:] = (roi * 0.3 + np.array([40, 20, 10]) * 0.7).astype(np.uint8)

    def m(cx, cy):
        return (x0 + MAP_PAD + int(cx * MAP_SCALE),
                y0 + MAP_PAD + int((COURT_H - cy) * MAP_SCALE))

    cv2.rectangle(frame, m(0, COURT_H), m(COURT_W, 0), (200, 200, 200), 1)
    nx, ny = m(COURT_W / 2, COURT_H)
    for y in range(0, int(COURT_H * MAP_SCALE), 8):             # dashed net
        cv2.line(frame, (nx, ny + y), (nx, ny + y + 4), (255, 255, 255), 1)
    for p in players:
        cx = min(max(p["pos"][0], 0), COURT_W)
        cy = min(max(p["pos"][1], 0), COURT_H)
        cv2.circle(frame, m(cx, cy), 6, p["color"], -1, cv2.LINE_AA)
        cv2.circle(frame, m(cx, cy), 6, (255, 255, 255), 1, cv2.LINE_AA)


def render(frame, players, H_inv):
    """Draw the full overlay for one frame. players: list of dicts with
       name, color, box (x1, y1, x2, y2) and pos (court metres)."""
    draw_rings(frame, players, H_inv)
    for p in players:
        draw_tag(frame, p)
    draw_court_map(frame, players)
    return frame


# ----------------------------------------------------------------------
# 2. LIVE LOOP
# ----------------------------------------------------------------------
def run(source, model_path="yolo11n.pt", names=(), out_path=None):
    cap = cv2.VideoCapture(source)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)         # live: drop stale frames
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError(f"Could not read from source: {source}")
    H = calibrate_court(frame.copy())
    H_inv = np.linalg.inv(H)

    model = YOLO(model_path)
    writer = None
    if out_path:
        fh, fw = frame.shape[:2]
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps,
                                 (fw, fh))

    tracks = {}                 # track_id -> {"slot": int, "pos": (x, y)}
    t_prev = time.time()
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        res = model.track(frame, persist=True, tracker="bytetrack.yaml",
                          classes=[PERSON_CLS], verbose=False)[0]

        visible = []
        if res.boxes is not None and res.boxes.id is not None:
            for box, tid in zip(res.boxes.xyxy.tolist(), res.boxes.id.int().tolist()):
                x1, y1, x2, y2 = box
                cx, cy = to_court(H, (x1 + x2) / 2, y2)         # feet
                if not (-1 < cx < COURT_W + 1 and -1 < cy < COURT_H + 1):
                    continue                                    # off court
                # Names go to track IDs in first-seen order.
                t = tracks.setdefault(tid, {"slot": len(tracks), "pos": (cx, cy)})
                px, py = t["pos"]
                t["pos"] = (px + SMOOTH * (cx - px), py + SMOOTH * (cy - py))
                slot = t["slot"]
                visible.append({
                    "name": names[slot] if slot < len(names) else f"P{slot + 1}",
                    "color": PALETTE[slot % len(PALETTE)],
                    "box": box,
                    "pos": t["pos"],
                })

        render(frame, visible, H_inv)
        now = time.time()
        cv2.putText(frame, f"{1 / max(now - t_prev, 1e-6):.0f} fps", (12, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        t_prev = now

        if writer:
            writer.write(frame)
        cv2.imshow("Beach volleyball live", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()


# ----------------------------------------------------------------------
if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Beach volleyball live overlay")
    ap.add_argument("source", nargs="?", default="0",
                    help="camera index, stream URL, or video file")
    ap.add_argument("--model", default="yolo11n.pt", help="YOLO weights")
    ap.add_argument("--names", default="",
                    help="comma-separated names, given in first-seen order")
    ap.add_argument("--out", default=None, help="also record to this .mp4")
    args = ap.parse_args()

    src = int(args.source) if args.source.isdigit() else args.source
    names = [n.strip() for n in args.names.split(",") if n.strip()]
    run(src, args.model, names, args.out)
