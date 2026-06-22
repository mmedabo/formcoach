"""
Beach Volleyball Tracker — v1 (offline game analysis)
=====================================================
Inputs : one tripod-shot phone clip (fixed camera angle).
Outputs: (1) a player-position heatmap on a 2D court  -> heatmap.png
         (2) a ball-arc overlay                        -> ball_arc.png
         (3) per-rally trajectory overlay              -> rallies.png

This is the OFFLINE companion to the in-browser Form Coach. The web app
grades your own technique live (MediaPipe pose); this script analyses
recorded game footage with YOLO + ByteTrack for court-level insights.

What works with ZERO training:
    - player detection + tracking (pretrained YOLO 'person' class + ByteTrack)
    - homography court mapping
    - heatmap + rally rendering
What needs work (clearly marked TODO):
    - reliable ball detection -> fine-tune YOLO on labeled ball frames
      (use extract_frames.py to build the dataset)

Install:
    pip install -r requirements.txt

Run:
    python bv_tracker_v1.py clip.mp4
"""

import argparse
import cv2
import numpy as np
import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter
from ultralytics import YOLO

from segment_rallies import segment_rallies, draw_rallies

# ---- Beach court dimensions (metres). Origin = one corner. ----
COURT_W, COURT_H = 16.0, 8.0          # length x width
PERSON_CLS, BALL_CLS = 0, 32           # COCO class ids


# ----------------------------------------------------------------------
# 1. COURT CALIBRATION  (click the 4 court corners, once)
# ----------------------------------------------------------------------
def calibrate_court(first_frame):
    """Click the 4 court corners in this order:
       near-left, near-right, far-right, far-left.
       Returns the homography pixel -> court-metres."""
    pts = []

    def on_click(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(pts) < 4:
            pts.append((x, y))
            cv2.circle(first_frame, (x, y), 6, (0, 255, 0), -1)
            cv2.imshow("Click 4 corners", first_frame)

    cv2.imshow("Click 4 corners", first_frame)
    cv2.setMouseCallback("Click 4 corners", on_click)
    while len(pts) < 4:
        cv2.waitKey(20)
    cv2.destroyAllWindows()

    src = np.float32(pts)
    dst = np.float32([[0, 0], [COURT_W, 0], [COURT_W, COURT_H], [0, COURT_H]])
    H, _ = cv2.findHomography(src, dst)
    return H


def to_court(H, x, y):
    """Project a pixel point into court-metre coordinates."""
    p = np.float32([[[x, y]]])
    out = cv2.perspectiveTransform(p, H)[0][0]
    return float(out[0]), float(out[1])


# ----------------------------------------------------------------------
# 2. MAIN PASS  — track players + collect ball points
# ----------------------------------------------------------------------
def process(video_path, model_path="yolo11n.pt"):
    cap = cv2.VideoCapture(video_path)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError("Could not read video.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    H = calibrate_court(frame.copy())
    cap.release()

    model = YOLO(model_path)
    player_positions = {}      # track_id -> list of (court_x, court_y)
    ball_pixels = []           # list of (frame_idx, px, py) per detected frame

    # Ultralytics handles ByteTrack internally with persist=True.
    # `stream=True` yields one result per frame, in order, so we can
    # number frames for rally segmentation.
    for frame_idx, res in enumerate(model.track(source=video_path, persist=True,
                                                 tracker="bytetrack.yaml",
                                                 stream=True, verbose=False)):
        if res.boxes is None:
            continue
        for box in res.boxes:
            cls = int(box.cls[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            if cls == PERSON_CLS and box.id is not None:
                tid = int(box.id[0])
                foot_x, foot_y = (x1 + x2) / 2, y2      # bottom-centre = feet
                cx, cy = to_court(H, foot_x, foot_y)
                # keep only points that land on the court
                if -1 < cx < COURT_W + 1 and -1 < cy < COURT_H + 1:
                    player_positions.setdefault(tid, []).append((cx, cy))

            elif cls == BALL_CLS:
                # TODO: replace pretrained 'sports ball' with a YOLO model
                # fine-tuned on your own labeled volleyball frames. The
                # generic class misses the ball against bright sky.
                # frame_idx is stored so segment_rallies() can split rallies.
                ball_pixels.append((frame_idx, (x1 + x2) / 2, (y1 + y2) / 2))

    return player_positions, ball_pixels, H, fps


# ----------------------------------------------------------------------
# 3. RENDER  — heatmap + ball arc
# ----------------------------------------------------------------------
def draw_heatmap(player_positions, out="heatmap.png", bins=80):
    all_pts = [p for pts in player_positions.values() for p in pts]
    if not all_pts:
        print("No player points collected.")
        return
    xs, ys = zip(*all_pts)
    hist, _, _ = np.histogram2d(xs, ys, bins=bins,
                                range=[[0, COURT_W], [0, COURT_H]])
    hist = gaussian_filter(hist, sigma=2)

    plt.figure(figsize=(10, 5))
    plt.imshow(hist.T, origin="lower", extent=[0, COURT_W, 0, COURT_H],
               cmap="inferno", aspect="equal")
    plt.plot([0, COURT_W, COURT_W, 0, 0], [0, 0, COURT_H, COURT_H, 0], "w-")
    plt.axvline(COURT_W / 2, color="w", ls="--")     # net line
    plt.title("Player position heatmap")
    plt.colorbar(label="time spent")
    plt.savefig(out, dpi=130, bbox_inches="tight")
    print(f"Saved {out}")


def draw_ball_arc(video_path, ball_pixels, out="ball_arc.png"):
    cap = cv2.VideoCapture(video_path)
    ok, frame = cap.read()
    cap.release()
    if not ok or not ball_pixels:
        print("No ball points to draw.")
        return
    # ball_pixels are (frame_idx, px, py); drop the frame index for drawing
    pts = np.array([(px, py) for (_, px, py) in ball_pixels], dtype=np.int32)
    for i in range(1, len(pts)):
        cv2.line(frame, tuple(pts[i - 1]), tuple(pts[i]), (0, 255, 255), 2)
    for p in pts:
        cv2.circle(frame, tuple(p), 4, (0, 0, 255), -1)
    cv2.imwrite(out, frame)
    print(f"Saved {out}")


# ----------------------------------------------------------------------
if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Beach volleyball offline tracker")
    ap.add_argument("video", nargs="?", default="clip.mp4", help="phone clip path")
    ap.add_argument("--model", default="yolo11n.pt", help="YOLO weights")
    ap.add_argument("--gap", type=float, default=1.5,
                    help="seconds of dead ball that starts a new rally")
    args = ap.parse_args()

    players, balls, H, fps = process(args.video, args.model)

    draw_heatmap(players)
    draw_ball_arc(args.video, balls)

    rallies = segment_rallies(balls, fps, gap_seconds=args.gap)
    draw_rallies(args.video, rallies)
    print(f"Detected {len(rallies)} rallies across {len(balls)} ball points.")
