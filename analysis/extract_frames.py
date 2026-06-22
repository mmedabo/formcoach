"""
Frame extractor for ball-detection labeling.
Pulls evenly-spaced frames from one or more clips so you get varied
conditions (sky / sand / blur / near / far) without dumping every frame.

Usage:
    python extract_frames.py clip1.mp4 clip2.mp4 --every 15 --out frames/

Then upload the `frames/` folder to Roboflow and label the 'ball' class,
export a YOLO dataset, fine-tune, and point bv_tracker_v1.py --model at
the resulting weights for reliable ball detection.
"""

import cv2
import os
import argparse


def extract(video_path, out_dir, every_n):
    cap = cv2.VideoCapture(video_path)
    base = os.path.splitext(os.path.basename(video_path))[0]
    saved, idx = 0, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % every_n == 0:
            fname = os.path.join(out_dir, f"{base}_{idx:05d}.jpg")
            cv2.imwrite(fname, frame)
            saved += 1
        idx += 1
    cap.release()
    print(f"{video_path}: saved {saved} frames")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="+", help="one or more clip paths")
    ap.add_argument("--every", type=int, default=15,
                    help="save 1 of every N frames (default 15)")
    ap.add_argument("--out", default="frames", help="output folder")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    for v in args.videos:
        extract(v, args.out, args.every)
    print(f"\nDone. Upload '{args.out}/' to Roboflow and label class 'ball'.")
