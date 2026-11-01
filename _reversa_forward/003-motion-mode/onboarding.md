# Onboarding — 003 motion-mode (first test)

0. Update the app (close and reopen). Connect the car lights and, if wanted, the iPixel. Upload something to two slots first (Panel tab).
1. Open **Motion**. Tap **Presets → Brake light**; targets: all lights. Tap **Presets → Brightness by speed**; target: the strip.
2. **Parked test**: Debug → **Simulate drive**. Expect: strip brightness rises with the simulated speed, then a red flash ×3, then the looks come back. Download the log.
3. In the car, phone fixed in the holder, screen facing you. Tap **Start**, allow location. Keep still 2 s and tap **Calibrate**.
4. Drive slowly: speed and G gauges move; G long goes positive when accelerating. If it goes negative, drive straight and accelerate once — the forward axis is learned.
5. Brake firmly once (safe place): lights flash red. Corner: G lat moves.
6. Tap **Dark screen**: screen goes black; brake again — flash still fires. Double tap to leave.
7. Lock the phone: output pauses; unlock — it resumes.
8. **Places**: at home tap **Save this place** (radius 100 m), add rule "enter Home → scene X". Leave > 120 m and come back: scene applies once.
9. Tap **Stop**: every light returns to its look before Start.
10. Debug → **Download log** and send it (positions are not in it).

Plug the phone in: GPS + screen drain the battery.
