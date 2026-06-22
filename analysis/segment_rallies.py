"""
Rally segmentation for the beach volleyball tracker.

Splits the ball-point stream into separate rallies. The logic hinges on
one distinction:
    - small gaps  (a few frames) = detector missed a fast/blurred ball
                                    MID-rally  -> keep in same rally
    - large gaps  (> gap_seconds) = ball dead BETWEEN rallies
                                    -> start a new rally

Expects ball points as (frame_idx, px, py). bv_tracker_v1.process()
already stores them in this form:
    ball_pixels.append((frame_idx, cx, cy))
"""

import cv2
import numpy as np


def segment_rallies(ball_points, fps, gap_seconds=1.5, min_points=4):
    """Returns a list of rallies; each rally is a list of (frame, x, y).
       Rallies shorter than `min_points` are dropped as false positives."""
    if not ball_points:
        return []

    pts = sorted(ball_points, key=lambda p: p[0])   # sort by frame index
    gap_frames = fps * gap_seconds

    rallies, current = [], [pts[0]]
    for prev, cur in zip(pts, pts[1:]):
        if cur[0] - prev[0] > gap_frames:           # big gap -> new rally
            rallies.append(current)
            current = [cur]
        else:
            current.append(cur)
    rallies.append(current)

    return [r for r in rallies if len(r) >= min_points]


def draw_rallies(video_path, rallies, out="rallies.png"):
    """Draw every rally on the first frame, each in a distinct colour."""
    cap = cv2.VideoCapture(video_path)
    ok, frame = cap.read()
    cap.release()
    if not ok or not rallies:
        print("Nothing to draw.")
        return

    # distinct BGR colours, cycled if there are many rallies
    palette = [(0, 255, 255), (255, 0, 255), (0, 255, 0),
               (255, 128, 0), (0, 0, 255), (255, 255, 0)]

    for i, rally in enumerate(rallies):
        color = palette[i % len(palette)]
        xy = [(int(x), int(y)) for (_, x, y) in rally]
        for a, b in zip(xy, xy[1:]):
            cv2.line(frame, a, b, color, 2)
        for p in xy:
            cv2.circle(frame, p, 3, color, -1)
        # label the rally at its first point
        cv2.putText(frame, f"R{i + 1}", xy[0],
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    cv2.imwrite(out, frame)
    print(f"Saved {out} — {len(rallies)} rallies")
