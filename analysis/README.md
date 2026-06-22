# Offline game analysis (Python)

The in-browser **Form Coach** (`/#coach` in the site) grades *your own*
technique live with MediaPipe pose. This folder is its offline companion:
it analyses **recorded tripod-shot game footage** with YOLO + ByteTrack to
produce court-level visuals.

| | Form Coach (web) | This tool (Python) |
|---|---|---|
| Runs | Browser, real-time | Local machine, offline batch |
| Model | MediaPipe Pose (1 person) | YOLO + ByteTrack (many people + ball) |
| Input | Live webcam | A recorded `.mp4` clip |
| Output | Live form feedback | Heatmap, ball arc, rally overlays |

## Setup

```bash
cd analysis
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python bv_tracker_v1.py clip.mp4
```

1. The first frame opens — **click the 4 court corners** in order:
   near-left, near-right, far-right, far-left (sets up the homography).
2. The clip is processed end to end. You get three images:
   - `heatmap.png` — where players spent time on a 2D court
   - `ball_arc.png` — the detected ball path drawn on the first frame
   - `rallies.png` — ball points split into separate rallies, colour-coded

Options: `--model <weights.pt>` to use fine-tuned ball weights,
`--gap <seconds>` to tune how long a dead ball ends a rally.

## Reliable ball detection (the one real gap)

The pretrained COCO `sports ball` class misses the ball against bright sky,
so the ball arc is rough out of the box. To fix it:

```bash
# 1. pull varied frames from your clips
python extract_frames.py clip1.mp4 clip2.mp4 --every 15 --out frames/
# 2. upload frames/ to Roboflow, label the 'ball' class, export a YOLO set
# 3. fine-tune YOLO on that dataset, then:
python bv_tracker_v1.py clip.mp4 --model path/to/ball_weights.pt
```

## Files

- `bv_tracker_v1.py` — main pass: calibrate → track players + ball → render
  heatmap, ball arc, and (via `segment_rallies`) per-rally overlays.
- `segment_rallies.py` — splits the ball-point stream into rallies by gap size.
- `extract_frames.py` — samples frames for building a ball-detection dataset.
